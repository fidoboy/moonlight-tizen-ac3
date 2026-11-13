#include "../service/src/wmp_esplus_adapter.h"

#include <assert.h>
#include <stddef.h>
#include <stdint.h>
#include <stdio.h>

static void test_neutral_layouts(void)
{
    assert(offsetof(wmp_esplus_video_info_t, codec_data) == 0);
    assert(offsetof(wmp_esplus_video_info_t, mime_type) == sizeof(void *) + 4);
    assert(offsetof(wmp_esplus_audio_info_t, mime_type) == sizeof(void *) + 4);
    assert(offsetof(wmp_esplus_video_info_t, max_width) >
           offsetof(wmp_esplus_video_info_t, height));
    assert(offsetof(wmp_esplus_video_info_t, stride) >
           offsetof(wmp_esplus_video_info_t, frame_rate_den));
    if (sizeof(void *) == 4)
        assert(sizeof(wmp_esplus_audio_info_t) == 24);
}

static void test_video_mime_mapping(void)
{
    uint32_t native = UINT32_MAX;
    assert(wmp_esplus_map_video_mime(WMP_ESPLUS_FAMILY_ADD,
                                    WMP_ESPLUS_VIDEO_MIME_H264, &native) == 0);
    assert(native == 2);
    assert(wmp_esplus_map_video_mime(WMP_ESPLUS_FAMILY_SET,
                                    WMP_ESPLUS_VIDEO_MIME_H264, &native) == 0);
    assert(native == 2);
    assert(wmp_esplus_map_video_mime(WMP_ESPLUS_FAMILY_SET,
                                    WMP_ESPLUS_VIDEO_MIME_HEVC, &native) == 0);
    assert(native == 3);
    assert(wmp_esplus_map_video_mime(WMP_ESPLUS_FAMILY_SET,
                                    WMP_ESPLUS_VIDEO_MIME_AV1, &native) == 0);
    assert(native == 10);
    assert(wmp_esplus_map_video_mime(WMP_ESPLUS_FAMILY_ADD,
                                    WMP_ESPLUS_VIDEO_MIME_AV1, &native) == 0);
    assert(native == 10);
    assert(wmp_esplus_map_video_mime(WMP_ESPLUS_FAMILY_SET,
                                    WMP_ESPLUS_VIDEO_MIME_UNKNOWN, &native) == -1);
    assert(wmp_esplus_map_video_mime(WMP_ESPLUS_FAMILY_ADD,
                                    (wmp_esplus_video_mime_e)99, &native) == -1);
}

static void test_audio_mime_mapping(void)
{
    uint32_t native = UINT32_MAX;
    assert(wmp_esplus_map_audio_mime(WMP_ESPLUS_FAMILY_ADD,
                                    WMP_ESPLUS_AUDIO_MIME_OPUS, &native) == 0);
    assert(native == 8);
    assert(wmp_esplus_map_audio_mime(WMP_ESPLUS_FAMILY_SET,
                                    WMP_ESPLUS_AUDIO_MIME_OPUS, &native) == 0);
    assert(native == 7);
    assert(wmp_esplus_map_audio_mime(WMP_ESPLUS_FAMILY_ADD,
                                    WMP_ESPLUS_AUDIO_MIME_DTS, &native) == 0);
    assert(native == 7);
    assert(wmp_esplus_map_audio_mime(WMP_ESPLUS_FAMILY_SET,
                                    WMP_ESPLUS_AUDIO_MIME_DTS, &native) == -1);
}

static void test_timestamp_conversion(void)
{
    assert(wmp_esplus_ns_to_ms(0) == 0);
    assert(wmp_esplus_ns_to_ms(999999) == 0);
    assert(wmp_esplus_ns_to_ms(1000000) == 1);
    assert(wmp_esplus_ns_to_ms(16666666) == 16);
    assert(wmp_esplus_ns_to_ms(1000000000ull) == 1000);
}

static void test_stream_registration_results(void)
{
    wmp_esplus_call_result_t result;

    /*
     * The inspected SET implementation returns 0 on success, -38 when
     * SetStream reports false, and -22 for invalid null arguments.
     */
    result = wmp_esplus_normalize_stream_result(WMP_ESPLUS_FAMILY_SET, 0);
    assert(result.status == WMP_ESPLUS_CALL_SUCCESS);
    assert(result.raw_status == 0);
    result = wmp_esplus_normalize_stream_result(WMP_ESPLUS_FAMILY_SET, -38);
    assert(result.status == WMP_ESPLUS_CALL_NATIVE_FAILURE);
    assert(result.raw_status == -38);
    result = wmp_esplus_normalize_stream_result(WMP_ESPLUS_FAMILY_SET, -22);
    assert(result.status == WMP_ESPLUS_CALL_NATIVE_FAILURE);
    assert(result.raw_status == -22);
    result = wmp_esplus_normalize_stream_result(WMP_ESPLUS_FAMILY_SET, 5);
    assert(result.status == WMP_ESPLUS_CALL_UNCLASSIFIED);
    assert(result.raw_status == 5);

    /* Legacy ADD returns a C++ bool encoded as int: 1 true, 0 false. */
    result = wmp_esplus_normalize_stream_result(WMP_ESPLUS_FAMILY_ADD, 1);
    assert(result.status == WMP_ESPLUS_CALL_SUCCESS);
    assert(result.raw_status == 1);
    result = wmp_esplus_normalize_stream_result(WMP_ESPLUS_FAMILY_ADD, 0);
    assert(result.status == WMP_ESPLUS_CALL_NATIVE_FAILURE);
    assert(result.raw_status == 0);
    result = wmp_esplus_normalize_stream_result(WMP_ESPLUS_FAMILY_ADD, 2);
    assert(result.status == WMP_ESPLUS_CALL_UNCLASSIFIED);
    assert(result.raw_status == 2);

    result = wmp_esplus_normalize_stream_result(WMP_ESPLUS_FAMILY_NONE, 0);
    assert(result.status == WMP_ESPLUS_CALL_UNCLASSIFIED);
    assert(result.raw_status == 0);
}

static void test_lifecycle_results(void)
{
    wmp_esplus_call_result_t result;

    result = wmp_esplus_normalize_lifecycle_result(WMP_ESPLUS_FAMILY_SET, 0);
    assert(result.status == WMP_ESPLUS_CALL_SUCCESS && result.raw_status == 0);
    result = wmp_esplus_normalize_lifecycle_result(WMP_ESPLUS_FAMILY_SET, -22);
    assert(result.status == WMP_ESPLUS_CALL_NATIVE_FAILURE && result.raw_status == -22);
    result = wmp_esplus_normalize_lifecycle_result(WMP_ESPLUS_FAMILY_SET, -38);
    assert(result.status == WMP_ESPLUS_CALL_NATIVE_FAILURE && result.raw_status == -38);
    result = wmp_esplus_normalize_lifecycle_result(WMP_ESPLUS_FAMILY_SET, 1);
    assert(result.status == WMP_ESPLUS_CALL_UNCLASSIFIED && result.raw_status == 1);

    result = wmp_esplus_normalize_lifecycle_result(WMP_ESPLUS_FAMILY_ADD, 1);
    assert(result.status == WMP_ESPLUS_CALL_SUCCESS && result.raw_status == 1);
    result = wmp_esplus_normalize_lifecycle_result(WMP_ESPLUS_FAMILY_ADD, 0);
    assert(result.status == WMP_ESPLUS_CALL_NATIVE_FAILURE && result.raw_status == 0);
    result = wmp_esplus_normalize_lifecycle_result(WMP_ESPLUS_FAMILY_ADD, -38);
    assert(result.status == WMP_ESPLUS_CALL_UNCLASSIFIED && result.raw_status == -38);
}

static void test_submit_results(void)
{
    const wmp_esplus_family_e families[] = {
        WMP_ESPLUS_FAMILY_ADD, WMP_ESPLUS_FAMILY_SET
    };
    size_t i;
    for (i = 0; i < sizeof(families) / sizeof(families[0]); ++i) {
        wmp_esplus_family_e family = families[i];
        wmp_esplus_submit_result_t result;
        result = wmp_esplus_normalize_submit_result(family, 0);
        assert(result.status == WMP_ESPLUS_SUBMIT_NOT_PREPARED);
        result = wmp_esplus_normalize_submit_result(family, 1);
        assert(result.status == WMP_ESPLUS_SUBMIT_INVALID_PACKET);
        result = wmp_esplus_normalize_submit_result(family, 2);
        assert(result.status == WMP_ESPLUS_SUBMIT_OUT_OF_MEMORY);
        result = wmp_esplus_normalize_submit_result(family, 3);
        assert(result.status == WMP_ESPLUS_SUBMIT_BACKPRESSURE);
        result = wmp_esplus_normalize_submit_result(family, 4);
        assert(result.status == WMP_ESPLUS_SUBMIT_SUCCESS);
        assert(result.raw_status == 4);
        result = wmp_esplus_normalize_submit_result(family, 99);
        assert(result.status == WMP_ESPLUS_SUBMIT_UNCLASSIFIED);
        assert(result.raw_status == 99);
    }
}

int main(void)
{
    test_neutral_layouts();
    test_video_mime_mapping();
    test_audio_mime_mapping();
    test_timestamp_conversion();
    test_stream_registration_results();
    test_lifecycle_results();
    test_submit_results();
    puts("WMP ESPlus typed adapter tests passed.");
    return 0;
}
