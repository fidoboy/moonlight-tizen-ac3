/*
 * engine_avoc.c - isolated Samsung AVOC Game Mode integration.
 *
 * Tizen 5.0+ exports avoc_set_game_mode with a three-argument ABI. The first
 * argument is unused by the wrapper; save_type=1 preserves/restores the
 * setting per source rather than changing it globally.
 */
#define _GNU_SOURCE
#include "engine_avoc.h"

#include <dlfcn.h>
#include <pthread.h>

#include "mltrace.h"

typedef int (*avoc_set_game_mode_fn)(int unused, int save_type, int mode);

static pthread_mutex_t s_lock = PTHREAD_MUTEX_INITIALIZER;
static void *s_library;
static avoc_set_game_mode_fn s_set_game_mode;
static int s_lookup_attempted;
static int s_active;

static int resolve_avoc(void)
{
    const char *error;

    if (s_lookup_attempted)
        return s_library != NULL && s_set_game_mode != NULL;

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
    *(void **)(&s_set_game_mode) = dlsym(s_library, "avoc_set_game_mode");
    error = dlerror();
    if (error || !s_set_game_mode) {
        MLT("AVOC: dlsym(avoc_set_game_mode) failed: %s",
            error ? error : "symbol address is NULL");
        (void)dlclose(s_library);
        s_library = NULL;
        return 0;
    }

    MLT("AVOC: library loaded; avoc_set_game_mode resolved (three-argument ABI)");
    return 1;
}

int ml_avoc_set_game_mode(int enabled)
{
    int mode = enabled != 0;
    int rc;

    pthread_mutex_lock(&s_lock);
    if ((mode && s_active) || (!mode && !s_active)) {
        MLT("AVOC: Game Mode already %s according to last successful API return",
            s_active ? "enabled" : "restored");
        pthread_mutex_unlock(&s_lock);
        return 0;
    }
    if (!resolve_avoc()) {
        MLT("AVOC: request unavailable");
        pthread_mutex_unlock(&s_lock);
        return -1;
    }

    rc = s_set_game_mode(0, 1, mode);
    MLT("AVOC: avoc_set_game_mode(0, 1, %d) returned rc=%d", mode, rc);
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
