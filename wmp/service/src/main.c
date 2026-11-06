#include <bundle.h>
#include <dlog.h>
#include <message_port.h>
#include <service_app.h>
#include <stdbool.h>
#include <stdio.h>
#include <string.h>

#include "mlengine.h"
#include "wmp_esplus_abi.h"

#define LOG_TAG "MoonlightWmp"
#define WMP_CONTROL_PORT "MoonlightWmpControl"
#define WMP_PROTOCOL "moonlight-wmp/1"
#define MOONLIGHT_WEB_APP_ID "MoonLightS.MoonlightWasm"

static wmp_esplus_api_t g_esplus;
static wmp_esplus_probe_result_e g_esplus_probe_result = WMP_ESPLUS_PROBE_LIBRARY_MISSING;
static int g_control_port_id = -1;
static bool g_service_ready;

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
    char response_payload[384];
    int engine_running;

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
                      "error", "{\\"error\\":\\"unsupported_protocol\\"}");
        return;
    }

    if (request_id == NULL || request_id[0] == '\0' ||
        command == NULL || command[0] == '\0') {
        send_response(remote_app_id, remote_port, request_id,
                      "error", "{\\"error\\":\\"invalid_request\\"}");
        return;
    }

    /* MessagePort is a control channel, not a media-packet transport. */
    if (payload != NULL && strlen(payload) > 2048) {
        send_response(remote_app_id, remote_port, request_id,
                      "error", "{\\"error\\":\\"payload_too_large\\"}");
        return;
    }

    if (strcmp(command, "ping") == 0) {
        snprintf(response_payload, sizeof(response_payload),
                 "{\\"pong\\":true,\\"service\\":\\"ready\\"}");
    } else if (strcmp(command, "get_status") == 0 ||
               strcmp(command, "probe_esplus") == 0) {
        engine_running = g_service_ready ? ml_engine_running() : 0;
        snprintf(response_payload, sizeof(response_payload),
                 "{\\"service\\":\\"%s\\",\\"engine\\":\\"%s\\","
                 "\\"running\\":%s,\\"esplus\\":\\"%s\\","
                 "\\"streamApi\\":\\"%s\\"}",
                 g_service_ready ? "ready" : "stopping",
                 g_service_ready ? "libmlengine" : "unavailable",
                 engine_running ? "true" : "false",
                 wmp_esplus_probe_result_name(g_esplus_probe_result),
                 wmp_esplus_family_name(g_esplus.selected_family));
    } else if (strcmp(command, "stop_session") == 0) {
        if (!g_service_ready) {
            send_response(remote_app_id, remote_port, request_id,
                          "error", "{\\"error\\":\\"service_not_ready\\"}");
            return;
        }
        /*
         * Session state and teardown remain owned by Moonlight Common C
         * through libmlengine. The ServiceApp only forwards the stop request.
         */
        ml_engine_stop();
        snprintf(response_payload, sizeof(response_payload),
                 "{\\"stopped\\":true,\\"running\\":%s}",
                 ml_engine_running() ? "true" : "false");
    } else {
        send_response(remote_app_id, remote_port, request_id,
                      "error", "{\\"error\\":\\"unsupported_command\\"}");
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

    /*
     * libmlengine is linked into the native ServiceApp executable. It has no
     * separate global initializer: its session state is initialized by the
     * engine's start entry point and is quiescent until a session is started.
     */
    g_service_ready = true;

    dlog_print(DLOG_INFO, LOG_TAG, "WMP native service started");
    dlog_print(DLOG_INFO, LOG_TAG, "WMP control port registered: %s",
               WMP_CONTROL_PORT);
    dlog_print(DLOG_INFO, LOG_TAG, "WMP engine linked: libmlengine");
    dlog_print(DLOG_INFO, LOG_TAG, "ESPlus probe state=%s family=%s",
               wmp_esplus_probe_result_name(g_esplus_probe_result),
               wmp_esplus_family_name(g_esplus.selected_family));
    dlog_print(DLOG_INFO, LOG_TAG, "%s", report);

    /*
     * Keep the control service available when ESPlus is absent/incomplete.
     * Engine selection remains independent; no EMSS fallback is performed.
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
    g_service_ready = false;

    if (g_control_port_id >= 0) {
        message_port_unregister_trusted_local_port(g_control_port_id);
        g_control_port_id = -1;
    }

    /*
     * Stop before releasing the service's ESPlus probe handle. LiStopConnection
     * tears down the engine-owned player, renderers and display overlay.
     */
    ml_engine_stop();
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
