/*
 * mlengine.h - public C ABI of libmlengine.so.
 *
 * One stable surface used by both the .NET (TizenFX) host and the CLI harness:
 *   - the .NET host loads the .so and P/Invokes these symbols (1:1 DllImport);
 *   - the CLI harness (main.c) links this .so directly for bring-up/testing.
 * Keep this ABI additive: never change a signature, only append new functions.
 */
#ifndef MLENGINE_H
#define MLENGINE_H
#include <stdint.h>
#ifdef __cplusplus
extern "C" {
#endif

/* Start a GameStream session. Non-blocking: does cert init, GameStream
 * orchestration (serverinfo->pair->launch->RTSP), LiStartConnection and input,
 * then returns 0 with streaming running on background threads; non-zero on
 * failure. pin may be NULL when the host is already paired. datadir NULL -> /tmp.
 * The strings need only stay valid for the duration of this call. */
int  ml_engine_start(const char *host, int appId, const char *pin,
                     int width, int height, int fps, int bitrate_kbps,
                     const char *datadir);

/* 1 while a session is active, 0 once it has ended (host drop / error / stop). */
int  ml_engine_running(void);

/* Block until the session ends or ml_engine_stop() is called. */
void ml_engine_wait(void);

/* Stop the session and release the HW video overlay. Idempotent. */
void ml_engine_stop(void);

/* Per-step calls used by the web UI through the host (pkg/ui/PROTOCOL.md).
 * Out strings/buffers are malloc'd: release them with ml_engine_free(). All return
 * 0 on success, else an engine/libgamestream error code (GS_* from errors.h). */
int  ml_engine_make_cert(char **cert_pem, char **key_pem);
int  ml_engine_http_init(const char *cert_pem, const char *key_pem, const char *unique_id);
int  ml_engine_open_url(const char *url, const char *ppk, unsigned char **out, int *out_len);
int  ml_engine_pair(int server_major, const char *address, int http_port, const char *pin,
                    char **server_cert_pem);
void ml_engine_cancel_request(void);
int  ml_engine_start_session(const char *host, int width, int height, int fps, int bitrate_kbps,
                             const char *rikey_hex, int rikeyid, const char *app_version,
                             const char *gfe_version, const char *rtsp_url,
                             int server_codec_mode_support, const char *video_codec, int hdr,
                             const char *audio_config);
void ml_engine_send_key(int key_code, int key_action, int modifiers);
void ml_engine_send_mouse_move(int delta_x, int delta_y);
void ml_engine_send_mouse_button(int button, int pressed);
void ml_engine_send_mouse_scroll(int amount);
void ml_engine_free(void *p);

/* On-demand log forwarding: when cb is set, each engine trace line (MLT, debug
 * builds) is also passed to cb, from any engine thread. NULL turns it off. The
 * dlog/stderr output is unchanged. Release builds have no trace lines. */
typedef void (*ml_engine_log_cb)(const char *line);
void ml_engine_set_log_cb(ml_engine_log_cb cb);

/* Live Common C connection-stage notifications, delivered on the native callback thread. */
typedef void (*ml_engine_stage_cb)(int stage, const char *name);
void ml_engine_set_stage_cb(ml_engine_stage_cb cb);

/* Select whether the WMP audio renderer may advertise optional AC-3/E-AC-3
 * passthrough during the next session's RTSP negotiation. */
void ml_engine_set_dolby_passthrough_enabled(int enabled);

/* Live playback statistics (UI overlay, pkg/ui/PROTOCOL.md `mlstats`). The caller
 * sets struct_size = sizeof(ml_engine_stats); the engine fills the struct and
 * returns 0, or GS_INVALID when out is NULL or struct_size is too small. The
 * layout is frozen; new fields only come with a new function. Works in release
 * builds. fps_submitted counts accepted video packets per second. When the selected
 * ABI has no playback-clock query (always true for SET), depth_ms/audio_depth_ms use
 * INT32_MIN and playing_ms uses UINT32_MAX. underruns / overruns count video ES
 * queue-empty / queue-full notifications, not dropped frames. */
typedef struct ml_engine_stats {
  int32_t  struct_size;
  int32_t  running;
  int32_t  depth_ms;
  int32_t  audio_depth_ms;
  uint32_t playing_ms;
  uint32_t submitted, dropped_late, dropped_full;
  uint32_t fps_submitted;
  uint32_t underruns, overruns;
  uint32_t errors, last_error;
  uint32_t recoveries;
  int32_t  recovery_state;
} ml_engine_stats;
int ml_engine_get_stats(ml_engine_stats *out);
/* Negotiated stream metadata and rolling compressed-payload bitrate. */
typedef struct ml_engine_stream_info {
  int32_t struct_size;
  uint32_t video_format, video_width, video_height, video_fps, h264_level_idc;
  uint32_t audio_codec, audio_channels, audio_sample_rate;
  uint32_t video_bitrate_kbps, audio_bitrate_kbps;
  uint32_t network_rtt_ms, network_variance_ms;
  uint32_t video_fps_received, video_fps_decoded, video_fps_rendered;
  uint32_t network_dropped_percent_x100;
  uint32_t average_reassembly_us, average_decode_us, average_render_us;
  uint32_t host_latency_min_tenths_ms, host_latency_max_tenths_ms, host_latency_avg_tenths_ms;
} ml_engine_stream_info;
int ml_engine_get_stream_info(ml_engine_stream_info *out);
/* 1 after ESPlus has started and accepted at least one video packet. */
int ml_engine_video_ready(void);
/* Bitmask: 1=evdev keyboard, 2=evdev mouse, 4=evdev gamepad. */
int ml_engine_input_capabilities(void);
/* 0 until an audio packet is accepted by ESPlus; 1=Opus, 2=AC-3, 3=E-AC-3. */
int ml_engine_get_active_audio_codec(void);

/* Same as ml_engine_start_session(), plus the encoder color configuration:
 * full_range != 0 selects the full color range, 0 the limited range.
 * The colorspace is derived from the stream: Rec.2020 for HDR (HEVC only),
 * Rec.709 otherwise. */
int  ml_engine_start_session_v2(const char *host, int width, int height, int fps,
                                int bitrate_kbps, const char *rikey_hex, int rikeyid,
                                const char *app_version, const char *gfe_version,
                                const char *rtsp_url, int server_codec_mode_support,
                                const char *video_codec, int hdr,
                                const char *audio_config, int full_range, int audio_enabled);

/* Failure report of the last session. Returns its termination code (for example -101,
 * ML_ERROR_NO_VIDEO_FRAME), 0 = none / graceful / cleared when the next session starts.
 * When buf && len > 0, copies the one-line "ML-ERROR ..." text (NUL-terminated, truncated
 * to len). Works in release builds. */
int  ml_engine_last_error(char *buf, int len);

/* Gamepad input from the UI (pkg/ui/PROTOCOL.md gamepadArrival/gamepadState). Both return the
 * LiSend* result, or -1 when index is not 0..15 or no stream runs. Triggers are clamped to
 * 0..255, sticks to -32768..32767. */
int ml_engine_gamepad_arrival(int index, int active_mask, int type, unsigned int supported_buttons,
                              int capabilities);
int ml_engine_gamepad_state(int index, int active_mask, int buttons, int left_trigger,
                            int right_trigger, int ls_x, int ls_y, int rs_x, int rs_y);

#ifdef __cplusplus
}
#endif
#endif /* MLENGINE_H */
