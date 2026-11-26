using Avalonia;
using Avalonia.Controls.ApplicationLifetimes;
using Avalonia.Markup.Xaml;
using MoonlightTizenInstaller.Core.Certificates;
using MoonlightTizenInstaller.Core.Network;

namespace MoonlightTizenInstaller;

public sealed class App : Application
{
    public CertificateManager? Certificates { get; private set; }

    public override void Initialize() => AvaloniaXamlLoader.Load(this);

    public override void OnFrameworkInitializationCompleted()
    {
        if (ApplicationLifetime is IClassicDesktopStyleApplicationLifetime desktop)
        {
            var dataDirectory = Path.Combine(
                Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
                "MoonlightTizenInstaller");
            var caDirectory = Path.Combine(AppContext.BaseDirectory, "certificate-authorities");

            Certificates = new CertificateManager(
                new CertificateInstallerOptions(dataDirectory, caDirectory));

            var discovery = new TelevisionDiscoveryService(Path.Combine(dataDirectory, "sdb"));
            desktop.MainWindow = new MainWindow(Certificates, discovery);
        }

        base.OnFrameworkInitializationCompleted();
    }
}
