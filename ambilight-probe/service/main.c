#define _GNU_SOURCE
#include <bundle.h>
#include <dlog.h>
#include <message_port.h>
#include <service_app.h>
#include <dlfcn.h>
#include <stdbool.h>
#include <stdint.h>
#include <stdio.h>
#include <string.h>
#include <time.h>

#undef LOG_TAG
#define LOG_TAG "MoonlightAmbilightProbe"
#define PROBE_PORT "AmbilightProbeControl"
#define STATUS_PORT "AmbilightProbeStatus"
#define PROBE_WEB_APP_ID "AmbiProbeX.AmbilightProbeWeb"
#define PROBE_PROTOCOL "ambilight-probe/1"

typedef struct {
    int32_t slots;
    int32_t block_width;
    int32_t block_height;
    int32_t delay_ms;
    int32_t width;
    int32_t height;
} probe_condition_t;

typedef struct {
    int32_t r;
    int32_t g;
    int32_t b;
    int32_t low_input_lag;
} probe_rgb_t;

typedef int (*get_condition_fn)(probe_condition_t *condition);
typedef int (*set_position_fn)(int index, int x, int y);
typedef int (*get_pixel_fn)(int index, probe_rgb_t *rgb);

typedef struct {
    const char *name;
    get_condition_fn get_condition;
    set_position_fn set_position;
    get_pixel_fn get_pixel;
} probe_api_t;

static int g_port_id = -1;
static int g_status_port_id = -1;
static int g_probe_registration_error = 0;

static void add_string(bundle *message, const char *key, const char *value)
{
    (void)bundle_add_str(message, key, value != NULL ? value : "");
}

static void add_int(bundle *message, const char *key, int value)
{
    char text[32];
    (void)snprintf(text, sizeof(text), "%d", value);
    add_string(message, key, text);
}

static bool resolve_family(void *library, const char *prefix, const char *name,
                           probe_api_t *api)
{
    char symbol[96];

    (void)snprintf(symbol, sizeof(symbol), "%sget_rgb_measure_condition", prefix);
    api->get_condition = (get_condition_fn)dlsym(library, symbol);
    if (api->get_condition == NULL) return false;

    (void)snprintf(symbol, sizeof(symbol), "%sset_rgb_measure_position", prefix);
    api->set_position = (set_position_fn)dlsym(library, symbol);
    if (api->set_position == NULL) return false;

    (void)snprintf(symbol, sizeof(symbol), "%sget_rgb_measure_pixel", prefix);
    api->get_pixel = (get_pixel_fn)dlsym(library, symbol);
    if (api->get_pixel == NULL) return false;

    api->name = name;
    return true;
}

static void wait_milliseconds(int milliseconds)
{
    struct timespec delay;
    if (milliseconds <= 0) return;
    delay.tv_sec = milliseconds / 1000;
    delay.tv_nsec = (long)(milliseconds % 1000) * 1000000L;
    while (nanosleep(&delay, &delay) != 0) { }
}

static void run_probe(bundle *reply)
{
    void *library = NULL;
    probe_api_t api;
    probe_condition_t condition;
    probe_rgb_t rgb;
    const char *library_path = "/usr/lib/libvideoenhance.so";
    const char *failure_stage = "library";
    int condition_ret = -9999;
    int position_ret = -9999;
    int pixel_ret = -9999;
    int x = 0;
    int y = 0;
    int wait_ms = 0;
    bool supported = false;
    const char *error = "";

    memset(&api, 0, sizeof(api));
    memset(&condition, 0, sizeof(condition));
    memset(&rgb, 0, sizeof(rgb));

    library = dlopen(library_path, RTLD_NOW | RTLD_LOCAL);
    if (library == NULL) {
        library_path = "libvideoenhance.so";
        library = dlopen(library_path, RTLD_NOW | RTLD_LOCAL);
    }
    if (library == NULL) {
        const char *loader_error = dlerror();
        error = loader_error != NULL ? loader_error : "dlopen failed";
        goto finished;
    }

    failure_stage = "symbols";
    if (!resolve_family(library, "cs_ve_", "cs_ve", &api) &&
        !resolve_family(library, "ve_", "ve", &api) &&
        !resolve_family(library, "ppi_ve_", "ppi_ve", &api)) {
        error = "no complete supported function family found";
        goto finished;
    }

    failure_stage = "condition";
    condition_ret = api.get_condition(&condition);
    if (condition_ret < 0) {
        error = "get_rgb_measure_condition returned an error";
        goto finished;
    }
    if (condition.slots < 1 || condition.slots > 64 ||
        condition.width < 16 || condition.height < 16 ||
        condition.block_width < 1 || condition.block_height < 1 ||
        condition.block_width > condition.width ||
        condition.block_height > condition.height ||
        condition.delay_ms < 0 || condition.delay_ms > 2000) {
        error = "hardware condition returned implausible dimensions or limits";
        goto finished;
    }

    failure_stage = "set_position";
    x = (condition.width - condition.block_width) / 2;
    y = (condition.height - condition.block_height) / 2;
    position_ret = api.set_position(0, x, y);
    if (position_ret < 0) {
        error = "set_rgb_measure_position returned an error";
        goto finished;
    }

    failure_stage = "get_pixel";
    wait_ms = condition.delay_ms > 20 ? condition.delay_ms : 20;
    wait_milliseconds(wait_ms);
    pixel_ret = api.get_pixel(0, &rgb);
    if (pixel_ret < 0) {
        error = "get_rgb_measure_pixel returned an error";
        goto finished;
    }
    if (rgb.r < 0 || rgb.r > 1023 || rgb.g < 0 || rgb.g > 1023 ||
        rgb.b < 0 || rgb.b > 1023) {
        error = "RGB sample is outside the expected 10-bit range";
        goto finished;
    }

    supported = true;
    failure_stage = "complete";

finished:
    add_string(reply, "protocol", PROBE_PROTOCOL);
    add_string(reply, "type", "probe_result");
    add_string(reply, "supported", supported ? "true" : "false");
    add_string(reply, "stage", failure_stage);
    add_string(reply, "library", library != NULL ? library_path : "libvideoenhance.so");
    add_string(reply, "family", api.name);
    add_string(reply, "error", error);
    add_int(reply, "condition_ret", condition_ret);
    add_int(reply, "slots", condition.slots);
    add_int(reply, "block_width", condition.block_width);
    add_int(reply, "block_height", condition.block_height);
    add_int(reply, "delay_ms", condition.delay_ms);
    add_int(reply, "width", condition.width);
    add_int(reply, "height", condition.height);
    add_int(reply, "position_ret", position_ret);
    add_int(reply, "sample_delay_ms", wait_ms);
    add_int(reply, "pixel_ret", pixel_ret);
    add_int(reply, "r", rgb.r);
    add_int(reply, "g", rgb.g);
    add_int(reply, "b", rgb.b);

    dlog_print(supported ? DLOG_INFO : DLOG_WARN, LOG_TAG,
               "Probe supported=%s stage=%s family=%s condition=%d position=%d pixel=%d rgb=%d,%d,%d error=%s",
               supported ? "true" : "false", failure_stage,
               api.name != NULL ? api.name : "none", condition_ret,
               position_ret, pixel_ret, rgb.r, rgb.g, rgb.b, error);

    if (library != NULL) dlclose(library);
}

static void message_received(int local_port_id, const char *remote_app_id,
                             const char *remote_port, bool trusted_remote_port,
                             bundle *message, void *user_data)
{
    char *protocol = NULL;
    char *command = NULL;
    bundle *reply;
    int result;

    (void)local_port_id;
    (void)user_data;

    if (remote_app_id == NULL || strcmp(remote_app_id, PROBE_WEB_APP_ID) != 0 ||
        !trusted_remote_port || remote_port == NULL || remote_port[0] == '\0') {
        dlog_print(DLOG_WARN, LOG_TAG, "Rejected unexpected or untrusted MessagePort sender");
        return;
    }
    if (message == NULL) return;

    (void)bundle_get_str(message, "protocol", &protocol);
    (void)bundle_get_str(message, "command", &command);
    if (protocol == NULL || strcmp(protocol, PROBE_PROTOCOL) != 0 || command == NULL) {
        dlog_print(DLOG_WARN, LOG_TAG, "Rejected invalid diagnostic command");
        return;
    }

    reply = bundle_create();
    if (reply == NULL) return;

    if (local_port_id == g_status_port_id && strcmp(command, "status") == 0) {
        add_string(reply, "protocol", PROBE_PROTOCOL);
        add_string(reply, "type", "service_status");
        add_string(reply, "probe_port_registered", g_port_id >= 0 ? "true" : "false");
        add_int(reply, "probe_port_error", g_probe_registration_error);
    } else if (local_port_id == g_port_id && strcmp(command, "probe") == 0) {
        run_probe(reply);
    } else {
        bundle_free(reply);
        dlog_print(DLOG_WARN, LOG_TAG, "Rejected command for unexpected local MessagePort");
        return;
    }

    result = message_port_send_trusted_message(remote_app_id, remote_port, reply);
    bundle_free(reply);
    if (result != MESSAGE_PORT_ERROR_NONE)
        dlog_print(DLOG_ERROR, LOG_TAG, "Could not send diagnostic result: %d", result);
}

static bool service_create(void *data)
{
    (void)data;

    /* Keep a diagnostic channel alive even if the actual probe port fails. */
    g_status_port_id = message_port_register_trusted_local_port(STATUS_PORT, message_received, NULL);
    if (g_status_port_id < 0) {
        dlog_print(DLOG_ERROR, LOG_TAG, "Could not register status MessagePort: %d", g_status_port_id);
        return false;
    }

    g_port_id = message_port_register_trusted_local_port(PROBE_PORT, message_received, NULL);
    if (g_port_id < 0) {
        g_probe_registration_error = g_port_id;
        dlog_print(DLOG_ERROR, LOG_TAG, "Could not register probe MessagePort: %d", g_port_id);
        dlog_print(DLOG_WARN, LOG_TAG, "Diagnostic status port remains available: %s", STATUS_PORT);
        return true;
    }

    dlog_print(DLOG_INFO, LOG_TAG, "Ambilight diagnostic service ready; ports=%s,%s",
               STATUS_PORT, PROBE_PORT);
    return true;
}

static void service_terminate(void *data)
{
    (void)data;
    if (g_port_id >= 0) {
        (void)message_port_unregister_trusted_local_port(g_port_id);
        g_port_id = -1;
    }
    if (g_status_port_id >= 0) {
        (void)message_port_unregister_trusted_local_port(g_status_port_id);
        g_status_port_id = -1;
    }
    dlog_print(DLOG_INFO, LOG_TAG, "Ambilight diagnostic service stopped");
}

int main(int argc, char *argv[])
{
    service_app_lifecycle_callback_s callbacks;
    memset(&callbacks, 0, sizeof(callbacks));
    callbacks.create = service_create;
    callbacks.terminate = service_terminate;
    return service_app_main(argc, argv, &callbacks, NULL);
}
