#include "wmp_esplus_abi.h"

#include <dlfcn.h>
#include <stdarg.h>
#include <stdbool.h>
#include <stdio.h>
#include <string.h>

static void report_append(char *buffer, size_t capacity, const char *format, ...)
{
    size_t used;
    va_list args;

    if (buffer == NULL || capacity == 0)
        return;
    used = strlen(buffer);
    if (used >= capacity - 1)
        return;
    va_start(args, format);
    (void)vsnprintf(buffer + used, capacity - used, format, args);
    va_end(args);
}

static void *resolve_symbol(void *library, const char *name)
{
    (void)dlerror();
    return dlsym(library, name);
}

const char *wmp_esplus_probe_result_name(wmp_esplus_probe_result_e result)
{
    switch (result) {
    case WMP_ESPLUS_PROBE_OK: return "symbols_detected";
    case WMP_ESPLUS_PROBE_LIBRARY_MISSING: return "library_missing";
    case WMP_ESPLUS_PROBE_CORE_INCOMPLETE: return "core_symbols_incomplete";
    case WMP_ESPLUS_PROBE_STREAM_API_MISSING: return "stream_api_missing";
    case WMP_ESPLUS_PROBE_AMBIGUOUS: return "abi_ambiguous";
    default: return "unknown";
    }
}

const char *wmp_esplus_family_name(wmp_esplus_family_e family)
{
    switch (family) {
    case WMP_ESPLUS_FAMILY_SET: return "set";
    case WMP_ESPLUS_FAMILY_ADD: return "add";
    default: return "none";
    }
}

wmp_esplus_probe_result_e wmp_esplus_probe(
    wmp_esplus_api_t *api,
    char *report,
    size_t report_capacity)
{
    bool set_pair, add_pair;

    if (api == NULL)
        return WMP_ESPLUS_PROBE_LIBRARY_MISSING;

    memset(api, 0, sizeof(*api));
    if (report != NULL && report_capacity > 0)
        report[0] = '\0';

    api->library = dlopen("libesplusplayer.so", RTLD_NOW | RTLD_LOCAL);
    if (api->library == NULL) {
        const char *error = dlerror();
        report_append(report, report_capacity, "LIBRARY_LOAD_FAILED: %s\n",
                      error != NULL ? error : "dlopen returned NULL");
        return WMP_ESPLUS_PROBE_LIBRARY_MISSING;
    }

#define RESOLVE(field, symbol) \
    do { \
        api->field = resolve_symbol(api->library, symbol); \
        report_append(report, report_capacity, "%s %s address=%p\n", \
                      api->field != NULL ? "FOUND" : "MISSING", symbol, api->field); \
    } while (0)

    RESOLVE(create, "esplusplayer_create");
    RESOLVE(open, "esplusplayer_open");
    RESOLVE(close, "esplusplayer_close");
    RESOLVE(destroy, "esplusplayer_destroy");
    RESOLVE(prepare_async, "esplusplayer_prepare_async");
    RESOLVE(start, "esplusplayer_start");
    RESOLVE(stop, "esplusplayer_stop");
    RESOLVE(submit_packet, "esplusplayer_submit_packet");
    RESOLVE(submit_eos_packet, "esplusplayer_submit_eos_packet");

    /* Display capabilities are independent of the stream-registration ABI. */
    RESOLVE(set_display_ecore_subsurface, "esplusplayer_set_display_ecore_subsurface");
    RESOLVE(set_ecore_display, "esplusplayer_set_ecore_display");
    RESOLVE(set_display_mode, "esplusplayer_set_display_mode");
    RESOLVE(get_playing_time, "esplusplayer_get_playing_time");
    RESOLVE(get_error_string, "esplusplayer_get_error_string");
    RESOLVE(set_video_stream_info, "esplusplayer_set_video_stream_info");
    RESOLVE(set_audio_stream_info, "esplusplayer_set_audio_stream_info");
    RESOLVE(add_video_stream_info, "esplusplayer_add_video_stream_info");
    RESOLVE(add_audio_stream_info, "esplusplayer_add_audio_stream_info");

#undef RESOLVE

    /*
     * Do not require destroy for the legacy add_* generation: that API may
     * expose a process-global player lifecycle. Function signatures are not
     * validated here; the typed family adapter owns all calls.
     */
    if (api->create == NULL || api->open == NULL || api->close == NULL ||
        api->prepare_async == NULL || api->start == NULL || api->stop == NULL ||
        api->submit_packet == NULL || api->set_ecore_display == NULL) {
        report_append(report, report_capacity,
                      "CORE_API: INCOMPLETE; no ESPlus calls will be made\n");
        return WMP_ESPLUS_PROBE_CORE_INCOMPLETE;
    }

    /*
     * set_ecore_display is exported by both generations in audited builds.
     * Subsurface exports are not a family discriminator either. Select only
     * from the complete, generation-specific stream-info pair.
     */
    set_pair = api->set_video_stream_info != NULL &&
               api->set_audio_stream_info != NULL;
    add_pair = api->add_video_stream_info != NULL &&
               api->add_audio_stream_info != NULL;

    if (set_pair && add_pair) {
        report_append(report, report_capacity,
                      "STREAM_API: both complete SET and ADD pairs exported; refusing to guess\n");
        return WMP_ESPLUS_PROBE_AMBIGUOUS;
    }
    if (set_pair) {
        api->selected_family = WMP_ESPLUS_FAMILY_SET;
    } else if (add_pair) {
        api->selected_family = WMP_ESPLUS_FAMILY_ADD;
    } else {
        report_append(report, report_capacity,
                      "STREAM_API: no complete SET or ADD stream-info pair\n");
        return WMP_ESPLUS_PROBE_STREAM_API_MISSING;
    }

    report_append(report, report_capacity,
                  "STREAM_API: %s family symbols detected; ABI NOT validated\n",
                  wmp_esplus_family_name(api->selected_family));
    return WMP_ESPLUS_PROBE_OK;
}

void wmp_esplus_close(wmp_esplus_api_t *api)
{
    if (api == NULL)
        return;
    if (api->library != NULL)
        (void)dlclose(api->library);
    memset(api, 0, sizeof(*api));
}
