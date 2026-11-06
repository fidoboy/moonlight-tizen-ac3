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

The service registers the trusted native MessagePort `MoonlightWmpControl` and links against the engine's public `mlengine.h` ABI. Its status response reports `libmlengine` availability and the live `ml_engine_running()` state.

After the existing host `launch`/`resume` request succeeds, the Web UI forwards the resulting session parameters over MessagePort using `start_session`. The service validates the fields, acknowledges that the request was queued, and invokes `ml_engine_start_session_v2()` on a worker thread, so the ServiceApp message loop is not blocked by connection setup. A later startup failure is forwarded as `streamTerminated: -1` with its diagnostic detail. Successful starts forward the existing `Connection Established`, `displayVideo` and `streamTerminated: <code>` UI events. Its monitor only observes `ml_engine_running()` and the engine's accepted-video counter; it does not make session validity, recovery or disconnect decisions.

`stop_session` forwards teardown to `ml_engine_stop()`. Explicit stop, host termination and ServiceApp termination converge on the public engine stop API, with the ServiceApp serializing start/stop operations so `LiStopConnection()` is not called while `LiStartConnection()` is still executing.
The web application opens the trusted reply port `MoonlightWmpReply`,
launches the native service explicitly, and sends request/reply messages over
the bidirectional Tizen MessagePort API. The bridge exposes
`connect()`, `request()`, `ping()`, `getStatus()`, `probeEsplus()`,
`startStream()`, `stopStream()` and `close()`. Start parameters are also
forwarded as individual `arg_*` bundle fields so the C ServiceApp can validate
them without depending on a JSON parser.

Protocol: `moonlight-wmp/1`

Each request carries `protocol`, `id`, `command` and a small JSON
`payload`; start-session fields are additionally sent as `arg_*` strings.
Replies carry `protocol`, `id`, `type=response`, `status` and JSON
`payload`. Lifecycle notifications carry `protocol`, `type=event`,
`event` and optional diagnostic `detail`.

MessagePort is control-plane only; it is not used to transport encoded audio/video packets.

## Native ServiceApp build

Build `libmlengine.so` first with the upstream engine script, then link the
ServiceApp executable against it and the Tizen ServiceApp/MessagePort libraries:

```sh
# From the repository root. BPD and DEPSBUILD are the outputs of the
# backport-dependency and native dependency build scripts.
MLT="$PWD" DEPS=/path/to/tizen-deps \
  BPD=/path/to/backport-deps DEPSBUILD=/path/to/deps-build \
  OUT="$PWD/engine-build" bash wmp/upstream/mlclient/build-engine-so.sh

DEPS=/path/to/tizen-deps \
  bash wmp/service/build-wmp-service.sh
```

The service build expects `engine-build/libmlengine.so` by default. Override
`ENGINE_SO` when the engine output is elsewhere. It stages the linked ARM
executable at `wmp/build/service/bin/wmp-service` and its runtime dependency at
`wmp/build/service/lib/libmlengine.so`; the executable uses
`$ORIGIN/../lib` to locate the engine. The script checks the ELF machine and
the executable's `DT_NEEDED` entries, including `libmlengine.so` and the
Tizen ServiceApp/MessagePort libraries.

This is a cross-link recipe, not a claim that the current checkout has been
built against the target TV libraries. The generated executable and library
still need to be staged into the native ServiceApp project before the hybrid
WGT is assembled and signed.

## ESPlus runtime loading and typed ABI adapters

The proprietary `libesplusplayer.so` is not a public SDK dependency and is
not shipped in the WGT. The TV firmware provides it in its native library
search path. `service/src/wmp_esplus_abi.c` opens it with
`dlopen("libesplusplayer.so", RTLD_NOW | RTLD_LOCAL)` and resolves the
required exports with `dlsym()`, following the same runtime-loading model
used by [OmegaTube](https://github.com/IIyn/omegatube). The engine link must
therefore never contain `-l:libesplusplayer.so`, and the resulting
`libmlengine.so` must not have a `DT_NEEDED` entry for that library.

The build still uses target TV link dependencies for Ecore/Wayland and the
OpenSSL/cURL ABI expected by the imported engine. The manual build archive
therefore contains those libraries under `usr/lib/`, but does not need
`libesplusplayer.so`. At runtime, the TV's own firmware copy is loaded.
The workflow verifies that the engine has no link-time ESPlus dependency.

The ABI probe selects a generation only from a complete stream-registration pair:

- SET: `set_video_stream_info` + `set_audio_stream_info`.
- ADD: `add_video_stream_info` + `add_audio_stream_info`.

Display exports are capabilities, not ABI discriminators. In particular,
`esplusplayer_set_ecore_display` is present in audited SET and ADD libraries,
so it must not be used to identify the generation. If both complete stream
pairs are exported, the probe rejects the library as ambiguous.

`service/src/wmp_esplus_adapter.[ch]` defines a semantic, ABI-neutral
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
  and `0` is failure; other values remain unclassified. The SET implementation
  returns `0` on success, `-38` on native failure and `-22` for null
  arguments, confirmed in the extracted x86-64 and target ARM32 libraries.
- Lifecycle and display operations use typed adapter entry points. SET's
  zero-success/negative-error convention and ADD's legacy bool convention are
  normalized independently. The SET lifecycle/display convention is confirmed
  by disassembly of the target TV's ARM32 library.
- `get_playing_time` remains an optional ADD-only query because its SET
  contract has not been established.
- `esplus_player.c`, `video_esplus.c` and `audio_opus.c` consume the neutral
  contract; they do not include Samsung's proprietary player header.
- The player-side stall watchdog and autonomous seek/IDR recovery have been
  removed. Moonlight Common C remains authoritative for session validity and
  termination.

## Upstream engine source

The reusable native engine sources from [WMP/moonlight-tizen50-core](https://github.com/WMP/moonlight-tizen50-core) are imported under `upstream/`, with their GPL-3.0 license and original source notices. This includes the GameStream orchestration, Moonlight Common C renderer callbacks, shared ESPlus player lifecycle, audio/video sinks, engine API and native build/dependency scripts.

The upstream .NET host, CLI entry point, UI package, Samsung proprietary ESPlus header, TV libraries and generated binaries are intentionally excluded. See [upstream/README.md](upstream/README.md) for the exact boundary and porting constraints.

## Remaining integration work

The native control path reaches the public engine start/stop API, and a
dedicated script defines the ServiceApp-to-`libmlengine.so` link. Remaining
items are unverified or incomplete:

- Execute the engine and ServiceApp cross-builds against the actual Tizen
  dependency/sysroot and target TV link dependencies, then inspect the ELF.
- Stage `bin/wmp-service` and `lib/libmlengine.so` in the native ServiceApp
  project and assemble/sign the hybrid WGT.
- Validate service launch, Wayland/Ecore display access, runtime loading of the
  firmware's ESPlus library, SET/ADD playback and teardown on the TV.
- Map remaining WMP controls (manual H.264 level, audio encryption/passthrough,
  latency/audio processing preferences and gamepad input) where the engine
  exposes a supported API.
- Implement the separate AC-3/E-AC-3 passthrough path; the current imported
  WMP audio sink is Opus.

EMSS remains unchanged and there is no automatic fallback between engines.
No proprietary Samsung library/header or SDK binary is included. No build,
workflow or TV test is claimed.
