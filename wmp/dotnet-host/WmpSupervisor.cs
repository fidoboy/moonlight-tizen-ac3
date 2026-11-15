using System;
using System.Globalization;
using System.Diagnostics;
using System.Threading;
using Tizen.Applications;
using Tizen.Applications.Messages;

namespace MoonlightWmpHost
{
    // Runs as a separate Tizen ServiceApplication process, using the same
    // signed host assembly but a distinct application ID. Its lifetime is
    // independent from MoonLightS.WmpService.
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

        private static void LogLifecycle(string phase, string detail)
        {
            Log.Info("WMP_SUPERVISOR phase=" + phase +
                " utc=" + DateTime.UtcNow.ToString("o", CultureInfo.InvariantCulture) +
                " pid=" + Process.GetCurrentProcess().Id.ToString(CultureInfo.InvariantCulture) +
                " detail=" + (detail ?? String.Empty));
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
                if (protocol != Protocol || command != "expect_exit")
                {
                    Log.Error("WMP_SUPERVISOR rejected invalid control message");
                    return;
                }

                lock (Gate) _expectedExit = true;
                string detail = message.Contains("detail")
                    ? message.GetItem<string>("detail") : null;
                LogLifecycle("expected_exit_received", detail);
            }
            catch (Exception ex)
            {
                Log.Error("WMP_SUPERVISOR control message failed " + ex);
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
            }

            string detail = "source=ApplicationManager.ApplicationTerminated" +
                " appId=" + context.ApplicationId +
                " pid=" + context.ProcessId.ToString(CultureInfo.InvariantCulture) +
                " state=" + context.State.ToString() +
                " expected=" + (expected ? "true" : "false");
            LogLifecycle("target_termination_observed", detail);

            if (!expected)
            {
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
