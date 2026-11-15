# WMP .NET service

This is the managed WMP auxiliary service for the Moonlight Tizen hybrid
installation. The final user installation remains one hybrid WGT containing
the WebApp and exactly two auxiliary .NET services: WMP and Ambilight.

Tizen Core may use intermediate service TPKs while assembling/signing the
hybrid WGT. Those are build inputs, not separately distributed installation
packages. Do not copy the upstream repository's standalone WGT + TPK delivery
model.

## Application model

WMP is a Tizen **ServiceApplication** (`service-application`, `type="dotnet"`,
`nodisplay="true"`), launched on demand by the WebApp using the app ID
`MoonLightS.WmpService`. It is a managed .NET application, not the former
native C ServiceApp. Its trusted local
MessagePort is `MoonlightWmpControl`; the WebApp receives replies/events on
its trusted local port `MoonlightWmpReply`.

The target remains `tizen80` (API Level 8, Tizen 6.0 M2). The WMP service
therefore requires Tizen 6.0 or later. The outer WebApp package can retain its
5.5 manifest floor, but the complete hybrid installation's practical minimum
is Tizen 6.0 because of this .NET service. Do not claim full hybrid
compatibility with Tizen 5.5 and do not silently change the host to
`net8.0-tizen10.0`.

## Normative service lifecycle contract

**The WMP service is a per-stream process, not a persistent background
daemon.** When WMP is selected, one service instance is created for that
stream. It must remain alive for the lifetime of that stream and must
terminate when the stream ends. It must also terminate if its startup/session
work fails or the process crashes. A later stream must use a fresh service
instance; it must never inherit a previous stream's process, worker, engine
state, or MessagePort endpoints.

This contract is mandatory for every implementation and every future change:

1. **Clean-start phase — before starting a stream.** The WebApp must ensure
   that no previous `MoonLightS.WmpService` instance is still running. If an
   instance exists, request/force its orderly stop as appropriate and wait
   until Tizen confirms that it has actually disappeared. Do not treat a stop
   request, an inactive notification alone, or a closed MessagePort as proof
   that the process is gone. Only after the old instance is gone may the
   WebApp discard/recreate its MessagePort references and launch the new
   instance.
2. **Launch and readiness.** Launch exactly one fresh service instance.
   Establish the trusted MessagePort connection and wait for the host's
   readiness/engine status before issuing `start_session`. A successful
   application-launch request or a successful `ping` alone is not proof
   that the engine and ESPlusPlayer are ready.
3. **Stream ownership.** The service owns the native engine instance and its
   worker for this stream. It remains alive while the stream is active and
   serializes start, input, stop, and cleanup operations. No second stream
   may reuse the same live service instance.
4. **Normal stream termination.** When Moonlight Common C reports that the
   stream has ended, the host stops and releases the native engine, sends the
   terminal `streamTerminated: <code>` event (including available diagnostic
   detail), completes worker cleanup, and exits the Tizen service process.
   The service must not remain resident waiting for another stream.
5. **Startup or managed failure.** If initialization, worker creation, or
   session startup fails, record the failure, report a terminal failure to
   Moonlight whenever the process and MessagePort are still usable, release
   owned resources, and exit. A failed attempt must not leave a half-initialized
   service available for the next stream.
6. **Unexpected process disappearance / crash.** A crashed process cannot
   send its own final MessagePort event. The WebApp must therefore observe
   Tizen's application/process lifecycle independently of MessagePort. Once
   Tizen confirms that the service process has disappeared without a terminal
   event, Moonlight must be notified through its existing stream-termination
   and UI-recovery path. This applies both while `start_session` is pending
   and after it has been accepted. Preserve the available reason and
   diagnostics in the application log, including when normal debug logging is
   disabled.
7. **Next stream.** Every new stream repeats the entire clean-start phase.
   Never assume that a previous stream's cleanup completed merely because
   Moonlight changed screens or because the MessagePort was closed.

The lifecycle observer is a process-liveness mechanism only. It reports that
the Tizen service process has disappeared; it must not infer that a stream is
invalid while the service remains alive. **Moonlight Common C remains the
sole authority for stream/session validity and normal disconnect decisions.**
Do not add JavaScript watchdogs, elapsed-time heuristics, frame-arrival
timeouts, or polling loops that independently abort a live session. A bounded
wait used to complete the clean-start/readiness handshake is a startup
coordination mechanism, not a session watchdog.

### Ownership boundaries

- **Moonlight Common C / native engine:** owns stream protocol state, session
  validity, and stream termination decisions. Its terminal result and
  diagnostics are forwarded by the host.
- **.NET WMP host:** owns the per-stream service process, native engine
  lifetime, worker serialization, MessagePort server, resource cleanup, and
  forwarding of native lifecycle/diagnostic events. It exits after the
  stream ends or the attempt fails.
- **Moonlight WebApp / JavaScript:** owns orchestration of the clean-start
  phase, Tizen process-lifecycle observation, MessagePort client references,
  player/UI integration, and delivery of terminal notifications into
  Moonlight's existing UI recovery path. It must not replace Common C's
  session authority.

### Required lifecycle invariants

- At most one WMP service process and one WMP stream worker may exist for a
  stream attempt.
- A new attempt cannot proceed until any previous service process is
  confirmed gone and stale MessagePort references have been discarded.
- A normal terminal event is delivered before orderly service exit whenever
  the process is healthy enough to send it.
- If the process dies before sending that event, the WebApp's Tizen lifecycle
  observer supplies the missing notification; the UI must not remain on a
  transition screen indefinitely.
- Process-exit notification and a native `streamTerminated` event must not
  cause duplicate recovery.
- Cleanup and exit are idempotent. The engine is stopped once by its owning
  session/worker path; shutdown must not race a second independent stop.
- Diagnostics must identify whether the failure occurred during service
  launch, host initialization, engine/ESPlus initialization, session startup,
  active streaming, or teardown, to the extent the platform exposes that
  information.

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

## Lifecycle verification gate

A successful build or a successful stream is not sufficient. Before treating
the lifecycle as complete, verify on the target TV:

- Start a stream with no prior service process; confirm clean launch and
  readiness ordering.
- End a stream normally; confirm terminal event, engine cleanup, service
  process exit, and return to the normal Moonlight interface.
- Immediately start another stream; confirm the old process is gone and a
  fresh process/MessagePort session is used.
- Terminate the service while clean-start is checking for an old instance;
  confirm startup fails cleanly and does not hang.
- Terminate the service while `start_session` is pending; confirm the
  pending request is rejected and the UI recovers.
- Terminate the service after `start_session` is accepted; confirm the
  Tizen process observer reports the disappearance and the UI recovers.
- Exercise managed startup/session exceptions and, where reproducible,
  abrupt native process crashes; verify useful diagnostics and no duplicate
  terminal handling.
- Repeat after normal stop and after failure to prove that no stale process,
  worker, or MessagePort reference contaminates the next attempt.

EMSS remains integrated in WASM and is not changed. The native service entry
point is not part of the target architecture.
