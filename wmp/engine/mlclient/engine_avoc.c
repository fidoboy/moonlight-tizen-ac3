/*
 * engine_avoc.c - Samsung AVOC Game Mode integration for native WMP/ESPlus.
 *
 * The streaming path owns one process-lifetime libavoc.so handle and resolves
 * avoc_set_game_mode once. The setter is called after LiStartConnectionEx
 * succeeds and restored after the ESPlus player is released.
 *
 * In MLT_TRACE builds only, a successful setter call is followed by
 * avoc_check_game_mode() and avoc_get_game_mode(save_type, &mode). These
 * calls are diagnostic: they report AVOC's check result and the observed
 * mode, but never change retry policy or stream state.
 *
 * Cloud Game Mode and standalone Picture Mode wrappers are retained below as
 * a commented reference block. They are intentionally not compiled, resolved,
 * or called by the current integration; they may be reconsidered if a future
 * feature establishes a need for them.
 */
#define _GNU_SOURCE
#include "engine_avoc.h"

#include <dlfcn.h>
#include <pthread.h>
#include <unistd.h>
#include <tizen_error.h>

#include "mltrace.h"

typedef int (*avoc_set_game_mode_fn)(int save_type, int on);
#ifdef MLT_TRACE
typedef int (*avoc_check_game_mode_fn)(void);
/* Getter ABI: save_type and mode output pointer. */
typedef int (*avoc_get_game_mode_fn)(int save_type, int *mode);
#endif

static pthread_mutex_t s_lock = PTHREAD_MUTEX_INITIALIZER;
static void *s_library;
static avoc_set_game_mode_fn s_set_game_mode;
static int s_lookup_attempted;
#ifdef MLT_TRACE
static avoc_check_game_mode_fn s_check_game_mode;
static avoc_get_game_mode_fn s_get_game_mode;
#endif

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

    /* The sole AVOC setter used by the streaming integration. */
    (void)dlerror();
    *(void **)(&s_set_game_mode) = dlsym(s_library, "avoc_set_game_mode");
    error = dlerror();
    if (error || !s_set_game_mode) {
        MLT("AVOC: dlsym(avoc_set_game_mode) failed: %s",
            error ? error : "symbol address is NULL");
        s_set_game_mode = NULL;
    }

#ifdef MLT_TRACE
    /*
     * Diagnostic-only APIs: resolve them only in trace-enabled builds.
     * They are invoked only after avoc_set_game_mode() returns zero.
     */
    (void)dlerror();
    *(void **)(&s_check_game_mode) = dlsym(s_library, "avoc_check_game_mode");
    error = dlerror();
    if (error || !s_check_game_mode) {
        MLT("AVOC debug: dlsym(avoc_check_game_mode) failed: %s",
            error ? error : "symbol address is NULL");
        s_check_game_mode = NULL;
    }

    (void)dlerror();
    *(void **)(&s_get_game_mode) = dlsym(s_library, "avoc_get_game_mode");
    error = dlerror();
    if (error || !s_get_game_mode) {
        MLT("AVOC debug: dlsym(avoc_get_game_mode) failed: %s",
            error ? error : "symbol address is NULL");
        s_get_game_mode = NULL;
    }
#endif

    MLT("AVOC: libavoc.so loaded once; required setter resolved");
    return 1;
}

int ml_avoc_set_game_mode_with_retry(int save_type, int on, int max_retries)
{
    int rc = -1;
    int attempt;

    if (max_retries < 0)
        max_retries = 0;

    pthread_mutex_lock(&s_lock);

    if (!resolve_avoc() || !s_set_game_mode) {
        MLT("AVOC: Game Mode API unavailable for save_type=%d, on=%d request",
            save_type, on);
        pthread_mutex_unlock(&s_lock);
        return -1;
    }

    for (attempt = 0; attempt <= max_retries; ++attempt) {
        rc = s_set_game_mode(save_type, on);
        MLT("AVOC: avoc_set_game_mode(%d, %d) attempt %d/%d returned rc=%d",
            save_type, on, attempt + 1, max_retries + 1, rc);

        if (rc == 0)
            break;

        if (rc != -2 || attempt == max_retries)
            break;

        MLT("AVOC: transient error -2; retrying in 200 ms");
        usleep(200 * 1000);
    }

    if (rc != 0) {
        const char *message = get_error_message(rc);
        MLT("AVOC: avoc_set_game_mode(%d, %d) failed after %d attempt(s): ret=%d (%s)",
            save_type, on, attempt + 1, rc,
            message ? message : "unknown");
    } else {
        MLT("AVOC: Game Mode %s request accepted (save_type=%d)",
            on ? "activation" : "restoration", save_type);
#ifdef MLT_TRACE
        /*
         * Keep the verification calls strictly diagnostic and debug-only.
         * avoc_check_game_mode returns its own AVOC result; the getter has a
         * separate return value and writes the observed state to mode.
         */
        if (s_check_game_mode) {
            int check_rc = s_check_game_mode();
            MLT("AVOC debug: avoc_check_game_mode() -> ret=%d", check_rc);
        } else {
            MLT("AVOC debug: avoc_check_game_mode unavailable");
        }

        if (s_get_game_mode) {
            int observed_mode = -1;
            int get_rc = s_get_game_mode(save_type, &observed_mode);
            MLT("AVOC debug: avoc_get_game_mode(%d, &mode) -> ret=%d, mode=%d",
                save_type, get_rc, observed_mode);
        } else {
            MLT("AVOC debug: avoc_get_game_mode unavailable");
        }
#endif
    }

    pthread_mutex_unlock(&s_lock);
    return rc;
}

/*
 * -------------------------------------------------------------------------
 * RETAINED AVOC REFERENCE IMPLEMENTATIONS — CURRENTLY DISABLED
 *
 * The following Cloud Game Mode and standalone Picture Mode wrappers are
 * intentionally kept as comments rather than deleted. They are not compiled,
 * their symbols are not resolved, and the WMP/ESPlus stream lifecycle does
 * not call them. Keep this block only as implementation history/reference;
 * re-enable or adapt it only after a future feature explicitly requires it.
 *
 * /*
 *  * Request Cloud Game Mode and read it back for diagnostics. The public API
 *  * returns the remote D-Bus 'ret' value (or a dispatcher error); its remote
 *  * success-code semantics are deliberately not assumed here.
 *  */
 * int ml_avoc_set_cloud_game_mode(int enabled)
 * {
 *     int mode = enabled != 0;
 *     int setter_rc;
 *     int observed_mode = -1;
 *     int getter_rc;
 * 
 *     pthread_mutex_lock(&s_lock);
 *     if (!resolve_avoc() || !s_set_cloud_game_mode) {
 *         MLT("AVOC Cloud Game Mode: setter API unavailable");
 *         pthread_mutex_unlock(&s_lock);
 *         return -1;
 *     }
 * 
 *     setter_rc = s_set_cloud_game_mode(mode);
 *     if (s_get_cloud_game_mode) {
 *         getter_rc = s_get_cloud_game_mode(&observed_mode);
 *         MLT("AVOC Cloud Game Mode: set(mode=%d) -> ret=%d; get -> ret=%d, mode=%d",
 *             mode, setter_rc, getter_rc, observed_mode);
 *     } else {
 *         MLT("AVOC Cloud Game Mode: set(mode=%d) -> ret=%d; getter unavailable",
 *             mode, setter_rc);
 *     }
 * 
 *     pthread_mutex_unlock(&s_lock);
 *     return setter_rc;
 * }
 * 
 * /* Set picture mode for the requested display. Known mode values from ExLink:\n * 4 = Standard; 3 = Dynamic. Mode 1 is the current candidate for Game,\n * not yet verified. These ExLink values are evidence, not confirmed AVOC enums. */
 * int ml_avoc_set_picture_mode(int display_index, int mode)
 * {
 *     int rc;
 * 
 *     pthread_mutex_lock(&s_lock);
 *     if (!resolve_avoc() || !s_set_picture_mode) {
 *         MLT("AVOC Picture Mode: API unavailable");
 *         pthread_mutex_unlock(&s_lock);
 *         return -1;
 *     }
 * 
 *     rc = s_set_picture_mode(0, display_index, mode);
 *     MLT("AVOC Picture Mode: set(display=%d, mode=%d) -> rc=%d",
 *         display_index, mode, rc);
 * 
 *     pthread_mutex_unlock(&s_lock);
 *     return rc;
 * }
 *
 * -------------------------------------------------------------------------
 */
