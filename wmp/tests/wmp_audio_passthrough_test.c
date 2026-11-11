#include <assert.h>
#include <stdio.h>
#include <string.h>

#include "Limelight.h"
#include "esplus_player.h"

/* Exercise the normal audio implementation; production diagnostic builds default to video-only. */
#define WMP_VIDEO_ONLY_DIAGNOSTIC 0
#include "../upstream/mlclient/audio_opus.c"

static int g_ac3;
static int g_eac3;
static wmp_esplus_audio_info_t g_audio_info;
static wmp_esplus_packet_t g_last_packet;
static int g_submit_count;

bool LiIsAc3AudioNegotiated(void) { return g_ac3 != 0; }
bool LiIsEac3AudioNegotiated(void) { return g_eac3 != 0; }

void LiInitializeAudioCallbacks(PAUDIO_RENDERER_CALLBACKS callbacks)
{
    memset(callbacks, 0, sizeof(*callbacks));
}

int esplus_create_open(void) { return 1; }

int esplus_set_audio_info(const wmp_esplus_audio_info_t *info)
{
    g_audio_info = *info;
    return 0;
}

wmp_esplus_submit_result_t esplus_submit(const wmp_esplus_packet_t *packet)
{
    wmp_esplus_submit_result_t result = {
        WMP_ESPLUS_SUBMIT_SUCCESS, 4
    };
    g_last_packet = *packet;
    ++g_submit_count;
    return result;
}

static void reset_capture(void)
{
    memset(&g_audio_info, 0, sizeof(g_audio_info));
    memset(&g_last_packet, 0, sizeof(g_last_packet));
    g_submit_count = 0;
}

int main(void)
{
    AUDIO_RENDERER_CALLBACKS callbacks;
    OPUS_MULTISTREAM_CONFIGURATION opus;
    char frame[] = { 0x01, 0x02, 0x03, 0x04 };

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

    /* E-AC-3: register the compressed MIME and submit untouched 32 ms frames. */
    reset_capture();
    g_ac3 = 0;
    g_eac3 = 1;
    assert(callbacks.init(AUDIO_CONFIGURATION_51_SURROUND, &opus, NULL, 0) == 0);
    assert(g_audio_info.mime_type == WMP_ESPLUS_AUDIO_MIME_EAC3);
    assert(g_audio_info.codec_data == NULL && g_audio_info.codec_data_size == 0);
    assert(g_audio_info.channels == 6 && g_audio_info.sample_rate == 48000);
    callbacks.decodeAndPlaySample(frame, sizeof(frame));
    assert(g_submit_count == 1);
    assert(g_last_packet.data == frame && g_last_packet.size == sizeof(frame));
    assert(g_last_packet.pts_ns == 0 && g_last_packet.duration_ns == 32000000ull);
    callbacks.decodeAndPlaySample(NULL, 0); /* Lost frame still advances the timeline. */
    assert(g_submit_count == 1);
    callbacks.decodeAndPlaySample(frame, sizeof(frame));
    assert(g_submit_count == 2);
    assert(g_last_packet.pts_ns == 64000000ull);
    callbacks.cleanup();

    /* AC-3 selects its own ESPlus MIME independently of E-AC-3. */
    reset_capture();
    g_ac3 = 1;
    g_eac3 = 0;
    assert(callbacks.init(AUDIO_CONFIGURATION_51_SURROUND, &opus, NULL, 0) == 0);
    assert(g_audio_info.mime_type == WMP_ESPLUS_AUDIO_MIME_AC3);
    assert(g_audio_info.channels == 6 && g_audio_info.sample_rate == 48000);
    callbacks.cleanup();

    /* No Dolby negotiation must retain the original OpusHead/Opus packet path. */
    reset_capture();
    g_ac3 = 0;
    g_eac3 = 0;
    opus.channelCount = 2;
    opus.streams = 1;
    opus.coupledStreams = 1;
    opus.samplesPerFrame = 480;
    assert(callbacks.init(AUDIO_CONFIGURATION_STEREO, &opus, NULL, 0) == 0);
    assert(g_audio_info.mime_type == WMP_ESPLUS_AUDIO_MIME_OPUS);
    assert(g_audio_info.codec_data != NULL && g_audio_info.codec_data_size > 0);
    callbacks.decodeAndPlaySample(frame, sizeof(frame));
    assert(g_submit_count == 1);
    assert(g_last_packet.pts_ns == 0 && g_last_packet.duration_ns == 10000000ull);
    callbacks.cleanup();

    puts("WMP AC-3/E-AC-3 passthrough and Opus fallback tests passed.");
    return 0;
}
