#!/usr/bin/env bash
set -euo pipefail
HERE=$(cd -- "$(dirname -- "$0")" && pwd)
OUT=${OUT:-"$HERE/out"}
CC=${CC:-arm-linux-gnueabi-gcc}
CFLAGS=${CFLAGS:-"-std=c11 -O0 -Wall -Wextra -Werror -marm -march=armv7-a -mabi=aapcs-linux -mfloat-abi=softfp"}
mkdir -p "$OUT"
echo "== Candidate layout report =="
# shellcheck disable=SC2086
"$CC" $CFLAGS -DREQUIRE_ARM32 "$HERE/abi_layout.c" -o "$OUT/abi-layout"
"$OUT/abi-layout"
if [[ -n "${ESPLUS_INCLUDE_DIR:-}" && -n "${ESPLUS_NATIVE_ADAPTER:-}" ]]; then
    echo
    echo "== Native Tizen header layout =="
    # shellcheck disable=SC2086
    "$CC" $CFLAGS -I"$ESPLUS_INCLUDE_DIR" -DESPLUS_NATIVE_ADAPTER="\"$ESPLUS_NATIVE_ADAPTER\"" "$HERE/native_layout.c" -o "$OUT/native-layout"
    "$OUT/native-layout"
else
    cat <<'EOF'
Native-header comparison not run.
Set ESPLUS_INCLUDE_DIR and ESPLUS_NATIVE_ADAPTER after extracting and inspecting
the Tizen 6.5 header. The adapter must alias its actual struct types to the
three esp_native_* names documented in README.md.
EOF
fi
