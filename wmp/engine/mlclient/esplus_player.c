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
#ifdef MLT_TRACE
#include <sys/syscall.h>
#include <unistd.h>
#endif

#include "esplus_player.h"
#include "Limelight.h"
#include "esplus_stats.h"
#include "mldiag.h"
#include "mltrace.h"

#define WMP_ESPLUS_ERROR_NOT_SUPPORTED_FORMAT 0xfe6c1008u

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

    /* Optional across firmware versions. Their absence is not a load failure. */
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
    MLT("ecore runtime load failed: %s", error ? error : "missing required symbol");
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

static wmp_esplus_api_t s_api;
static wmp_esplus_adapter_t s_adapter;
static void *s_pl;
static void *s_disp, *s_win;
static int s_ecore;
static pthread_mutex_t s_lock = PTHREAD_MUTEX_INITIALIZER;
static pthread_mutex_t s_recovery_lock = PTHREAD_MUTEX_INITIALIZER;
static volatile int s_opus_fallback_error;
static volatile int s_opus_fallback_ready;
static int s_opus_fallback_attempted;
/* Temporary one-shot simulation: remove after validating the software fallback on-device. */
static int s_opus_fallback_test_used;
static wmp_esplus_video_info_t s_cached_video_info;
static void *s_cached_video_codec_data;
static int s_cached_video_info_valid;
static int s_cached_window_width, s_cached_window_height;
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
static volatile int s_diag_submit_seen;
static volatile int s_diag_feeder_rejection_logged;
static volatile int s_diag_playback_clock_seen;
static volatile int s_diag_buffer_callbacks;
#define IDR_FIRST_MS 300
#define IDR_EVERY_MS 500
#define IDR_MAX 10

extern void LiRequestIdrFrame(void);

esplus_stats_t esplus_stats;
esplus_cfg_t esplus_cfg;
volatile int esplus_performance_stats_enabled;


static uint64_t s_last_video_pts_ms, s_last_audio_pts_ms;
static uint64_t s_last_video_t; /* monotonic time of newest accepted video packet */
static volatile int s_need_idr;
static int s_catchup_done, s_catchup_hits;
static uint64_t s_stream_clock_origin_ns;
static uint64_t s_fps_t0;
static uint32_t s_fps_sub0;

void esplus_set_performance_stats_enabled(int enabled)
{
    pthread_mutex_lock(&s_lock);
    if (enabled) {
        s_fps_t0 = 0;
        s_fps_sub0 = __atomic_load_n(&esplus_stats.submitted, __ATOMIC_RELAXED);
        __atomic_store_n(&esplus_stats.fps_submitted, 0, __ATOMIC_RELAXED);
        __atomic_store_n(&esplus_stats.host_latency_total, 0, __ATOMIC_RELAXED);
        __atomic_store_n(&esplus_stats.host_latency_count, 0, __ATOMIC_RELAXED);
        __atomic_store_n(&esplus_stats.host_latency_min, UINT32_MAX, __ATOMIC_RELAXED);
        __atomic_store_n(&esplus_stats.host_latency_max, 0, __ATOMIC_RELAXED);
        __atomic_store_n(&esplus_stats.host_latency_window_total, 0, __ATOMIC_RELAXED);
        __atomic_store_n(&esplus_stats.host_latency_window_count, 0, __ATOMIC_RELAXED);
        __atomic_store_n(&esplus_stats.host_latency_window_min, UINT32_MAX, __ATOMIC_RELAXED);
        __atomic_store_n(&esplus_stats.host_latency_window_max, 0, __ATOMIC_RELAXED);
    }
    __atomic_store_n(&esplus_performance_stats_enabled, enabled != 0, __ATOMIC_RELEASE);
    pthread_mutex_unlock(&s_lock);
}
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

static int s_latency_env_unset;
static volatile int s_auto_nudge;

static void load_cfg(void)
{
    const char *m = getenv("MLENGINE_LATENCY_MODE");
    const char *game_mode = getenv("MLENGINE_GAME_MODE");
    s_latency_env_unset = !m;
    /* Game Mode retains arrival-based PTS. Otherwise, only an explicitly
     * requested nudge is unconditional; the automatic default is selected
     * after video stream registration confirms exactly 60 fps. */
    esplus_cfg.latency_mode = (game_mode && !strcmp(game_mode, "1")) ? ESPLUS_LAT_ARRIVAL :
        (!m ? ESPLUS_LAT_OFF :
        !strcmp(m, "nudge") ? ESPLUS_LAT_NUDGE :
        !strcmp(m, "arrival") ? ESPLUS_LAT_ARRIVAL : ESPLUS_LAT_OFF);
    esplus_cfg.target_depth_ms = mlc_env_int("MLENGINE_TARGET_DEPTH_MS", 100);
    esplus_cfg.nudge_max_ms_per_s = mlc_env_int("MLENGINE_NUDGE_MAX_MS_PER_S", 10);
    /* Keep frame shedding opt-in: DR_NEED_IDR can discard dependent frames. */
    esplus_cfg.drop_after_ms = mlc_env_int("MLENGINE_DROP_AFTER_MS", 0);
    esplus_cfg.depth_poll_ms = mlc_env_int("MLENGINE_DEPTH_POLL_MS", 150);
    /* Recover once when the native playback queue exceeds 150 ms for two
     * consecutive samples. Requires the verified playback clock and seek API. */
    esplus_cfg.catchup_ms = mlc_env_int("MLENGINE_CATCHUP_MS", 150);
    if (!s_api.get_playing_time || !s_api.seek) esplus_cfg.catchup_ms = 0;
    /* Arrival timestamps need no player query; nudge requires the optional playback clock. */
    if (esplus_cfg.latency_mode == ESPLUS_LAT_NUDGE && !s_api.get_playing_time)
        esplus_cfg.latency_mode = ESPLUS_LAT_OFF;
    MLT("cfg latency=%d target=%d nudge=%d drop_after=%d poll=%d catchup=%d family=%s",
        esplus_cfg.latency_mode, esplus_cfg.target_depth_ms,
        esplus_cfg.nudge_max_ms_per_s, esplus_cfg.drop_after_ms,
        esplus_cfg.depth_poll_ms, esplus_cfg.catchup_ms,
        wmp_esplus_family_name(s_api.selected_family));
}

int esplus_lat_mode(void)
{
    if (esplus_cfg.latency_mode == ESPLUS_LAT_OFF &&
        __atomic_load_n(&s_auto_nudge, __ATOMIC_RELAXED))
        return ESPLUS_LAT_NUDGE;
    return esplus_cfg.latency_mode;
}

#define NUDGE_FRESH_MS 100
#define NUDGE_HYST_MS 10
#define NUDGE_BASE_TICKS 4
#define NUDGE_BACKOFF 4
static int s_base_n;
static int32_t s_base_min;
static volatile int32_t s_lead0;

static void nudge_reset(void)
{
    s_corr_us = 0;
    s_corr_ms = 0;
    s_base_n = 0;
    s_base_min = 0;
    s_lead0 = 0;
}

static void nudge(int32_t lead, uint64_t now_ms)
{
    int64_t err, step, cap;
    int target = esplus_cfg.target_depth_ms;

    if (esplus_lat_mode() != ESPLUS_LAT_NUDGE) return;
    if (s_base_n < NUDGE_BASE_TICKS) {
        if (!s_base_n || lead < s_base_min) s_base_min = lead;
        if (++s_base_n < NUDGE_BASE_TICKS) return;
        s_lead0 = s_base_min > 0 ? s_base_min : 1;
        MLT("nudge: baseline lead=%dms target=%dms", s_lead0, target);
    }
    if (!s_tick_prev_ms) return;

    err = (int64_t)lead - target;
    step = (int64_t)esplus_cfg.nudge_max_ms_per_s *
           (int64_t)(now_ms - s_tick_prev_ms);
    if (err > NUDGE_HYST_MS)
        s_corr_us += err * 1000 < step ? err * 1000 : step;
    else if (err < -NUDGE_HYST_MS)
        s_corr_us -= -err * 1000 < step * NUDGE_BACKOFF
            ? -err * 1000 : step * NUDGE_BACKOFF;

    cap = ((int64_t)s_lead0 - target) * 1000;
    if (cap < 0) cap = 0;
    if (s_corr_us > cap) s_corr_us = cap;
    if (s_corr_us > 1000000) s_corr_us = 1000000;
    if (s_corr_us < -1000000) s_corr_us = -1000000;
    s_corr_ms = (int32_t)((s_corr_us + (s_corr_us < 0 ? -500 : 500)) / 1000);
}

int32_t esplus_correction_ms(void) { return s_corr_ms; }
uint32_t esplus_sample_seq(void) { return s_tick_seq; }
int esplus_take_need_idr(void)
{
    return __atomic_exchange_n(&s_need_idr, 0, __ATOMIC_ACQ_REL);
}

int esplus_video_ready(void)
{
    uint64_t playing_ms = 0;
    int ready = 0;

    /* Accepted packets are not proof of playback. Wait until ESPlus reports
     * that its playback clock has advanced before revealing the video surface. */
    pthread_mutex_lock(&s_lock);
    if (s_pl && __atomic_load_n(&s_started, __ATOMIC_ACQUIRE) &&
        __atomic_load_n(&esplus_stats.submitted, __ATOMIC_ACQUIRE) > 0 &&
        wmp_esplus_adapter_get_playing_time(&s_adapter, &playing_ms) &&
        playing_ms > 0) {
        ready = 1;
    }
    pthread_mutex_unlock(&s_lock);
    return ready;
}

static uint64_t esplus_mono_ns(void)
{
    struct timespec t;
    clock_gettime(CLOCK_MONOTONIC, &t);
    return (uint64_t)t.tv_sec * 1000000000ull + (uint64_t)t.tv_nsec;
}

void esplus_stream_clock_reset(void)
{
    __atomic_store_n(&s_stream_clock_origin_ns, 0, __ATOMIC_RELEASE);
}

void esplus_stream_clock_start(void)
{
    uint64_t expected = 0;
    uint64_t now = esplus_mono_ns();
    (void)__atomic_compare_exchange_n(&s_stream_clock_origin_ns, &expected, now,
                                      0, __ATOMIC_RELEASE, __ATOMIC_ACQUIRE);
}

uint64_t esplus_stream_clock_pts_ns(void)
{
    uint64_t origin = __atomic_load_n(&s_stream_clock_origin_ns, __ATOMIC_ACQUIRE);
    uint64_t now;
    if (!origin) return 0;
    now = esplus_mono_ns();
    return now >= origin ? now - origin : 0;
}

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
    int diag_playback_clock = 0;
    pthread_mutex_lock(&s_lock);
    if (s_pl && __atomic_load_n(&s_started, __ATOMIC_ACQUIRE)) {
        /* Playback-clock availability is detected independently of the
         * selected stream-registration family; FPS remains measurable either way. */
        if ((__atomic_load_n(&esplus_performance_stats_enabled, __ATOMIC_ACQUIRE) ||
             esplus_lat_mode() == ESPLUS_LAT_NUDGE || esplus_cfg.drop_after_ms > 0 ||
             esplus_cfg.catchup_ms > 0) &&
            wmp_esplus_adapter_get_playing_time(&s_adapter, &play)) {
            esplus_stats.playing_ms = play > UINT32_MAX ? UINT32_MAX : (uint32_t)play;
            if (play > 0 &&
                !__atomic_exchange_n(&s_diag_playback_clock_seen, 1, __ATOMIC_ACQ_REL))
                diag_playback_clock = 1;
            esplus_stats.depth_ms = (int32_t)(s_last_video_pts_ms - play);
            esplus_stats.audio_depth_ms = (int32_t)(s_last_audio_pts_ms - play);
            {
                uint64_t age = s_last_video_t ? esplus_mono_ms() - s_last_video_t : UINT64_MAX;
                int fresh = age <= NUDGE_FRESH_MS;
                int32_t lead = esplus_stats.depth_ms + (fresh ? (int32_t)age : 0);
                if (play > 0 && fresh) nudge(lead, now_ms);
            }
            /* Two consecutive deep samples trigger one flushing seek to the
             * newest accepted video PTS; a single transient spike is ignored. */
            if (esplus_cfg.catchup_ms > 0 && !s_catchup_done && play > 0) {
                if (esplus_stats.depth_ms > esplus_cfg.catchup_ms)
                    ++s_catchup_hits;
                else
                    s_catchup_hits = 0;
                if (s_catchup_hits >= 2) {
                    int seek_rc;
                    s_catchup_done = 1; /* never loop if the native seek fails */
                    seek_rc = wmp_esplus_adapter_seek(&s_adapter, s_last_video_pts_ms);
                    MLT("catchup: depth=%dms seek=%llu ms raw=%d",
                        esplus_stats.depth_ms,
                        (unsigned long long)s_last_video_pts_ms, seek_rc);
                    nudge_reset();
                    s_tick_prev_ms = 0;
                    __atomic_store_n(&s_need_idr, 1, __ATOMIC_RELEASE);
                    request_idr = 1;
                }
            }
            s_tick_prev_ms = now_ms;
        }

        if (__atomic_load_n(&esplus_performance_stats_enabled, __ATOMIC_ACQUIRE)) {
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
        }
    }
    ++s_tick_seq;
    pthread_mutex_unlock(&s_lock);
    if (diag_playback_clock)
        MLT_DIAG("ESPlus playback clock became non-zero playing_ms=%llu",
                 (unsigned long long)play);
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
}

static void on_prepared(bool ok, void *context)
{
    int report_failure = 0;
    (void)context;
    /* The synthetic format rejection must take the same deferred recovery path. */
    if (ok && __atomic_load_n(&s_opus_fallback_error, __ATOMIC_ACQUIRE))
        ok = false;
    MLT_DIAG("prepare_async_done callback ENTER ok=%d", ok ? 1 : 0);
    pthread_mutex_lock(&s_lock);
    s_prepare_ok = ok ? 1 : 0;
    __atomic_store_n(&s_prepared, 1, __ATOMIC_RELEASE);
    if (!ok) {
        s_prepare_failed = 1;
        if (__atomic_load_n(&s_opus_fallback_error, __ATOMIC_ACQUIRE)) {
            __atomic_store_n(&s_opus_fallback_ready, 1, __ATOMIC_RELEASE);
            MLT("OPUS hardware decoder rejected at preroll; software fallback is ready");
        } else if (!__atomic_load_n(&s_player_closing, __ATOMIC_ACQUIRE)) {
            report_failure = !__atomic_exchange_n(&s_player_error, 1, __ATOMIC_ACQ_REL);
        }
    }
    pthread_cond_broadcast(&s_state_cv);
    pthread_mutex_unlock(&s_lock);
    MLT_DIAG("prepare_async_done callback state recorded ok=%d", ok ? 1 : 0);

    mldiag_player("pdone", ok ? 1 : 0);
    if (!ok) {
            MLT("prepare_async_done=false; start() skipped");
        if (report_failure && !__atomic_load_n(&s_player_closing, __ATOMIC_ACQUIRE))
            LiReportVideoRendererError();
        MLT_DIAG("prepare_async_done callback EXIT ok=0");
        return;
    }
    MLT_DIAG("prepare_async_done callback EXIT ok=1");
}
static void on_ready(wmp_esplus_stream_e stream, void *context)
{
    (void)context;
    MLT_DIAG("ready_to_prepare callback ENTER stream=%d", (int)stream);
    pthread_mutex_lock(&s_lock);
    if (!__atomic_load_n(&s_player_closing, __ATOMIC_ACQUIRE)) {
        if (stream == WMP_ESPLUS_STREAM_VIDEO) {
            s_video_ready = 1;
        }
        else if (stream == WMP_ESPLUS_STREAM_AUDIO) {
            s_audio_ready = 1;
        }
        pthread_cond_broadcast(&s_state_cv);
    }
    pthread_mutex_unlock(&s_lock);
    MLT_DIAG("ready_to_prepare callback state recorded stream=%d", (int)stream);
    MLT_DIAG("ready_to_prepare callback EXIT stream=%d", (int)stream);
}
static void on_error(int error, void *context)
{
    const char *description;
    int report_failure = 0;
    int opus_fallback_error = 0;
    (void)context;

    description = wmp_esplus_adapter_get_error_string(&s_adapter, error);
    __atomic_fetch_add(&esplus_stats.errors, 1, __ATOMIC_RELAXED);
    __atomic_store_n(&esplus_stats.last_error, (uint32_t)error, __ATOMIC_RELAXED);

    /*
     * Tizen 5.0 accepts OPUS registration and fails later during preroll when
     * trackrenderer receives the first packet. 0xfe6c1008 is
     * EPPLAYER_ERROR_NOT_SUPPORTED_FORMAT. Recovery waits for prepare_async_done(false).
     */
    if ((uint32_t)error == WMP_ESPLUS_ERROR_NOT_SUPPORTED_FORMAT &&
        __atomic_load_n(&esplus_stats.audio_codec, __ATOMIC_RELAXED) == 1u &&
        !__atomic_load_n(&s_prepared, __ATOMIC_ACQUIRE) &&
        !__atomic_load_n(&s_player_closing, __ATOMIC_ACQUIRE)) {
        __atomic_store_n(&s_opus_fallback_error, 1, __ATOMIC_RELEASE);
        opus_fallback_error = 1;
    }

    /* ESPlusPlayer may invoke this on its own thread. Never tear down the
     * player from the callback: latch the error and ask Common C to terminate
     * through its normal asynchronous connectionTerminated path. */
    if (!opus_fallback_error && !__atomic_load_n(&s_player_closing, __ATOMIC_ACQUIRE)) {
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

    MLT("ESPlus player error code=0x%08x (%d): %s",
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
    {
        int n = __atomic_fetch_add(&s_diag_buffer_callbacks, 1, __ATOMIC_RELAXED);
        if (n < 8)
            MLT_DIAG("video buffer_status callback #%d status=%d", n + 1, (int)status);
    }
    if (status == WMP_ESPLUS_BUFFER_STATUS_UNDERRUN)
        __atomic_fetch_add(&esplus_stats.underruns, 1, __ATOMIC_RELAXED);
    else if (status == WMP_ESPLUS_BUFFER_STATUS_OVERRUN)
        __atomic_fetch_add(&esplus_stats.overruns, 1, __ATOMIC_RELAXED);
}
static void on_seek_done(void *context) { (void)context; }
static void on_eos(void *context) { (void)context; }
static void on_conflict(void *context)
{
    (void)context;
    /* Record the native condition; Common C remains responsible for session state. */
    __atomic_store_n(&esplus_stats.recovery_state, 2, __ATOMIC_RELAXED);
    MLT("ESPlus resource conflict");
}

int esplus_detect_abi_family(void)
{
    wmp_esplus_api_t probe_api;
    char report[2048];
    wmp_esplus_probe_result_e result;
    wmp_esplus_family_e family;

    memset(&probe_api, 0, sizeof(probe_api));
    memset(report, 0, sizeof(report));
    result = wmp_esplus_probe(&probe_api, report, sizeof(report));
    family = result == WMP_ESPLUS_PROBE_OK
        ? probe_api.selected_family : WMP_ESPLUS_FAMILY_NONE;
    MLT("ESPlus ABI preflight=%s family=%s: %s",
        wmp_esplus_probe_result_name(result),
        wmp_esplus_family_name(family), report);
    wmp_esplus_close(&probe_api);
    return (int)family;
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
    MLT("ESPlus probe=%s family=%s: %s",
        wmp_esplus_probe_result_name(probe),
        wmp_esplus_family_name(s_api.selected_family), report);
    if (probe != WMP_ESPLUS_PROBE_OK) {
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
    __atomic_store_n(&s_prepared, 0, __ATOMIC_RELEASE);
    s_prepare_ok = 0;
    s_video_ready = 0;
    s_audio_ready = !s_audio_enabled;
    s_prepare_failed = s_start_failed = 0;
    s_prepare_requested = 0;
    s_prepare_started = 0;
    s_audio_registration_done = 0;
    __atomic_store_n(&s_opus_fallback_error, 0, __ATOMIC_RELEASE);
    __atomic_store_n(&s_opus_fallback_ready, 0, __ATOMIC_RELEASE);
    s_opus_fallback_attempted = 0;
    __atomic_store_n(&s_player_error, 0, __ATOMIC_RELEASE);
    s_start_tried = 0;
    __atomic_store_n(&s_player_closing, 0, __ATOMIC_RELEASE);
    __atomic_store_n(&s_started, 0, __ATOMIC_RELEASE);
    s_prepare_called = 0;
    s_idr_t0 = s_idr_last = 0;
    s_idr_n = s_video_tries = 0;
    s_last_video_pts_ms = s_last_audio_pts_ms = 0;
    s_last_video_t = 0;
    __atomic_store_n(&s_need_idr, 0, __ATOMIC_RELEASE);
    s_catchup_done = s_catchup_hits = 0;
    s_fps_t0 = 0;
    nudge_reset();
    s_tick_prev_ms = 0;
    s_tick_seq = 0;
    __atomic_store_n(&s_auto_nudge, 0, __ATOMIC_RELAXED);

    s_pl = wmp_esplus_adapter_create(&s_api);
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
        MLT("ESPlus callback registration failed");
        (void)wmp_esplus_adapter_close(&s_adapter);
        wmp_esplus_adapter_unbind(&s_adapter);
        s_pl = NULL;
        wmp_esplus_close(&s_api);
        pthread_mutex_unlock(&s_lock);
        return 0;
    }

    opened = wmp_esplus_adapter_open(&s_adapter);
    mldiag_player("open", opened.raw_status);
    if (opened.status != WMP_ESPLUS_CALL_SUCCESS) {
        MLT("ESPlus open failed status=%d raw=%d", (int)opened.status, opened.raw_status);
        (void)wmp_esplus_adapter_close(&s_adapter);
        wmp_esplus_adapter_unbind(&s_adapter);
        s_pl = NULL;
        wmp_esplus_close(&s_api);
        pthread_mutex_unlock(&s_lock);
        return 0;
    }

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
    wmp_esplus_call_result_t result;
    if (info) {
        int fps60 = info->frame_rate == 60;
        __atomic_store_n(&s_auto_nudge,
            s_latency_env_unset && fps60 && s_api.get_playing_time,
            __ATOMIC_RELAXED);
        MLT("nudge default=%d fps=%u env_mode=%s",
            s_latency_env_unset && fps60 && s_api.get_playing_time,
            info->frame_rate, s_latency_env_unset ? "unset" : "set");
    }
    result = wmp_esplus_adapter_set_video_info(&s_adapter, info);
    if (result.status != WMP_ESPLUS_CALL_SUCCESS) {
        MLT("video stream registration failed status=%d raw=%d", (int)result.status, result.raw_status);
        return result_to_int(result);
    }

    if (info) {
        void *codec_copy = NULL;
        if (info->codec_data && info->codec_data_size) {
            codec_copy = malloc(info->codec_data_size);
            if (!codec_copy) {
                pthread_mutex_lock(&s_lock);
                s_cached_video_info_valid = 0;
                pthread_mutex_unlock(&s_lock);
                MLT("cannot cache video codec data for player recovery");
                return -1;
            }
            memcpy(codec_copy, info->codec_data, info->codec_data_size);
        }

        pthread_mutex_lock(&s_lock);
        free(s_cached_video_codec_data);
        s_cached_video_codec_data = codec_copy;
        s_cached_video_info = *info;
        s_cached_video_info.codec_data = s_cached_video_codec_data;
        s_cached_video_info_valid = 1;
        pthread_mutex_unlock(&s_lock);
    }
    return 0;
}

int esplus_set_audio_info(const wmp_esplus_audio_info_t *info)
{
    wmp_esplus_call_result_t result = wmp_esplus_adapter_set_audio_info(&s_adapter, info);
    if (result.status != WMP_ESPLUS_CALL_SUCCESS)
        MLT("audio stream registration failed status=%d raw=%d", (int)result.status, result.raw_status);
    return result_to_int(result);
}


static int s_window_reveal_requested;

static void window_reveal_main(void *arg)
{
    (void)arg;
    if (s_win && p_ecore_wl2_window_alpha_set) {
        ecore_wl2_window_alpha_set(s_win, 1);
        if (s_disp) ecore_wl2_display_flush(s_disp);
        MLT("Wayland video window revealed (alpha=1)");
    }
}

void esplus_reveal_window(void)
{
    if (!s_win || !p_ecore_wl2_window_alpha_set) return;
    if (__atomic_exchange_n(&s_window_reveal_requested, 1, __ATOMIC_ACQ_REL)) return;
    if (ecore_main_loop_thread_safe_call_sync)
        ecore_main_loop_thread_safe_call_sync(window_reveal_main, NULL);
    else
        __atomic_store_n(&s_window_reveal_requested, 0, __ATOMIC_RELEASE);
}

struct win_req { int w, h, rc; };

static void *win_create_main(void *arg)
{
    struct win_req *r = arg;
    int sw = 0, sh = 0;
    wmp_esplus_call_result_t display_result, mode_result;
    int n;

    n = ecore_wl2_init();
    if (n <= 0) {
        MLT("window setup failed: ecore_wl2_init returned %d", n);
        r->rc = -1;
        return NULL;
    }
    s_ecore = 1;

    s_disp = ecore_wl2_display_connect(NULL);
    if (!s_disp) {
        MLT("window setup failed: Wayland display connection unavailable");
        r->rc = -1;
        return NULL;
    }

    if (ecore_wl2_display_screen_size_get) {
        if (ecore_wl2_display_sync) ecore_wl2_display_sync(s_disp);
        ecore_wl2_display_screen_size_get(s_disp, &sw, &sh);
    }
    if (sw <= 0 || sh <= 0) {
        sw = 1920;
        sh = 1080;
    }

    s_win = ecore_wl2_window_new(s_disp, NULL, 0, 0, sw, sh);
    if (!s_win) {
        MLT("window setup failed: ecore_wl2_window_new returned NULL");
        r->rc = -1;
        return NULL;
    }

    __atomic_store_n(&s_window_reveal_requested, 0, __ATOMIC_RELEASE);
    ecore_wl2_window_alpha_set(s_win, 0);
    ecore_wl2_window_show(s_win);
    if (ecore_wl2_window_lower) ecore_wl2_window_lower(s_win);
    ecore_wl2_display_flush(s_disp);
    if (ecore_wl2_display_sync) ecore_wl2_display_sync(s_disp);

    display_result = wmp_esplus_adapter_set_ecore_display(
        &s_adapter, 1 /* OVERLAY */, s_win, 0, 0, sw, sh);
    if (display_result.status != WMP_ESPLUS_CALL_SUCCESS) {
        MLT("window setup failed: set_ecore_display status=%d raw=%d",
            (int)display_result.status, display_result.raw_status);
        r->rc = -2;
        return NULL;
    }

    mode_result = wmp_esplus_adapter_set_display_mode(&s_adapter, 0 /* LETTER_BOX */);
    if (mode_result.status != WMP_ESPLUS_CALL_SUCCESS) {
        MLT("window setup warning: optional set_display_mode status=%d raw=%d",
            (int)mode_result.status, mode_result.raw_status);
    }

    r->rc = 0;
    return NULL;
}

static void *win_destroy_main(void *arg)
{
    (void)arg;
    if (s_win) { ecore_wl2_window_free(s_win); s_win = NULL; }
    if (s_disp) { ecore_wl2_display_disconnect(s_disp); s_disp = NULL; }
    if (s_ecore) { ecore_wl2_shutdown(); s_ecore = 0; }
    return NULL;
}

int esplus_set_window(int width, int height)
{
    struct win_req req;
    int n;

    if (!s_pl || width <= 0 || height <= 0) {
        MLT("esplus_set_window rejected invalid state pl=%p size=%dx%d",
            s_pl, width, height);
        return -1;
    }
    if (!ecore_runtime_load()) return -1;

    n = ecore_init();
    if (n <= 0) {
        MLT("window setup failed: ecore_init returned %d", n);
        ecore_runtime_unload();
        return -1;
    }

    req.w = width;
    req.h = height;
    req.rc = -1;
    ecore_main_loop_thread_safe_call_sync(win_create_main, &req);

    if (req.rc != 0) {
        ecore_main_loop_thread_safe_call_sync(win_destroy_main, NULL);
        ecore_shutdown();
        ecore_runtime_unload();
        MLT("esplus_set_window failed (%s)",
            req.rc == -2 ? "set_ecore_display" : "Wayland window setup");
        return -1;
    }
    pthread_mutex_lock(&s_lock);
    s_cached_window_width = width;
    s_cached_window_height = height;
    pthread_mutex_unlock(&s_lock);
    return 0;
}

static int esplus_start_prepare_if_ready(void)
{
    wmp_esplus_call_result_t result;
    int requested, audio_enabled, audio_registered, started, failed, have_player;
    pthread_mutex_lock(&s_lock);
    requested = s_prepare_requested;
    audio_enabled = s_audio_enabled;
    audio_registered = s_audio_registration_done;
    started = s_prepare_started;
    failed = s_prepare_failed;
    have_player = s_pl != NULL;
    if (!requested || (audio_enabled && !audio_registered) ||
        started || failed || !have_player) {
        pthread_mutex_unlock(&s_lock);
        MLT_DIAG("prepare_async NOT CALLED requested=%d audio_enabled=%d audio_registered=%d already_started=%d failed=%d player=%d",
                 requested, audio_enabled, audio_registered, started, failed, have_player);
        return 0;
    }
    s_prepare_started = 1; /* exactly once, before dropping the lock */
    pthread_mutex_unlock(&s_lock);

    MLT_DIAG("prepare_async CALL about_to_enter");
    result = wmp_esplus_adapter_prepare_async(&s_adapter);
    MLT_DIAG("prepare_async RETURN status=%d raw=%d", (int)result.status, result.raw_status);
    MLT("prepare_async -> status=%d raw=%d", (int)result.status, result.raw_status);
    mldiag_player("prep", result.raw_status);
    if (result.status != WMP_ESPLUS_CALL_SUCCESS) {
        pthread_mutex_lock(&s_lock);
        s_prepare_failed = 1;
        pthread_cond_broadcast(&s_state_cv);
        pthread_mutex_unlock(&s_lock);
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
    if (!success) MLT("audio stream registration failed");
    if (success) (void)esplus_start_prepare_if_ready();
}

int esplus_prepare(void)
{
    int already_requested;

    pthread_mutex_lock(&s_lock);
    s_prepare_called = 1;
    already_requested = s_prepare_requested;
    if (!already_requested) {
        /*
         * Initialize the preparation state only once per player/session.
         * Renderer and stream-registration paths may both request prepare;
         * a duplicate request must not erase ready callbacks or audio
         * registration that arrived after the first request.
         */
        __atomic_store_n(&s_prepared, 0, __ATOMIC_RELEASE);
        s_prepare_ok = 0;
        s_video_ready = 0;
        s_audio_ready = !s_audio_enabled;
        s_prepare_failed = s_start_failed = 0;
        s_start_tried = 0;
        s_prepare_requested = 1;
        s_prepare_started = 0;
        __atomic_store_n(&s_started, 0, __ATOMIC_RELEASE);
        s_idr_t0 = esplus_mono_ms();
        s_idr_last = 0;
        s_idr_n = 0;
        s_video_tries = 0;
        __atomic_store_n(&s_diag_submit_seen, 0, __ATOMIC_RELEASE);
        __atomic_store_n(&s_diag_feeder_rejection_logged, 0, __ATOMIC_RELEASE);
        __atomic_store_n(&s_diag_playback_clock_seen, 0, __ATOMIC_RELEASE);
        __atomic_store_n(&s_diag_buffer_callbacks, 0, __ATOMIC_RELEASE);
    }
    pthread_mutex_unlock(&s_lock);

    if (already_requested) {
            MLT_DIAG("esplus_prepare duplicate request ignored");
        /* Re-evaluate readiness without resetting any in-flight state. */
        return esplus_start_prepare_if_ready();
    }

    MLT_DIAG("esplus_prepare state set audio_enabled=%d; evaluating prepare_async", s_audio_enabled);
    return esplus_start_prepare_if_ready();
}

wmp_esplus_submit_result_t esplus_submit(const wmp_esplus_packet_t *packet)
{
    wmp_esplus_submit_result_t result;
    wmp_esplus_call_result_t started;
    int diag_first_video_submit = 0;

    if (packet && packet->type == WMP_ESPLUS_STREAM_VIDEO &&
        !__atomic_exchange_n(&s_diag_submit_seen, 1, __ATOMIC_ACQ_REL)) {
        diag_first_video_submit = 1;
        MLT_DIAG("first ESPlus video submit ENTER size=%u pts_ns=%llu",
                 packet->size, (unsigned long long)packet->pts_ns);
    }
    pthread_mutex_lock(&s_lock);
    if (__atomic_load_n(&s_opus_fallback_error, __ATOMIC_ACQUIRE) ||
        __atomic_load_n(&s_opus_fallback_ready, __ATOMIC_ACQUIRE)) {
        result.status = WMP_ESPLUS_SUBMIT_NOT_PREPARED;
        result.raw_status = INT_MIN;
        pthread_mutex_unlock(&s_lock);
        return result;
    }
    if (packet && packet->type == WMP_ESPLUS_STREAM_VIDEO) {
        /*
         * ESPlusPlayer's ready_to_prepare callback opens the video feeder
         * during prepare_async. Do not wait for prepare_async_done here:
         * the native preparation itself may need incoming elementary-stream
         * packets before it can complete.
         */
        if (!s_video_ready) {
            result.status = WMP_ESPLUS_SUBMIT_NOT_PREPARED;
            result.raw_status = INT_MIN;
            pthread_mutex_unlock(&s_lock);
            if (diag_first_video_submit)
                MLT_DIAG("first ESPlus video submit NOT_FORWARDED: ready_to_prepare callback has not arrived");
            return result;
        }

        if (s_prepare_failed || s_start_failed ||
            __atomic_load_n(&s_player_error, __ATOMIC_ACQUIRE) ||
            __atomic_load_n(&s_player_closing, __ATOMIC_ACQUIRE)) {
            const char *reason = __atomic_load_n(&s_player_error, __ATOMIC_ACQUIRE) ? "native ESPlusPlayer error" :
                                 s_prepare_failed ? "prepare_async_done(false)" :
                                 s_start_failed ? "start() failed" : "player closing";
            if (!__atomic_exchange_n(&s_diag_feeder_rejection_logged, 1, __ATOMIC_ACQ_REL)) {
                MLT("video feeder released without startup readiness: %s", reason);
            }
            result.status = WMP_ESPLUS_SUBMIT_REJECTED;
            result.raw_status = INT_MIN;
            pthread_mutex_unlock(&s_lock);
            if (diag_first_video_submit)
                MLT_DIAG("first ESPlus video submit NOT_FORWARDED: startup state rejected the feeder");
            return result;
        }

        /*
         * The first video unit establishes the common monotonic PTS origin.
         * Audio may now be submitted while prepare_async is still completing,
         * so it shares this clock instead of being discarded until start().
         */
        esplus_stream_clock_start();

        /*
         * start() remains strictly after prepare_async_done(true), but packet
         * feeding is deliberately allowed before that callback. Once both
         * conditions are true, the video feeder performs the one-time start.
         */
        if (s_prepared && s_prepare_ok &&
            !__atomic_load_n(&s_started, __ATOMIC_ACQUIRE) && !s_start_tried) {
            s_start_tried = 1;
            MLT_DIAG("ESPlus start CALL about_to_enter after prepare_async_done(true)");
            started = wmp_esplus_adapter_start(&s_adapter);
            MLT_DIAG("ESPlus start RETURN status=%d raw=%d", (int)started.status, started.raw_status);
            if (started.status == WMP_ESPLUS_CALL_SUCCESS) {
                __atomic_store_n(&s_started, 1, __ATOMIC_RELEASE);
                pthread_cond_broadcast(&s_state_cv);
            } else {
                s_start_failed = 1;
                pthread_cond_broadcast(&s_state_cv);
                MLT("ESPlus start failed after prepare_async_done(true): status=%d raw=%d",
                    (int)started.status, started.raw_status);
                mldiag_player("start", started.raw_status);
                result.status = WMP_ESPLUS_SUBMIT_REJECTED;
                result.raw_status = INT_MIN;
                pthread_mutex_unlock(&s_lock);
                return result;
            }
            mldiag_player("start", started.raw_status);
        }
    }
    else if (packet && packet->type == WMP_ESPLUS_STREAM_AUDIO) {
        /*
         * Audio is also part of the preparation feed. Wait only for its own
         * ready_to_prepare notification and for the shared video clock; do
         * not require start() to have completed before submitting audio.
         */
        if (!s_audio_enabled || !s_audio_ready ||
            !esplus_stream_clock_pts_ns()) {
            result.status = WMP_ESPLUS_SUBMIT_NOT_PREPARED;
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
    result = wmp_esplus_adapter_submit(&s_adapter, packet);

    /*
     * TEMPORARY TEST: emulate the Tizen preroll rejection at the point where
     * ESPlus has accepted the first compressed OPUS packet. The real firmware
     * reports this asynchronously from trackrenderer while prepare is pending.
     * Keep the normal error callback and prepare_async_done coordination path.
     */
    if (result.status == WMP_ESPLUS_SUBMIT_SUCCESS && packet &&
        packet->type == WMP_ESPLUS_STREAM_AUDIO &&
        __atomic_load_n(&esplus_stats.audio_codec, __ATOMIC_RELAXED) == 1u &&
        !__atomic_load_n(&s_prepared, __ATOMIC_ACQUIRE) &&
        !__atomic_exchange_n(&s_opus_fallback_test_used, 1, __ATOMIC_ACQ_REL)) {
        MLT("TEST: synthesizing EPPLAYER_ERROR_NOT_SUPPORTED_FORMAT after first OPUS preroll packet");
        on_error((int)WMP_ESPLUS_ERROR_NOT_SUPPORTED_FORMAT, NULL);
    }

    if (__atomic_load_n(&s_player_error, __ATOMIC_ACQUIRE)) {
        result.status = WMP_ESPLUS_SUBMIT_REJECTED;
        result.raw_status = INT_MIN;
    } else if (__atomic_load_n(&s_opus_fallback_error, __ATOMIC_ACQUIRE) ||
               __atomic_load_n(&s_opus_fallback_ready, __ATOMIC_ACQUIRE)) {
        result.status = WMP_ESPLUS_SUBMIT_NOT_PREPARED;
        result.raw_status = INT_MIN;
    }
    if (packet && packet->type == WMP_ESPLUS_STREAM_VIDEO)
        ++s_video_tries;
    mldiag_submit(packet && packet->type == WMP_ESPLUS_STREAM_VIDEO,
                  result.status == WMP_ESPLUS_SUBMIT_SUCCESS, result.raw_status);
    if (result.status == WMP_ESPLUS_SUBMIT_SUCCESS && packet) {
        uint64_t ms = packet->pts_ns / 1000000ull;
        if (packet->type == WMP_ESPLUS_STREAM_VIDEO) {
            s_last_video_pts_ms = ms;
            s_last_video_t = esplus_mono_ms();
            __atomic_fetch_add(&esplus_stats.submitted, 1, __ATOMIC_RELAXED);
        } else if (packet->type == WMP_ESPLUS_STREAM_AUDIO) {
            s_last_audio_pts_ms = ms;
        }
    }
    pthread_mutex_unlock(&s_lock);
    if (diag_first_video_submit)
        MLT_DIAG("first ESPlus video submit RETURN status=%d raw=%d",
                 (int)result.status, result.raw_status);
    return result;
}

int esplus_opus_fallback_ready(void)
{
    return __atomic_load_n(&s_opus_fallback_ready, __ATOMIC_ACQUIRE);
}

extern void VidEsplus_BeginPlayerRebuild(void);
extern void VidEsplus_CancelPlayerRebuild(void);
extern void VidEsplus_ResetAfterPlayerRebuild(void);

int esplus_recover_opus_as_pcm(const wmp_esplus_audio_info_t *pcm_info)
{
    int width, height, have_video_config, failure_already_reported;
    wmp_esplus_video_info_t video_info;

    if (!pcm_info || pcm_info->mime_type != WMP_ESPLUS_AUDIO_MIME_PCM_S16LE ||
        !esplus_opus_fallback_ready())
        return -1;

    pthread_mutex_lock(&s_recovery_lock);
    if (s_opus_fallback_attempted) {
        pthread_mutex_unlock(&s_recovery_lock);
        LiReportVideoRendererError();
        return -1;
    }
    s_opus_fallback_attempted = 1;

    pthread_mutex_lock(&s_lock);
    width = s_cached_window_width;
    height = s_cached_window_height;
    video_info = s_cached_video_info;
    if (s_cached_video_codec_data)
        video_info.codec_data = s_cached_video_codec_data;
    have_video_config = s_cached_video_info_valid && width > 0 && height > 0;
    pthread_mutex_unlock(&s_lock);

    if (!have_video_config) {
        MLT("OPUS fallback cannot rebuild ESPlus: cached video configuration unavailable");
        pthread_mutex_unlock(&s_recovery_lock);
        LiReportVideoRendererError();
        return -1;
    }

    MLT("rebuilding ESPlus player after OPUS preroll rejection");
    VidEsplus_BeginPlayerRebuild();
    esplus_close();
    if (!esplus_create_open()) {
        MLT("OPUS fallback: ESPlus player create/open failed");
        VidEsplus_CancelPlayerRebuild();
        pthread_mutex_unlock(&s_recovery_lock);
        LiReportVideoRendererError();
        return -1;
    }
    VidEsplus_ResetAfterPlayerRebuild();
    __atomic_store_n(&s_need_idr, 1, __ATOMIC_RELEASE);
    if (esplus_set_window(width, height) != 0) {
        MLT("OPUS fallback: video window recreation failed");
        goto fail_player;
    }
    if (esplus_set_video_info(&video_info) != 0) {
        MLT("OPUS fallback: video stream re-registration failed");
        goto fail_player;
    }
    if (esplus_set_audio_info(pcm_info) != 0) {
        MLT("OPUS fallback: PCM stream registration failed");
        goto fail_player;
    }

    esplus_audio_registration_complete(1);
    if (esplus_prepare() != 0) {
        MLT("OPUS fallback: prepare request failed");
        goto fail_player;
    }
    LiRequestIdrFrame();
    MLT("OPUS fallback: new ESPlus instance registered for PCM_S16LE");
    pthread_mutex_unlock(&s_recovery_lock);
    return 0;

fail_player:
    failure_already_reported =
        __atomic_load_n(&s_player_error, __ATOMIC_ACQUIRE) != 0;
    esplus_close();
    pthread_mutex_unlock(&s_recovery_lock);
    if (!failure_already_reported)
        LiReportVideoRendererError();
    return -1;
}

void esplus_close(void)
{

    pthread_mutex_lock(&s_lock);
    __atomic_store_n(&s_player_closing, 1, __ATOMIC_RELEASE);
    pthread_cond_broadcast(&s_state_cv);
    pthread_mutex_unlock(&s_lock);

    /* Stop the playback-clock sampler before its player/API pointers are closed. */
    sampler_stop();

    if (s_pl) {
        wmp_esplus_call_result_t stopped = wmp_esplus_adapter_stop(&s_adapter);
        wmp_esplus_call_result_t closed = wmp_esplus_adapter_close(&s_adapter);
        if (stopped.status != WMP_ESPLUS_CALL_SUCCESS ||
            closed.status != WMP_ESPLUS_CALL_SUCCESS) {
            MLT("ESPlus teardown warning: stop status=%d raw=%d, close status=%d raw=%d",
                (int)stopped.status, stopped.raw_status,
                (int)closed.status, closed.raw_status);
        }
        (void)stopped;
        (void)closed;
        wmp_esplus_adapter_unbind(&s_adapter);
    }

    pthread_mutex_lock(&s_lock);
    s_pl = NULL;
    __atomic_store_n(&s_prepared, 0, __ATOMIC_RELEASE);
    s_prepare_ok = 0;
    s_video_ready = 0;
    s_audio_ready = !s_audio_enabled;
    s_prepare_failed = s_start_failed = 0;
    __atomic_store_n(&s_player_error, 0, __ATOMIC_RELEASE);
    __atomic_store_n(&s_started, 0, __ATOMIC_RELEASE);
    s_start_tried = 0;
    s_prepare_called = 0;
    s_idr_t0 = s_idr_last = 0;
    s_idr_n = s_video_tries = 0;
    s_last_video_pts_ms = s_last_audio_pts_ms = 0;
    s_last_video_t = 0;
    __atomic_store_n(&s_need_idr, 0, __ATOMIC_RELEASE);
    s_catchup_done = s_catchup_hits = 0;
    s_fps_t0 = 0;
    nudge_reset(); s_tick_prev_ms = 0;
    __atomic_store_n(&s_auto_nudge, 0, __ATOMIC_RELAXED);
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
