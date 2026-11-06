#include <bundle.h>
#include <dlog.h>
#include <message_port.h>
#include <service_app.h>
#include <stdbool.h>
#include <errno.h>
#include <limits.h>
#include <pthread.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <time.h>

#include "mlengine.h"
#include "wmp_esplus_abi.h"

#define LOG_TAG "MoonlightWmp"
#define WMP_CONTROL_PORT "MoonlightWmpControl"
#define WMP_PROTOCOL "moonlight-wmp/1"
#define MOONLIGHT_WEB_APP_ID "MoonLightS.MoonlightWasm"

#define WMP_HOST_CAPACITY 256
#define WMP_VERSION_CAPACITY 96
#define WMP_RTSP_CAPACITY 1024
#define WMP_PORT_CAPACITY 128
#define WMP_REQUEST_CAPACITY 64

typedef struct {
    char host[WMP_HOST_CAPACITY];
    char rikey[33];
    char app_version[WMP_VERSION_CAPACITY];
    char gfe_version[WMP_VERSION_CAPACITY];
    char rtsp_url[WMP_RTSP_CAPACITY];
    char video_codec[16];
    char audio_config[32];
    char remote_app_id[WMP_HOST_CAPACITY];
    char remote_port[WMP_PORT_CAPACITY];
    char request_id[WMP_REQUEST_CAPACITY];
    int width;
    int height;
    int fps;
    int bitrate;
    int rikeyid;
    int codec_mode;
    int hdr;
    int full_range;
} wmp_start_request_t;

static wmp_esplus_api_t g_esplus;
static wmp_esplus_probe_result_e g_esplus_probe_result = WMP_ESPLUS_PROBE_LIBRARY_MISSING;
static int g_control_port_id = -1;
static bool g_service_ready;

static pthread_mutex_t g_session_mutex = PTHREAD_MUTEX_INITIALIZER;
static pthread_cond_t g_session_condition = PTHREAD_COND_INITIALIZER;
static bool g_session_worker_active;
static bool g_session_starting;
static bool g_session_stop_in_progress;

static bool service_is_ready(void)
{
    bool ready;
    pthread_mutex_lock(&g_session_mutex);
    ready = g_service_ready;
    pthread_mutex_unlock(&g_session_mutex);
    return ready;
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

static void send_event(
    const char *remote_app_id,
    const char *remote_port,
    const char *event)
{
    bundle *message;
    int result;

    if (!service_is_ready() || remote_app_id == NULL || remote_port == NULL ||
        remote_port[0] == '\0' || event == NULL)
        return;

    message = bundle_create();
    if (message == NULL)
        return;

    bundle_add_str(message, "protocol", WMP_PROTOCOL);
    bundle_add_str(message, "type", "event");
    bundle_add_str(message, "event", event);
    result = message_port_send_trusted_message(remote_app_id, remote_port, message);
    bundle_free(message);

    if (result != MESSAGE_PORT_ERROR_NONE)
        dlog_print(DLOG_WARN, LOG_TAG, "WMP event send failed: %d", result);
}

static bool copy_bundle_value(
    bundle *message,
    const char *field,
    char *destination,
    size_t capacity,
    bool required)
{
    char key[80];
    char *value = NULL;
    size_t length;

    if (message == NULL || field == NULL || destination == NULL || capacity == 0)
        return false;

    if (snprintf(key, sizeof(key), "arg_%s", field) >= (int)sizeof(key))
        return false;

    if (bundle_get_str(message, key, &value) != 0 || value == NULL)
        return !required;

    length = strlen(value);
    if (length >= capacity || (required && length == 0))
        return false;

    memcpy(destination, value, length + 1);
    return true;
}

static bool parse_int_value(const char *value, int *result)
{
    char *end = NULL;
    long parsed;

    if (value == NULL || value[0] == '\0' || result == NULL)
        return false;

    errno = 0;
    parsed = strtol(value, &end, 10);
    if (errno != 0 || end == value || *end != '\0' ||
        parsed < INT_MIN || parsed > INT_MAX)
        return false;

    *result = (int)parsed;
    return true;
}

static bool parse_int_argument(bundle *message, const char *field, int *result)
{
    char value[32];
    return copy_bundle_value(message, field, value, sizeof(value), true) &&
           parse_int_value(value, result);
}

static bool parse_bool_argument(bundle *message, const char *field, int *result)
{
    char value[16];

    if (!copy_bundle_value(message, field, value, sizeof(value), true))
        return false;

    if (strcmp(value, "true") == 0 || strcmp(value, "1") == 0) {
        *result = 1;
        return true;
    }
    if (strcmp(value, "false") == 0 || strcmp(value, "0") == 0) {
        *result = 0;
        return true;
    }
    return false;
}

static bool is_hex_key(const char *value)
{
    size_t i;
    if (value == NULL || strlen(value) != 32)
        return false;

    for (i = 0; i < 32; ++i) {
        char c = value[i];
        if (!((c >= '0' && c <= '9') ||
              (c >= 'a' && c <= 'f') ||
              (c >= 'A' && c <= 'F')))
            return false;
    }
    return true;
}

static bool parse_start_request(
    bundle *message,
    const char *remote_app_id,
    const char *remote_port,
    const char *request_id,
    wmp_start_request_t *request)
{
    if (request == NULL)
        return false;

    memset(request, 0, sizeof(*request));

    if (remote_app_id == NULL || remote_port == NULL || request_id == NULL ||
        strlen(remote_app_id) >= sizeof(request->remote_app_id) ||
        strlen(remote_port) >= sizeof(request->remote_port) ||
        strlen(request_id) >= sizeof(request->request_id))
        return false;

    strcpy(request->remote_app_id, remote_app_id);
    strcpy(request->remote_port, remote_port);
    strcpy(request->request_id, request_id);

    if (!copy_bundle_value(message, "host", request->host,
                           sizeof(request->host), true) ||
        !copy_bundle_value(message, "rikey", request->rikey,
                           sizeof(request->rikey), true) ||
        !copy_bundle_value(message, "appVer", request->app_version,
                           sizeof(request->app_version), false) ||
        !copy_bundle_value(message, "gfeVer", request->gfe_version,
                           sizeof(request->gfe_version), false) ||
        !copy_bundle_value(message, "rtspUrl", request->rtsp_url,
                           sizeof(request->rtsp_url), false) ||
        !copy_bundle_value(message, "videoCodec", request->video_codec,
                           sizeof(request->video_codec), true) ||
        !copy_bundle_value(message, "audioConfig", request->audio_config,
                           sizeof(request->audio_config), true) ||
        !parse_int_argument(message, "w", &request->width) ||
        !parse_int_argument(message, "h", &request->height) ||
        !parse_int_argument(message, "fps", &request->fps) ||
        !parse_int_argument(message, "bitrate", &request->bitrate) ||
        !parse_int_argument(message, "rikeyid", &request->rikeyid) ||
        !parse_int_argument(message, "codecMode", &request->codec_mode) ||
        !parse_bool_argument(message, "hdr", &request->hdr) ||
        !parse_bool_argument(message, "fullRange", &request->full_range))
        return false;

    if (!is_hex_key(request->rikey) ||
        (strcmp(request->video_codec, "H264") != 0 &&
         strcmp(request->video_codec, "HEVC") != 0 &&
         strcmp(request->video_codec, "AV1") != 0) ||
        (strcmp(request->audio_config, "Stereo") != 0 &&
         strcmp(request->audio_config, "51Surround") != 0 &&
         strcmp(request->audio_config, "71Surround") != 0))
        return false;

    return true;
}

static void *session_worker(void *context)
{
    wmp_start_request_t *request = (wmp_start_request_t *)context;
    char response[160];
    char event[64];
    char diagnostic[2048];
    int result;
    int termination_code;
    bool video_ready = false;
    struct timespec delay = { 0, 200000000L };

    result = ml_engine_start_session_v2(
        request->host,
        request->width,
        request->height,
        request->fps,
        request->bitrate,
        request->rikey,
        request->rikeyid,
        request->app_version,
        request->gfe_version,
        request->rtsp_url,
        request->codec_mode,
        request->video_codec,
        request->hdr,
        request->audio_config,
        request->full_range);

    pthread_mutex_lock(&g_session_mutex);
    g_session_starting = false;
    pthread_cond_broadcast(&g_session_condition);
    pthread_mutex_unlock(&g_session_mutex);

    if (result != 0) {
        snprintf(response, sizeof(response),
                 "{\"error\":\"engine_start_failed\",\"code\":%d}", result);
        send_response(request->remote_app_id, request->remote_port,
                      request->request_id, "error", response);
        goto finished;
    }

    send_response(request->remote_app_id, request->remote_port,
                  request->request_id, "ok",
                  "{\"started\":true,\"running\":true}");
    send_event(request->remote_app_id, request->remote_port,
               "Connection Established");

    /*
     * This monitor only forwards Common C's authoritative running state and
     * the engine's first accepted video packet. It never aborts or recovers a
     * session. The engine owns all connection and teardown decisions.
     */
    while (ml_engine_running()) {
        ml_engine_stats stats;
        memset(&stats, 0, sizeof(stats));
        stats.struct_size = (int32_t)sizeof(stats);
        if (!video_ready && ml_engine_get_stats(&stats) == 0 &&
            stats.submitted > 0) {
            video_ready = true;
            send_event(request->remote_app_id, request->remote_port,
                       "displayVideo");
        }
        nanosleep(&delay, NULL);
    }

    memset(diagnostic, 0, sizeof(diagnostic));
    termination_code = ml_engine_last_error(diagnostic, sizeof(diagnostic));

    pthread_mutex_lock(&g_session_mutex);
    while (g_session_stop_in_progress)
        pthread_cond_wait(&g_session_condition, &g_session_mutex);
    g_session_stop_in_progress = true;
    pthread_mutex_unlock(&g_session_mutex);

    /* Host termination and explicit stop both converge on the public engine API. */
    ml_engine_stop();

    pthread_mutex_lock(&g_session_mutex);
    g_session_stop_in_progress = false;
    pthread_cond_broadcast(&g_session_condition);
    pthread_mutex_unlock(&g_session_mutex);

    snprintf(event, sizeof(event), "streamTerminated: %d", termination_code);
    send_event(request->remote_app_id, request->remote_port, event);

finished:
    pthread_mutex_lock(&g_session_mutex);
    g_session_starting = false;
    g_session_worker_active = false;
    pthread_cond_broadcast(&g_session_condition);
    pthread_mutex_unlock(&g_session_mutex);

    free(request);
    return NULL;
}

static void handle_start_session(
    bundle *message,
    const char *remote_app_id,
    const char *remote_port,
    const char *request_id)
{
    pthread_t worker;
    wmp_start_request_t *request;

    if (!service_is_ready()) {
        send_response(remote_app_id, remote_port, request_id,
                      "error", "{\"error\":\"service_not_ready\"}");
        return;
    }

    if (g_esplus_probe_result != WMP_ESPLUS_PROBE_OK) {
        send_response(remote_app_id, remote_port, request_id,
                      "error", "{\"error\":\"esplus_unavailable\"}");
        return;
    }

    request = (wmp_start_request_t *)calloc(1, sizeof(*request));
    if (request == NULL) {
        send_response(remote_app_id, remote_port, request_id,
                      "error", "{\"error\":\"out_of_memory\"}");
        return;
    }

    if (!parse_start_request(message, remote_app_id, remote_port,
                             request_id, request)) {
        free(request);
        send_response(remote_app_id, remote_port, request_id,
                      "error", "{\"error\":\"invalid_start_arguments\"}");
        return;
    }

    pthread_mutex_lock(&g_session_mutex);
    if (g_session_worker_active || g_session_starting ||
        g_session_stop_in_progress) {
        pthread_mutex_unlock(&g_session_mutex);
        free(request);
        send_response(remote_app_id, remote_port, request_id,
                      "error", "{\"error\":\"engine_busy\"}");
        return;
    }

    g_session_worker_active = true;
    g_session_starting = true;
    pthread_mutex_unlock(&g_session_mutex);

    if (pthread_create(&worker, NULL, session_worker, request) != 0) {
        pthread_mutex_lock(&g_session_mutex);
        g_session_worker_active = false;
        g_session_starting = false;
        pthread_cond_broadcast(&g_session_condition);
        pthread_mutex_unlock(&g_session_mutex);
        free(request);
        send_response(remote_app_id, remote_port, request_id,
                      "error", "{\"error\":\"worker_create_failed\"}");
        return;
    }

    pthread_detach(worker);
}

static void handle_stop_session(
    const char *remote_app_id,
    const char *remote_port,
    const char *request_id)
{
    pthread_mutex_lock(&g_session_mutex);
    if (g_session_starting || g_session_stop_in_progress) {
        pthread_mutex_unlock(&g_session_mutex);
        send_response(remote_app_id, remote_port, request_id,
                      "error", "{\"error\":\"engine_busy\"}");
        return;
    }
    g_session_stop_in_progress = true;
    pthread_mutex_unlock(&g_session_mutex);

    ml_engine_stop();

    pthread_mutex_lock(&g_session_mutex);
    g_session_stop_in_progress = false;
    pthread_cond_broadcast(&g_session_condition);
    pthread_mutex_unlock(&g_session_mutex);

    send_response(remote_app_id, remote_port, request_id, "ok",
                  "{\"stopped\":true}");
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
        engine_running = service_is_ready() ? ml_engine_running() : 0;
        snprintf(response_payload, sizeof(response_payload),
                 "{\"service\":\"%s\",\"engine\":\"%s\","
                 "\"running\":%s,\"esplus\":\"%s\","
                 "\"streamApi\":\"%s\"}",
                 service_is_ready() ? "ready" : "stopping",
                 service_is_ready() ? "libmlengine" : "unavailable",
                 engine_running ? "true" : "false",
                 wmp_esplus_probe_result_name(g_esplus_probe_result),
                 wmp_esplus_family_name(g_esplus.selected_family));
    } else if (strcmp(command, "start_session") == 0) {
        handle_start_session(message, remote_app_id, remote_port, request_id);
        return;
    } else if (strcmp(command, "stop_session") == 0) {
        handle_stop_session(remote_app_id, remote_port, request_id);
        return;
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

    pthread_mutex_lock(&g_session_mutex);
    g_service_ready = true;
    pthread_mutex_unlock(&g_session_mutex);

    dlog_print(DLOG_INFO, LOG_TAG, "WMP native service started");
    dlog_print(DLOG_INFO, LOG_TAG, "WMP control port registered: %s",
               WMP_CONTROL_PORT);
    dlog_print(DLOG_INFO, LOG_TAG, "WMP engine linked: libmlengine");
    dlog_print(DLOG_INFO, LOG_TAG, "ESPlus probe state=%s family=%s",
               wmp_esplus_probe_result_name(g_esplus_probe_result),
               wmp_esplus_family_name(g_esplus.selected_family));
    dlog_print(DLOG_INFO, LOG_TAG, "%s", report);

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

    pthread_mutex_lock(&g_session_mutex);
    g_service_ready = false;
    while (g_session_starting || g_session_stop_in_progress)
        pthread_cond_wait(&g_session_condition, &g_session_mutex);
    g_session_stop_in_progress = true;
    pthread_mutex_unlock(&g_session_mutex);

    if (g_control_port_id >= 0) {
        message_port_unregister_trusted_local_port(g_control_port_id);
        g_control_port_id = -1;
    }

    ml_engine_stop();

    pthread_mutex_lock(&g_session_mutex);
    g_session_stop_in_progress = false;
    pthread_cond_broadcast(&g_session_condition);
    while (g_session_worker_active)
        pthread_cond_wait(&g_session_condition, &g_session_mutex);
    pthread_mutex_unlock(&g_session_mutex);

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
