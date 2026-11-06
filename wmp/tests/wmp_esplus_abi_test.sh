#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

cat > "$TMP/fake_esplus.c" <<'EOF'
#ifndef FAKE_CORE_MISSING
void *esplusplayer_create(void) { return (void *)1; }
int esplusplayer_open(void *p) { (void)p; return 1; }
int esplusplayer_close(void *p) { (void)p; return 1; }
void esplusplayer_prepare_async(void *p) { (void)p; }
int esplusplayer_start(void *p) { (void)p; return 1; }
int esplusplayer_stop(void *p) { (void)p; return 1; }
int esplusplayer_submit_packet(void *p, const void *packet) { (void)p; (void)packet; return 4; }
#endif
#ifdef FAKE_SET
void esplusplayer_set_ecore_display(void) {}
void esplusplayer_set_video_stream_info(void) {}
void esplusplayer_set_audio_stream_info(void) {}
#endif
#ifdef FAKE_SET_PARTIAL
void esplusplayer_set_ecore_display(void) {}
void esplusplayer_set_video_stream_info(void) {}
#endif
#ifdef FAKE_ADD
/* Deliberately exports set_ecore_display too: it is not an ABI discriminator. */
void esplusplayer_set_ecore_display(void) {}
void esplusplayer_add_video_stream_info(void) {}
void esplusplayer_add_audio_stream_info(void) {}
#endif
#ifdef FAKE_BOTH
void esplusplayer_set_ecore_display(void) {}
void esplusplayer_set_video_stream_info(void) {}
void esplusplayer_set_audio_stream_info(void) {}
void esplusplayer_add_video_stream_info(void) {}
void esplusplayer_add_audio_stream_info(void) {}
#endif
#ifdef FAKE_CORE_MISSING
void esplusplayer_set_ecore_display(void) {}
void esplusplayer_set_video_stream_info(void) {}
void esplusplayer_set_audio_stream_info(void) {}
#endif
EOF

cc -std=c99 -Wall -Wextra -Werror \
  "$ROOT/service/src/wmp_esplus_abi.c" \
  "$ROOT/tests/wmp_esplus_abi_test.c" -ldl -o "$TMP/wmp-esplus-test"

build_case() {
    name="$1"
    expected="$2"
    shift 2
    mkdir -p "$TMP/$name"
    cc -std=c99 -Wall -Wextra -Werror -shared -fPIC "$@" \
      "$TMP/fake_esplus.c" -o "$TMP/$name/libesplusplayer.so"
    LD_LIBRARY_PATH="$TMP/$name" "$TMP/wmp-esplus-test" "$expected"
    printf 'PASS: %s\\n' "$name"
}

build_case modern-set set -DFAKE_SET
build_case legacy-add add -DFAKE_ADD
build_case partial-family missing -DFAKE_SET_PARTIAL
build_case incomplete-core core -DFAKE_CORE_MISSING
build_case ambiguous-families ambiguous -DFAKE_BOTH

cc -std=c99 -Wall -Wextra -Werror \
  "$ROOT/service/src/wmp_esplus_adapter.c" \
  "$ROOT/tests/wmp_esplus_adapter_test.c" -ldl -o "$TMP/wmp-esplus-adapter-test"
"$TMP/wmp-esplus-adapter-test"
echo "All WMP ESPlus resolver and adapter layout tests passed."
