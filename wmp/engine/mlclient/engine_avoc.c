/*
 * engine_avoc.c - Samsung AVOC Game Mode integration.
 *
 * The UE50AU7172 libavoc.so wrappers consume incoming ARM registers r1/r2
 * as the operational arguments. For avoc_set_game_mode these are
 * (save_type, mode); for avoc_get_game_mode they are (save_type, mode*).
 * The incoming r0 slot is not used as an operational argument by the
 * examined wrappers. Keep the three-argument call shapes.
 *
 * Game Mode state is read from avoc_get_game_mode: mode=1 means enabled,
 * mode=0 means disabled. Its function return is a separate AVOC result.
 * The getter uses save_type=1 here to query the same setting domain used
 * by the activation request (avoc_set_game_mode(0, 1, 1)).
 *
 * Activation uses save_type=1 (temporary source override), matching the
 * source-specific Game Mode domain. Restoration clears that override with
 * (1,0), then restores the stored setting with (0,0).
 */
#define _GNU_SOURCE
#include "engine_avoc.h"

#include <dlfcn.h>
#include <pthread.h>

#include "mltrace.h"

typedef int (*avoc_set_game_mode_fn)(int reserved, int save_type, int mode);
typedef int (*avoc_get_game_mode_fn)(int reserved, int save_type, int *mode);

static pthread_mutex_t s_lock = PTHREAD_MUTEX_INITIALIZER;
static void *s_library;
static avoc_set_game_mode_fn s_set_game_mode;
static avoc_get_game_mode_fn s_get_game_mode;
static int s_lookup_attempted;
static int s_active = -1; /* -1 = unknown / verification required */

static int resolve_avoc(void)
{
    const char *error;

    if (s_lookup_attempted)
        return s_library != NULL && s_set_game_mode != NULL &&
               s_get_game_mode != NULL;

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

    (void)dlerror();
    *(void **)(&s_get_game_mode) = dlsym(s_library, "avoc_get_game_mode");
    error = dlerror();
    if (error || !s_get_game_mode) {
        MLT("AVOC: dlsym(avoc_get_game_mode) failed: %s",
            error ? error : "symbol address is NULL");
        (void)dlclose(s_library);
        s_library = NULL;
        s_set_game_mode = NULL;
        return 0;
    }

    MLT("AVOC: library loaded; set_game_mode and get_game_mode resolved (3-argument ARM ABI)");
    return 1;
}

/*
 * Returns the AVOC method result. The current Game Mode state is written
 * separately to *mode: 1=enabled, 0=disabled. Any other value is unknown.
 */
static int query_game_mode(int save_type, int *mode)
{
    int rc;

    *mode = -1;
    rc = s_get_game_mode(0, save_type, mode);
    if (rc != 0) {
        MLT("AVOC: avoc_get_game_mode(0, %d, &mode) returned rc=%d", save_type, rc);
        return rc;
    }

    MLT("AVOC: avoc_get_game_mode(0, %d, &mode) -> rc=0, mode=%d", save_type, *mode);
    if (*mode != 0 && *mode != 1) {
        MLT("AVOC: unexpected Game Mode value=%d; state remains unknown", *mode);
        return -1;
    }

    return 0;
}

int ml_avoc_set_game_mode(int enabled)
{
    int mode = enabled != 0;
    int rc;

    pthread_mutex_lock(&s_lock);

    /* Never trust a cached activation: verify the TV's current state. */
    if (mode) {
        int current_mode;
        int query_rc;

        if (!resolve_avoc()) {
            MLT("AVOC: activation request unavailable");
            pthread_mutex_unlock(&s_lock);
            return -1;
        }

        query_rc = query_game_mode(1, &current_mode);
        if (query_rc == 0 && current_mode == 1) {
            s_active = 1;
            MLT("AVOC: Game Mode already enabled on TV; no activation call needed");
            pthread_mutex_unlock(&s_lock);
            return 0;
        }
        if (query_rc != 0) {
            /*
             * A failed read is not evidence that Game Mode is disabled.
             * Still issue the requested activation once; the post-call
             * query below must confirm the resulting state.
             */
            MLT("AVOC: pre-activation state unknown (rc=%d); issuing activation request anyway",
                query_rc);
        }

        rc = s_set_game_mode(0, 1, 1);
        MLT("AVOC: avoc_set_game_mode(0, 1, 1) returned rc=%d", rc);

        query_rc = query_game_mode(1, &current_mode);
        if (query_rc != 0) {
            s_active = -1;
            MLT("AVOC: activation result is unverified because the state query failed");
            pthread_mutex_unlock(&s_lock);
            return query_rc;
        }

        if (current_mode == 1) {
            s_active = 1;
            MLT("AVOC: TV confirms Game Mode enabled (mode=1)");
            pthread_mutex_unlock(&s_lock);
            return 0;
        }

        s_active = -1;
        MLT("AVOC: TV still reports Game Mode disabled (mode=0); activation retry required");
        pthread_mutex_unlock(&s_lock);

        /*
         * engine_api.c retries only transient -2 results. Use that signal
         * when the setter returned success (or -2) but the TV still reports
         * mode=0. Preserve other setter errors.
         */
        return (rc == 0 || rc == -2) ? -2 : rc;
    }

    if (s_active == 0) {
        MLT("AVOC: Game Mode restoration already completed according to the last API result");
        pthread_mutex_unlock(&s_lock);
        return 0;
    }

    if (!resolve_avoc()) {
        MLT("AVOC: restoration request unavailable");
        pthread_mutex_unlock(&s_lock);
        return -1;
    }

    {
        int rc1 = s_set_game_mode(0, 1, 0);
        int rc0 = s_set_game_mode(0, 0, 0);
        rc = rc1 ? rc1 : rc0;
        MLT("AVOC: avoc_set_game_mode(0, 1, 0) returned rc=%d; (0, 0, 0) returned rc=%d",
            rc1, rc0);
    }

    s_active = rc == 0 ? 0 : -1;
    if (rc == 0) {
        MLT("AVOC: API accepted Game Mode restoration request");
    } else {
        MLT("AVOC: API rejected Game Mode restoration rc=%d; state reset for retry",
            rc);
    }

    pthread_mutex_unlock(&s_lock);
    return rc;
}
