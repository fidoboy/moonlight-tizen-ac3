#!/usr/bin/env bash
set -euo pipefail

EMSDK_ROOT="/home/moonlight/emscripten-release-bundle/emsdk"
source "${EMSDK_ROOT}/emsdk_env.sh" >/dev/null

FFMPEG_VERSION="4.4.8"
FFMPEG_ARCHIVE="ffmpeg-${FFMPEG_VERSION}.tar.xz"
FFMPEG_URL="https://ffmpeg.org/releases/${FFMPEG_ARCHIVE}"
SOURCE_DIR="/home/moonlight/ffmpeg-${FFMPEG_VERSION}"
PREFIX="/home/moonlight/ffmpeg-install"

if [[ ! -f "${PREFIX}/lib/libavcodec.a" ]]; then
  mkdir -p /home/moonlight/ffmpeg-download
  aria2c --continue=true --max-connection-per-server=5 --split=5 \
    --dir=/home/moonlight/ffmpeg-download --out="${FFMPEG_ARCHIVE}" "${FFMPEG_URL}"

  tar -xJf "/home/moonlight/ffmpeg-download/${FFMPEG_ARCHIVE}" -C /home/moonlight
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
    --enable-avcodec \
    --enable-avutil \
    --enable-swresample \
    --enable-decoder=ac3,eac3 \
    --enable-parser=ac3 \
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
