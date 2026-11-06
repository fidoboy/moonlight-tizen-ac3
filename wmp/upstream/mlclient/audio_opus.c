/*
 * audio_opus.c - Moonlight Common C audio renderer backed by the shared
 * native ESPlus player. Opus packets are submitted without a client decode
 * step; ESPlus decodes the audio/x-opus stream internally.
 *
 * codec_data is a standard RFC 7845 OpusHead built from the negotiated
 * OPUS_MULTISTREAM_CONFIGURATION.
 */
#include <stdint.h>
#include <stdio.h>
#include <string.h>

#include "Limelight.h"
#include "esplus_player.h"
#include "mltrace.h"

#define ALOG(...) fprintf(stderr, "[audio] " __VA_ARGS__)

static uint8_t s_opushead[32];
static int s_opushead_len;
static int s_sample_rate = 48000;
static int s_samples_per_frame = 240;
static uint64_t s_pts_ns;

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

    (void)audioConfig;
    (void)context;
    (void)flags;
    MLT("audio init cfg=0x%x %d Hz %d ch streams=%d",
        audioConfig, config ? config->sampleRate : 0,
        config ? config->channelCount : 0, config ? config->streams : 0);
    if (!config || config->channelCount <= 0 || config->channelCount > 8 ||
        config->sampleRate <= 0) {
        MLT("audio init -> -1 (config)");
        return -1;
    }

    s_sample_rate = config->sampleRate;
    s_samples_per_frame = config->samplesPerFrame;
    s_pts_ns = 0;
    s_opushead_len = build_opushead(s_opushead, config);

    if (!esplus_create_open()) {
        ALOG("player create failed\n");
        MLT("audio init -> -1 (player)");
        return -1;
    }

    memset(&info, 0, sizeof(info));
    info.codec_data = s_opushead;
    info.codec_data_size = (uint32_t)s_opushead_len;
    info.mime_type = WMP_ESPLUS_AUDIO_MIME_OPUS;
    info.channels = (uint32_t)config->channelCount;
    info.sample_rate = (uint32_t)config->sampleRate;
    result = esplus_set_audio_info(&info);
    MLT("audio stream registration opus -> %d", result);
    if (result != 0) {
        ALOG("audio stream registration failed: %d\n", result);
        return -1;
    }

    ALOG("init %d Hz, %d ch, %d samples/frame, OpusHead %d B\n",
         config->sampleRate, config->channelCount,
         config->samplesPerFrame, s_opushead_len);
    return 0;
}

static void ar_start(void) {}
static void ar_stop(void) {}
static void ar_cleanup(void) {}

static void ar_decodePlay(char *data, int len)
{
    wmp_esplus_packet_t packet;
    wmp_esplus_submit_result_t result;
    uint64_t duration_ns;

    if (len <= 0) return;
    duration_ns = (uint64_t)s_samples_per_frame * 1000000000ull /
                  (uint64_t)s_sample_rate;
    memset(&packet, 0, sizeof(packet));
    packet.type = WMP_ESPLUS_STREAM_AUDIO;
    packet.data = data;
    packet.size = (uint32_t)len;
    packet.pts_ns = s_pts_ns;
    packet.duration_ns = duration_ns;

    result = esplus_submit(&packet);
    if (result.status != WMP_ESPLUS_SUBMIT_SUCCESS &&
        result.status != WMP_ESPLUS_SUBMIT_BACKPRESSURE &&
        result.status != WMP_ESPLUS_SUBMIT_NOT_PREPARED) {
        ALOG("submit audio failed status=%d raw=%d\n",
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
}
