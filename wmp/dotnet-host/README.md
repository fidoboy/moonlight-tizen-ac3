# WMP .NET host port

This directory is the staged port of the background host used by
`WMP/moonlight-tizen50`. It is deliberately not part of the hybrid package
yet: the existing native ServiceApp remains the active WMP implementation
until this host implements the complete `moonlight-wmp/1` contract and passes
the same engine/audio tests.

## Target application model

The final host is a separate Tizen .NET **UI application without a window**
(`ui-application`, `type="dotnet"`, `nodisplay="true"`). The WebApp launches
it on demand with `tizen.application.launch()`. It is not a
`service-application` and must not be started at boot. Keep the background
execution metadata and `background-network` category from the reference
implementation.

The host target must remain `tizen80` as required by this project. Do not
copy the reference project's `tizen40` target or the unrelated Ambilight
`net8.0-tizen10.0` target.

## Compatibility boundary

The host must preserve the existing WebApp protocol and must not introduce a
second, incompatible MessagePort protocol:

- protocol: `moonlight-wmp/1`
- WebApp reply port: `MoonlightWmpReply`
- host control port: `MoonlightWmpControl`
- commands: `ping`, `get_status`, `probe_esplus`, `start_session`,
  `stop_session`
- replies and events retain the current `protocol`, `id`, `type`,
  `status`, `payload`, `event` and `detail` fields.

The `start_session` payload remains the existing C service contract:
`host`, `rikey`, `appVer`, `gfeVer`, `rtspUrl`, `videoCodec`,
`audioConfig`, `w`, `h`, `fps`, `bitrate`, `rikeyid`, `codecMode`,
`hdr`, `fullRange`, and `opticalOutputEnabled`.

## Engine and audio invariants

- Load the same packaged `libmlengine.so`; do not fork the engine.
- Keep `Moonlight Common C` authoritative for session state and termination.
  The host may serialize engine lifecycle calls and forward status/events, but
  must not add an independent session watchdog or infer a disconnect in JS.
- Preserve the call to
  `ml_engine_set_dolby_passthrough_enabled(opticalOutputEnabled)` before
  `ml_engine_start_session_v2()`.
- Preserve active audio codec reporting: `PENDING`, `OPUS`, `AC-3`,
  `E-AC-3`; do not collapse AC-3 and E-AC-3 into a generic Dolby state.
- Preserve the `displayVideo` first-submitted-frame event and
  `streamTerminated: <termination_code>` with the engine diagnostic.
- Keep the current C ServiceApp until the .NET host has passed launch,
  trusted-port, engine-start/stop, video-ready, codec-negotiation, and
  host-initiated disconnect tests on the TV.

## ESPlus ABI selection

The existing native adapter remains the sole authority for ESPlus ABI
selection and calls. It selects exactly one complete stream-registration
family:

- SET: `set_video_stream_info` + `set_audio_stream_info`
- ADD: `add_video_stream_info` + `add_audio_stream_info`

Never mix the two families, infer the generation from display symbols, or
reimplement the proprietary function signatures in C#. The host's
`probe_esplus` response must obtain its result from a native interface that
uses `wmp_esplus_probe()` and the typed adapter. A managed duplicate probe
is not an acceptable replacement.

## Migration gate

Only after the .NET host and its separate TPK are built and verified should a
later commit change the WebApp launch target and hybrid package dependency.
That switch must be atomic from the user's perspective: EMSS remains the
default backend, WMP starts only when explicitly selected, and the old C
ServiceApp remains available until TV validation confirms parity.
