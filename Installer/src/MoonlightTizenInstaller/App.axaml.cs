using Avalonia;
using Avalonia.Controls.ApplicationLifetimes;
using Avalonia.Markup.Xaml;
using MoonlightTizenInstaller.Core.Certificates;
using MoonlightTizenInstaller.Core.Network;

namespace MoonlightTizenInstaller;

public sealed class App : Application
{
    private string? _sessionDirectory;

    public CertificateManager? Certificates { get; private set; }

    public override void Initialize() => AvaloniaXamlLoader.Load(this);

    public override void OnFrameworkInitializationCompleted()
    {
        if (ApplicationLifetime is IClassicDesktopStyleApplicationLifetime desktop)
        {
            // Only certificate profiles/backups are persistent. SDB keys and all other
            // operational state live in a unique temporary directory for this process.
            var certificateDirectory = Path.Combine(
                Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
                "MoonlightTizenInstaller",
                "certificates");

            _sessionDirectory = Path.Combine(
                Path.GetTempPath(),
                "MoonlightTizenInstaller",
                Guid.NewGuid().ToString("N"));

            Directory.CreateDirectory(_sessionDirectory);

            var caDirectory = Path.Combine(AppContext.BaseDirectory, "certificate-authorities");
            Certificates = new CertificateManager(
                new CertificateInstallerOptions(certificateDirectory, caDirectory));

            var discovery = new TelevisionDiscoveryService(Path.Combine(_sessionDirectory, "sdb"));
            desktop.MainWindow = new MainWindow(Certificates, discovery);
            desktop.Exit += (_, _) => CleanupSessionFiles();
        }

        base.OnFrameworkInitializationCompleted();
    }

    private void CleanupSessionFiles()
    {
        if (string.IsNullOrWhiteSpace(_sessionDirectory))
            return;

        try
        {
            if (Directory.Exists(_sessionDirectory))
                Directory.Delete(_sessionDirectory, recursive: true);

            var parent = Path.GetDirectoryName(_sessionDirectory);
            if (parent is not null &&
                Directory.Exists(parent) &&
                !Directory.EnumerateFileSystemEntries(parent).Any())
                Directory.Delete(parent);
        }
        catch
        {
            // Best-effort cleanup: never block application shutdown.
        }
        finally
        {
            _sessionDirectory = null;
        }
    }
}
