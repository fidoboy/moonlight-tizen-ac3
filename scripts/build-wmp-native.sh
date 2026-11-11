#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"
command -v node >/dev/null
command -v cc >/dev/null
command -v readelf >/dev/null
test -x /home/tizen/tizen-studio/tools/ide/bin/tizen
echo "== WMP tests (shared Tizen build image)"
node tests/wmp_transport_test.js
cc -std=c99 -Wall -Wextra -Werror -Imoonlight-common-c/src -Iwmp/upstream/mlclient -Iwmp/service/src \
  wmp/tests/wmp_audio_passthrough_test.c -o "$RUNNER_TEMP/wmp-audio-passthrough-test"
"$RUNNER_TEMP/wmp-audio-passthrough-test"
bash wmp/tests/wmp_esplus_abi_test.sh
export MLT="$ROOT"
export DEPS="${WMP_DEPS:-/opt/wmp-tizen-deps}"
export BPD="${WMP_BACKPORT_DEPS:-/opt/wmp-backport-deps}"
export DEPSBUILD="$ROOT/deps-build"
export ENGINE_OUT="$ROOT/engine-build"
export OUT="$ENGINE_OUT"
export SYSROOT="$DEPS/sysroot"
echo "== Reuse the pinned Tizen 5.5 ARM sysroot and GCC 6.2 from the image"
test -s "$DEPS/sysroot/usr/include/stdio.h"
test -x "$DEPS/toolchain/data/tools/arm-linux-gnueabi-gcc-6.2/bin/arm-linux-gnueabi-gcc"
echo "== Normalize the GCC 6.2 toolchain paths expected by the WMP build scripts"
tool_root="$DEPS/toolchain"
gcc="$(find "$tool_root" -type f -name 'arm-linux-gnueabi-gcc' -perm -u+x -print -quit)"
objdump="$(find "$tool_root" -type f -name 'arm-linux-gnueabi-objdump' -perm -u+x -print -quit)"
ar="$(find "$tool_root" -type f -name 'arm-linux-gnueabi-ar' -perm -u+x -print -quit)"
if [[ -z "$gcc" || -z "$objdump" || -z "$ar" ]]; then
  echo "The downloaded Tizen toolchain is missing GCC/binutils executables." >&2
  find "$tool_root" -maxdepth 7 -type f | head -200
  exit 1
fi
expected="$tool_root/data/tools/arm-linux-gnueabi-gcc-6.2/bin"
mkdir -p "$expected"
ln -sfn "$gcc" "$expected/arm-linux-gnueabi-gcc"
ln -sfn "$objdump" "$expected/arm-linux-gnueabi-objdump"
ln -sfn "$ar" "$expected/arm-linux-gnueabi-ar"
"$expected/arm-linux-gnueabi-gcc" --version
"$expected/arm-linux-gnueabi-objdump" --version | head -1
echo "== Verify prebuilt static ARM crypto dependencies from the image"
test -s "$BPD/arm-static/lib/libcrypto.a"
test -s "$BPD/arm-static/lib/libssl.a"
test -s "$BPD/arm-static/lib/libcurl.a"
grep -q 'OPENSSL_VERSION_NUMBER.*0x101010' "$BPD/arm-static/include/openssl/opensslv.h"
grep -q 'LIBCURL_VERSION "7.59.0"' "$BPD/arm-static/include/curl/curlver.h"
echo "== Build Moonlight core and GameStream against prebuilt static crypto dependencies"
bash wmp/upstream/build/build-deps-lib.sh
echo "== Build ARM libmlengine.so"
BUILD_VARIANT=release bash wmp/upstream/mlclient/build-engine-so.sh
echo "== Verify ARM ELF files and runtime metadata"
mkdir -p "$ROOT/build-report"
readelf -h "$ENGINE_OUT/libmlengine.so" > "$ROOT/build-report/libmlengine-elf-header.txt"
readelf -d "$ENGINE_OUT/libmlengine.so" > "$ROOT/build-report/libmlengine-dynamic.txt"
file "$ENGINE_OUT/libmlengine.so" | tee "$ROOT/build-report/file.txt"
grep -q 'Machine:.*ARM' "$ROOT/build-report/libmlengine-elf-header.txt"
if grep -q 'NEEDED.*libesplusplayer' "$ROOT/build-report/libmlengine-dynamic.txt"; then
  echo "libmlengine.so must load ESPlus from TV firmware, not DT_NEEDED." >&2
  exit 1
fi
mkdir -p "$ROOT/wmp/dotnet-host/lib"
cp "$ENGINE_OUT/libmlengine.so" "$ROOT/wmp/dotnet-host/lib/libmlengine.so"
echo "== Compile the managed WMP .NET host for the pinned tizen80 target"
dotnet build "$ROOT/wmp/dotnet-host/MoonlightHost.csproj" --configuration Release --verbosity minimal
test -s "$ROOT/wmp/dotnet-host/bin/Release/tizen80/MoonlightHost.dll"
echo "WMP ARM engine and .NET host verified. The C ESPlus adapter sources are linked into libmlengine.so; no C ServiceApp is built."
