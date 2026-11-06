#include "wmp_esplus_adapter.h"

#include <dlfcn.h>
#include <limits.h>
#include <string.h>

/* SET (public 0.0.3): timestamps in milliseconds; extended HDR packet. */
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

/* ADD (legacy TV50): compact packet; timestamps in nanoseconds. */
typedef struct {
    uint32_t type;
    const void *buffer;
    uint32_t buffer_size;
    uint64_t pts_ns;
    uint64_t duration_ns;
} add_packet_t;

/* Stream layouts intentionally differ by field meaning, not just by name. */
typedef struct {
    const void *codec_data;
    uint32_t codec_data_length;
    uint32_t mime_type;
    uint32_t width;
    uint32_t height;
    uint32_t stride;
    uint32_t slice_height;
    uint32_t frame_rate;
    uint32_t interlaced;
} set_video_info_t;

typedef struct {
    const void *codec_data;
    uint32_t codec_data_length;
    uint32_t mime_type;
    uint32_t width;
    uint32_t height;
    uint32_t max_width;
    uint32_t max_height;
    uint32_t framerate_num;
    uint32_t framerate_den;
} add_video_info_t;

typedef struct {
    const void *codec_data;
    uint32_t codec_data_length;
    uint32_t mime_type;
    uint32_t bitrate;
    uint32_t channels;
    uint32_t sample_rate;
} native_audio_info_t;

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
typedef void (*add_error_reg_fn)(void *, add_error_cb);
typedef void (*add_buffer_reg_fn)(void *, add_buffer_cb);
typedef void (*add_void_reg_fn)(void *, add_void_cb);
typedef void (*add_stream_reg_fn)(void *, add_stream_cb);
typedef void (*add_prepared_reg_fn)(void *, add_prepared_cb);

typedef char assert_set_packet_arm32[(sizeof(void *) != 4 || sizeof(set_packet_t) == 48) ? 1 : -1];
typedef char assert_set_pts_offset_arm32[(sizeof(void *) != 4 || offsetof(set_packet_t, pts_ms) == 16) ? 1 : -1];
typedef char assert_set_hdr_offset_arm32[(sizeof(void *) != 4 || offsetof(set_packet_t, hdr10p_metadata) == 40) ? 1 : -1];
typedef char assert_add_packet_arm32[(sizeof(void *) != 4 || sizeof(add_packet_t) == 32) ? 1 : -1];
typedef char assert_add_pts_offset_arm32[(sizeof(void *) != 4 || offsetof(add_packet_t, pts_ns) == 16) ? 1 : -1];
typedef char assert_set_video_arm32[(sizeof(void *) != 4 || sizeof(set_video_info_t) == 36) ? 1 : -1];
typedef char assert_add_video_arm32[(sizeof(void *) != 4 || sizeof(add_video_info_t) == 36) ? 1 : -1];
typedef char assert_audio_arm32[(sizeof(void *) != 4 || sizeof(native_audio_info_t) == 24) ? 1 : -1];

static wmp_esplus_adapter_t *s_add_adapter;

static wmp_esplus_stream_e neutral_stream_type(uint32_t stream)
{
    switch (stream) {
    case 0: return WMP_ESPLUS_STREAM_AUDIO;
    case 1: return WMP_ESPLUS_STREAM_VIDEO;
    default: return WMP_ESPLUS_STREAM_UNKNOWN;
    }
}

static wmp_esplus_buffer_status_e neutral_buffer_status(uint32_t status)
{
    switch (status) {
    case 0: return WMP_ESPLUS_BUFFER_STATUS_UNDERRUN;
    case 1: return WMP_ESPLUS_BUFFER_STATUS_OVERRUN;
    default: return WMP_ESPLUS_BUFFER_STATUS_UNKNOWN;
    }
}

static void emit_error(uint32_t value, void *context)
{
    wmp_esplus_adapter_t *a = context;
    if (a && a->callbacks.error) a->callbacks.error(value, a->context);
}
static void emit_buffer(uint32_t stream, uint32_t status, void *context)
{
    wmp_esplus_adapter_t *a = context;
    if (a && a->callbacks.buffer_status)
        a->callbacks.buffer_status(neutral_stream_type(stream),
                                   neutral_buffer_status(status), a->context);
}
static void emit_conflict(void *context)
{
    wmp_esplus_adapter_t *a = context;
    if (a && a->callbacks.resource_conflicted)
        a->callbacks.resource_conflicted(a->context);
}
static void emit_eos(void *context)
{
    wmp_esplus_adapter_t *a = context;
    if (a && a->callbacks.eos) a->callbacks.eos(a->context);
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
        a->callbacks.ready_to_prepare(neutral_stream_type(stream), a->context);
}
static void emit_prepared(bool success, void *context)
{
    wmp_esplus_adapter_t *a = context;
    if (a && a->callbacks.prepare_async_done)
        a->callbacks.prepare_async_done(success != 0, a->context);
}

static void add_error(uint32_t value) { if (s_add_adapter) emit_error(value, s_add_adapter); }
static void add_buffer(uint32_t stream, uint32_t status)
{ if (s_add_adapter) emit_buffer(stream, status, s_add_adapter); }
static void add_conflict(void) { if (s_add_adapter) emit_conflict(s_add_adapter); }
static void add_eos(void) { if (s_add_adapter) emit_eos(s_add_adapter); }
static void add_seek_done(void) { if (s_add_adapter) emit_seek_done(s_add_adapter); }
static void add_ready(uint32_t stream) { if (s_add_adapter) emit_ready(stream, s_add_adapter); }
static void add_prepared(int success) { if (s_add_adapter) emit_prepared(success, s_add_adapter); }

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
    set_void_reg_fn eos_reg = (set_void_reg_fn)symbol(a, "esplusplayer_set_eos_cb");
    set_void_reg_fn seek_reg = (set_void_reg_fn)symbol(a, "esplusplayer_set_seek_done_cb");
    set_stream_reg_fn ready_reg = (set_stream_reg_fn)symbol(a, "esplusplayer_set_ready_to_prepare_cb");
    set_prepared_reg_fn prepared_reg = (set_prepared_reg_fn)symbol(a, "esplusplayer_set_prepare_async_done_cb");

    if (!error_reg || !buffer_reg || !conflict_reg || !seek_reg || !ready_reg || !prepared_reg)
        return -1;
    if (error_reg(a->player, emit_error, a) < 0 ||
        buffer_reg(a->player, emit_buffer, a) < 0 ||
        conflict_reg(a->player, emit_conflict, a) < 0 ||
        seek_reg(a->player, emit_seek_done, a) < 0 ||
        ready_reg(a->player, emit_ready, a) < 0 ||
        prepared_reg(a->player, emit_prepared, a) < 0)
        return -1;
    if (eos_reg && eos_reg(a->player, emit_eos, a) < 0) return -1;
    return 0;
}

static int bind_add(wmp_esplus_adapter_t *a)
{
    add_error_reg_fn error_reg = (add_error_reg_fn)symbol(a, "esplusplayer_set_error_cb");
    add_buffer_reg_fn buffer_reg = (add_buffer_reg_fn)symbol(a, "esplusplayer_set_buffer_status_cb");
    add_void_reg_fn conflict_reg = (add_void_reg_fn)symbol(a, "esplusplayer_set_resource_conflicted_cb");
    add_void_reg_fn eos_reg = (add_void_reg_fn)symbol(a, "esplusplayer_set_eos_cb");
    add_void_reg_fn seek_reg = (add_void_reg_fn)symbol(a, "esplusplayer_set_seek_done_cb");
    add_stream_reg_fn ready_reg = (add_stream_reg_fn)symbol(a, "esplusplayer_set_ready_to_prepare_cb");
    add_prepared_reg_fn prepared_reg = (add_prepared_reg_fn)symbol(a, "esplusplayer_set_prepare_async_done_cb");

    if (s_add_adapter && s_add_adapter != a) return -1;
    if (!error_reg || !buffer_reg || !conflict_reg || !seek_reg || !ready_reg || !prepared_reg)
        return -1;
    s_add_adapter = a;
    error_reg(a->player, add_error);
    buffer_reg(a->player, add_buffer);
    conflict_reg(a->player, add_conflict);
    seek_reg(a->player, add_seek_done);
    ready_reg(a->player, add_ready);
    prepared_reg(a->player, add_prepared);
    if (eos_reg) eos_reg(a->player, add_eos);
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
        /* Some callbacks may already be installed: retain this storage until player close. */
        return -1;
    }
    adapter->callbacks_registered = 1;
    return 0;
}

int wmp_esplus_map_video_mime(
    wmp_esplus_family_e family, wmp_esplus_video_mime_e mime, uint32_t *native_mime)
{
    if (!native_mime || (family != WMP_ESPLUS_FAMILY_SET && family != WMP_ESPLUS_FAMILY_ADD))
        return -1;
    if (mime < WMP_ESPLUS_VIDEO_MIME_UNKNOWN || mime > WMP_ESPLUS_VIDEO_MIME_WMV3)
        return -1;
    if (family == WMP_ESPLUS_FAMILY_ADD) {
        /* Legacy header explicitly includes UNKNOWN=0 before H263=1. */
        *native_mime = (uint32_t)mime;
        return 0;
    }
    /* Samsung's SET VideoMimeType enum starts at H263=0; it has no UNKNOWN. */
    if (mime == WMP_ESPLUS_VIDEO_MIME_UNKNOWN) return -1;
    *native_mime = (uint32_t)mime - 1u;
    return 0;
}

int wmp_esplus_map_audio_mime(
    wmp_esplus_family_e family, wmp_esplus_audio_mime_e mime, uint32_t *native_mime)
{
    if (!native_mime) return -1;
    if (family == WMP_ESPLUS_FAMILY_ADD) {
        switch (mime) {
        case WMP_ESPLUS_AUDIO_MIME_UNKNOWN: *native_mime = 0; return 0;
        case WMP_ESPLUS_AUDIO_MIME_AAC: *native_mime = 1; return 0;
        case WMP_ESPLUS_AUDIO_MIME_MP2: *native_mime = 2; return 0;
        case WMP_ESPLUS_AUDIO_MIME_MP3: *native_mime = 3; return 0;
        case WMP_ESPLUS_AUDIO_MIME_AC3: *native_mime = 4; return 0;
        case WMP_ESPLUS_AUDIO_MIME_EAC3: *native_mime = 5; return 0;
        case WMP_ESPLUS_AUDIO_MIME_VORBIS: *native_mime = 6; return 0;
        case WMP_ESPLUS_AUDIO_MIME_DTS: *native_mime = 7; return 0;
        case WMP_ESPLUS_AUDIO_MIME_OPUS: *native_mime = 8; return 0;
        default: return -1;
        }
    }
    if (family == WMP_ESPLUS_FAMILY_SET) {
        switch (mime) {
        case WMP_ESPLUS_AUDIO_MIME_UNKNOWN: *native_mime = 0; return 0;
        case WMP_ESPLUS_AUDIO_MIME_AAC: *native_mime = 1; return 0;
        case WMP_ESPLUS_AUDIO_MIME_MP2: *native_mime = 2; return 0;
        case WMP_ESPLUS_AUDIO_MIME_MP3: *native_mime = 3; return 0;
        case WMP_ESPLUS_AUDIO_MIME_AC3: *native_mime = 4; return 0;
        case WMP_ESPLUS_AUDIO_MIME_EAC3: *native_mime = 5; return 0;
        case WMP_ESPLUS_AUDIO_MIME_VORBIS: *native_mime = 6; return 0;
        case WMP_ESPLUS_AUDIO_MIME_OPUS: *native_mime = 7; return 0;
        /* DTS occupies slot 7 only in ADD; SET does not define it. */
        default: return -1;
        }
    }
    return -1;
}

wmp_esplus_call_result_t wmp_esplus_normalize_stream_result(
    wmp_esplus_family_e family, int raw_status)
{
    wmp_esplus_call_result_t result = { WMP_ESPLUS_CALL_UNCLASSIFIED, raw_status };
    if (family == WMP_ESPLUS_FAMILY_SET) {
        /*
         * The extracted x86-64 and target-TV ARM32 libesplusplayer builds
         * agree: 0 means SetStream succeeded, -38 means it failed or is
         * unavailable, and -22 denotes null arguments. Keep unknown values
         * unclassified rather than guessing.
         */
        if (raw_status == 0) result.status = WMP_ESPLUS_CALL_SUCCESS;
        else if (raw_status == -22 || raw_status == -38)
            result.status = WMP_ESPLUS_CALL_NATIVE_FAILURE;
    } else if (family == WMP_ESPLUS_FAMILY_ADD) {
        if (raw_status == 1) result.status = WMP_ESPLUS_CALL_SUCCESS;
        else if (raw_status == 0) result.status = WMP_ESPLUS_CALL_NATIVE_FAILURE;
    }
    return result;
}

static wmp_esplus_call_result_t stream_local_error(wmp_esplus_call_status_e status)
{
    wmp_esplus_call_result_t result = { status, INT_MIN };
    return result;
}

wmp_esplus_call_result_t wmp_esplus_adapter_set_video_info(
    wmp_esplus_adapter_t *adapter, const wmp_esplus_video_info_t *info)
{
    uint32_t mime;
    if (!adapter || !adapter->api || !adapter->player || !info ||
        wmp_esplus_map_video_mime(adapter->api->selected_family, info->mime_type, &mime) != 0)
        return stream_local_error(WMP_ESPLUS_CALL_INVALID_ARGUMENT);

    if (adapter->api->selected_family == WMP_ESPLUS_FAMILY_SET) {
        set_video_info_t native_info;
        set_stream_fn fn = (set_stream_fn)adapter->api->set_video_stream_info;
        if (!fn) return stream_local_error(WMP_ESPLUS_CALL_MISSING_FUNCTION);
        native_info.codec_data = info->codec_data;
        native_info.codec_data_length = info->codec_data_size;
        native_info.mime_type = mime;
        native_info.width = info->width;
        native_info.height = info->height;
        native_info.stride = info->stride;
        native_info.slice_height = info->slice_height;
        native_info.frame_rate = info->frame_rate;
        native_info.interlaced = info->interlaced;
        return wmp_esplus_normalize_stream_result(
            WMP_ESPLUS_FAMILY_SET, fn(adapter->player, &native_info));
    }
    if (adapter->api->selected_family == WMP_ESPLUS_FAMILY_ADD) {
        add_video_info_t native_info;
        add_stream_fn fn = (add_stream_fn)adapter->api->add_video_stream_info;
        if (!fn) return stream_local_error(WMP_ESPLUS_CALL_MISSING_FUNCTION);
        native_info.codec_data = info->codec_data;
        native_info.codec_data_length = info->codec_data_size;
        native_info.mime_type = mime;
        native_info.width = info->width;
        native_info.height = info->height;
        native_info.max_width = info->max_width;
        native_info.max_height = info->max_height;
        native_info.framerate_num = info->frame_rate_num;
        native_info.framerate_den = info->frame_rate_den;
        return wmp_esplus_normalize_stream_result(
            WMP_ESPLUS_FAMILY_ADD, fn(adapter->player, &native_info));
    }
    return stream_local_error(WMP_ESPLUS_CALL_INVALID_ARGUMENT);
}

wmp_esplus_call_result_t wmp_esplus_adapter_set_audio_info(
    wmp_esplus_adapter_t *adapter, const wmp_esplus_audio_info_t *info)
{
    uint32_t mime;
    native_audio_info_t native_info;
    if (!adapter || !adapter->api || !adapter->player || !info ||
        wmp_esplus_map_audio_mime(adapter->api->selected_family, info->mime_type, &mime) != 0)
        return stream_local_error(WMP_ESPLUS_CALL_INVALID_ARGUMENT);

    native_info.codec_data = info->codec_data;
    native_info.codec_data_length = info->codec_data_size;
    native_info.mime_type = mime;
    native_info.bitrate = info->bitrate;
    native_info.channels = info->channels;
    native_info.sample_rate = info->sample_rate;

    if (adapter->api->selected_family == WMP_ESPLUS_FAMILY_SET) {
        set_stream_fn fn = (set_stream_fn)adapter->api->set_audio_stream_info;
        if (!fn) return stream_local_error(WMP_ESPLUS_CALL_MISSING_FUNCTION);
        return wmp_esplus_normalize_stream_result(
            WMP_ESPLUS_FAMILY_SET, fn(adapter->player, &native_info));
    }
    if (adapter->api->selected_family == WMP_ESPLUS_FAMILY_ADD) {
        add_stream_fn fn = (add_stream_fn)adapter->api->add_audio_stream_info;
        if (!fn) return stream_local_error(WMP_ESPLUS_CALL_MISSING_FUNCTION);
        return wmp_esplus_normalize_stream_result(
            WMP_ESPLUS_FAMILY_ADD, fn(adapter->player, &native_info));
    }
    return stream_local_error(WMP_ESPLUS_CALL_INVALID_ARGUMENT);
}

uint64_t wmp_esplus_ns_to_ms(uint64_t ns) { return ns / 1000000ull; }

wmp_esplus_submit_result_t wmp_esplus_normalize_submit_result(
    wmp_esplus_family_e family, int raw_status)
{
    wmp_esplus_submit_result_t result = { WMP_ESPLUS_SUBMIT_UNCLASSIFIED, raw_status };
    if (family != WMP_ESPLUS_FAMILY_SET && family != WMP_ESPLUS_FAMILY_ADD)
        return result;

    switch (raw_status) {
    case 0: result.status = WMP_ESPLUS_SUBMIT_NOT_PREPARED; break;
    case 1: result.status = WMP_ESPLUS_SUBMIT_INVALID_PACKET; break;
    case 2: result.status = WMP_ESPLUS_SUBMIT_OUT_OF_MEMORY; break;
    case 3: result.status = WMP_ESPLUS_SUBMIT_BACKPRESSURE; break;
    case 4: result.status = WMP_ESPLUS_SUBMIT_SUCCESS; break;
    default: break;
    }
    return result;
}

static int native_stream_type(wmp_esplus_stream_e type, uint32_t *native_type)
{
    if (!native_type) return -1;
    switch (type) {
    case WMP_ESPLUS_STREAM_AUDIO: *native_type = 0; return 0;
    case WMP_ESPLUS_STREAM_VIDEO: *native_type = 1; return 0;
    default: return -1;
    }
}

wmp_esplus_submit_result_t wmp_esplus_adapter_submit(
    wmp_esplus_adapter_t *adapter, const wmp_esplus_packet_t *packet)
{
    wmp_esplus_submit_result_t result = { WMP_ESPLUS_SUBMIT_UNCLASSIFIED, INT_MIN };
    uint32_t type;
    submit_fn fn;

    if (!adapter || !adapter->api || !adapter->player || !packet ||
        native_stream_type(packet->type, &type) != 0) {
        result.status = WMP_ESPLUS_SUBMIT_INVALID_PACKET;
        return result;
    }
    fn = (submit_fn)adapter->api->submit_packet;
    if (!fn) {
        result.status = WMP_ESPLUS_SUBMIT_REJECTED;
        return result;
    }

    if (adapter->api->selected_family == WMP_ESPLUS_FAMILY_SET) {
        set_packet_t native_packet;
        native_packet.type = type;
        native_packet.buffer = packet->data;
        native_packet.buffer_size = packet->size;
        native_packet.pts_ms = wmp_esplus_ns_to_ms(packet->pts_ns);
        native_packet.duration_ms = wmp_esplus_ns_to_ms(packet->duration_ns);
        native_packet.matroska_color_info = packet->matroska_color_info;
        native_packet.hdr10p_metadata_size = packet->hdr_metadata_size;
        native_packet.hdr10p_metadata = packet->hdr_metadata;
        result = wmp_esplus_normalize_submit_result(
            WMP_ESPLUS_FAMILY_SET, fn(adapter->player, &native_packet));
        return result;
    }
    if (adapter->api->selected_family == WMP_ESPLUS_FAMILY_ADD) {
        add_packet_t native_packet;
        native_packet.type = type;
        native_packet.buffer = packet->data;
        native_packet.buffer_size = packet->size;
        native_packet.pts_ns = packet->pts_ns;
        native_packet.duration_ns = packet->duration_ns;
        result = wmp_esplus_normalize_submit_result(
            WMP_ESPLUS_FAMILY_ADD, fn(adapter->player, &native_packet));
        return result;
    }
    result.status = WMP_ESPLUS_SUBMIT_INVALID_PACKET;
    return result;
}

/* Call only after the native player has been closed and can no longer callback. */
void wmp_esplus_adapter_unbind(wmp_esplus_adapter_t *adapter)
{
    if (!adapter) return;
    if (s_add_adapter == adapter) s_add_adapter = NULL;
    memset(adapter, 0, sizeof(*adapter));
}
