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
        if (!OperatingSystem.IsLinux() ||
            Environment.GetEnvironmentVariable(GlxBlacklistOverride) is not null)
        {
            return;
        }

        const string drmPath = "/sys/class/drm";
        if (!Directory.Exists(drmPath))
            return;

        try
        {
            foreach (var cardPath in Directory.EnumerateDirectories(drmPath, "card*"))
            {
                var driverPath = Path.Combine(cardPath, "device", "driver");
                if (!Directory.Exists(driverPath))
                    continue;

                var driver = new DirectoryInfo(driverPath).ResolveLinkTarget(returnFinalTarget: true);
                if (string.Equals(driver?.Name, "vmwgfx", StringComparison.Ordinal))
                {
                    Environment.SetEnvironmentVariable(GlxBlacklistOverride, "1");
                    return;
                }
            }
        }
        catch (IOException)
        {
            // Keep the default Avalonia renderer blacklist if DRM detection is unavailable.
        }
        catch (UnauthorizedAccessException)
        {
            // Keep the default Avalonia renderer blacklist if DRM detection is unavailable.
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
