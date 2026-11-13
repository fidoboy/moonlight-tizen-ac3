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
    WMP_ESPLUS_PROBE_STREAM_API_MISSING,
    WMP_ESPLUS_PROBE_AMBIGUOUS
} wmp_esplus_probe_result_e;

/*
 * This is export discovery, not ABI validation. Function addresses remain
 * opaque and MUST NOT be called through this structure. The two ESPlus
 * generations have different packet/stream layouts, callbacks, timestamp
 * units and return conventions. Typed adapters must be selected before any
 * player call is made.
 */
typedef struct {
    void *library;

    /* Commonly exported lifecycle and packet entry points. */
    void *create;
    void *open;
    void *close;
    void *destroy; /* optional in the legacy add_* generation */
    void *prepare_async;
    void *start;
    void *stop;
    void *submit_packet;
    void *submit_eos_packet; /* optional */

    /* Display entry points: capabilities, not ABI-generation discriminators. */
    void *set_display_ecore_subsurface;
    void *set_ecore_display;
    void *set_display_mode;
    void *get_playing_time; /* optional; legacy ADD boolean query */
    void *get_error_string; /* optional; esplusplayer_get_error_string(int) */
    /* The complete SET or ADD pair selects the stream-registration ABI. */
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

const char *wmp_esplus_probe_result_name(wmp_esplus_probe_result_e result);
const char *wmp_esplus_family_name(wmp_esplus_family_e family);
void wmp_esplus_close(wmp_esplus_api_t *api);

#ifdef __cplusplus
}
#endif

#endif
