#define _POSIX_C_SOURCE 200809L
#include <assert.h>
#include <stdio.h>
#include <string.h>

#include "Limelight.h"
#include "esplus_player.h"
#include "../engine/mlclient/esplus_stats.h"
#include "../engine/mlclient/audio_opus.c"

/* audio_opus.c reads these engine-owned statistics globals. The isolated
 * passthrough test does not link esplus_player.c, so provide test-local state. */
esplus_stats_t esplus_stats;
volatile int esplus_performance_stats_enabled;

/* audio_opus.c notifies the engine after the first accepted real audio packet.
 * This isolated unit test does not link engine_api.c, so provide the test stub. */
void ml_engine_notify_audio_ready(void) {}

static int g_ac3, g_eac3, g_submit_count, g_registration_result, g_audio_registered;
static uint64_t g_clock_pts_ns;
static wmp_esplus_audio_info_t g_audio_info;
static wmp_esplus_packet_t g_last_packet;
static wmp_esplus_packet_t g_packets[16];
static uint64_t g_auto_advance_ns;
static int g_stop_after;

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
    wmp_esplus_submit_result_t result = { WMP_ESPLUS_SUBMIT_SUCCESS, 4 };
    g_last_packet = *packet;
    if (g_submit_count < (int)(sizeof(g_packets) / sizeof(g_packets[0])))
        g_packets[g_submit_count] = *packet;
    ++g_submit_count;
    if (g_auto_advance_ns) g_clock_pts_ns += g_auto_advance_ns;
    if (g_stop_after && g_submit_count >= g_stop_after) AudEsplus_StopSilence();
    return result;
}

static void reset_capture(void)
{
    memset(&g_audio_info, 0, sizeof(g_audio_info));
    memset(&g_last_packet, 0, sizeof(g_last_packet));
    memset(g_packets, 0, sizeof(g_packets));
    g_auto_advance_ns = 0;
    g_stop_after = 0;
    g_submit_count = 0;
    g_registration_result = 0;
    g_audio_registered = 0;
    g_clock_pts_ns = 0;
}


static void assert_synthetic_packets(uint64_t duration_ns, const uint8_t *payload, uint32_t payload_size)
{
    unsigned i;
    assert(g_submit_count == 10);
    for (i = 0; i < 10; ++i) {
        assert(g_packets[i].type == WMP_ESPLUS_STREAM_AUDIO);
        assert(g_packets[i].data == payload);
        assert(g_packets[i].size == payload_size);
        assert(g_packets[i].pts_ns == g_packets[0].pts_ns + duration_ns * i);
        assert(g_packets[i].duration_ns == duration_ns);
    }
}

static void test_dolby_silence_preroll(int eac3, int channels)
{
    AUDIO_RENDERER_CALLBACKS callbacks;
    const uint8_t *payload;
    uint32_t payload_size;
    int audio_config = channels == 2 ? AUDIO_CONFIGURATION_STEREO : AUDIO_CONFIGURATION_51_SURROUND;

    if (eac3) {
        payload = channels == 2 ? wmp_silence_eac3_stereo : wmp_silence_eac3_51;
        payload_size = channels == 2 ? WMP_SILENCE_EAC3_STEREO_SIZE : WMP_SILENCE_EAC3_51_SIZE;
    } else {
        payload = channels == 2 ? wmp_silence_ac3_stereo : wmp_silence_ac3_51;
        payload_size = channels == 2 ? WMP_SILENCE_AC3_STEREO_SIZE : WMP_SILENCE_AC3_51_SIZE;
    }

    reset_capture(); g_ac3 = !eac3; g_eac3 = eac3;
    AudEsplus_FillCallbacks(&callbacks);
    assert(callbacks.init(audio_config, NULL, NULL, 0) == 0);
    assert(g_audio_info.channels == (uint32_t)channels && g_audio_info.sample_rate == 48000);
    g_clock_pts_ns = 320000000ull; g_auto_advance_ns = 32000000ull; g_stop_after = 10;
    AudEsplus_PrimeSilence(); preroll_join();
    assert_synthetic_packets(32000000ull, payload, payload_size);
    assert(g_packets[0].size == 384u && payload[0] == 0x0b && payload[1] == 0x77);
    callbacks.cleanup();
}

static void test_opus_silence_preroll(int channels, int streams, int coupled,
                                      const uint8_t *payload, uint32_t payload_size)
{
    AUDIO_RENDERER_CALLBACKS callbacks;
    OPUS_MULTISTREAM_CONFIGURATION opus;
    int i;
    reset_capture(); g_ac3 = 0; g_eac3 = 0;
    memset(&opus, 0, sizeof(opus));
    opus.sampleRate = 48000; opus.channelCount = channels; opus.streams = streams;
    opus.coupledStreams = coupled; opus.samplesPerFrame = 480;
    for (i = 0; i < channels; ++i) opus.mapping[i] = (unsigned char)i;
    AudEsplus_FillCallbacks(&callbacks);
    assert(callbacks.init(AUDIO_CONFIGURATION_51_SURROUND, &opus, NULL, 0) == 0);
    g_clock_pts_ns = 100000000ull; g_auto_advance_ns = 10000000ull; g_stop_after = 10;
    AudEsplus_PrimeSilence(); preroll_join();
    assert_synthetic_packets(10000000ull, payload, payload_size);
    callbacks.cleanup();
}

static void test_real_audio_follows_synthetic(void)
{
    AUDIO_RENDERER_CALLBACKS callbacks;
    OPUS_MULTISTREAM_CONFIGURATION opus;
    unsigned char real_packet[] = { 0x31, 0x42, 0x53 };
    int i;

    reset_capture(); g_ac3 = 0; g_eac3 = 0;
    memset(&opus, 0, sizeof(opus));
    opus.sampleRate = 48000; opus.channelCount = 6; opus.streams = 4;
    opus.coupledStreams = 2; opus.samplesPerFrame = 480;
    for (i = 0; i < 6; ++i) opus.mapping[i] = (unsigned char)i;
    AudEsplus_FillCallbacks(&callbacks);
    assert(callbacks.init(AUDIO_CONFIGURATION_51_SURROUND, &opus, NULL, 0) == 0);

    /* Stop after three synthetic packets to model prepare_async_done(true). */
    g_clock_pts_ns = 10000000ull; g_auto_advance_ns = 10000000ull; g_stop_after = 3;
    AudEsplus_PrimeSilence(); preroll_join();
    assert(g_submit_count == 3);
    assert(g_packets[2].pts_ns + g_packets[2].duration_ns <= g_clock_pts_ns);

    callbacks.decodeAndPlaySample((char *)real_packet, sizeof(real_packet));
    assert(g_submit_count == 4);
    assert(g_packets[3].data == real_packet);
    assert(g_packets[3].pts_ns >= g_packets[2].pts_ns + g_packets[2].duration_ns);
    callbacks.cleanup();
}

static void test_real_audio_does_not_stop_preroll(void)
{
    AUDIO_RENDERER_CALLBACKS callbacks;
    OPUS_MULTISTREAM_CONFIGURATION opus;
    unsigned char real_packet[] = { 0x91, 0x82, 0x73 };
    int i;
    reset_capture(); g_ac3 = 0; g_eac3 = 0;
    memset(&opus, 0, sizeof(opus));
    opus.sampleRate = 48000; opus.channelCount = 6; opus.streams = 4;
    opus.coupledStreams = 2; opus.samplesPerFrame = 480;
    for (i = 0; i < 6; ++i) opus.mapping[i] = (unsigned char)i;
    AudEsplus_FillCallbacks(&callbacks);
    assert(callbacks.init(AUDIO_CONFIGURATION_51_SURROUND, &opus, NULL, 0) == 0);
    g_clock_pts_ns = 5000000ull;
    AudEsplus_PrimeSilence();
    callbacks.decodeAndPlaySample((char *)real_packet, sizeof(real_packet));
    assert(g_submit_count == 1 && g_last_packet.data == real_packet);
    assert(g_last_packet.size == sizeof(real_packet));

    /* Model prepare_async_done: real audio must not stop preroll; this
     * lifecycle callback is the event that ends it. */
    AudEsplus_StopSilence();
    preroll_join();
    callbacks.cleanup();
}

int main(void)
{
    AUDIO_RENDERER_CALLBACKS callbacks;
    OPUS_MULTISTREAM_CONFIGURATION opus;
    unsigned char frame[] = { 0x01, 0x02, 0x03, 0x04 };

    memset(&opus, 0, sizeof(opus));
    opus.sampleRate = 48000;
    opus.channelCount = 6;
    opus.streams = 4;
    opus.coupledStreams = 2;
    opus.samplesPerFrame = 480;
    for (int i = 0; i < 6; ++i) opus.mapping[i] = (unsigned char)i;

    AudEsplus_SetDolbyPassthroughEnabled(0);
    AudEsplus_FillCallbacks(&callbacks);
    assert((callbacks.capabilities & CAPABILITY_DIRECT_SUBMIT) != 0);
    assert((callbacks.capabilities & CAPABILITY_SUPPORTS_AC3_PASSTHROUGH) == 0);
    AudEsplus_SetDolbyPassthroughEnabled(1);
    AudEsplus_FillCallbacks(&callbacks);
    assert((callbacks.capabilities & CAPABILITY_SUPPORTS_AC3_PASSTHROUGH) != 0);

    reset_capture();
    g_ac3 = 0; g_eac3 = 1;
    assert(callbacks.init(AUDIO_CONFIGURATION_51_SURROUND, &opus, NULL, 0) == 0);
    assert(g_audio_info.mime_type == WMP_ESPLUS_AUDIO_MIME_EAC3);
    assert(g_audio_info.codec_data == NULL && g_audio_info.codec_data_size == 0);
    assert(g_audio_info.channels == 6 && g_audio_info.sample_rate == 48000);
    g_clock_pts_ns = 123456789ull;
    callbacks.decodeAndPlaySample((char *)frame, sizeof(frame));
    assert(g_submit_count == 1 && g_last_packet.data == frame);
    assert(g_last_packet.size == sizeof(frame));
    assert(g_last_packet.pts_ns == 123456789ull);
    assert(g_last_packet.duration_ns == 32000000ull);
    callbacks.cleanup();

    reset_capture();
    g_ac3 = 1; g_eac3 = 0;
    assert(callbacks.init(AUDIO_CONFIGURATION_51_SURROUND, &opus, NULL, 0) == 0);
    assert(g_audio_info.mime_type == WMP_ESPLUS_AUDIO_MIME_AC3);
    callbacks.cleanup();

    /* Native Opus registration: OpusHead multistream config + original packets. */
    reset_capture();
    g_ac3 = 0; g_eac3 = 0;
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
    callbacks.cleanup();

    /* Registration failure is propagated to Common C and does not submit. */
    reset_capture();
    g_registration_result = -1;
    assert(callbacks.init(AUDIO_CONFIGURATION_51_SURROUND, &opus, NULL, 0) != 0);
    assert(g_submit_count == 0);

    test_dolby_silence_preroll(0, 2);
    test_dolby_silence_preroll(0, 6);
    test_dolby_silence_preroll(1, 2);
    test_dolby_silence_preroll(1, 6);
    test_opus_silence_preroll(1, 1, 0, wmp_silence_opus_mono, WMP_SILENCE_OPUS_MONO_SIZE);
    test_opus_silence_preroll(2, 1, 1, wmp_silence_opus_stereo, WMP_SILENCE_OPUS_STEREO_SIZE);
    test_opus_silence_preroll(6, 4, 2, wmp_silence_opus_51, WMP_SILENCE_OPUS_51_SIZE);
    test_opus_silence_preroll(8, 5, 3, wmp_silence_opus_71, WMP_SILENCE_OPUS_71_SIZE);
    test_real_audio_does_not_stop_preroll();
    test_real_audio_follows_synthetic();
    puts("WMP audio passthrough and synthetic silence preroll tests passed.");
    return 0;
}
