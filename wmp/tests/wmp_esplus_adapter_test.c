#include "../service/src/wmp_esplus_adapter.h"

#include <assert.h>
#include <stddef.h>
#include <stdint.h>
#include <stdio.h>
#include <string.h>

static void test_packet_layouts(void)
{
    /* ARM32 ABI layout asserted explicitly; target build also checks its ABI. */
    assert(offsetof(wmp_esplus_video_info_t, codec_data) == 0);
    assert(offsetof(wmp_esplus_video_info_t, mime_type) == sizeof(void *) + 4);
    assert(offsetof(wmp_esplus_audio_info_t, mime_type) == sizeof(void *) + 4);
    assert(offsetof(wmp_esplus_packet_t, pts_ns) >= 16);
    assert(offsetof(wmp_esplus_packet_t, duration_ns) ==
           offsetof(wmp_esplus_packet_t, pts_ns) + sizeof(uint64_t));
}

int main(void)
{
    test_packet_layouts();
    puts("WMP ESPlus adapter layout tests passed.");
    return 0;
}
