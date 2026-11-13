# WMP engine and .NET auxiliary service

WMP is an optional playback backend for the Moonlight Tizen WebApp. The
existing EMSS backend remains integrated in the WebApp and is unchanged.

The final installation is one hybrid WGT containing the WebApp and exactly
two auxiliary .NET services: WMP and Ambilight. Tizen Core may create an
intermediate TPK while assembling the hybrid package; that TPK is a packaging
input, not a separately distributed or installed product.

## WMP .NET host

The managed host lives in [dotnet-host/](dotnet-host/). It is launched on
demand by the WebApp using the application ID `MoonLightS.WmpService`.
The trusted control and reply MessagePorts are:

- Host control port: `MoonlightWmpControl`
- WebApp reply port: `MoonlightWmpReply`
- Protocol: `moonlight-wmp/1`

The host implements `ping`, `get_status`, `probe_esplus`,
`start_session` and `stop_session`. The complete payload, lifecycle and
Tizen target contract is documented in [dotnet-host/README.md](dotnet-host/README.md).

The .NET host loads the ARM32 `libmlengine.so` through the managed
`ManualLoader`. It does not contain a separate native ServiceApp executable.
Do not restore the former C ServiceApp, its manifest, or its packaging path.

## Native engine and ESPlus compatibility layer

The reusable WMP streaming engine is built from [upstream/](upstream/) into
`libmlengine.so`. The engine includes Moonlight Common C and the project-owned
ESPlus compatibility layer. The C files under `service/src/` are **library
components**, not an application or service entry point:

- `wmp_esplus_abi.c/.h` detects one complete ESPlus ABI family.
- `wmp_esplus_adapter.c/.h` provides typed, ABI-neutral adapter calls.
- The selected family is either SET (`set_video_stream_info` and
  `set_audio_stream_info`) or ADD (`add_video_stream_info` and
  `add_audio_stream_info`). The two families are never mixed.
- The .NET host calls the shared engine's exported ABI; C# does not duplicate
  proprietary ESPlus signatures or make ABI-family decisions.

The proprietary `libesplusplayer.so` is supplied by TV firmware and loaded at
runtime. It is not shipped in the hybrid WGT and must not appear as a
link-time `DT_NEEDED` dependency.

## Audio and session invariants

- AC-3/E-AC-3 is used only when the RTSP negotiation confirms the selected
  codec. The original compressed frames are submitted to ESPlus.
- If Dolby is unavailable or not negotiated, the engine decodes received Opus multistream packets with the vendored libopus decoder and submits interleaved PCM_S16LE to ESPlus. Opus packets are never passed to ESPlus.
- The optional optical-output setting is passed to the shared engine before
  session start.
- Moonlight Common C remains authoritative for session validity and
  termination. The .NET host serializes engine operations and forwards
  lifecycle events; it must not introduce an independent session watchdog or
  move disconnect decisions into JavaScript.
- EMSS remains independent and is not replaced, modified, or used as a
  fallback for WMP.

## Build and verification

The hybrid workflows build the ARM engine, compile the `tizen80` .NET host,
and package the WMP payload into the single hybrid WGT. The separate
`wmp-native-build.yml` diagnostic workflow also builds the engine and
managed host, but does not publish a standalone service package.

Run the transport and native ABI tests with the commands used by the
workflows:

```sh
node tests/wmp_transport_test.js
bash wmp/tests/wmp_esplus_abi_test.sh
```

The audio passthrough test is compiled and executed by the hybrid workflow.
Successful CI compilation does not replace on-device validation of service
launch, trusted MessagePorts, engine loading, ESPlus SET/ADD behavior,
AC-3/E-AC-3 playback, and both host- and client-initiated teardown.
