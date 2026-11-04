#!/usr/bin/env bash
set -euo pipefail
HERE=$(cd -- "$(dirname -- "$0")" && pwd)
OUT=${OUT:-"$HERE/out"}
CC=${CC:-arm-linux-gnueabi-gcc}
RUNNER=${RUNNER:-}
CFLAGS=${CFLAGS:-"-std=c11 -O0 -Wall -Wextra -Werror -marm -march=armv7-a -mabi=aapcs-linux -mfloat-abi=softfp"}
mkdir -p "$OUT"

run_target() {
  local target="$1"
  if [[ -n "$RUNNER" ]]; then
    # RUNNER is intentionally word-split into executable and arguments.
    # shellcheck disable=SC2086
    $RUNNER "$target"
  else
    "$target"
  fi
}

echo "== WMP legacy vs Samsung public CAPI 0.0.3 mirror =="
# shellcheck disable=SC2086
"$CC" $CFLAGS -DREQUIRE_ARM32 "$HERE/abi_layout.c" -o "$OUT/abi-layout"
run_target "$OUT/abi-layout"

if [[ -n "${ESPLUS_INCLUDE_DIR:-}" ]]; then
  echo
  echo "== Direct Samsung-header comparison =="
  # shellcheck disable=SC2086
  "$CC" $CFLAGS -I"$ESPLUS_INCLUDE_DIR" -DESPLUS_NATIVE_ADAPTER='"esplus_native_adapter.h"' "$HERE/native_layout.c" -o "$OUT/native-layout"
  run_target "$OUT/native-layout"
else
  cat <<'EOF'
Direct comparison against the original Samsung header was skipped.
Set ESPLUS_INCLUDE_DIR to the extracted Samsung source include directory.
The repository adapter includes the original CAPI header and aliases its real
types. The native comparison checks ARM32 sizes and field offsets. No Samsung
header is copied into this repository.
EOF
fi
