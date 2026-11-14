#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUT="${1:?Usage: build-moonlight-web.sh <output-directory>}"
EMSDK="${EMSDK:-/opt/emscripten-release-bundle/emsdk}"
BUILD_TYPE="${BUILD_TYPE:-release}"
REPO_OWNER="${REPO_OWNER:-fidoboy}"
REPO_NAME="${REPO_NAME:-moonlight-tizen-ac3}"
DEBUG_MODE="${DEBUG_MODE:-false}"
OFFICIAL_RELEASE=false
LOG_SHOW_PRIVATE_DATA="${LOG_SHOW_PRIVATE_DATA:-false}"

if [[ "$DEBUG_MODE" != "true" && "$DEBUG_MODE" != "false" ]]; then
  echo "DEBUG_MODE must be true or false." >&2
  exit 1
fi
if [[ "$LOG_SHOW_PRIVATE_DATA" != "true" && "$LOG_SHOW_PRIVATE_DATA" != "false" ]]; then
  echo "LOG_SHOW_PRIVATE_DATA must be true or false." >&2
  exit 1
fi
mkdir -p "$HOME"
export EM_CONFIG="${EM_CONFIG:-$HOME/.emscripten}"

if [[ ! -s "$EM_CONFIG" ]]; then
  test -x "$EMSDK/emsdk"
  echo "Emscripten config is missing at $EM_CONFIG; regenerating it from the preinstalled latest-fastcomp SDK."
  EMSDK_BASH=1 "$EMSDK/emsdk" activate latest-fastcomp
fi

if [[ -f "$EMSDK/emsdk_env.sh" ]]; then
  source "$EMSDK/emsdk_env.sh"
else
  test -x "$EMSDK/emsdk"
  eval "$(EMSDK_BASH=1 "$EMSDK/emsdk" construct_env)"
fi
command -v emcc >/dev/null
command -v cmake >/dev/null
command -v ninja >/dev/null
index_js="$ROOT/wasm/platform/index.js"
index_backup="$(mktemp)"
cp "$index_js" "$index_backup"
restore_index() { cp "$index_backup" "$index_js"; rm -f "$index_backup"; }
trap restore_index EXIT
sed -i "s/__BUILD_TYPE__/$BUILD_TYPE/g" "$index_js"
sed -i "s/var DEBUG_MODE = false;/var DEBUG_MODE = $DEBUG_MODE;/" "$index_js"
sed -i "s/var LOG_SHOW_PRIVATE_DATA = false;/var LOG_SHOW_PRIVATE_DATA = (DEBUG_MODE \\&\\& $LOG_SHOW_PRIVATE_DATA);/" "$index_js"
sed -i "s/__OFFICIAL_RELEASE__/$OFFICIAL_RELEASE/g" "$index_js"
if [[ -n "$REPO_OWNER" ]]; then sed -i "s/__REPO_OWNER__/$REPO_OWNER/g" "$index_js"; fi
if [[ -n "$REPO_NAME" ]]; then sed -i "s/__REPO_NAME__/$REPO_NAME/g" "$index_js"; fi
if [[ "$OFFICIAL_RELEASE" != "true" ]]; then
  short_sha="$(git -C "$ROOT" rev-parse --short HEAD)"
  if [[ -n "$short_sha" ]]; then sed -i "s/__BUILD_COMMIT__/$short_sha/g" "$index_js"; fi
fi
node --check "$index_js"
build_dir="$ROOT/build-moonlight-web"
rm -rf "$build_dir" "$OUT/web-standard" "$OUT/web-forcegm"
mkdir -p "$OUT"
cmake -DCMAKE_TOOLCHAIN_FILE="$EMSDK/fastcomp/emscripten/cmake/Modules/Platform/Emscripten.cmake" \
  -DCMAKE_C_COMPILER_LAUNCHER=ccache -DCMAKE_CXX_COMPILER_LAUNCHER=ccache \
  -DMOONLIGHT_DEBUG_MODE="$DEBUG_MODE" -G Ninja -S "$ROOT" -B "$build_dir"
cmake --build "$build_dir" --parallel
cmake --install "$build_dir" --prefix "$build_dir"
widget="$build_dir/widget"
test -s "$widget/config.xml"
test -s "$widget/index.html"
test -s "$widget/moonlight-wasm.js"
test -s "$widget/moonlight-wasm.wasm"
test -s "$widget/service/service.js"
cp "$ROOT/res/icon.png" "$widget/"
node "$ROOT/tools/patch-embind-string.js" "$widget/moonlight-wasm.js"
cp -a "$widget" "$OUT/web-standard"
cp -a "$widget" "$OUT/web-forcegm"
sed -i 's|<tizen:metadata key="http://samsung.com/tv/metadata/use.voiceguide"|<tizen:metadata key="http://samsung.com/tv/metadata/use.game.mode" value="true"/>\n    <tizen:metadata key="http://samsung.com/tv/metadata/use.voiceguide"|' "$OUT/web-forcegm/config.xml"
grep -q 'use.game.mode' "$OUT/web-forcegm/config.xml"
for project in "$OUT/web-standard" "$OUT/web-forcegm"; do
  test -s "$project/config.xml"
  test -s "$project/index.html"
  test -s "$project/moonlight-wasm.js"
  test -s "$project/moonlight-wasm.wasm"
  test -s "$project/service/service.js"
done
echo "Moonlight Web standard and ForceGM payloads built inside the shared Tizen image."
