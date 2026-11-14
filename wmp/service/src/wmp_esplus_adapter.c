#include "wmp_esplus_adapter.h"

#include <dlfcn.h>
#include <limits.h>
#include <stdio.h>
#include <string.h>
#include "../../engine/mlclient/mltrace.h"

#define ABI_LOG(...) MLT("[esplus-abi] " __VA_ARGS__)

/* SET (public 0.0.3): timestamps in milliseconds; extended HDR packet. */
typedef struct {
    uint32_t type;
    const void *buffer;
    uint32_t buffer_size;
    uint64_t pts_ms;
    uint64_t duration_ms;
    const void *matroska_color_info;
    uint32_t hdr10p_metadata_size;
    const void *hdr10p_metadata;
    uint8_t reserved[64];
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
    uint32_t max_width;
    uint32_t max_height;
    uint32_t framerate_num;
    uint32_t framerate_den;
    uint8_t reserved[64];
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
    uint8_t reserved[64];
} set_audio_info_t;

typedef struct {
    const void *codec_data;
    uint32_t codec_data_length;
    uint32_t mime_type;
    uint32_t bitrate;
    uint32_t channels;
    uint32_t sample_rate;
} add_audio_info_t;

typedef int (*set_stream_fn)(void *, const void *);
typedef int (*add_stream_fn)(void *, const void *);
typedef int (*submit_fn)(void *, const void *);

typedef void (*set_error_cb)(int, void *);
typedef void (*set_buffer_cb)(uint32_t, uint32_t, void *);
typedef void (*set_void_cb)(void *);
typedef void (*set_stream_cb)(uint32_t, void *);
typedef void (*set_prepared_cb)(bool, void *);

typedef void (*add_error_cb)(int);
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

typedef char assert_set_packet_arm32[(sizeof(void *) != 4 || sizeof(set_packet_t) == 112) ? 1 : -1];
typedef char assert_set_pts_offset_arm32[(sizeof(void *) != 4 || offsetof(set_packet_t, pts_ms) == 16) ? 1 : -1];
typedef char assert_set_hdr_offset_arm32[(sizeof(void *) != 4 || offsetof(set_packet_t, hdr10p_metadata) == 40) ? 1 : -1];
typedef char assert_set_packet_reserved_offset_arm32[(sizeof(void *) != 4 || offsetof(set_packet_t, reserved) == 44) ? 1 : -1];
typedef char assert_add_packet_arm32[(sizeof(void *) != 4 || sizeof(add_packet_t) == 32) ? 1 : -1];
typedef char assert_add_pts_offset_arm32[(sizeof(void *) != 4 || offsetof(add_packet_t, pts_ns) == 16) ? 1 : -1];
typedef char assert_set_video_arm32[(sizeof(void *) != 4 || sizeof(set_video_info_t) == 100) ? 1 : -1];
typedef char assert_set_audio_arm32[(sizeof(void *) != 4 || sizeof(set_audio_info_t) == 88) ? 1 : -1];
typedef char assert_add_audio_arm32[(sizeof(void *) != 4 || sizeof(add_audio_info_t) == 24) ? 1 : -1];
typedef char assert_add_video_arm32[(sizeof(void *) != 4 || sizeof(add_video_info_t) == 36) ? 1 : -1];

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

static void emit_error(int value, void *context)
{
    wmp_esplus_adapter_t *a = context;
    ABI_LOG("callback error ENTER value=0x%08x (%d) context=%p adapter=%p player=%p", (unsigned)value, value, context, (void *)a, a ? a->player : NULL);
    if (a && a->callbacks.error) {
        ABI_LOG("callback error FORWARD user_context=%p", a->context);
        a->callbacks.error(value, a->context);
    } else ABI_LOG("callback error DROPPED adapter_or_handler_missing");
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
    ABI_LOG("callback ready_to_prepare ENTER raw_stream=%u context=%p adapter=%p player=%p", stream, context, (void *)a, a ? a->player : NULL);
    if (a && a->callbacks.ready_to_prepare) {
        ABI_LOG("callback ready_to_prepare FORWARD mapped_stream=%d user_context=%p", (int)neutral_stream_type(stream), a->context);
        a->callbacks.ready_to_prepare(neutral_stream_type(stream), a->context);
    } else ABI_LOG("callback ready_to_prepare DROPPED adapter_or_handler_missing");
}
static void emit_prepared(bool success, void *context)
{
    wmp_esplus_adapter_t *a = context;
    ABI_LOG("callback prepare_async_done ENTER raw_success=%d context=%p adapter=%p player=%p", success ? 1 : 0, context, (void *)a, a ? a->player : NULL);
    if (a && a->callbacks.prepare_async_done) {
        ABI_LOG("callback prepare_async_done FORWARD bool=%d user_context=%p", success ? 1 : 0, a->context);
        a->callbacks.prepare_async_done(success != 0, a->context);
    } else ABI_LOG("callback prepare_async_done DROPPED adapter_or_handler_missing");
}

static void add_error(int value) { if (s_add_adapter) emit_error(value, s_add_adapter); }
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
    int rc;

    ABI_LOG("bind_set ENTER player=%p adapter=%p context=%p", a->player, (void *)a, a->context);
    ABI_LOG("bind_set symbols error=%p buffer=%p conflict=%p eos=%p seek=%p ready=%p prepared=%p",
            (void *)error_reg, (void *)buffer_reg, (void *)conflict_reg, (void *)eos_reg,
            (void *)seek_reg, (void *)ready_reg, (void *)prepared_reg);
    if (!error_reg || !buffer_reg || !conflict_reg || !seek_reg || !ready_reg || !prepared_reg) {
        ABI_LOG("bind_set FAIL missing_required_setter");
        return -1;
    }
    ABI_LOG("setter error_cb ENTER address=%p player=%p", (void *)error_reg, a->player);
    rc = error_reg(a->player, emit_error, a);
    ABI_LOG("setter error_cb RETURN rc=%d", rc);
    if (rc < 0) return -1;
    ABI_LOG("setter buffer_status_cb ENTER address=%p player=%p", (void *)buffer_reg, a->player);
    rc = buffer_reg(a->player, emit_buffer, a);
    ABI_LOG("setter buffer_status_cb RETURN rc=%d", rc);
    if (rc < 0) return -1;
    ABI_LOG("setter resource_conflicted_cb ENTER address=%p player=%p", (void *)conflict_reg, a->player);
    rc = conflict_reg(a->player, emit_conflict, a);
    ABI_LOG("setter resource_conflicted_cb RETURN rc=%d", rc);
    if (rc < 0) return -1;
    ABI_LOG("setter seek_done_cb ENTER address=%p player=%p", (void *)seek_reg, a->player);
    rc = seek_reg(a->player, emit_seek_done, a);
    ABI_LOG("setter seek_done_cb RETURN rc=%d", rc);
    if (rc < 0) return -1;
    ABI_LOG("setter ready_to_prepare_cb ENTER address=%p player=%p", (void *)ready_reg, a->player);
    rc = ready_reg(a->player, emit_ready, a);
    ABI_LOG("setter ready_to_prepare_cb RETURN rc=%d", rc);
    if (rc < 0) return -1;
    ABI_LOG("setter prepare_async_done_cb ENTER address=%p player=%p", (void *)prepared_reg, a->player);
    rc = prepared_reg(a->player, emit_prepared, a);
    ABI_LOG("setter prepare_async_done_cb RETURN rc=%d", rc);
    if (rc < 0) return -1;
    if (eos_reg) {
        ABI_LOG("setter eos_cb ENTER address=%p player=%p", (void *)eos_reg, a->player);
        rc = eos_reg(a->player, emit_eos, a);
        ABI_LOG("setter eos_cb RETURN rc=%d", rc);
        if (rc < 0) return -1;
    }
    ABI_LOG("bind_set COMPLETE");
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


static wmp_esplus_call_result_t stream_local_error(wmp_esplus_call_status_e status);

void *wmp_esplus_adapter_create(wmp_esplus_api_t *api)
{
    typedef void *(*create_fn)(void);
    create_fn fn;
    if (!api || !api->library || !api->create ||
        (api->selected_family != WMP_ESPLUS_FAMILY_SET &&
         api->selected_family != WMP_ESPLUS_FAMILY_ADD))
        return NULL;
    fn = (create_fn)api->create;
    return fn();
}

wmp_esplus_call_result_t wmp_esplus_normalize_lifecycle_result(
    wmp_esplus_family_e family, int raw_status)
{
    wmp_esplus_call_result_t result = { WMP_ESPLUS_CALL_UNCLASSIFIED, raw_status };
    if (family == WMP_ESPLUS_FAMILY_SET) {
        /* Target-TV ARM32 SET wrappers: 0 success, -22 invalid, -38 unavailable/failure. */
        if (raw_status == 0) result.status = WMP_ESPLUS_CALL_SUCCESS;
        else if (raw_status == -22 || raw_status == -38)
            result.status = WMP_ESPLUS_CALL_NATIVE_FAILURE;
    } else if (family == WMP_ESPLUS_FAMILY_ADD) {
        /* Legacy ADD API returns C++ bool encoded as int. */
        if (raw_status == 1) result.status = WMP_ESPLUS_CALL_SUCCESS;
        else if (raw_status == 0) result.status = WMP_ESPLUS_CALL_NATIVE_FAILURE;
    }
    return result;
}

static wmp_esplus_call_result_t lifecycle_call(
    wmp_esplus_adapter_t *adapter, const char *name, void *address)
{
    typedef int (*lifecycle_fn)(void *);
    lifecycle_fn fn = (lifecycle_fn)address;
    int raw;
    /* ABI_LOG may compile to a no-op when native traces are disabled. */
    (void)name;
    if (!adapter || !adapter->api || !adapter->player) {
        ABI_LOG("lifecycle %s REJECT invalid_adapter=%p player=%p", name, (void *)adapter, adapter ? adapter->player : NULL);
        return stream_local_error(WMP_ESPLUS_CALL_INVALID_ARGUMENT);
    }
    if (!fn) {
        ABI_LOG("lifecycle %s REJECT missing_function", name);
        return stream_local_error(WMP_ESPLUS_CALL_MISSING_FUNCTION);
    }
    ABI_LOG("lifecycle %s ENTER address=%p player=%p family=%d", name, address, adapter->player, (int)adapter->api->selected_family);
    raw = fn(adapter->player);
    ABI_LOG("lifecycle %s RETURN raw=%d", name, raw);
    return wmp_esplus_normalize_lifecycle_result(adapter->api->selected_family, raw);
}

wmp_esplus_call_result_t wmp_esplus_adapter_open(wmp_esplus_adapter_t *a)
{ return lifecycle_call(a, "open", a && a->api ? a->api->open : NULL); }
wmp_esplus_call_result_t wmp_esplus_adapter_close(wmp_esplus_adapter_t *a)
{ return lifecycle_call(a, "close", a && a->api ? a->api->close : NULL); }
wmp_esplus_call_result_t wmp_esplus_adapter_prepare_async(wmp_esplus_adapter_t *a)
{ return lifecycle_call(a, "prepare_async", a && a->api ? a->api->prepare_async : NULL); }
wmp_esplus_call_result_t wmp_esplus_adapter_start(wmp_esplus_adapter_t *a)
{ return lifecycle_call(a, "start", a && a->api ? a->api->start : NULL); }
wmp_esplus_call_result_t wmp_esplus_adapter_stop(wmp_esplus_adapter_t *a)
{ return lifecycle_call(a, "stop", a && a->api ? a->api->stop : NULL); }

wmp_esplus_call_result_t wmp_esplus_adapter_set_ecore_display(
    wmp_esplus_adapter_t *adapter, int display_type, void *display,
    int x, int y, int width, int height)
{
    typedef int (*display_fn)(void *, int, void *, int, int, int, int);
    display_fn fn;
    if (!adapter || !adapter->api || !adapter->player)
        return stream_local_error(WMP_ESPLUS_CALL_INVALID_ARGUMENT);
    fn = (display_fn)adapter->api->set_ecore_display;
    if (!fn) return stream_local_error(WMP_ESPLUS_CALL_MISSING_FUNCTION);
    return wmp_esplus_normalize_lifecycle_result(
        adapter->api->selected_family,
        fn(adapter->player, display_type, display, x, y, width, height));
}

wmp_esplus_call_result_t wmp_esplus_adapter_set_display_mode(
    wmp_esplus_adapter_t *adapter, int display_mode)
{
    typedef int (*display_mode_fn)(void *, int);
    display_mode_fn fn;
    if (!adapter || !adapter->api || !adapter->player)
        return stream_local_error(WMP_ESPLUS_CALL_INVALID_ARGUMENT);
    fn = (display_mode_fn)adapter->api->set_display_mode;
    if (!fn) return stream_local_error(WMP_ESPLUS_CALL_MISSING_FUNCTION);
    return wmp_esplus_normalize_lifecycle_result(
        adapter->api->selected_family, fn(adapter->player, display_mode));
}

int wmp_esplus_adapter_has_playing_time(const wmp_esplus_adapter_t *adapter)
{
    return adapter && adapter->api && adapter->player &&
           adapter->api->selected_family == WMP_ESPLUS_FAMILY_ADD &&
           adapter->api->get_playing_time != NULL;
}

int wmp_esplus_adapter_get_playing_time(
    wmp_esplus_adapter_t *adapter, uint64_t *playing_time_ms)
{
    typedef int (*playing_time_fn)(void *, uint64_t *);
    playing_time_fn fn;
    if (!playing_time_ms || !wmp_esplus_adapter_has_playing_time(adapter))
        return 0;
    fn = (playing_time_fn)adapter->api->get_playing_time;
    return fn(adapter->player, playing_time_ms) != 0;
}

typedef const char *(*error_string_fn)(int);

const char *wmp_esplus_adapter_get_error_string(
    const wmp_esplus_adapter_t *adapter, int error)
{
    error_string_fn fn;
    if (!adapter || !adapter->api || !adapter->api->get_error_string)
        return NULL;
    fn = (error_string_fn)adapter->api->get_error_string;
    return fn(error);
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

    ABI_LOG("adapter_bind ENTER family=%d api=%p player=%p adapter=%p user_context=%p callbacks=%p",
            (int)api->selected_family, (void *)api, player, (void *)adapter, context, (const void *)callbacks);
    if ((api->selected_family == WMP_ESPLUS_FAMILY_SET ? bind_set(adapter) :
         bind_add(adapter)) != 0) {
        ABI_LOG("adapter_bind FAIL family=%d (partial registrations may exist)", (int)api->selected_family);
        /* Some callbacks may already be installed: retain this storage until player close. */
        return -1;
    }
    adapter->callbacks_registered = 1;
    ABI_LOG("adapter_bind COMPLETE family=%d callbacks_registered=1", (int)api->selected_family);
    return 0;
}

int wmp_esplus_map_video_mime(
    wmp_esplus_family_e family, wmp_esplus_video_mime_e mime, uint32_t *native_mime)
{
    if (!native_mime || (family != WMP_ESPLUS_FAMILY_SET && family != WMP_ESPLUS_FAMILY_ADD))
        return -1;
    if (mime < WMP_ESPLUS_VIDEO_MIME_UNKNOWN || mime > WMP_ESPLUS_VIDEO_MIME_AV1)
        return -1;
    if (mime == WMP_ESPLUS_VIDEO_MIME_UNKNOWN)
        return -1;

    /*
     * OmegaTube's independently declared Samsung SET API enum documents the
     * native order as UNKNOWN, H263, H264, HEVC, MPEG1, MPEG2, MPEG4, VP8,
     * VP9, WMV3, AV1, MJPEG. The legacy ADD family uses the same numeric
     * values for the codecs represented here. Do not shift SET values.
     */
    *native_mime = (uint32_t)mime;
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
        /* Legacy ADD inserts DTS before OPUS; PCM_S16LE follows OPUS. */
        case WMP_ESPLUS_AUDIO_MIME_PCM_S16LE: *native_mime = 9; return 0;
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
        /* Samsung SET AudioMimeType order places PCM_S16LE after OPUS. */
        case WMP_ESPLUS_AUDIO_MIME_PCM_S16LE: *native_mime = 8; return 0;
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
        native_info.max_width = info->max_width ? info->max_width : info->width;
        native_info.max_height = info->max_height ? info->max_height : info->height;
        native_info.framerate_num = info->frame_rate_num ? info->frame_rate_num : info->frame_rate;
        native_info.framerate_den = info->frame_rate_den ? info->frame_rate_den : 1u;
        memset(native_info.reserved, 0, sizeof(native_info.reserved));
        ABI_LOG("video_info SET ENTER fn=%p player=%p info=%p size=%lu mime=%u %ux%u stride=%u slice=%u fps=%u interlaced=%u",
                (void *)fn, adapter->player, (void *)&native_info, (unsigned long)sizeof(native_info),
                mime, info->width, info->height, info->stride, info->slice_height, info->frame_rate, info->interlaced);
        {
            int raw = fn(adapter->player, &native_info);
            ABI_LOG("video_info SET RETURN raw=%d", raw);
            return wmp_esplus_normalize_stream_result(WMP_ESPLUS_FAMILY_SET, raw);
        }
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
    if (!adapter || !adapter->api || !adapter->player || !info ||
        wmp_esplus_map_audio_mime(adapter->api->selected_family, info->mime_type, &mime) != 0)
        return stream_local_error(WMP_ESPLUS_CALL_INVALID_ARGUMENT);

    if (adapter->api->selected_family == WMP_ESPLUS_FAMILY_SET) {
        set_audio_info_t native_info;
        set_stream_fn fn = (set_stream_fn)adapter->api->set_audio_stream_info;
        if (!fn) return stream_local_error(WMP_ESPLUS_CALL_MISSING_FUNCTION);
        memset(&native_info, 0, sizeof(native_info));
        native_info.codec_data = info->codec_data;
        native_info.codec_data_length = info->codec_data_size;
        native_info.mime_type = mime;
        native_info.bitrate = info->bitrate;
        native_info.channels = info->channels;
        native_info.sample_rate = info->sample_rate;
        ABI_LOG("audio_info SET ENTER fn=%p player=%p info=%p size=%lu mime=%u bitrate=%u channels=%u rate=%u",
                (void *)fn, adapter->player, (void *)&native_info, (unsigned long)sizeof(native_info),
                mime, info->bitrate, info->channels, info->sample_rate);
        {
            int raw = fn(adapter->player, &native_info);
            ABI_LOG("audio_info SET RETURN raw=%d", raw);
            return wmp_esplus_normalize_stream_result(WMP_ESPLUS_FAMILY_SET, raw);
        }
    }
    if (adapter->api->selected_family == WMP_ESPLUS_FAMILY_ADD) {
        add_audio_info_t native_info;
        add_stream_fn fn = (add_stream_fn)adapter->api->add_audio_stream_info;
        if (!fn) return stream_local_error(WMP_ESPLUS_CALL_MISSING_FUNCTION);
        native_info.codec_data = info->codec_data;
        native_info.codec_data_length = info->codec_data_size;
        native_info.mime_type = mime;
        native_info.bitrate = info->bitrate;
        native_info.channels = info->channels;
        native_info.sample_rate = info->sample_rate;
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
        memset(&native_packet, 0, sizeof(native_packet));
        native_packet.type = type;
        native_packet.buffer = packet->data;
        native_packet.buffer_size = packet->size;
        native_packet.pts_ms = wmp_esplus_ns_to_ms(packet->pts_ns);
        native_packet.duration_ms = wmp_esplus_ns_to_ms(packet->duration_ns);
        native_packet.matroska_color_info = (const void *)(uintptr_t)packet->matroska_color_info;
        native_packet.hdr10p_metadata_size = packet->hdr_metadata_size;
        native_packet.hdr10p_metadata = packet->hdr_metadata;
        {
            int raw = fn(adapter->player, &native_packet);
            result = wmp_esplus_normalize_submit_result(WMP_ESPLUS_FAMILY_SET, raw);
            if (raw != 4 && result.status != WMP_ESPLUS_SUBMIT_BACKPRESSURE)
                ABI_LOG("submit SET failed raw=%d normalized=%d", raw, (int)result.status);
        }
        return result;
    }
    if (adapter->api->selected_family == WMP_ESPLUS_FAMILY_ADD) {
        add_packet_t native_packet;
        native_packet.type = type;
        native_packet.buffer = packet->data;
        native_packet.buffer_size = packet->size;
        native_packet.pts_ns = packet->pts_ns;
        native_packet.duration_ns = packet->duration_ns;
        {
            int raw = fn(adapter->player, &native_packet);
            result = wmp_esplus_normalize_submit_result(WMP_ESPLUS_FAMILY_ADD, raw);
            if (raw != 4 && result.status != WMP_ESPLUS_SUBMIT_BACKPRESSURE)
                ABI_LOG("submit ADD failed raw=%d normalized=%d", raw, (int)result.status);
        }
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
