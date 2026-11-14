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
    result = esplus_set_video_info(&info);
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
    esplus_stream_clock_reset();
    {
        int prepare_rc = esplus_prepare();
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
    int rc = VidDecSetup_(videoFormat, width, height, redrawRate, context, drFlags);
    if (rc != 0) esplus_close();   /* Common C skips cleanup when setup fails. */
    VLOG("setup complete rc=%d\n", rc);
    mldiag_video_setup(videoFormat, width, height, redrawRate, rc);
    return rc;
}

static int VidDecSubmit(PDECODE_UNIT du)
{
    wmp_esplus_packet_t packet;
    wmp_esplus_submit_result_t result;
    size_t offset = 0;
    int64_t pts_ms;

    ++s_video_units;
    if (du->frameType == FRAME_TYPE_IDR) ++s_video_idrs;
    if (s_video_units <= 10 || s_video_units % 60 == 0 || du->frameType == FRAME_TYPE_IDR) {
        VLOG("decode unit #%u type=%s bytes=%d pts_us=%llu idr_count=%u\n",
             s_video_units, du->frameType == FRAME_TYPE_IDR ? "IDR" : "frame",
             du->fullLength, (unsigned long long)du->presentationTimeUs, s_video_idrs);
    }
    mldiag_video_du(du->frameType == FRAME_TYPE_IDR);

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

    result = esplus_submit(&packet);
    /* Preserve the upstream brief retry policy for native queue backpressure. */
    for (int i = 0; result.status == WMP_ESPLUS_SUBMIT_BACKPRESSURE && i < 3; ++i) {
        usleep(2000);
        result = esplus_submit(&packet);
    }
    if (s_video_units <= 10 || s_video_units % 60 == 0 ||
        result.status != WMP_ESPLUS_SUBMIT_SUCCESS) {
        VLOG("video submit #%u result status=%d raw=%d size=%u pts_ns=%llu\n",
             s_video_units, (int)result.status, result.raw_status,
             packet.size, (unsigned long long)packet.pts_ns);
    }
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
