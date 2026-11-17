/*
 * engine_avoc.c - isolated Samsung AVOC Game Mode integration.
 *
 * The legacy ESPlus ADD family uses the two-argument AVOC ABI; the modern
 * SET family uses the three-argument wrapper ABI. save_type is always 1:
 * preserve/restore the setting per source rather than changing it globally.
 */
#define _GNU_SOURCE
#include "engine_avoc.h"

#include <dlfcn.h>
#include <pthread.h>

#include "mltrace.h"

typedef int (*avoc_set_game_mode_legacy_fn)(int save_type, int mode);
typedef int (*avoc_set_game_mode_modern_fn)(int unused, int save_type, int mode);

static pthread_mutex_t s_lock = PTHREAD_MUTEX_INITIALIZER;
static void *s_library;
static avoc_set_game_mode_legacy_fn s_legacy_fn;
static avoc_set_game_mode_modern_fn s_modern_fn;
static int s_lookup_attempted;
static int s_active;
static wmp_esplus_family_e s_family = WMP_ESPLUS_FAMILY_NONE;

void ml_avoc_set_abi_family(wmp_esplus_family_e family)
{
    pthread_mutex_lock(&s_lock);
    if (family != WMP_ESPLUS_FAMILY_SET && family != WMP_ESPLUS_FAMILY_ADD)
        family = WMP_ESPLUS_FAMILY_NONE;
    if (s_family != family) {
        s_family = family;
        MLT("AVOC: ABI family set to %s", wmp_esplus_family_name(s_family));
    }
    pthread_mutex_unlock(&s_lock);
}

static int resolve_avoc(void)
{
    const char *error;

    if (s_lookup_attempted)
        return s_library != NULL &&
            ((s_family == WMP_ESPLUS_FAMILY_ADD && s_legacy_fn != NULL) ||
             (s_family == WMP_ESPLUS_FAMILY_SET && s_modern_fn != NULL));

    s_lookup_attempted = 1;
    (void)dlerror();
    s_library = dlopen("libavoc.so", RTLD_NOW | RTLD_LOCAL);
    error = dlerror();
    if (!s_library) {
        MLT("AVOC: dlopen(libavoc.so) failed: %s",
            error ? error : "no dynamic-loader diagnostic");
        return 0;
    }

    (void)dlerror();
    if (s_family == WMP_ESPLUS_FAMILY_ADD)
        *(void **)(&s_legacy_fn) = dlsym(s_library, "avoc_set_game_mode");
    else if (s_family == WMP_ESPLUS_FAMILY_SET)
        *(void **)(&s_modern_fn) = dlsym(s_library, "avoc_set_game_mode");
    error = dlerror();
    if (error || (!s_legacy_fn && !s_modern_fn)) {
        MLT("AVOC: dlsym(avoc_set_game_mode) failed: %s",
            error ? error : "symbol address is NULL");
        (void)dlclose(s_library);
        s_library = NULL;
        return 0;
    }

    MLT("AVOC: library loaded; avoc_set_game_mode resolved for %s ABI",
        wmp_esplus_family_name(s_family));
    return 1;
}

int ml_avoc_set_game_mode(int enabled)
{
    int mode = enabled != 0;
    int rc;

    pthread_mutex_lock(&s_lock);
    if (s_family != WMP_ESPLUS_FAMILY_ADD &&
        s_family != WMP_ESPLUS_FAMILY_SET) {
        MLT("AVOC: request skipped; ESPlus ABI family is unknown");
        pthread_mutex_unlock(&s_lock);
        return -1;
    }
    if ((mode && s_active) || (!mode && !s_active)) {
        MLT("AVOC: Game Mode already %s according to last successful API return",
            s_active ? "enabled" : "restored");
        pthread_mutex_unlock(&s_lock);
        return 0;
    }
    if (!resolve_avoc()) {
        MLT("AVOC: request unavailable for ABI family=%s",
            wmp_esplus_family_name(s_family));
        pthread_mutex_unlock(&s_lock);
        return -1;
    }

    if (s_family == WMP_ESPLUS_FAMILY_ADD)
        rc = s_legacy_fn(1, mode);
    else
        rc = s_modern_fn(0, 1, mode);

    MLT("AVOC: avoc_set_game_mode(%s) save_type=1 mode=%d returned rc=%d",
        wmp_esplus_family_name(s_family), mode, rc);
    if (rc == 0) {
        s_active = mode;
        MLT("AVOC: API accepted %s request; TV picture mode is not independently verified",
            mode ? "Game Mode activation" : "source-setting restoration");
    } else {
        MLT("AVOC: API rejected %s request rc=%d; state retained for possible retry",
            mode ? "activation" : "restoration", rc);
    }
    pthread_mutex_unlock(&s_lock);
    return rc;
}
