# WMP .NET service

This is the managed WMP auxiliary service for the Moonlight Tizen hybrid
installation. The final user installation remains one hybrid WGT containing
the WebApp and exactly two auxiliary .NET services: WMP and Ambilight.

Tizen Core may use an intermediate TPK while assembling/signing the
hybrid WGT. Those are build inputs, not separately distributed installation
packages. Do not copy the upstream repository's standalone WGT + TPK delivery
model.

## Application model

WMP is a headless Tizen **UI application** (`ui-application`, `type="dotnet"`,
`nodisplay="true"`, `launch_mode="single"`), launched on demand by the WebApp
using the app ID `MoonLightS.WmpService`. It is not a `service-application`.
This matches the upstream .NET host launch model; do not package it using the
former native C ServiceApp declaration. Its trusted local
MessagePort is `MoonlightWmpControl`; the WebApp receives replies/events on
its trusted local port `MoonlightWmpReply`.

The target remains `tizen80` (API Level 8, Tizen 6.0 M2). The WMP service
therefore requires Tizen 6.0 or later. The outer WebApp package can retain its
5.5 manifest floor, but the complete hybrid installation's practical minimum
is Tizen 6.0 because of this .NET service. Do not claim full hybrid
compatibility with Tizen 5.5 and do not silently change the host to
`net8.0-tizen10.0`.

## Compatibility boundary

The host preserves the existing `moonlight-wmp/1` MessagePort contract:

- control port: `MoonlightWmpControl`
- WebApp reply port: `MoonlightWmpReply`
- commands: `ping`, `get_status`, `probe_esplus`, `start_session`,
  `stop_session`
- message fields: `protocol`, `id`, `command`, `payload`, `arg_*`
- responses/events retain `protocol`, `id`, `type`, `status`, `payload`,
  `event`, and `detail`.

The `start_session` payload remains:
`host`, `rikey`, `appVer`, `gfeVer`, `rtspUrl`, `videoCodec`,
`audioConfig`, `w`, `h`, `fps`, `bitrate`, `rikeyid`, `codecMode`,
`hdr`, `fullRange`, and `opticalOutputEnabled`.

## Engine and audio invariants

- Load the same ARM32 `libmlengine.so`; do not fork Moonlight Common C.
- Moonlight Common C remains authoritative for session state and termination.
  The host serializes engine lifecycle calls and forwards events; it does not
  add an independent session watchdog or move disconnect decisions to JS.
- Call `ml_engine_set_dolby_passthrough_enabled(opticalOutputEnabled)` before
  `ml_engine_start_session_v2()`.
- Preserve distinct codec reports: `PENDING`, `OPUS`, `AC-3`, and `E-AC-3`.
- Preserve `displayVideo` after the first submitted video frame and
  `streamTerminated: <termination_code>` with the engine diagnostic.

## ESPlus ABI selection

The native adapter in `wmp/service/src/wmp_esplus_abi.*` and
`wmp/service/src/wmp_esplus_adapter.*` remains the only authority for ESPlus
symbol discovery and typed calls. It selects exactly one complete family:
SET (`set_video_stream_info` + `set_audio_stream_info`) or ADD
(`add_video_stream_info` + `add_audio_stream_info`). C# does not duplicate
proprietary signatures or make family-selection decisions.

## Integration gate

The .NET service must be compiled and included in the hybrid WGT. Then verify
on the TV: headless app launch, trusted MessagePorts, engine load, ESPlus probe,
engine start/stop, first video event, AC-3/E-AC-3 negotiation, and
host-initiated disconnect. EMSS remains integrated in WASM and is not changed.
The native service entry point is not part of the target architecture.
