using Avalonia.Controls;
using Avalonia.Markup.Xaml;
using Avalonia.Threading;
using MoonlightTizenInstaller.Core.Certificates;
using MoonlightTizenInstaller.Core.Network;
using Apps2Samsung.Interfaces;
using Apps2Samsung.Models;

namespace MoonlightTizenInstaller;

public sealed partial class MainWindow : Window
{
    private readonly CertificateManager _certificates;
    private readonly TelevisionDiscoveryService _discovery;

    public MainWindow(CertificateManager certificates, TelevisionDiscoveryService discovery)
    {
        _certificates = certificates;
        _discovery = discovery;
        InitializeComponent();
        RefreshCertificateStatus();
        Opened += async (_, _) => await DiscoverTelevisionsAsync();
    }

    private void InitializeComponent() => AvaloniaXamlLoader.Load(this);

    private async void OnDiscoverTelevisionsClick(object? sender, Avalonia.Interactivity.RoutedEventArgs e) =>
        await DiscoverTelevisionsAsync();

    private async Task DiscoverTelevisionsAsync()
    {
        var button = this.FindControl<Button>("DiscoverTelevisionsButton");
        var status = this.FindControl<TextBlock>("TelevisionDiscoveryStatus");
        var selector = this.FindControl<ComboBox>("TelevisionSelection");
        var duidBox = this.FindControl<TextBox>("TelevisionDuid");
        if (button is not null) button.IsEnabled = false;
        if (status is not null) status.Text = "Buscando televisores y leyendo sus DUID…";
        if (selector is not null)
        {
            selector.IsVisible = false;
            selector.ItemsSource = null;
            selector.SelectedItem = null;
        }
        if (duidBox is not null)
        {
            duidBox.IsVisible = true;
            duidBox.IsReadOnly = false;
            duidBox.Text = string.Empty;
        }

        try
        {
            var progress = new Progress<string>(message =>
            {
                if (status is not null) status.Text = message;
            });
            var devices = await _discovery.DiscoverAsync(progress);
            if (devices.Count == 0)
            {
                if (status is not null)
                    status.Text = "No se han detectado televisores con el puerto SDB disponible. Puedes introducir el DUID manualmente.";
                return;
            }

            if (devices.Count == 1)
            {
                var device = devices[0];
                if (duidBox is not null)
                {
                    duidBox.Text = device.Duid;
                    duidBox.IsReadOnly = true;
                }
                if (status is not null)
                    status.Text = $"Televisor detectado: {device.DisplayName}";
                return;
            }

            if (selector is not null)
            {
                selector.ItemsSource = devices;
                selector.SelectedIndex = 0;
                selector.IsVisible = true;
            }
            if (duidBox is not null)
                duidBox.IsVisible = false;
            if (status is not null)
                status.Text = $"Se han detectado {devices.Count} televisores. Selecciona el que quieras utilizar.";
            UpdateSelectedTelevisionDuid();
        }
        catch (OperationCanceledException)
        {
            if (status is not null) status.Text = "Búsqueda cancelada.";
        }
        catch (Exception ex)
        {
            if (status is not null)
                status.Text = $"No se pudo completar la detección: {ex.Message}. Puedes introducir el DUID manualmente.";
        }
        finally
        {
            if (button is not null) button.IsEnabled = true;
        }
    }

    private void OnTelevisionSelectionChanged(object? sender, SelectionChangedEventArgs e) =>
        UpdateSelectedTelevisionDuid();

    private void UpdateSelectedTelevisionDuid()
    {
        if (this.FindControl<ComboBox>("TelevisionSelection")?.SelectedItem is not DiscoveredTelevision selected)
            return;
        var status = this.FindControl<TextBlock>("TelevisionDiscoveryStatus");
        if (status is not null)
            status.Text = $"Televisor seleccionado: {selected.DisplayName}";
    }

    private string? GetSelectedDuid()
    {
        if (this.FindControl<ComboBox>("TelevisionSelection")?.IsVisible == true &&
            this.FindControl<ComboBox>("TelevisionSelection")?.SelectedItem is DiscoveredTelevision selected)
            return selected.Duid;
        return this.FindControl<TextBox>("TelevisionDuid")?.Text?.Trim();
    }

    private void RefreshCertificateStatus()
    {
        var status = this.FindControl<TextBlock>("CertificateStatus");
        if (status is null)
            return;

        try
        {
            var profiles = _certificates.GetRecoverableProfiles();
            status.Text = profiles.Count == 0
                ? "No hay perfiles de firma recuperables en este equipo."
                : string.Join(Environment.NewLine, profiles.Select(profile =>
                    $"{profile.ProfileName} — válido hasta {profile.NotAfterUtc:yyyy-MM-dd} — {profile.Duids.Count} TV(s)"));
        }
        catch (Exception ex)
        {
            status.Text = $"No se pudo acceder al almacén seguro de contraseñas del sistema: {ex.Message}";
        }
    }

    private async void OnEnsureCertificateClick(object? sender, Avalonia.Interactivity.RoutedEventArgs e)
    {
        var duid = GetSelectedDuid();
        const CertificatePrivilegeLevel level = CertificatePrivilegeLevel.Partner;
        var status = this.FindControl<TextBlock>("CertificateOperationStatus");
        var button = this.FindControl<Button>("EnsureCertificateButton");

        if (string.IsNullOrWhiteSpace(duid) || !TizenDuid.IsValid(duid))
        {
            if (status is not null)
                status.Text = "Introduce un DUID válido del televisor (entre 10 y 64 caracteres alfanuméricos).";
            return;
        }

        if (button is not null)
            button.IsEnabled = false;
        if (status is not null)
            status.Text = "Comprobando el perfil existente…";

        try
        {
            var profile = await _certificates.EnsureForTelevisionAsync(
                duid,
                level,
                progress: message => Dispatcher.UIThread.Post(() =>
                {
                    if (status is not null)
                        status.Text = message;
                }));

            if (status is not null)
                status.Text = $"Perfil preparado: {profile.ProfileName}{Environment.NewLine}Autor: {profile.AuthorP12}{Environment.NewLine}Distribuidor: {profile.DistributorP12}";
            RefreshCertificateStatus();
        }
        catch (OperationCanceledException)
        {
            if (status is not null)
                status.Text = "Operación cancelada.";
        }
        catch (Exception ex)
        {
            if (status is not null)
                status.Text = $"No se pudo preparar el certificado: {ex.Message}";
        }
        finally
        {
            if (button is not null)
                button.IsEnabled = true;
        }
    }

    private async void OnSignWgtClick(object? sender, Avalonia.Interactivity.RoutedEventArgs e)
    {
        var duid = GetSelectedDuid();
        const CertificatePrivilegeLevel level = CertificatePrivilegeLevel.Partner;
        var status = this.FindControl<TextBlock>("CertificateOperationStatus");
        var button = this.FindControl<Button>("SignWgtButton");

        if (string.IsNullOrWhiteSpace(duid) || !TizenDuid.IsValid(duid))
        {
            SetOperationStatus("Introduce primero un DUID válido del televisor.");
            return;
        }

        try
        {
            var inputDialog = new OpenFileDialog
            {
                Title = "Seleccionar WGT que se va a firmar",
                AllowMultiple = false,
                Filters = { new FileDialogFilter { Name = "Paquete Tizen", Extensions = { "wgt" } } }
            };
            var inputs = await inputDialog.ShowAsync(this);
            if (inputs is not { Length: > 0 })
                return;

            var outputDialog = new SaveFileDialog
            {
                Title = "Guardar WGT firmado",
                InitialFileName = Path.GetFileNameWithoutExtension(inputs[0]) + "-signed.wgt",
                Filters = { new FileDialogFilter { Name = "Paquete Tizen", Extensions = { "wgt" } } }
            };
            var output = await outputDialog.ShowAsync(this);
            if (string.IsNullOrWhiteSpace(output))
                return;

            if (button is not null)
                button.IsEnabled = false;
            SetOperationStatus("Comprobando o preparando el perfil de firma…");

            var profile = await _certificates.EnsureForTelevisionAsync(
                duid,
                level,
                progress: message => Dispatcher.UIThread.Post(() => SetOperationStatus(message)));

            var signedPath = await _certificates.SignWgtAsync(
                inputs[0],
                output,
                profile,
                new Progress<string>(message => SetOperationStatus(message)));

            SetOperationStatus($"WGT firmado: {signedPath}");
            RefreshCertificateStatus();
        }
        catch (Exception ex)
        {
            SetOperationStatus($"No se pudo firmar el WGT: {ex.Message}");
        }
        finally
        {
            if (button is not null)
                button.IsEnabled = true;
        }
    }

    private async void OnExportCertificatesClick(object? sender, Avalonia.Interactivity.RoutedEventArgs e)
    {
        try
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
        catch (Exception ex)
        {
            SetOperationStatus($"No se pudieron exportar los certificados: {ex.Message}");
        }
    }

    private async void OnImportCertificatesClick(object? sender, Avalonia.Interactivity.RoutedEventArgs e)
    {
        try
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

            var accepted = await ConfirmImportAsync(preview.Profiles.Count);
            if (!accepted)
                return;

            stream.Position = 0;
            _certificates.ImportProfiles(stream);
            RefreshCertificateStatus();
            SetOperationStatus($"Se han recuperado {preview.Profiles.Count} perfil(es).");
        }
        catch (Exception ex)
        {
            SetOperationStatus($"No se pudieron recuperar los certificados: {ex.Message}");
        }
    }

    private async Task<bool> ConfirmImportAsync(int count)
    {
        var result = false;
        var dialog = new Window
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
                    new TextBlock
                    {
                        Text = $"Se recuperarán {count} perfil(es). Los perfiles del mismo nombre serán sustituidos.",
                        TextWrapping = Avalonia.Media.TextWrapping.Wrap
                    },
                    new StackPanel
                    {
                        Orientation = Avalonia.Layout.Orientation.Horizontal,
                        HorizontalAlignment = Avalonia.Layout.HorizontalAlignment.Right,
                        Spacing = 8,
                        Children =
                        {
                            new Button { Content = "Cancelar" },
                            new Button { Content = "Continuar" }
                        }
                    }
                }
            }
        };

        var buttons = ((StackPanel)((StackPanel)dialog.Content!).Children[1]).Children;
        ((Button)buttons[0]).Click += (_, _) => dialog.Close();
        ((Button)buttons[1]).Click += (_, _) => { result = true; dialog.Close(); };
        await dialog.ShowDialog(this);
        return result;
    }

    private void SetOperationStatus(string message)
    {
        var status = this.FindControl<TextBlock>("CertificateOperationStatus");
        if (status is not null)
            status.Text = message;
    }
}
