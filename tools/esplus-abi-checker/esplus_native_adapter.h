/*
 * Adapter for Samsung's public ESPlus CAPI header.
 * The vendor header is downloaded from the official Tizen source repository
 * by check-esplus-abi.yml; it is not vendored in this repository.
 */
#include <esplusplayer_capi/esplusplayer_capi.h>

typedef esplusplayer_audio_stream_info esp_native_audio_stream_info;
typedef esplusplayer_video_stream_info esp_native_video_stream_info;
typedef esplusplayer_es_packet esp_native_packet;
