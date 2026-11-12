/*
 * audio_opus.c - Moonlight Common C audio renderer backed by the shared
 * native ESPlus player.
 *
 * Opus is submitted unchanged for the normal path. When Common C confirms
 * that the host selected the optional AC-3/E-AC-3 RTSP extension, compressed
 * Dolby frames are submitted directly to ESPlus without decoding or PCM
 * conversion. Hosts that do not negotiate Dolby continue to use Opus.
 */
#include <stdint.h>
#include <stdio.h>
#include <string.h>

#include "Limelight.h"
#include "esplus_player.h"
#include "mltrace.h"

#define ALOG(...) fprintf(stderr, "[audio] " __VA_ARGS__)

#define DOLBY_SAMPLE_RATE 48000u
#define DOLBY_FRAME_DURATION_NS 32000000ull

static uint8_t s_opushead[32];
static int s_opushead_len;
static int s_sample_rate = 48000;
static int s_samples_per_frame = 240;
static uint64_t s_pts_ns;
static int s_dolby;
static int s_dolby_passthrough_enabled;
static wmp_esplus_audio_mime_e s_dolby_mime;
static volatile int s_audio_codec_candidate;
static volatile int s_audio_codec_active;

int AudEsplus_GetActiveAudioCodec(void) {
    return __atomic_load_n(&s_audio_codec_active, __ATOMIC_ACQUIRE);
}

void AudEsplus_SetDolbyPassthroughEnabled(int enabled)
{
    s_dolby_passthrough_enabled = enabled != 0;
    s_dolby = 0;
    s_pts_ns = 0;
    __atomic_store_n(&s_audio_codec_candidate, 0, __ATOMIC_RELEASE);
    __atomic_store_n(&s_audio_codec_active, 0, __ATOMIC_RELEASE);
}

/* RFC 7845 OpusHead. Returns its encoded length. */
static int build_opushead(uint8_t *out, const POPUS_MULTISTREAM_CONFIGURATION config)
{
    int n = 0;
    uint16_t preskip = 3840;
    uint32_t sample_rate = (uint32_t)config->sampleRate;

    memcpy(out, "OpusHead", 8);
    n = 8;
    out[n++] = 1;
    out[n++] = (uint8_t)config->channelCount;
    out[n++] = (uint8_t)(preskip & 0xff);
    out[n++] = (uint8_t)(preskip >> 8);
    out[n++] = (uint8_t)(sample_rate & 0xff);
    out[n++] = (uint8_t)((sample_rate >> 8) & 0xff);
    out[n++] = (uint8_t)((sample_rate >> 16) & 0xff);
    out[n++] = (uint8_t)((sample_rate >> 24) & 0xff);
    out[n++] = 0;
    out[n++] = 0;
    if (config->channelCount <= 2 && config->streams == 1) {
        out[n++] = 0;
    } else {
        out[n++] = 1;
        out[n++] = (uint8_t)config->streams;
        out[n++] = (uint8_t)config->coupledStreams;
        for (int i = 0; i < config->channelCount; ++i)
            out[n++] = config->mapping[i];
    }
    return n;
}

static int ar_init(int audioConfig, const POPUS_MULTISTREAM_CONFIGURATION config,
                   void *context, int flags)
{
    wmp_esplus_audio_info_t info;
    int result;
    int channel_count = 0;

    (void)context;
    (void)flags;
    s_pts_ns = 0;
    __atomic_store_n(&s_audio_codec_candidate, 0, __ATOMIC_RELEASE);
    __atomic_store_n(&s_audio_codec_active, 0, __ATOMIC_RELEASE);
    s_dolby = LiIsAc3AudioNegotiated() || LiIsEac3AudioNegotiated();
    s_dolby_mime = LiIsEac3AudioNegotiated()
        ? WMP_ESPLUS_AUDIO_MIME_EAC3 : WMP_ESPLUS_AUDIO_MIME_AC3;

    if (s_dolby) {
        channel_count = CHANNEL_COUNT_FROM_AUDIO_CONFIGURATION(audioConfig);
        if (channel_count <= 0 || channel_count > AUDIO_CONFIGURATION_MAX_CHANNEL_COUNT) {
            MLT("Dolby audio init -> -1 (invalid channel count %d)", channel_count);
            return -1;
        }
        s_sample_rate = DOLBY_SAMPLE_RATE;
        s_samples_per_frame = 1536;
        s_opushead_len = 0;
        MLT("Dolby audio init codec=%s channels=%d rate=%u",
            s_dolby_mime == WMP_ESPLUS_AUDIO_MIME_EAC3 ? "E-AC-3" : "AC-3",
            channel_count, DOLBY_SAMPLE_RATE);
    } else {
        MLT("Opus audio init cfg=0x%x %d Hz %d ch streams=%d",
            audioConfig, config ? config->sampleRate : 0,
            config ? config->channelCount : 0, config ? config->streams : 0);
        if (!config || config->channelCount <= 0 ||
            config->channelCount > AUDIO_CONFIGURATION_MAX_CHANNEL_COUNT ||
            config->sampleRate <= 0) {
            MLT("Opus audio init -> -1 (config)");
            return -1;
        }
        s_sample_rate = config->sampleRate;
        s_samples_per_frame = config->samplesPerFrame;
        s_opushead_len = build_opushead(s_opushead, config);
    }

    if (!esplus_create_open()) {
        ALOG("player create failed\n");
        MLT("audio init -> -1 (player)");
        return -1;
    }

    memset(&info, 0, sizeof(info));
    if (s_dolby) {
        /* AC-3/E-AC-3 carry their codec configuration in-band; no OpusHead. */
        info.codec_data = NULL;
        info.codec_data_size = 0;
        info.mime_type = s_dolby_mime;
        info.channels = (uint32_t)channel_count;
        info.sample_rate = DOLBY_SAMPLE_RATE;
        /* The Dolby bitrate is stream-dependent and is not inferred here. */
        info.bitrate = 0;
    } else {
        info.codec_data = s_opushead;
        info.codec_data_size = (uint32_t)s_opushead_len;
        info.mime_type = WMP_ESPLUS_AUDIO_MIME_OPUS;
        info.channels = (uint32_t)config->channelCount;
        info.sample_rate = (uint32_t)config->sampleRate;
    }

    result = esplus_set_audio_info(&info);
    MLT("audio stream registration %s -> %d",
        s_dolby ? (s_dolby_mime == WMP_ESPLUS_AUDIO_MIME_EAC3 ? "eac3" : "ac3") : "opus",
        result);
    if (result != 0) {
        ALOG("audio stream registration failed: %d\n", result);
        return -1;
    }

    if (s_dolby) {
        ALOG("init %s passthrough, %d channels at %u Hz\n",
             s_dolby_mime == WMP_ESPLUS_AUDIO_MIME_EAC3 ? "E-AC-3" : "AC-3",
             channel_count, DOLBY_SAMPLE_RATE);
    } else {
        ALOG("init %d Hz, %d ch, %d samples/frame, OpusHead %d B\n",
             config->sampleRate, config->channelCount,
             config->samplesPerFrame, s_opushead_len);
    }
    __atomic_store_n(&s_audio_codec_candidate,
                     s_dolby ? (s_dolby_mime == WMP_ESPLUS_AUDIO_MIME_EAC3 ? 3 : 2) : 1,
                     __ATOMIC_RELEASE);
    return 0;
}

static void ar_start(void) {}
static void ar_stop(void) {}
static void ar_cleanup(void)
{
    s_dolby = 0;
    s_pts_ns = 0;
    __atomic_store_n(&s_audio_codec_candidate, 0, __ATOMIC_RELEASE);
    __atomic_store_n(&s_audio_codec_active, 0, __ATOMIC_RELEASE);
}

static void ar_decodePlay(char *data, int len)
{
    wmp_esplus_packet_t packet;
    wmp_esplus_submit_result_t result;
    uint64_t duration_ns;

    if (s_dolby) {
        /* Common C reports a lost Dolby frame as (NULL, 0). Keep the 32 ms
         * elementary-stream clock moving even when that frame is absent. */
        duration_ns = DOLBY_FRAME_DURATION_NS;
        if (data != NULL && len > 0) {
            memset(&packet, 0, sizeof(packet));
            packet.type = WMP_ESPLUS_STREAM_AUDIO;
            packet.data = data;
            packet.size = (uint32_t)len;
            packet.pts_ns = s_pts_ns;
            packet.duration_ns = duration_ns;
            result = esplus_submit(&packet);
            if (result.status == WMP_ESPLUS_SUBMIT_SUCCESS) {
                __atomic_store_n(&s_audio_codec_active,
                                 __atomic_load_n(&s_audio_codec_candidate, __ATOMIC_ACQUIRE),
                                 __ATOMIC_RELEASE);
            }
            if (result.status != WMP_ESPLUS_SUBMIT_SUCCESS &&
                result.status != WMP_ESPLUS_SUBMIT_BACKPRESSURE &&
                result.status != WMP_ESPLUS_SUBMIT_NOT_PREPARED) {
                ALOG("submit Dolby audio failed status=%d raw=%d\n",
                     (int)result.status, result.raw_status);
            }
        }
        s_pts_ns += duration_ns;
        return;
    }

    if (len <= 0 || data == NULL) return;
    duration_ns = (uint64_t)s_samples_per_frame * 1000000000ull /
                  (uint64_t)s_sample_rate;
    memset(&packet, 0, sizeof(packet));
    packet.type = WMP_ESPLUS_STREAM_AUDIO;
    packet.data = data;
    packet.size = (uint32_t)len;
    packet.pts_ns = s_pts_ns;
    packet.duration_ns = duration_ns;

    result = esplus_submit(&packet);
    if (result.status == WMP_ESPLUS_SUBMIT_SUCCESS) {
        __atomic_store_n(&s_audio_codec_active, 1, __ATOMIC_RELEASE);
    }
    if (result.status != WMP_ESPLUS_SUBMIT_SUCCESS &&
        result.status != WMP_ESPLUS_SUBMIT_BACKPRESSURE &&
        result.status != WMP_ESPLUS_SUBMIT_NOT_PREPARED) {
        ALOG("submit Opus audio failed status=%d raw=%d\n",
             (int)result.status, result.raw_status);
    }
    s_pts_ns += duration_ns;
}

void AudEsplus_FillCallbacks(PAUDIO_RENDERER_CALLBACKS callbacks)
{
    LiInitializeAudioCallbacks(callbacks);
    callbacks->init = ar_init;
    callbacks->start = ar_start;
    callbacks->stop = ar_stop;
    callbacks->cleanup = ar_cleanup;
    callbacks->decodeAndPlaySample = ar_decodePlay;
    callbacks->capabilities = CAPABILITY_DIRECT_SUBMIT;
    if (s_dolby_passthrough_enabled)
        callbacks->capabilities |= CAPABILITY_SUPPORTS_AC3_PASSTHROUGH;
}

