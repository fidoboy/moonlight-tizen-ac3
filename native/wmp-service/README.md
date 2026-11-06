# Moonlight native WMP service

This directory contains the native Tizen service application that will host the
experimental Samsung ESPlus playback engine. EMSS remains a separate,
independently selectable engine in the Moonlight Web application.

## Package identity

The service is a native SERVICE sub-application of the existing Moonlight Web
application. Both applications are packaged and signed in the same hybrid WGT:

- Shared package ID: `MoonLightS`
- Web application ID: `MoonLightS.MoonlightWasm`
- Native service application ID: `MoonLightS.WmpService`
- Native executable: `wmp-service`

It is not a standalone TPK and must not be published or installed separately.

## Implemented native control transport

The service registers the trusted native MessagePort `MoonlightWmpControl`.
The web application opens the trusted reply port `MoonlightWmpReply`, launches
the native service explicitly, and sends request/reply messages over the
bidirectional Tizen MessagePort API.

Protocol: `moonlight-wmp/1`

Each request carries `protocol`, `id`, `command` and a small JSON `payload`.
Replies carry `protocol`, `id`, `type=response`, `status` and JSON
`payload`. The web bridge exposes `connect()`, `request()`, `ping()`,
`getStatus()`, `probeEsplus()` and `close()`.

MessagePort is a control-plane transport. It is not a suitable high-throughput
encoded audio/video packet path; no media packets are forwarded yet.

## ESPlus ABI discovery

The probe recognizes two distinct ESPlus generations:

- Legacy Tizen 5.x-style ABI: `add_video_stream_info`,
  `add_audio_stream_info`, and `set_ecore_display`.
- Later public 0.0.3-style ABI: `set_video_stream_info`,
  `set_audio_stream_info`, and `set_display_ecore_subsurface`.

The legacy family is based on the public implementation reference
[WMP/moonlight-tizen50-core](https://github.com/WMP/moonlight-tizen50-core),
particularly `esplusplayer_tv50.h` and `mlclient/esplus_player.c`.
The later family is based on the 0.0.3 API header supplied for this project.
These APIs have different stream structures, packet layouts, callback
signatures, timestamp units and return conventions.

Selection requires a complete stream-info pair and its matching display API.
If both generations appear complete, the probe reports an ambiguous ABI and
refuses to guess. It does not infer the ABI from the Tizen OS version.
The current probe only detects export names; it does not validate binary
signatures, structure layouts, callback behavior or player initialization.
No function pointer is called by the probe.

Probe states are deliberately distinct: `library_missing`,
`core_symbols_incomplete`, `stream_api_missing`, `abi_ambiguous`, and
`symbols_detected`. The last state does **not** mean that the ABI is validated
or that an ESPlus player has been initialized.

## Porting boundary and current limitations

The upstream WMP project demonstrates a complete native Moonlight engine in
which the GameStream client, Moonlight Common C callbacks, ESPlus player,
video sink and audio sink execute in one native process. Its useful engine
work includes a single shared player for both tracks, the video/audio callback
implementations, packet submission, display-window setup and the native
GameStream orchestration.

This repository's current WMP component is a separate Tizen service process.
The existing WASM/EMSS pipeline cannot feed that process through the current
MessagePort control protocol. Consequently, porting the ESPlus player alone
does not connect it to the incoming Moonlight media stream. The native engine
integration and its media/session control path remain future work; EMSS is not
modified or used as a fallback.

No proprietary Samsung library or SDK binary is included in this repository.
