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
bash wmp/tests/wmp_service_syntax_test.sh
bash wmp/tests/wmp_esplus_abi_test.sh
export MLT="$ROOT"
export DEPS="$ROOT/tizen-deps"
export BPD="$ROOT/backport-deps"
export DEPSBUILD="$ROOT/deps-build"
export ENGINE_OUT="$ROOT/engine-build"
export SYSROOT="$DEPS/sysroot"
echo "== Prepare Tizen IoT Headed runtime libraries from the image SDK"
sdk=/home/tizen/tizen-studio
report="$ROOT/wmp-sdk-diagnostic.txt"
: > "$report"
required=(libecore_wl2.so.1 libecore.so.1 libssl.so.1.0.0 libcrypto.so.1.0.0 libcurl.so.4)
selected_rootstrap=""
while IFS= read -r candidate; do
  [[ -n "$candidate" ]] || continue
  candidate_libs="$candidate/usr/lib"
  complete=true
  for lib in "${required[@]}"; do
    if [[ ! -e "$candidate_libs/$lib" ]]; then complete=false; break; fi
  done
  if [[ "$complete" == true ]]; then selected_rootstrap="$candidate"; break; fi
done < <(find "$sdk/platforms" -type d -name '*.device.core' -print 2>/dev/null | sort)
if [[ -z "$selected_rootstrap" ]]; then
  { echo "No installed image rootstrap contains the complete target library set:"; printf '  %s\n' "${required[@]}"; find "$sdk/platforms" -type d -name '*.device.core' -print 2>/dev/null | sort || true; } | tee "$report"
  echo "No suitable Tizen IoT Headed rootstrap in the shared image." >&2
  exit 1
fi
mkdir -p "$ROOT/wmp-tv-libs/usr"
cp -a "$selected_rootstrap/usr/lib" "$ROOT/wmp-tv-libs/usr/"
export TV_LIBS="$ROOT/wmp-tv-libs/usr/lib"
mkdir -p "$DEPS/tv-libs/usr"
ln -sfn "$TV_LIBS" "$DEPS/tv-libs/usr/lib"
for lib in "${required[@]}"; do test -e "$TV_LIBS/$lib"; done
echo "Selected image rootstrap: $selected_rootstrap" | tee -a "$report"
echo "== Fetch Tizen 5.5 ARM sysroot and GCC 6.2 within the shared image"
bash wmp/upstream/build/fetch-tizen-sources.sh "$DEPS"
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
echo "== Fetch private OpenSSL and cURL source dependencies"
bash wmp/upstream/build/fetch-backport-deps.sh
echo "== Build Moonlight core, GameStream and private crypto dependencies"
bash wmp/upstream/build/build-deps-lib.sh
echo "== Build ARM libmlengine.so"
BUILD_VARIANT=release bash wmp/upstream/mlclient/build-engine-so.sh
echo "== Link ARM WMP ServiceApp executable"
bash wmp/service/build-wmp-service.sh
echo "== Verify ARM ELF files and runtime metadata"
mkdir -p "$ROOT/build-report"
readelf -h "$ENGINE_OUT/libmlengine.so" > "$ROOT/build-report/libmlengine-elf-header.txt"
readelf -d "$ENGINE_OUT/libmlengine.so" > "$ROOT/build-report/libmlengine-dynamic.txt"
readelf -h wmp/build/service/bin/wmp-service > "$ROOT/build-report/wmp-service-elf-header.txt"
readelf -d wmp/build/service/bin/wmp-service > "$ROOT/build-report/wmp-service-dynamic.txt"
file "$ENGINE_OUT/libmlengine.so" wmp/build/service/bin/wmp-service | tee "$ROOT/build-report/file.txt"
grep -q 'Machine:.*ARM' "$ROOT/build-report/libmlengine-elf-header.txt"
grep -q 'Machine:.*ARM' "$ROOT/build-report/wmp-service-elf-header.txt"
grep -q 'Shared library: \[libmlengine.so\]' "$ROOT/build-report/wmp-service-dynamic.txt"
grep -q 'Library runpath: \[\$ORIGIN/../lib\]' "$ROOT/build-report/wmp-service-dynamic.txt"
if grep -q 'NEEDED.*libesplusplayer' "$ROOT/build-report/libmlengine-dynamic.txt"; then
  echo "libmlengine.so must load ESPlus from TV firmware, not DT_NEEDED." >&2
  exit 1
fi
echo "Both WMP ARM outputs verified; ESPlus remains runtime-loaded."
