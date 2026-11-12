#include "Limelight-internal.h"

#define STUN_RECV_TIMEOUT_SEC 3

#define STUN_MESSAGE_BINDING_REQUEST 0x0001
#define STUN_MESSAGE_BINDING_SUCCESS 0x0101
#define STUN_MESSAGE_COOKIE 0x2112a442

#define STUN_ATTRIBUTE_MAPPED_ADDRESS 0x0001
#define STUN_ATTRIBUTE_XOR_MAPPED_ADDRESS 0x0020

#pragma pack(push, 1)

typedef struct _STUN_ATTRIBUTE_HEADER {
    unsigned short type;
    unsigned short length;
} STUN_ATTRIBUTE_HEADER, *PSTUN_ATTRIBUTE_HEADER;

typedef struct _STUN_MAPPED_IPV4_ADDRESS_ATTRIBUTE {
    STUN_ATTRIBUTE_HEADER hdr;
    unsigned char reserved;
    unsigned char addressFamily;
    unsigned short port;
    unsigned int address;
} STUN_MAPPED_IPV4_ADDRESS_ATTRIBUTE, *PSTUN_MAPPED_IPV4_ADDRESS_ATTRIBUTE;

typedef struct _STUN_MESSAGE {
    unsigned short messageType;
    unsigned short messageLength;
    unsigned int magicCookie;
    unsigned char transactionId[12];
} STUN_MESSAGE, *PSTUN_MESSAGE;

#pragma pack(pop)

static bool isExpectedStunSource(const struct sockaddr_storage* remoteAddr, const struct addrinfo* stunAddrs)
{
    const struct addrinfo* current;

    if (remoteAddr == NULL || remoteAddr->ss_family != AF_INET) {
        return false;
    }

    for (current = stunAddrs; current != NULL; current = current->ai_next) {
        const struct sockaddr_in* expected;

        if (current->ai_family != AF_INET || current->ai_addr == NULL ||
                current->ai_addrlen < sizeof(struct sockaddr_in)) {
            continue;
        }

        expected = (const struct sockaddr_in*)current->ai_addr;
        if (expected->sin_port == ((const struct sockaddr_in*)remoteAddr)->sin_port &&
                memcmp(&expected->sin_addr,
                       &((const struct sockaddr_in*)remoteAddr)->sin_addr,
                       sizeof(expected->sin_addr)) == 0) {
            return true;
        }
    }

    return false;
}

static bool validateStunResponse(int bytesRead, const STUN_MESSAGE* request,
                                 const STUN_MESSAGE* response,
                                 const struct addrinfo* stunAddrs,
                                 const struct sockaddr_storage* remoteAddr)
{
    unsigned short stunBodyLen;

    if (bytesRead <= 0) {
        return false;
    }

    if (!isExpectedStunSource(remoteAddr, stunAddrs)) {
        Limelog("STUN message received from unexpected address\\n");
        return false;
    }

    if (bytesRead < (int)sizeof(*response)) {
        Limelog("STUN message truncated: %d\\n", bytesRead);
        return false;
    }

    stunBodyLen = htons(response->messageLength);
    if ((stunBodyLen & 0x3) != 0) {
        Limelog("STUN message length is not a multiple of 4\\n");
        return false;
    }
    if (bytesRead < (int)(sizeof(*response) + stunBodyLen)) {
        Limelog("STUN message truncated: expected %d bytes, got %d\\n",
                (int)sizeof(*response) + stunBodyLen, bytesRead);
        return false;
    }

    if (htonl(response->magicCookie) != STUN_MESSAGE_COOKIE) {
        Limelog("Bad STUN cookie value: %x\\n", htonl(response->magicCookie));
        return false;
    }
    if (memcmp(request->transactionId, response->transactionId, sizeof(request->transactionId)) != 0) {
        Limelog("STUN transaction ID mismatch\\n");
        return false;
    }
    if (htons(response->messageType) != STUN_MESSAGE_BINDING_SUCCESS) {
        Limelog("STUN message type mismatch: %x\\n", htons(response->messageType));
        return false;
    }

    return true;
}

// This is extremely rudamentary STUN code simply for deriving the WAN IPv4 address when behind a NAT.
int LiFindExternalAddressIP4(const char* stunServer, unsigned short stunPort, unsigned int* wanAddr)
{
    SOCKET sock;
    struct addrinfo* stunAddrs;
    struct addrinfo hints;
    char stunPortStr[6];
    int err;
    STUN_MESSAGE reqMsg;
    int i;
    int bytesRead;
    bool validResponse;
    struct sockaddr_storage remoteAddr;
    SOCKADDR_LEN remoteAddrLen;
    PSTUN_ATTRIBUTE_HEADER attribute;
    PSTUN_MAPPED_IPV4_ADDRESS_ATTRIBUTE ipv4Attrib;
    union {
        STUN_MESSAGE hdr;
        char buf[1024];
    } resp;

    sock = INVALID_SOCKET;
    stunAddrs = NULL;

    err = initializePlatformSockets();
    if (err != 0) {
        Limelog("Failed to initialize sockets: %d\\n", err);
        return err;
    }

    memset(&hints, 0, sizeof(hints));
    hints.ai_family = AF_INET;
    hints.ai_socktype = SOCK_DGRAM;
    hints.ai_protocol = IPPROTO_UDP;
    hints.ai_flags = AI_ADDRCONFIG;

    snprintf(stunPortStr, sizeof(stunPortStr), "%u", stunPort);
    err = getaddrinfo(stunServer, stunPortStr, &hints, &stunAddrs);
    if (err != 0 || stunAddrs == NULL) {
        Limelog("Failed to resolve STUN server: %d\\n", err);
        goto Exit;
    }

    sock = bindUdpSocket(hints.ai_family, NULL, 0, 0, SOCK_QOS_TYPE_BEST_EFFORT);
    if (sock == INVALID_SOCKET) {
        err = LastSocketFail();
        Limelog("Failed to connect to STUN server: %d\\n", err);
        goto Exit;
    }

    reqMsg.messageType = htons(STUN_MESSAGE_BINDING_REQUEST);
    reqMsg.messageLength = 0;
    reqMsg.magicCookie = htonl(STUN_MESSAGE_COOKIE);
    PltGenerateRandomData(reqMsg.transactionId, sizeof(reqMsg.transactionId));

    bytesRead = 0;
    validResponse = false;
    for (i = 0; i < STUN_RECV_TIMEOUT_SEC * 1000 / UDP_RECV_POLL_TIMEOUT_MS && !validResponse; i++) {
        // Retransmit the request every second until the timeout elapses or we get a valid response.
        if (i % (1000 / UDP_RECV_POLL_TIMEOUT_MS) == 0) {
            struct addrinfo* current;

            for (current = stunAddrs; current != NULL && !validResponse; current = current->ai_next) {
                err = (int)sendto(sock, (char*)&reqMsg, sizeof(reqMsg), 0,
                                  current->ai_addr, (SOCKADDR_LEN)current->ai_addrlen);
                if (err == SOCKET_ERROR) {
                    err = LastSocketFail();
                    Limelog("Failed to send STUN binding request: %d\\n", err);
                    continue;
                }

                remoteAddrLen = sizeof(remoteAddr);
                bytesRead = recvUdpSocket(sock, resp.buf, sizeof(resp.buf), true,
                                              &remoteAddr, &remoteAddrLen);
                validResponse = validateStunResponse(bytesRead, &reqMsg, &resp.hdr,
                                                      stunAddrs, &remoteAddr);
            }
        }
        else {
            remoteAddrLen = sizeof(remoteAddr);
            bytesRead = recvUdpSocket(sock, resp.buf, sizeof(resp.buf), true,
                                          &remoteAddr, &remoteAddrLen);
            validResponse = validateStunResponse(bytesRead, &reqMsg, &resp.hdr,
                                                  stunAddrs, &remoteAddr);
        }
    }

    if (bytesRead == SOCKET_ERROR) {
        err = LastSocketFail();
        Limelog("Failed to read STUN binding response: %d\\n", err);
        goto Exit;
    }
    else if (bytesRead == 0) {
        Limelog("No response from STUN server\\n");
        err = -2;
        goto Exit;
    }
    else if (!validResponse) {
        // Invalid responses are ignored until the timeout expires.
        err = -3;
        goto Exit;
    }

    // Only parse attributes within the body length declared by the validated STUN header.
    bytesRead = htons(resp.hdr.messageLength);
    attribute = (PSTUN_ATTRIBUTE_HEADER)(&resp.hdr + 1);
    while (bytesRead >= (int)sizeof(*attribute)) {
        int attrLen = htons(attribute->length);
        int attrPaddedLen = (attrLen + 3) & ~3;

        if (bytesRead < (int)sizeof(*attribute) + attrLen ||
                bytesRead < (int)sizeof(*attribute) + attrPaddedLen) {
            Limelog("STUN attribute out of bounds: %d\\n", attrLen);
            err = -5;
            goto Exit;
        }

        // Mask off the comprehension bit.
        if ((htons(attribute->type) & 0x7FFF) != STUN_ATTRIBUTE_XOR_MAPPED_ADDRESS) {
            bytesRead -= (int)sizeof(*attribute) + attrPaddedLen;
            attribute = (PSTUN_ATTRIBUTE_HEADER)(((char*)attribute) + sizeof(*attribute) + attrPaddedLen);
            continue;
        }

        ipv4Attrib = (PSTUN_MAPPED_IPV4_ADDRESS_ATTRIBUTE)attribute;
        if (attrLen != 8) {
            Limelog("STUN address length mismatch: %d\\n", attrLen);
            err = -5;
            goto Exit;
        }
        else if (ipv4Attrib->addressFamily != 1) {
            Limelog("STUN address family mismatch: %x\\n", ipv4Attrib->addressFamily);
            err = -5;
            goto Exit;
        }

        // The address is XORed with the cookie.
        *wanAddr = ipv4Attrib->address ^ resp.hdr.magicCookie;
        err = 0;
        goto Exit;
    }

    if (bytesRead != 0) {
        Limelog("STUN response ends with an incomplete attribute header\\n");
        err = -5;
    }
    else {
        Limelog("No XOR mapped address found in STUN response!\\n");
        err = -6;
    }

Exit:
    if (sock != INVALID_SOCKET) {
        closeSocket(sock);
    }

    if (stunAddrs != NULL) {
        freeaddrinfo(stunAddrs);
    }

    cleanupPlatformSockets();
    return err;
}
