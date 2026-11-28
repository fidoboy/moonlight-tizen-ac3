using Avalonia;

namespace MoonlightTizenInstaller;

internal static class Program
{
    private const string GlxBlacklistOverride = "AVALONIA_GLX_IGNORE_RENDERER_BLACKLIST";

    private static readonly string StartupErrorLogPath = Path.Combine(
        Path.GetTempPath(),
        "MoonlightTizenInstaller-startup-error.log");

    [STAThread]
    public static void Main(string[] args)
    {
        ConfigureLinuxOpenGlCompatibility();

        AppDomain.CurrentDomain.UnhandledException += (_, eventArgs) =>
            WriteStartupError(eventArgs.ExceptionObject as Exception);

        TaskScheduler.UnobservedTaskException += (_, eventArgs) =>
        {
            WriteStartupError(eventArgs.Exception);
            eventArgs.SetObserved();
        };

        try
        {
            BuildAvaloniaApp().StartWithClassicDesktopLifetime(args);
        }
        catch (Exception exception)
        {
            WriteStartupError(exception);
            throw;
        }
    }

    private static void ConfigureLinuxOpenGlCompatibility()
    {
        if (OperatingSystem.IsLinux() &&
            Environment.GetEnvironmentVariable(GlxBlacklistOverride) is null)
        {
            Environment.SetEnvironmentVariable(GlxBlacklistOverride, "1");
        }
    }

    private static void WriteStartupError(Exception? exception)
    {
        if (exception is null)
            return;

        try
        {
            File.AppendAllText(
                StartupErrorLogPath,
                $"[{DateTimeOffset.Now:O}]{Environment.NewLine}{exception}{Environment.NewLine}{Environment.NewLine}");
        }
        catch
        {
            // Diagnostics must never replace the original startup exception.
        }
    }

    public static AppBuilder BuildAvaloniaApp() =>
        AppBuilder.Configure<App>()
            .UsePlatformDetect()
            .WithInterFont()
            .LogToTrace();
}
