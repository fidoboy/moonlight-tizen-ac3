#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

cat > "$TMP/fake_esplus.c" <<'EOF'
#ifndef FAKE_CORE_MISSING
void esplusplayer_create(void) {}
void esplusplayer_open(void) {}
void esplusplayer_close(void) {}
void esplusplayer_destroy(void) {}
void esplusplayer_prepare_async(void) {}
void esplusplayer_start(void) {}
void esplusplayer_stop(void) {}
void esplusplayer_submit_packet(void) {}
void esplusplayer_set_ecore_display(void) {}
#endif
#ifdef FAKE_SET
void esplusplayer_set_video_stream_info(void) {}
void esplusplayer_set_audio_stream_info(void) {}
#endif
#ifdef FAKE_SET_PARTIAL
void esplusplayer_set_video_stream_info(void) {}
#endif
#ifdef FAKE_ADD
void esplusplayer_add_video_stream_info(void) {}
void esplusplayer_add_audio_stream_info(void) {}
#endif
#ifdef FAKE_BOTH
void esplusplayer_set_video_stream_info(void) {}
void esplusplayer_set_audio_stream_info(void) {}
void esplusplayer_add_video_stream_info(void) {}
void esplusplayer_add_audio_stream_info(void) {}
#endif
EOF

cc -std=c99 -Wall -Wextra -Werror \
  "$ROOT/native/wmp-service/src/wmp_esplus_abi.c" \
  "$ROOT/tests/wmp_esplus_abi_test.c" -ldl -o "$TMP/wmp-esplus-test"

build_case() {
    name="$1"
    expected="$2"
    shift 2
    mkdir -p "$TMP/$name"
    cc -std=c99 -Wall -Wextra -Werror -shared -fPIC "$@" \
      "$TMP/fake_esplus.c" -o "$TMP/$name/libesplusplayer.so"
    LD_LIBRARY_PATH="$TMP/$name" "$TMP/wmp-esplus-test" "$expected"
    printf 'PASS: %s\n' "$name"
}

# Both complete naming families must select modern set_*.
build_case both set -DFAKE_BOTH
# A complete legacy family is selected only when set_* is unavailable.
build_case legacy add -DFAKE_ADD
# A partial family is never accepted.
build_case partial missing -DFAKE_SET_PARTIAL
# Missing core lifecycle exports prevent family selection.
build_case incomplete-core core -DFAKE_SET -DFAKE_CORE_MISSING

echo "All WMP ESPlus resolver tests passed."
