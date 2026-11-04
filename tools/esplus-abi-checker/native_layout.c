/*
 * Include the extracted Tizen esplusplayer_capi.h through a user-supplied
 * adapter. The adapter must typedef the actual native structs as:
 * esp_native_video_stream_info, esp_native_audio_stream_info, esp_native_packet.
 */
#include <stddef.h>
#include <stdint.h>
#include <stdio.h>
#ifndef ESPLUS_NATIVE_ADAPTER
#error "Define ESPLUS_NATIVE_ADAPTER to the adapter header"
#endif
#include ESPLUS_NATIVE_ADAPTER
#define FIELD(T,F) printf("  %-28s offset=%3zu size=%2zu\n", #F, offsetof(T,F), sizeof(((T*)0)->F))
#define BEGIN(T) printf("\n%s\n  sizeof=%zu alignof=%zu\n", #T, sizeof(T), _Alignof(T))
int main(void) {
    printf("Native ESPlus header layout\npointer_size=%zu\n",sizeof(void*));
#if UINTPTR_MAX != UINT32_MAX
    puts("WARNING: not ARM32; these are not target ABI values.");
#endif
    BEGIN(esp_native_video_stream_info);
    FIELD(esp_native_video_stream_info,codec_data); FIELD(esp_native_video_stream_info,codec_data_length); FIELD(esp_native_video_stream_info,mime_type);
    FIELD(esp_native_video_stream_info,width); FIELD(esp_native_video_stream_info,height); FIELD(esp_native_video_stream_info,max_width); FIELD(esp_native_video_stream_info,max_height);
    FIELD(esp_native_video_stream_info,framerate_num); FIELD(esp_native_video_stream_info,framerate_den);
    BEGIN(esp_native_audio_stream_info);
    FIELD(esp_native_audio_stream_info,codec_data); FIELD(esp_native_audio_stream_info,codec_data_length); FIELD(esp_native_audio_stream_info,mime_type);
    FIELD(esp_native_audio_stream_info,bitrate); FIELD(esp_native_audio_stream_info,channels); FIELD(esp_native_audio_stream_info,sample_rate);
    BEGIN(esp_native_packet);
    FIELD(esp_native_packet,type); FIELD(esp_native_packet,buffer); FIELD(esp_native_packet,buffer_size); FIELD(esp_native_packet,pts); FIELD(esp_native_packet,duration);
    puts("\nNative header declarations compiled successfully.");
    return 0;
}
