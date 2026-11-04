#include "wmp_esplus_abi.h"

#include <dlfcn.h>
#include <stdarg.h>
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

static bool core_symbols_complete(const wmp_esplus_api_t *api)
{
    return api->create != NULL &&
           api->open != NULL &&
           api->close != NULL &&
           api->destroy != NULL &&
           api->prepare_async != NULL &&
           api->start != NULL &&
           api->stop != NULL &&
           api->submit_packet != NULL &&
           api->set_ecore_display != NULL;
}

wmp_esplus_probe_result_e wmp_esplus_probe(
    wmp_esplus_api_t *api,
    char *report,
    size_t report_capacity)
{
    bool set_family;
    bool add_family;

    if (api == NULL)
        return WMP_ESPLUS_PROBE_LIBRARY_MISSING;

    memset(api, 0, sizeof(*api));
    if (report != NULL && report_capacity > 0)
        report[0] = '\0';

    api->library = dlopen("libesplusplayer.so", RTLD_NOW | RTLD_LOCAL);
    if (api->library == NULL) {
        const char *error = dlerror();
        report_append(report, report_capacity,
                      "LIBRARY_LOAD_FAILED: %s\n",
                      error != NULL ? error : "dlopen returned NULL");
        return WMP_ESPLUS_PROBE_LIBRARY_MISSING;
    }

#define RESOLVE(field, symbol) \
    do { \
        api->field = resolve_symbol(api->library, symbol); \
        report_append(report, report_capacity, "%s %s\n", \
                      api->field != NULL ? "FOUND" : "MISSING", symbol); \
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
    RESOLVE(set_ecore_display, "esplusplayer_set_ecore_display");

    RESOLVE(set_video_stream_info, "esplusplayer_set_video_stream_info");
    RESOLVE(set_audio_stream_info, "esplusplayer_set_audio_stream_info");
    RESOLVE(add_video_stream_info, "esplusplayer_add_video_stream_info");
    RESOLVE(add_audio_stream_info, "esplusplayer_add_audio_stream_info");

#undef RESOLVE

    if (!core_symbols_complete(api)) {
        report_append(report, report_capacity,
                      "CORE_API: INCOMPLETE; no ESPlus calls will be made\n");
        return WMP_ESPLUS_PROBE_CORE_INCOMPLETE;
    }

    set_family = api->set_video_stream_info != NULL &&
                 api->set_audio_stream_info != NULL;
    add_family = api->add_video_stream_info != NULL &&
                 api->add_audio_stream_info != NULL;

    if (set_family) {
        /* Prefer the modern family when both complete families are present. */
        api->selected_family = WMP_ESPLUS_FAMILY_SET;
        report_append(report, report_capacity,
                      "STREAM_API: modern set_* family selected\n");
        return WMP_ESPLUS_PROBE_OK;
    }

    if (add_family) {
        api->selected_family = WMP_ESPLUS_FAMILY_ADD;
        report_append(report, report_capacity,
                      "STREAM_API: legacy add_* family selected\n");
        return WMP_ESPLUS_PROBE_OK;
    }

    report_append(report, report_capacity,
                  "STREAM_API: no complete stream-info family; unsupported\n");
    return WMP_ESPLUS_PROBE_STREAM_API_MISSING;
}

void wmp_esplus_close(wmp_esplus_api_t *api)
{
    if (api == NULL)
        return;

    if (api->library != NULL)
        (void)dlclose(api->library);

    memset(api, 0, sizeof(*api));
}
