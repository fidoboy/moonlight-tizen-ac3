/*
 * audio_opus.c - Moonlight Common C audio renderer backed by the shared
 * native ESPlus player.
 *
 * Normal audio is decoded from the received Opus multistream packets to
 * interleaved signed 16-bit PCM and submitted as PCM_S16LE. AC-3/E-AC-3 is
 * submitted unchanged only when Common C confirms successful negotiation.
 */
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#include "Limelight.h"
#include "opus_multistream.h"
#include "esplus_player.h"
#include "mltrace.h"

#define ALOG(...) fprintf(stderr, "[audio] " __VA_ARGS__)

#define DOLBY_SAMPLE_RATE 48000u
#define DOLBY_FRAME_DURATION_NS 32000000ull

static OpusMSDecoder *s_opus_decoder;
static opus_int16 *s_pcm_buffer;
static size_t s_pcm_capacity_samples;
static int s_sample_rate = 48000;
static int s_channel_count;
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

static void opus_decoder_destroy(void)
{
    if (s_opus_decoder) {
        opus_multistream_decoder_destroy(s_opus_decoder);
        s_opus_decoder = NULL;
    }
    free(s_pcm_buffer);
    s_pcm_buffer = NULL;
    s_pcm_capacity_samples = 0;
}

static int opus_decoder_create(const POPUS_MULTISTREAM_CONFIGURATION config)
{
    int error = OPUS_OK;
    size_t required_samples;

    if (!config || config->sampleRate <= 0 ||
        config->channelCount <= 0 ||
        config->channelCount > AUDIO_CONFIGURATION_MAX_CHANNEL_COUNT ||
        config->samplesPerFrame <= 0 ||
        config->streams <= 0 || config->coupledStreams < 0) {
        MLT("Opus decoder init -> -1 (invalid multistream configuration)");
        return -1;
    }

    required_samples = (size_t)config->samplesPerFrame *
                       (size_t)config->channelCount;
    if (required_samples > SIZE_MAX / sizeof(*s_pcm_buffer))
        return -1;

    s_opus_decoder = opus_multistream_decoder_create(
        config->sampleRate, config->channelCount,
        config->streams, config->coupledStreams,
        config->mapping, &error);
    if (!s_opus_decoder || error != OPUS_OK) {
        MLT("opus_multistream_decoder_create failed: %d", error);
        opus_decoder_destroy();
        return -1;
    }

    s_pcm_buffer = malloc(required_samples * sizeof(*s_pcm_buffer));
    if (!s_pcm_buffer) {
        MLT("Opus PCM buffer allocation failed (%lu samples)",
            (unsigned long)required_samples);
        opus_decoder_destroy();
        return -1;
    }

    s_pcm_capacity_samples = required_samples;
    s_sample_rate = config->sampleRate;
    s_channel_count = config->channelCount;
    s_samples_per_frame = config->samplesPerFrame;
    return 0;
}

static int ar_init(int audioConfig, const POPUS_MULTISTREAM_CONFIGURATION config,
                   void *context, int flags)
{
    wmp_esplus_audio_info_t info;
    int result;
    int channel_count = 0;

    (void)context;
    (void)flags;
    opus_decoder_destroy();
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
        s_channel_count = channel_count;
        s_samples_per_frame = 1536;
        MLT("Dolby audio init codec=%s channels=%d rate=%u",
            s_dolby_mime == WMP_ESPLUS_AUDIO_MIME_EAC3 ? "E-AC-3" : "AC-3",
            channel_count, DOLBY_SAMPLE_RATE);
    } else {
        if (opus_decoder_create(config) != 0) {
            ALOG("Opus decoder initialization failed\n");
            return -1;
        }
        MLT("Opus decoder ready: %d Hz, %d channels, %d samples/frame",
            s_sample_rate, s_channel_count, s_samples_per_frame);
    }

    if (!esplus_create_open()) {
        ALOG("player create failed\n");
        MLT("audio init -> -1 (player)");
        opus_decoder_destroy();
        return -1;
    }

    memset(&info, 0, sizeof(info));
    if (s_dolby) {
        /* AC-3/E-AC-3 carry their codec configuration in-band. */
        info.codec_data = NULL;
        info.codec_data_size = 0;
        info.mime_type = s_dolby_mime;
        info.channels = (uint32_t)channel_count;
        info.sample_rate = DOLBY_SAMPLE_RATE;
        info.bitrate = 0;
    } else {
        /* ESPlus receives decoded PCM, never the original Opus payload. */
        info.codec_data = NULL;
        info.codec_data_size = 0;
        info.mime_type = WMP_ESPLUS_AUDIO_MIME_PCM_S16LE;
        info.channels = (uint32_t)s_channel_count;
        info.sample_rate = (uint32_t)s_sample_rate;
        info.bitrate = 0;
    }

    result = esplus_set_audio_info(&info);
    MLT("audio stream registration %s -> %d",
        s_dolby ? (s_dolby_mime == WMP_ESPLUS_AUDIO_MIME_EAC3 ? "eac3" : "ac3")
                : "pcm_s16le",
        result);
    if (result != 0) {
        ALOG("audio stream registration failed: %d\n", result);
        opus_decoder_destroy();
        return -1;
    }

    if (s_dolby) {
        ALOG("init %s passthrough, %d channels at %u Hz\n",
             s_dolby_mime == WMP_ESPLUS_AUDIO_MIME_EAC3 ? "E-AC-3" : "AC-3",
             channel_count, DOLBY_SAMPLE_RATE);
    } else {
        ALOG("init Opus decoder -> PCM_S16LE, %d Hz, %d channels, %d samples/frame\n",
             s_sample_rate, s_channel_count, s_samples_per_frame);
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
    opus_decoder_destroy();
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
    int decoded_samples;
    size_t pcm_samples;
    size_t pcm_bytes;

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

    if (!s_opus_decoder || !s_pcm_buffer || s_channel_count <= 0 ||
        s_sample_rate <= 0)
        return;

    duration_ns = (uint64_t)s_samples_per_frame * 1000000000ull /
                  (uint64_t)s_sample_rate;

    /* A NULL/empty packet is passed to libopus as PLC, matching the EMSS path. */
    decoded_samples = opus_multistream_decode(
        s_opus_decoder, (const unsigned char *)data, len,
        s_pcm_buffer, s_samples_per_frame, 0);
    if (decoded_samples <= 0) {
        MLT("Opus decode rejected packet: %d", decoded_samples);
        s_pts_ns += duration_ns;
        return;
    }

    pcm_samples = (size_t)decoded_samples * (size_t)s_channel_count;
    if (pcm_samples > s_pcm_capacity_samples ||
        pcm_samples > UINT32_MAX / sizeof(*s_pcm_buffer)) {
        MLT("Opus decoder returned oversized PCM frame: %d samples x %d channels",
            decoded_samples, s_channel_count);
        s_pts_ns += duration_ns;
        return;
    }
    pcm_bytes = pcm_samples * sizeof(*s_pcm_buffer);
    duration_ns = (uint64_t)decoded_samples * 1000000000ull /
                  (uint64_t)s_sample_rate;

    memset(&packet, 0, sizeof(packet));
    packet.type = WMP_ESPLUS_STREAM_AUDIO;
    packet.data = s_pcm_buffer;
    packet.size = (uint32_t)pcm_bytes;
    packet.pts_ns = s_pts_ns;
    packet.duration_ns = duration_ns;

    result = esplus_submit(&packet);
    if (result.status == WMP_ESPLUS_SUBMIT_SUCCESS) {
        __atomic_store_n(&s_audio_codec_active, 1, __ATOMIC_RELEASE);
    } else if (result.status != WMP_ESPLUS_SUBMIT_BACKPRESSURE &&
               result.status != WMP_ESPLUS_SUBMIT_NOT_PREPARED) {
        ALOG("submit PCM audio failed status=%d raw=%d\n",
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
