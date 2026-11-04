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

cat > "$TMP/include/dlog.h" <<'EOF'
#ifndef TEST_DLOG_H
#define TEST_DLOG_H
#define DLOG_INFO 4
int dlog_print(int priority, const char *tag, const char *format, ...);
#endif
EOF

cc -std=c99 -Wall -Wextra -Werror -fsyntax-only \
  -I"$TMP/include" \
  -I"$ROOT/native/wmp-service/src" \
  "$ROOT/native/wmp-service/src/main.c" \
  "$ROOT/native/wmp-service/src/wmp_esplus_abi.c"

echo "WMP native service C syntax check passed."
