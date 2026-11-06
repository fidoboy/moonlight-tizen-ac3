#include "../service/src/wmp_esplus_adapter.h"

#include <assert.h>
#include <stddef.h>
#include <stdint.h>
#include <stdio.h>

static void test_stream_layouts(void)
{
    assert(offsetof(wmp_esplus_video_info_t, codec_data) == 0);
    assert(offsetof(wmp_esplus_video_info_t, mime_type) == sizeof(void *) + 4);
    assert(offsetof(wmp_esplus_audio_info_t, mime_type) == sizeof(void *) + 4);
    if (sizeof(void *) == 4) {
        assert(sizeof(wmp_esplus_video_info_t) == 36);
        assert(sizeof(wmp_esplus_audio_info_t) == 24);
    }
}

static void test_timestamp_conversion(void)
{
    assert(wmp_esplus_ns_to_ms(0) == 0);
    assert(wmp_esplus_ns_to_ms(999999) == 0);
    assert(wmp_esplus_ns_to_ms(1000000) == 1);
    assert(wmp_esplus_ns_to_ms(16666666) == 16);
    assert(wmp_esplus_ns_to_ms(1000000000ull) == 1000);
}

static void test_submit_results(void)
{
    wmp_esplus_submit_result_t result;

    result = wmp_esplus_normalize_submit_result(WMP_ESPLUS_FAMILY_ADD, 4);
    assert(result.status == WMP_ESPLUS_SUBMIT_SUCCESS);
    assert(result.raw_status == 4);

    result = wmp_esplus_normalize_submit_result(WMP_ESPLUS_FAMILY_ADD, 0);
    assert(result.status == WMP_ESPLUS_SUBMIT_UNCLASSIFIED);
    assert(result.raw_status == 0);

    result = wmp_esplus_normalize_submit_result(WMP_ESPLUS_FAMILY_SET, 4);
    assert(result.status == WMP_ESPLUS_SUBMIT_UNCLASSIFIED);
    assert(result.raw_status == 4);
}

int main(void)
{
    test_stream_layouts();
    test_timestamp_conversion();
    test_submit_results();
    puts("WMP ESPlus typed adapter tests passed.");
    return 0;
}
