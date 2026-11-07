#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
WMP_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
REPO_ROOT="$(cd "$WMP_ROOT/.." && pwd)"

: "${DEPS:?Set DEPS to the extracted Tizen native dependencies directory}"

SYSROOT="${SYSROOT:-$DEPS/sysroot}"
TV_LIBS="${TV_LIBS:-$DEPS/tv-libs/usr/lib}"
ENGINE_SO="${ENGINE_SO:-$REPO_ROOT/engine-build/libmlengine.so}"
OUT="${SERVICE_OUT:-$WMP_ROOT/build/service}"
GCC="${CC:-$DEPS/toolchain/data/tools/arm-linux-gnueabi-gcc-6.2/bin/arm-linux-gnueabi-gcc}"
READELF="${READELF:-$(command -v arm-linux-gnueabi-readelf || command -v readelf)}"

if [[ ! -x "$GCC" ]]; then
    echo "Tizen ARM compiler not found: $GCC" >&2
    exit 1
fi
if [[ ! -f "$SYSROOT/usr/include/appcore-agent/service_app.h" ]]; then
    echo "ServiceApp headers not found under $SYSROOT/usr/include/appcore-agent" >&2
    exit 1
fi
# Tizen RPM layouts may place dlog.h in a nested include directory. Resolve
# the actual header from this sysroot instead of assuming /usr/include.
DLOG_HEADER="$(find "$SYSROOT/usr/include" -type f -name dlog.h -print -quit)"
if [[ -z "$DLOG_HEADER" ]]; then
    echo "dlog.h not found anywhere under $SYSROOT/usr/include" >&2
    find "$SYSROOT/usr/include" -maxdepth 4 -iname '*dlog*' -print >&2 || true
    exit 1
fi

# Message Port headers may also be installed below a component-specific
# include directory. Resolve the package's actual layout instead of assuming
# that message_port.h is directly under /usr/include.
MESSAGE_PORT_HEADER="$(find "$SYSROOT/usr/include" -type f -name message_port.h -print -quit)"
if [[ -z "$MESSAGE_PORT_HEADER" ]]; then
    echo "message_port.h not found anywhere under $SYSROOT/usr/include" >&2
    find "$SYSROOT/usr/include" -maxdepth 5 -iname '*message*port*' -print >&2 || true
    exit 1
fi
if [[ ! -f "$ENGINE_SO" ]]; then
    echo "libmlengine.so not found: $ENGINE_SO" >&2
    echo "Build it first with wmp/upstream/mlclient/build-engine-so.sh." >&2
    exit 1
fi

mkdir -p "$OUT/obj" "$OUT/bin" "$OUT/lib"
cp "$ENGINE_SO" "$OUT/lib/libmlengine.so"

ARCH=(-mcpu=cortex-a53 -mfpu=neon-vfpv4 -mfloat-abi=softfp)
COMMON=(--sysroot="$SYSROOT" "${ARCH[@]}" -std=gnu11 -O2 -Wall -Wextra -Werror)
INCLUDES=(
    -I"$SYSROOT/usr/include"
    -I"$(dirname "$DLOG_HEADER")"
    -I"$(dirname "$MESSAGE_PORT_HEADER")"
    -I"$SYSROOT/usr/include/appcore-agent"
    -I"$SCRIPT_DIR/src"
    -I"$WMP_ROOT/upstream/mlclient"
)

"$GCC" "${COMMON[@]}" "${INCLUDES[@]}" -c "$SCRIPT_DIR/src/main.c" \
    -o "$OUT/obj/main.o"
# The ESPlus resolver is part of libmlengine; keep one implementation
# and one dynamic-library handle owner across the service and engine.
LIB_DIRS=(
    -L"$OUT/lib"
    -L"$SYSROOT/usr/lib"
    -L"$SYSROOT/usr/lib64"
    -L"$TV_LIBS"
    -Wl,-rpath-link,"$SYSROOT/usr/lib"
    -Wl,-rpath-link,"$SYSROOT/usr/lib64"
    -Wl,-rpath-link,"$TV_LIBS"
)

"$GCC" --sysroot="$SYSROOT" "${ARCH[@]}" -O2 \
    -Wl,--no-undefined \
    -Wl,-rpath,'$ORIGIN/../lib' \
    "${LIB_DIRS[@]}" \
    -o "$OUT/bin/wmp-service" \
    "$OUT/obj/main.o" \
    -Wl,--no-as-needed -lmlengine -Wl,--as-needed \
    -lappcore-agent -ldlog -lmessage-port -lbundle -ldl -lpthread

machine="$("$READELF" -h "$OUT/bin/wmp-service" | sed -n 's/^[[:space:]]*Machine:[[:space:]]*//p')"
case "$machine" in
    ARM*) ;;
    *) echo "Unexpected ServiceApp ELF machine: $machine" >&2; exit 1 ;;
esac

needed="$("$READELF" -d "$OUT/bin/wmp-service")"
for library in libmlengine.so libappcore-agent libdlog libmessage-port libbundle; do
    if ! grep -Fq "Shared library: [$library" <<<"$needed"; then
        echo "ServiceApp is missing DT_NEEDED entry: $library" >&2
        exit 1
    fi
done

echo "WMP ServiceApp linked successfully."
echo "Executable: $OUT/bin/wmp-service"
echo "Engine:     $OUT/lib/libmlengine.so"
echo "ELF:        $machine"
