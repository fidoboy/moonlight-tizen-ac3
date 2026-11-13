#include <assert.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#include "Limelight.h"
#include "opus_multistream.h"
#include "esplus_player.h"

/* Exercise the production ESPlus audio implementation. */
#include "../upstream/mlclient/audio_opus.c"

struct OpusMSDecoder { int marker; };
static struct OpusMSDecoder g_decoder;
static int g_ac3;
static int g_eac3;
static int g_decode_count;
static const unsigned char *g_last_opus_data;
static int g_last_opus_length;
static wmp_esplus_audio_info_t g_audio_info;
static wmp_esplus_packet_t g_last_packet;
static int g_submit_count;

OpusMSDecoder *opus_multistream_decoder_create(
    opus_int32 Fs, int channels, int streams, int coupled_streams,
    const unsigned char *mapping, int *error)
{
    (void)Fs;
    (void)channels;
    (void)streams;
    (void)coupled_streams;
    (void)mapping;
    if (error) *error = OPUS_OK;
    return &g_decoder;
}

int opus_multistream_decode(
    OpusMSDecoder *decoder, const unsigned char *data, opus_int32 len,
    opus_int16 *pcm, int frame_size, int decode_fec)
{
    assert(decoder == &g_decoder);
    assert(pcm != NULL);
    assert(decode_fec == 0);
    g_last_opus_data = data;
    g_last_opus_length = (int)len;
    ++g_decode_count;
    for (int i = 0; i < frame_size * 2; ++i)
        pcm[i] = (opus_int16)(i - 120);
    return frame_size;
}

void opus_multistream_decoder_destroy(OpusMSDecoder *decoder)
{
    assert(decoder == &g_decoder);
}

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
    g_decode_count = 0;
    g_last_opus_data = NULL;
    g_last_opus_length = -1;
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

    /* E-AC-3: register compressed MIME and submit untouched 32 ms frames. */
    reset_capture();
    g_ac3 = 0;
    g_eac3 = 1;
    assert(callbacks.init(AUDIO_CONFIGURATION_51_SURROUND, &opus, NULL, 0) == 0);
    assert(g_audio_info.mime_type == WMP_ESPLUS_AUDIO_MIME_EAC3);
    assert(g_audio_info.codec_data == NULL && g_audio_info.codec_data_size == 0);
    assert(g_audio_info.channels == 6 && g_audio_info.sample_rate == 48000);
    callbacks.decodeAndPlaySample(frame, sizeof(frame));
    assert(g_submit_count == 1 && g_decode_count == 0);
    assert(g_last_packet.data == frame && g_last_packet.size == sizeof(frame));
    assert(g_last_packet.pts_ns == 0 && g_last_packet.duration_ns == 32000000ull);
    callbacks.decodeAndPlaySample(NULL, 0); /* Lost frame advances the timeline. */
    assert(g_submit_count == 1);
    callbacks.decodeAndPlaySample(frame, sizeof(frame));
    assert(g_submit_count == 2);
    assert(g_last_packet.pts_ns == 64000000ull);
    callbacks.cleanup();

    /* AC-3 selects its own compressed ESPlus MIME. */
    reset_capture();
    g_ac3 = 1;
    g_eac3 = 0;
    assert(callbacks.init(AUDIO_CONFIGURATION_51_SURROUND, &opus, NULL, 0) == 0);
    assert(g_audio_info.mime_type == WMP_ESPLUS_AUDIO_MIME_AC3);
    assert(g_audio_info.channels == 6 && g_audio_info.sample_rate == 48000);
    callbacks.cleanup();

    /* Normal audio is decoded by libopus and submitted as interleaved PCM_S16LE. */
    reset_capture();
    g_ac3 = 0;
    g_eac3 = 0;
    opus.channelCount = 2;
    opus.streams = 1;
    opus.coupledStreams = 1;
    opus.samplesPerFrame = 480;
    assert(callbacks.init(AUDIO_CONFIGURATION_STEREO, &opus, NULL, 0) == 0);
    assert(g_audio_info.mime_type == WMP_ESPLUS_AUDIO_MIME_PCM_S16LE);
    assert(g_audio_info.codec_data == NULL && g_audio_info.codec_data_size == 0);
    assert(g_audio_info.channels == 2 && g_audio_info.sample_rate == 48000);

    callbacks.decodeAndPlaySample(frame, sizeof(frame));
    assert(g_decode_count == 1);
    assert(g_last_opus_data == (const unsigned char *)frame);
    assert(g_last_opus_length == (int)sizeof(frame));
    assert(g_submit_count == 1);
    assert(g_last_packet.type == WMP_ESPLUS_STREAM_AUDIO);
    assert(g_last_packet.data != frame);
    assert(g_last_packet.size == 480u * 2u * sizeof(opus_int16));
    assert(((const opus_int16 *)g_last_packet.data)[0] == -120);
    assert(((const opus_int16 *)g_last_packet.data)[1] == -119);
    assert(g_last_packet.pts_ns == 0 && g_last_packet.duration_ns == 10000000ull);

    /* Lost Opus packets are sent to libopus as PLC (NULL, zero length). */
    callbacks.decodeAndPlaySample(NULL, 0);
    assert(g_decode_count == 2);
    assert(g_last_opus_data == NULL && g_last_opus_length == 0);
    assert(g_submit_count == 2);
    assert(g_last_packet.pts_ns == 10000000ull);
    callbacks.cleanup();

    puts("WMP Opus-to-PCM and AC-3/E-AC-3 passthrough tests passed.");
    return 0;
}
