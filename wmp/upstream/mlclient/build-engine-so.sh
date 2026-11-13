#!/bin/sh
# Build libmlengine.so (the position-independent WMP streaming engine).
# ESPlus is resolved at runtime from the TV firmware by wmp_esplus_abi.c;
# it is deliberately not a link-time or packaged dependency.
#
# Env: MLT, DEPS (no spaces), BPD, DEPSBUILD.  (Paths must be space-free: the
# compiler flags are unquoted. Use a space-free symlink to the repo for MLT.)
set -e
MLT=${MLT:?}; DEPS=${DEPS:?}; BPD=${BPD:?}; DEPSBUILD=${DEPSBUILD:?}
HERE=$(cd "$(dirname "$0")" && pwd)
GCC=${WMP_ARM_CC:-$DEPS/toolchain/data/tools/arm-linux-gnueabi-gcc-6.2/bin/arm-linux-gnueabi-gcc}
OBJD=$DEPS/toolchain/data/tools/arm-linux-gnueabi-gcc-6.2/bin/arm-linux-gnueabi-objdump
C=$MLT/moonlight-common-c; CRYPTO_PREFIX=$BPD/arm-static
BUILD_VARIANT=${BUILD_VARIANT:-release}
WMP_MLT_TRACE=${WMP_MLT_TRACE:-false}
case "$BUILD_VARIANT" in
  release) OPT="-O2"; LOPT="-O2"; DBGLIB="-ldl" ;;
  debug)   OPT="-O0 -g"; LOPT="-O0 -g"; DBGLIB="-ldl" ;;
  *) echo "BUILD_VARIANT must be debug or release, got: $BUILD_VARIANT" >&2; exit 1 ;;
esac
if [[ "$WMP_MLT_TRACE" != "true" && "$WMP_MLT_TRACE" != "false" ]]; then
  echo "WMP_MLT_TRACE must be true or false." >&2
  exit 1
fi
if [[ "$WMP_MLT_TRACE" == "true" ]]; then
  OPT="$OPT -DMLT_TRACE"
  echo "native WMP/ESPlusPlayer trace logging: enabled"
else
  echo "native WMP/ESPlusPlayer trace logging: disabled"
fi
echo "engine variant: $BUILD_VARIANT"
OUT=${OUT:-./engine-build}; mkdir -p "$OUT"
ARCH="-mcpu=cortex-a53 -mfpu=neon-vfpv4 -mfloat-abi=softfp"
FLAGS="--sysroot=$DEPS/sysroot $ARCH $OPT -std=gnu11 -Wall -Wextra -fPIC"
INC="-I$C/src -I$OUT -I$HERE -I$MLT/wmp/service/src -I$MLT/libgamestream -I$CRYPTO_PREFIX/include"

for src in cert_init engine_api engine_ui engine_pad video_esplus audio_opus esplus_player gs_client input_evdev mldiag ctlcrypto; do
  "$GCC" $FLAGS $INC -c "$HERE/$src.c" -o "$OUT/$src.o"
done

# Project-owned, typed ESPlus ABI discovery and ADD/SET adapter layer.
"$GCC" $FLAGS $INC -c "$MLT/wmp/service/src/wmp_esplus_abi.c" -o "$OUT/wmp_esplus_abi.o"
"$GCC" $FLAGS $INC -c "$MLT/wmp/service/src/wmp_esplus_adapter.c" -o "$OUT/wmp_esplus_adapter.o"

# ESPlus and the Ecore windowing stack are provided by the TV firmware
# and resolved with dlopen()/dlsym(); do not add their large firmware-specific
# EFL/Wayland/TBM dependency trees to the build-time sysroot.
"$GCC" --sysroot=$DEPS/sysroot $ARCH $LOPT -shared -Wl,-soname,libmlengine.so \
  -Wl,--hash-style=both -Wl,--wrap=PltEncryptMessage \
  -o "$OUT/libmlengine.so" \
  "$OUT"/cert_init.o "$OUT"/engine_api.o "$OUT"/engine_ui.o "$OUT"/engine_pad.o "$OUT"/video_esplus.o "$OUT"/audio_opus.o \
  "$OUT"/esplus_player.o "$OUT"/gs_client.o "$OUT"/input_evdev.o "$OUT"/mldiag.o "$OUT"/ctlcrypto.o \
  "$OUT"/wmp_esplus_abi.o "$OUT"/wmp_esplus_adapter.o \
  "$DEPSBUILD"/obj/*.o "$DEPSBUILD"/gs/*.o \
  -Wl,--allow-shlib-undefined -Wl,--unresolved-symbols=ignore-in-shared-libs \
  -Wl,--exclude-libs,ALL -L"$CRYPTO_PREFIX/lib" \
  -lcurl -lssl -lcrypto -ldl -lpthread -lm $DBGLIB

# The managed WMP ServiceApplication loads this shared engine image through
# ManualLoader. No native C ServiceApp executable is built or packaged.
echo "built: $(file "$OUT/libmlengine.so" | cut -d, -f1-3)"

miss=""
for s in ml_engine_start ml_engine_running ml_engine_wait ml_engine_stop \
         ml_engine_make_cert ml_engine_http_init ml_engine_open_url ml_engine_pair \
         ml_engine_cancel_request ml_engine_start_session ml_engine_send_key ml_engine_free \
         ml_engine_set_log_cb ml_engine_get_stats ml_engine_start_session_v2 ml_engine_last_error \
         ml_engine_gamepad_arrival ml_engine_gamepad_state ml_engine_input_capabilities \
         wmp_esplus_probe wmp_esplus_probe_result_name wmp_esplus_family_name wmp_esplus_close; do
  "$OBJD" -T "$OUT/libmlengine.so" | grep -q " $s\$" || miss="$miss $s"
done
[ -z "$miss" ] && echo "ABI exported: ml_engine_* OK" || { echo "MISSING ABI:$miss"; exit 1; }

# The engine must not acquire a DT_NEEDED edge to the proprietary ESPlus
# library: it is provided by the TV firmware and loaded only by dlopen().
if "$OBJD" -p "$OUT/libmlengine.so" | grep -q 'NEEDED.*libesplusplayer'; then
  echo "ERROR: libmlengine.so must not link libesplusplayer at build time." >&2
  exit 1
fi
echo "ESPlus runtime loading: no DT_NEEDED dependency on libesplusplayer.so"

bad=$("$OBJD" -T "$OUT/libmlengine.so" | grep -oE 'GLIBC_2\.(2[5-9]|[3-9][0-9])' | sort -u || true)
[ -z "$bad" ] && echo "glibc symbols: all <= 2.24 OK" || { echo "TOO-NEW glibc: $bad"; exit 1; }