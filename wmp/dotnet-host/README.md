# WMP .NET service

This document describes the implementation in this branch. It distinguishes
observable code behavior from guarantees that still require device validation
or further implementation. It is not a specification of behavior that the
code does not yet provide.

## Application model

WMP is a Tizen `ServiceApplication` (`service-application`, `type="dotnet"`,
`nodisplay="true"`) launched by the WebApp as `MoonLightS.WmpService`.
The host publishes trusted MessagePort `MoonlightWmpControl`; the WebApp
receives replies/events on `MoonlightWmpReply`. The protocol is
`moonlight-wmp/1`.

The target is `tizen80` (Tizen 6.0). The final installation is one hybrid
WGT containing the WebApp and the WMP and Ambilight .NET services. Intermediate
TPKs produced during packaging are build inputs, not separately distributed
packages.

## Implemented lifecycle behavior

### WebApp: clean start and launch

In `wasm/platform/wmp_transport.js`, `connect(true)` (used for
`start_session`) runs `stopExistingService()` before requesting fresh
MessagePort references or launching WMP.

The current implementation:

1. Calls `tizen.application.getAppsContext()` and filters contexts for
   `MoonLightS.WmpService`.
2. If contexts exist, calls `tizen.application.kill(context.id)` for each.
   A `NotFoundError` is treated as a process that may have exited between
   enumeration and kill.
3. Polls `getAppsContext()` every 100 ms, for at most 30 attempts, until no
   matching context remains. The API callback has a 5-second timeout.
4. Fails the connection if it cannot inspect, kill, or confirm disappearance
   of the previous process. It does not intentionally continue with a
   potentially stale service.
5. Registers the Tizen application-status listener, requests a fresh trusted
   local reply MessagePort, registers its message listener, launches
   `MoonLightS.WmpService`, and retries opening the remote control port.
6. Before sending `start_session`, waits for the host's explicit engine
   initialization status (`waitForServiceReady`). The host opens its control
   port in `OnCreate` before loading `libmlengine.so` and probing ESPlus;
   port availability alone is therefore not treated as engine readiness.

These are the code's current API calls and retry limits. Successful API
callbacks and context enumeration are not, by themselves, proof of every
possible Tizen process-lifecycle behavior on every TV firmware.

### .NET host: process and session

In `wmp/dotnet-host/Program.cs`:

- `Main` creates one `App : ServiceApplication` and calls `Run(args)`.
- `OnCreate` starts the control MessagePort, loads `libmlengine.so`,
  creates `EngineApi`, probes ESPlus, and publishes engine status.
- `OnTerminate` calls `HostProtocol.Shutdown()`, which joins the worker
  (if present) and stops/disposes the control MessagePort.
- `RequestExitAfterSession()` schedules `app.Exit()` after 1,500 ms. The
  delay is intended to leave time for final diagnostics to be retrieved.

In `HostProtocol.cs`:

- `start_session` validates its payload, creates a background worker thread,
  responds `accepted:true`, and starts `RunSession`.
- `RunSession` calls the shared native engine. The engine/Common C reports
  session termination; the host forwards `streamTerminated: <code>` and
  available diagnostic detail.
- The worker's `finally` block clears worker/session bookkeeping and calls
  `RequestExitAfterSession()`.
- A worker-start failure sends `streamTerminated: -1` and requests service
  exit.
- A managed exception caught by the worker is logged, the engine stop is
  attempted, and `streamTerminated: -1` is sent.
- `AppDomain.CurrentDomain.UnhandledException` attempts to log and forward
  an unhandled managed exception if active-session MessagePort details are
  available.
- `stop_session` currently calls the engine stop, sends a successful stop
  response and `streamTerminated: 0`, then requests service exit.

The implementation therefore intends the .NET service to be short-lived and
associated with one stream attempt. Its normal session completion path
requests process exit; the process is not designed as a persistent daemon
waiting for later streams.

### WebApp: unexpected process exit

The WebApp registers `tizen.application.addAppStatusChangeListener` before
launching the service. The listener:

- Records an active notification for the WMP app ID.
- On a subsequent inactive notification, calls `getAppsContext()` to check
  whether the service context is still present.
- If the context remains, it does not report a process exit.
- If the context is absent while `start_session` is pending, it rejects the
  pending start request.
- If the context is absent after `start_session` was accepted, it logs an
  error and forwards `streamTerminated: -1` into Moonlight's existing
  message/UI handling path.
- Avoids reporting a second failure after a native terminal event has already
  been received.

If context verification itself fails, the code logs the verification error;
it rejects a pending start or reports an unexpected-exit reason for an
accepted session. This is not equivalent to positively confirming that the
process exited.

The listener is removed by transport `close()`. The status listener only
reports process lifecycle; it is not intended to judge whether a live stream
is valid.

## Ownership boundary

Moonlight Common C remains authoritative for stream/session state and normal
termination decisions. The .NET host serializes engine operations and
forwards native results. JavaScript handles service orchestration, MessagePort
communication, player integration, and UI event delivery. Do not add a JS
watchdog, frame-arrival heuristic, or timer that independently aborts a
session while the native service remains alive.

## Known limitations and unverified behavior

The following must not be described as guaranteed by the current code:

- A native fatal crash (for example, a segmentation fault) may bypass
  `.NET AppDomain.UnhandledException`; the dead process cannot send a final
  MessagePort event. Recovery then depends on Tizen delivering the expected
  status callback and `getAppsContext()` reflecting the process disappearance.
- The status listener only treats an inactive notification as relevant after
  it has observed an active notification. Whether Tizen 6 firmware always
  delivers this sequence as expected must be verified on the target TV.
- If Tizen reports inactive before the process context disappears, the code
  checks once. If the context is still present, it marks the service active
  again; it does not schedule a later recheck specifically for that event.
- A failure to verify the process is logged and handled as a startup rejection
  or an unexpected-exit report, but does not prove the process is dead.
- The 1,500 ms delayed exit is a requested orderly shutdown path. Actual
  process termination and its timing must be confirmed on device.
- A successful build or unit test does not prove the Tizen status callback,
  process enumeration, kill semantics, or UI recovery work on real firmware.
- The interaction between `stop_session` and an active worker, including
  engine-stop serialization and races, must be validated against the current
  implementation and on-device behavior.

## On-device verification still required

Verify on the target TV:

1. Clean launch when no WMP process exists.
2. A stale WMP process is killed and confirmed absent before a new launch.
3. Engine readiness is published before `start_session`.
4. Normal stream end sends the terminal event, cleans up the worker, and
   actually exits the service process.
5. A second stream starts with a new service process and fresh MessagePorts.
6. Service disappearance while `start_session` is pending rejects startup
   and restores the normal UI.
7. Service disappearance after `start_session` acceptance reaches the
   existing UI recovery path.
8. Managed exceptions and abrupt native crashes are separately exercised;
   record which are detected and what diagnostics survive.
9. Tizen's active/inactive callback ordering and `getAppsContext()` behavior
   are confirmed on the actual Tizen 6 television.
10. Normal stop and failure paths do not leave a process, worker, or stale
    MessagePort reference that affects the next attempt.

## Related implementation

- WebApp transport and Tizen lifecycle observer: `wasm/platform/wmp_transport.js`
- .NET application entry point and process exit: `wmp/dotnet-host/Program.cs`
- MessagePort protocol, worker, and engine session: `wmp/dotnet-host/HostProtocol.cs`
- Shared engine and ESPlus adapter: `wmp/upstream/` and `wmp/service/src/`
