/*
 * engine_api.c - implements the libmlengine.so C ABI (mlengine.h).
 *
 * This is the former body of main.c, turned into a reusable, non-blocking engine
 * so the .NET host and the CLI harness can both drive it.
 */
#define _GNU_SOURCE
#include <stdarg.h>
#include <arpa/inet.h>
#include <stdio.h>
#include <string.h>
#include <time.h>

#include "Limelight.h"
#include "errors.h"
#include "esplus_stats.h"
#include "esplus_player.h"
#include "mlengine.h"
#include "mldiag.h"
#include "mltrace.h"

extern int  ml_cert_init(const char *dir);
extern void VidEsplus_FillCallbacks(PDECODER_RENDERER_CALLBACKS cb);
extern void AudEsplus_FillCallbacks(PAUDIO_RENDERER_CALLBACKS cb);  /* audio_opus.c */
extern void AudEsplus_SetDolbyPassthroughEnabled(int enabled);      /* audio_opus.c */
extern int AudEsplus_GetActiveAudioCodec(void);

static int g_dolby_passthrough_enabled;
static int g_audio_enabled = 1;
extern int  input_init(void);                                      /* input_evdev.c */
extern void input_shutdown(void);
extern unsigned input_get_capabilities(void);
extern int  gs_orchestrate(const char *host, unsigned short httpPort, unsigned short httpsPort,
                           int appId, const char *pin, STREAM_CONFIGURATION *sc,
                           SERVER_INFORMATION *si, const char *datadir);

static volatile int g_running;   /* 1 while a session is up */
static volatile int g_started;   /* 1 once LiStartConnection succeeded (needs LiStop) */
static char g_host[256];         /* si.address is held by moonlight-common-c for the
                                    session, so the host string must outlive the call */
static uint64_t g_stream_info_last_time_ms, g_stream_info_last_video_bytes, g_stream_info_last_audio_bytes;
static uint64_t g_stream_info_last_received, g_stream_info_last_decoded, g_stream_info_last_rendered;
static uint64_t g_stream_info_last_total_frames, g_stream_info_last_dropped;
static uint64_t g_stream_info_last_reassembly_us, g_stream_info_last_decode_us, g_stream_info_last_render_us;
static uint32_t g_stream_info_last_fec_recovered, g_stream_info_last_fec_failed, g_stream_info_last_fec_oos;
static int g_stream_info_fec_baseline_valid;
/* Previous one-second window for EMSS-compatible rolling two-window values. */
static uint64_t g_stream_info_prev_elapsed_ms;
static uint64_t g_stream_info_prev_received, g_stream_info_prev_decoded, g_stream_info_prev_rendered;
static uint64_t g_stream_info_prev_total_frames, g_stream_info_prev_dropped;
static uint64_t g_stream_info_prev_reassembly_us, g_stream_info_prev_decode_us, g_stream_info_prev_render_us;
static uint32_t g_stream_info_prev_host_count, g_stream_info_prev_host_min, g_stream_info_prev_host_max;
static uint64_t g_stream_info_prev_host_total;

void (*volatile ml_log_cb)(const char *line);   /* see mltrace.h */
static ml_engine_stage_cb g_stage_cb;

void ml_engine_set_stage_cb(ml_engine_stage_cb cb) {
  __atomic_store_n(&g_stage_cb, cb, __ATOMIC_RELEASE);
}

void ml_engine_set_dolby_passthrough_enabled(int enabled) {
  g_dolby_passthrough_enabled = enabled != 0;
  MLT("Dolby passthrough preference %s", g_dolby_passthrough_enabled ? "enabled" : "disabled");
}

void ml_engine_set_log_cb(ml_engine_log_cb cb) {
  ml_log_cb = cb;
  MLT("log forwarding %s", cb ? "on" : "off");
}

static STREAM_CONFIGURATION g_sc;  /* static: held by moonlight-common-c for the session */
static SERVER_INFORMATION g_si;

/* moonlight-common-c session globals (Connection.c), set by the RTSP handshake. */
extern uint32_t EncryptionFeaturesSupported, EncryptionFeaturesRequested, EncryptionFeaturesEnabled;

/* Build the one-line failure report (also in release) from the engine counters. */
static void report_failure(int code, int stage) {
  uint32_t rtt = 0, var = 0;
  if (!LiGetEstimatedRttInfo(&rtt, &var)) rtt = var = 0;
  mldiag_fail(code, stage, stage >= 0 ? LiGetStageName(stage) : NULL, (int)LiGetHostFeatureFlags(),
              (int)rtt, (int)var, esplus_stats.errors, esplus_stats.last_error,
              EncryptionFeaturesSupported, EncryptionFeaturesRequested, EncryptionFeaturesEnabled);
  char line[2048]; mldiag_last(line, sizeof line);
  MLT("%s", line);
}

static void cl_stageFailed(int stage, int errorCode) {
  fprintf(stderr, "[ml] stage %d FAILED err=%d\n", stage, errorCode);
  MLT("stageFailed stage=%d err=%d", stage, errorCode);
  report_failure(errorCode, stage);
}
/* Host dropped the stream -> clear running so ml_engine_wait() returns and the
   caller runs ml_engine_stop(), which releases the HW overlay. Without this the
   overlay stays grabbed and blocks the TV's own broadcast video. */
static void cl_connTerminated(int errorCode) {
  fprintf(stderr, "[ml] connection terminated err=%d\n", errorCode);
  MLT("connectionTerminated err=%d", errorCode);
  if (errorCode != 0) report_failure(errorCode, -1);   /* before g_running = 0: the host reads it after */
  __atomic_store_n(&g_running, 0, __ATOMIC_RELEASE);
}
/* moonlight-common-c is built with LC_LOG (build-deps-lib.sh): Limelog formats the line
   itself and passes it as the only argument, so it is plain text here; a '%' in it must
   not be expanded again. */
static void cl_logMessage(const char *format, ...) {
  fputs(format, stderr);
  mldiag_cc_line(format);
  MLT("cc: %s", format);
}

static void cl_stageStarting(int stage) {
  const char *name = LiGetStageName(stage);
  ml_engine_stage_cb cb = __atomic_load_n(&g_stage_cb, __ATOMIC_ACQUIRE);
  if (cb) cb(stage, name ? name : "connection");
  fprintf(stderr, "[ml] stage %d (%s) starting\n", stage, name ? name : "unknown");
  MLT("stage %d (%s) starting", stage, name ? name : "unknown");
}
static void cl_stageComplete(int stage) {
  fprintf(stderr, "[ml] stage %d (%s) complete\n", stage, LiGetStageName(stage));
  MLT("stage %d (%s) complete", stage, LiGetStageName(stage));
}

/* Shared tail of both start paths: callbacks, LiStartConnection, input.
   Uses g_sc/g_si. Returns 0 or 1 (LiStartConnection failed). */
static int start_connection(void) {
  g_stream_info_last_time_ms = 0;  /* First poll establishes the post-handshake baseline. */
  g_stream_info_last_video_bytes = 0;
  g_stream_info_last_audio_bytes = 0;
  g_stream_info_last_received = 0;
  g_stream_info_last_decoded = 0;
  g_stream_info_last_rendered = 0;
  g_stream_info_last_total_frames = 0;
  g_stream_info_last_dropped = 0;
  g_stream_info_last_reassembly_us = 0;
  g_stream_info_last_decode_us = 0;
  g_stream_info_last_render_us = 0;
  g_stream_info_last_fec_recovered = 0;
  g_stream_info_last_fec_failed = 0;
  g_stream_info_last_fec_oos = 0;
  g_stream_info_fec_baseline_valid = 0;
  g_stream_info_prev_elapsed_ms = 0;
  g_stream_info_prev_received = g_stream_info_prev_decoded = g_stream_info_prev_rendered = 0;
  g_stream_info_prev_total_frames = g_stream_info_prev_dropped = 0;
  g_stream_info_prev_reassembly_us = g_stream_info_prev_decode_us = g_stream_info_prev_render_us = 0;
  g_stream_info_prev_host_count = 0;
  g_stream_info_prev_host_min = UINT32_MAX;
  g_stream_info_prev_host_max = 0;
  g_stream_info_prev_host_total = 0;
  __atomic_store_n(&esplus_stats.video_format, 0, __ATOMIC_RELAXED);
  __atomic_store_n(&esplus_stats.video_width, 0, __ATOMIC_RELAXED);
  __atomic_store_n(&esplus_stats.video_height, 0, __ATOMIC_RELAXED);
  __atomic_store_n(&esplus_stats.video_fps, 0, __ATOMIC_RELAXED);
  __atomic_store_n(&esplus_stats.h264_level_idc, 0, __ATOMIC_RELAXED);
  __atomic_store_n(&esplus_stats.audio_codec, 0, __ATOMIC_RELAXED);
  __atomic_store_n(&esplus_stats.audio_channels, 0, __ATOMIC_RELAXED);
  __atomic_store_n(&esplus_stats.audio_sample_rate, 0, __ATOMIC_RELAXED);
  __atomic_store_n(&esplus_stats.video_bytes_received, 0, __ATOMIC_RELAXED);
  __atomic_store_n(&esplus_stats.audio_bytes_received, 0, __ATOMIC_RELAXED);
  __atomic_store_n(&esplus_stats.video_frames_received, 0, __ATOMIC_RELAXED);
  __atomic_store_n(&esplus_stats.video_frames_decoded, 0, __ATOMIC_RELAXED);
  __atomic_store_n(&esplus_stats.video_frames_rendered, 0, __ATOMIC_RELAXED);
  __atomic_store_n(&esplus_stats.video_total_frames, 0, __ATOMIC_RELAXED);
  __atomic_store_n(&esplus_stats.video_network_dropped_frames, 0, __ATOMIC_RELAXED);
  __atomic_store_n(&esplus_stats.total_reassembly_us, 0, __ATOMIC_RELAXED);
  __atomic_store_n(&esplus_stats.total_decode_us, 0, __ATOMIC_RELAXED);
  __atomic_store_n(&esplus_stats.total_render_us, 0, __ATOMIC_RELAXED);
  __atomic_store_n(&esplus_stats.host_latency_total, 0, __ATOMIC_RELAXED);
  __atomic_store_n(&esplus_stats.host_latency_count, 0, __ATOMIC_RELAXED);
  __atomic_store_n(&esplus_stats.host_latency_min, UINT32_MAX, __ATOMIC_RELAXED);
  __atomic_store_n(&esplus_stats.host_latency_max, 0, __ATOMIC_RELAXED);
  __atomic_store_n(&esplus_stats.host_latency_window_total, 0, __ATOMIC_RELAXED);
  __atomic_store_n(&esplus_stats.host_latency_window_count, 0, __ATOMIC_RELAXED);
  __atomic_store_n(&esplus_stats.host_latency_window_min, UINT32_MAX, __ATOMIC_RELAXED);
  __atomic_store_n(&esplus_stats.host_latency_window_max, 0, __ATOMIC_RELAXED);
  AudEsplus_SetDolbyPassthroughEnabled(g_audio_enabled && g_dolby_passthrough_enabled);
  esplus_set_audio_enabled(g_audio_enabled);
  DECODER_RENDERER_CALLBACKS dr; VidEsplus_FillCallbacks(&dr);
  AUDIO_RENDERER_CALLBACKS ar;
  PAUDIO_RENDERER_CALLBACKS arCallbacks = NULL;
  if (g_audio_enabled) {
    AudEsplus_FillCallbacks(&ar);
    arCallbacks = &ar;
  }
  CONNECTION_LISTENER_CALLBACKS cl;
  LiInitializeConnectionCallbacks(&cl);
  cl.stageStarting = cl_stageStarting;
  cl.stageComplete = cl_stageComplete;
  cl.stageFailed = cl_stageFailed;
  cl.connectionTerminated = cl_connTerminated;
  cl.logMessage = cl_logMessage;

  MLT("LiStartConnection %dx%d@%d %dkbps fmt=0x%x audio=0x%x pkt=%d", g_sc.width, g_sc.height, g_sc.fps,
      g_sc.bitrate, g_sc.supportedVideoFormats, g_sc.audioConfiguration, g_sc.packetSize);
  fprintf(stderr, "[ml] LiStartConnection %dx%d@%d %dkbps -> %s\n",
          g_sc.width, g_sc.height, g_sc.fps, g_sc.bitrate, (const char *)g_si.address);
  char rtspscheme[12] = "-";   /* "rtsp" or "rtspenc": which RTSP transport the host gave us (no secret) */
  if (g_si.rtspSessionUrl) {
    const char *sep = strstr(g_si.rtspSessionUrl, "://");
    int n = sep ? (int)(sep - g_si.rtspSessionUrl) : 0;
    if (n > 0 && n < (int)sizeof rtspscheme) { memcpy(rtspscheme, g_si.rtspSessionUrl, (size_t)n); rtspscheme[n] = 0; }
  }
  mldiag_cfg dc = { g_sc.width, g_sc.height, g_sc.fps, g_sc.bitrate, g_sc.packetSize,
                    g_sc.supportedVideoFormats, g_sc.colorSpace, g_sc.colorRange, g_sc.audioConfiguration,
                    g_si.serverCodecModeSupport, g_sc.encryptionFlags,
                    g_si.serverInfoAppVersion, g_si.serverInfoGfeVersion,
                    (const unsigned char *)g_sc.remoteInputAesKey, 0, rtspscheme };
  { unsigned id; memcpy(&id, g_sc.remoteInputAesIv, 4); dc.rikeyid = (int)ntohl(id); }   /* rikeyid is the IV's first 4 bytes, big-endian */
  mldiag_reset(&dc);
  /* Publish the active state before Common C starts its worker threads.
   * connectionTerminated may be called from a renderer callback as soon as
   * LiStartConnectionEx starts processing. Setting g_running after the call
   * could overwrite that termination and leave the host worker running forever. */
  __atomic_store_n(&g_running, 1, __ATOMIC_RELEASE);
  int err = LiStartConnectionEx(&g_si, &g_sc, &cl, &dr, arCallbacks, NULL, 0, NULL, 0,
                                g_audio_enabled);
  if (err != 0) {
    __atomic_store_n(&g_running, 0, __ATOMIC_RELEASE);
    fprintf(stderr, "[ml] LiStartConnectionEx failed: %d\n", err);
    MLT("start_connection -> 1 (LiStartConnectionEx %d)", err);
    return 1;
  }
  MLT("LiStartConnection -> 0");
  g_started = 1;

  int in = input_init();
  MLT("input_init -> %d", in);
  if (in != 0) fprintf(stderr, "[ml] evdev input unavailable; browser input bridge remains active\n");
  fprintf(stderr, "[ml] streaming\n");
  return 0;
}

int ml_engine_start(const char *host, int appId, const char *pin,
                    int width, int height, int fps, int bitrate_kbps,
                    const char *datadir) {
  MLT("ml_engine_start host=%s appId=%d pin=%s %dx%d@%d %dkbps datadir=%s",
      host ? host : "(null)", appId, pin ? "(set)" : "(null)", width, height, fps,
      bitrate_kbps, datadir ? datadir : "(null)");
  if (g_running) { MLT("ml_engine_start -> 0 (already streaming)"); return 0; }
  if (g_started) ml_engine_stop();  /* previous session ended by host drop but was never stopped */
  g_audio_enabled = 1;
  mldiag_reset(NULL);   /* an early failure must not report the previous session */
  if (!host) { MLT("ml_engine_start -> 2 (no host)"); return 2; }
  if (!datadir) datadir = "/tmp";
  if (!width)  width = 1920;
  if (!height) height = 1080;
  if (!fps)    fps = 60;
  if (!bitrate_kbps) bitrate_kbps = 20000;
  snprintf(g_host, sizeof g_host, "%s", host);
  const unsigned short httpPort = 47989, httpsPort = 47984;

  int certrc = ml_cert_init(datadir);
  MLT("cert init rc=%d", certrc);
  if (certrc != 0) { fprintf(stderr, "[ml] cert init failed\n"); MLT("ml_engine_start -> 1 (cert)"); return 1; }

  LiInitializeStreamConfiguration(&g_sc);
  g_sc.width = width; g_sc.height = height; g_sc.fps = fps; g_sc.bitrate = bitrate_kbps;
  g_sc.packetSize = 1392;   /* LAN packet size used by GameStream clients (fewer packets, less FEC overhead at high bitrates) */
  g_sc.supportedVideoFormats = VIDEO_FORMAT_H264;   /* HEVC later */
  g_sc.colorSpace = COLORSPACE_REC_709;
  g_sc.colorRange = COLOR_RANGE_LIMITED;
  g_sc.audioConfiguration = AUDIO_CONFIGURATION_STEREO;

  LiInitializeServerInformation(&g_si);
  g_si.address = g_host;

  if (gs_orchestrate(g_host, httpPort, httpsPort, appId, pin, &g_sc, &g_si, datadir) != 0) {
    fprintf(stderr, "[ml] GameStream orchestration failed; cannot start stream.\n");
    MLT("ml_engine_start -> 3 (orchestrate)");
    return 3;
  }
  g_si.serverCodecModeSupport = SCM_H264;

  if (start_connection() != 0) return 1;
  MLT("ml_engine_start -> 0");
  return 0;
}

void ml_engine_set_performance_stats_enabled(int enabled) {
  esplus_set_performance_stats_enabled(enabled);
  g_stream_info_last_time_ms = 0;
  g_stream_info_last_video_bytes = 0;
  g_stream_info_last_audio_bytes = 0;
  g_stream_info_last_received = g_stream_info_last_decoded = g_stream_info_last_rendered = 0;
  g_stream_info_last_total_frames = g_stream_info_last_dropped = 0;
  g_stream_info_last_reassembly_us = g_stream_info_last_decode_us = g_stream_info_last_render_us = 0;
  g_stream_info_fec_baseline_valid = 0;
  g_stream_info_prev_elapsed_ms = 0;
  g_stream_info_prev_received = g_stream_info_prev_decoded = g_stream_info_prev_rendered = 0;
  g_stream_info_prev_total_frames = g_stream_info_prev_dropped = 0;
  g_stream_info_prev_reassembly_us = g_stream_info_prev_decode_us = g_stream_info_prev_render_us = 0;
  g_stream_info_prev_host_count = 0;
  g_stream_info_prev_host_min = UINT32_MAX;
  g_stream_info_prev_host_max = 0;
  g_stream_info_prev_host_total = 0;
}

int ml_engine_get_active_audio_codec(void) {
  return AudEsplus_GetActiveAudioCodec();
}

int ml_engine_video_ready(void) {
  return esplus_video_ready();
}

int ml_engine_input_capabilities(void) {
  return (int)input_get_capabilities();
}

int ml_engine_get_stats(ml_engine_stats *out) {
  if (!out || out->struct_size < (int32_t)sizeof *out) return GS_INVALID;
  const esplus_stats_t *s = &esplus_stats;
  out->running = g_running;
  out->depth_ms = s->depth_ms; out->audio_depth_ms = s->audio_depth_ms; out->playing_ms = s->playing_ms;
  out->submitted = s->submitted; out->dropped_late = s->dropped_late; out->dropped_full = s->dropped_full;
  out->fps_submitted = s->fps_submitted; out->underruns = s->underruns; out->overruns = s->overruns;
  out->errors = s->errors; out->last_error = s->last_error;
  out->recoveries = s->recoveries; out->recovery_state = s->recovery_state;
  return 0;
}

int ml_engine_get_stream_info(ml_engine_stream_info *out) {
  struct timespec ts;
  uint64_t now_ms, elapsed_ms = 0, video_bytes, audio_bytes;
  uint64_t received, decoded, rendered, total_frames, dropped_frames;
  uint64_t reassembly_us, decode_us, render_us;
  uint64_t interval_received = 0, interval_decoded = 0, interval_rendered = 0;
  uint64_t interval_total_frames = 0, interval_dropped = 0;
  uint64_t interval_reassembly_us = 0, interval_decode_us = 0, interval_render_us = 0;
  uint64_t combined_elapsed, combined_received, combined_decoded, combined_rendered;
  uint64_t combined_total_frames, combined_dropped;
  uint64_t combined_reassembly_us, combined_decode_us, combined_render_us;
  uint32_t host_count, host_min, host_max;
  uint64_t host_total;
  RTP_AUDIO_FEC_STATS audio_fec = {0};
  if (!out || out->struct_size < (int32_t)sizeof *out) return GS_INVALID;

  clock_gettime(CLOCK_MONOTONIC, &ts);
  now_ms = (uint64_t)ts.tv_sec * 1000ull + (uint64_t)ts.tv_nsec / 1000000ull;
  video_bytes = __atomic_load_n(&esplus_stats.video_bytes_received, __ATOMIC_RELAXED);
  audio_bytes = __atomic_load_n(&esplus_stats.audio_bytes_received, __ATOMIC_RELAXED);
  received = __atomic_load_n(&esplus_stats.video_frames_received, __ATOMIC_RELAXED);
  decoded = __atomic_load_n(&esplus_stats.video_frames_decoded, __ATOMIC_RELAXED);
  rendered = __atomic_load_n(&esplus_stats.video_frames_rendered, __ATOMIC_RELAXED);
  total_frames = __atomic_load_n(&esplus_stats.video_total_frames, __ATOMIC_RELAXED);
  dropped_frames = __atomic_load_n(&esplus_stats.video_network_dropped_frames, __ATOMIC_RELAXED);
  reassembly_us = __atomic_load_n(&esplus_stats.total_reassembly_us, __ATOMIC_RELAXED);
  decode_us = __atomic_load_n(&esplus_stats.total_decode_us, __ATOMIC_RELAXED);
  render_us = __atomic_load_n(&esplus_stats.total_render_us, __ATOMIC_RELAXED);

  /* Common C owns transport RTT and RTP audio FEC, independently of the renderer. */
  if (g_audio_enabled) LiGetRTPAudioFecStats(&audio_fec);
  out->video_format = __atomic_load_n(&esplus_stats.video_format, __ATOMIC_RELAXED);
  out->video_width = __atomic_load_n(&esplus_stats.video_width, __ATOMIC_RELAXED);
  out->video_height = __atomic_load_n(&esplus_stats.video_height, __ATOMIC_RELAXED);
  out->video_fps = __atomic_load_n(&esplus_stats.video_fps, __ATOMIC_RELAXED);
  out->h264_level_idc = __atomic_load_n(&esplus_stats.h264_level_idc, __ATOMIC_RELAXED);
  out->audio_codec = __atomic_load_n(&esplus_stats.audio_codec, __ATOMIC_RELAXED);
  out->audio_channels = __atomic_load_n(&esplus_stats.audio_channels, __ATOMIC_RELAXED);
  out->audio_sample_rate = __atomic_load_n(&esplus_stats.audio_sample_rate, __ATOMIC_RELAXED);
  out->video_bitrate_kbps = 0;
  out->audio_bitrate_kbps = 0;
  out->network_rtt_ms = 0;
  out->network_variance_ms = 0;
  out->video_fps_received = 0;
  out->video_fps_decoded = 0;
  out->video_fps_rendered = 0;
  out->video_fps_total = 0;
  out->network_dropped_percent_x100 = 0;
  out->average_reassembly_us = 0;
  out->average_decode_us = 0;
  out->average_render_us = 0;
  out->video_dropped_frames_interval = 0;

  if (g_stream_info_fec_baseline_valid) {
    out->audio_fec_recovered = audio_fec.recoveredPackets >= g_stream_info_last_fec_recovered
        ? audio_fec.recoveredPackets - g_stream_info_last_fec_recovered : audio_fec.recoveredPackets;
    out->audio_fec_failed = audio_fec.failedBlocks >= g_stream_info_last_fec_failed
        ? audio_fec.failedBlocks - g_stream_info_last_fec_failed : audio_fec.failedBlocks;
    out->audio_fec_out_of_order = audio_fec.outOfOrderPackets >= g_stream_info_last_fec_oos
        ? audio_fec.outOfOrderPackets - g_stream_info_last_fec_oos : audio_fec.outOfOrderPackets;
  } else {
    /* Establish a Common C baseline so a previous session cannot leak into this overlay. */
    out->audio_fec_recovered = 0;
    out->audio_fec_failed = 0;
    out->audio_fec_out_of_order = 0;
    g_stream_info_fec_baseline_valid = 1;
  }
  g_stream_info_last_fec_recovered = audio_fec.recoveredPackets;
  g_stream_info_last_fec_failed = audio_fec.failedBlocks;
  g_stream_info_last_fec_oos = audio_fec.outOfOrderPackets;
  (void)LiGetEstimatedRttInfo(&out->network_rtt_ms, &out->network_variance_ms);

  if (g_stream_info_last_time_ms && now_ms > g_stream_info_last_time_ms &&
      video_bytes >= g_stream_info_last_video_bytes && audio_bytes >= g_stream_info_last_audio_bytes &&
      received >= g_stream_info_last_received && decoded >= g_stream_info_last_decoded &&
      rendered >= g_stream_info_last_rendered && total_frames >= g_stream_info_last_total_frames &&
      dropped_frames >= g_stream_info_last_dropped &&
      reassembly_us >= g_stream_info_last_reassembly_us &&
      decode_us >= g_stream_info_last_decode_us && render_us >= g_stream_info_last_render_us) {
    elapsed_ms = now_ms - g_stream_info_last_time_ms;
    interval_received = received - g_stream_info_last_received;
    interval_decoded = decoded - g_stream_info_last_decoded;
    interval_rendered = rendered - g_stream_info_last_rendered;
    interval_total_frames = total_frames - g_stream_info_last_total_frames;
    interval_dropped = dropped_frames - g_stream_info_last_dropped;
    interval_reassembly_us = reassembly_us - g_stream_info_last_reassembly_us;
    interval_decode_us = decode_us - g_stream_info_last_decode_us;
    interval_render_us = render_us - g_stream_info_last_render_us;

    uint64_t video_rate = ((video_bytes - g_stream_info_last_video_bytes) * 8ull) / elapsed_ms;
    uint64_t audio_rate = ((audio_bytes - g_stream_info_last_audio_bytes) * 8ull) / elapsed_ms;
    out->video_bitrate_kbps = video_rate > UINT32_MAX ? UINT32_MAX : (uint32_t)video_rate;
    out->audio_bitrate_kbps = audio_rate > UINT32_MAX ? UINT32_MAX : (uint32_t)audio_rate;
    out->video_dropped_frames_interval = interval_dropped;
  } else if (g_stream_info_last_time_ms) {
    /* A counter reset invalidates the rolling window; begin a fresh baseline. */
    g_stream_info_prev_elapsed_ms = 0;
    g_stream_info_prev_received = g_stream_info_prev_decoded = g_stream_info_prev_rendered = 0;
    g_stream_info_prev_total_frames = g_stream_info_prev_dropped = 0;
    g_stream_info_prev_reassembly_us = g_stream_info_prev_decode_us = g_stream_info_prev_render_us = 0;
  }

  combined_elapsed = elapsed_ms + g_stream_info_prev_elapsed_ms;
  combined_received = interval_received + g_stream_info_prev_received;
  combined_decoded = interval_decoded + g_stream_info_prev_decoded;
  combined_rendered = interval_rendered + g_stream_info_prev_rendered;
  combined_total_frames = interval_total_frames + g_stream_info_prev_total_frames;
  combined_dropped = interval_dropped + g_stream_info_prev_dropped;
  combined_reassembly_us = interval_reassembly_us + g_stream_info_prev_reassembly_us;
  combined_decode_us = interval_decode_us + g_stream_info_prev_decode_us;
  combined_render_us = interval_render_us + g_stream_info_prev_render_us;
  if (combined_elapsed != 0) {
    out->video_fps_received = (uint32_t)((combined_received * 1000ull) / combined_elapsed);
    out->video_fps_decoded = (uint32_t)((combined_decoded * 1000ull) / combined_elapsed);
    out->video_fps_rendered = (uint32_t)((combined_rendered * 1000ull) / combined_elapsed);
    out->video_fps_total = (uint32_t)((combined_total_frames * 1000ull) / combined_elapsed);
  }
  if (combined_total_frames != 0)
    out->network_dropped_percent_x100 =
        (uint32_t)((combined_dropped * 10000ull) / combined_total_frames);
  out->average_reassembly_us = combined_decoded
      ? (uint32_t)(combined_reassembly_us / combined_decoded) : 0;
  out->average_decode_us = combined_decoded
      ? (uint32_t)(combined_decode_us / combined_decoded) : 0;
  out->average_render_us = combined_rendered
      ? (uint32_t)(combined_render_us / combined_rendered) : 0;

  /* Host latency is windowed and combined over two polls, like EMSS's two windows. */
  host_total = __atomic_exchange_n(&esplus_stats.host_latency_window_total, 0, __ATOMIC_RELAXED);
  host_count = __atomic_exchange_n(&esplus_stats.host_latency_window_count, 0, __ATOMIC_RELAXED);
  host_min = __atomic_exchange_n(&esplus_stats.host_latency_window_min, UINT32_MAX, __ATOMIC_RELAXED);
  host_max = __atomic_exchange_n(&esplus_stats.host_latency_window_max, 0, __ATOMIC_RELAXED);
  out->host_latency_min_tenths_ms = 0;
  out->host_latency_max_tenths_ms = 0;
  out->host_latency_avg_tenths_ms = 0;
  if (host_count || g_stream_info_prev_host_count) {
    uint32_t min_value = host_count && host_min != UINT32_MAX ? host_min : UINT32_MAX;
    uint32_t max_value = host_count ? host_max : 0;
    uint64_t total_value = host_total;
    uint32_t count_value = host_count;
    if (g_stream_info_prev_host_count) {
      if (g_stream_info_prev_host_min < min_value) min_value = g_stream_info_prev_host_min;
      if (g_stream_info_prev_host_max > max_value) max_value = g_stream_info_prev_host_max;
      total_value += g_stream_info_prev_host_total;
      count_value += g_stream_info_prev_host_count;
    }
    out->host_latency_min_tenths_ms = min_value == UINT32_MAX ? 0 : min_value;
    out->host_latency_max_tenths_ms = max_value;
    out->host_latency_avg_tenths_ms = count_value ? (uint32_t)(total_value / count_value) : 0;
  }
  g_stream_info_prev_host_count = host_count;
  g_stream_info_prev_host_min = host_count && host_min != UINT32_MAX ? host_min : UINT32_MAX;
  g_stream_info_prev_host_max = host_max;
  g_stream_info_prev_host_total = host_total;

  /* Retain this interval for the next rolling two-window calculation. */
  g_stream_info_prev_elapsed_ms = elapsed_ms;
  g_stream_info_prev_received = interval_received;
  g_stream_info_prev_decoded = interval_decoded;
  g_stream_info_prev_rendered = interval_rendered;
  g_stream_info_prev_total_frames = interval_total_frames;
  g_stream_info_prev_dropped = interval_dropped;
  g_stream_info_prev_reassembly_us = interval_reassembly_us;
  g_stream_info_prev_decode_us = interval_decode_us;
  g_stream_info_prev_render_us = interval_render_us;

  g_stream_info_last_time_ms = now_ms;
  g_stream_info_last_video_bytes = video_bytes;
  g_stream_info_last_audio_bytes = audio_bytes;
  g_stream_info_last_received = received;
  g_stream_info_last_decoded = decoded;
  g_stream_info_last_rendered = rendered;
  g_stream_info_last_total_frames = total_frames;
  g_stream_info_last_dropped = dropped_frames;
  g_stream_info_last_reassembly_us = reassembly_us;
  g_stream_info_last_decode_us = decode_us;
  g_stream_info_last_render_us = render_us;
  return 0;
}

int ml_engine_last_error(char *buf, int len) { return mldiag_last(buf, len); }

int ml_engine_running(void) {   /* polled every 500 ms by the host: trace only changes */
  static int last = -1; int r = __atomic_load_n(&g_running, __ATOMIC_ACQUIRE);
  if (r != last) { MLT("ml_engine_running -> %d", r); last = r; }
  return r;
}

void ml_engine_wait(void) {
  MLT("ml_engine_wait");
  while (g_running) { struct timespec ts = {0, 200000000}; nanosleep(&ts, NULL); }
  MLT("ml_engine_wait -> returned");
}

void ml_engine_stop(void) {
  MLT("ml_engine_stop started=%d", g_started);
  g_running = 0;
  if (!g_started) { MLT("ml_engine_stop -> nothing to stop"); return; }
  g_started = 0;
  fprintf(stderr, "[ml] stopping, releasing overlay\n");
  input_shutdown();
  LiStopConnection();   /* tears down stages -> video sink cleanup -> esplus_close */
  MLT("ml_engine_stop -> done");
}

/* Copy for the session lifetime: moonlight-common-c keeps these pointers. */
static char g_sess_host[256], g_sess_appver[64], g_sess_gfever[64], g_sess_rtsp[512];

static int hexval(char c) {
  if (c >= '0' && c <= '9') return c - '0';
  if (c >= 'a' && c <= 'f') return c - 'a' + 10;
  if (c >= 'A' && c <= 'F') return c - 'A' + 10;
  return -1;
}

/* Invalid start parameters are failed commands and must replace stale diagnostics. */
static int invalid_settings(int width, int height, int fps, int bitrate_kbps, const char *why) {
  (void)why; /* MLT compiles to a no-op in release builds. */
  mldiag_cfg cfg = {
    .width = width,
    .height = height,
    .fps = fps,
    .bitrate_kbps = bitrate_kbps
  };
  mldiag_reset(&cfg);
  mldiag_fail(GS_INVALID, 0, "settings", 0, 0, 0, 0, 0, 0, 0, 0);
  MLT("ml_engine_start_session -> GS_INVALID (%s)", why);
  return GS_INVALID;
}

static int start_session_impl(const char *host, int width, int height, int fps, int bitrate_kbps,
                              const char *rikey_hex, int rikeyid, const char *app_version,
                              const char *gfe_version, const char *rtsp_url,
                              int server_codec_mode_support, const char *video_codec, int hdr,
                              const char *audio_config, int full_range, int audio_enabled) {
  MLT("ml_engine_start_session host=%s %dx%d@%d %dkbps rikey=%s rikeyid=%d appver=%s gfever=%s rtsp=%s scm=%d codec=%s hdr=%d audio=%s full_range=%d audio_enabled=%d",
      host ? "(configured)" : "(null)", width, height, fps, bitrate_kbps, rikey_hex ? "(set)" : "(null)",
      rikeyid, app_version ? app_version : "(null)", gfe_version ? gfe_version : "(null)",
      rtsp_url ? "(set)" : "(null)", server_codec_mode_support, video_codec ? video_codec : "(null)",
      hdr, audio_config ? audio_config : "(null)", full_range, audio_enabled != 0);
  if (g_running) { MLT("ml_engine_start_session -> 0 (already streaming)"); return 0; }
  if (g_started) ml_engine_stop();
  g_audio_enabled = audio_enabled != 0;
  mldiag_reset(NULL);   /* an early failure must not report the previous session */
  if (!host || !rikey_hex || strlen(rikey_hex) != 32)
    return invalid_settings(width, height, fps, bitrate_kbps, "host or rikey length");
  unsigned char key[16];
  for (int i = 0; i < 16; i++) {
    int hi = hexval(rikey_hex[i * 2]), lo = hexval(rikey_hex[i * 2 + 1]);
    if (hi < 0 || lo < 0)
      return invalid_settings(width, height, fps, bitrate_kbps, "rikey hex");
    key[i] = (unsigned char)(hi << 4 | lo);
  }
  if (!width)  width = 1920;
  if (!height) height = 1080;
  if (!fps)    fps = 60;
  if (!bitrate_kbps) bitrate_kbps = 20000;
  /* validate at the ABI boundary: bad values return an error the host can report */
  if (width < 320 || width > 7680 || height < 240 || height > 4320 || fps < 10 || fps > 240 ||
      bitrate_kbps < 500 || bitrate_kbps > 500000 || !*host) {
    return invalid_settings(width, height, fps, bitrate_kbps, "bad stream settings");
  }
  snprintf(g_sess_host, sizeof g_sess_host, "%s", host);
  snprintf(g_sess_appver, sizeof g_sess_appver, "%s", app_version ? app_version : "");
  snprintf(g_sess_gfever, sizeof g_sess_gfever, "%s", gfe_version ? gfe_version : "");
  snprintf(g_sess_rtsp, sizeof g_sess_rtsp, "%s", rtsp_url ? rtsp_url : "");

  LiInitializeStreamConfiguration(&g_sc);
  g_sc.width = width; g_sc.height = height; g_sc.fps = fps; g_sc.bitrate = bitrate_kbps;
  g_sc.packetSize = 1392;   /* LAN packet size used by GameStream clients (fewer packets, less FEC overhead at high bitrates) */
  if (video_codec && !strcmp(video_codec, "HEVC"))
    g_sc.supportedVideoFormats = hdr ? VIDEO_FORMAT_H265_MAIN10 : VIDEO_FORMAT_H265;
  else {
    if (video_codec && !strcmp(video_codec, "AV1")) {
      fprintf(stderr, "[ml] AV1 not supported by the video sink, using H264\n");
      MLT("start_session: AV1 -> H264 fallback");
    }
    g_sc.supportedVideoFormats = VIDEO_FORMAT_H264;
  }
  int hevc = g_sc.supportedVideoFormats & VIDEO_FORMAT_MASK_H265;
  g_sc.colorSpace = (hdr && hevc) ? COLORSPACE_REC_2020 : COLORSPACE_REC_709;
  g_sc.colorRange = full_range ? COLOR_RANGE_FULL : COLOR_RANGE_LIMITED;
  MLT("start_session: colorSpace=%d colorRange=%d", g_sc.colorSpace, g_sc.colorRange);
  /* Disabled audio must not advertise the configured multichannel layout to the host. */
  g_sc.audioConfiguration = !g_audio_enabled || !audio_config ? AUDIO_CONFIGURATION_STEREO
    : !strcmp(audio_config, "51Surround") ? AUDIO_CONFIGURATION_51_SURROUND
    : !strcmp(audio_config, "71Surround") ? AUDIO_CONFIGURATION_71_SURROUND
    : AUDIO_CONFIGURATION_STEREO;
  memcpy(g_sc.remoteInputAesKey, key, 16);
  memset(g_sc.remoteInputAesIv, 0, 16);
  int iv = (int)htonl((unsigned int)rikeyid);
  memcpy(g_sc.remoteInputAesIv, &iv, sizeof iv);

  LiInitializeServerInformation(&g_si);
  g_si.address = g_sess_host;
  g_si.serverInfoAppVersion = g_sess_appver;
  g_si.serverInfoGfeVersion = g_sess_gfever;
  g_si.rtspSessionUrl = g_sess_rtsp[0] ? g_sess_rtsp : NULL;
  g_si.serverCodecModeSupport = server_codec_mode_support ? server_codec_mode_support : SCM_H264;

  int rc = start_connection();
  MLT("ml_engine_start_session -> %d", rc);
  return rc;
}

int ml_engine_start_session(const char *host, int width, int height, int fps, int bitrate_kbps,
                            const char *rikey_hex, int rikeyid, const char *app_version,
                            const char *gfe_version, const char *rtsp_url,
                            int server_codec_mode_support, const char *video_codec, int hdr,
                            const char *audio_config) {
  return start_session_impl(host, width, height, fps, bitrate_kbps, rikey_hex, rikeyid, app_version,
                            gfe_version, rtsp_url, server_codec_mode_support, video_codec, hdr,
                            audio_config, 0, 1);
}

int ml_engine_start_session_v2(const char *host, int width, int height, int fps, int bitrate_kbps,
                               const char *rikey_hex, int rikeyid, const char *app_version,
                               const char *gfe_version, const char *rtsp_url,
                               int server_codec_mode_support, const char *video_codec, int hdr,
                               const char *audio_config, int full_range, int audio_enabled) {
  return start_session_impl(host, width, height, fps, bitrate_kbps, rikey_hex, rikeyid, app_version,
                            gfe_version, rtsp_url, server_codec_mode_support, video_codec, hdr,
                            audio_config, full_range, audio_enabled);
}
