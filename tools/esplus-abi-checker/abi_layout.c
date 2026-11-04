/* ESPlus ABI layout calculator: WMP legacy and OmegaTube set_* candidates. */
#include <stddef.h>
#include <stdint.h>
#include <stdio.h>
#if defined(REQUIRE_ARM32) && UINTPTR_MAX != UINT32_MAX
#error "This checker must be compiled for 32-bit ARM"
#endif
#define FIELD(T,F) printf("  %-28s offset=%3zu size=%2zu\n", #F, offsetof(T,F), sizeof(((T*)0)->F))
#define BEGIN(T) printf("\n%s\n  sizeof=%zu alignof=%zu\n", #T, sizeof(T), _Alignof(T))

/* WMP Tizen 5.0 add_* layout. */
typedef struct { char *codec_data; uint32_t codec_data_length, mime_type, width, height, max_width, max_height, framerate_num, framerate_den; } legacy_video;
typedef struct { char *codec_data; uint32_t codec_data_length, mime_type, bitrate, channels, sample_rate; } legacy_audio;
typedef struct { uint32_t type; char *buffer; uint32_t buffer_size; uint64_t pts, duration; } legacy_packet;

/* OmegaTube set_* candidate layout. These are not Samsung-verified declarations. */
typedef struct {
    int type; char *buffer; uint32_t buffer_size; uint64_t pts, duration;
    void *matroska_color_info; uint32_t hdr10p_metadata_size; char *hdr10p_metadata;
    uint8_t reserved[64];
} candidate_packet;
typedef struct {
    char *codec_data; uint32_t codec_data_length; int mime_type;
    uint32_t bitrate, channels, sample_rate; uint8_t reserved[64];
} candidate_audio;
typedef struct {
    char *codec_data; uint32_t codec_data_length; int mime_type;
    uint32_t width, height, max_width, max_height, framerate_num, framerate_den;
    uint8_t reserved[64];
} candidate_video;
typedef struct { char *id, *version, *type; } candidate_app;

#define VIDEO(T) do { BEGIN(T); FIELD(T,codec_data); FIELD(T,codec_data_length); FIELD(T,mime_type); FIELD(T,width); FIELD(T,height); FIELD(T,max_width); FIELD(T,max_height); FIELD(T,framerate_num); FIELD(T,framerate_den); } while(0)
#define AUDIO(T) do { BEGIN(T); FIELD(T,codec_data); FIELD(T,codec_data_length); FIELD(T,mime_type); FIELD(T,bitrate); FIELD(T,channels); FIELD(T,sample_rate); } while(0)
int main(void) {
    printf("ESPlus ABI layout report\npointer_size=%zu uint64_align=%zu\n",sizeof(void*),_Alignof(uint64_t));
#if UINTPTR_MAX == UINT32_MAX
    puts("target=32-bit");
#else
    puts("target=NOT-32-bit (host report only)");
#endif
    puts("\n=== WMP legacy add_* ===");
    VIDEO(legacy_video); AUDIO(legacy_audio);
    BEGIN(legacy_packet); FIELD(legacy_packet,type); FIELD(legacy_packet,buffer); FIELD(legacy_packet,buffer_size); FIELD(legacy_packet,pts); FIELD(legacy_packet,duration);
    puts("\n=== OmegaTube set_* candidate ===");
    VIDEO(candidate_video); AUDIO(candidate_audio);
    BEGIN(candidate_packet); FIELD(candidate_packet,type); FIELD(candidate_packet,buffer); FIELD(candidate_packet,buffer_size); FIELD(candidate_packet,pts); FIELD(candidate_packet,duration); FIELD(candidate_packet,matroska_color_info); FIELD(candidate_packet,hdr10p_metadata_size); FIELD(candidate_packet,hdr10p_metadata); FIELD(candidate_packet,reserved);
    BEGIN(candidate_app); FIELD(candidate_app,id); FIELD(candidate_app,version); FIELD(candidate_app,type);
    puts("\nNOTE: candidate set_* structures are not confirmed against Samsung's header or TV binary.");
    return 0;
}
