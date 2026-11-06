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
The web application opens the trusted reply port `MoonlightWmpReply`, launches
the native service explicitly, and sends request/reply messages over the
bidirectional Tizen MessagePort API.

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

`service/src/wmp_esplus_adapter.[ch]` provides separate typed paths:

- SET callbacks receive and forward `userdata`; ADD callbacks use the legacy
  process-global singleton context because that ABI has no userdata.
- Neutral video/audio stream descriptions are passed through family-specific
  registration symbols. Their field order preserves the audited 36-byte video
  and 24-byte audio ARM32 layouts.
- Neutral packets use nanoseconds. SET receives its expanded packet layout and
  millisecond timestamps; ADD receives its compact packet layout and
  nanosecond timestamps.
- Submit results preserve the raw native value. ADD success value `4` is
  recognized. SET enum values and the remaining ADD result values are not
  guessed: they remain `UNCLASSIFIED` until confirmed against the target ABI.

The adapter objects are included by the native engine build script. The
upstream renderer/audio call sites still need to be switched from their direct
legacy declarations to this neutral adapter before the dual-family path is
runtime-integrated. No claim of successful compilation or TV validation is made.

## Upstream engine source

The reusable native engine sources from [WMP/moonlight-tizen50-core](https://github.com/WMP/moonlight-tizen50-core) are imported under `upstream/`, with their GPL-3.0 license and original source notices. This includes the GameStream orchestration, Moonlight Common C renderer callbacks, shared ESPlus player lifecycle, audio/video sinks, engine API and native build/dependency scripts.

The upstream .NET host, CLI entry point, UI package, Samsung proprietary ESPlus header, TV libraries and generated binaries are intentionally excluded. See [upstream/README.md](upstream/README.md) for the exact boundary and porting constraints.

## Remaining integration work

The imported upstream player is still written directly against the legacy ADD declarations and currently references the excluded proprietary header. Its audio/video call sites must be migrated to the neutral adapter, and unresolved native return-code values must be verified before they are interpreted as backpressure or preparation states.

The engine still needs adaptation to the native ServiceApp lifecycle and connection to the service's media/session path. Ecore/Wayland display work must run on the appropriate Tizen main loop.

Before integration, remove upstream player-side watchdog/recovery decisions that would compete with Moonlight Common C's authority over session validity and disconnection. Do not change the existing EMSS implementation or add an automatic fallback between engines.

No proprietary Samsung library/header or SDK binary is included. No build, workflow or TV test is claimed.
