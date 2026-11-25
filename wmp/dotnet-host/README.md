# WMP .NET host and process supervisor

This document records the implementation on this branch. It distinguishes
code behavior from Tizen behavior that still requires validation on the target
Samsung TV. A successful build is not proof that the OS lifecycle events are
delivered for every termination mode.

## Application model

The signed WMP .NET TPK declares two Tizen service applications which execute
the same `MoonlightHost.dll` assembly in separate processes:

- `MoonLightS.WmpService`: the short-lived playback host.
- `MoonLightS.WmpSupervisor`: an independent process-lifecycle observer.

Both are `ServiceApplication` instances, `type="dotnet"`, API 8, with
`background-network`, `on-boot="false"` and `auto-restart="false"`.
The supervisor is not a thread inside WMP: Tizen launches it under its own
application ID and process context. The entry point distinguishes the two
instances through `Application.Current.ApplicationInfo.ApplicationId`.

WMP publishes trusted MessagePort `MoonlightWmpControl`. The WebApp receives
WMP and supervisor events on its trusted local port `MoonlightWmpReply`.
The WMP-to-WebApp protocol is `moonlight-wmp/1`. The supervisor's private
control port is `MoonlightWmpSupervisorControl`, using the separate control
protocol `moonlight-wmp-supervisor/1`.

The target is `tizen80` (Tizen 6.0 / API 8). The final installation is one
hybrid WGT containing the WebApp, WMP, the supervisor, and Ambilight. The
intermediate TPKs are packaging inputs, not separately distributed packages.

## Implemented lifecycle behavior

### WebApp: clean start and launch order

In `wasm/platform/wmp_transport.js`, a fresh `start_session` connection
performs the following sequence before submitting the stream request:

1. Closes stale WebApp MessagePort references and removes the previous Tizen
   status listener.
2. Enumerates and stops any previous `MoonLightS.WmpSupervisor` process,
   then confirms its disappearance.
3. Enumerates and stops any previous `MoonLightS.WmpService` process, then
   confirms its disappearance.
4. Registers the Tizen WMP application-status listener and a fresh trusted
   local reply MessagePort.
5. Launches `MoonLightS.WmpSupervisor` and retries opening its trusted control
   port. WMP is not launched until this port is available.
6. Launches `MoonLightS.WmpService` and retries opening its trusted control
   port.
7. Waits for the host's explicit engine initialization status before sending
   `start_session`. Port availability alone is not treated as engine
   readiness.

Process cleanup uses `getAppsContext()`, `kill()`, and a bounded
`getAppsContext()` verification loop. A `NotFoundError` between enumeration
and kill is treated as a possible process-exit race; the subsequent
verification decides whether the process is gone. Failure to inspect, kill,
or confirm disappearance aborts the clean start.

The supervisor is stopped before an intentional WMP clean-start kill. This
prevents the old supervisor from classifying the deliberate replacement of
the old WMP process as an unexpected crash.

### .NET host: lifecycle instrumentation

`Program.cs` emits `WMP_LIFECYCLE` records with UTC timestamps, process ID,
phase, and a compact host-state snapshot. Instrumented boundaries include:

- Main entry and `ServiceApplication.Run()` entry/return/exception.
- `OnCreate`, control-port initialization, native engine loading, and ESPlus
  probe begin/completion/failure.
- `start_session` validation, acceptance, worker creation/start, and
  rejected-start reasons.
- Native `StartSessionV2` call entry/return, engine-running-loop exit,
  terminal error retrieval, engine stop, worker exception, and worker cleanup.
- `stop_session`, orderly exit scheduling, `app.Exit()`, `OnTerminate`,
  host shutdown, CLR `ProcessExit`, and `AppDomain.UnhandledException`.

These records are intended to distinguish a managed session result, a
managed exception, an orderly service exit, and the last lifecycle boundary
observed before an abrupt process disappearance. The process ID allows the
host and supervisor records to be correlated. Session keys, RTSP URLs, and
host addresses are not added to these lifecycle records.

### .NET host: session and termination

In `HostProtocol.cs`:

- `start_session` validates the request, creates the worker, responds
  `accepted:true`, and starts `RunSession`.
- `RunSession` arms the independent supervisor's 30-second startup
  watchdog immediately before entering native `StartSessionV2`. The deadline
  covers that call and the wait for the first video-ready signal.
- Once `VideoReady()` confirms playback readiness, WMP disarms the supervisor
  watchdog before emitting `displayVideo`.
- If native startup returns or the session stops before video readiness, WMP
  first performs its normal `_engine.Stop()` cleanup and then disarms the
  watchdog. If that cleanup itself hangs, the watchdog remains armed.
- Moonlight Common C remains the authority for session state and normal
  termination. The host forwards `streamTerminated: <code>` and any available
  diagnostic detail.
- The worker's `finally` block clears session bookkeeping, sends the final
  diagnostic-ready event, and requests service exit.
- A worker-start failure sends `streamTerminated: -1` and requests exit.
- A managed exception caught by the worker is logged, engine stop is
  attempted, and `streamTerminated: -1` is sent.
- `AppDomain.CurrentDomain.UnhandledException` logs and attempts to forward
  an unhandled managed exception while the process and MessagePort remain
  usable.
- `stop_session` queues a stop request for an active worker; the worker
  performs the engine stop. When no worker is active, the host performs an
  idempotent stop, responds, emits `streamTerminated: 0`, and requests exit.

### Diagnostic delivery during startup and termination

Native engine log callbacks and host diagnostic records are copied into
bounded in-memory queues. Enqueueing a diagnostic schedules a coalesced
ThreadPool dispatcher, which forwards newly queued native markers, native
logs, and host diagnostics to the WebApp over the existing trusted reply
MessagePort. The native callback itself performs no MessagePort I/O and does
not wait for the dispatcher.

The host also flushes diagnostics immediately after `StartSessionV2` returns,
before its final worker cleanup, and on a one-second periodic fallback while
the session worker is active. This avoids relying on the WebApp's one-second
`get_new_logs` request to win a race against a short-lived WMP process. The
WebApp already writes `wmpNativeDiag`, `wmpNativeLog`, and
`wmpHostDiagnostic` events to its Debug log as they arrive.

This is diagnostic transport only. It does not monitor stream health, infer
disconnects, or change Moonlight Common C's authority over session state.

Before scheduling the 1,500 ms orderly process-exit delay, WMP sends
`expect_exit` to the supervisor over its trusted control port. The delay
allows final diagnostics to be retrieved; it is not a process-liveness
watchdog.

### Independent supervisor: startup watchdog and OS termination

In `WmpSupervisor.cs`, the supervisor:

1. Opens `MoonlightWmpSupervisorControl` and registers
   `ApplicationManager.ApplicationTerminated`.
2. Accepts only trusted startup-watchdog and orderly-exit control messages
   from `MoonLightS.WmpService`.
3. Arms a 30-second one-shot timer when WMP enters native startup and cancels
   it only after video readiness or after WMP has completed its own startup
   failure/stop cleanup.
4. If the deadline expires, sends the existing
   `streamTerminated: -1` event directly to the WebApp, then requests AVOC
   full-off for both the source scope (`save_type=1`) and global scope
   (`save_type=0`) before terminating the WMP process by PID. This covers a
   WMP thread blocked inside native `StartSessionV2`, where WMP cannot run
   its own timeout or cleanup code.
5. Does not call `ml_engine_stop()` from the supervisor: doing so would race
   the blocked native call. Terminating the isolated WMP process lets the OS
   reclaim its native handles, ESPlus connection, IPC endpoints, and process
   resources.
6. Filters OS termination notifications by the exact WMP application ID,
   records the terminated application ID, PID, Tizen state, and whether WMP
   had announced an orderly exit, and suppresses notifications for an
   expected WMP exit.
7. For any other unannounced WMP termination, independently requests AVOC
   full-off for the source and global scopes before sending
   `wmpSupervisorTerminated` to the WebApp's trusted reply port, including
   the Tizen event source and process details, then exits itself.

The startup watchdog is process supervision, not a JavaScript timer or a
stream-health heuristic. It ends after WMP reports video readiness; it does
not monitor ongoing frame arrival or playback progress.

The supervisor does **not** receive a crash dump or a native signal/exit code
from this event. Its detail identifies the process and the fact that Tizen
reported its termination; it cannot, by itself, distinguish SIGSEGV, an
external kill, a runtime failure, or another termination cause.

For an unexpected WMP exit, the supervisor calls the AVOC
`avoc_set_game_mode` entry point from its own process and issues independent
off requests for source (`save_type=1`) and global (`save_type=0`) Game Mode.
The same cleanup runs before the startup watchdog force-kills WMP. Normal
WMP teardown performs both requests after ESPlus releases the player. The
supervisor runs AVOC calls on a background thread, waits up to 2.5 seconds
before continuing, and allows a further 5 seconds before exiting; an unresolved
call is logged rather than allowed to block process supervision indefinitely.
The native setter declaration follows the confirmed two-argument C interface documented in `AVOC-TIZEN60-INVESTIGATION.md`.

### WebApp: recovery path

The supervisor's startup-timeout notification uses the same
`streamTerminated: -1` event emitted by WMP, so the existing central
Moonlight termination path restores the UI and displays the error dialog.
No JavaScript watchdog or new UI recovery path is introduced.

The WebApp also handles `wmpSupervisorTerminated` in
`ESPlusPlayerTransport.handleMessage()` for other unexpected process exits:

- If `start_session` is pending, it records the termination and rejects the
  pending startup when the request path resumes.
- If the start request was accepted, it calls the existing
  `reportUnexpectedServiceExit()` path.
- That path retains the supervisor detail in
  `pendingStreamApiMessage`, closes the transport, and forwards
  `streamTerminated: -1` to Moonlight's existing central message handler.
- If Moonlight already received a native `streamTerminated` event, the
  supervisor notification is deduplicated.

The existing `addAppStatusChangeListener` plus `getAppsContext()` check
remains as a fallback. It is not equivalent to a process-termination event:
an inactive notification may describe an activation-state change while the
process still exists. If the context is still present, the current fallback
does not report an exit. The independent supervisor is the new primary
termination signal being evaluated.

## Ownership boundary

Moonlight Common C remains authoritative for session validity, stream state,
and normal disconnect decisions. The .NET host serializes engine operations
and forwards native results. The supervisor reports Tizen application
termination and provides the independent AVOC full-off safety path.
JavaScript handles service orchestration, MessagePort communication, player
integration, and UI event delivery.

Do not add a JavaScript watchdog, frame-arrival heuristic, or timer that
independently aborts a session while the native service remains alive.

## Known limitations and device-validation status

The following are implementation facts or explicit unknowns, not guarantees:

- The Tizen .NET API 6 documentation exposes
  `ApplicationManager.ApplicationTerminated` and supplies an
  `ApplicationRunningContext`. The target TV must still prove that the
  installed Tizen 6 firmware delivers this event for the WMP service's
  normal exit, external termination, and native crash.
- A native fatal crash can bypass `.NET AppDomain.UnhandledException`,
  `OnTerminate`, and CLR `ProcessExit`. In that case the supervisor event
  is expected to be the independent notification path, but its delivery on
  this TV is not yet proven.
- The supervisor reports termination, not the underlying crash cause. A
  native crash reason requires surviving platform crash logs or other
  diagnostics; the supervisor cannot reconstruct it.
- The supervisor's separate-process `libavoc.so` P/Invoke and its ability
  to change AVOC state under the supervisor application's Tizen security
  context still require on-device verification. AVOC failures are logged
  independently for source and global scopes; a successful build cannot prove
  that firmware accepted either request.
- If the supervisor itself is terminated or crashes, this implementation has
  no second-level supervisor. The existing WebApp Tizen status callback is
  only a fallback and has its previously described limitations.
- The 1,500 ms exit delay is a requested orderly shutdown path. Actual
  process termination timing must be confirmed on device.
- The use of two service-application declarations pointing to the same
  `MoonlightHost.dll` is package-validated in CI, but the two distinct
  application IDs and separate process lifetimes must also be confirmed on
  the TV.
- A successful build or transport unit test does not prove Tizen event
  delivery, MessagePort delivery after process death, process exit behavior,
  or Moonlight UI recovery on real firmware.

## Required on-device verification

On the target Samsung Tizen 6 TV, capture the remote application log for each
case and correlate `WMP_LIFECYCLE` and `WMP_SUPERVISOR` records by UTC time
and process ID:

1. Clean launch with neither WMP nor supervisor running.
2. Clean start with stale WMP and supervisor processes present.
3. Confirm the supervisor is a separate process and publishes its trusted
   control port before WMP launches.
4. End a stream normally. Confirm WMP sends `expect_exit`, sends its native
   terminal event, exits, and the supervisor suppresses the expected
   termination.
5. Start a second stream and confirm both processes are fresh.
6. Force a managed startup failure and confirm the host lifecycle records,
   terminal event, process exit, and UI recovery.
7. Force a managed worker exception and confirm the host lifecycle records,
   terminal event, process exit, and UI recovery.
8. Force an external WMP process termination and confirm the supervisor
   receives `ApplicationTerminated`, forwards the event, and Moonlight
   restores its normal navigation UI.
9. Trigger a controlled native crash (for example, a test-only SIGSEGV in a
   diagnostic build). Confirm whether Tizen emits
   `ApplicationTerminated`, whether the supervisor survives, and whether the
   WebApp receives the event.
10. Confirm the supervisor exits after the WMP termination and does not
    remain orphaned.
11. Confirm no duplicate recovery occurs when native `streamTerminated`,
    supervisor termination, and the fallback Tizen status callback arrive
    close together.

Until these cases are tested on the actual TV, the supervisor is a
build-time implementation and a testable hypothesis—not a validated
guarantee of crash recovery.

## Related implementation

- WebApp transport and recovery event handling: `wasm/platform/wmp_transport.js`
- .NET application entry point and lifecycle logs: `wmp/dotnet-host/Program.cs`
- WMP session protocol and expected-exit signal: `wmp/dotnet-host/HostProtocol.cs`
- Independent Tizen process supervisor: `wmp/dotnet-host/WmpSupervisor.cs`
- Shared engine and ESPlus adapter: `wmp/upstream/` and `wmp/service/src/`
