#include <assert.h>
#include <stdio.h>
#include <string.h>

#include "Limelight.h"
#include "esplus_player.h"
#include "../engine/mlclient/esplus_stats.h"
#include "../engine/mlclient/audio_opus.c"

esplus_stats_t esplus_stats;
volatile int esplus_performance_stats_enabled;

void ml_engine_notify_audio_ready(void) {}
void LiReportVideoRendererError(void) {}

static int g_fallback_ready, g_fallback_blocked, g_decode_samples;

int esplus_opus_fallback_ready(void) { return g_fallback_ready; }

OpusMSDecoder *opus_multistream_decoder_create(
    opus_int32 rate, int channels, int streams, int coupled,
    const unsigned char *mapping, int *error)
{
    (void)rate; (void)channels; (void)streams; (void)coupled; (void)mapping;
    if (error) *error = OPUS_OK;
    return (OpusMSDecoder *)(uintptr_t)1;
}
void opus_multistream_decoder_destroy(OpusMSDecoder *decoder) { (void)decoder; }
int opus_multistream_decode(OpusMSDecoder *decoder, const unsigned char *data,
    opus_int32 length, opus_int16 *pcm, int frame_size, int decode_fec)
{
    size_t i, samples = (size_t)g_decode_samples;
    (void)decoder; (void)data; (void)length; (void)decode_fec;
    if (samples > (size_t)frame_size) return OPUS_BUFFER_TOO_SMALL;
    for (i = 0; i < samples * 6u; ++i) pcm[i] = (opus_int16)i;
    return g_decode_samples;
}

static int g_ac3, g_eac3, g_submit_count, g_registration_result, g_audio_registered;
static uint64_t g_clock_pts_ns;
static wmp_esplus_audio_info_t g_audio_info;
static wmp_esplus_packet_t g_last_packet;

bool LiIsAc3AudioNegotiated(void) { return g_ac3 != 0; }
bool LiIsEac3AudioNegotiated(void) { return g_eac3 != 0; }
void LiInitializeAudioCallbacks(PAUDIO_RENDERER_CALLBACKS callbacks)
{ memset(callbacks, 0, sizeof(*callbacks)); }
int esplus_create_open(void) { return 1; }
int esplus_set_audio_info(const wmp_esplus_audio_info_t *info)
{ g_audio_info = *info; g_audio_registered = 1; return g_registration_result; }
void esplus_audio_registration_complete(int success)
{ if (success) assert(g_audio_registered); }
uint64_t esplus_stream_clock_pts_ns(void) { return g_clock_pts_ns; }
wmp_esplus_submit_result_t esplus_submit(const wmp_esplus_packet_t *packet)
{
    wmp_esplus_submit_result_t result = {
        g_fallback_blocked ? WMP_ESPLUS_SUBMIT_NOT_PREPARED : WMP_ESPLUS_SUBMIT_SUCCESS,
        4
    };
    if (g_fallback_blocked)
        return result;
    g_last_packet = *packet;
    ++g_submit_count;
    return result;
}

static void reset_capture(void)
{
    memset(&g_audio_info, 0, sizeof(g_audio_info));
    memset(&g_last_packet, 0, sizeof(g_last_packet));
    g_submit_count = 0;
    g_registration_result = 0;
    g_audio_registered = 0;
    g_clock_pts_ns = 0;
    g_fallback_ready = 0;
    g_fallback_blocked = 0;
    g_decode_samples = 480;
}

static void make_opus_config(OPUS_MULTISTREAM_CONFIGURATION *opus)
{
    int i;
    memset(opus, 0, sizeof(*opus));
    opus->sampleRate = 48000;
    opus->channelCount = 6;
    opus->streams = 4;
    opus->coupledStreams = 2;
    opus->samplesPerFrame = 480;
    for (i = 0; i < 6; ++i) opus->mapping[i] = (unsigned char)i;
}

static void test_dolby_passthrough(int eac3)
{
    AUDIO_RENDERER_CALLBACKS callbacks;
    OPUS_MULTISTREAM_CONFIGURATION opus;
    unsigned char frame[] = { 0x11, 0x22, 0x33, 0x44 };

    reset_capture();
    make_opus_config(&opus);
    g_ac3 = !eac3;
    g_eac3 = eac3;
    AudEsplus_SetDolbyPassthroughEnabled(1);
    AudEsplus_FillCallbacks(&callbacks);
    assert((callbacks.capabilities & CAPABILITY_SUPPORTS_AC3_PASSTHROUGH) != 0);
    assert(callbacks.init(AUDIO_CONFIGURATION_51_SURROUND, &opus, NULL, 0) == 0);

    assert(g_audio_info.mime_type ==
        (eac3 ? WMP_ESPLUS_AUDIO_MIME_EAC3 : WMP_ESPLUS_AUDIO_MIME_AC3));
    assert(g_audio_info.codec_data == NULL && g_audio_info.codec_data_size == 0);
    assert(g_audio_info.channels == 6 && g_audio_info.sample_rate == 48000);

    /* Host packets pass through as soon as ESPlus has registered the audio stream. */
    g_clock_pts_ns = 123456789ull;
    callbacks.decodeAndPlaySample((char *)frame, sizeof(frame));
    assert(g_submit_count == 1);
    assert(g_last_packet.type == WMP_ESPLUS_STREAM_AUDIO);
    assert(g_last_packet.data == frame && g_last_packet.size == sizeof(frame));
    assert(g_last_packet.pts_ns == 123456789ull);
    assert(g_last_packet.duration_ns == 32000000ull);
    assert(AudEsplus_GetActiveAudioCodec() == (eac3 ? 3 : 2));
    callbacks.cleanup();
}

static void test_opus_passthrough(void)
{
    AUDIO_RENDERER_CALLBACKS callbacks;
    OPUS_MULTISTREAM_CONFIGURATION opus;
    unsigned char frame[] = { 0x51, 0x62, 0x73, 0x84 };

    reset_capture();
    make_opus_config(&opus);
    g_ac3 = 0;
    g_eac3 = 0;
    AudEsplus_SetDolbyPassthroughEnabled(0);
    AudEsplus_FillCallbacks(&callbacks);
    assert((callbacks.capabilities & CAPABILITY_DIRECT_SUBMIT) != 0);
    assert((callbacks.capabilities & CAPABILITY_SUPPORTS_AC3_PASSTHROUGH) == 0);
    assert(callbacks.init(AUDIO_CONFIGURATION_51_SURROUND, &opus, NULL, 0) == 0);

    assert(g_audio_info.mime_type == WMP_ESPLUS_AUDIO_MIME_OPUS);
    assert(g_audio_info.channels == 6 && g_audio_info.sample_rate == 48000);
    assert(g_audio_info.codec_data_size == 27);
    assert(memcmp(g_audio_info.codec_data, "OpusHead", 8) == 0);
    assert(((const unsigned char *)g_audio_info.codec_data)[9] == 6);
    assert(((const unsigned char *)g_audio_info.codec_data)[18] == 1);
    assert(((const unsigned char *)g_audio_info.codec_data)[19] == 4);
    assert(((const unsigned char *)g_audio_info.codec_data)[20] == 2);

    g_clock_pts_ns = 987654321ull;
    callbacks.decodeAndPlaySample((char *)frame, sizeof(frame));
    assert(g_submit_count == 1);
    assert(g_last_packet.type == WMP_ESPLUS_STREAM_AUDIO);
    assert(g_last_packet.data == frame && g_last_packet.size == sizeof(frame));
    assert(g_last_packet.pts_ns == 987654321ull);
    assert(g_last_packet.duration_ns == 10000000ull);
    assert(AudEsplus_GetActiveAudioCodec() == 1);
    callbacks.cleanup();
}

static void test_opus_software_fallback(void)
{
    AUDIO_RENDERER_CALLBACKS callbacks;
    OPUS_MULTISTREAM_CONFIGURATION opus;
    unsigned char frame[] = { 0x21, 0x32, 0x43, 0x54 };

    reset_capture();
    make_opus_config(&opus);
    g_ac3 = 0;
    g_eac3 = 0;
    AudEsplus_SetDolbyPassthroughEnabled(0);
    AudEsplus_FillCallbacks(&callbacks);
    assert(callbacks.init(AUDIO_CONFIGURATION_51_SURROUND, &opus, NULL, 0) == 0);

    g_clock_pts_ns = 20000000ull;

    /* Model the rejected native player while the independent recovery worker
     * is rebuilding it. ESPlus must reject further compressed submissions. */
    g_fallback_blocked = 1;
    callbacks.decodeAndPlaySample((char *)frame, sizeof(frame));
    assert(g_submit_count == 0);
    assert(AudEsplus_GetActiveAudioCodec() == 1);

    /* Model successful registration by the recovery worker. The readiness
     * flag is published only after PCM_S16LE has been registered. */
    {
        wmp_esplus_audio_info_t pcm_info;
        memset(&pcm_info, 0, sizeof(pcm_info));
        pcm_info.mime_type = WMP_ESPLUS_AUDIO_MIME_PCM_S16LE;
        pcm_info.channels = 6;
        pcm_info.sample_rate = 48000;
        assert(esplus_set_audio_info(&pcm_info) == 0);
    }
    assert(g_audio_registered);
    assert(g_audio_info.mime_type == WMP_ESPLUS_AUDIO_MIME_PCM_S16LE);
    assert(g_audio_info.channels == 6);
    assert(g_audio_info.sample_rate == 48000);
    g_fallback_blocked = 0;
    g_fallback_ready = 1;

    callbacks.decodeAndPlaySample((char *)frame, sizeof(frame));

    assert(g_submit_count == 1);
    assert(g_last_packet.type == WMP_ESPLUS_STREAM_AUDIO);
    assert(g_last_packet.data != frame);
    assert(g_last_packet.size == 480u * 6u * sizeof(opus_int16));
    assert(g_last_packet.duration_ns == 10000000ull);
    assert(g_last_packet.pts_ns == 20000000ull);
    assert(AudEsplus_GetActiveAudioCodec() == 4);

    callbacks.cleanup();
}

int main(void)
{
    AUDIO_RENDERER_CALLBACKS callbacks;
    OPUS_MULTISTREAM_CONFIGURATION opus;

    AudEsplus_SetDolbyPassthroughEnabled(0);
    AudEsplus_FillCallbacks(&callbacks);
    assert((callbacks.capabilities & CAPABILITY_DIRECT_SUBMIT) != 0);
    assert((callbacks.capabilities & CAPABILITY_SUPPORTS_AC3_PASSTHROUGH) == 0);

    make_opus_config(&opus);
    reset_capture();
    g_ac3 = 0;
    g_eac3 = 0;
    g_registration_result = -1;
    assert(callbacks.init(AUDIO_CONFIGURATION_51_SURROUND, &opus, NULL, 0) != 0);
    assert(g_submit_count == 0);

    test_dolby_passthrough(0);
    test_dolby_passthrough(1);
    test_opus_passthrough();
    test_opus_software_fallback();
    puts("WMP audio passthrough tests passed.");
    return 0;
}
