#!/usr/bin/env bash
set -euo pipefail

EMSDK_ROOT="${EMSDK:-/opt/emscripten-release-bundle/emsdk}"
source "${EMSDK_ROOT}/emsdk_env.sh" >/dev/null

FFMPEG_VERSION="4.4.8"
FFMPEG_ARCHIVE="ffmpeg-${FFMPEG_VERSION}.tar.xz"
FFMPEG_URL="https://ffmpeg.org/releases/${FFMPEG_ARCHIVE}"
WORK_DIR="${FFMPEG_WORK_DIR:-/opt/ffmpeg-build}"
SOURCE_DIR="${WORK_DIR}/ffmpeg-${FFMPEG_VERSION}"
PREFIX="${FFMPEG_ROOT:-/opt/ffmpeg-install}"

if [[ ! -f "${PREFIX}/lib/libavcodec.a" ]]; then
  mkdir -p "${WORK_DIR}/download" "${WORK_DIR}"
  aria2c --continue=true --max-connection-per-server=5 --split=5 \
    --dir="${WORK_DIR}/download" --out="${FFMPEG_ARCHIVE}" "${FFMPEG_URL}"

  tar -xJf "${WORK_DIR}/download/${FFMPEG_ARCHIVE}" -C "${WORK_DIR}"
  cd "${SOURCE_DIR}"

  emconfigure ./configure \
    --prefix="${PREFIX}" \
    --target-os=none \
    --arch=wasm32 \
    --enable-cross-compile \
    --cc=emcc \
    --cxx=em++ \
    --ar=emar \
    --ranlib=emranlib \
    --nm=emnm \
    --disable-everything \
    --enable-decoder=ac3,eac3 \
    --disable-programs \
    --disable-doc \
    --disable-network \
    --disable-autodetect \
    --disable-avdevice \
    --disable-avformat \
    --disable-avfilter \
    --disable-swscale \
    --disable-postproc \
    --disable-encoders \
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
fi

test -s "${PREFIX}/lib/libavcodec.a"
test -s "${PREFIX}/lib/libavutil.a"
test -s "${PREFIX}/lib/libswresample.a"
test -s "${PREFIX}/include/libavcodec/avcodec.h"
echo "Built minimal FFmpeg ${FFMPEG_VERSION}: AC-3/E-AC-3 decoders only."
