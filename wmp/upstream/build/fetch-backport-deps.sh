#!/bin/sh
# Fetch source dependencies for the private native crypto/network stack.
# OpenSSL 1.1.1d matches the version used by master’s Emscripten port; cURL
# remains at 7.59.0 for compatibility with the vendored GameStream code.
# Both are built as static ARM libraries by build-static-crypto.sh.
#
# Output dir layout (default ./backport-deps):
#   openssl111/         OpenSSL 1.1.1d source
#   curl759/            cURL 7.59.0 source
#   arm-static/         populated by build-static-crypto.sh
set -e
OUT=${OUT:-./backport-deps}
mkdir -p "$OUT"
cd "$OUT"

[ -d curl759 ] || git clone --depth 1 -b curl-7_59_0 https://github.com/curl/curl.git curl759
[ -d openssl111 ] || git clone --depth 1 -b OpenSSL_1_1_1d https://github.com/openssl/openssl.git openssl111
echo "backport deps ready in $OUT"
