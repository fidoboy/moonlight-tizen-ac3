#ifndef WMP_ESPLUS_ADAPTER_H
#define WMP_ESPLUS_ADAPTER_H

#include "wmp_esplus_abi.h"

#include <stdbool.h>
#include <stddef.h>
#include <stdint.h>

#ifdef __cplusplus
extern "C" {
#endif

typedef enum {
    WMP_ESPLUS_STREAM_UNKNOWN = -1,
    WMP_ESPLUS_STREAM_AUDIO = 0,
    WMP_ESPLUS_STREAM_VIDEO = 1
} wmp_esplus_stream_e;

typedef enum {
    WMP_ESPLUS_BUFFER_STATUS_UNKNOWN = -1,
    WMP_ESPLUS_BUFFER_STATUS_UNDERRUN = 0,
    WMP_ESPLUS_BUFFER_STATUS_OVERRUN = 1
} wmp_esplus_buffer_status_e;

/* Semantic codec identifiers; convert through wmp_esplus_map_video_mime(). */
typedef enum {
    WMP_ESPLUS_VIDEO_MIME_UNKNOWN = 0,
    WMP_ESPLUS_VIDEO_MIME_H263,
    WMP_ESPLUS_VIDEO_MIME_H264,
    WMP_ESPLUS_VIDEO_MIME_HEVC,
    WMP_ESPLUS_VIDEO_MIME_MPEG1,
    WMP_ESPLUS_VIDEO_MIME_MPEG2,
    WMP_ESPLUS_VIDEO_MIME_MPEG4,
    WMP_ESPLUS_VIDEO_MIME_VP8,
    WMP_ESPLUS_VIDEO_MIME_VP9,
    WMP_ESPLUS_VIDEO_MIME_WMV3,
    WMP_ESPLUS_VIDEO_MIME_AV1
} wmp_esplus_video_mime_e;

typedef enum {
    WMP_ESPLUS_AUDIO_MIME_UNKNOWN = 0,
    WMP_ESPLUS_AUDIO_MIME_AAC,
    WMP_ESPLUS_AUDIO_MIME_MP2,
    WMP_ESPLUS_AUDIO_MIME_MP3,
    WMP_ESPLUS_AUDIO_MIME_AC3,
    WMP_ESPLUS_AUDIO_MIME_EAC3,
    WMP_ESPLUS_AUDIO_MIME_VORBIS,
    WMP_ESPLUS_AUDIO_MIME_OPUS,
    WMP_ESPLUS_AUDIO_MIME_DTS,
    WMP_ESPLUS_AUDIO_MIME_PCM_S16LE
} wmp_esplus_audio_mime_e;

/*
 * Neutral stream descriptions retain both generations' distinct video
 * attributes. ADD consumes max_width/max_height and a rational frame rate;
 * SET consumes stride/slice_height, integer frame_rate and interlaced.
 * Callers set the fields meaningful to their source stream; the adapter maps
 * only the fields belonging to the selected native ABI.
 */
typedef struct {
    const void *codec_data;
    uint32_t codec_data_size;
    wmp_esplus_video_mime_e mime_type;
    uint32_t width;
    uint32_t height;
    uint32_t max_width;
    uint32_t max_height;
    uint32_t frame_rate_num;
    uint32_t frame_rate_den;
    uint32_t stride;
    uint32_t slice_height;
    uint32_t frame_rate;
    uint32_t interlaced;
} wmp_esplus_video_info_t;

typedef struct {
    const void *codec_data;
    uint32_t codec_data_size;
    wmp_esplus_audio_mime_e mime_type;
    uint32_t bitrate;
    uint32_t channels;
    uint32_t sample_rate;
} wmp_esplus_audio_info_t;

/* Neutral packet timebase is nanoseconds. Each ABI gets its own native layout. */
typedef struct {
    wmp_esplus_stream_e type;
    const void *data;
    uint32_t size;
    uint64_t pts_ns;
    uint64_t duration_ns;
    uint32_t matroska_color_info;
    uint32_t hdr_metadata_size;
    const void *hdr_metadata;
} wmp_esplus_packet_t;

typedef enum {
    WMP_ESPLUS_SUBMIT_SUCCESS = 0,
    WMP_ESPLUS_SUBMIT_BACKPRESSURE,
    WMP_ESPLUS_SUBMIT_NOT_PREPARED,
    WMP_ESPLUS_SUBMIT_INVALID_PACKET,
    WMP_ESPLUS_SUBMIT_OUT_OF_MEMORY,
    WMP_ESPLUS_SUBMIT_REJECTED,
    WMP_ESPLUS_SUBMIT_UNCLASSIFIED
} wmp_esplus_submit_status_e;

typedef struct {
    wmp_esplus_submit_status_e status;
    int raw_status;
} wmp_esplus_submit_result_t;

/*
 * Stream-registration calls have family-specific native conventions:
 * SET returns 0 on success and -22/-38 for the observed native failures;
 * unknown values remain UNCLASSIFIED. This is verified against both the
 * extracted x86-64 library and the target TV's ARM32 library.
 * Legacy ADD returns a C++ bool encoded as int (1 success, 0 failure).
 */
typedef enum {
    WMP_ESPLUS_CALL_SUCCESS = 0,
    WMP_ESPLUS_CALL_NATIVE_FAILURE,
    WMP_ESPLUS_CALL_INVALID_ARGUMENT,
    WMP_ESPLUS_CALL_MISSING_FUNCTION,
    WMP_ESPLUS_CALL_UNCLASSIFIED
} wmp_esplus_call_status_e;

typedef struct {
    wmp_esplus_call_status_e status;
    int raw_status;
} wmp_esplus_call_result_t;

typedef struct {
    void (*error)(int error, void *context);
    void (*buffer_status)(wmp_esplus_stream_e stream,
                          wmp_esplus_buffer_status_e status, void *context);
    void (*resource_conflicted)(void *context);
    void (*eos)(void *context);
    void (*seek_done)(void *context);
    void (*ready_to_prepare)(wmp_esplus_stream_e stream, void *context);
    void (*prepare_async_done)(bool success, void *context);
} wmp_esplus_callbacks_t;

typedef struct {
    wmp_esplus_api_t *api;
    void *player;
    wmp_esplus_callbacks_t callbacks;
    void *context;
    int callbacks_registered;
} wmp_esplus_adapter_t;

/* Lifecycle and display calls preserve each family's native return convention. */
void *wmp_esplus_adapter_create(wmp_esplus_api_t *api);
wmp_esplus_call_result_t wmp_esplus_normalize_lifecycle_result(
    wmp_esplus_family_e family, int raw_status);
wmp_esplus_call_result_t wmp_esplus_adapter_open(wmp_esplus_adapter_t *adapter);
wmp_esplus_call_result_t wmp_esplus_adapter_close(wmp_esplus_adapter_t *adapter);
wmp_esplus_call_result_t wmp_esplus_adapter_prepare_async(wmp_esplus_adapter_t *adapter);
wmp_esplus_call_result_t wmp_esplus_adapter_start(wmp_esplus_adapter_t *adapter);
wmp_esplus_call_result_t wmp_esplus_adapter_stop(wmp_esplus_adapter_t *adapter);
wmp_esplus_call_result_t wmp_esplus_adapter_set_ecore_display(
    wmp_esplus_adapter_t *adapter, int display_type, void *display,
    int x, int y, int width, int height);
wmp_esplus_call_result_t wmp_esplus_adapter_set_display_mode(
    wmp_esplus_adapter_t *adapter, int display_mode);
/* Playback clock and absolute seek are optional capabilities, independent of stream ABI family. */
int wmp_esplus_adapter_has_playing_time(const wmp_esplus_adapter_t *adapter);
int wmp_esplus_adapter_get_playing_time(
    wmp_esplus_adapter_t *adapter, uint64_t *playing_time_ms);
int wmp_esplus_adapter_has_seek(const wmp_esplus_adapter_t *adapter);
/* Returns the native esplusplayer_seek() result; -1 means unavailable/invalid adapter. */
int wmp_esplus_adapter_seek(
    wmp_esplus_adapter_t *adapter, uint64_t playing_time_ms);
/* Returns Samsung's static error description, or NULL when the optional API is absent. */
const char *wmp_esplus_adapter_get_error_string(
    const wmp_esplus_adapter_t *adapter, int error);

/* Registers exactly one callback ABI family; ADD is process-global/singleton. */
int wmp_esplus_adapter_bind(
    wmp_esplus_adapter_t *adapter,
    wmp_esplus_api_t *api,
    void *player,
    const wmp_esplus_callbacks_t *callbacks,
    void *context);

int wmp_esplus_map_video_mime(
    wmp_esplus_family_e family,
    wmp_esplus_video_mime_e mime,
    uint32_t *native_mime);
int wmp_esplus_map_audio_mime(
    wmp_esplus_family_e family,
    wmp_esplus_audio_mime_e mime,
    uint32_t *native_mime);

wmp_esplus_call_result_t wmp_esplus_adapter_set_video_info(
    wmp_esplus_adapter_t *adapter,
    const wmp_esplus_video_info_t *info);
wmp_esplus_call_result_t wmp_esplus_adapter_set_audio_info(
    wmp_esplus_adapter_t *adapter,
    const wmp_esplus_audio_info_t *info);

wmp_esplus_call_result_t wmp_esplus_normalize_stream_result(
    wmp_esplus_family_e family, int raw_status);

wmp_esplus_submit_result_t wmp_esplus_adapter_submit(
    wmp_esplus_adapter_t *adapter,
    const wmp_esplus_packet_t *packet);

uint64_t wmp_esplus_ns_to_ms(uint64_t nanoseconds);
wmp_esplus_submit_result_t wmp_esplus_normalize_submit_result(
    wmp_esplus_family_e family, int raw_status);

void wmp_esplus_adapter_unbind(wmp_esplus_adapter_t *adapter);

#ifdef __cplusplus
}
#endif

#endif
