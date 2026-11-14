#!/usr/bin/env bash
# Build a private, position-independent OpenSSL 1.1.1d + cURL 7.59.0 stack
# for the Tizen ARM engine. Both libraries are static so the WMP ELF does not
# depend on firmware-provided libssl/libcrypto/libcurl ABIs.
set -euo pipefail

: "${DEPS:?Set DEPS to the extracted Tizen ARM toolchain/sysroot}"
: "${BPD:?Set BPD to the fetched backport-deps directory}"

TOOLBIN="$DEPS/toolchain/data/tools/arm-linux-gnueabi-gcc-6.2/bin"
GCC="${WMP_ARM_CC:-$TOOLBIN/arm-linux-gnueabi-gcc}"
AR="$TOOLBIN/arm-linux-gnueabi-ar"
RANLIB="$TOOLBIN/arm-linux-gnueabi-ranlib"
CROSS=arm-linux-gnueabi-
PREFIX="$BPD/arm-static"
ARCH="-mcpu=cortex-a53 -mfpu=neon-vfpv4 -mfloat-abi=softfp"
JOBS="${JOBS:-2}"

for tool in "$GCC" "$AR" "$RANLIB"; do
  [[ -x "$tool" ]] || { echo "Missing ARM toolchain executable: $tool" >&2; exit 1; }
done
export PATH="$(dirname "$GCC"):$TOOLBIN:$PATH"
export CC=gcc
export AR=ar
export RANLIB=ranlib
export CFLAGS="$ARCH -O2 -fPIC"
export CPPFLAGS="--sysroot=$DEPS/sysroot"
export LDFLAGS="--sysroot=$DEPS/sysroot"

mkdir -p "$PREFIX"

echo "== OpenSSL 1.1.1d (static ARM libraries) =="
cd "$BPD/openssl111"
./Configure linux-armv4 no-shared no-tests no-async no-engine \
  --cross-compile-prefix="$CROSS" \
  --prefix="$PREFIX" \
  --openssldir=/etc/ssl \
  $ARCH -fPIC
make -j"$JOBS" build_libs
make install_dev

test -s "$PREFIX/lib/libcrypto.a"
test -s "$PREFIX/lib/libssl.a"
test -f "$PREFIX/include/openssl/opensslv.h"
grep -q 'OPENSSL_VERSION_NUMBER.*0x101010' "$PREFIX/include/openssl/opensslv.h"

echo "== cURL 7.59.0 (static, HTTP/HTTPS only, OpenSSL 1.1.1d) =="
cd "$BPD/curl759"
# The Git checkout omits release-generated Autotools files; recreate them.
./buildconf
CC="$GCC" AR="$AR" RANLIB="$RANLIB" ./configure \
  --build="$(./config.guess)" \
  --host=arm-linux-gnueabi \
  --prefix="$PREFIX" \
  --with-ssl="$PREFIX" \
  --disable-shared --enable-static \
  --disable-ftp --disable-file --disable-ldap --disable-ldaps \
  --disable-rtsp --disable-dict --disable-telnet --disable-tftp \
  --disable-pop3 --disable-imap --disable-smb --disable-smtp \
  --disable-gopher --disable-mqtt --disable-ares \
  --without-zlib --without-nghttp2 --without-libidn2 \
  --without-librtmp --without-libssh2
make -j"$JOBS"
make install

test -s "$PREFIX/lib/libcurl.a"
test -f "$PREFIX/include/curl/curl.h"

echo "Static ARM crypto/network stack ready:"
file "$PREFIX/lib/libcrypto.a" "$PREFIX/lib/libssl.a" "$PREFIX/lib/libcurl.a"
