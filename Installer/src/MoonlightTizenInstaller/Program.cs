using System.Diagnostics;
using Avalonia;

namespace MoonlightTizenInstaller;

internal static class Program
{
    private const string GlxBlacklistOverride = "AVALONIA_GLX_IGNORE_RENDERER_BLACKLIST";
    private const string DiagnosticLogEnvironmentVariable = "MOONLIGHT_INSTALLER_DIAGNOSTIC_LOG";

    private static readonly string DiagnosticLogPath =
        Environment.GetEnvironmentVariable(DiagnosticLogEnvironmentVariable)
        ?? Path.Combine(Path.GetTempPath(), "MoonlightTizenInstaller-avalonia.log");

    private static readonly string StartupErrorLogPath = Path.Combine(
        Path.GetTempPath(),
        "MoonlightTizenInstaller-startup-error.log");

    [STAThread]
    public static void Main(string[] args)
    {
        InitializeDiagnostics();
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

    private static void InitializeDiagnostics()
    {
        try
        {
            Directory.CreateDirectory(Path.GetDirectoryName(DiagnosticLogPath)!);
            Trace.Listeners.Add(new TextWriterTraceListener(DiagnosticLogPath));
            Trace.AutoFlush = true;
            Trace.WriteLine($"[{DateTimeOffset.Now:O}] Moonlight Tizen Installer starting.");
            Trace.WriteLine($"OS: {Environment.OSVersion}; Architecture: {System.Runtime.InteropServices.RuntimeInformation.ProcessArchitecture}");
            Trace.WriteLine($"Avalonia diagnostics enabled. Log: {DiagnosticLogPath}");
        }
        catch (Exception exception)
        {
            Console.Error.WriteLine($"Unable to initialize diagnostic log: {exception}");
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
            var diagnostic = $"[{DateTimeOffset.Now:O}]{Environment.NewLine}{exception}{Environment.NewLine}{Environment.NewLine}";
            File.AppendAllText(StartupErrorLogPath, diagnostic);
            Trace.WriteLine(diagnostic);
            Trace.Flush();
        }
        catch
        {
            // Diagnostics must never replace the original startup exception.
        }
    }

    public static AppBuilder BuildAvaloniaApp() =>
        AppBuilder.Configure<App>()
            .UsePlatformDetect()
            .With(new X11PlatformOptions { WmClass = "moonlight-tizen-installer" })
            .With(new AvaloniaNativePlatformOptions
            {
                // StarFieldControl uses OpenGlControlBase, so macOS must provide an OpenGL context.
                // Keep software rendering as a fallback for systems where OpenGL cannot initialize.
                RenderingMode = new[]
                {
                    AvaloniaNativeRenderingMode.OpenGl,
                    AvaloniaNativeRenderingMode.Software
                }
            })
            .With(new MacOSPlatformOptions { ShowInDock = true })
            .WithInterFont()
            .LogToTrace();
}
