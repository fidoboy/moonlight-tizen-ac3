# ESPlus ARM32 ABI checker

This tool reports sizeof, alignment and offsetof for:
- WMP's legacy Tizen 5.0 add_* structure declarations.
- OmegaTube's later set_* candidate declarations.

The candidate declarations are references, not proof of the private ABI in a
Samsung TV firmware. The tool does not load or call libesplusplayer.so.

## Build the candidate report

Use the ARMv7 compiler downloaded by WMP's fetch-tizen-sources.sh:

```sh
CC=/path/to/cross-arm-gcc ./tools/esplus-abi-checker/build-abi-check.sh
```

The default compiler name is arm-linux-gnueabi-gcc. The script enforces
32-bit pointers and uses ARMv7 AAPCS Linux options.

## Compare with the Tizen 6.5 native header

After WMP's source-fetch script has extracted its Tizen 6.5 source RPM, locate:

```sh
find tizen-deps/src -name esplusplayer_capi.h -print
```

Inspect the actual typedef names. Create an adapter header which includes the
native header and aliases its real structure types. For example, the following
is schematic; replace the placeholder type names with declarations actually
present in the extracted Samsung header:

```c
#include <esplusplayer_capi/esplusplayer_capi.h>
typedef ACTUAL_NATIVE_VIDEO_TYPE esp_native_video_stream_info;
typedef ACTUAL_NATIVE_AUDIO_TYPE esp_native_audio_stream_info;
typedef ACTUAL_NATIVE_PACKET_TYPE esp_native_packet;
```

Then run:

```sh
CC=/path/to/cross-arm-gcc \
ESPLUS_INCLUDE_DIR=/path/to/extracted/include \
ESPLUS_NATIVE_ADAPTER=/absolute/path/to/native_adapter.h \
  ./tools/esplus-abi-checker/build-abi-check.sh
```

The native report prints each common field offset and each structure's total
size. If the native header uses different field names or a different packet
shape, adapt native_layout.c to the actual declarations; do not edit the
Samsung header or silently assume OmegaTube's private layout.

## Limits

- Only a 32-bit ARM report is suitable for the AU7172.
- sizeof/offsetof validate the compiled declarations, not the private binary.
- Tizen 6.5 is a reference, not proof of identical ABI on Tizen 6.0.
- Function prototypes, callback signatures, enum values and return semantics
  need a separate audit; this utility measures structure layout only.
