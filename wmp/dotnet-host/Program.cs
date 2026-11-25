using System;
using System.IO;
using System.Globalization;
using System.Diagnostics;
using System.Threading;
using Tizen.Applications;

namespace MoonlightWmpHost
{
    internal sealed class App : ServiceApplication
    {
        private static EngineApi _engine;
        private static App _instance;
        private static readonly object ExitGate = new object();
        private static bool _exitDeferred;
        private static bool _exitPending;
        private static bool _exitRequested;
        private static bool _isSupervisorProcess;

        private static void Lifecycle(string phase, string detail)
        {
            try
            {
                Log.Info("WMP_LIFECYCLE phase=" + phase +
                    " utc=" + DateTime.UtcNow.ToString("o", CultureInfo.InvariantCulture) +
                    " pid=" + Process.GetCurrentProcess().Id.ToString(CultureInfo.InvariantCulture) +
                    " state={" + HostProtocol.GetLifecycleSnapshot() + "}" +
                    " detail=" + (detail ?? String.Empty));
            }
            catch (Exception ex)
            {
                Log.Error("WMP_LIFECYCLE logging failed at " + phase + ": " + ex.Message);
            }
        }

        // Direct Smart Hub launches keep WMP alive after stream termination so
        // Moonlight can still use its native HTTP client to send /cancel and
        // complete the follow-up host refresh. Other launch paths retain the
        // original automatic shutdown behavior.
        internal static void SetExitDeferred(bool deferred)
        {
            lock (ExitGate)
            {
                _exitDeferred = deferred;
                _exitPending = false;
            }
            Lifecycle("exit_deferral_configured", deferred ? "enabled" : "disabled");
        }

        internal static void RequestExitAfterSession()
        {
            bool scheduleExit = false;
            lock (ExitGate)
            {
                if (_exitRequested)
                {
                    Lifecycle("exit_request_ignored_duplicate", null);
                    return;
                }

                if (_exitDeferred)
                {
                    _exitPending = true;
                    Lifecycle("exit_request_deferred", "waiting_for_webapp_release");
                    return;
                }

                _exitRequested = true;
                scheduleExit = true;
            }

            if (scheduleExit) ScheduleExitAfterSession();
        }

        internal static void ReleaseExitAfterSession()
        {
            bool scheduleExit = false;
            lock (ExitGate)
            {
                _exitDeferred = false;
                if (_exitPending && !_exitRequested)
                {
                    _exitRequested = true;
                    scheduleExit = true;
                }
            }

            Lifecycle("exit_deferral_released", scheduleExit
                ? "pending_exit_scheduled" : "no_pending_exit");
            if (scheduleExit) ScheduleExitAfterSession();
        }

        private static void ScheduleExitAfterSession()
        {
            Lifecycle("exit_request_scheduled", "delay_ms=1500");
            HostProtocol.NotifySupervisorExpectedExit("WMP orderly exit requested after session termination");
            ThreadPool.QueueUserWorkItem(delegate(object state)
            {
                Thread.Sleep(1500);
                App app = _instance;
                if (app == null)
                {
                    Lifecycle("exit_request_abandoned", "application_instance_missing");
                    return;
                }
                try
                {
                    Lifecycle("exit_call_begin", null);
                    app.Exit();
                    Lifecycle("exit_call_returned", null);
                }
                catch (Exception ex)
                {
                    Log.Error("WMP service exit request failed: " + ex);
                }
            });
        }

        protected override void OnCreate()
        {
            base.OnCreate();
            string applicationId = Application.Current.ApplicationInfo.ApplicationId;
            _isSupervisorProcess = applicationId == "MoonLightS.WmpSupervisor";
            Lifecycle("on_create_enter", "service_application_started appId=" + applicationId);

            if (_isSupervisorProcess)
            {
                WmpSupervisor.Start(this);
                Lifecycle("supervisor_on_create_complete", null);
                return;
            }

            try
            {
                Lifecycle("control_port_start_begin", null);
                // Publish the trusted port before the ELF loader runs. The
                // WebApp can connect immediately and observe initialization
                // status instead of racing the service's startup work.
                HostProtocol.Start();
                Lifecycle("control_port_start_complete", null);
            }
            catch (Exception ex)
            {
                Lifecycle("control_port_start_failed", ex.ToString());
                Log.Error("WMP control port initialization failed: " + ex);
            }

            string probeState = "library_missing";
            string family = "none";
            string loadError = null;

            try
            {
                string assemblyDirectory = Path.GetDirectoryName(
                    typeof(App).Assembly.Location);
                string[] candidates =
                {
                    Path.Combine(assemblyDirectory, "res", "lib", "libmlengine.so"),
                    Path.Combine(assemblyDirectory, "..", "lib", "libmlengine.so"),
                    Path.Combine(Application.Current.DirectoryInfo.Resource, "lib", "libmlengine.so")
                };

                string enginePath = Array.Find(candidates, File.Exists);
                if (enginePath == null)
                    throw new FileNotFoundException(
                        "libmlengine.so not found. Searched: " +
                        String.Join("; ", candidates));

                Lifecycle("engine_load_begin", "image=" + enginePath);
                ManualLoader.ManualImage image =
                    ManualLoader.Load(File.ReadAllBytes(enginePath));
                _engine = new EngineApi(image.Resolve);
                // Capture native MLT_TRACE lines from the ESPlus probe onward.
                _engine.EnableStageCallbacks();

                Lifecycle("esplus_probe_begin", null);
                string report;
                probeState = _engine.ProbeEsplus(out family, out report);
                Lifecycle("esplus_probe_complete", "state=" + probeState + " family=" + family);
                if (!String.IsNullOrEmpty(report))
                    Log.Info(report);
            }
            catch (Exception ex)
            {
                _engine = null;
                loadError = ex.GetType().Name + ": " + ex.Message;
                Lifecycle("engine_initialization_failed", ex.ToString());
                Log.Error("WMP engine initialization failed: " + ex);
            }

            // Publish the result after the status port is already listening.
            HostProtocol.UpdateEngine(_engine, probeState, family, loadError);
            Lifecycle("on_create_complete", "engine=" + (_engine != null ? "loaded" : "unavailable") +
                " esplus=" + probeState + " family=" + family);
        }

        protected override void OnTerminate()
        {
            Lifecycle("on_terminate_enter", "service_application_termination_callback");
            try
            {
                if (_isSupervisorProcess)
                {
                    WmpSupervisor.Shutdown();
                    Lifecycle("supervisor_shutdown_complete", null);
                }
                else
                {
                    // HostProtocol owns worker, engine, and MessagePort teardown.
                    // Do not stop the engine a second time here.
                    HostProtocol.Shutdown();
                    Lifecycle("host_shutdown_complete", null);
                }
            }
            catch (Exception ex)
            {
                Lifecycle("host_shutdown_failed", ex.ToString());
                Log.Error("WMP host cleanup failed: " + ex);
            }
            Lifecycle("base_on_terminate_begin", null);
            base.OnTerminate();
            Lifecycle("on_terminate_returned", null);
        }

        private static void Main(string[] args)
        {
            Lifecycle("main_enter", "process_start");
            AppDomain.CurrentDomain.ProcessExit += delegate(object sender, EventArgs eventArgs)
            {
                Lifecycle("process_exit_event", "CLR ProcessExit callback");
            };
            AppDomain.CurrentDomain.UnhandledException += delegate(
                object sender, UnhandledExceptionEventArgs eventArgs)
            {
                Lifecycle("unhandled_exception", "isTerminating=" + eventArgs.IsTerminating +
                    " exception=" + (eventArgs.ExceptionObject == null ? "null" :
                    eventArgs.ExceptionObject.GetType().FullName + ": " + eventArgs.ExceptionObject));
                try
                {
                    if (_isSupervisorProcess)
                        WmpSupervisor.ReportUnhandledProcessException(eventArgs.ExceptionObject);
                    else
                        HostProtocol.ReportUnhandledProcessException(eventArgs.ExceptionObject);
                }
                catch (Exception reportError)
                {
                    Log.Error("WMP fatal exception reporting failed: " + reportError);
                }
            };

            _instance = new App();
            Lifecycle("run_enter", "ServiceApplication.Run");
            try
            {
                _instance.Run(args);
                Lifecycle("run_returned", "ServiceApplication.Run returned normally");
            }
            catch (Exception ex)
            {
                Lifecycle("run_threw", ex.ToString());
                throw;
            }
        }
    }
}
