using System;
using System.Globalization;
using System.Diagnostics;
using System.Threading;
using System.Runtime.InteropServices;
using Tizen.Applications;
using Tizen.Applications.Messages;

namespace MoonlightWmpHost
{
    // Runs as a separate Tizen ServiceApplication process, using the same
    // signed host assembly but a distinct application ID. It supervises the
    // WMP startup deadline and process lifetime independently.
    internal static class WmpSupervisor
    {
        private const string SupervisorAppId = "MoonLightS.WmpSupervisor";
        private const string WmpAppId = "MoonLightS.WmpService";
        private const string WebAppId = "MoonLightS.MoonlightWasm";
        private const string ControlPortName = "MoonlightWmpSupervisorControl";
        private const string ReplyPortName = "MoonlightWmpReply";
        private const string Protocol = "moonlight-wmp-supervisor/1";

        private static readonly object Gate = new object();
        private static ServiceApplication _application;
        private static MessagePort _port;
        private static bool _expectedExit;
        private static bool _terminationObserved;
        private static bool _started;
        private static Timer _startupWatchdog;
        private static int _startupTargetPid;
        private static int _startupTimeoutSeconds;
        private static long _startupWatchdogGeneration;
        private static Thread _avocCleanupThread;

        private static void LogLifecycle(string phase, string detail)
        {
            Log.Info("WMP_SUPERVISOR phase=" + phase +
                " utc=" + DateTime.UtcNow.ToString("o", CultureInfo.InvariantCulture) +
                " pid=" + Process.GetCurrentProcess().Id.ToString(CultureInfo.InvariantCulture) +
                " detail=" + (detail ?? String.Empty));
        }

        // The exported AVOC setter has two C arguments: save_type and mode.
        // save_type=1 is the source scope; save_type=0 is the global scope.
        [DllImport("libavoc.so", EntryPoint = "avoc_set_game_mode",
            CallingConvention = CallingConvention.Cdecl)]
        private static extern int AvocSetGameMode(int saveType, int mode);

        private static int SetGameModeOff(int saveType, string scope, string reason)
        {
            int rc = -1;
            try
            {
                for (int attempt = 0; attempt <= 3; attempt++)
                {
                    rc = AvocSetGameMode(saveType, 0);
                    LogLifecycle("avoc_full_off_attempt",
                        "reason=" + reason + " scope=" + scope +
                        " saveType=" + saveType.ToString(CultureInfo.InvariantCulture) +
                        " attempt=" + (attempt + 1).ToString(CultureInfo.InvariantCulture) +
                        "/4 rc=" + rc.ToString(CultureInfo.InvariantCulture));
                    if (rc == 0 || rc != -2 || attempt == 3) break;
                    Thread.Sleep(200);
                }
            }
            catch (Exception ex)
            {
                Log.Error("WMP_SUPERVISOR AVOC full-off failed for " + scope + ": " + ex);
            }
            return rc;
        }

        private static void ForceGameModeFullOff(string reason)
        {
            // AVOC uses a synchronous firmware call. Keep it off the watchdog
            // callback's critical path so a stalled AVOC service cannot prevent
            // the supervisor from killing a hung WMP process.
            Thread cleanupThread = new Thread(delegate()
            {
                // Do not short-circuit: the global safety-net call must run even
                // if the source operation fails or the source state is absent.
                int sourceRc = SetGameModeOff(1, "source", reason);
                int globalRc = SetGameModeOff(0, "global", reason);
                LogLifecycle("avoc_full_off_complete",
                    "reason=" + reason +
                    " source_rc=" + sourceRc.ToString(CultureInfo.InvariantCulture) +
                    " global_rc=" + globalRc.ToString(CultureInfo.InvariantCulture));
            });
            cleanupThread.IsBackground = true;
            _avocCleanupThread = cleanupThread;
            cleanupThread.Start();

            if (!cleanupThread.Join(2500))
            {
                LogLifecycle("avoc_full_off_wait_timeout",
                    "reason=" + reason + " wait_ms=2500; cleanup continues in background");
            }
        }

        internal static void Start(ServiceApplication application)
        {
            lock (Gate)
            {
                if (_started) throw new InvalidOperationException("WMP supervisor already started");
                _application = application;
                _expectedExit = false;
                _terminationObserved = false;
                _started = true;
            }

            LogLifecycle("on_create_enter", "appId=" + SupervisorAppId);
            try
            {
                _port = new MessagePort(ControlPortName, true);
                _port.MessageReceived += OnControlMessage;
                _port.Listen();
                LogLifecycle("control_port_listening", ControlPortName);

                ApplicationManager.ApplicationTerminated += OnApplicationTerminated;
                LogLifecycle("termination_listener_registered", "targetAppId=" + WmpAppId);
                LogLifecycle("ready", "waiting_for_target_process_termination");
            }
            catch (Exception ex)
            {
                Log.Error("WMP_SUPERVISOR startup_failed " + ex);
                Shutdown();
                throw;
            }
        }

        private static void OnControlMessage(object sender, MessageReceivedEventArgs e)
        {
            try
            {
                if (e == null || e.Remote == null || e.Remote.Trusted != true ||
                    e.Remote.AppId != WmpAppId)
                {
                    Log.Error("WMP_SUPERVISOR rejected untrusted or unexpected control sender");
                    return;
                }

                Bundle message = e.Message;
                string protocol = message != null && message.Contains("protocol")
                    ? message.GetItem<string>("protocol") : null;
                string command = message != null && message.Contains("command")
                    ? message.GetItem<string>("command") : null;
                if (protocol != Protocol)
                {
                    Log.Error("WMP_SUPERVISOR rejected invalid control protocol");
                    return;
                }

                if (command == "expect_exit")
                {
                    string detail = message.Contains("detail")
                        ? message.GetItem<string>("detail") : null;
                    lock (Gate)
                    {
                        _expectedExit = true;
                        CancelStartupWatchdogLocked();
                    }
                    LogLifecycle("expected_exit_received", detail);
                    return;
                }

                if (command == "arm_startup_watchdog")
                {
                    int targetPid;
                    int timeoutSeconds;
                    if (!message.Contains("targetPid") || !message.Contains("timeoutSeconds") ||
                        !Int32.TryParse(message.GetItem<string>("targetPid"), NumberStyles.Integer,
                            CultureInfo.InvariantCulture, out targetPid) ||
                        !Int32.TryParse(message.GetItem<string>("timeoutSeconds"), NumberStyles.Integer,
                            CultureInfo.InvariantCulture, out timeoutSeconds) ||
                        targetPid <= 0 || timeoutSeconds < 1 || timeoutSeconds > 120)
                    {
                        Log.Error("WMP_SUPERVISOR rejected invalid startup watchdog parameters");
                        return;
                    }
                    ArmStartupWatchdog(targetPid, timeoutSeconds);
                    return;
                }

                if (command == "startup_ready")
                {
                    CancelStartupWatchdog();
                    LogLifecycle("startup_ready_received", "video readiness confirmed by WMP");
                    return;
                }

                if (command == "startup_finished")
                {
                    CancelStartupWatchdog();
                    LogLifecycle("startup_finished_received", "WMP completed startup failure or stop cleanup");
                    return;
                }

                Log.Error("WMP_SUPERVISOR rejected unknown control command=" + (command ?? "<null>"));
            }
            catch (Exception ex)
            {
                Log.Error("WMP_SUPERVISOR control message failed " + ex);
            }
        }

        private static void ArmStartupWatchdog(int targetPid, int timeoutSeconds)
        {
            long generation;
            lock (Gate)
            {
                CancelStartupWatchdogLocked();
                _expectedExit = false;
                _startupTargetPid = targetPid;
                _startupTimeoutSeconds = timeoutSeconds;
                generation = ++_startupWatchdogGeneration;
                _startupWatchdog = new Timer(
                    OnStartupWatchdogExpired, generation,
                    timeoutSeconds * 1000, Timeout.Infinite);
            }
            LogLifecycle("startup_watchdog_armed",
                "targetPid=" + targetPid.ToString(CultureInfo.InvariantCulture) +
                " timeoutSeconds=" + timeoutSeconds.ToString(CultureInfo.InvariantCulture));
        }

        private static void CancelStartupWatchdog()
        {
            lock (Gate) CancelStartupWatchdogLocked();
        }

        private static void CancelStartupWatchdogLocked()
        {
            if (_startupWatchdog != null)
            {
                _startupWatchdog.Dispose();
                _startupWatchdog = null;
            }
            _startupTargetPid = 0;
            _startupTimeoutSeconds = 0;
            _startupWatchdogGeneration++;
        }

        private static void OnStartupWatchdogExpired(object state)
        {
            int targetPid;
            int timeoutSeconds;
            lock (Gate)
            {
                long generation = (long)state;
                if (!_started || _startupWatchdog == null ||
                    generation != _startupWatchdogGeneration)
                    return;

                _startupWatchdog.Dispose();
                _startupWatchdog = null;
                targetPid = _startupTargetPid;
                timeoutSeconds = _startupTimeoutSeconds;
                _startupTargetPid = 0;
                _startupTimeoutSeconds = 0;
                _expectedExit = true;
            }

            string detail = "ESPlusPlayer startup timed out after " +
                timeoutSeconds.ToString(CultureInfo.InvariantCulture) +
                " seconds before WMP reported video readiness";
            LogLifecycle("startup_watchdog_expired",
                "targetPid=" + targetPid.ToString(CultureInfo.InvariantCulture));

            // Notify Moonlight before terminating WMP. This is the existing
            // streamTerminated contract; the WebApp performs its normal UI recovery.
            try
            {
                var notification = new Bundle();
                notification.AddItem("protocol", "moonlight-wmp/1");
                notification.AddItem("type", "event");
                notification.AddItem("event", "streamTerminated: -1");
                notification.AddItem("detail", detail);
                if (_port == null)
                    throw new InvalidOperationException("supervisor reply port is unavailable");
                _port.Send(notification, WebAppId, ReplyPortName, true);
                LogLifecycle("startup_timeout_forwarded", "targetPid=" +
                    targetPid.ToString(CultureInfo.InvariantCulture));
            }
            catch (Exception ex)
            {
                Log.Error("WMP_SUPERVISOR startup_timeout_forward_failed " + ex);
            }

            // The startup watchdog can kill WMP after Game Mode was enabled but
            // before WMP reaches its own cleanup path. Clear both AVOC scopes here.
            ForceGameModeFullOff("WMP startup watchdog termination");

            // StartSessionV2 may be blocked in native code. Do not call ml_engine_stop
            // concurrently; terminate the isolated WMP process so the OS releases
            // its ESPlus handles, IPC endpoints, and native resources.
            try
            {
                using (Process target = Process.GetProcessById(targetPid))
                {
                    if (!target.HasExited)
                    {
                        target.Kill();
                        LogLifecycle("startup_timeout_wmp_kill_requested",
                            "targetPid=" + targetPid.ToString(CultureInfo.InvariantCulture));
                    }
                }
            }
            catch (Exception ex)
            {
                Log.Error("WMP_SUPERVISOR startup_timeout_wmp_kill_failed pid=" +
                    targetPid.ToString(CultureInfo.InvariantCulture) + " error=" + ex);
            }
        }

        private static void OnApplicationTerminated(object sender, ApplicationTerminatedEventArgs e)
        {
            ApplicationRunningContext context = e == null ? null : e.ApplicationRunningContext;
            if (context == null || context.ApplicationId != WmpAppId) return;

            bool expected;
            lock (Gate)
            {
                if (_terminationObserved) return;
                _terminationObserved = true;
                expected = _expectedExit;
                CancelStartupWatchdogLocked();
            }

            string detail = "source=ApplicationManager.ApplicationTerminated" +
                " appId=" + context.ApplicationId +
                " pid=" + context.ProcessId.ToString(CultureInfo.InvariantCulture) +
                " state=" + context.State.ToString() +
                " expected=" + (expected ? "true" : "false");
            LogLifecycle("target_termination_observed", detail);

            if (!expected)
            {
                // WMP may have died before ml_engine_stop could restore AVOC.
                // The supervisor is a separate process, so it can still issue
                // the source and global full-off requests after the player dies.
                ForceGameModeFullOff("unexpected WMP process termination");
                try
                {
                    var notification = new Bundle();
                    notification.AddItem("protocol", "moonlight-wmp/1");
                    notification.AddItem("type", "event");
                    notification.AddItem("event", "wmpSupervisorTerminated");
                    notification.AddItem("detail", detail);
                    if (_port == null)
                        throw new InvalidOperationException("supervisor MessagePort is unavailable");
                    _port.Send(notification, WebAppId, ReplyPortName, true);
                    LogLifecycle("unexpected_termination_forwarded", "targetPid=" +
                        context.ProcessId.ToString(CultureInfo.InvariantCulture));
                }
                catch (Exception ex)
                {
                    Log.Error("WMP_SUPERVISOR could_not_forward_termination " + ex);
                }
            }
            else
            {
                LogLifecycle("expected_termination_suppressed", detail);
            }

            ThreadPool.QueueUserWorkItem(delegate(object state)
            {
                // Give an AVOC call that outlived the first bounded wait a
                // further opportunity to finish before this supervisor exits.
                Thread cleanup = _avocCleanupThread;
                if (cleanup != null && !cleanup.Join(5000))
                {
                    LogLifecycle("avoc_full_off_exit_timeout",
                        "additional_wait_ms=5000; supervisor is exiting with cleanup unresolved");
                }
                Thread.Sleep(250);
                try
                {
                    ServiceApplication app;
                    lock (Gate) app = _application;
                    if (app != null) app.Exit();
                }
                catch (Exception ex)
                {
                    Log.Error("WMP_SUPERVISOR exit_after_target_termination_failed " + ex);
                }
            });
        }

        internal static void ReportUnhandledProcessException(object exceptionObject)
        {
            Log.Error("WMP_SUPERVISOR unhandled_process_exception " +
                (exceptionObject == null ? "unknown" : exceptionObject.ToString()));
        }

        internal static void Shutdown()
        {
            lock (Gate)
            {
                if (!_started) return;
                _started = false;
                CancelStartupWatchdogLocked();
            }

            LogLifecycle("on_terminate_enter", null);
            try { ApplicationManager.ApplicationTerminated -= OnApplicationTerminated; }
            catch (Exception ex) { Log.Error("WMP_SUPERVISOR listener_remove_failed " + ex); }

            if (_port != null)
            {
                try { _port.MessageReceived -= OnControlMessage; } catch { }
                try { _port.StopListening(); } catch (Exception ex) {
                    Log.Error("WMP_SUPERVISOR port_stop_failed " + ex);
                }
                try { _port.Dispose(); } catch (Exception ex) {
                    Log.Error("WMP_SUPERVISOR port_dispose_failed " + ex);
                }
                _port = null;
            }

            lock (Gate) _application = null;
            LogLifecycle("shutdown_complete", null);
        }
    }
}
