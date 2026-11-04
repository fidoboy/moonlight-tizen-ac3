/* Direct comparison against the extracted Samsung CAPI header via an adapter. */
#include <stddef.h>
#include <stdint.h>
#include <stdio.h>
#ifndef ESPLUS_NATIVE_ADAPTER
#error "Define ESPLUS_NATIVE_ADAPTER to an adapter header"
#endif
#include ESPLUS_NATIVE_ADAPTER
#define FIELD(T,F) printf("  %-30s offset=%3zu size=%2zu\n",#F,offsetof(T,F),sizeof(((T*)0)->F))
#define BEGIN(T) printf("\n%-34s sizeof=%zu alignof=%zu\n",#T,sizeof(T),_Alignof(T))
_Static_assert(sizeof(void*)==4,"native comparison requires ARM32");
_Static_assert(sizeof(esp_native_audio_stream_info)==24,"native audio info size mismatch");
_Static_assert(sizeof(esp_native_video_stream_info)==36,"native video info size mismatch");
_Static_assert(offsetof(esp_native_packet,pts)==16,"native packet PTS offset mismatch");
_Static_assert(offsetof(esp_native_packet,duration)==24,"native packet duration offset mismatch");
_Static_assert(offsetof(esp_native_packet,matroska_color_info)==32,"native packet Matroska offset mismatch");
_Static_assert(offsetof(esp_native_packet,hdr10p_metadata_size)==36,"native packet HDR10+ size offset mismatch");
_Static_assert(offsetof(esp_native_packet,hdr10p_metadata)==40,"native packet HDR10+ pointer offset mismatch");
_Static_assert(sizeof(esp_native_packet)==48,"native packet size mismatch");
int main(void) {
 printf("Samsung native header; pointer_size=%zu\n",sizeof(void*));
 BEGIN(esp_native_audio_stream_info);
 FIELD(esp_native_audio_stream_info,codec_data); FIELD(esp_native_audio_stream_info,codec_data_length); FIELD(esp_native_audio_stream_info,mime_type); FIELD(esp_native_audio_stream_info,bitrate); FIELD(esp_native_audio_stream_info,channels); FIELD(esp_native_audio_stream_info,sample_rate);
 BEGIN(esp_native_video_stream_info);
 FIELD(esp_native_video_stream_info,codec_data); FIELD(esp_native_video_stream_info,codec_data_length); FIELD(esp_native_video_stream_info,mime_type); FIELD(esp_native_video_stream_info,width); FIELD(esp_native_video_stream_info,height); FIELD(esp_native_video_stream_info,max_width); FIELD(esp_native_video_stream_info,max_height); FIELD(esp_native_video_stream_info,framerate_num); FIELD(esp_native_video_stream_info,framerate_den);
 BEGIN(esp_native_packet);
 FIELD(esp_native_packet,type); FIELD(esp_native_packet,buffer); FIELD(esp_native_packet,buffer_size); FIELD(esp_native_packet,pts); FIELD(esp_native_packet,duration); FIELD(esp_native_packet,matroska_color_info); FIELD(esp_native_packet,hdr10p_metadata_size); FIELD(esp_native_packet,hdr10p_metadata);
 puts("Native header assertions: PASS"); return 0;
}
