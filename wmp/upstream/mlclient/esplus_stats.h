/*
 * esplus_stats.h - engine-internal contract between esplus_player.c, video_esplus.c
 * and engine_api.c (the public ABI stays mlengine.h). The counters work in release
 * builds: they are a product feature (UI overlay), not trace. Update them with
 * __atomic_fetch_add(..., __ATOMIC_RELAXED); player callbacks must never take the
 * player lock.
 */
#ifndef ESPLUS_STATS_H
#define ESPLUS_STATS_H
#include <stdint.h>

typedef struct {
  volatile uint32_t submitted;      /* video packets accepted (SUCCESS) */
  volatile uint32_t dropped_late;   /* skipped by the in-flight cap */
  volatile uint32_t dropped_full;   /* lost after FULL retries */
  volatile uint32_t underruns, overruns; /* video queue-empty/full notifications, not dropped frames */
  volatile uint32_t errors, last_error;
  volatile uint32_t recoveries;     /* retained for the frozen ml_engine_stats ABI; no player recovery */
  volatile int      recovery_state; /* retained ABI field; 2 records native resource conflict */
  volatile int32_t  depth_ms;       /* video: last pts - playing_time; INT32_MIN when unavailable */
  volatile int32_t  audio_depth_ms;  /* INT32_MIN when playback clock unavailable */
  volatile uint32_t playing_ms;     /* UINT32_MAX when playback clock unavailable */
  volatile uint32_t fps_submitted;  /* accepted video packets/sec, independent of player clock */
  volatile uint32_t video_format, video_width, video_height, video_fps, h264_level_idc;
  volatile uint32_t audio_codec, audio_channels, audio_sample_rate;
  volatile uint64_t video_bytes_received, audio_bytes_received;
  volatile uint64_t video_frames_received, video_frames_decoded, video_frames_rendered;
  volatile uint64_t video_total_frames, video_network_dropped_frames;
  volatile uint64_t total_reassembly_us, total_decode_us, total_render_us;
  volatile uint64_t host_latency_total;
  volatile uint32_t host_latency_count, host_latency_min, host_latency_max;
  /* Per-poll host-latency window, atomically exchanged by engine_api.c. */
  volatile uint64_t host_latency_window_total;
  volatile uint32_t host_latency_window_count, host_latency_window_min, host_latency_window_max;
} esplus_stats_t;

enum { ESPLUS_LAT_OFF, ESPLUS_LAT_NUDGE, ESPLUS_LAT_ARRIVAL };
typedef struct { int latency_mode, target_depth_ms, nudge_max_ms_per_s, drop_after_ms,
                 depth_poll_ms; } esplus_cfg_t;

extern esplus_stats_t esplus_stats;   /* counters: update with __atomic_fetch_add(..., __ATOMIC_RELAXED) */
extern esplus_cfg_t esplus_cfg;       /* read once per session in esplus_create_open, read-only afterwards */

/* One sampler step (playing time, depth, fps). The sampler thread calls it every
 * depth_poll_ms; the host test calls it with a fake clock. */
void esplus_sample_tick(uint64_t now_ms);

/* Latency nudge (mode nudge): ms the video sink subtracts from each PTS. Lock-free. */
int32_t esplus_correction_ms(void);
/* Counts sampler ticks; video uses it to skip at most one late frame per tick. */
uint32_t esplus_sample_seq(void);
/* CLOCK_MONOTONIC in ms (sampler, arrival-mode PTS). */
uint64_t esplus_mono_ms(void);

#endif
