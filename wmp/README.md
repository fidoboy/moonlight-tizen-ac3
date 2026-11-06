# Moonlight native WMP service

This directory contains the native Tizen service application and the upstream WMP engine source being ported into it. EMSS remains a separate, independently selectable engine in the Moonlight Web application.

## Package identity

The service is a native SERVICE sub-application of the existing Moonlight Web application. Both applications are packaged and signed in the same hybrid WGT:

- Shared package ID: `MoonLightS`
- Web application ID: `MoonLightS.MoonlightWasm`
- Native service application ID: `MoonLightS.WmpService`
- Native executable: `wmp-service`

It is not a standalone TPK and must not be published or installed separately.

## Current service control transport

The service registers the trusted native MessagePort `MoonlightWmpControl`.
The web application opens the trusted reply port `MoonlightWmpReply`,
launches the native service explicitly, and sends request/reply messages over
the bidirectional Tizen MessagePort API.

Protocol: `moonlight-wmp/1`

Each request carries `protocol`, `id`, `command` and a small JSON `payload`.
Replies carry `protocol`, `id`, `type=response`, `status` and JSON
`payload`. The web bridge exposes `connect()`, `request()`, `ping()`,
`getStatus()`, `probeEsplus()` and `close()`.

MessagePort is control-plane only; it is not used to transport encoded audio/video packets.

## ESPlus ABI discovery and typed adapters

The ABI probe selects a generation only from a complete stream-registration pair:

- SET: `set_video_stream_info` + `set_audio_stream_info`.
- ADD: `add_video_stream_info` + `add_audio_stream_info`.

Display exports are capabilities, not ABI discriminators. In particular,
`esplusplayer_set_ecore_display` is present in audited SET and ADD libraries,
so it must not be used to identify the generation. If both complete stream
pairs are exported, the probe rejects the library as ambiguous.

`service/src/wmp_esplus_adapter.[ch]` now defines a semantic, ABI-neutral
stream/packet contract and keeps the native layouts separate:

- SET callbacks carry `userdata`; ADD callbacks use the legacy process-global
  singleton because that ABI has no userdata. EOS is bridged when its optional
  registration symbol exists.
- Video stream registration is built field-by-field. SET receives
  `stride/slice_height/frame_rate/interlaced`; ADD receives
  `max_width/max_height/framerate_num/framerate_den`. The neutral structure
  retains both sets rather than relying on coincidental offsets.
- Audio stream registration is also built field-by-field.
- Video MIME values differ: ADD includes `UNKNOWN=0`, while Samsung's SET
  `VideoMimeType` enum begins with `H263=0`. The adapter maps semantic codec
  identifiers explicitly.
- Audio MIME values differ at the DTS slot: ADD has `DTS=7, OPUS=8`; SET
  has `OPUS=7` and does not define DTS. Unsupported family/codec combinations
  are rejected instead of forwarding a guessed number.
- Neutral packet timestamps are nanoseconds. SET receives its expanded packet
  layout and millisecond timestamps; ADD receives its compact packet layout
  and nanosecond timestamps.
- Submit results preserve the raw native value and normalize the documented
  states: `0 NOT_PREPARED`, `1 INVALID_PACKET`, `2 OUT_OF_MEMORY`,
  `3 FULL/BACKPRESSURE`, `4 SUCCESS`. The ADD values are also explicit in
  the upstream TV50 header; the SET order is documented by Samsung's
  `SubmitStatus` enumeration.

- Stream-registration return values are normalized separately from packet-submit
  statuses. Legacy ADD returns a C++ `bool` encoded as `int`: `1` is success
  and `0` is failure; other values remain unclassified. The ADD upstream TV50
  header explicitly documents this convention.
- The SET implementation returns `0` when the underlying `SetStream`
  operation succeeds, `-38` when it reports failure or is unavailable, and
  `-22` for null arguments. This contract has been confirmed independently
  in the extracted ELF64 x86-64 library and the ARM32 `libesplusplayer.so`
  pulled from the Samsung AU7172 running Tizen 6. The adapter classifies
  `0` as success, `-22`/`-38` as native failures, and preserves other values
  as `UNCLASSIFIED`.
- The neutral result distinguishes local invalid arguments and missing
  function pointers from native results.
- Lifecycle and display operations (create/open/prepare/start/stop/close,
  Ecore display attachment and display mode) now use typed adapter entry
  points. SET's observed zero-success / negative-error convention and ADD's
  legacy bool convention are normalized independently. The SET lifecycle and
  display return convention is confirmed by disassembly of the target TV's
  ARM32 library; it is not extrapolated from stream-registration tests.
- `get_playing_time` remains an optional ADD-only query because its SET
  contract has not been established. The observational depth sampler and
  nudge mode therefore run only when the selected ADD library exports it.
- `esplus_player.c`, `video_esplus.c` and `audio_opus.c` now consume the
  neutral contract. Their direct dependency on the excluded proprietary
  `esplusplayer_tv50.h` has been removed.
- The player-side stall watchdog and autonomous seek/IDR recovery have been
  removed. Player errors and resource conflicts are recorded as observations;
  Moonlight Common C remains the authority for session state and termination.
  Frozen public statistics fields for recoveries remain present for ABI
  compatibility but are no longer incremented by this player.
- `tests/wmp_esplus_abi_test.sh` now also covers lifecycle result
  normalization and mock calls through create/open/prepare/start/stop/close
  and display attachment/mode for both families. The ADD playing-time query
  is covered separately.

The engine build no longer attempts to copy the excluded proprietary
`esplusplayer_tv50.h`; the adapter sources are compiled from
`wmp/service/src`. These source changes have not yet been compiled or run
against the real Samsung library, and no TV validation is claimed.

## Upstream engine source

The reusable native engine sources from [WMP/moonlight-tizen50-core](https://github.com/WMP/moonlight-tizen50-core) are imported under `upstream/`, with their GPL-3.0 license and original source notices. This includes the GameStream orchestration, Moonlight Common C renderer callbacks, shared ESPlus player lifecycle, audio/video sinks, engine API and native build/dependency scripts.

The upstream .NET host, CLI entry point, UI package, Samsung proprietary ESPlus header, TV libraries and generated binaries are intentionally excluded. See [upstream/README.md](upstream/README.md) for the exact boundary and porting constraints.

## Remaining integration work

The player, video sink and Opus audio sink now use the neutral adapter inside
`libmlengine.so`. The remaining integration work is the native ServiceApp
lifecycle and connection between the web control channel and the engine's
media/session path. The adapter tests have not yet been executed for this
revision in the target Alpine environment.

The engine still needs adaptation to the native ServiceApp lifecycle and
connection to the service's media/session path. Ecore/Wayland display work runs
on the appropriate Tizen main loop through the existing thread-safe Ecore call.
The real SET/ADD binary integration and WGT service launch path still require
target-side validation. Do not change the existing EMSS implementation or add
an automatic fallback between engines.

No proprietary Samsung library/header or SDK binary is included. No build,
workflow or TV test is claimed.
