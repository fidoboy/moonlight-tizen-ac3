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
                    Path.Combine(Tizen.Applications.DirectoryInfo.Resource, "lib", "libmlengine.so")
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

            // Always expose the control port, even when the engine or ESPlus
            // runtime is unavailable, so the WebApp can obtain a useful status.
            try
            {
                HostProtocol.Start(_engine, probeState, family, loadError);
                Log.Info("WMP .NET service control port initialized");
            }
            catch (Exception ex)
            {
                Log.Error("WMP control port initialization failed: " + ex);
            }
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
