/*
 * wmp_window_order.c - diagnostic lookup of the WMP and WebApp Wayland
 * ResourceIDs through the Tizen Window Server's org.enlightenment.wm D-Bus API.
 *
 * This is deliberately diagnostic-only: it does not change window stacking.
 */
#include <dlfcn.h>
#include <stdint.h>
#include <stdarg.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <sys/types.h>
#include <unistd.h>

#include "wmp_window_order.h"

/* HostProtocol installs this callback before any stream can create the WMP window. */
extern void (*volatile ml_log_cb)(const char *line) __attribute__((weak));

#define WEB_APP_ID "MoonLightS.MoonlightWasm"
#define DBUS_BUS_SYSTEM 1
#define DBUS_TYPE_STRING 's'
#define DBUS_TYPE_UINT32 'u'
#define DBUS_TYPE_ARRAY 'a'
#define DBUS_TYPE_STRUCT 'r'
#define DBUS_TIMEOUT_MS 3000

static void window_order_log(const char *format, ...)
{
    char line[512];
    size_t prefix_length;
    va_list args;
    void (*callback)(const char *);

    snprintf(line, sizeof(line), "[window-order] ");
    prefix_length = strlen(line);
    va_start(args, format);
    vsnprintf(line + prefix_length, sizeof(line) - prefix_length, format, args);
    va_end(args);

    fprintf(stderr, "%s\n", line);
    if (&ml_log_cb) {
        callback = ml_log_cb;
        if (callback) callback(line);
    }
}

#define WLOG(...) window_order_log(__VA_ARGS__)
/* Public libdbus DBusError ABI: name and message are the first two fields. */
typedef struct {
    const char *name;
    const char *message;
    unsigned int dummy1 : 1;
    unsigned int dummy2 : 1;
    unsigned int dummy3 : 1;
    unsigned int dummy4 : 1;
    unsigned int dummy5 : 1;
    void *padding1;
} dbus_error_info_t;

typedef union {
    long double align_ld;
    void *align_ptr;
    uint64_t align_u64;
    unsigned char bytes[128];
} dbus_opaque_t;

typedef struct {
    void *library;
    void (*error_init)(void *error);
    int (*error_is_set)(const void *error);
    void (*error_free)(void *error);
    void *(*bus_get)(int type, void *error);
    void *(*message_new_method_call)(const char *destination, const char *path,
                                     const char *interface, const char *method);
    void (*message_iter_init_append)(void *message, void *iter);
    int (*message_iter_append_basic)(void *iter, int type, const void *value);
    void *(*connection_send_with_reply_and_block)(void *connection, void *message,
                                                   int timeout_ms, void *error);
    int (*message_iter_init)(void *message, void *iter);
    int (*message_iter_get_arg_type)(void *iter);
    void (*message_iter_recurse)(void *iter, void *sub);
    void (*message_iter_get_basic)(void *iter, void *value);
    int (*message_iter_next)(void *iter);
    const char *(*message_get_error_name)(void *message);
    void (*message_unref)(void *message);
    void (*connection_unref)(void *connection);
} dbus_api_t;

static dbus_api_t s_dbus;
static int s_dbus_loaded;

#define LOAD_DBUS(member, symbol) do { \
    *(void **)(&s_dbus.member) = dlsym(s_dbus.library, symbol); \
    if (!s_dbus.member) goto fail; \
} while (0)

static int dbus_load(void)
{
    if (s_dbus_loaded) return 1;

    s_dbus.library = dlopen("libdbus-1.so.3", RTLD_NOW | RTLD_LOCAL);
    if (!s_dbus.library)
        s_dbus.library = dlopen("libdbus-1.so", RTLD_NOW | RTLD_LOCAL);
    if (!s_dbus.library) {
        const char *error_text = dlerror();
        WLOG("cannot load libdbus-1: %s", error_text ? error_text : "not found");
        return 0;
    }

    LOAD_DBUS(error_init, "dbus_error_init");
    LOAD_DBUS(error_is_set, "dbus_error_is_set");
    LOAD_DBUS(error_free, "dbus_error_free");
    LOAD_DBUS(bus_get, "dbus_bus_get");
    LOAD_DBUS(message_new_method_call, "dbus_message_new_method_call");
    LOAD_DBUS(message_iter_init_append, "dbus_message_iter_init_append");
    LOAD_DBUS(message_iter_append_basic, "dbus_message_iter_append_basic");
    LOAD_DBUS(connection_send_with_reply_and_block, "dbus_connection_send_with_reply_and_block");
    LOAD_DBUS(message_iter_init, "dbus_message_iter_init");
    LOAD_DBUS(message_iter_get_arg_type, "dbus_message_iter_get_arg_type");
    LOAD_DBUS(message_iter_recurse, "dbus_message_iter_recurse");
    LOAD_DBUS(message_iter_get_basic, "dbus_message_iter_get_basic");
    LOAD_DBUS(message_iter_next, "dbus_message_iter_next");
    LOAD_DBUS(message_get_error_name, "dbus_message_get_error_name");
    LOAD_DBUS(message_unref, "dbus_message_unref");
    LOAD_DBUS(connection_unref, "dbus_connection_unref");

    s_dbus_loaded = 1;
    WLOG("loaded libdbus-1");
    return 1;

fail:
    {
        const char *error_text = dlerror();
        WLOG("libdbus-1 is missing required symbol: %s", error_text ? error_text : "unknown");
    }
    dlclose(s_dbus.library);
    memset(&s_dbus, 0, sizeof(s_dbus));
    return 0;
}

static void copy_field(char *dst, size_t dst_size, const char *value)
{
    if (!dst_size) return;
    snprintf(dst, dst_size, "%s", value ? value : "");
}

static int parse_resource_id(const char *value, uint32_t *resource_id)
{
    char *end = NULL;
    unsigned long parsed;

    if (!value || !*value) return 0;
    parsed = strtoul(value, &end, 10);
    if (end == value || *end != '\0' || parsed == 0 || parsed > UINT32_MAX)
        return 0;
    *resource_id = (uint32_t)parsed;
    return 1;
}

typedef struct {
    char pid[24];
    char window_id[24];
    char name[128];
    char resource_id[24];
    int active;
} window_record_t;

static void finish_window_record(const window_record_t *record, pid_t expected_pid,
                                 unsigned *window_count, unsigned *valid_count,
                                 uint32_t *selected_resource_id)
{
    uint32_t resource_id = 0;
    char *end = NULL;
    long record_pid = record->pid[0] ? strtol(record->pid, &end, 10) : -1;
    int pid_matches = record->pid[0] && end && *end == '\0' && record_pid == (long)expected_pid;
    int resource_valid = parse_resource_id(record->resource_id, &resource_id);

    ++*window_count;
    WLOG("pid=%s window_id=%s name=\"%s\" ResourceID=%s%s",
         record->pid[0] ? record->pid : "(missing)",
         record->window_id[0] ? record->window_id : "(missing)",
         record->name[0] ? record->name : "(unnamed)",
         record->resource_id[0] ? record->resource_id : "(missing)",
         pid_matches ? "" : " [PID mismatch]");

    if (pid_matches && resource_valid) {
        ++*valid_count;
        if (*valid_count == 1)
            *selected_resource_id = resource_id;
    }
}

static int query_window_resource_id(pid_t pid, uint32_t *resource_id)
{
    dbus_opaque_t error, append_iter, reply_iter, array_iter, struct_iter;
    void *connection = NULL, *message = NULL, *reply = NULL;
    char pid_text[24];
    uint32_t mode = 1; /* WINDOW_PID_MODE in enlightenment_info */
    unsigned window_count = 0, valid_count = 0;
    window_record_t current;
    int ok = 0;

    memset(&current, 0, sizeof(current));
    *resource_id = 0;

    if (!dbus_load()) return 0;

    snprintf(pid_text, sizeof(pid_text), "%ld", (long)pid);
    memset(&error, 0, sizeof(error));
    s_dbus.error_init(error.bytes);
    connection = s_dbus.bus_get(DBUS_BUS_SYSTEM, error.bytes);
    if (!connection || s_dbus.error_is_set(error.bytes)) {
        WLOG("D-Bus system bus connection failed for PID %s", pid_text);
        if (s_dbus.error_is_set(error.bytes)) s_dbus.error_free(error.bytes);
        goto done;
    }
    if (s_dbus.error_is_set(error.bytes)) s_dbus.error_free(error.bytes);

    message = s_dbus.message_new_method_call(
        "org.enlightenment.wm", "/org/enlightenment/wm",
        "org.enlightenment.wm.info", "get_window_prop");
    if (!message) {
        WLOG("cannot create get_window_prop D-Bus message");
        goto done;
    }

    memset(&append_iter, 0, sizeof(append_iter));
    s_dbus.message_iter_init_append(message, append_iter.bytes);
    {
        const char *pid_argument = pid_text;
        if (!s_dbus.message_iter_append_basic(append_iter.bytes, DBUS_TYPE_UINT32, &mode) ||
            !s_dbus.message_iter_append_basic(append_iter.bytes, DBUS_TYPE_STRING, &pid_argument)) {
            WLOG("cannot append get_window_prop arguments for PID %s", pid_text);
            goto done;
        }
    }

    memset(&error, 0, sizeof(error));
    s_dbus.error_init(error.bytes);
    reply = s_dbus.connection_send_with_reply_and_block(
        connection, message, DBUS_TIMEOUT_MS, error.bytes);
    if (!reply || s_dbus.error_is_set(error.bytes)) {
        const dbus_error_info_t *detail = (const dbus_error_info_t *)error.bytes;
        WLOG("get_window_prop D-Bus call failed for PID %s: name=%s message=%s",
             pid_text,
             detail->name ? detail->name : "(none)",
             detail->message ? detail->message : "(none)");
        if (s_dbus.error_is_set(error.bytes)) s_dbus.error_free(error.bytes);
        goto done;
    }
    if (s_dbus.error_is_set(error.bytes)) s_dbus.error_free(error.bytes);

    {
        const char *error_name = s_dbus.message_get_error_name(reply);
        if (error_name) {
            WLOG("get_window_prop returned D-Bus error for PID %s: %s", pid_text, error_name);
            goto done;
        }
    }

    memset(&reply_iter, 0, sizeof(reply_iter));
    if (!s_dbus.message_iter_init(reply, reply_iter.bytes) ||
        s_dbus.message_iter_get_arg_type(reply_iter.bytes) != DBUS_TYPE_ARRAY) {
        WLOG("get_window_prop returned an unexpected reply for PID %s", pid_text);
        goto done;
    }

    memset(&array_iter, 0, sizeof(array_iter));
    s_dbus.message_iter_recurse(reply_iter.bytes, array_iter.bytes);
    while (s_dbus.message_iter_get_arg_type(array_iter.bytes) == DBUS_TYPE_STRUCT) {
        const char *key = NULL, *value = NULL;

        memset(&struct_iter, 0, sizeof(struct_iter));
        s_dbus.message_iter_recurse(array_iter.bytes, struct_iter.bytes);
        if (s_dbus.message_iter_get_arg_type(struct_iter.bytes) == DBUS_TYPE_STRING) {
            s_dbus.message_iter_get_basic(struct_iter.bytes, &key);
            if (s_dbus.message_iter_next(struct_iter.bytes) &&
                s_dbus.message_iter_get_arg_type(struct_iter.bytes) == DBUS_TYPE_STRING)
                s_dbus.message_iter_get_basic(struct_iter.bytes, &value);
        }

        if (key && value) {
            if (strcmp(key, "[WINDOW PROP]") == 0) {
                if (current.active)
                    finish_window_record(&current, pid, &window_count, &valid_count, resource_id);
                memset(&current, 0, sizeof(current));
                current.active = 1;
            } else if (current.active) {
                if (strcmp(key, "PID") == 0) copy_field(current.pid, sizeof(current.pid), value);
                else if (strcmp(key, "Window_ID") == 0) copy_field(current.window_id, sizeof(current.window_id), value);
                else if (strcmp(key, "Window_Name") == 0) copy_field(current.name, sizeof(current.name), value);
                else if (strcmp(key, "ResourceID") == 0) copy_field(current.resource_id, sizeof(current.resource_id), value);
            }
        }
        if (!s_dbus.message_iter_next(array_iter.bytes)) break;
    }

    if (current.active)
        finish_window_record(&current, pid, &window_count, &valid_count, resource_id);

    WLOG("get_window_prop PID=%s -> windows=%u valid_ResourceIDs=%u",
         pid_text, window_count, valid_count);
    ok = (window_count == 1 && valid_count == 1 && *resource_id != 0);
    if (!window_count)
        WLOG("no compositor window found for PID %s", pid_text);
    else if (!ok)
        WLOG("PID %s is ambiguous or has no valid ResourceID; refusing to select one", pid_text);

done:
    if (reply) s_dbus.message_unref(reply);
    if (message) s_dbus.message_unref(message);
    if (connection) s_dbus.connection_unref(connection);
    return ok;
}

static int get_application_pid(const char *app_id, pid_t *pid)
{
    typedef int (*get_context_fn)(const char *, void **);
    typedef int (*get_pid_fn)(void *, pid_t *);
    typedef int (*destroy_context_fn)(void *);
    void *manager = NULL, *context = NULL;
    get_context_fn get_context = NULL;
    get_pid_fn get_context_pid = NULL;
    destroy_context_fn destroy_context = NULL;
    int result, pid_result;

    manager = dlopen("libcapi-appfw-app-manager.so.0", RTLD_NOW | RTLD_LOCAL);
    if (!manager) manager = dlopen("libcapi-appfw-app-manager.so", RTLD_NOW | RTLD_LOCAL);
    if (!manager) {
        const char *error_text = dlerror();
        WLOG("cannot load Application Manager library: %s", error_text ? error_text : "not found");
        return 0;
    }

    *(void **)(&get_context) = dlsym(manager, "app_manager_get_app_context");
    *(void **)(&get_context_pid) = dlsym(manager, "app_context_get_pid");
    *(void **)(&destroy_context) = dlsym(manager, "app_context_destroy");
    if (!get_context || !get_context_pid || !destroy_context) {
        WLOG("Application Manager symbols unavailable (get_context=%d get_pid=%d destroy=%d)",
             get_context != NULL, get_context_pid != NULL, destroy_context != NULL);
        goto fail;
    }

    result = get_context(app_id, &context);
    if (result != 0 || !context) {
        WLOG("app_manager_get_app_context(\"%s\") failed: rc=%d context=%p", app_id, result, context);
        goto fail;
    }

    pid_result = get_context_pid(context, pid);
    WLOG("Application Manager app_id=%s get_context=0 get_pid=%d PID=%ld",
         app_id, pid_result, pid_result == 0 ? (long)*pid : -1L);
    destroy_context(context);
    context = NULL;
    if (pid_result != 0 || *pid <= 0) goto fail;

    dlclose(manager);
    return 1;

fail:
    if (context && destroy_context) destroy_context(context);
    if (manager) dlclose(manager);
    return 0;
}

int wmp_window_order_probe(void)
{
    pid_t webapp_pid = 0;
    pid_t service_pid = getpid();
    uint32_t webapp_resource_id = 0;
    uint32_t service_resource_id = 0;
    int webapp_pid_ok, service_id_ok, webapp_id_ok;

    WLOG("starting diagnostic lookup: WebApp=%s service_PID=%ld", WEB_APP_ID, (long)service_pid);
    webapp_pid_ok = get_application_pid(WEB_APP_ID, &webapp_pid);
    if (!webapp_pid_ok) {
        WLOG("cannot resolve WebApp PID; no stacking request will be made");
        return -1;
    }

    service_id_ok = query_window_resource_id(service_pid, &service_resource_id);
    webapp_id_ok = query_window_resource_id(webapp_pid, &webapp_resource_id);

    if (service_id_ok && webapp_id_ok) {
        WLOG("READY: activate_below_by_res_id(WMP_ResourceID=%u, Moonlight_ResourceID=%u)",
             service_resource_id, webapp_resource_id);
        WLOG("diagnostic only: stacking request NOT sent");
        return 0;
    }

    WLOG("NOT READY: WMP_ResourceID=%s Moonlight_ResourceID=%s; stacking request NOT sent",
         service_id_ok ? "valid" : "unavailable", webapp_id_ok ? "valid" : "unavailable");
    return -1;
}
