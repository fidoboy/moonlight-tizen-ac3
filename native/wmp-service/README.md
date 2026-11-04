# Moonlight native WMP service

This directory contains the native Tizen service application that will host the
experimental Samsung ESPlus playback engine.

## Package identity

The service is designed to be a sub-application of the existing Moonlight Web
application:

- Shared package ID: `MoonLightS`
- Web application ID: `MoonLightS.MoonlightWasm`
- Native service application ID: `MoonLightS.WmpService`
- Native executable: `wmp-service`

The service must be packaged as a native SERVICE sub-application in the same
hybrid `.wgt` as the Web UI. It is not a standalone TPK and must not be
published or installed separately.

## Current implementation stage

The current source is deliberately limited to a safe runtime bootstrap:

- Native service lifecycle using Tizen's Service Application API.
- Runtime loading of the firmware-provided `libesplusplayer.so`.
- Export discovery for the common player lifecycle and packet functions.
- Independent completeness checks for the modern `set_*_stream_info` and
  legacy `add_*_stream_info` families.
- Modern `set_*` is preferred only when its complete pair of stream-info
  functions is exported; otherwise a complete legacy `add_*` pair may be
  selected.
- The service does not call any ESPlus function yet. Export discovery does not
  certify function signatures, structure layout, callback ABI, return values,
  or timestamp units.

No automatic switch to EMSS is implemented here. EMSS remains a separate
Moonlight engine selection. WMP availability and runtime errors must be
reported to the UI without changing the selected engine.

## Not implemented yet

- Native MessagePort command/data transport.
- ESPlus typed adapters for the two ABI families.
- Player create/open/configure/prepare/start/stop/close lifecycle.
- Encoded audio/video packet forwarding from the Moonlight WASM pipeline.
- Real-device hybrid installation and service-launch verification.

These are separate milestones. Do not enable WMP in the user interface until
the hybrid package, service launch, IPC, ABI adapter, and playback path have
each been validated.

## SDK requirements

A real Tizen TV Native App Development toolchain and a TV ARM rootstrap are
required. The Web CLI alone cannot compile this service. The repository's
native-SDK discovery workflow records the package catalog, service templates,
and rootstraps advertised by the installed Tizen Studio version before the
hybrid build pipeline is wired to specific SDK components.
