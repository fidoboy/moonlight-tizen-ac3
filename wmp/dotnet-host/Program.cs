using System;
using System.IO;
using Tizen.Applications;

namespace MoonlightWmpHost
{
    internal sealed class App : ServiceApplication
    {
        private static EngineApi _engine;

        protected override void OnCreate()
        {
            base.OnCreate();
            Log.Info("WMP .NET host process started");

            try
            {
                // Publish the trusted port before the ELF loader runs. The
                // WebApp can connect immediately and observe initialization
                // status instead of racing the service's startup work.
                HostProtocol.Start();
            }
            catch (Exception ex)
            {
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

                Log.Info("Loading engine image: " + enginePath);
                ManualLoader.ManualImage image =
                    ManualLoader.Load(File.ReadAllBytes(enginePath));
                _engine = new EngineApi(image.Resolve);
                // Capture native MLT_TRACE lines from the ESPlus probe onward.
                _engine.EnableStageCallbacks();

                string report;
                probeState = _engine.ProbeEsplus(out family, out report);
                Log.Info("ESPlus probe: " + probeState + ", family=" + family);
                if (!String.IsNullOrEmpty(report))
                    Log.Info(report);
            }
            catch (Exception ex)
            {
                _engine = null;
                loadError = ex.GetType().Name + ": " + ex.Message;
                Log.Error("WMP engine initialization failed: " + ex);
            }

            // Publish the result after the status port is already listening.
            HostProtocol.UpdateEngine(_engine, probeState, family, loadError);
        }

        protected override void OnTerminate()
        {
            Log.Info("WMP .NET host process terminating");
            try
            {
                HostProtocol.Shutdown();
                if (_engine != null)
                {
                    _engine.Stop();
                }
            }
            catch (Exception ex)
            {
                Log.Error("WMP host cleanup failed: " + ex);
            }
            base.OnTerminate();
        }

        private static void Main(string[] args)
        {
            new App().Run(args);
        }
    }
}
