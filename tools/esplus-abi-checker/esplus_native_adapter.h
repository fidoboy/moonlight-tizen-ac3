/*
 * Adapter for Samsung's public ESPlus CAPI structure headers.
 * The vendor headers are downloaded from the official Tizen source repository
 * by check-esplus-abi.yml; they are not vendored in this repository.
 *
 * Include only the public type headers needed by the ABI checker. The umbrella
 * esplusplayer_capi.h also imports Tizen platform headers (tizen.h, sound
 * manager, etc.) which are not needed to inspect these structure layouts.
 */
#include <esplusplayer_capi/stream.h>
#include <esplusplayer_capi/espacket.h>

typedef esplusplayer_audio_stream_info esp_native_audio_stream_info;
typedef esplusplayer_video_stream_info esp_native_video_stream_info;
typedef esplusplayer_es_packet esp_native_packet;
