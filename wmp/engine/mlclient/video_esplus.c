/*
 * video_esplus.c - Moonlight Common C renderer backed by the shared native
 * ESPlus player. Native stream registration and packet submission go through
 * the family-neutral adapter contract.
 */
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <unistd.h>

#include "Limelight.h"
#include "esplus_stats.h"
#include "esplus_player.h"
#include "mldiag.h"
#include "mltrace.h"

#define VLOG(...) do { fprintf(stderr, "[video] " __VA_ARGS__); MLT("video: " __VA_ARGS__); } while (0)

static int s_fps;
static uint8_t *s_scratch;
static size_t s_scratch_cap;
static uint64_t s_base_pts_us;
static int s_have_base;
static uint64_t s_arrival_base_ms;
static int s_have_arrival;
static int64_t s_prev_pts_ms;
static int s_have_prev;
static uint32_t s_skip_seq;
static unsigned s_video_units;
static unsigned s_video_idrs;
static uint32_t s_last_frame_number;
static int s_have_frame_number;

static void record_host_latency(uint32_t latency)
{
    uint32_t count = __atomic_load_n(&esplus_stats.host_latency_count, __ATOMIC_RELAXED);
    uint32_t current;
    if (count == 0) {
        __atomic_store_n(&esplus_stats.host_latency_min, latency, __ATOMIC_RELAXED);
        __atomic_store_n(&esplus_stats.host_latency_max, latency, __ATOMIC_RELAXED);
    } else {
        current = __atomic_load_n(&esplus_stats.host_latency_min, __ATOMIC_RELAXED);
        while (latency < current && !__atomic_compare_exchange_n(
            &esplus_stats.host_latency_min, &current, latency, 0, __ATOMIC_RELAXED, __ATOMIC_RELAXED)) {}
        current = __atomic_load_n(&esplus_stats.host_latency_max, __ATOMIC_RELAXED);
        while (latency > current && !__atomic_compare_exchange_n(
            &esplus_stats.host_latency_max, &current, latency, 0, __ATOMIC_RELAXED, __ATOMIC_RELAXED)) {}
    }
    __atomic_fetch_add(&esplus_stats.host_latency_total, (uint64_t)latency, __ATOMIC_RELAXED);
    __atomic_fetch_add(&esplus_stats.host_latency_count, 1, __ATOMIC_RELAXED);
    __atomic_fetch_add(&esplus_stats.host_latency_window_total, (uint64_t)latency, __ATOMIC_RELAXED);
    __atomic_fetch_add(&esplus_stats.host_latency_window_count, 1, __ATOMIC_RELAXED);
    current = __atomic_load_n(&esplus_stats.host_latency_window_min, __ATOMIC_RELAXED);
    while (latency < current && !__atomic_compare_exchange_n(
        &esplus_stats.host_latency_window_min, &current, latency, 0, __ATOMIC_RELAXED, __ATOMIC_RELAXED)) {}
    current = __atomic_load_n(&esplus_stats.host_latency_window_max, __ATOMIC_RELAXED);
    while (latency > current && !__atomic_compare_exchange_n(
        &esplus_stats.host_latency_window_max, &current, latency, 0, __ATOMIC_RELAXED, __ATOMIC_RELAXED)) {}
}

static void capture_h264_level(const uint8_t *data, size_t length)
{
    size_t i;
    if (!data || length < 7) return;
    for (i = 0; i + 6 < length; ++i) {
        size_t nal;
        if (data[i] == 0 && data[i + 1] == 0 && data[i + 2] == 1)
            nal = i + 3;
        else if (i + 7 < length && data[i] == 0 && data[i + 1] == 0 &&
                 data[i + 2] == 0 && data[i + 3] == 1)
            nal = i + 4;
        else
            continue;
        if ((data[nal] & 0x1f) == 7 && nal + 3 < length) {
            __atomic_store_n(&esplus_stats.h264_level_idc, data[nal + 3], __ATOMIC_RELAXED);
            return;
        }
    }
}

static int ensure_scratch(size_t need)
{
    size_t cap;
    uint8_t *p;
    if (need <= s_scratch_cap) return 0;
    cap = s_scratch_cap ? s_scratch_cap : 65536;
    while (cap < need) cap *= 2;
    p = realloc(s_scratch, cap);
    if (!p) return -1;
    s_scratch = p;
    s_scratch_cap = cap;
    return 0;
}


/*
 * Sunshine carries mastering-display and content-light metadata separately
 * from the HEVC access units. Add the corresponding prefix SEI only when the
 * bitstream does not already contain it. This is shared by ESPlus SET and ADD.
 */
static int s_hevc_mdcv_available;
static int s_hevc_cll_available;
static int s_hevc_sei_inspection_failed;
static int s_hevc_hdr_status_logged;

static int find_annexb_start_code(const uint8_t *data, size_t length,
                                  size_t from, size_t *offset, size_t *code_len)
{
    size_t i;
    if (!data || !offset || !code_len || from >= length) return 0;
    for (i = from; i + 3 <= length; ++i) {
        if (data[i] != 0 || data[i + 1] != 0) continue;
        if (data[i + 2] == 1) {
            *offset = i; *code_len = 3; return 1;
        }
        if (i + 4 <= length && data[i + 2] == 0 && data[i + 3] == 1) {
            *offset = i; *code_len = 4; return 1;
        }
    }
    return 0;
}

static int parse_hevc_sei_nal(const uint8_t *nal, size_t length,
                              int *has_mdcv, int *has_cll)
{
    uint8_t *rbsp;
    size_t rbsp_len = 0, i, pos, payload_end;
    unsigned zero_count = 0;
    int valid = 0;
    if (!nal || length < 3) return 0;
    {
        unsigned type = (nal[0] >> 1) & 0x3f;
        if (type != 39 && type != 40) return 0;
    }
    rbsp = malloc(length);
    if (!rbsp) return 0;
    for (i = 2; i < length; ++i) {
        uint8_t value = nal[i];
        if (zero_count >= 2 && value == 3 && i + 1 < length && nal[i + 1] <= 3) {
            zero_count = 0;
            continue;
        }
        rbsp[rbsp_len++] = value;
        zero_count = value == 0 ? zero_count + 1 : 0;
    }
    /* Annex-B trailing_zero_8bits may follow rbsp_trailing_bits. */
    while (rbsp_len && rbsp[rbsp_len - 1] == 0) --rbsp_len;
    if (!rbsp_len || rbsp[rbsp_len - 1] != 0x80) goto done;
    payload_end = rbsp_len - 1;
    pos = 0;
    while (pos < payload_end) {
        size_t payload_type = 0, payload_size = 0;
        unsigned value;
        do {
            if (pos >= payload_end) goto done;
            value = rbsp[pos++];
            if (payload_type > SIZE_MAX - value) goto done;
            payload_type += value;
        } while (value == 0xff);
        do {
            if (pos >= payload_end) goto done;
            value = rbsp[pos++];
            if (payload_size > SIZE_MAX - value) goto done;
            payload_size += value;
        } while (value == 0xff);
        if (payload_size > payload_end - pos) goto done;
        if (payload_type == 137 && payload_size >= 24) *has_mdcv = 1;
        if (payload_type == 144 && payload_size >= 4) *has_cll = 1;
        pos += payload_size;
    }
    valid = pos == payload_end;
done:
    free(rbsp);
    return valid;
}

static void sei_append_value(uint8_t *out, size_t *length, size_t value)
{
    while (value >= 255) { out[(*length)++] = 0xff; value -= 255; }
    out[(*length)++] = (uint8_t)value;
}

static void sei_append_be16(uint8_t *out, size_t *length, uint16_t value)
{
    out[(*length)++] = (uint8_t)(value >> 8);
    out[(*length)++] = (uint8_t)value;
}

static void sei_append_be32(uint8_t *out, size_t *length, uint32_t value)
{
    out[(*length)++] = (uint8_t)(value >> 24);
    out[(*length)++] = (uint8_t)(value >> 16);
    out[(*length)++] = (uint8_t)(value >> 8);
    out[(*length)++] = (uint8_t)value;
}

static size_t build_hevc_hdr_sei(const SS_HDR_METADATA *metadata,
                                 int add_mdcv, int add_cll, uint8_t *nal)
{
    uint8_t rbsp[64];
    size_t rbsp_len = 0, nal_len = 0, i;
    unsigned zero_count = 0;
    static const unsigned primary_order[3] = { 1, 2, 0 };
    if (add_mdcv) {
        sei_append_value(rbsp, &rbsp_len, 137);
        sei_append_value(rbsp, &rbsp_len, 24);
        for (i = 0; i < 3; ++i) {
            unsigned index = primary_order[i];
            sei_append_be16(rbsp, &rbsp_len, metadata->displayPrimaries[index].x);
            sei_append_be16(rbsp, &rbsp_len, metadata->displayPrimaries[index].y);
        }
        sei_append_be16(rbsp, &rbsp_len, metadata->whitePoint.x);
        sei_append_be16(rbsp, &rbsp_len, metadata->whitePoint.y);
        sei_append_be32(rbsp, &rbsp_len, metadata->maxDisplayLuminance);
        sei_append_be32(rbsp, &rbsp_len, metadata->minDisplayLuminance);
    }
    if (add_cll) {
        sei_append_value(rbsp, &rbsp_len, 144);
        sei_append_value(rbsp, &rbsp_len, 4);
        sei_append_be16(rbsp, &rbsp_len, metadata->maxContentLightLevel);
        sei_append_be16(rbsp, &rbsp_len, metadata->maxFrameAverageLightLevel);
    }
    rbsp[rbsp_len++] = 0x80;
    nal[nal_len++] = 0; nal[nal_len++] = 0; nal[nal_len++] = 0; nal[nal_len++] = 1;
    nal[nal_len++] = 0x4e; nal[nal_len++] = 0x01; /* HEVC prefix SEI, temporal_id_plus1=1 */
    for (i = 0; i < rbsp_len; ++i) {
        uint8_t value = rbsp[i];
        if (zero_count >= 2 && value <= 3) {
            nal[nal_len++] = 3;
            zero_count = 0;
        }
        nal[nal_len++] = value;
        zero_count = value == 0 ? zero_count + 1 : 0;
    }
    return nal_len;
}

static int supplement_hevc_hdr_metadata(uint8_t **data, size_t *length,
                                        size_t *capacity,
                                        const SS_HDR_METADATA *metadata,
                                        int is_idr)
{
    size_t first_offset, first_len, search, first_vcl = SIZE_MAX;
    int found_mdcv = 0, found_cll = 0, add_mdcv, add_cll;
    uint8_t sei[80];
    size_t sei_len;
    if (is_idr) {
        s_hevc_mdcv_available = 0;
        s_hevc_cll_available = 0;
        s_hevc_sei_inspection_failed = 0;
    }
    if (s_hevc_sei_inspection_failed) return 0;
    if (!*length || !find_annexb_start_code(*data, *length, 0, &first_offset, &first_len)) {
        s_hevc_sei_inspection_failed = 1;
        return 0;
    }
    search = first_offset;
    while (search < *length) {
        size_t start, code_len, nal_offset, next_start, next_len, nal_end;
        int has_next;
        unsigned type;
        if (!find_annexb_start_code(*data, *length, search, &start, &code_len)) break;
        nal_offset = start + code_len;
        if (nal_offset + 2 > *length) { s_hevc_sei_inspection_failed = 1; return 0; }
        has_next = find_annexb_start_code(*data, *length, nal_offset + 2, &next_start, &next_len);
        nal_end = has_next ? next_start : *length;
        if (nal_end < nal_offset + 2) { s_hevc_sei_inspection_failed = 1; return 0; }
        type = ((*data)[nal_offset] >> 1) & 0x3f;
        if (type == 39 || type == 40) {
            if (!parse_hevc_sei_nal(*data + nal_offset, nal_end - nal_offset,
                                    &found_mdcv, &found_cll)) {
                s_hevc_sei_inspection_failed = 1;
                return 0;
            }
        } else if (type <= 31 && first_vcl == SIZE_MAX) {
            first_vcl = start;
        }
        if (!has_next) break;
        search = next_start;
    }
    s_hevc_mdcv_available |= found_mdcv;
    s_hevc_cll_available |= found_cll;
    add_mdcv = !s_hevc_mdcv_available &&
               metadata->displayPrimaries[0].x != 0 &&
               metadata->maxDisplayLuminance != 0;
    add_cll = !s_hevc_cll_available &&
              (metadata->maxContentLightLevel != 0 ||
               metadata->maxFrameAverageLightLevel != 0);
    if ((!add_mdcv && !add_cll) || first_vcl == SIZE_MAX) return 0;
    sei_len = build_hevc_hdr_sei(metadata, add_mdcv, add_cll, sei);
    if (*length > SIZE_MAX - sei_len || ensure_scratch(*length + sei_len) != 0) return -1;
    *data = s_scratch;
    memmove(*data + first_vcl + sei_len, *data + first_vcl, *length - first_vcl);
    memcpy(*data + first_vcl, sei, sei_len);
    *length += sei_len;
    if (add_mdcv) s_hevc_mdcv_available = 1;
    if (add_cll) s_hevc_cll_available = 1;
    return (add_mdcv ? 1 : 0) | (add_cll ? 2 : 0);
}


static int VidDecSetup_(int videoFormat, int width, int height,
                        int redrawRate, void *context, int drFlags)
{
    wmp_esplus_video_mime_e mime;
    wmp_esplus_video_info_t info;
    int result;

    (void)context;
    (void)drFlags;
    VLOG("setup begin fmt=0x%x %dx%d@%d\n", videoFormat, width, height, redrawRate);
    MLT("video setup fmt=0x%x %dx%d@%d", videoFormat, width, height, redrawRate);
    s_fps = redrawRate > 0 ? redrawRate : 60;
    s_hevc_mdcv_available = 0;
    s_hevc_cll_available = 0;
    s_hevc_sei_inspection_failed = 0;
    s_hevc_hdr_status_logged = 0;
    __atomic_store_n(&esplus_stats.video_format, (uint32_t)videoFormat, __ATOMIC_RELAXED);
    __atomic_store_n(&esplus_stats.video_width, (uint32_t)width, __ATOMIC_RELAXED);
    __atomic_store_n(&esplus_stats.video_height, (uint32_t)height, __ATOMIC_RELAXED);
    __atomic_store_n(&esplus_stats.video_fps, (uint32_t)s_fps, __ATOMIC_RELAXED);
    __atomic_store_n(&esplus_stats.h264_level_idc, 0, __ATOMIC_RELAXED);
    __atomic_store_n(&esplus_stats.video_bytes_received, 0, __ATOMIC_RELAXED);
    __atomic_store_n(&esplus_stats.audio_codec, 0, __ATOMIC_RELAXED);
    __atomic_store_n(&esplus_stats.audio_channels, 0, __ATOMIC_RELAXED);
    __atomic_store_n(&esplus_stats.audio_sample_rate, 0, __ATOMIC_RELAXED);
    __atomic_store_n(&esplus_stats.audio_bytes_received, 0, __ATOMIC_RELAXED);
    __atomic_store_n(&esplus_stats.video_frames_received, 0, __ATOMIC_RELAXED);
    __atomic_store_n(&esplus_stats.video_frames_decoded, 0, __ATOMIC_RELAXED);
    __atomic_store_n(&esplus_stats.video_frames_rendered, 0, __ATOMIC_RELAXED);
    __atomic_store_n(&esplus_stats.video_total_frames, 0, __ATOMIC_RELAXED);
    __atomic_store_n(&esplus_stats.video_network_dropped_frames, 0, __ATOMIC_RELAXED);
    __atomic_store_n(&esplus_stats.total_reassembly_us, 0, __ATOMIC_RELAXED);
    __atomic_store_n(&esplus_stats.total_decode_us, 0, __ATOMIC_RELAXED);
    __atomic_store_n(&esplus_stats.total_render_us, 0, __ATOMIC_RELAXED);
    __atomic_store_n(&esplus_stats.host_latency_total, 0, __ATOMIC_RELAXED);
    __atomic_store_n(&esplus_stats.host_latency_count, 0, __ATOMIC_RELAXED);
    __atomic_store_n(&esplus_stats.host_latency_min, UINT32_MAX, __ATOMIC_RELAXED);
    __atomic_store_n(&esplus_stats.host_latency_max, 0, __ATOMIC_RELAXED);
    __atomic_store_n(&esplus_stats.host_latency_window_total, 0, __ATOMIC_RELAXED);
    __atomic_store_n(&esplus_stats.host_latency_window_count, 0, __ATOMIC_RELAXED);
    __atomic_store_n(&esplus_stats.host_latency_window_min, UINT32_MAX, __ATOMIC_RELAXED);
    __atomic_store_n(&esplus_stats.host_latency_window_max, 0, __ATOMIC_RELAXED);

    if (videoFormat & VIDEO_FORMAT_MASK_H264)
        mime = WMP_ESPLUS_VIDEO_MIME_H264;
    else if (videoFormat & VIDEO_FORMAT_MASK_H265)
        mime = WMP_ESPLUS_VIDEO_MIME_HEVC;
    else if (videoFormat & VIDEO_FORMAT_MASK_AV1)
        mime = WMP_ESPLUS_VIDEO_MIME_AV1;
    else {
        VLOG("unsupported videoFormat 0x%x\n", videoFormat);
        MLT("video setup -> -1 (format)");
        return -1;
    }

    VLOG("selected ESPlus video mime=%d; opening native player\n", (int)mime);
    if (!esplus_create_open()) {
        VLOG("setup failed: esplus_create_open returned false\n");
        MLT("video setup -> -1 (player)");
        return -1;
    }
    VLOG("creating video window for stream %dx%d\n", width, height);
    result = esplus_set_window(width, height);
    VLOG("video window result=%d\n", result);
    mldiag_player("win", result);
    if (result != 0) {
        MLT("video setup -> -1 (window)");
        return -1;
    }

    memset(&info, 0, sizeof(info));
    info.mime_type = mime;
    info.width = (uint32_t)width;
    info.height = (uint32_t)height;
    /* ADD fields */
    info.max_width = (uint32_t)width;
    info.max_height = (uint32_t)height;
    info.frame_rate_num = (uint32_t)s_fps;
    info.frame_rate_den = 1;
    /* SET fields */
    info.stride = (uint32_t)width;
    info.slice_height = (uint32_t)height;
    info.frame_rate = (uint32_t)s_fps;
    info.interlaced = 0;

    VLOG("registering video stream mime=%d size=%ux%u fps=%u\n",
         (int)mime, info.width, info.height, info.frame_rate);
    MLT_DIAG("VidDecSetup calling esplus_set_video_info");
    result = esplus_set_video_info(&info);
    MLT_DIAG("VidDecSetup esplus_set_video_info RETURN result=%d", result);
    VLOG("video stream registration result=%d\n", result);
    MLT("video stream registration mime=%d -> %d", (int)mime, result);
    if (result != 0) {
        VLOG("video stream registration failed: %d\n", result);
        return -1;
    }

    VLOG("setup %dx%d@%d fmt=0x%x\n", width, height, s_fps, videoFormat);
    return 0;
}

static void VidDecStart(void)
{
    MLT_DIAG("VidDecStart ENTER");
    VLOG("decoder start: requesting ESPlus prepare\n");
    MLT("video start");
    s_base_pts_us = 0;
    s_have_base = 0;
    s_arrival_base_ms = 0;
    s_have_arrival = 0;
    s_prev_pts_ms = 0;
    s_have_prev = 0;
    s_skip_seq = esplus_sample_seq() - 1;
    s_video_units = 0;
    s_video_idrs = 0;
    s_last_frame_number = 0;
    s_have_frame_number = 0;
    esplus_stream_clock_reset();
    {
        int prepare_rc = esplus_prepare();
        MLT_DIAG("VidDecStart esplus_prepare RETURN rc=%d", prepare_rc);
        VLOG("ESPlus prepare request returned %d\n", prepare_rc);
    }
}

static void VidDecStop(void) {}

static void VidDecCleanup(void)
{
    VLOG("video renderer cleanup\n");
    MLT("video cleanup");
    esplus_close();
    free(s_scratch);
    s_scratch = NULL;
    s_scratch_cap = 0;
}

static int VidDecSetup(int videoFormat, int width, int height,
                       int redrawRate, void *context, int drFlags)
{
    MLT_DIAG("VidDecSetup callback ENTER fmt=0x%x %dx%d@%d", videoFormat, width, height, redrawRate);
    int rc = VidDecSetup_(videoFormat, width, height, redrawRate, context, drFlags);
    MLT_DIAG("VidDecSetup_ RETURN rc=%d", rc);
    if (rc != 0) esplus_close();   /* Common C skips cleanup when setup fails. */
    VLOG("setup complete rc=%d\n", rc);
    mldiag_video_setup(videoFormat, width, height, redrawRate, rc);
    MLT_DIAG("VidDecSetup callback EXIT rc=%d", rc);
    return rc;
}

static int VidDecSubmit(PDECODE_UNIT du)
{
    wmp_esplus_packet_t packet;
    wmp_esplus_submit_result_t result;
    size_t offset = 0;
    int64_t pts_ms;

    ++s_video_units;
    if (s_video_units == 1)
        MLT_DIAG("VidDecSubmit FIRST decode unit ENTER type=%d bytes=%d frame=%u",
                 du->frameType, du->fullLength, du->frameNumber);
    const int collect_stats = __atomic_load_n(&esplus_performance_stats_enabled, __ATOMIC_ACQUIRE);
    if (collect_stats) {
        __atomic_fetch_add(&esplus_stats.video_frames_received, 1, __ATOMIC_RELAXED);
        __atomic_fetch_add(&esplus_stats.video_total_frames, 1, __ATOMIC_RELAXED);
    }
    if (!s_have_frame_number) {
        s_last_frame_number = du->frameNumber;
        s_have_frame_number = 1;
    } else if (du->frameNumber > s_last_frame_number) {
        uint32_t missing = du->frameNumber - s_last_frame_number - 1;
        if (missing) {
            if (collect_stats) {
                __atomic_fetch_add(&esplus_stats.video_network_dropped_frames, missing, __ATOMIC_RELAXED);
                __atomic_fetch_add(&esplus_stats.video_total_frames, missing, __ATOMIC_RELAXED);
            }
        }
        s_last_frame_number = du->frameNumber;
    } else {
        /* A reset or wrap starts a new frame-number baseline. */
        s_last_frame_number = du->frameNumber;
    }
    if (du->frameType == FRAME_TYPE_IDR) ++s_video_idrs;
    if (s_video_units <= 10 || s_video_units % 60 == 0 || du->frameType == FRAME_TYPE_IDR) {
        VLOG("decode unit #%u type=%s bytes=%d pts_us=%llu idr_count=%u\n",
             s_video_units, du->frameType == FRAME_TYPE_IDR ? "IDR" : "frame",
             du->fullLength, (unsigned long long)du->presentationTimeUs, s_video_idrs);
    }
    mldiag_video_du(du->frameType == FRAME_TYPE_IDR);

    /* A flushing seek invalidates queued reference frames. Reject one following
     * non-IDR so Common C requests a fresh keyframe from the host. */
    if (esplus_take_need_idr() && du->frameType != FRAME_TYPE_IDR)
        return DR_NEED_IDR;

    /* Optional latency frame shedding; it does not control player/session state. */
    if (esplus_cfg.drop_after_ms > 0 &&
        esplus_stats.depth_ms > esplus_cfg.drop_after_ms &&
        du->frameType != FRAME_TYPE_IDR &&
        esplus_sample_seq() != s_skip_seq) {
        s_skip_seq = esplus_sample_seq();
        __atomic_fetch_add(&esplus_stats.dropped_late, 1, __ATOMIC_RELAXED);
        return DR_NEED_IDR;
    }

    if (ensure_scratch((size_t)du->fullLength)) return DR_NEED_IDR;
    for (PLENTRY entry = du->bufferList; entry; entry = entry->next) {
        memcpy(s_scratch + offset, entry->data, (size_t)entry->length);
        offset += (size_t)entry->length;
    }

    /*
     * Sunshine's HDR metadata arrives on the control channel. Some hosts omit
     * MDCV/CLL SEI from the HEVC bitstream, so supplement only missing messages.
     * The resulting access unit is identical for the SET and legacy ADD APIs.
     */
    if (du->hdrActive &&
        (__atomic_load_n(&esplus_stats.video_format, __ATOMIC_RELAXED) & VIDEO_FORMAT_H265_MAIN10)) {
        SS_HDR_METADATA hdr_metadata;
        if (LiGetHdrMetadata(&hdr_metadata)) {
            int hdr_result = supplement_hevc_hdr_metadata(
                &s_scratch, &offset, &s_scratch_cap, &hdr_metadata,
                du->frameType == FRAME_TYPE_IDR);
            if (hdr_result < 0) {
                VLOG("HDR metadata fallback: unable to grow HEVC access unit; requesting IDR\n");
                return DR_NEED_IDR;
            }
            if (!s_hevc_hdr_status_logged) {
                VLOG("HDR metadata fallback: MDCV=%s, CLL=%s, inserted=%s%s\n",
                     s_hevc_mdcv_available ? "available" : "missing",
                     s_hevc_cll_available ? "available" : "missing",
                     (hdr_result & 1) ? "MDCV" : "",
                     (hdr_result & 2) ? (hdr_result & 1 ? "+CLL" : "CLL") : "");
                s_hevc_hdr_status_logged = 1;
            }
        }
    }
    if (collect_stats)
        __atomic_fetch_add(&esplus_stats.video_bytes_received, (uint64_t)offset, __ATOMIC_RELAXED);
    if (collect_stats &&
        (__atomic_load_n(&esplus_stats.video_format, __ATOMIC_RELAXED) & VIDEO_FORMAT_MASK_H264))
        capture_h264_level(s_scratch, offset);
    if (collect_stats) {
        uint64_t decode_end_us = LiGetMicroseconds();
        if (du->enqueueTimeUs >= du->receiveTimeUs)
            __atomic_fetch_add(&esplus_stats.total_reassembly_us,
                du->enqueueTimeUs - du->receiveTimeUs, __ATOMIC_RELAXED);
        if (decode_end_us >= du->enqueueTimeUs)
            __atomic_fetch_add(&esplus_stats.total_decode_us,
                decode_end_us - du->enqueueTimeUs, __ATOMIC_RELAXED);
        __atomic_fetch_add(&esplus_stats.video_frames_decoded, 1, __ATOMIC_RELAXED);
        if (du->frameHostProcessingLatency > 0)
            record_host_latency((uint32_t)du->frameHostProcessingLatency);
    }

    if (!s_have_base) {
        /*
         * Video PTS starts at zero on its first unit. The shared wall-clock
         * origin is started by esplus_submit() only after native start()
         * succeeds, immediately before this first unit is submitted.
         */
        s_base_pts_us = du->presentationTimeUs;
        s_have_base = 1;
    }
    if (esplus_cfg.latency_mode == ESPLUS_LAT_ARRIVAL) {
        uint64_t now = esplus_mono_ms();
        if (!s_have_arrival) {
            s_arrival_base_ms = now;
            s_have_arrival = 1;
        }
        pts_ms = (int64_t)(now - s_arrival_base_ms);
    } else {
        /* Common C timestamps are microseconds; ESPlus timing is milliseconds. */
        pts_ms = (int64_t)((du->presentationTimeUs - s_base_pts_us) / 1000ull);
        if (esplus_cfg.latency_mode == ESPLUS_LAT_NUDGE)
            pts_ms -= esplus_correction_ms();
    }
    if (pts_ms < 0) pts_ms = 0;
    if (s_have_prev && pts_ms <= s_prev_pts_ms) pts_ms = s_prev_pts_ms + 1;
    s_prev_pts_ms = pts_ms;
    s_have_prev = 1;

    memset(&packet, 0, sizeof(packet));
    packet.type = WMP_ESPLUS_STREAM_VIDEO;
    packet.data = s_scratch;
    packet.size = (uint32_t)offset;
    packet.pts_ns = (uint64_t)pts_ms * 1000000ull;
    packet.duration_ns = 1000000000ull / (uint64_t)s_fps;

    {
        uint64_t submit_start_us = LiGetMicroseconds();
        result = esplus_submit(&packet);
        /* Preserve the upstream brief retry policy for native queue backpressure. */
        for (int i = 0; result.status == WMP_ESPLUS_SUBMIT_BACKPRESSURE && i < 3; ++i) {
            usleep(2000);
            result = esplus_submit(&packet);
        }
        if (result.status == WMP_ESPLUS_SUBMIT_SUCCESS) {
            uint64_t submit_end_us = LiGetMicroseconds();
            if (collect_stats) __atomic_fetch_add(&esplus_stats.video_frames_rendered, 1, __ATOMIC_RELAXED);
            if (collect_stats && submit_end_us >= submit_start_us)
                __atomic_fetch_add(&esplus_stats.total_render_us,
                    submit_end_us - submit_start_us, __ATOMIC_RELAXED);
        }
    }
    if (s_video_units <= 10 || s_video_units % 60 == 0 ||
        result.status != WMP_ESPLUS_SUBMIT_SUCCESS) {
        VLOG("video submit #%u result status=%d raw=%d size=%u pts_ns=%llu\n",
             s_video_units, (int)result.status, result.raw_status,
             packet.size, (unsigned long long)packet.pts_ns);
    }
    if (s_video_units == 1)
        MLT_DIAG("VidDecSubmit FIRST decode unit EXIT status=%d raw=%d",
                 (int)result.status, result.raw_status);
    if (result.status == WMP_ESPLUS_SUBMIT_BACKPRESSURE) {
        __atomic_fetch_add(&esplus_stats.dropped_full, 1, __ATOMIC_RELAXED);
        return DR_NEED_IDR;
    }
    if (result.status == WMP_ESPLUS_SUBMIT_SUCCESS ||
        result.status == WMP_ESPLUS_SUBMIT_NOT_PREPARED)
        return DR_OK;

    VLOG("submit_packet failed status=%d raw=%d\n",
         (int)result.status, result.raw_status);
    MLT("fatal video renderer rejection: ESPlus status=%d raw=%d",
        (int)result.status, result.raw_status);
    return DR_FATAL;
}

void VidEsplus_FillCallbacks(PDECODER_RENDERER_CALLBACKS cb)
{
    LiInitializeVideoCallbacks(cb);
    cb->setup = VidDecSetup;
    cb->start = VidDecStart;
    cb->stop = VidDecStop;
    cb->cleanup = VidDecCleanup;
    cb->submitDecodeUnit = VidDecSubmit;
    cb->capabilities = CAPABILITY_DIRECT_SUBMIT;
}
