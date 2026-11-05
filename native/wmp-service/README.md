# Moonlight native WMP service

This directory contains the native Tizen service application that will host the
experimental Samsung ESPlus playback engine.

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
`payload`. The native side accepts messages only from the Moonlight Web app
ID and only over a trusted port (same author certificate).

Implemented commands:

- `ping`: confirms that the native service is receiving and replying.
- `get_status`: reports service readiness and the ESPlus probe result.
- `probe_esplus`: returns the same cached ESPlus availability/family report.

The Web application exposes this bridge as `window.WmpTransport` with
`connect()`, `request(command, payload)`, `ping()`, `getStatus()`,
`probeEsplus()` and `close()`.

MessagePort is deliberately restricted to the control plane. Its small-message
limit makes it unsuitable for encoded audio/video packet forwarding. No media
packets are forwarded yet.

## ESPlus bootstrap

- Runtime loading of firmware-provided `libesplusplayer.so`.
- Export discovery for common player lifecycle and packet functions.
- Independent completeness checks for modern `set_*_stream_info` and legacy
  `add_*_stream_info` families.
- Modern `set_*` is preferred only when its complete stream-info pair exists;
  otherwise a complete legacy `add_*` pair may be selected.
- No ESPlus function is called yet. Export discovery does not certify function
  signatures, structure layout, callback ABI, return values or timestamp units.

No automatic switch to EMSS is implemented. EMSS remains a separate Moonlight
engine selection.

## Still not implemented

- Typed ESPlus adapters for both ABI families.
- Player create/open/configure/prepare/start/stop/close lifecycle.
- Encoded audio/video packet forwarding from the Moonlight WASM pipeline.
- Real-device hybrid installation, service launch and MessagePort round-trip
  verification.

The control transport being compiled does not enable WMP playback. Do not expose
WMP as a selectable playback engine until the remaining ABI, lifecycle and
media-data path have been implemented and validated on the TV.

## SDK requirements

A TV Native App Development toolchain and a TV ARM rootstrap are required. The
Web CLI alone cannot compile this service.
