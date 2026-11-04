# ESPlus ARM32 ABI checker

The checker keeps three sources distinct:

1. WMP's reconstructed legacy Tizen 5.0 `add_*` declarations.
2. A normalized layout mirror transcribed from Samsung's public ESPlusPlayer
   CAPI 0.0.3 `set_*` header.
3. OmegaTube's third-party extended packet, printed only for comparison.

## Public CAPI 0.0.3 layout assertions

| Structure | Size | Key offsets |
|---|---:|---|
| Audio stream info | 24 | data 0, length 4, MIME 8, bitrate 12, channels 16, sample rate 20 |
| Video stream info | 36 | data 0, length 4, MIME 8, width 12, height 16, max width 20, max height 24, FPS numerator 28, denominator 32 |
| ES packet | 48 | type 0, buffer 4, size 8, PTS 16, duration 24, Matroska pointer 32, HDR10+ size 36, HDR10+ pointer 40 |

The public audio MIME values represented are UNKNOWN=0, AAC=1, MP2=2, MP3=3,
AC3=4, EAC3=5, VORBIS=6 and OPUS=7. The CAPI packet has 8-byte alignment on
the ARM32 AAPCS target.

These declarations are a regression mirror, not a copy of Samsung's header.
The optional direct-header comparison below is the independent compile-time
check against the extracted header.

## Build the ARM32 report

```sh
./tools/esplus-abi-checker/build-abi-check.sh
```

The default compiler is `arm-linux-gnueabi-gcc`. Override it with:

```sh
CC=/path/to/arm-linux-gnueabi-gcc ./tools/esplus-abi-checker/build-abi-check.sh
```

The script enforces 32-bit pointers and uses ARMv7-A/AAPCS/softfp flags.
A host build is not accepted as target ABI evidence.

## Compare directly with the Samsung header

Keep the Samsung source RPM and extracted headers outside this repository.
Create an adapter that includes the original CAPI header and aliases the
actual typedef names:

```c
#include <esplusplayer_capi/esplusplayer_capi.h>
typedef ACTUAL_NATIVE_VIDEO_TYPE esp_native_video_stream_info;
typedef ACTUAL_NATIVE_AUDIO_TYPE esp_native_audio_stream_info;
typedef ACTUAL_NATIVE_PACKET_TYPE esp_native_packet;
```

Then run:

```sh
CC=/path/to/arm-linux-gnueabi-gcc \
ESPLUS_INCLUDE_DIR=/path/to/extracted/include \
ESPLUS_NATIVE_ADAPTER=/absolute/path/to/esplus_native_adapter.h \
  ./tools/esplus-abi-checker/build-abi-check.sh
```

The direct comparison statically checks native sizes and packet offsets, and
prints the checked fields. If a native field or typedef name differs, adapt
the checker to the real declaration. Do not modify the Samsung header.

## ABI distinctions and limits

- Never mix WMP legacy `add_*` declarations with modern `set_*` declarations.
- The public CAPI audio enum has OPUS=7. WMP's reconstructed legacy enum used
  a different numbering in which DTS occupied 7 and OPUS 8.
- Public CAPI packet timestamps are milliseconds; do not apply the legacy
  nanosecond conversion.
- OmegaTube's `reserved[64]` additions are not part of the public CAPI 0.0.3
  layouts represented here.
- Layout assertions do not validate callback calling conventions, function
  return semantics, runtime symbol availability or firmware behavior.
- Tizen 6.5 public source does not prove identical ABI on Tizen 6.0 or on
  every Tizen 5.5+ television.
