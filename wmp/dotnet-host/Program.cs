using System;
using System.IO;
using Tizen.Applications;

namespace MoonlightWmpHost
{
    internal sealed class App : CoreUIApplication
    {
        private static EngineApi _engine;

        protected override void OnCreate()
        {
            base.OnCreate();
            Log.Info("WMP .NET host process started");

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

                string family;
                string report;
                string probeState = _engine.ProbeEsplus(out family, out report);
                Log.Info("ESPlus probe: " + probeState + ", family=" + family);
                if (!String.IsNullOrEmpty(report))
                    Log.Info(report);
                HostProtocol.Start(_engine, probeState, family);
                Log.Info("WMP engine image, ESPlus probe and trusted control port initialized");
            }
            catch (Exception ex)
            {
                Log.Error("WMP host initialization failed: " + ex);
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
                    _engine.CloseEsplus();
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
