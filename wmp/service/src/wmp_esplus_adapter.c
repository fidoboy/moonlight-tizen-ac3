#include "wmp_esplus_adapter.h"

#include <dlfcn.h>
#include <limits.h>
#include <string.h>

/*
 * The SET packet layout is the expanded 48-byte ARM32 packet:
 * type@0, buffer@4, size@8, pts_ms@16, duration_ms@24,
 * color_info@32, hdr_size@36, hdr_metadata@40.
 * The ADD packet is the legacy compact packet with nanosecond timestamps.
 * These are deliberately distinct C types; never pass one family to the other.
 */
typedef struct {
    uint32_t type;
    const void *buffer;
    uint32_t buffer_size;
    uint64_t pts_ms;
    uint64_t duration_ms;
    uint32_t matroska_color_info;
    uint32_t hdr10p_metadata_size;
    const void *hdr10p_metadata;
} set_packet_t;

typedef struct {
    uint32_t type;
    const void *buffer;
    uint32_t buffer_size;
    uint64_t pts_ns;
    uint64_t duration_ns;
} add_packet_t;

typedef int (*set_stream_fn)(void *, const void *);
typedef int (*add_stream_fn)(void *, const void *);
typedef int (*submit_fn)(void *, const void *);

typedef void (*set_error_cb)(uint32_t, void *);
typedef void (*set_buffer_cb)(uint32_t, uint32_t, void *);
typedef void (*set_void_cb)(void *);
typedef void (*set_stream_cb)(uint32_t, void *);
typedef void (*set_prepared_cb)(bool, void *);

typedef void (*add_error_cb)(uint32_t);
typedef void (*add_buffer_cb)(uint32_t, uint32_t);
typedef void (*add_void_cb)(void);
typedef void (*add_stream_cb)(uint32_t);
typedef void (*add_prepared_cb)(int);

typedef int (*set_error_reg_fn)(void *, set_error_cb, void *);
typedef int (*set_buffer_reg_fn)(void *, set_buffer_cb, void *);
typedef int (*set_void_reg_fn)(void *, set_void_cb, void *);
typedef int (*set_stream_reg_fn)(void *, set_stream_cb, void *);
typedef int (*set_prepared_reg_fn)(void *, set_prepared_cb, void *);
typedef int (*add_error_reg_fn)(void *, add_error_cb);
typedef int (*add_buffer_reg_fn)(void *, add_buffer_cb);
typedef int (*add_void_reg_fn)(void *, add_void_cb);
typedef int (*add_stream_reg_fn)(void *, add_stream_cb);
typedef int (*add_prepared_reg_fn)(void *, add_prepared_cb);

typedef char assert_set_packet_arm32[(sizeof(void *) != 4 || sizeof(set_packet_t) == 48) ? 1 : -1];
typedef char assert_add_packet_arm32[(sizeof(void *) != 4 || sizeof(add_packet_t) == 32) ? 1 : -1];

static wmp_esplus_adapter_t *s_add_adapter;

static void emit_error(uint32_t value, void *context)
{
    wmp_esplus_adapter_t *a = context;
    if (a && a->callbacks.error) a->callbacks.error(value, a->context);
}
static void emit_buffer(uint32_t stream, uint32_t status, void *context)
{
    wmp_esplus_adapter_t *a = context;
    if (a && a->callbacks.buffer_status)
        a->callbacks.buffer_status(stream, status, a->context);
}
static void emit_conflict(void *context)
{
    wmp_esplus_adapter_t *a = context;
    if (a && a->callbacks.resource_conflicted)
        a->callbacks.resource_conflicted(a->context);
}
static void emit_seek_done(void *context)
{
    wmp_esplus_adapter_t *a = context;
    if (a && a->callbacks.seek_done) a->callbacks.seek_done(a->context);
}
static void emit_ready(uint32_t stream, void *context)
{
    wmp_esplus_adapter_t *a = context;
    if (a && a->callbacks.ready_to_prepare)
        a->callbacks.ready_to_prepare(stream, a->context);
}
static void emit_prepared(bool success, void *context)
{
    wmp_esplus_adapter_t *a = context;
    if (a && a->callbacks.prepare_async_done)
        a->callbacks.prepare_async_done(success, a->context);
}

static void add_error(uint32_t value)
{
    if (s_add_adapter) emit_error(value, s_add_adapter);
}
static void add_buffer(uint32_t stream, uint32_t status)
{
    if (s_add_adapter) emit_buffer(stream, status, s_add_adapter);
}
static void add_conflict(void)
{
    if (s_add_adapter) emit_conflict(s_add_adapter);
}
static void add_seek_done(void)
{
    if (s_add_adapter) emit_seek_done(s_add_adapter);
}
static void add_ready(uint32_t stream)
{
    if (s_add_adapter) emit_ready(stream, s_add_adapter);
}
static void add_prepared(int success)
{
    if (s_add_adapter) emit_prepared(success != 0, s_add_adapter);
}

static void *symbol(wmp_esplus_adapter_t *a, const char *name)
{
    (void)dlerror();
    return dlsym(a->api->library, name);
}

static int bind_set(wmp_esplus_adapter_t *a)
{
    set_error_reg_fn error_reg = (set_error_reg_fn)symbol(a, "esplusplayer_set_error_cb");
    set_buffer_reg_fn buffer_reg = (set_buffer_reg_fn)symbol(a, "esplusplayer_set_buffer_status_cb");
    set_void_reg_fn conflict_reg = (set_void_reg_fn)symbol(a, "esplusplayer_set_resource_conflicted_cb");
    set_void_reg_fn seek_reg = (set_void_reg_fn)symbol(a, "esplusplayer_set_seek_done_cb");
    set_stream_reg_fn ready_reg = (set_stream_reg_fn)symbol(a, "esplusplayer_set_ready_to_prepare_cb");
    set_prepared_reg_fn prepared_reg = (set_prepared_reg_fn)symbol(a, "esplusplayer_set_prepare_async_done_cb");

    if (!error_reg || !buffer_reg || !conflict_reg || !seek_reg || !ready_reg || !prepared_reg)
        return -1;
    if (error_reg(a->player, emit_error, a) != 0 ||
        buffer_reg(a->player, emit_buffer, a) != 0 ||
        conflict_reg(a->player, emit_conflict, a) != 0 ||
        seek_reg(a->player, emit_seek_done, a) != 0 ||
        ready_reg(a->player, emit_ready, a) != 0 ||
        prepared_reg(a->player, emit_prepared, a) != 0)
        return -1;
    return 0;
}

static int bind_add(wmp_esplus_adapter_t *a)
{
    add_error_reg_fn error_reg = (add_error_reg_fn)symbol(a, "esplusplayer_set_error_cb");
    add_buffer_reg_fn buffer_reg = (add_buffer_reg_fn)symbol(a, "esplusplayer_set_buffer_status_cb");
    add_void_reg_fn conflict_reg = (add_void_reg_fn)symbol(a, "esplusplayer_set_resource_conflicted_cb");
    add_void_reg_fn seek_reg = (add_void_reg_fn)symbol(a, "esplusplayer_set_seek_done_cb");
    add_stream_reg_fn ready_reg = (add_stream_reg_fn)symbol(a, "esplusplayer_set_ready_to_prepare_cb");
    add_prepared_reg_fn prepared_reg = (add_prepared_reg_fn)symbol(a, "esplusplayer_set_prepare_async_done_cb");

    if (s_add_adapter && s_add_adapter != a) return -1;
    if (!error_reg || !buffer_reg || !conflict_reg || !seek_reg || !ready_reg || !prepared_reg)
        return -1;
    s_add_adapter = a;
    if (error_reg(a->player, add_error) != 0 ||
        buffer_reg(a->player, add_buffer) != 0 ||
        conflict_reg(a->player, add_conflict) != 0 ||
        seek_reg(a->player, add_seek_done) != 0 ||
        ready_reg(a->player, add_ready) != 0 ||
        prepared_reg(a->player, add_prepared) != 0) {
        s_add_adapter = NULL;
        return -1;
    }
    return 0;
}

int wmp_esplus_adapter_bind(
    wmp_esplus_adapter_t *adapter,
    wmp_esplus_api_t *api,
    void *player,
    const wmp_esplus_callbacks_t *callbacks,
    void *context)
{
    if (!adapter || !api || !api->library || !player || !callbacks ||
        (api->selected_family != WMP_ESPLUS_FAMILY_SET &&
         api->selected_family != WMP_ESPLUS_FAMILY_ADD))
        return -1;

    memset(adapter, 0, sizeof(*adapter));
    adapter->api = api;
    adapter->player = player;
    adapter->callbacks = *callbacks;
    adapter->context = context;

    if ((api->selected_family == WMP_ESPLUS_FAMILY_SET ? bind_set(adapter) :
         bind_add(adapter)) != 0) {
        if (s_add_adapter == adapter) s_add_adapter = NULL;
        memset(adapter, 0, sizeof(*adapter));
        return -1;
    }
    adapter->callbacks_registered = 1;
    return 0;
}

int wmp_esplus_adapter_set_video_info(
    wmp_esplus_adapter_t *adapter,
    const wmp_esplus_video_info_t *info)
{
    if (!adapter || !adapter->api || !adapter->player || !info) return -1;
    if (adapter->api->selected_family == WMP_ESPLUS_FAMILY_SET) {
        set_stream_fn fn = (set_stream_fn)adapter->api->set_video_stream_info;
        return fn ? fn(adapter->player, info) : -1;
    }
    if (adapter->api->selected_family == WMP_ESPLUS_FAMILY_ADD) {
        add_stream_fn fn = (add_stream_fn)adapter->api->add_video_stream_info;
        return fn ? fn(adapter->player, info) : -1;
    }
    return -1;
}

int wmp_esplus_adapter_set_audio_info(
    wmp_esplus_adapter_t *adapter,
    const wmp_esplus_audio_info_t *info)
{
    if (!adapter || !adapter->api || !adapter->player || !info) return -1;
    if (adapter->api->selected_family == WMP_ESPLUS_FAMILY_SET) {
        set_stream_fn fn = (set_stream_fn)adapter->api->set_audio_stream_info;
        return fn ? fn(adapter->player, info) : -1;
    }
    if (adapter->api->selected_family == WMP_ESPLUS_FAMILY_ADD) {
        add_stream_fn fn = (add_stream_fn)adapter->api->add_audio_stream_info;
        return fn ? fn(adapter->player, info) : -1;
    }
    return -1;
}

uint64_t wmp_esplus_ns_to_ms(uint64_t ns)
{
    return ns / 1000000ull;
}

wmp_esplus_submit_result_t wmp_esplus_normalize_submit_result(
    wmp_esplus_family_e family, int raw_status)
{
    wmp_esplus_submit_result_t result;
    result.raw_status = raw_status;
    result.status = WMP_ESPLUS_SUBMIT_UNCLASSIFIED;
    if (family == WMP_ESPLUS_FAMILY_ADD && raw_status == 4)
        result.status = WMP_ESPLUS_SUBMIT_SUCCESS;
    return result;
}

wmp_esplus_submit_result_t wmp_esplus_adapter_submit(
    wmp_esplus_adapter_t *adapter,
    const wmp_esplus_packet_t *packet)
{
    wmp_esplus_submit_result_t result = {WMP_ESPLUS_SUBMIT_UNCLASSIFIED, INT_MIN};
    submit_fn fn;

    if (!adapter || !adapter->api || !adapter->player || !packet) {
        result.status = WMP_ESPLUS_SUBMIT_REJECTED;
        return result;
    }
    fn = (submit_fn)adapter->api->submit_packet;
    if (!fn) {
        result.status = WMP_ESPLUS_SUBMIT_REJECTED;
        return result;
    }

    if (adapter->api->selected_family == WMP_ESPLUS_FAMILY_SET) {
        set_packet_t native_packet;
        native_packet.type = (uint32_t)packet->type;
        native_packet.buffer = packet->data;
        native_packet.buffer_size = packet->size;
        native_packet.pts_ms = wmp_esplus_ns_to_ms(packet->pts_ns);
        native_packet.duration_ms = wmp_esplus_ns_to_ms(packet->duration_ns);
        native_packet.matroska_color_info = packet->matroska_color_info;
        native_packet.hdr10p_metadata_size = packet->hdr_metadata_size;
        native_packet.hdr10p_metadata = packet->hdr_metadata;
        result.raw_status = fn(adapter->player, &native_packet);
        /* SET submit_status enumerator values have not yet been verified. */
        result = wmp_esplus_normalize_submit_result(WMP_ESPLUS_FAMILY_SET,
                                                     result.raw_status);
        return result;
    }

    if (adapter->api->selected_family == WMP_ESPLUS_FAMILY_ADD) {
        add_packet_t native_packet;
        native_packet.type = (uint32_t)packet->type;
        native_packet.buffer = packet->data;
        native_packet.buffer_size = packet->size;
        native_packet.pts_ns = packet->pts_ns;
        native_packet.duration_ns = packet->duration_ns;
        result.raw_status = fn(adapter->player, &native_packet);
        /* ADD SUCCESS=4 is confirmed; other values remain unclassified. */
        result = wmp_esplus_normalize_submit_result(WMP_ESPLUS_FAMILY_ADD,
                                                     result.raw_status);
        return result;
    }

    result.status = WMP_ESPLUS_SUBMIT_REJECTED;
    return result;
}

void wmp_esplus_adapter_unbind(wmp_esplus_adapter_t *adapter)
{
    if (!adapter) return;
    if (s_add_adapter == adapter) s_add_adapter = NULL;
    memset(adapter, 0, sizeof(*adapter));
}
