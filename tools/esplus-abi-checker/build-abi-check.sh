#!/usr/bin/env bash
set -euo pipefail
HERE=$(cd -- "$(dirname -- "$0")" && pwd)
OUT=${OUT:-"$HERE/out"}
CC=${CC:-arm-linux-gnueabi-gcc}
CFLAGS=${CFLAGS:-"-std=c11 -O0 -Wall -Wextra -Werror -marm -march=armv7-a -mabi=aapcs-linux -mfloat-abi=softfp"}
mkdir -p "$OUT"
echo "== WMP legacy vs Samsung public CAPI 0.0.3 mirror =="
# shellcheck disable=SC2086
"$CC" $CFLAGS -DREQUIRE_ARM32 "$HERE/abi_layout.c" -o "$OUT/abi-layout"
"$OUT/abi-layout"
if [[ -n "${ESPLUS_INCLUDE_DIR:-}" && -n "${ESPLUS_NATIVE_ADAPTER:-}" ]]; then
  echo
  echo "== Direct Samsung-header comparison =="
  # shellcheck disable=SC2086
  "$CC" $CFLAGS -I"$ESPLUS_INCLUDE_DIR" -DESPLUS_NATIVE_ADAPTER="\"$ESPLUS_NATIVE_ADAPTER\"" "$HERE/native_layout.c" -o "$OUT/native-layout"
  "$OUT/native-layout"
else
  cat <<'EOF'
Direct comparison against the original Samsung header was skipped.
Set ESPLUS_INCLUDE_DIR and ESPLUS_NATIVE_ADAPTER. The adapter must include
Samsung's CAPI header and alias its real types to:
  esp_native_video_stream_info
  esp_native_audio_stream_info
  esp_native_packet
The native comparison checks ARM32 sizes and field offsets. No Samsung header
is copied into this repository.
EOF
fi
