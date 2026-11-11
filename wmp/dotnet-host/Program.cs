using Tizen.Applications;

namespace MoonlightWmpHost
{
    internal sealed class App : CoreUIApplication
    {
        protected override void OnCreate()
        {
            base.OnCreate();
            Tizen.Log.Info("MLHOST", "WMP .NET host process started");
        }

        protected override void OnTerminate()
        {
            Tizen.Log.Info("MLHOST", "WMP .NET host process terminating");
            base.OnTerminate();
        }

        private static void Main(string[] args)
        {
            new App().Run(args);
        }
    }
}
