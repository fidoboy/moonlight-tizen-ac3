#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
EMSDK_ROOT="${EMSDK:-/opt/emscripten-release-bundle/emsdk}"
FFMPEG_VERSION="9.0.2"
SOURCE_DIR="$ROOT/ffmpeg"
WORK_DIR="${FFMPEG_WORK_DIR:-$ROOT/ffmpeg-build}"
BUILD_SOURCE_DIR="$WORK_DIR/source"
PREFIX="${FFMPEG_ROOT:-$ROOT/ffmpeg-install}"

test -x "$EMSDK_ROOT/emsdk_env.sh" || test -f "$EMSDK_ROOT/emsdk_env.sh"
source "$EMSDK_ROOT/emsdk_env.sh" >/dev/null

if [[ -s "$PREFIX/.ffmpeg-version" &&
      "$(cat "$PREFIX/.ffmpeg-version")" == "$FFMPEG_VERSION" &&
      -s "$PREFIX/lib/libavcodec.a" &&
      -s "$PREFIX/lib/libavutil.a" &&
      -s "$PREFIX/lib/libswresample.a" &&
      -s "$PREFIX/include/libavcodec/avcodec.h" ]]; then
  echo "FFmpeg $FFMPEG_VERSION is already installed at $PREFIX."
  exit 0
fi

# Never mix libraries or headers from different FFmpeg major versions.
rm -rf "$PREFIX"

test -s "$SOURCE_DIR/configure" || {
  echo "Vendored FFmpeg source is missing: $SOURCE_DIR/configure" >&2
  exit 1
}

rm -rf "$BUILD_SOURCE_DIR"
mkdir -p "$BUILD_SOURCE_DIR" "$PREFIX"

# Compile a clean working copy so the pinned upstream submodule remains pristine.
tar -C "$SOURCE_DIR" \
  --exclude='./.git' --exclude='./build' --exclude='./install' \
  --exclude='./build/*' --exclude='./install/*' \
  -cf - . | tar -C "$BUILD_SOURCE_DIR" -xf -

cd "$BUILD_SOURCE_DIR"

emconfigure ./configure \
  --prefix="$PREFIX" \
  --target-os=none \
  --arch=wasm32 \
  --enable-cross-compile \
  --cc=emcc \
  --cxx=em++ \
  --ar=emar \
  --ranlib=emranlib \
  --nm=emnm \
  --disable-everything \
  --enable-decoder=opus,ac3,eac3 \
  --enable-encoder=ac3,eac3 \
  --disable-programs \
  --disable-doc \
  --disable-network \
  --disable-autodetect \
  --disable-avdevice \
  --disable-avformat \
  --disable-avfilter \
  --disable-swscale \
  --disable-postproc \
  --disable-muxers \
  --disable-demuxers \
  --disable-protocols \
  --disable-bsfs \
  --disable-filters \
  --disable-devices \
  --disable-x86asm \
  --disable-asm \
  --disable-inline-asm \
  --disable-pthreads \
  --disable-debug \
  --disable-stripping \
  --enable-static \
  --disable-shared \
  --enable-small \
  --extra-cflags="-Os -flto" \
  --extra-ldflags="-Os -flto"

emmake make -j2
emmake make install-libs install-headers

test -s "$PREFIX/lib/libavcodec.a"
test -s "$PREFIX/lib/libavutil.a"
test -s "$PREFIX/lib/libswresample.a"
test -s "$PREFIX/include/libavcodec/avcodec.h"
printf '%s\n' "$FFMPEG_VERSION" > "$PREFIX/.ffmpeg-version"
echo "Built minimal FFmpeg $FFMPEG_VERSION: Opus decoder and AC-3/E-AC-3 decoders and encoders."
