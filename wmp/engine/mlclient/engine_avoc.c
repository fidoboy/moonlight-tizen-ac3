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
 * Restoration clears both the source override (0,1,0) and global state (0,0,0).
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

/* Optional APIs resolved from the same shared library handle. */
static avoc_set_cloud_game_mode_fn s_set_cloud_game_mode;
static avoc_get_cloud_game_mode_fn s_get_cloud_game_mode;
static avoc_set_picture_mode_fn s_set_picture_mode;

static int resolve_avoc(void)
{
    const char *error;

    if (s_lookup_attempted)
        return s_library != NULL;

    s_lookup_attempted = 1;
    (void)dlerror();
    s_library = dlopen("libavoc.so", RTLD_NOW | RTLD_LOCAL);
    error = dlerror();
    if (!s_library) {
        MLT("AVOC: dlopen(libavoc.so) failed: %s",
            error ? error : "no dynamic-loader diagnostic");
        return 0;
    }

    /* Resolve each optional API independently from the one shared handle. */
    (void)dlerror();
    *(void **)(&s_set_game_mode) = dlsym(s_library, "avoc_set_game_mode");
    error = dlerror();
    if (error || !s_set_game_mode) {
        MLT("AVOC: dlsym(avoc_set_game_mode) failed: %s",
            error ? error : "symbol address is NULL");
        s_set_game_mode = NULL;
    }

    (void)dlerror();
    *(void **)(&s_set_cloud_game_mode) =
        dlsym(s_library, "avoc_set_cloud_game_mode");
    error = dlerror();
    if (error || !s_set_cloud_game_mode) {
        MLT("AVOC Cloud Game Mode: dlsym(avoc_set_cloud_game_mode) failed: %s",
            error ? error : "symbol address is NULL");
        s_set_cloud_game_mode = NULL;
    }

    (void)dlerror();
    *(void **)(&s_get_cloud_game_mode) =
        dlsym(s_library, "avoc_get_cloud_game_mode");
    error = dlerror();
    if (error || !s_get_cloud_game_mode) {
        MLT("AVOC Cloud Game Mode: dlsym(avoc_get_cloud_game_mode) failed: %s",
            error ? error : "symbol address is NULL");
        s_get_cloud_game_mode = NULL;
    }

    (void)dlerror();
    *(void **)(&s_set_picture_mode) =
        dlsym(s_library, "avoc_set_picture_mode");
    error = dlerror();
    if (error || !s_set_picture_mode) {
        MLT("AVOC Picture Mode: dlsym(avoc_set_picture_mode) failed: %s",
            error ? error : "symbol address is NULL");
        s_set_picture_mode = NULL;
    }

    MLT("AVOC: libavoc.so loaded once; symbols resolved independently");
    return 1;
}

int ml_avoc_set_game_mode(int enabled)
{
    int mode = enabled != 0;
    int rc;

    pthread_mutex_lock(&s_lock);

    if (!resolve_avoc() || !s_set_game_mode) {
        MLT("AVOC: Game Mode API unavailable for %s request",
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
        int source_rc;
        int global_rc;

        /* Clear both the per-source override and the global Game Mode state.
         * The source reset alone does not restore TVs whose global save_type
         * state was enabled by the (0, 0, 0) activation/restoration path. */
        source_rc = s_set_game_mode(0, 1, 0);
        MLT("AVOC: avoc_set_game_mode(0, 1, 0) source restoration returned rc=%d",
            source_rc);

        global_rc = s_set_game_mode(0, 0, 0);
        MLT("AVOC: avoc_set_game_mode(0, 0, 0) global restoration returned rc=%d",
            global_rc);

        /* Always attempt both restorations. Report failure if either failed. */
        rc = (source_rc == 0 && global_rc == 0) ? 0 :
             (source_rc != 0 ? source_rc : global_rc);
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
    if (!resolve_avoc() || !s_set_cloud_game_mode) {
        MLT("AVOC Cloud Game Mode: setter API unavailable");
        pthread_mutex_unlock(&s_lock);
        return -1;
    }

    setter_rc = s_set_cloud_game_mode(mode);
    if (s_get_cloud_game_mode) {
        getter_rc = s_get_cloud_game_mode(&observed_mode);
        MLT("AVOC Cloud Game Mode: set(mode=%d) -> ret=%d; get -> ret=%d, mode=%d",
            mode, setter_rc, getter_rc, observed_mode);
    } else {
        MLT("AVOC Cloud Game Mode: set(mode=%d) -> ret=%d; getter unavailable",
            mode, setter_rc);
    }

    pthread_mutex_unlock(&s_lock);
    return setter_rc;
}

/* Set the picture mode for the requested display; mode values are AVOC enums. */
int ml_avoc_set_picture_mode(int display_index, int mode)
{
    int rc;

    pthread_mutex_lock(&s_lock);
    if (!resolve_avoc() || !s_set_picture_mode) {
        MLT("AVOC Picture Mode: API unavailable");
        pthread_mutex_unlock(&s_lock);
        return -1;
    }

    rc = s_set_picture_mode(0, display_index, mode);
    MLT("AVOC Picture Mode: set(display=%d, mode=%d) -> rc=%d",
        display_index, mode, rc);

    pthread_mutex_unlock(&s_lock);
    return rc;
}

