#!/bin/sh
# Build Moonlight Common C + libgamestream for the Tizen ARM target and
# link-test against the private static OpenSSL 1.1.1d + cURL 7.59 stack.
# PlatformCrypto uses the OpenSSL backend, matching the upstream CMake default.
#
# Env:
#   MLT   = moonlight-tizen checkout
#   DEPS  = tizen-deps dir (no spaces; symlink if needed)
#   BPD   = backport-deps dir from fetch-backport-deps.sh
set -e
MLT=${MLT:?set MLT}; DEPS=${DEPS:?set DEPS (no spaces)}; BPD=${BPD:?set BPD}
GCC=${WMP_ARM_CC:-$DEPS/toolchain/data/tools/arm-linux-gnueabi-gcc-6.2/bin/arm-linux-gnueabi-gcc}
OBJD=$DEPS/toolchain/data/tools/arm-linux-gnueabi-gcc-6.2/bin/arm-linux-gnueabi-objdump
C=$MLT/moonlight-common-c
CRYPTO_PREFIX=$BPD/arm-static

# -core patches to the vendored moonlight-common-c (see common-c-patches/README.md; none at the moment).
# Applied to the submodule checkout before compiling; idempotent (reverse-check -> skip).
# A1 (fork brightcraft/moonlight-tizen) makes these unnecessary and they become no-ops.
HERE=$(cd "$(dirname "$0")" && pwd)
for p in "$HERE"/common-c-patches/*.patch; do
  [ -e "$p" ] || continue
  if git -C "$MLT" apply --check "$p" 2>/dev/null; then
    git -C "$MLT" apply "$p"; echo "patched: $(basename "$p")"
  elif git -C "$MLT" apply --reverse --check "$p" 2>/dev/null; then
    echo "patched (already applied): $(basename "$p")"
  else
    echo "ERROR: cannot apply $(basename "$p") to $MLT" >&2; exit 1
  fi
done

OUT=${OUT:-./deps-build}; mkdir -p "$OUT/obj" "$OUT/gs" "$OUT/shim"

# Reuse the pinned static ARM stack when the workflow cache has restored it.
# Rebuild only on a cache miss or when the cached headers/archives do not match
# the exact OpenSSL and cURL versions required by this engine.
if [[ -s "$CRYPTO_PREFIX/lib/libcrypto.a" &&
      -s "$CRYPTO_PREFIX/lib/libssl.a" &&
      -s "$CRYPTO_PREFIX/lib/libcurl.a" &&
      -f "$CRYPTO_PREFIX/include/openssl/opensslv.h" &&
      -f "$CRYPTO_PREFIX/include/curl/curlver.h" ]] &&
   grep -q 'OPENSSL_VERSION_NUMBER.*0x101010' "$CRYPTO_PREFIX/include/openssl/opensslv.h" &&
   grep -Eiq 'LIBCURL_VERSION_NUM[[:space:]]+0x073b00' "$CRYPTO_PREFIX/include/curl/curlver.h"; then
  echo "Reusing cached static ARM OpenSSL 1.1.1d + cURL 7.59.0 libraries."
else
  if [[ -s "$BPD/openssl111/Configure" && -x "$BPD/curl759/buildconf" ]]; then
    echo "Static ARM crypto cache miss; building pinned dependencies from available sources."
    bash "$HERE/build-static-crypto.sh"
  else
    echo "ERROR: prebuilt ARM OpenSSL/cURL libraries are missing or invalid, and source trees are unavailable." >&2
    echo "Rebuild the GHCR Tizen build image to restore /opt/wmp-backport-deps/arm-static." >&2
    exit 1
  fi
fi
cat > "$OUT/shim/emscripten.h" <<'EOF'
#include <stdio.h>
#define EM_LOG_CONSOLE 1
#define emscripten_log(flags, ...) fprintf(stderr, __VA_ARGS__)
EOF
ARCH="-mcpu=cortex-a53 -mfpu=neon-vfpv4 -mfloat-abi=softfp"
BASE="--sysroot=$DEPS/sysroot $ARCH -O2 -fPIC"

echo "== moonlight-common-c (core + OpenSSL PlatformCrypto) =="
# LC_LOG: Limelog goes to the logMessage callback (the engine counts it in the ML-ERROR line),
# not only to the host's stderr. Use the private OpenSSL 1.1.1 backend; do not
# enable mbedTLS/PSA, whose multipart AEAD API is not implemented by this source.
CFLAGS="$BASE -std=gnu11 -DHAS_SOCKLEN_T -DNDEBUG -DLC_LOG"
CINC="-I$C/src -I$C/enet/include -I$C/nanors -I$C/nanors/deps -I$C/nanors/deps/obl -I$OUT/shim -I$CRYPTO_PREFIX/include"
for f in "$C"/src/*.c "$C"/enet/*.c \
         "$C"/nanors/rs.c \
         "$C"/nanors/deps/obl/oblas_common.c \
         "$C"/nanors/deps/obl/oblas_lite.c; do
  b=$(basename "$f" .c); case "$b" in win32|ConnectionTester) continue;; esac
  "$GCC" $CFLAGS $CINC -c "$f" -o "$OUT/obj/$b.o"
done

echo "== libgamestream =="
GINC="-I$MLT/libgamestream -I$C/src -I$CRYPTO_PREFIX/include"
for f in "$MLT"/libgamestream/http.c "$MLT"/libgamestream/pairing.c "$MLT"/libgamestream/mkcert.c; do
  "$GCC" $BASE -std=gnu11 -DHAS_SOCKLEN_T -DNDEBUG $GINC -c "$f" -o "$OUT/gs/$(basename "$f" .c).o"
done

echo "== link test against private static crypto/network libraries =="
cat > "$OUT/linktest.c" <<'EOF'
#include <curl/curl.h>
#include <openssl/evp.h>
#include <openssl/ssl.h>
#include <openssl/x509.h>
X509 *g_Cert; EVP_PKEY *g_PrivateKey; char *g_UniqueId; char *g_CertHex;
extern int LiStartConnection(void*,void*,void*,void*,void*,void*,int,void*,int);
extern int gs_pair(void*,char*);
int main(void){ curl_global_init(CURL_GLOBAL_DEFAULT); SSL_library_init();
  return (EVP_sha256()!=0)&&((void*)LiStartConnection!=0)&&((void*)gs_pair!=0); }
EOF
"$GCC" $BASE -I"$CRYPTO_PREFIX/include" -c "$OUT/linktest.c" -o "$OUT/linktest.o"
"$GCC" $BASE -o "$OUT/linktest" "$OUT/linktest.o" "$OUT"/obj/*.o "$OUT"/gs/*.o \
  -L"$CRYPTO_PREFIX/lib" -Wl,--exclude-libs,ALL \
  -lcurl -lssl -lcrypto -ldl -lpthread
echo "linktest built:"; file "$OUT/linktest" | cut -d, -f1-3
if "$OBJD" -p "$OUT/linktest" | grep -Eq 'NEEDED.*lib(ssl|crypto|curl)\.so'; then
  echo "ERROR: linktest acquired a firmware OpenSSL/cURL dependency." >&2
  exit 1
fi
bad=$("$OBJD" -T "$OUT/linktest" | grep -oE 'GLIBC_2\.(2[5-9]|[3-9][0-9])' | sort -u || true)
[ -z "$bad" ] && echo "glibc symbols: all <= 2.24 OK" || { echo "TOO-NEW glibc: $bad"; exit 1; }
