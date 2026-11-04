#ifndef WMP_ESPLUS_ABI_H
#define WMP_ESPLUS_ABI_H

#include <stddef.h>

#ifdef __cplusplus
extern "C" {
#endif

typedef enum {
    WMP_ESPLUS_FAMILY_NONE = 0,
    WMP_ESPLUS_FAMILY_SET,
    WMP_ESPLUS_FAMILY_ADD
} wmp_esplus_family_e;

typedef enum {
    WMP_ESPLUS_PROBE_OK = 0,
    WMP_ESPLUS_PROBE_LIBRARY_MISSING,
    WMP_ESPLUS_PROBE_CORE_INCOMPLETE,
    WMP_ESPLUS_PROBE_STREAM_API_MISSING
} wmp_esplus_probe_result_e;

/*
 * Export addresses are retained as opaque pointers during the probe phase.
 * Do not call through these fields. The set_* and add_* APIs have different
 * structure layouts, callback signatures, and return conventions; each
 * family needs its own typed adapter before any player function is invoked.
 */
typedef struct {
    void *library;
    void *create;
    void *open;
    void *close;
    void *destroy;
    void *prepare_async;
    void *start;
    void *stop;
    void *submit_packet;
    void *submit_eos_packet;
    void *set_ecore_display;
    void *set_video_stream_info;
    void *set_audio_stream_info;
    void *add_video_stream_info;
    void *add_audio_stream_info;
    wmp_esplus_family_e selected_family;
} wmp_esplus_api_t;

wmp_esplus_probe_result_e wmp_esplus_probe(
    wmp_esplus_api_t *api,
    char *report,
    size_t report_capacity);

void wmp_esplus_close(wmp_esplus_api_t *api);

#ifdef __cplusplus
}
#endif

#endif
