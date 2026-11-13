/*
 * esplus_player.c - shared native ESPlus player lifecycle for the WMP sinks.
 * The selected ADD or SET ABI is resolved once and all native calls pass
 * through the project-owned typed adapter. Moonlight Common C owns session
 * validity and disconnection; this module does not run a session watchdog,
 * issue recovery seeks, or infer that a session should be aborted.
 */
#include <pthread.h>
#include <stdint.h>
#include <limits.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <time.h>
#include <dlfcn.h>

#include "esplus_player.h"
#include "Limelight.h"
#include "esplus_stats.h"
#include "mldiag.h"
#include "mltrace.h"

/*
 * Ecore is provided by the TV firmware. Load it at runtime instead of linking
 * against it: Ecore_Wl2 pulls in a large firmware-specific EFL/Wayland/TBM
 * dependency tree that should not become a build-time sysroot requirement.
 */
static void *s_ecore_lib, *s_ecore_wl2_lib;
static int (*p_ecore_init)(void);
static int (*p_ecore_shutdown)(void);
static int (*p_ecore_wl2_init)(void);
static int (*p_ecore_wl2_shutdown)(void);
static void *(*p_ecore_wl2_display_connect)(const char *);
static void (*p_ecore_wl2_display_disconnect)(void *);
static void *(*p_ecore_wl2_window_new)(void *, void *, int, int, int, int);
static void (*p_ecore_wl2_window_show)(void *);
static void (*p_ecore_wl2_window_lower)(void *);
static void (*p_ecore_wl2_window_alpha_set)(void *, unsigned char);
static void (*p_ecore_wl2_window_free)(void *);
static void (*p_ecore_wl2_display_flush)(void *);
static void (*p_ecore_wl2_display_screen_size_get)(void *, int *, int *);
static void (*p_ecore_wl2_display_sync)(void *);
static void *(*p_ecore_main_loop_thread_safe_call_sync)(void *(*)(void *), void *);

#define ecore_init p_ecore_init
#define ecore_shutdown p_ecore_shutdown
#define ecore_wl2_init p_ecore_wl2_init
#define ecore_wl2_shutdown p_ecore_wl2_shutdown
#define ecore_wl2_display_connect p_ecore_wl2_display_connect
#define ecore_wl2_display_disconnect p_ecore_wl2_display_disconnect
#define ecore_wl2_window_new p_ecore_wl2_window_new
#define ecore_wl2_window_show p_ecore_wl2_window_show
#define ecore_wl2_window_lower p_ecore_wl2_window_lower
#define ecore_wl2_window_alpha_set p_ecore_wl2_window_alpha_set
#define ecore_wl2_window_free p_ecore_wl2_window_free
#define ecore_wl2_display_flush p_ecore_wl2_display_flush
#define ecore_wl2_display_screen_size_get p_ecore_wl2_display_screen_size_get
#define ecore_wl2_display_sync p_ecore_wl2_display_sync
#define ecore_main_loop_thread_safe_call_sync p_ecore_main_loop_thread_safe_call_sync

#define LOAD_ECORE(handle, symbol) do { \
    *(void **)(&p_##symbol) = dlsym((handle), #symbol); \
    if (!p_##symbol) goto fail; \
} while (0)

static int ecore_runtime_load(void)
{
    const char *error;
    if (s_ecore_lib && s_ecore_wl2_lib) return 1;
    s_ecore_lib = dlopen("libecore.so.1", RTLD_NOW | RTLD_LOCAL);
    if (!s_ecore_lib) goto fail;
    s_ecore_wl2_lib = dlopen("libecore_wl2.so.1", RTLD_NOW | RTLD_LOCAL);
    if (!s_ecore_wl2_lib) goto fail;

    LOAD_ECORE(s_ecore_lib, ecore_init);
    LOAD_ECORE(s_ecore_lib, ecore_shutdown);
    LOAD_ECORE(s_ecore_lib, ecore_main_loop_thread_safe_call_sync);
    LOAD_ECORE(s_ecore_wl2_lib, ecore_wl2_init);
    LOAD_ECORE(s_ecore_wl2_lib, ecore_wl2_shutdown);
    LOAD_ECORE(s_ecore_wl2_lib, ecore_wl2_display_connect);
    LOAD_ECORE(s_ecore_wl2_lib, ecore_wl2_display_disconnect);
    LOAD_ECORE(s_ecore_wl2_lib, ecore_wl2_window_new);
    LOAD_ECORE(s_ecore_wl2_lib, ecore_wl2_window_show);
    /* Added in Tizen 6.0 EFL 1.24; optional for older firmware. */
    *(void **)(&p_ecore_wl2_window_lower) =
        dlsym(s_ecore_wl2_lib, "ecore_wl2_window_lower");
    LOAD_ECORE(s_ecore_wl2_lib, ecore_wl2_window_alpha_set);
    LOAD_ECORE(s_ecore_wl2_lib, ecore_wl2_window_free);
    LOAD_ECORE(s_ecore_wl2_lib, ecore_wl2_display_flush);

    *(void **)(&p_ecore_wl2_display_screen_size_get) =
        dlsym(s_ecore_wl2_lib, "ecore_wl2_display_screen_size_get");
    *(void **)(&p_ecore_wl2_display_sync) =
        dlsym(s_ecore_wl2_lib, "ecore_wl2_display_sync");
    return 1;

fail:
    error = dlerror();
    fprintf(stderr, "[esplus] Ecore runtime unavailable: %s\n",
            error ? error : "missing symbol");
    if (s_ecore_wl2_lib) dlclose(s_ecore_wl2_lib);
    if (s_ecore_lib) dlclose(s_ecore_lib);
    s_ecore_wl2_lib = s_ecore_lib = NULL;
    return 0;
}

static void ecore_runtime_unload(void)
{
    if (s_ecore_wl2_lib) dlclose(s_ecore_wl2_lib);
    if (s_ecore_lib) dlclose(s_ecore_lib);
    s_ecore_wl2_lib = s_ecore_lib = NULL;
}

#define PLOG(...) MLT("esplus: " __VA_ARGS__)

static wmp_esplus_api_t s_api;
static wmp_esplus_adapter_t s_adapter;
static void *s_pl;
static void *s_disp, *s_win;
static int s_ecore;
static pthread_mutex_t s_lock = PTHREAD_MUTEX_INITIALIZER;
static pthread_cond_t s_state_cv = PTHREAD_COND_INITIALIZER;
static volatile int s_prepared, s_prepare_ok, s_started;
static int s_video_ready;
static int s_audio_ready;
static int s_prepare_failed, s_start_failed;
static int s_start_tried, s_player_closing;
static volatile int s_player_error;
static volatile int s_prepare_called;
static int s_audio_enabled = 1;
static int s_audio_registration_done;
static int s_prepare_requested;
static int s_prepare_started;
static uint64_t s_idr_t0, s_idr_last;
static unsigned s_idr_n, s_video_tries;
#define IDR_FIRST_MS 300
#define IDR_EVERY_MS 500
#define IDR_MAX 10

extern void LiRequestIdrFrame(void);

esplus_stats_t esplus_stats;
esplus_cfg_t esplus_cfg;

static uint64_t s_last_video_pts_ms, s_last_audio_pts_ms;
static uint64_t s_fps_t0;
static uint32_t s_fps_sub0;
static int64_t s_corr_us;
static volatile int32_t s_corr_ms;
static uint64_t s_tick_prev_ms;
static volatile uint32_t s_tick_seq;

static pthread_t s_smp_th;
static pthread_mutex_t s_smp_mu = PTHREAD_MUTEX_INITIALIZER;
static pthread_cond_t s_smp_cv;
static int s_smp_run, s_smp_stop;

static int mlc_env_int(const char *name, int def)
{
    const char *v = getenv(name);
    char *end;
    long n;
    if (!v || !*v) return def;
    n = strtol(v, &end, 10);
    return *end || n < 0 ? def : (int)n;
}

static void load_cfg(void)
{
    const char *m = getenv("MLENGINE_LATENCY_MODE");
    const char *game_mode = getenv("MLENGINE_GAME_MODE");
    /* Game Mode uses arrival-based PTS for both SET and ADD. The ADD-only
     * playback-clock nudge is unavailable on SET and is not a portable policy. */
    esplus_cfg.latency_mode = (game_mode && !strcmp(game_mode, "1")) ? ESPLUS_LAT_ARRIVAL :
        (!m ? ESPLUS_LAT_OFF :
        !strcmp(m, "nudge") ? ESPLUS_LAT_NUDGE :
        !strcmp(m, "arrival") ? ESPLUS_LAT_ARRIVAL : ESPLUS_LAT_OFF);
    esplus_cfg.target_depth_ms = mlc_env_int("MLENGINE_TARGET_DEPTH_MS", 50);
    esplus_cfg.nudge_max_ms_per_s = mlc_env_int("MLENGINE_NUDGE_MAX_MS_PER_S", 10);
    esplus_cfg.drop_after_ms = mlc_env_int("MLENGINE_DROP_AFTER_MS", 0);
    esplus_cfg.depth_poll_ms = mlc_env_int("MLENGINE_DEPTH_POLL_MS", 250);
    /* Arrival timestamps need no player query; nudge requires the optional ADD query. */
    if (esplus_cfg.latency_mode == ESPLUS_LAT_NUDGE &&
        (s_api.selected_family != WMP_ESPLUS_FAMILY_ADD || !s_api.get_playing_time))
        esplus_cfg.latency_mode = ESPLUS_LAT_OFF;
    MLT("cfg latency=%d target=%d nudge=%d drop_after=%d poll=%d family=%s",
        esplus_cfg.latency_mode, esplus_cfg.target_depth_ms,
        esplus_cfg.nudge_max_ms_per_s, esplus_cfg.drop_after_ms,
        esplus_cfg.depth_poll_ms, wmp_esplus_family_name(s_api.selected_family));
}

static void nudge(int32_t depth, uint64_t now_ms)
{
    int64_t err, hyst, step;
    if (esplus_cfg.latency_mode != ESPLUS_LAT_NUDGE) return;
    if (!s_tick_prev_ms) return;
    err = (int64_t)depth - esplus_cfg.target_depth_ms;
    hyst = esplus_cfg.target_depth_ms / 2;
    if (hyst < 10) hyst = 10;
    step = (int64_t)esplus_cfg.nudge_max_ms_per_s *
           (int64_t)(now_ms - s_tick_prev_ms);
    if (err > hyst) s_corr_us += err * 1000 < step ? err * 1000 : step;
    else if (err < -hyst) s_corr_us -= -err * 1000 < step ? -err * 1000 : step;
    if (s_corr_us > 1000000) s_corr_us = 1000000;
    if (s_corr_us < -1000000) s_corr_us = -1000000;
    s_corr_ms = (int32_t)((s_corr_us + (s_corr_us < 0 ? -500 : 500)) / 1000);
}

int32_t esplus_correction_ms(void) { return s_corr_ms; }
uint32_t esplus_sample_seq(void) { return s_tick_seq; }

uint64_t esplus_mono_ms(void)
{
    struct timespec t;
    clock_gettime(CLOCK_MONOTONIC, &t);
    return (uint64_t)t.tv_sec * 1000 + (uint64_t)t.tv_nsec / 1000000;
}

/* Observational sampler only: no stall detection, recovery seek or session decision. */
void esplus_sample_tick(uint64_t now_ms)
{
    uint64_t play;
    int request_idr = 0;
    pthread_mutex_lock(&s_lock);
    if (s_pl && __atomic_load_n(&s_started, __ATOMIC_ACQUIRE)) {
        /*
         * SET does not export get_playing_time(). Keep playback-clock-derived
         * depth unavailable on that ABI, but calculate accepted video FPS
         * independently so the metric works for both SET and legacy ADD.
         */
        if (wmp_esplus_adapter_get_playing_time(&s_adapter, &play)) {
            esplus_stats.playing_ms = play > UINT32_MAX ? UINT32_MAX : (uint32_t)play;
            esplus_stats.depth_ms = (int32_t)(s_last_video_pts_ms - play);
            esplus_stats.audio_depth_ms = (int32_t)(s_last_audio_pts_ms - play);
            if (play > 0) nudge(esplus_stats.depth_ms, now_ms);
            s_tick_prev_ms = now_ms;
            MLT("stats depth=%dms audio=%dms playing=%u",
                esplus_stats.depth_ms, esplus_stats.audio_depth_ms,
                esplus_stats.playing_ms);
        }

        {
            uint32_t submitted = __atomic_load_n(&esplus_stats.submitted, __ATOMIC_RELAXED);
            if (submitted > 0) {
                if (!s_fps_t0) {
                    s_fps_t0 = now_ms;
                    s_fps_sub0 = submitted;
                } else if (now_ms > s_fps_t0 && now_ms - s_fps_t0 >= 1000) {
                    uint64_t elapsed = now_ms - s_fps_t0;
                    uint32_t accepted = submitted - s_fps_sub0;
                    esplus_stats.fps_submitted =
                        (uint32_t)(((uint64_t)accepted * 1000ull) / elapsed);
                    s_fps_t0 = now_ms;
                    s_fps_sub0 = submitted;
                }
            }
        }
    }
    /* Retry the initial IDR request while no video packet has reached the player.
     * This only asks the host for a keyframe; it never changes session state. */
    if (s_pl && s_prepare_called && s_video_tries == 0 && s_idr_n < IDR_MAX) {
        if (!s_idr_t0) s_idr_t0 = now_ms;
        else if (now_ms - s_idr_t0 >= IDR_FIRST_MS &&
                 (!s_idr_last || now_ms - s_idr_last >= IDR_EVERY_MS)) {
            s_idr_last = now_ms;
            ++s_idr_n;
            request_idr = 1;
            MLT("no video packet yet: IDR request retry #%u", s_idr_n);
        }
    }
    ++s_tick_seq;
    pthread_mutex_unlock(&s_lock);
    if (request_idr) LiRequestIdrFrame();
}

static void *sampler(void *arg)
{
    (void)arg;
    pthread_mutex_lock(&s_smp_mu);
    while (!s_smp_stop) {
        struct timespec t;
        clock_gettime(CLOCK_MONOTONIC, &t);
        t.tv_sec += esplus_cfg.depth_poll_ms / 1000;
        t.tv_nsec += (long)(esplus_cfg.depth_poll_ms % 1000) * 1000000L;
        if (t.tv_nsec >= 1000000000L) {
            ++t.tv_sec;
            t.tv_nsec -= 1000000000L;
        }
        if (pthread_cond_timedwait(&s_smp_cv, &s_smp_mu, &t) == 0 || s_smp_stop)
            continue;
        pthread_mutex_unlock(&s_smp_mu);
        esplus_sample_tick(esplus_mono_ms());
        pthread_mutex_lock(&s_smp_mu);
    }
    pthread_mutex_unlock(&s_smp_mu);
    return NULL;
}

static void sampler_start(void)
{
    pthread_condattr_t attr;
    if (s_smp_run || esplus_cfg.depth_poll_ms < 50)
        return;
    pthread_condattr_init(&attr);
    pthread_condattr_setclock(&attr, CLOCK_MONOTONIC);
    pthread_cond_init(&s_smp_cv, &attr);
    pthread_condattr_destroy(&attr);
    s_smp_stop = 0;
    s_smp_run = pthread_create(&s_smp_th, NULL, sampler, NULL) == 0;
    MLT("sampler start -> %d", s_smp_run);
}

static void sampler_stop(void)
{
    if (!s_smp_run) return;
    pthread_mutex_lock(&s_smp_mu);
    s_smp_stop = 1;
    pthread_cond_signal(&s_smp_cv);
    pthread_mutex_unlock(&s_smp_mu);
    pthread_join(s_smp_th, NULL);
    pthread_cond_destroy(&s_smp_cv);
    s_smp_run = 0;
    MLT("sampler stopped");
}

static void on_prepared(bool ok, void *context)
{
    int report_failure = 0;
    (void)context;
    pthread_mutex_lock(&s_lock);
    MLT("stage prepare_async_done callback ENTER ok=%d prepared_before=%d start_tried=%d",
        ok ? 1 : 0, s_prepared, s_start_tried);
    s_prepare_ok = ok ? 1 : 0;
    s_prepared = 1;
    if (!ok) {
        s_prepare_failed = 1;
        if (!__atomic_load_n(&s_player_closing, __ATOMIC_ACQUIRE))
            report_failure = !__atomic_exchange_n(&s_player_error, 1, __ATOMIC_ACQ_REL);
    }
    pthread_cond_broadcast(&s_state_cv);
    pthread_mutex_unlock(&s_lock);

    mldiag_player("pdone", ok ? 1 : 0);
    if (!ok) {
        fprintf(stderr, "[esplus] prepare_async_done reported false; start() will not be called\n");
        PLOG("prepare_async_done reported false; start() will not be called\n");
        MLT("prepare_async_done=false; start skipped");
        if (report_failure && !__atomic_load_n(&s_player_closing, __ATOMIC_ACQUIRE))
            LiReportVideoRendererError();
        return;
    }
    PLOG("callback prepare_async_done=true\n");
    MLT("cb prepare_async_done=true");
}
static void on_ready(wmp_esplus_stream_e stream, void *context)
{
    (void)context;
    pthread_mutex_lock(&s_lock);
    MLT("stage ready_to_prepare callback ENTER stream=%d", (int)stream);
    if (!__atomic_load_n(&s_player_closing, __ATOMIC_ACQUIRE)) {
        if (stream == WMP_ESPLUS_STREAM_VIDEO) {
            s_video_ready = 1;
            MLT("ready_to_prepare(STREAM_VIDEO)");
        }
        else if (stream == WMP_ESPLUS_STREAM_AUDIO) {
            s_audio_ready = 1;
            MLT("ready_to_prepare(STREAM_AUDIO)");
        }
        pthread_cond_broadcast(&s_state_cv);
    }
    pthread_mutex_unlock(&s_lock);
    PLOG("callback ready_to_prepare stream=%d\n", (int)stream);
    MLT("cb ready_to_prepare stream=%d", (int)stream);
}
static void on_error(int error, void *context)
{
    const char *description;
    int report_failure = 0;
    (void)context;

    description = wmp_esplus_adapter_get_error_string(&s_adapter, error);
    __atomic_fetch_add(&esplus_stats.errors, 1, __ATOMIC_RELAXED);
    __atomic_store_n(&esplus_stats.last_error, (uint32_t)error, __ATOMIC_RELAXED);

    /* ESPlusPlayer may invoke this on its own thread. Never tear down the
     * player from the callback: latch the error and ask Common C to terminate
     * through its normal asynchronous connectionTerminated path. */
    if (!__atomic_load_n(&s_player_closing, __ATOMIC_ACQUIRE)) {
        report_failure = !__atomic_exchange_n(&s_player_error, 1, __ATOMIC_ACQ_REL);
        if (pthread_mutex_trylock(&s_lock) == 0) {
            if (!__atomic_load_n(&s_player_closing, __ATOMIC_ACQUIRE))
                s_prepare_failed = 1;
            pthread_cond_broadcast(&s_state_cv);
            pthread_mutex_unlock(&s_lock);
        }
        else {
            /* submit may hold s_lock while the native API calls back inline.
             * The atomic error flag is checked immediately after that call. */
            pthread_cond_broadcast(&s_state_cv);
        }
    }

    fprintf(stderr, "[esplus] player error code=0x%08x (%d) description=%s\n",
            (unsigned)error, error, description ? description : "unavailable");
    PLOG("player error code=0x%08x (%d) description=%s\n",
         (unsigned)error, error, description ? description : "unavailable");
    MLT("cb player error code=0x%08x (%d) description=%s",
        (unsigned)error, error, description ? description : "unavailable");
    if (report_failure && !__atomic_load_n(&s_player_closing, __ATOMIC_ACQUIRE))
        LiReportVideoRendererError();
}
static void on_buffer(wmp_esplus_stream_e stream, wmp_esplus_buffer_status_e status, void *context)
{
    (void)context;
    /*
     * The overlay reports video queue events. Samsung defines UNDERRUN as
     * the ES packet queue becoming empty; it is not a dropped frame or proof
     * of a visible playback stall. Ignore audio notifications here so this
     * video statistic cannot mix two independent stream queues.
     */
    if (stream != WMP_ESPLUS_STREAM_VIDEO)
        return;
    if (status == WMP_ESPLUS_BUFFER_STATUS_UNDERRUN)
        __atomic_fetch_add(&esplus_stats.underruns, 1, __ATOMIC_RELAXED);
    else if (status == WMP_ESPLUS_BUFFER_STATUS_OVERRUN)
        __atomic_fetch_add(&esplus_stats.overruns, 1, __ATOMIC_RELAXED);
}
static void on_seek_done(void *context) { (void)context; MLT("cb seek_done"); }
static void on_eos(void *context) { (void)context; MLT("cb eos"); }
static void on_conflict(void *context)
{
    (void)context;
    /* Record the native condition; Common C remains responsible for session state. */
    __atomic_store_n(&esplus_stats.recovery_state, 2, __ATOMIC_RELAXED);
    fprintf(stderr, "[esplus] resource conflict\n");
    PLOG("resource conflict\n");
    MLT("cb resource_conflicted");
}

int esplus_create_open(void)
{
    char report[2048];
    wmp_esplus_probe_result_e probe;
    wmp_esplus_call_result_t opened;
    wmp_esplus_callbacks_t callbacks;

    pthread_mutex_lock(&s_lock);
    if (__atomic_load_n(&s_player_closing, __ATOMIC_ACQUIRE)) {
        pthread_mutex_unlock(&s_lock);
        return 0;
    }
    if (s_pl) {
        pthread_mutex_unlock(&s_lock);
        return 1;
    }

    memset(&s_api, 0, sizeof(s_api));
    memset(&s_adapter, 0, sizeof(s_adapter));
    memset(report, 0, sizeof(report));
    probe = wmp_esplus_probe(&s_api, report, sizeof(report));
    PLOG("ESPlus probe=%s family=%s: %s\n",
         wmp_esplus_probe_result_name(probe),
         wmp_esplus_family_name(s_api.selected_family), report);
    MLT("ESPlus probe=%s family=%s: %s",
        wmp_esplus_probe_result_name(probe),
        wmp_esplus_family_name(s_api.selected_family), report);
    if (probe != WMP_ESPLUS_PROBE_OK) {
        PLOG("ESPlus probe failed; native player will not be created\n");
        wmp_esplus_close(&s_api);
        pthread_mutex_unlock(&s_lock);
        return 0;
    }

    load_cfg();
    memset(&esplus_stats, 0, sizeof(esplus_stats));
    /* Playback-clock metrics remain unavailable until the optional native query succeeds. */
    esplus_stats.depth_ms = INT32_MIN;
    esplus_stats.audio_depth_ms = INT32_MIN;
    esplus_stats.playing_ms = UINT32_MAX;
    s_prepared = s_prepare_ok = 0;
    s_video_ready = 0;
    s_audio_ready = !s_audio_enabled;
    s_prepare_failed = s_start_failed = 0;
    __atomic_store_n(&s_player_error, 0, __ATOMIC_RELEASE);
    s_start_tried = 0;
    __atomic_store_n(&s_player_closing, 0, __ATOMIC_RELEASE);
    __atomic_store_n(&s_started, 0, __ATOMIC_RELEASE);
    s_prepare_called = 0;
    s_idr_t0 = s_idr_last = 0;
    s_idr_n = s_video_tries = 0;
    s_last_video_pts_ms = s_last_audio_pts_ms = 0;
    s_fps_t0 = 0;
    s_corr_us = 0;
    s_corr_ms = 0;
    s_tick_prev_ms = 0;
    s_tick_seq = 0;

    s_pl = wmp_esplus_adapter_create(&s_api);
    MLT("esplusplayer_create -> %p", s_pl);
    if (!s_pl) {
        wmp_esplus_close(&s_api);
        pthread_mutex_unlock(&s_lock);
        return 0;
    }

    memset(&callbacks, 0, sizeof(callbacks));
    callbacks.error = on_error;
    callbacks.buffer_status = on_buffer;
    callbacks.resource_conflicted = on_conflict;
    callbacks.eos = on_eos;
    callbacks.seek_done = on_seek_done;
    callbacks.ready_to_prepare = on_ready;
    callbacks.prepare_async_done = on_prepared;
    if (wmp_esplus_adapter_bind(&s_adapter, &s_api, s_pl, &callbacks, NULL) != 0) {
        PLOG("callback registration failed\n");
        (void)wmp_esplus_adapter_close(&s_adapter);
        wmp_esplus_adapter_unbind(&s_adapter);
        s_pl = NULL;
        wmp_esplus_close(&s_api);
        pthread_mutex_unlock(&s_lock);
        return 0;
    }

    opened = wmp_esplus_adapter_open(&s_adapter);
    MLT("esplusplayer_open -> status=%d raw=%d", (int)opened.status, opened.raw_status);
    mldiag_player("open", opened.raw_status);
    if (opened.status != WMP_ESPLUS_CALL_SUCCESS) {
        PLOG("open failed (status=%d raw=%d)\n", (int)opened.status, opened.raw_status);
        (void)wmp_esplus_adapter_close(&s_adapter);
        wmp_esplus_adapter_unbind(&s_adapter);
        s_pl = NULL;
        wmp_esplus_close(&s_api);
        pthread_mutex_unlock(&s_lock);
        return 0;
    }

    PLOG("created+opened family=%s\n", wmp_esplus_family_name(s_api.selected_family));
    pthread_mutex_unlock(&s_lock);
    return 1;
}

static int result_to_int(wmp_esplus_call_result_t result)
{
    if (result.status == WMP_ESPLUS_CALL_SUCCESS) return 0;
    /* ADD's native false result is zero; never let it look like success to callers. */
    return result.raw_status == INT_MIN || result.raw_status == 0
        ? -1 : result.raw_status;
}

int esplus_set_video_info(const wmp_esplus_video_info_t *info)
{
    wmp_esplus_call_result_t result = wmp_esplus_adapter_set_video_info(&s_adapter, info);
    MLT("video stream registration status=%d raw=%d", (int)result.status, result.raw_status);
    return result_to_int(result);
}

int esplus_set_audio_info(const wmp_esplus_audio_info_t *info)
{
    wmp_esplus_call_result_t result = wmp_esplus_adapter_set_audio_info(&s_adapter, info);
    MLT("audio stream registration status=%d raw=%d", (int)result.status, result.raw_status);
    return result_to_int(result);
}

struct win_req { int w, h, rc; };

static void *win_create_main(void *arg)
{
    struct win_req *r = arg;
    int sw = 0, sh = 0;
    const char *src = "no symbol, fallback";
    wmp_esplus_call_result_t display_result, mode_result;

    MLT("win: XDG_RUNTIME_DIR=%s WAYLAND_DISPLAY=%s",
        getenv("XDG_RUNTIME_DIR") ? getenv("XDG_RUNTIME_DIR") : "(unset)",
        getenv("WAYLAND_DISPLAY") ? getenv("WAYLAND_DISPLAY") : "(unset)");
    {
        int n = ecore_wl2_init();
        PLOG("ecore_wl2_init -> %d\n", n);
    MLT("ecore_wl2_init -> %d", n);
        if (n <= 0) { r->rc = -1; return NULL; }
    }
    s_ecore = 1;
    s_disp = ecore_wl2_display_connect(NULL);
    PLOG("ecore_wl2_display_connect -> %p\n", s_disp);
    MLT("ecore_wl2_display_connect -> %p", s_disp);
    if (!s_disp) { PLOG("display_connect failed\n"); r->rc = -1; return NULL; }

    if (ecore_wl2_display_screen_size_get) {
        if (ecore_wl2_display_sync) ecore_wl2_display_sync(s_disp);
        ecore_wl2_display_screen_size_get(s_disp, &sw, &sh);
        src = sw > 0 && sh > 0 ? "api" : "api 0x0, fallback";
    }
    if (sw <= 0 || sh <= 0) { sw = 1920; sh = 1080; }
    PLOG("window geometry screen=%dx%d (%s), stream=%dx%d\n", sw, sh, src, r->w, r->h);
    MLT("win: screen %dx%d (%s; stream %dx%d)", sw, sh, src, r->w, r->h);
    (void)src;

    s_win = ecore_wl2_window_new(s_disp, NULL, 0, 0, sw, sh);
    PLOG("ecore_wl2_window_new -> %p\n", s_win);
    MLT("ecore_wl2_window_new -> %p", s_win);
    if (!s_win) { PLOG("window_new failed\n"); r->rc = -1; return NULL; }
    ecore_wl2_window_alpha_set(s_win, 1);
    ecore_wl2_window_show(s_win);
    if (ecore_wl2_window_lower) {
        ecore_wl2_window_lower(s_win);
        PLOG("ecore_wl2_window_lower requested for WMP window\n");
    } else {
        PLOG("ecore_wl2_window_lower unavailable on this firmware\n");
    }
    ecore_wl2_display_flush(s_disp);
    if (ecore_wl2_display_sync) {
        ecore_wl2_display_sync(s_disp);
        MLT("window show synchronized with compositor");
    }
    MLT("window shown");

    display_result = wmp_esplus_adapter_set_ecore_display(
        &s_adapter, 1 /* OVERLAY */, s_win, 0, 0, sw, sh);
    PLOG("ESPlus set_ecore_display status=%d raw=%d\n",
         (int)display_result.status, display_result.raw_status);
    MLT("esplusplayer_set_ecore_display(OVERLAY) -> status=%d raw=%d",
        (int)display_result.status, display_result.raw_status);
    if (display_result.status != WMP_ESPLUS_CALL_SUCCESS) {
        PLOG("set_ecore_display failed\n");
        r->rc = -2;
        return NULL;
    }

    mode_result = wmp_esplus_adapter_set_display_mode(&s_adapter, 0 /* LETTER_BOX */);
    PLOG("ESPlus set_display_mode status=%d raw=%d\n",
         (int)mode_result.status, mode_result.raw_status);
    MLT("esplusplayer_set_display_mode(LETTER_BOX) -> status=%d raw=%d",
        (int)mode_result.status, mode_result.raw_status);
    (void)mode_result;
    /* The legacy header labels LETTER_BOX as zero; display-mode setup is optional. */
    r->rc = 0;
    return NULL;
}

static void *win_destroy_main(void *arg)
{
    (void)arg;
    if (s_win) { ecore_wl2_window_free(s_win); s_win = NULL; }
    if (s_disp) { ecore_wl2_display_disconnect(s_disp); s_disp = NULL; }
    if (s_ecore) { ecore_wl2_shutdown(); s_ecore = 0; }
    MLT("window destroyed");
    return NULL;
}

int esplus_set_window(int width, int height)
{
    struct win_req req;
    int n;
    MLT("esplus_set_window %dx%d pl=%p", width, height, s_pl);
    if (!s_pl || width <= 0 || height <= 0) return -1;
    if (!ecore_runtime_load()) return -1;
    n = ecore_init();
    MLT("ecore_init -> %d", n);
    if (n <= 0) { ecore_runtime_unload(); return -1; }
    req.w = width; req.h = height; req.rc = -1;
    ecore_main_loop_thread_safe_call_sync(win_create_main, &req);
    if (req.rc != 0) {
        ecore_main_loop_thread_safe_call_sync(win_destroy_main, NULL);
        ecore_shutdown();
        ecore_runtime_unload();
        MLT("esplus_set_window -> -1 (%s)",
            req.rc == -2 ? "set_ecore_display" : "no window/display access");
        return -1;
    }
    MLT("esplus_set_window -> 0");
    return 0;
}

static int esplus_start_prepare_if_ready(void)
{
    wmp_esplus_call_result_t result;
    pthread_mutex_lock(&s_lock);
    if (!s_prepare_requested || (s_audio_enabled && !s_audio_registration_done) ||
        s_prepare_started || s_prepare_failed || !s_pl) {
        pthread_mutex_unlock(&s_lock);
        return 0;
    }
    s_prepare_started = 1; /* exactly once, before dropping the lock */
    pthread_mutex_unlock(&s_lock);

    PLOG("calling ESPlus prepare_async after stream registration\n");
    result = wmp_esplus_adapter_prepare_async(&s_adapter);
    PLOG("ESPlus prepare_async returned status=%d raw=%d\n",
         (int)result.status, result.raw_status);
    MLT("prepare_async -> status=%d raw=%d", (int)result.status, result.raw_status);
    mldiag_player("prep", result.raw_status);
    if (result.status != WMP_ESPLUS_CALL_SUCCESS) {
        pthread_mutex_lock(&s_lock);
        s_prepare_failed = 1;
        pthread_cond_broadcast(&s_state_cv);
        pthread_mutex_unlock(&s_lock);
        PLOG("prepare_async failed (status=%d raw=%d)\n",
             (int)result.status, result.raw_status);
        if (!__atomic_exchange_n(&s_player_error, 1, __ATOMIC_ACQ_REL))
            LiReportVideoRendererError();
        return result_to_int(result);
    }
    sampler_start();
    return 0;
}

void esplus_set_audio_enabled(int enabled)
{
    pthread_mutex_lock(&s_lock);
    s_audio_enabled = enabled != 0;
    s_audio_ready = !s_audio_enabled;
    pthread_cond_broadcast(&s_state_cv);
    pthread_mutex_unlock(&s_lock);
}

void esplus_audio_registration_complete(int success)
{
    pthread_mutex_lock(&s_lock);
    s_audio_registration_done = success != 0;
    if (!success) {
        s_prepare_failed = 1;
        pthread_cond_broadcast(&s_state_cv);
    }
    pthread_mutex_unlock(&s_lock);
    MLT("audio stream registration completion success=%d", success != 0);
    if (success) (void)esplus_start_prepare_if_ready();
}

int esplus_prepare(void)
{
    pthread_mutex_lock(&s_lock);
    s_prepare_called = 1;
    s_prepared = s_prepare_ok = 0;
    s_video_ready = 0;
    s_audio_ready = !s_audio_enabled;
    s_prepare_failed = s_start_failed = 0;
    s_start_tried = 0;
    s_prepare_requested = 1;
    s_prepare_started = 0;
    s_audio_registration_done = 0;
    __atomic_store_n(&s_started, 0, __ATOMIC_RELEASE);
    s_idr_t0 = esplus_mono_ms();
    s_idr_last = 0;
    s_idr_n = 0;
    s_video_tries = 0;
    pthread_mutex_unlock(&s_lock);
    MLT("esplus_prepare requested audio_enabled=%d", s_audio_enabled);
    return esplus_start_prepare_if_ready();
}

wmp_esplus_submit_result_t esplus_submit(const wmp_esplus_packet_t *packet)
{
    wmp_esplus_submit_result_t result;
    wmp_esplus_call_result_t started;
    static unsigned n;
    static int last_raw = 4;

    pthread_mutex_lock(&s_lock);
    if (packet && (packet->type == WMP_ESPLUS_STREAM_VIDEO ||
                   packet->type == WMP_ESPLUS_STREAM_AUDIO)) {
        if (packet->type == WMP_ESPLUS_STREAM_VIDEO && s_video_tries < 3)
            MLT("stage first_video_submit ENTER video_ready=%d audio_ready=%d prepared=%d prepare_ok=%d",
                s_video_ready, s_audio_ready, s_prepared, s_prepare_ok);

        /* Hold both feeders until ESPlusPlayer is ready for both tracks. */
        while ((!s_video_ready || (s_audio_enabled && !s_audio_ready)) &&
               !s_prepare_failed && !s_start_failed &&
               !__atomic_load_n(&s_player_error, __ATOMIC_ACQUIRE) &&
               !__atomic_load_n(&s_player_closing, __ATOMIC_ACQUIRE)) {
            pthread_cond_wait(&s_state_cv, &s_lock);
        }

        if (s_prepare_failed || s_start_failed ||
            __atomic_load_n(&s_player_error, __ATOMIC_ACQUIRE) ||
            __atomic_load_n(&s_player_closing, __ATOMIC_ACQUIRE)) {
            const char *reason = __atomic_load_n(&s_player_error, __ATOMIC_ACQUIRE) ? "native ESPlusPlayer error" :
                                 s_prepare_failed ? "prepare_async_done(false)" :
                                 s_start_failed ? "start() failed" : "player closing";
            MLT("A/V feeder released without joint readiness: %s", reason);
            PLOG("A/V submit rejected: %s\n", reason);
            result.status = WMP_ESPLUS_SUBMIT_REJECTED;
            result.raw_status = INT_MIN;
            pthread_mutex_unlock(&s_lock);
            return result;
        }
    }
    if (__atomic_load_n(&s_player_error, __ATOMIC_ACQUIRE)) {
        result.status = WMP_ESPLUS_SUBMIT_REJECTED;
        result.raw_status = INT_MIN;
        pthread_mutex_unlock(&s_lock);
        return result;
    }
    if (packet && (packet->type == WMP_ESPLUS_STREAM_VIDEO ||
                   packet->type == WMP_ESPLUS_STREAM_AUDIO) &&
        s_video_ready && (!s_audio_enabled || s_audio_ready) &&
        s_prepared && s_prepare_ok && !s_start_tried) {
        /* start() is legal only after prepare_async_done(true). Keep it on
         * the feeder path rather than calling back into ESPlus from its own
         * prepare callback. */
        s_start_tried = 1;
        MLT("stage start CALL about_to_enter after prepare_async_done(true)");
        started = wmp_esplus_adapter_start(&s_adapter);
        MLT("stage start CALL returned status=%d raw=%d",
            (int)started.status, started.raw_status);
        if (started.status == WMP_ESPLUS_CALL_SUCCESS) {
            __atomic_store_n(&s_started, 1, __ATOMIC_RELEASE);
        } else {
            s_start_failed = 1;
            pthread_cond_broadcast(&s_state_cv);
            fprintf(stderr, "[esplus] start() failed after prepare_async_done(true): status=%d raw=%d\n",
                    (int)started.status, started.raw_status);
            PLOG("start() failed after prepare_async_done(true): status=%d raw=%d\n",
                 (int)started.status, started.raw_status);
            mldiag_player("start", started.raw_status);
            result.status = WMP_ESPLUS_SUBMIT_REJECTED;
            result.raw_status = INT_MIN;
            pthread_mutex_unlock(&s_lock);
            return result;
        }
        PLOG("ESPlus start returned status=%d raw=%d (prepare callback=true)\n",
             (int)started.status, started.raw_status);
        mldiag_player("start", started.raw_status);
    }
    if (__atomic_load_n(&s_player_error, __ATOMIC_ACQUIRE)) {
        result.status = WMP_ESPLUS_SUBMIT_REJECTED;
        result.raw_status = INT_MIN;
        pthread_mutex_unlock(&s_lock);
        return result;
    }
    if (packet && packet->type == WMP_ESPLUS_STREAM_VIDEO && s_video_tries < 3)
        MLT("stage submit CALL about_to_enter packet_size=%u pts_ns=%llu", packet->size, (unsigned long long)packet->pts_ns);
    result = wmp_esplus_adapter_submit(&s_adapter, packet);
    if (__atomic_load_n(&s_player_error, __ATOMIC_ACQUIRE)) {
        result.status = WMP_ESPLUS_SUBMIT_REJECTED;
        result.raw_status = INT_MIN;
    }
    if (packet && packet->type == WMP_ESPLUS_STREAM_VIDEO && s_video_tries < 3)
        MLT("stage submit CALL returned status=%d raw=%d", (int)result.status, result.raw_status);
    if (packet && packet->type == WMP_ESPLUS_STREAM_VIDEO &&
        (s_video_tries <= 10 || s_video_tries % 60 == 0 ||
         result.status != WMP_ESPLUS_SUBMIT_SUCCESS)) {
        PLOG("video submit #%u size=%u pts_ns=%llu status=%d raw=%d prepared=%d started=%d\n",
             s_video_tries, packet->size, (unsigned long long)packet->pts_ns,
             (int)result.status, result.raw_status, s_prepared,
              __atomic_load_n(&s_started, __ATOMIC_ACQUIRE));
    }
    if (packet && packet->type == WMP_ESPLUS_STREAM_VIDEO)
        ++s_video_tries;
    mldiag_submit(packet && packet->type == WMP_ESPLUS_STREAM_VIDEO,
                  result.status == WMP_ESPLUS_SUBMIT_SUCCESS, result.raw_status);
    if (result.status == WMP_ESPLUS_SUBMIT_SUCCESS && packet) {
        uint64_t ms = packet->pts_ns / 1000000ull;
        if (packet->type == WMP_ESPLUS_STREAM_VIDEO) {
            s_last_video_pts_ms = ms;
            __atomic_fetch_add(&esplus_stats.submitted, 1, __ATOMIC_RELAXED);
        } else if (packet->type == WMP_ESPLUS_STREAM_AUDIO) {
            s_last_audio_pts_ms = ms;
        }
    }
    ++n;
    if (n <= 30 || n % 300 == 0 || result.raw_status != last_raw)
        MLT("esplus_submit #%u -> status=%d raw=%d", n,
            (int)result.status, result.raw_status);
    last_raw = result.raw_status;
    pthread_mutex_unlock(&s_lock);
    return result;
}

int esplus_video_ready(void)
{
    return __atomic_load_n(&s_started, __ATOMIC_ACQUIRE) &&
           __atomic_load_n(&esplus_stats.submitted, __ATOMIC_ACQUIRE) > 0;
}

void esplus_close(void)
{
    MLT("esplus_close");
    sampler_stop();

    /* Wake a feeder blocked on ready_to_prepare and prevent it from
     * submitting or starting a player that is being torn down. */
    pthread_mutex_lock(&s_lock);
    __atomic_store_n(&s_player_closing, 1, __ATOMIC_RELEASE);
    pthread_cond_broadcast(&s_state_cv);
    pthread_mutex_unlock(&s_lock);

    if (s_pl) {
        wmp_esplus_call_result_t stopped = wmp_esplus_adapter_stop(&s_adapter);
        wmp_esplus_call_result_t closed = wmp_esplus_adapter_close(&s_adapter);
        MLT("esplusplayer_stop status=%d raw=%d, close status=%d raw=%d",
            (int)stopped.status, stopped.raw_status,
            (int)closed.status, closed.raw_status);
        (void)stopped;
        (void)closed;
        wmp_esplus_adapter_unbind(&s_adapter);
    }

    pthread_mutex_lock(&s_lock);
    s_pl = NULL;
    s_prepared = s_prepare_ok = 0;
    s_video_ready = 0;
    s_prepare_failed = s_start_failed = 0;
    __atomic_store_n(&s_player_error, 0, __ATOMIC_RELEASE);
    __atomic_store_n(&s_started, 0, __ATOMIC_RELEASE);
    s_start_tried = 0;
    s_prepare_called = 0;
    s_idr_t0 = s_idr_last = 0;
    s_idr_n = s_video_tries = 0;
    s_last_video_pts_ms = s_last_audio_pts_ms = 0;
    s_fps_t0 = 0;
    s_corr_us = 0; s_corr_ms = 0; s_tick_prev_ms = 0;
    /* Serialize dlclose with a possible next esplus_create_open(). */
    wmp_esplus_close(&s_api);
    __atomic_store_n(&s_player_closing, 0, __ATOMIC_RELEASE);
    pthread_cond_broadcast(&s_state_cv);
    pthread_mutex_unlock(&s_lock);
    if (s_win || s_disp || s_ecore) {
        ecore_main_loop_thread_safe_call_sync(win_destroy_main, NULL);
        ecore_shutdown();
        ecore_runtime_unload();
    } else {
        ecore_runtime_unload();
    }
}
