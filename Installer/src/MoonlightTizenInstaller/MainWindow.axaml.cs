using Avalonia.Controls;
using Avalonia.Markup.Xaml;
using Avalonia.Threading;
using MoonlightTizenInstaller.Core.Certificates;
using MoonlightTizenInstaller.Core.Network;
using MoonlightTizenInstaller.Core.Installation;
using Apps2Samsung.Interfaces;
using Apps2Samsung.Models;

namespace MoonlightTizenInstaller;

public sealed partial class MainWindow : Window
{
    private readonly CertificateManager _certificates;
    private readonly TelevisionDiscoveryService _discovery;
    private readonly TvStoreInstallationService _tvStoreInstaller = new();
    private readonly string _bundledWgtPath = Path.Combine(AppContext.BaseDirectory, "Moonlight.wgt");
    private string? _selectedDuid;
    private string? _selectedTvIp;
    private bool _discoveryInProgress;

    public MainWindow(CertificateManager certificates, TelevisionDiscoveryService discovery)
    {
        _certificates = certificates;
        _discovery = discovery;
        InitializeComponent();
        Opened += async (_, _) =>
        {
            if (!await EnsureBundledWgtAvailableAsync())
                return;

            RefreshCertificateStatus();
            await DiscoverTelevisionsAsync();
        };
    }

    private void InitializeComponent() => AvaloniaXamlLoader.Load(this);

    private async Task<bool> EnsureBundledWgtAvailableAsync()
    {
        try
        {
            if (File.Exists(_bundledWgtPath) && new FileInfo(_bundledWgtPath).Length > 0)
                return true;
        }
        catch
        {
            // Treat inaccessible or invalid package resources as a missing mandatory resource.
        }

        var message = new TextBlock
        {
            Text = "No se encuentra el paquete Moonlight.wgt necesario para ejecutar este instalador.\n\nLa distribución está incompleta o dañada. Descarga de nuevo el instalador.",
            TextWrapping = Avalonia.Media.TextWrapping.Wrap,
            Margin = new Avalonia.Thickness(20)
        };
        var closeButton = new Button
        {
            Content = "Aceptar",
            HorizontalAlignment = Avalonia.Layout.HorizontalAlignment.Right,
            MinWidth = 100,
            Margin = new Avalonia.Thickness(20, 0, 20, 20)
        };
        var dialog = new Window
        {
            Title = "No se puede iniciar Moonlight Tizen Installer",
            Width = 480,
            SizeToContent = Avalonia.Controls.SizeToContent.Height,
            CanResize = false,
            WindowStartupLocation = WindowStartupLocation.CenterOwner,
            Content = new StackPanel
            {
                Children = { message, closeButton }
            }
        };
        closeButton.Click += (_, _) => dialog.Close();
        await dialog.ShowDialog(this);
        Close();
        return false;
    }

    private async void OnDiscoverTelevisionsClick(object? sender, Avalonia.Interactivity.RoutedEventArgs e) =>
        await DiscoverTelevisionsAsync();

    private async Task DiscoverTelevisionsAsync()
    {
        if (_discoveryInProgress)
            return;

        _discoveryInProgress = true;
        _selectedDuid = null;
        _selectedTvIp = null;
        SetTelevisionActionsEnabled(false);
        var searching = this.FindControl<StackPanel>("TelevisionSearchingPanel");
        var activation = this.FindControl<StackPanel>("TelevisionActivationPanel");
        var selectionPanel = this.FindControl<StackPanel>("TelevisionSelectionPanel");
        var selector = this.FindControl<ComboBox>("TelevisionSelection");
        var retry = this.FindControl<Button>("RetryTelevisionDiscoveryButton");
        var status = this.FindControl<TextBlock>("TelevisionDiscoveryStatus");
        var searchStatus = this.FindControl<TextBlock>("TelevisionSearchStatus");

        if (searching is not null) searching.IsVisible = true;
        if (activation is not null) activation.IsVisible = false;
        if (selectionPanel is not null) selectionPanel.IsVisible = false;
        if (selector is not null)
        {
            selector.ItemsSource = null;
            selector.SelectedItem = null;
        }
        if (retry is not null) retry.IsEnabled = false;
        if (status is not null) status.Text = string.Empty;
        if (searchStatus is not null) searchStatus.Text = "Buscando televisores y comprobando la conexión SDB…";

        try
        {
            var progress = new Progress<string>(message =>
            {
                if (searchStatus is not null) searchStatus.Text = message;
            });
            var devices = await _discovery.DiscoverAsync(progress);

            if (devices.Count == 0)
            {
                ShowDeveloperModeInstructions(
                    "No se ha podido detectar ninguna TV con Developer Mode y conexión SDB activos.");
                return;
            }

            if (devices.Count == 1)
            {
                SelectTelevision(devices[0]);
                return;
            }

            if (selector is not null)
            {
                selector.ItemsSource = devices;
                selector.SelectedIndex = -1;
            }
            if (searching is not null) searching.IsVisible = false;
            if (selectionPanel is not null) selectionPanel.IsVisible = true;
            if (status is not null)
                status.Text = $"Se han detectado {devices.Count} televisores. Es necesario seleccionar uno para continuar.";
        }
        catch (OperationCanceledException)
        {
            ShowDeveloperModeInstructions("La búsqueda no se ha completado. Comprueba la configuración de Developer Mode y vuelve a intentarlo.");
        }
        catch (Exception ex)
        {
            ShowDeveloperModeInstructions($"No se ha podido completar la detección ({ex.Message}). Comprueba la configuración de Developer Mode y vuelve a intentarlo.");
        }
        finally
        {
            _discoveryInProgress = false;
            if (retry is not null) retry.IsEnabled = true;
        }
    }

    private void ShowDeveloperModeInstructions(string message)
    {
        if (this.FindControl<StackPanel>("TelevisionSearchingPanel") is { } searching)
            searching.IsVisible = false;
        if (this.FindControl<StackPanel>("TelevisionSelectionPanel") is { } selection)
            selection.IsVisible = false;
        if (this.FindControl<StackPanel>("TelevisionActivationPanel") is { } activation)
            activation.IsVisible = true;
        if (this.FindControl<TextBlock>("TelevisionDiscoveryStatus") is { } status)
            status.Text = message;
        if (this.FindControl<TextBlock>("HostIpAddress") is { } hostIp)
            hostIp.Text = _discovery.GetHostIpv4Address() ?? "No se ha podido determinar una IPv4 privada";
    }

    private void SelectTelevision(DiscoveredTelevision device)
    {
        _selectedDuid = device.Duid;
        _selectedTvIp = device.IpAddress;
        if (this.FindControl<StackPanel>("TelevisionSearchingPanel") is { } searching)
            searching.IsVisible = false;
        if (this.FindControl<StackPanel>("TelevisionActivationPanel") is { } activation)
            activation.IsVisible = false;
        if (this.FindControl<StackPanel>("TelevisionSelectionPanel") is { } selection)
            selection.IsVisible = false;
        if (this.FindControl<TextBlock>("TelevisionDiscoveryStatus") is { } status)
            status.Text = $"Conexión SDB verificada: {device.DisplayName}. DUID: {device.Duid}";
        SetTelevisionActionsEnabled(true);
    }

    private void OnTelevisionSelectionChanged(object? sender, SelectionChangedEventArgs e)
    {
        if (this.FindControl<ComboBox>("TelevisionSelection")?.SelectedItem is DiscoveredTelevision selected)
        {
            _selectedDuid = selected.Duid;
            _selectedTvIp = selected.IpAddress;
            if (this.FindControl<TextBlock>("TelevisionDiscoveryStatus") is { } status)
                status.Text = $"Televisor seleccionado: {selected.DisplayName}. DUID: {selected.Duid}";
            SetTelevisionActionsEnabled(true);
        }
        else
        {
            _selectedDuid = null;
            _selectedTvIp = null;
            SetTelevisionActionsEnabled(false);
        }
    }

    private void SetTelevisionActionsEnabled(bool enabled)
    {
        if (this.FindControl<Button>("EnsureCertificateButton") is { } ensure)
            ensure.IsEnabled = enabled && !_discoveryInProgress;
        if (this.FindControl<Button>("SignWgtButton") is { } sign)
            sign.IsEnabled = enabled && !_discoveryInProgress;
        if (this.FindControl<Button>("InstallWgtButton") is { } install)
            install.IsEnabled = _selectedTvIp is not null && !_discoveryInProgress;
    }

    private string? GetSelectedDuid() => _selectedDuid;

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
                status.Text = "Es necesario detectar y seleccionar una TV con conexión SDB válida.";
            return;
        }

        if (button is not null) button.IsEnabled = false;
        if (status is not null) status.Text = "Comprobando el perfil existente…";

        try
        {
            var profile = await _certificates.EnsureForTelevisionAsync(
                duid,
                level,
                progress: message => Dispatcher.UIThread.Post(() =>
                {
                    if (status is not null) status.Text = message;
                }));

            if (status is not null)
                status.Text = $"Perfil preparado: {profile.ProfileName}{Environment.NewLine}Autor: {profile.AuthorP12}{Environment.NewLine}Distribuidor: {profile.DistributorP12}";
            RefreshCertificateStatus();
        }
        catch (OperationCanceledException)
        {
            if (status is not null) status.Text = "Operación cancelada.";
        }
        catch (Exception ex)
        {
            if (status is not null) status.Text = $"No se pudo preparar el certificado: {ex.Message}";
        }
        finally
        {
            if (button is not null) button.IsEnabled = _selectedDuid is not null;
        }
    }

    private async void OnSignWgtClick(object? sender, Avalonia.Interactivity.RoutedEventArgs e)
    {
        var duid = GetSelectedDuid();
        const CertificatePrivilegeLevel level = CertificatePrivilegeLevel.Partner;

        if (string.IsNullOrWhiteSpace(duid) || !TizenDuid.IsValid(duid))
        {
            SetOperationStatus("Es necesario detectar y seleccionar una TV con conexión SDB válida.");
            return;
        }

        try
        {
            var outputDialog = new SaveFileDialog
            {
                Title = "Guardar WGT firmado",
                InitialFileName = "Moonlight-signed.wgt",
                Filters = { new FileDialogFilter { Name = "Paquete Tizen", Extensions = { "wgt" } } }
            };
            var output = await outputDialog.ShowAsync(this);
            if (string.IsNullOrWhiteSpace(output)) return;

            var button = this.FindControl<Button>("SignWgtButton");
            if (button is not null) button.IsEnabled = false;
            SetOperationStatus("Comprobando o preparando el perfil de firma…");

            var profile = await _certificates.EnsureForTelevisionAsync(
                duid,
                level,
                progress: message => Dispatcher.UIThread.Post(() => SetOperationStatus(message)));

            var signedPath = await _certificates.SignWgtAsync(
                _bundledWgtPath,
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
            if (this.FindControl<Button>("SignWgtButton") is { } sign)
                sign.IsEnabled = _selectedDuid is not null;
        }
    }

    private async void OnInstallWgtClick(object? sender, Avalonia.Interactivity.RoutedEventArgs e)
    {
        var televisionIp = _selectedTvIp;
        if (string.IsNullOrWhiteSpace(televisionIp))
        {
            SetOperationStatus("Es necesario seleccionar un televisor.");
            return;
        }

        var button = this.FindControl<Button>("InstallWgtButton");
        if (button is not null) button.IsEnabled = false;

        try
        {
            SetOperationStatus("Preparando el envío a Apps2Samsung TV-Store…");
            var result = await _tvStoreInstaller.SendForInstallationAsync(
                televisionIp,
                _bundledWgtPath,
                new Progress<string>(message => Dispatcher.UIThread.Post(() => SetOperationStatus(message))));

            SetOperationStatus(
                $"Moonlight.wgt se ha transferido a TV-Store ({result.Size:N0} bytes; SHA-256 verificado)." +
                Environment.NewLine +
                (result.TvStoreOpened
                    ? "Mira la pantalla del televisor y confirma la instalación pulsando «Instalar»."
                    : "Abre Apps2Samsung TV-Store en el televisor y confirma la instalación pulsando «Instalar».") +
                Environment.NewLine +
                "TV-Store realizará la firma con el certificado que tenga configurado.");
        }
        catch (OperationCanceledException)
        {
            SetOperationStatus("Envío cancelado.");
        }
        catch (Exception ex)
        {
            SetOperationStatus($"No se pudo enviar Moonlight a TV-Store: {ex.Message}");
        }
        finally
        {
            if (button is not null)
                button.IsEnabled = _selectedTvIp is not null && !_discoveryInProgress;
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
            if (string.IsNullOrWhiteSpace(path)) return;

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
            if (files is not { Length: > 0 }) return;

            await using var stream = File.OpenRead(files[0]);
            var preview = _certificates.PreviewImport(stream);
            if (preview.IsEmpty)
                throw new InvalidDataException("El archivo no contiene perfiles de firma.");

            var accepted = await ConfirmImportAsync(preview.Profiles.Count);
            if (!accepted) return;

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
        if (this.FindControl<TextBlock>("CertificateOperationStatus") is { } status)
            status.Text = message;
    }
}