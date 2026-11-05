#include <bundle.h>
#include <dlog.h>
#include <message_port.h>
#include <service_app.h>
#include <stdbool.h>
#include <stdio.h>
#include <string.h>

#include "wmp_esplus_abi.h"

#define LOG_TAG "MoonlightWmp"
#define WMP_CONTROL_PORT "MoonlightWmpControl"
#define WMP_PROTOCOL "moonlight-wmp/1"
#define MOONLIGHT_WEB_APP_ID "MoonLightS.MoonlightWasm"

static wmp_esplus_api_t g_esplus;
static wmp_esplus_probe_result_e g_esplus_probe_result = WMP_ESPLUS_PROBE_LIBRARY_MISSING;
static int g_control_port_id = -1;

static const char *esplus_family_name(void)
{
    switch (g_esplus.selected_family) {
    case WMP_ESPLUS_FAMILY_SET:
        return "set";
    case WMP_ESPLUS_FAMILY_ADD:
        return "add";
    default:
        return "none";
    }
}

static const char *esplus_status_name(void)
{
    return g_esplus_probe_result == WMP_ESPLUS_PROBE_OK
        ? "available"
        : "unavailable";
}

static void send_response(
    const char *remote_app_id,
    const char *remote_port,
    const char *request_id,
    const char *status,
    const char *payload)
{
    bundle *reply;
    int result;

    if (remote_app_id == NULL || remote_port == NULL || remote_port[0] == '\0') {
        dlog_print(DLOG_WARN, LOG_TAG, "WMP request has no reply MessagePort");
        return;
    }

    reply = bundle_create();
    if (reply == NULL) {
        dlog_print(DLOG_ERROR, LOG_TAG, "Could not allocate WMP reply bundle");
        return;
    }

    bundle_add_str(reply, "protocol", WMP_PROTOCOL);
    bundle_add_str(reply, "id", request_id != NULL ? request_id : "");
    bundle_add_str(reply, "type", "response");
    bundle_add_str(reply, "status", status != NULL ? status : "error");
    bundle_add_str(reply, "payload", payload != NULL ? payload : "{}");

    result = message_port_send_trusted_message(remote_app_id, remote_port, reply);
    bundle_free(reply);

    if (result != MESSAGE_PORT_ERROR_NONE) {
        dlog_print(DLOG_ERROR, LOG_TAG,
                   "WMP reply failed: message-port error=%d", result);
    }
}

static void message_port_received(
    int local_port_id,
    const char *remote_app_id,
    const char *remote_port,
    bool trusted_remote_port,
    bundle *message,
    void *user_data)
{
    char *protocol = NULL;
    char *request_id = NULL;
    char *command = NULL;
    char *payload = NULL;
    char response_payload[256];

    (void)local_port_id;
    (void)user_data;

    if (remote_app_id == NULL ||
        strcmp(remote_app_id, MOONLIGHT_WEB_APP_ID) != 0 ||
        !trusted_remote_port) {
        dlog_print(DLOG_WARN, LOG_TAG,
                   "Rejected untrusted or unexpected WMP MessagePort sender");
        return;
    }

    if (message == NULL) {
        dlog_print(DLOG_WARN, LOG_TAG, "Rejected empty WMP command bundle");
        return;
    }

    bundle_get_str(message, "protocol", &protocol);
    bundle_get_str(message, "id", &request_id);
    bundle_get_str(message, "command", &command);
    bundle_get_str(message, "payload", &payload);

    if (protocol == NULL || strcmp(protocol, WMP_PROTOCOL) != 0) {
        send_response(remote_app_id, remote_port, request_id,
                      "error", "{\"error\":\"unsupported_protocol\"}");
        return;
    }

    if (request_id == NULL || request_id[0] == '\0' ||
        command == NULL || command[0] == '\0') {
        send_response(remote_app_id, remote_port, request_id,
                      "error", "{\"error\":\"invalid_request\"}");
        return;
    }

    /* MessagePort is a control channel, not a media-packet transport. */
    if (payload != NULL && strlen(payload) > 2048) {
        send_response(remote_app_id, remote_port, request_id,
                      "error", "{\"error\":\"payload_too_large\"}");
        return;
    }

    if (strcmp(command, "ping") == 0) {
        snprintf(response_payload, sizeof(response_payload),
                 "{\"pong\":true,\"service\":\"ready\"}");
    } else if (strcmp(command, "get_status") == 0 ||
               strcmp(command, "probe_esplus") == 0) {
        snprintf(response_payload, sizeof(response_payload),
                 "{\"service\":\"ready\",\"esplus\":\"%s\",\"streamApi\":\"%s\"}",
                 esplus_status_name(), esplus_family_name());
    } else {
        send_response(remote_app_id, remote_port, request_id,
                      "error", "{\"error\":\"unsupported_command\"}");
        dlog_print(DLOG_WARN, LOG_TAG, "Unsupported WMP command: %s", command);
        return;
    }

    send_response(remote_app_id, remote_port, request_id,
                  "ok", response_payload);
}

static bool service_create(void *data)
{
    char report[2048];

    (void)data;
    memset(&g_esplus, 0, sizeof(g_esplus));
    memset(report, 0, sizeof(report));

    g_control_port_id = message_port_register_trusted_local_port(
        WMP_CONTROL_PORT, message_port_received, NULL);
    if (g_control_port_id < 0) {
        dlog_print(DLOG_ERROR, LOG_TAG,
                   "Could not register trusted WMP control port: %d",
                   g_control_port_id);
        return false;
    }

    g_esplus_probe_result = wmp_esplus_probe(
        &g_esplus, report, sizeof(report));

    dlog_print(DLOG_INFO, LOG_TAG, "WMP native service started");
    dlog_print(DLOG_INFO, LOG_TAG, "WMP control port registered: %s",
               WMP_CONTROL_PORT);
    dlog_print(DLOG_INFO, LOG_TAG, "ESPlus probe result=%d",
               (int)g_esplus_probe_result);
    dlog_print(DLOG_INFO, LOG_TAG, "%s", report);

    /*
     * The control service remains available even if ESPlus is absent or its
     * exports are incomplete. The UI receives that state without changing
     * the independently selected EMSS/WMP engine.
     */
    return true;
}

static void service_control(app_control_h app_control, void *data)
{
    (void)app_control;
    (void)data;
    dlog_print(DLOG_INFO, LOG_TAG, "WMP service control request received");
}

static void service_terminate(void *data)
{
    (void)data;

    if (g_control_port_id >= 0) {
        message_port_unregister_trusted_local_port(g_control_port_id);
        g_control_port_id = -1;
    }

    wmp_esplus_close(&g_esplus);
    dlog_print(DLOG_INFO, LOG_TAG, "WMP native service terminated");
}

int main(int argc, char *argv[])
{
    service_app_lifecycle_callback_s callbacks;

    memset(&callbacks, 0, sizeof(callbacks));
    callbacks.create = service_create;
    callbacks.terminate = service_terminate;
    callbacks.app_control = service_control;

    return service_app_main(argc, argv, &callbacks, NULL);
}
