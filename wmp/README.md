# WMP engine and .NET auxiliary service

WMP is an optional playback backend for the Moonlight Tizen WebApp. The
existing EMSS backend remains integrated in the WebApp and is unchanged.

The final installation is one hybrid WGT containing the WebApp and three
auxiliary .NET service applications: WMP, its independent process supervisor,
and Ambilight. WMP and the supervisor use the same signed .NET host assembly
but run as separate Tizen application IDs and separate processes. Tizen Core
may create intermediate TPKs while assembling the hybrid package; those TPKs
are packaging inputs, not separately distributed products.

## WMP .NET host

The managed host lives in [dotnet-host/](dotnet-host/). It is launched on
demand by the WebApp using the application ID `MoonLightS.WmpService`.
The trusted control and reply MessagePorts are:

- Host control port: `MoonlightWmpControl`
- WebApp reply port: `MoonlightWmpReply`
- Protocol: `moonlight-wmp/1`

The host implements `ping`, `get_status`, `probe_esplus`,
`start_session` and `stop_session`. The independent supervisor is launched
first as `MoonLightS.WmpSupervisor`; it listens for
`Tizen.Applications.ApplicationManager.ApplicationTerminated` and filters
events for `MoonLightS.WmpService`. It forwards unexpected termination over
the trusted WebApp reply port. Before an orderly exit, WMP sends the supervisor
an explicit expected-exit message so normal session completion is not reported
as a crash.

The current process/session lifecycle, clean-start sequence, diagnostic log
markers, supervisor protocol, known limitations, and outstanding device
verification are described in
[dotnet-host/README.md](dotnet-host/README.md). That document records
implemented behavior separately from unverified platform behavior; it must
not be read as claiming that every crash mode has already been proven to
recover correctly.

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

The hybrid workflows build the ARM engine, compile the `tizen80` .NET host
(including the supervisor implementation), and package both service
applications into the single hybrid WGT. The separate
`wmp-native-build.yml` diagnostic workflow also builds the engine and
managed host, but does not publish a standalone service package.

Run the transport and native ABI tests with the commands used by the
workflows:

```sh
node tests/wmp_transport_test.js
bash wmp/tests/wmp_esplus_abi_test.sh
```

The audio passthrough test is compiled and executed by the hybrid workflow.
Successful CI compilation does not replace the on-device lifecycle checks
listed in [dotnet-host/README.md](dotnet-host/README.md). In particular,
Tizen process-status callback behavior, abrupt native-crash detection,
actual service process exit, and UI recovery remain device-validation items.

## AVOC and platform API research

Reverse-engineering notes and platform API discoveries are kept separately
from the WMP implementation. See
[AVOC on Tizen 6.0: investigation and API inventory](AVOC-TIZEN60-INVESTIGATION.md)
for the emulator findings, AVOC libraries and daemon, Game Mode symbols and
D-Bus metadata, related API families, the observed `-2` return, and remaining
verification steps. The note distinguishes emulator findings from facts
verified on the target TV and is not proof that the AVOC contract is stable
across Tizen versions or architectures.
