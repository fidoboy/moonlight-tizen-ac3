#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DEPS="${WMP_DEPS:-/opt/wmp-tizen-deps}"
TOOL_BIN="$DEPS/toolchain/data/tools/arm-linux-gnueabi-gcc-6.2/bin"
SOURCE_DIR="$ROOT/ffmpeg"
WORK_DIR="${FFMPEG_ARM_WORK_DIR:-$ROOT/ffmpeg-arm-build}"
BUILD_SOURCE_DIR="$WORK_DIR/source"
PREFIX="${FFMPEG_ARM_PREFIX:-$ROOT/ffmpeg-arm-install}"
ARCH="-mcpu=cortex-a53 -mfpu=neon-vfpv4 -mfloat-abi=softfp"
CC="${WMP_ARM_CC:-$TOOL_BIN/arm-linux-gnueabi-gcc}"
CXX="${WMP_ARM_CXX:-$TOOL_BIN/arm-linux-gnueabi-g++}"
AR="${WMP_ARM_AR:-$TOOL_BIN/arm-linux-gnueabi-ar}"
NM="${WMP_ARM_NM:-$TOOL_BIN/arm-linux-gnueabi-nm}"
RANLIB="$TOOL_BIN/arm-linux-gnueabi-ranlib"

for tool in "$CC" "$CXX" "$AR" "$NM" "$RANLIB"; do
  test -x "$tool" || { echo "Missing ARM toolchain executable: $tool" >&2; exit 1; }
done
test -s "$DEPS/sysroot/usr/include/stdio.h"
test -s "$SOURCE_DIR/configure" || {
  echo "Vendored FFmpeg source is missing: $SOURCE_DIR/configure" >&2
  exit 1
}

if [[ -s "$PREFIX/.ffmpeg-version" &&
      "$(cat "$PREFIX/.ffmpeg-version")" == "9.0.2" &&
      -s "$PREFIX/lib/libavcodec.a" &&
      -s "$PREFIX/lib/libavutil.a" &&
      -s "$PREFIX/lib/libswresample.a" &&
      -s "$PREFIX/include/libavcodec/avcodec.h" ]]; then
  echo "FFmpeg 9.0.2 ARM32 is already installed at $PREFIX."
  exit 0
fi

rm -rf "$PREFIX" "$BUILD_SOURCE_DIR"
mkdir -p "$BUILD_SOURCE_DIR" "$PREFIX"
tar -C "$SOURCE_DIR" --exclude='./.git' --exclude='./build' --exclude='./install' \
  --exclude='./build/*' --exclude='./install/*' -cf - . |
  tar -C "$BUILD_SOURCE_DIR" -xf -
cd "$BUILD_SOURCE_DIR"

./configure \
  --prefix="$PREFIX" \
  --target-os=linux \
  --arch=arm \
  --cpu=cortex-a53 \
  --cross-prefix="$TOOL_BIN/arm-linux-gnueabi-" \
  --cc="$CC" \
  --cxx="$CXX" \
  --ar="$AR" \
  --nm="$NM" \
  --ranlib="$RANLIB" \
  --sysroot="$DEPS/sysroot" \
  --enable-cross-compile \
  --disable-everything \
  --enable-swresample \
  --enable-decoder=opus \
  --enable-encoder=eac3 \
  --disable-programs \
  --disable-doc \
  --disable-network \
  --disable-autodetect \
  --disable-avdevice \
  --disable-avformat \
  --disable-avfilter \
  --disable-swscale \
  --disable-muxers \
  --disable-demuxers \
  --disable-protocols \
  --disable-bsfs \
  --disable-filters \
  --disable-devices \
  --disable-x86asm \
  --disable-debug \
  --disable-stripping \
  --enable-static \
  --disable-shared \
  --enable-pic \
  --enable-small \
  --extra-cflags="$ARCH -O2 -fPIC" \
  --extra-cxxflags="$ARCH -O2 -fPIC" \
  --extra-ldflags="$ARCH"

make -j2
make install-libs install-headers

test -s "$PREFIX/lib/libavcodec.a"
test -s "$PREFIX/lib/libavutil.a"
test -s "$PREFIX/lib/libswresample.a"
test -s "$PREFIX/include/libavcodec/avcodec.h"
printf '%s\n' "9.0.2" > "$PREFIX/.ffmpeg-version"
echo "Built minimal native ARM32 FFmpeg 9.0.2: Opus decoder and E-AC-3 encoder."
