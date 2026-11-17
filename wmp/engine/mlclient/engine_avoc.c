/*
 * engine_avoc.c - Samsung AVOC Game Mode integration.
 *
 * Follow the working ARMv7 implementation used by WMP/moonlight-tizen50:
 *   int avoc_set_game_mode(int save_type, int mode)
 *
 * save_type=1 applies a temporary source override; save_type=0 restores the
 * stored setting. A complete off sequence sends (1,0), then (0,0).
 */
#define _GNU_SOURCE
#include "engine_avoc.h"

#include <dlfcn.h>
#include <pthread.h>

#include "mltrace.h"

typedef int (*avoc_set_game_mode_fn)(int save_type, int mode);

static pthread_mutex_t s_lock = PTHREAD_MUTEX_INITIALIZER;
static void *s_library;
static avoc_set_game_mode_fn s_set_game_mode;
static int s_lookup_attempted;
static int s_active = -1; /* -1 = unknown / retry required */

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

    MLT("AVOC: library loaded; avoc_set_game_mode resolved (ARM two-argument ABI)");
    return 1;
}

int ml_avoc_set_game_mode(int enabled)
{
    int mode = enabled != 0;
    int rc;

    pthread_mutex_lock(&s_lock);
    if (s_active == mode) {
        MLT("AVOC: Game Mode already %s according to last successful API return",
            mode ? "enabled" : "restored");
        pthread_mutex_unlock(&s_lock);
        return 0;
    }
    if (!resolve_avoc()) {
        MLT("AVOC: request unavailable");
        pthread_mutex_unlock(&s_lock);
        return -1;
    }

    if (mode) {
        rc = s_set_game_mode(0, 1);
        MLT("AVOC: avoc_set_game_mode(0, 1) returned rc=%d", rc);
    } else {
        int rc1 = s_set_game_mode(1, 0);
        int rc0 = s_set_game_mode(0, 0);
        rc = rc1 ? rc1 : rc0;
        MLT("AVOC: avoc_set_game_mode(1, 0) returned rc=%d; (0, 0) returned rc=%d",
            rc1, rc0);
    }

    s_active = rc == 0 ? mode : -1;
    if (rc == 0) {
        MLT("AVOC: API accepted %s request; TV picture mode is not independently verified",
            mode ? "Game Mode activation" : "Game Mode restoration");
    } else {
        MLT("AVOC: API rejected %s request rc=%d; state reset for retry",
            mode ? "activation" : "restoration", rc);
    }

    pthread_mutex_unlock(&s_lock);
    return rc;
}
