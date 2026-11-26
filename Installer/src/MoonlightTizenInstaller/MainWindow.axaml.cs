using Avalonia.Controls;
using Avalonia.Markup.Xaml;
using MoonlightTizenInstaller.Core.Certificates;

namespace MoonlightTizenInstaller;

public sealed partial class MainWindow : Window
{
    private readonly CertificateManager _certificates;

    public MainWindow(CertificateManager certificates)
    {
        _certificates = certificates;
        InitializeComponent();
        RefreshCertificateStatus();
    }

    private void InitializeComponent() => AvaloniaXamlLoader.Load(this);

    private void RefreshCertificateStatus()
    {
        var profiles = _certificates.GetRecoverableProfiles();
        var status = this.FindControl<TextBlock>("CertificateStatus");
        if (status is null)
            return;

        status.Text = profiles.Count == 0
            ? "No hay perfiles de firma recuperables en este equipo."
            : string.Join(Environment.NewLine, profiles.Select(profile =>
                $"{profile.ProfileName} — válido hasta {profile.NotAfterUtc:yyyy-MM-dd} — {profile.Duids.Count} TV(s)"));
    }

    private async void OnExportCertificatesClick(object? sender, Avalonia.Interactivity.RoutedEventArgs e)
    {
        var dialog = new SaveFileDialog
        {
            Title = "Exportar certificados Moonlight Tizen",
            InitialFileName = "moonlight-tizen-certificates.a2scert",
            Filters = { new FileDialogFilter { Name = "Perfiles de certificados", Extensions = { "a2scert" } } }
        };
        var path = await dialog.ShowAsync(this);
        if (string.IsNullOrWhiteSpace(path))
            return;

        await using var stream = File.Create(path);
        _certificates.ExportProfiles(stream);
        RefreshCertificateStatus();
    }

    private async void OnImportCertificatesClick(object? sender, Avalonia.Interactivity.RoutedEventArgs e)
    {
        var dialog = new OpenFileDialog
        {
            Title = "Recuperar certificados Moonlight Tizen",
            AllowMultiple = false,
            Filters = { new FileDialogFilter { Name = "Perfiles de certificados", Extensions = { "a2scert", "zip" } } }
        };
        var files = await dialog.ShowAsync(this);
        if (files is not { Length: > 0 })
            return;

        await using var stream = File.OpenRead(files[0]);
        var preview = _certificates.PreviewImport(stream);
        if (preview.IsEmpty)
            throw new InvalidDataException("El archivo no contiene perfiles de firma.");

        var confirmation = new Window
        {
            Title = "Confirmar recuperación",
            Width = 480,
            Height = 220,
            WindowStartupLocation = WindowStartupLocation.CenterOwner,
            Content = new StackPanel
            {
                Margin = new Avalonia.Thickness(20),
                Spacing = 12,
                Children =
                {
                    new TextBlock { Text = $"Se recuperarán {preview.Profiles.Count} perfil(es). Los perfiles del mismo nombre serán sustituidos.", TextWrapping = Avalonia.Media.TextWrapping.Wrap },
                    new Button { Content = "Continuar", HorizontalAlignment = Avalonia.Layout.HorizontalAlignment.Right }
                }
            }
        };
        var accepted = false;
        if (confirmation.Content is StackPanel panel && panel.Children[1] is Button button)
            button.Click += (_, _) => { accepted = true; confirmation.Close(); };
        await confirmation.ShowDialog(this);
        if (!accepted)
            return;

        stream.Position = 0;
        _certificates.ImportProfiles(stream);
        RefreshCertificateStatus();
    }
}
