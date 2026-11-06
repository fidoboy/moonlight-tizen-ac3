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
    WMP_ESPLUS_STREAM_AUDIO = 0,
    WMP_ESPLUS_STREAM_VIDEO = 1
} wmp_esplus_stream_e;

typedef struct {
    const void *codec_data;
    uint32_t codec_data_size;
    uint32_t mime_type;
    uint32_t width;
    uint32_t height;
    uint32_t display_width;
    uint32_t display_height;
    uint32_t frame_rate;
    uint32_t interlaced;
} wmp_esplus_video_info_t;

typedef struct {
    const void *codec_data;
    uint32_t codec_data_size;
    uint32_t mime_type;
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
    WMP_ESPLUS_SUBMIT_REJECTED,
    WMP_ESPLUS_SUBMIT_UNCLASSIFIED
} wmp_esplus_submit_status_e;

typedef struct {
    wmp_esplus_submit_status_e status;
    int raw_status;
} wmp_esplus_submit_result_t;

typedef struct {
    void (*error)(uint32_t error, void *context);
    void (*buffer_status)(uint32_t stream, uint32_t status, void *context);
    void (*resource_conflicted)(void *context);
    void (*seek_done)(void *context);
    void (*ready_to_prepare)(uint32_t stream, void *context);
    void (*prepare_async_done)(bool success, void *context);
} wmp_esplus_callbacks_t;

typedef struct {
    wmp_esplus_api_t *api;
    void *player;
    wmp_esplus_callbacks_t callbacks;
    void *context;
    int callbacks_registered;
} wmp_esplus_adapter_t;

/* Registers exactly one callback ABI family; ADD is process-global/singleton. */
int wmp_esplus_adapter_bind(
    wmp_esplus_adapter_t *adapter,
    wmp_esplus_api_t *api,
    void *player,
    const wmp_esplus_callbacks_t *callbacks,
    void *context);

int wmp_esplus_adapter_set_video_info(
    wmp_esplus_adapter_t *adapter,
    const wmp_esplus_video_info_t *info);
int wmp_esplus_adapter_set_audio_info(
    wmp_esplus_adapter_t *adapter,
    const wmp_esplus_audio_info_t *info);

wmp_esplus_submit_result_t wmp_esplus_adapter_submit(
    wmp_esplus_adapter_t *adapter,
    const wmp_esplus_packet_t *packet);

void wmp_esplus_adapter_unbind(wmp_esplus_adapter_t *adapter);

#ifdef __cplusplus
}
#endif

#endif
