/*
 * audio_opus.c - Moonlight Common C audio renderer backed by ESPlusPlayer.
 * Opus is initially submitted compressed; a Tizen decoder rejection switches
 * the stream to bundled libopus decoding and PCM_S16LE. Dolby remains passthrough.
 */
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <time.h>
#include "opus_multistream.h"

#include "Limelight.h"
#include "esplus_player.h"
#include "esplus_stats.h"
#include "mltrace.h"


#define ALOG(...) fprintf(stderr, "[audio] " __VA_ARGS__)
#define DOLBY_SAMPLE_RATE 48000u

static int s_sample_rate = 48000;
static int s_channel_count;
static int s_samples_per_frame = 240;
static unsigned char s_opus_head[21 + AUDIO_CONFIGURATION_MAX_CHANNEL_COUNT];
static uint32_t s_opus_head_size;
static int s_dolby;
static int s_dolby_passthrough_enabled;
static wmp_esplus_audio_mime_e s_dolby_mime;
static OpusMSDecoder *s_software_decoder;
static opus_int16 *s_software_pcm;
static int s_opus_fallback_available;
static int s_opus_software_active;
static int s_opus_fallback_failed;

#define OPUS_MAX_FRAME_SAMPLES 5760

static uint64_t opus_monotonic_ns(void)
{
    struct timespec ts;
    if (clock_gettime(CLOCK_MONOTONIC, &ts) != 0) return 0;
    return (uint64_t)ts.tv_sec * 1000000000ull + (uint64_t)ts.tv_nsec;
}

static void opus_software_decoder_destroy(void)
{
    if (s_software_decoder) opus_multistream_decoder_destroy(s_software_decoder);
    s_software_decoder = NULL;
    free(s_software_pcm);
    s_software_pcm = NULL;
    s_opus_fallback_available = 0;
}

static void opus_software_decoder_init(const POPUS_MULTISTREAM_CONFIGURATION config)
{
    int error = OPUS_OK;
    size_t capacity;

    opus_software_decoder_destroy();
    if (!config) return;

    s_software_decoder = opus_multistream_decoder_create(
        config->sampleRate, config->channelCount, config->streams,
        config->coupledStreams, config->mapping, &error);
    if (!s_software_decoder || error != OPUS_OK) {
        ALOG("libopus fallback decoder initialization failed: %d\n", error);
        opus_software_decoder_destroy();
        return;
    }

    capacity = (size_t)OPUS_MAX_FRAME_SAMPLES * (size_t)config->channelCount;
    s_software_pcm = malloc(capacity * sizeof(*s_software_pcm));
    if (!s_software_pcm) {
        ALOG("libopus fallback PCM buffer allocation failed\n");
        opus_software_decoder_destroy();
        return;
    }
    s_opus_fallback_available = 1;
}

static volatile int s_audio_codec_candidate;
static volatile int s_audio_codec_active;
int AudEsplus_GetActiveAudioCodec(void)
{
    return __atomic_load_n(&s_audio_codec_active, __ATOMIC_ACQUIRE);
}

/* Consumed once per one-second statistics snapshot by the native host. */
uint32_t AudEsplus_TakeOpusSoftwareDecodeAverageUs(void)
{
    uint64_t window;
    uint32_t packets;

    if (AudEsplus_GetActiveAudioCodec() != 4) {
        __atomic_store_n(&esplus_stats.opus_decode_window, 0, __ATOMIC_RELAXED);
        return 0;
    }

    window = __atomic_exchange_n(&esplus_stats.opus_decode_window, 0, __ATOMIC_ACQ_REL);
    packets = (uint32_t)window;
    return packets ? (uint32_t)((window >> 32) / packets) : 0;
}


void AudEsplus_SetDolbyPassthroughEnabled(int enabled)
{
    s_dolby_passthrough_enabled = enabled != 0;
    s_dolby = 0;
    s_opus_head_size = 0;
    opus_software_decoder_destroy();
    s_opus_software_active = 0;
    s_opus_fallback_failed = 0;
    __atomic_store_n(&esplus_stats.opus_decode_window, 0, __ATOMIC_RELAXED);
    __atomic_store_n(&s_audio_codec_candidate, 0, __ATOMIC_RELEASE);
    __atomic_store_n(&s_audio_codec_active, 0, __ATOMIC_RELEASE);
}

/* Build the standard OpusHead codec-private data, including the multistream
 * mapping supplied by Moonlight Common C for surround layouts. */
static int opus_head_build(const POPUS_MULTISTREAM_CONFIGURATION config)
{
    unsigned i;
    unsigned char family;
    size_t size;

    if (!config || config->sampleRate <= 0 || config->channelCount <= 0 ||
        config->channelCount > AUDIO_CONFIGURATION_MAX_CHANNEL_COUNT ||
        config->samplesPerFrame <= 0 || config->streams <= 0 ||
        config->coupledStreams < 0 || config->coupledStreams > config->streams ||
        config->streams + config->coupledStreams > 255)
        return -1;

    family = config->channelCount <= 2 ? 0 : 1;
    size = family == 0 ? 19u : 21u + (size_t)config->channelCount;
    if (size > sizeof(s_opus_head))
        return -1;

    memset(s_opus_head, 0, sizeof(s_opus_head));
    memcpy(s_opus_head, "OpusHead", 8);
    s_opus_head[8] = 1; /* OpusHead version */
    s_opus_head[9] = (unsigned char)config->channelCount;
    /* pre-skip and output gain are zero; input rate is informational. */
    s_opus_head[12] = (unsigned char)(config->sampleRate & 0xff);
    s_opus_head[13] = (unsigned char)((config->sampleRate >> 8) & 0xff);
    s_opus_head[14] = (unsigned char)((config->sampleRate >> 16) & 0xff);
    s_opus_head[15] = (unsigned char)((config->sampleRate >> 24) & 0xff);
    s_opus_head[18] = family;

    if (family == 0) {
        if ((config->channelCount == 1 &&
             (config->streams != 1 || config->coupledStreams != 0)) ||
            (config->channelCount == 2 &&
             (config->streams != 1 || config->coupledStreams != 1)))
            return -1;
    } else {
        s_opus_head[19] = (unsigned char)config->streams;
        s_opus_head[20] = (unsigned char)config->coupledStreams;
        for (i = 0; i < (unsigned)config->channelCount; ++i)
            s_opus_head[21 + i] = config->mapping[i];
    }

    s_opus_head_size = (uint32_t)size;
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
    s_opus_head_size = 0;
    opus_software_decoder_destroy();
    s_opus_software_active = 0;
    s_opus_fallback_failed = 0;
    __atomic_store_n(&esplus_stats.opus_decode_window, 0, __ATOMIC_RELAXED);
    __atomic_store_n(&s_audio_codec_candidate, 0, __ATOMIC_RELEASE);
    __atomic_store_n(&s_audio_codec_active, 0, __ATOMIC_RELEASE);
    __atomic_store_n(&esplus_stats.audio_codec, 0, __ATOMIC_RELAXED);
    __atomic_store_n(&esplus_stats.audio_channels, 0, __ATOMIC_RELAXED);
    __atomic_store_n(&esplus_stats.audio_sample_rate, 0, __ATOMIC_RELAXED);
    __atomic_store_n(&esplus_stats.audio_bytes_received, 0, __ATOMIC_RELAXED);

    s_dolby = LiIsAc3AudioNegotiated() || LiIsEac3AudioNegotiated();
    s_dolby_mime = LiIsEac3AudioNegotiated()
        ? WMP_ESPLUS_AUDIO_MIME_EAC3 : WMP_ESPLUS_AUDIO_MIME_AC3;

    if (s_dolby) {
        channel_count = CHANNEL_COUNT_FROM_AUDIO_CONFIGURATION(audioConfig);
        if (channel_count <= 0 ||
            channel_count > AUDIO_CONFIGURATION_MAX_CHANNEL_COUNT) {
            MLT("Dolby audio init failed: invalid channel count %d", channel_count);
            esplus_audio_registration_complete(0);
            return -1;
        }
        s_sample_rate = DOLBY_SAMPLE_RATE;
        s_channel_count = channel_count;
        s_samples_per_frame = 1536;
    } else if (opus_head_build(config) != 0) {
        ALOG("invalid Opus multistream configuration\n");
        MLT("native Opus configuration rejected");
        esplus_audio_registration_complete(0);
        return -1;
    }

    if (!esplus_create_open()) {
        ALOG("ESPlus player unavailable during audio init\n");
        esplus_audio_registration_complete(0);
        return -1;
    }

    memset(&info, 0, sizeof(info));
    if (s_dolby) {
        info.mime_type = s_dolby_mime;
        info.channels = (uint32_t)channel_count;
        info.sample_rate = DOLBY_SAMPLE_RATE;
    } else {
        info.codec_data = s_opus_head;
        info.codec_data_size = s_opus_head_size;
        info.mime_type = WMP_ESPLUS_AUDIO_MIME_OPUS;
        info.channels = (uint32_t)s_channel_count;
        info.sample_rate = (uint32_t)s_sample_rate;
    }

    result = esplus_set_audio_info(&info);
    MLT("audio stream registration %s -> %d",
        s_dolby
            ? (s_dolby_mime == WMP_ESPLUS_AUDIO_MIME_EAC3 ? "eac3" : "ac3")
            : "opus",
        result);
    if (result != 0) {
        ALOG("ESPlus audio stream registration failed: %d\n", result);
        esplus_audio_registration_complete(0);
        return -1;
    }

    if (!s_dolby)
        opus_software_decoder_init(config);

    __atomic_store_n(&s_audio_codec_candidate,
        s_dolby
            ? (s_dolby_mime == WMP_ESPLUS_AUDIO_MIME_EAC3 ? 3 : 2)
            : 1,
        __ATOMIC_RELEASE);
    __atomic_store_n(&esplus_stats.audio_codec,
        s_dolby
            ? (s_dolby_mime == WMP_ESPLUS_AUDIO_MIME_EAC3 ? 3u : 2u)
            : 1u,
        __ATOMIC_RELAXED);
    __atomic_store_n(&esplus_stats.audio_channels, (uint32_t)s_channel_count, __ATOMIC_RELAXED);
    __atomic_store_n(&esplus_stats.audio_sample_rate, (uint32_t)s_sample_rate, __ATOMIC_RELAXED);

    /* This is the lifecycle barrier: prepare_async cannot run before this. */
    esplus_audio_registration_complete(1);

    if (s_dolby)
        ALOG("registered %s passthrough: %d channels at %u Hz\n",
             s_dolby_mime == WMP_ESPLUS_AUDIO_MIME_EAC3 ? "E-AC-3" : "AC-3",
             channel_count, DOLBY_SAMPLE_RATE);
    else
        ALOG("registered native Opus: %d Hz, %d channels, %d samples/frame\n",
             s_sample_rate, s_channel_count, s_samples_per_frame);
    return 0;
}

static void ar_start(void) {}
static void ar_stop(void) {}

static void ar_cleanup(void)
{
    s_dolby = 0;
    s_opus_head_size = 0;
    opus_software_decoder_destroy();
    s_opus_software_active = 0;
    s_opus_fallback_failed = 0;
    __atomic_store_n(&esplus_stats.opus_decode_window, 0, __ATOMIC_RELAXED);
    __atomic_store_n(&s_audio_codec_candidate, 0, __ATOMIC_RELEASE);
    __atomic_store_n(&s_audio_codec_active, 0, __ATOMIC_RELEASE);
    __atomic_store_n(&esplus_stats.audio_codec, 0, __ATOMIC_RELAXED);
    __atomic_store_n(&esplus_stats.audio_channels, 0, __ATOMIC_RELAXED);
    __atomic_store_n(&esplus_stats.audio_sample_rate, 0, __ATOMIC_RELAXED);
}

static void ar_decodePlay(char *data, int len)
{
    wmp_esplus_packet_t packet;
    wmp_esplus_submit_result_t result;
    uint64_t duration_ns;

    if (!data || len <= 0 || s_opus_fallback_failed) return;

    if (__atomic_load_n(&esplus_performance_stats_enabled, __ATOMIC_ACQUIRE))
        __atomic_fetch_add(&esplus_stats.audio_bytes_received, (uint64_t)len, __ATOMIC_RELAXED);

    if (!s_dolby && !s_opus_software_active && esplus_opus_fallback_ready()) {
        if (!s_opus_fallback_available || !s_software_decoder || !s_software_pcm) {
            if (!s_opus_fallback_failed) {
                s_opus_fallback_failed = 1;
                ALOG("OPUS rejected by ESPlus and libopus fallback is unavailable\n");
                LiReportVideoRendererError();
            }
            return;
        }

        /* The ESPlus recovery worker has already rebuilt and registered the
         * new player with PCM. Switch to software here, outside the native
         * ESPlus callback and without performing teardown on this packet path. */
        s_opus_software_active = 1;
        __atomic_store_n(&esplus_stats.opus_decode_window, 0, __ATOMIC_RELAXED);
        __atomic_store_n(&s_audio_codec_candidate, 4, __ATOMIC_RELEASE);
        __atomic_store_n(&s_audio_codec_active, 4, __ATOMIC_RELEASE);
        __atomic_store_n(&esplus_stats.audio_codec, 4, __ATOMIC_RELAXED);
        __atomic_store_n(&esplus_stats.audio_channels, (uint32_t)s_channel_count, __ATOMIC_RELAXED);
        __atomic_store_n(&esplus_stats.audio_sample_rate, (uint32_t)s_sample_rate, __ATOMIC_RELAXED);
        ALOG("OPUS fallback active: libopus -> PCM_S16LE (%d channels, %d Hz)\n",
             s_channel_count, s_sample_rate);
    }

    if (s_opus_software_active) {
        int measure_decode = __atomic_load_n(&esplus_performance_stats_enabled, __ATOMIC_ACQUIRE);
        uint64_t decode_start_ns = measure_decode ? opus_monotonic_ns() : 0;
        int samples = opus_multistream_decode(
            s_software_decoder, (const unsigned char *)data, len,
            s_software_pcm, OPUS_MAX_FRAME_SAMPLES, 0);
        uint64_t decode_end_ns = measure_decode ? opus_monotonic_ns() : 0;
        if (samples <= 0) {
            ALOG("libopus packet decode failed: %d\n", samples);
            return;
        }
        if (decode_start_ns != 0 && decode_end_ns >= decode_start_ns) {
            uint64_t elapsed_us = (decode_end_ns - decode_start_ns + 500ull) / 1000ull;
            if (elapsed_us > UINT32_MAX) elapsed_us = UINT32_MAX;
            /* One 64-bit atomic keeps the interval sum and sample count coherent. */
            __atomic_fetch_add(&esplus_stats.opus_decode_window,
                               (elapsed_us << 32) | 1ull, __ATOMIC_RELAXED);
        }

        memset(&packet, 0, sizeof(packet));
        packet.type = WMP_ESPLUS_STREAM_AUDIO;
        packet.data = s_software_pcm;
        packet.size = (uint32_t)((size_t)samples * (size_t)s_channel_count *
                                 sizeof(*s_software_pcm));
        packet.duration_ns = (uint64_t)samples * 1000000000ull /
                             (uint64_t)s_sample_rate;
        packet.pts_ns = esplus_stream_clock_pts_ns();
        result = esplus_submit(&packet);
        if (result.status == WMP_ESPLUS_SUBMIT_SUCCESS)
            __atomic_store_n(&s_audio_codec_active, 4, __ATOMIC_RELEASE);
        else if (result.status != WMP_ESPLUS_SUBMIT_BACKPRESSURE &&
                 result.status != WMP_ESPLUS_SUBMIT_NOT_PREPARED)
            ALOG("submit PCM audio failed status=%d raw=%d\n",
                 (int)result.status, result.raw_status);
        return;
    }

    duration_ns = s_dolby
        ? 32000000ull
        : (uint64_t)s_samples_per_frame * 1000000000ull /
          (uint64_t)(s_sample_rate > 0 ? s_sample_rate : 48000);
    memset(&packet, 0, sizeof(packet));
    packet.type = WMP_ESPLUS_STREAM_AUDIO;
    packet.data = data; /* original negotiated compressed packet; no PCM stage */
    packet.size = (uint32_t)len;
    packet.duration_ns = duration_ns;
    packet.pts_ns = esplus_stream_clock_pts_ns();
    result = esplus_submit(&packet);
    if (result.status == WMP_ESPLUS_SUBMIT_SUCCESS)
        __atomic_store_n(&s_audio_codec_active,
            __atomic_load_n(&s_audio_codec_candidate, __ATOMIC_ACQUIRE),
            __ATOMIC_RELEASE);

    if (result.status != WMP_ESPLUS_SUBMIT_SUCCESS &&
        result.status != WMP_ESPLUS_SUBMIT_BACKPRESSURE &&
        result.status != WMP_ESPLUS_SUBMIT_NOT_PREPARED)
        ALOG("submit %s audio failed status=%d raw=%d\n",
             s_dolby ? "Dolby" : "Opus", (int)result.status, result.raw_status);
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
