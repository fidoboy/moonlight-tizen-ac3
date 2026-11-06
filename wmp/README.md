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

## Upstream engine source

The reusable native engine sources from [WMP/moonlight-tizen50-core](https://github.com/WMP/moonlight-tizen50-core) are now imported under `wmp/upstream/`, with their GPL-3.0 license and original source notices. This includes the GameStream orchestration, Moonlight Common C renderer callbacks, shared ESPlus player lifecycle, audio/video sinks, engine API and native build/dependency scripts.

The upstream .NET host, CLI entry point, UI package, Samsung proprietary ESPlus header, TV libraries and generated binaries are intentionally excluded. See [upstream/README.md](upstream/README.md) for the exact boundary and porting constraints.

## ESPlus ABI discovery

The existing probe recognizes two distinct ESPlus generations:

- Legacy Tizen 5.x-style ABI: `add_video_stream_info`,
  `add_audio_stream_info`, and `set_ecore_display`.
- Later public 0.0.3-style ABI: `set_video_stream_info`,
  `set_audio_stream_info`, and `set_display_ecore_subsurface`.

Selection requires a complete stream-info pair and its matching display API.
If both generations appear complete, the probe reports an ambiguous ABI and
refuses to guess. It does not infer the ABI from the Tizen OS version.
The current probe only detects export names; it does not validate binary
signatures, structure layouts, callback behavior or player initialization.

The imported upstream player is written for the legacy API. Porting it to the
later API requires a separate adapter; the two API families must never be mixed
within one session.

## Remaining integration work

The imported source is the porting base, not yet a compiled WGT engine. It still
needs to be adapted to the native ServiceApp lifecycle, linked with the project's
Moonlight Common C/dependency setup, and connected to the service's media/session
path. Ecore/Wayland display work must run on the appropriate Tizen main loop.

Before integration, remove upstream player-side watchdog/recovery decisions that
would compete with Moonlight Common C's authority over session validity and
disconnection. Do not change the existing EMSS implementation or add an
automatic fallback between engines.

No proprietary Samsung library/header or SDK binary is included. No build,
workflow or TV test is claimed by this source import.
