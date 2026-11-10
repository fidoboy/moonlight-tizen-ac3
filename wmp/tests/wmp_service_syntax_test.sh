#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
mkdir -p "$TMP/include"

cat > "$TMP/include/service_app.h" <<'EOF'
#ifndef TEST_SERVICE_APP_H
#define TEST_SERVICE_APP_H
#include <stdbool.h>
typedef void *app_control_h;
typedef struct {
    bool (*create)(void *data);
    void (*terminate)(void *data);
    void (*app_control)(app_control_h app_control, void *data);
} service_app_lifecycle_callback_s;
int service_app_main(int argc, char *argv[],
                     const service_app_lifecycle_callback_s *callbacks,
                     void *data);
#endif
EOF

cat > "$TMP/include/mlengine.h" <<'EOF'
#ifndef TEST_MLENGINE_H
#define TEST_MLENGINE_H
#include <stdint.h>
typedef struct ml_engine_stats {
    int32_t struct_size;
    int32_t running;
    int32_t depth_ms;
    int32_t audio_depth_ms;
    uint32_t playing_ms;
    uint32_t submitted, dropped_late, dropped_full;
    uint32_t fps_submitted;
    uint32_t underruns, overruns;
    uint32_t errors, last_error;
    uint32_t recoveries;
    int32_t recovery_state;
} ml_engine_stats;
int ml_engine_running(void);
void ml_engine_wait(void);
void ml_engine_stop(void);
void ml_engine_set_dolby_passthrough_enabled(int enabled);
int ml_engine_start_session_v2(const char *, int, int, int, int, const char *,
                                int, const char *, const char *, const char *,
                                int, const char *, int, const char *, int);
int ml_engine_get_stats(ml_engine_stats *);
int ml_engine_get_active_audio_codec(void);
int ml_engine_last_error(char *, int);
#endif
EOF

cat > "$TMP/include/bundle.h" <<'EOF'
#ifndef TEST_BUNDLE_H
#define TEST_BUNDLE_H
typedef struct bundle bundle;
bundle *bundle_create(void);
void bundle_free(bundle *value);
int bundle_add_str(bundle *value, const char *key, const char *text);
int bundle_get_str(bundle *value, const char *key, char **text);
#endif
EOF

cat > "$TMP/include/message_port.h" <<'EOF'
#ifndef TEST_MESSAGE_PORT_H
#define TEST_MESSAGE_PORT_H
#include <stdbool.h>
#include <bundle.h>
typedef void (*message_port_cb)(int local_port_id,
                                const char *remote_app_id,
                                const char *remote_port,
                                bool trusted_remote_port,
                                bundle *message,
                                void *user_data);
#define MESSAGE_PORT_ERROR_NONE 0
int message_port_send_trusted_message(const char *remote_app_id,
                                      const char *remote_port,
                                      bundle *message);
int message_port_register_trusted_local_port(const char *local_port,
                                              message_port_cb callback,
                                              void *user_data);
int message_port_unregister_trusted_local_port(int local_port_id);
#endif
EOF

cat > "$TMP/include/dlog.h" <<'EOF'
#ifndef TEST_DLOG_H
#define TEST_DLOG_H
#define DLOG_ERROR 3
#define DLOG_WARN 5
#define DLOG_INFO 4
int dlog_print(int priority, const char *tag, const char *format, ...);
#endif
EOF

cc -std=c99 -Wall -Wextra -Werror -fsyntax-only \
  -I"$TMP/include" \
  -I"$ROOT/service/src" \
  "$ROOT/service/src/main.c" \
  "$ROOT/service/src/wmp_esplus_abi.c" \
  "$ROOT/service/src/wmp_esplus_adapter.c"

echo "WMP native service C syntax check passed."
