/*
 * engine_avoc.c - Samsung AVOC Game Mode integration.
 *
 * The UE50AU7172 libavoc.so wrappers consume incoming ARM registers r1/r2
 * as the operational arguments for avoc_set_game_mode: (save_type, mode).
 * The incoming r0 slot is not an operational argument by the examined
 * wrapper. Keep the three-argument call shape.
 *
 * Game Mode activation must issue avoc_set_game_mode(0, 1, 1) every time.
 * Do not skip the setter based on avoc_get_game_mode: that getter reports
 * Game Mode state, not whether the setter's side effects (including the TV's
 * audio-mode transition) have occurred.
 *
 * Restoration clears the source override with (0,1,0), then restores the
 * stored setting with (0,0,0).
 */
#define _GNU_SOURCE
#include "engine_avoc.h"

#include <dlfcn.h>
#include <pthread.h>

#include "mltrace.h"

typedef int (*avoc_set_game_mode_fn)(int reserved, int save_type, int mode);
typedef int (*avoc_set_cloud_game_mode_fn)(int mode);
typedef int (*avoc_get_cloud_game_mode_fn)(int *mode);

/* SetPictureMode: (reserved, display_index, mode) -> AVOC result. */
typedef int (*avoc_set_picture_mode_fn)(int reserved, int display_index, int mode);

static pthread_mutex_t s_lock = PTHREAD_MUTEX_INITIALIZER;
static void *s_library;
static avoc_set_game_mode_fn s_set_game_mode;
static int s_lookup_attempted;
static int s_active = -1; /* -1 = unknown / verification required */

/* Independent handle and symbols: the legacy Game Mode ABI remains untouched. */
static void *s_cloud_library;
static avoc_set_cloud_game_mode_fn s_set_cloud_game_mode;
static avoc_get_cloud_game_mode_fn s_get_cloud_game_mode;
static int s_cloud_lookup_attempted;

/* Independent handle and symbol for the Picture Mode API. */
static void *s_picture_library;
static avoc_set_picture_mode_fn s_set_picture_mode;
static int s_picture_lookup_attempted;

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

    MLT("AVOC: library loaded; avoc_set_game_mode resolved (3-argument ARM ABI)");
    return 1;
}

int ml_avoc_set_game_mode(int enabled)
{
    int mode = enabled != 0;
    int rc;

    pthread_mutex_lock(&s_lock);

    if (!resolve_avoc()) {
        MLT("AVOC: %s request unavailable",
            mode ? "activation" : "restoration");
        pthread_mutex_unlock(&s_lock);
        return -1;
    }

    if (mode) {
        /*
         * Always send the activation request. A getter reporting Game Mode
         * enabled is not evidence that the setter's side effects have run.
         */
        rc = s_set_game_mode(0, 1, 1);
        MLT("AVOC: avoc_set_game_mode(0, 1, 1) returned rc=%d", rc);
    } else {
        int rc1 = s_set_game_mode(0, 1, 0);
        int rc0 = s_set_game_mode(0, 0, 0);
        rc = rc1 ? rc1 : rc0;
        MLT("AVOC: avoc_set_game_mode(0, 1, 0) returned rc=%d; (0, 0, 0) returned rc=%d",
            rc1, rc0);
    }

    s_active = rc == 0 ? mode : -1;
    if (rc == 0) {
        MLT("AVOC: API accepted Game Mode %s request",
            mode ? "activation" : "restoration");
    } else {
        MLT("AVOC: API rejected Game Mode %s request rc=%d",
            mode ? "activation" : "restoration", rc);
    }

    pthread_mutex_unlock(&s_lock);
    return rc;
}


/*
 * Resolve Cloud Game Mode independently of the legacy Game Mode API.
 * ABI verified from the target libavoc.so:
 *   int avoc_set_cloud_game_mode(int mode);
 *   int avoc_get_cloud_game_mode(int *mode);
 */
static int resolve_avoc_cloud_game_mode(void)
{
    const char *error;

    if (s_cloud_lookup_attempted)
        return s_cloud_library != NULL && s_set_cloud_game_mode != NULL &&
               s_get_cloud_game_mode != NULL;

    s_cloud_lookup_attempted = 1;
    (void)dlerror();
    s_cloud_library = dlopen("libavoc.so", RTLD_NOW | RTLD_LOCAL);
    error = dlerror();
    if (!s_cloud_library) {
        MLT("AVOC Cloud Game Mode: dlopen(libavoc.so) failed: %s",
            error ? error : "no dynamic-loader diagnostic");
        return 0;
    }

    (void)dlerror();
    *(void **)(&s_set_cloud_game_mode) =
        dlsym(s_cloud_library, "avoc_set_cloud_game_mode");
    error = dlerror();
    if (error || !s_set_cloud_game_mode) {
        MLT("AVOC Cloud Game Mode: dlsym(avoc_set_cloud_game_mode) failed: %s",
            error ? error : "symbol address is NULL");
        (void)dlclose(s_cloud_library);
        s_cloud_library = NULL;
        s_set_cloud_game_mode = NULL;
        return 0;
    }

    (void)dlerror();
    *(void **)(&s_get_cloud_game_mode) =
        dlsym(s_cloud_library, "avoc_get_cloud_game_mode");
    error = dlerror();
    if (error || !s_get_cloud_game_mode) {
        MLT("AVOC Cloud Game Mode: dlsym(avoc_get_cloud_game_mode) failed: %s",
            error ? error : "symbol address is NULL");
        (void)dlclose(s_cloud_library);
        s_cloud_library = NULL;
        s_set_cloud_game_mode = NULL;
        s_get_cloud_game_mode = NULL;
        return 0;
    }

    MLT("AVOC Cloud Game Mode: both public API symbols resolved (verified ARM ABI)");
    return 1;
}

/*
 * Request Cloud Game Mode and read it back for diagnostics. The public API
 * returns the remote D-Bus 'ret' value (or a dispatcher error); its remote
 * success-code semantics are deliberately not assumed here.
 */
int ml_avoc_set_cloud_game_mode(int enabled)
{
    int mode = enabled != 0;
    int setter_rc;
    int observed_mode = -1;
    int getter_rc;

    pthread_mutex_lock(&s_lock);
    if (!resolve_avoc_cloud_game_mode()) {
        pthread_mutex_unlock(&s_lock);
        return -1;
    }

    setter_rc = s_set_cloud_game_mode(mode);
    getter_rc = s_get_cloud_game_mode(&observed_mode);
    MLT("AVOC Cloud Game Mode: set(mode=%d) -> ret=%d; get -> ret=%d, mode=%d",
        mode, setter_rc, getter_rc, observed_mode);

    pthread_mutex_unlock(&s_lock);
    return setter_rc;
}

/*
 * Resolve Picture Mode independently of both Game Mode APIs.
 * ABI reconstructed from the target libavoc.so wrapper:
 *   int avoc_set_picture_mode(int reserved, int display_index, int mode);
 * The wrapper serializes display_index and mode as the two D-Bus inputs.
 */
static int resolve_avoc_picture_mode(void)
{
    const char *error;

    if (s_picture_lookup_attempted)
        return s_picture_library != NULL && s_set_picture_mode != NULL;

    s_picture_lookup_attempted = 1;
    (void)dlerror();
    s_picture_library = dlopen("libavoc.so", RTLD_NOW | RTLD_LOCAL);
    error = dlerror();
    if (!s_picture_library) {
        MLT("AVOC Picture Mode: dlopen(libavoc.so) failed: %s",
            error ? error : "no dynamic-loader diagnostic");
        return 0;
    }

    (void)dlerror();
    *(void **)(&s_set_picture_mode) =
        dlsym(s_picture_library, "avoc_set_picture_mode");
    error = dlerror();
    if (error || !s_set_picture_mode) {
        MLT("AVOC Picture Mode: dlsym(avoc_set_picture_mode) failed: %s",
            error ? error : "symbol address is NULL");
        (void)dlclose(s_picture_library);
        s_picture_library = NULL;
        s_set_picture_mode = NULL;
        return 0;
    }

    MLT("AVOC Picture Mode: avoc_set_picture_mode resolved (3-argument ARM ABI)");
    return 1;
}

/* Set the picture mode for the requested display; mode values are AVOC enums. */
int ml_avoc_set_picture_mode(int display_index, int mode)
{
    int rc;

    pthread_mutex_lock(&s_lock);
    if (!resolve_avoc_picture_mode()) {
        pthread_mutex_unlock(&s_lock);
        return -1;
    }

    rc = s_set_picture_mode(0, display_index, mode);
    MLT("AVOC Picture Mode: set(display=%d, mode=%d) -> rc=%d",
        display_index, mode, rc);

    pthread_mutex_unlock(&s_lock);
    return rc;
}

