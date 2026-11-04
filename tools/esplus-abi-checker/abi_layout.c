/* ARM32 ESPlus ABI layout audit: WMP legacy vs Samsung public CAPI 0.0.3. */
#include <stddef.h>
#include <stdint.h>
#include <stdio.h>
#if defined(REQUIRE_ARM32) && UINTPTR_MAX != UINT32_MAX
#error "This checker must be compiled for 32-bit ARM"
#endif
#define FIELD(T,F) printf("  %-30s offset=%3zu size=%2zu\n",#F,offsetof(T,F),sizeof(((T*)0)->F))
#define BEGIN(T) printf("\n%-34s sizeof=%zu alignof=%zu\n",#T,sizeof(T),_Alignof(T))

/* Reconstructed WMP Tizen 5.0 add_* declarations. */
typedef struct { char *codec_data; uint32_t codec_data_length,mime_type,width,height,max_width,max_height,framerate_num,framerate_den; } wmp_legacy_video_info;
typedef struct { char *codec_data; uint32_t codec_data_length,mime_type,bitrate,channels,sample_rate; } wmp_legacy_audio_info;
typedef struct { uint32_t type; char *buffer; uint32_t buffer_size; uint64_t pts,duration; } wmp_legacy_packet;

/* Normalized mirror transcribed from the public Samsung CAPI 0.0.3 header. */
typedef enum { PUB_AUDIO_UNKNOWN=0,PUB_AUDIO_AAC=1,PUB_AUDIO_MP2=2,PUB_AUDIO_MP3=3,PUB_AUDIO_AC3=4,PUB_AUDIO_EAC3=5,PUB_AUDIO_VORBIS=6,PUB_AUDIO_OPUS=7 } public_audio_mime;
typedef struct { char *codec_data; uint32_t codec_data_length; public_audio_mime mime_type; uint32_t bitrate,channels,sample_rate; } public_audio_stream_info;
typedef struct { char *codec_data; uint32_t codec_data_length,mime_type,width,height,max_width,max_height,framerate_num,framerate_den; } public_video_stream_info;
typedef struct { uint32_t type; char *buffer; uint32_t buffer_size; uint64_t pts,duration; void *matroska_color_info; uint32_t hdr10p_metadata_size; char *hdr10p_metadata; } public_es_packet;

/* OmegaTube's third-party extension, not the public CAPI layout. */
typedef struct { int type; char *buffer; uint32_t buffer_size; uint64_t pts,duration; void *matroska_color_info; uint32_t hdr10p_metadata_size; char *hdr10p_metadata; uint8_t reserved[64]; } omegatube_extended_packet;

_Static_assert(sizeof(public_audio_mime)==4,"CAPI enum must be 32-bit");
_Static_assert(sizeof(public_audio_stream_info)==24,"CAPI audio size mismatch");
_Static_assert(sizeof(public_video_stream_info)==36,"CAPI video size mismatch");
_Static_assert(offsetof(public_es_packet,pts)==16,"CAPI packet PTS offset mismatch");
_Static_assert(offsetof(public_es_packet,duration)==24,"CAPI packet duration offset mismatch");
_Static_assert(offsetof(public_es_packet,matroska_color_info)==32,"CAPI Matroska offset mismatch");
_Static_assert(offsetof(public_es_packet,hdr10p_metadata_size)==36,"CAPI HDR10+ size offset mismatch");
_Static_assert(offsetof(public_es_packet,hdr10p_metadata)==40,"CAPI HDR10+ pointer offset mismatch");
_Static_assert(sizeof(public_es_packet)==48,"CAPI packet size mismatch");
#if defined(REQUIRE_ARM32)
_Static_assert(sizeof(void*)==4,"expected 32-bit pointers");
_Static_assert(_Alignof(uint64_t)==8,"expected AAPCS 64-bit alignment");
_Static_assert(_Alignof(public_es_packet)==8,"CAPI packet alignment mismatch");
#endif
#define VIDEO(T) do { BEGIN(T); FIELD(T,codec_data); FIELD(T,codec_data_length); FIELD(T,mime_type); FIELD(T,width); FIELD(T,height); FIELD(T,max_width); FIELD(T,max_height); FIELD(T,framerate_num); FIELD(T,framerate_den); } while(0)
#define AUDIO(T) do { BEGIN(T); FIELD(T,codec_data); FIELD(T,codec_data_length); FIELD(T,mime_type); FIELD(T,bitrate); FIELD(T,channels); FIELD(T,sample_rate); } while(0)
int main(void) {
 printf("ESPlus ABI report; pointer_size=%zu; uint64_align=%zu\n",sizeof(void*),_Alignof(uint64_t));
#if UINTPTR_MAX==UINT32_MAX
 puts("target=32-bit ARM-compatible ABI");
#else
 puts("target=host-only; not evidence for AU7172");
#endif
 puts("\n=== WMP legacy Tizen 5.0 add_* ===");
 VIDEO(wmp_legacy_video_info); AUDIO(wmp_legacy_audio_info);
 BEGIN(wmp_legacy_packet); FIELD(wmp_legacy_packet,type); FIELD(wmp_legacy_packet,buffer); FIELD(wmp_legacy_packet,buffer_size); FIELD(wmp_legacy_packet,pts); FIELD(wmp_legacy_packet,duration);
 puts("\n=== Samsung public CAPI 0.0.3 set_* mirror ===");
 VIDEO(public_video_stream_info); AUDIO(public_audio_stream_info);
 BEGIN(public_es_packet); FIELD(public_es_packet,type); FIELD(public_es_packet,buffer); FIELD(public_es_packet,buffer_size); FIELD(public_es_packet,pts); FIELD(public_es_packet,duration); FIELD(public_es_packet,matroska_color_info); FIELD(public_es_packet,hdr10p_metadata_size); FIELD(public_es_packet,hdr10p_metadata);
 puts("\n=== OmegaTube extended packet (third-party reference) ===");
 BEGIN(omegatube_extended_packet); FIELD(omegatube_extended_packet,pts); FIELD(omegatube_extended_packet,duration); FIELD(omegatube_extended_packet,matroska_color_info); FIELD(omegatube_extended_packet,hdr10p_metadata_size); FIELD(omegatube_extended_packet,hdr10p_metadata); FIELD(omegatube_extended_packet,reserved);
 printf("\nAudio MIME: UNKNOWN=%d AAC=%d MP2=%d MP3=%d AC3=%d EAC3=%d VORBIS=%d OPUS=%d\n",PUB_AUDIO_UNKNOWN,PUB_AUDIO_AAC,PUB_AUDIO_MP2,PUB_AUDIO_MP3,PUB_AUDIO_AC3,PUB_AUDIO_EAC3,PUB_AUDIO_VORBIS,PUB_AUDIO_OPUS);
 puts("Static ABI assertions: PASS"); return 0;
}
