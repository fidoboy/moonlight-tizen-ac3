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
    private readonly SdbInstallationService _sdbInstaller = new();
    private readonly TvStoreHandoffService _tvStoreInstaller = new();
    private readonly string _bundledWgtPath = Path.Combine(AppContext.BaseDirectory, "Moonlight.wgt");
    private string? _selectedDuid;
    private DiscoveredTelevision? _selectedTelevision;
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

    private void InitializeComponent()
    {
        AvaloniaXamlLoader.Load(this);
        if (this.FindControl<Button>("FinishTvStoreHandoffButton") is { } finishButton)
            finishButton.Click += OnFinishTvStoreHandoffClick;
        if (this.FindControl<Button>("ContinueWithSdbButton") is { } sdbFallbackButton)
            sdbFallbackButton.Click += OnContinueWithSdbClick;
    }

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
        _selectedTelevision = null;
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
        if (searchStatus is not null) searchStatus.Text = "Detectando televisores Samsung y comprobando primero la vía de instalación TV-Store…";

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
                    "No se ha detectado ninguna TV Samsung en la red local. Comprueba que está encendida y conectada a la misma red que este equipo. Para continuar será necesario activar Developer Mode y volver a detectar el televisor.");
                return;
            }

            if (devices.Count == 1)
            {
                await SelectTelevisionAsync(devices[0]);
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
            ShowDeveloperModeInstructions("La búsqueda no se ha completado. Comprueba que el televisor está encendido y conectado a la red y vuelve a intentarlo.");
        }
        catch (Exception ex)
        {
            ShowDeveloperModeInstructions($"No se ha podido completar la detección ({ex.Message}). Comprueba la conexión de red y vuelve a intentarlo.");
        }
        finally
        {
            _discoveryInProgress = false;
            SetTelevisionActionsEnabled(_selectedTelevision is not null);
            if (retry is not null) retry.IsEnabled = true;
        }
    }

    private void ShowDeveloperModeInstructions(string message, bool keepSelectionPanel = false)
    {
        if (this.FindControl<StackPanel>("TelevisionSearchingPanel") is { } searching) searching.IsVisible = false;
        if (!keepSelectionPanel && this.FindControl<StackPanel>("TelevisionSelectionPanel") is { } selection) selection.IsVisible = false;
        if (this.FindControl<StackPanel>("TelevisionActivationPanel") is { } activation) activation.IsVisible = true;
        if (this.FindControl<TextBlock>("TelevisionDiscoveryStatus") is { } status) status.Text = message;
        var useRelay = _selectedTelevision?.UsesTvStoreRelay == true;
        if (this.FindControl<TextBlock>("HostIpAddress") is { } hostIp)
            hostIp.Text = _discovery.GetDeveloperModeHostIp(useRelay) ?? "No se ha podido determinar una IPv4 privada";
        if (this.FindControl<TextBlock>("DeveloperModeHostIpDescription") is { } hostIpDescription)
            hostIpDescription.Text = useRelay
                ? "TV-Store ha anunciado un relay SDB activo. Introduce exactamente 127.0.0.1 en Host PC IP:"
                : "Para la conexión SDB directa, introduce la dirección IPv4 de este ordenador en Host PC IP:";
    }

    private async Task SelectTelevisionAsync(DiscoveredTelevision device)
    {
        _selectedTelevision = device;
        _selectedDuid = null;

        if (this.FindControl<StackPanel>("TelevisionSearchingPanel") is { } searching) searching.IsVisible = true;
        if (this.FindControl<StackPanel>("TelevisionSelectionPanel") is { } selection) selection.IsVisible = false;
        if (this.FindControl<StackPanel>("TelevisionActivationPanel") is { } activation) activation.IsVisible = false;
        if (this.FindControl<StackPanel>("TvStoreHandoffPanel") is { } handoffPanel) handoffPanel.IsVisible = false;
        if (this.FindControl<TextBlock>("TelevisionSearchStatus") is { } searchStatus)
            searchStatus.Text = $"Comprobando si TV-Store está instalado y puede recibir Moonlight en {device.IpAddress}…";
        SetTelevisionActionsEnabled(false);

        var progress = new Progress<string>(message =>
            Dispatcher.UIThread.Post(() =>
            {
                if (this.FindControl<TextBlock>("TelevisionSearchStatus") is { } status)
                    status.Text = message;
            }));

        try
        {
            var handoff = await _tvStoreInstaller.TrySendForInstallationAsync(device.IpAddress, _bundledWgtPath, progress);
            if (handoff is not null)
            {
                if (this.FindControl<StackPanel>("TelevisionSearchingPanel") is { } searchingPanel) searchingPanel.IsVisible = false;
                if (this.FindControl<Border>("CertificatePanel") is { } certificatePanel) certificatePanel.IsVisible = false;
                if (this.FindControl<StackPanel>("TelevisionActionsPanel") is { } actionsPanel) actionsPanel.IsVisible = false;
                if (this.FindControl<StackPanel>("TvStoreHandoffPanel") is { } tvStorePanel) tvStorePanel.IsVisible = true;
                if (this.FindControl<TextBlock>("TvStoreHandoffStatus") is { } tvStoreStatus)
                {
                    var launchMessage = handoff.TvStoreOpened
                        ? "TV-Store se ha abierto en el televisor."
                        : "No se ha podido traer TV-Store al primer plano; si no aparece, ábrelo desde el televisor.";
                    tvStoreStatus.Text =
                        $"Moonlight.wgt se ha transferido y su SHA-256 se ha verificado ({handoff.Size:N0} bytes).\n\n" +
                        $"{launchMessage}\n\n" +
                        "En la pantalla del televisor debe aparecer la solicitud de instalación de Moonlight. Selecciona «Instalar» y acepta la confirmación de TV-Store. " +
                        "El instalador no necesita realizar ninguna otra operación por esta vía.";
                }
                return;
            }

            await ContinueWithSdbInstallationAsync(device);

        }
        catch (OperationCanceledException)
        {
            ShowDeveloperModeInstructions("La operación no se ha completado. Comprueba la conexión con el televisor y pulsa Reintentar.");
        }
        catch (Exception ex)
        {
            ShowDeveloperModeInstructions($"No se ha podido completar la instalación mediante TV-Store ni preparar la conexión SDB ({ex.Message}). Comprueba la conexión y pulsa Reintentar.");
        }
        finally
        {
            if (this.FindControl<StackPanel>("TelevisionSearchingPanel") is { } searchingPanel) searchingPanel.IsVisible = false;
        }
    }

    private async Task ContinueWithSdbInstallationAsync(DiscoveredTelevision device)
    {
        _selectedTelevision = device;
        _selectedDuid = null;
        if (this.FindControl<StackPanel>("TvStoreHandoffPanel") is { } handoffPanel) handoffPanel.IsVisible = false;
        if (this.FindControl<Border>("CertificatePanel") is { } certificatePanel) certificatePanel.IsVisible = true;
        if (this.FindControl<StackPanel>("TelevisionActionsPanel") is { } actionsPanel) actionsPanel.IsVisible = true;
        if (this.FindControl<StackPanel>("TelevisionSearchingPanel") is { } searching) searching.IsVisible = true;
        if (this.FindControl<TextBlock>("TelevisionSearchStatus") is { } searchStatus)
            searchStatus.Text = "TV-Store no se va a utilizar. Preparando la instalación directa mediante SDB…";

        var progress = new Progress<string>(message =>
            Dispatcher.UIThread.Post(() =>
            {
                if (this.FindControl<TextBlock>("TelevisionSearchStatus") is { } status)
                    status.Text = message;
            }));

        try
        {
            var withDuid = await _discovery.RetrieveDuidAsync(device, progress);
            _selectedTelevision = withDuid;
            _selectedDuid = withDuid.Duid;

            if (TizenDuid.IsValid(withDuid.Duid))
            {
                if (this.FindControl<StackPanel>("TelevisionActivationPanel") is { } activation) activation.IsVisible = false;
                if (this.FindControl<TextBlock>("TelevisionDiscoveryStatus") is { } status)
                    status.Text = withDuid.UsesTvStoreRelay
                        ? $"DUID obtenido automáticamente mediante el relay SDB ({withDuid.IpAddress}:{withDuid.SdbPort}): {withDuid.Duid}"
                        : $"DUID obtenido automáticamente mediante SDB directo ({withDuid.IpAddress}:{withDuid.SdbPort}): {withDuid.Duid}";
            }
            else
            {
                ShowDeveloperModeInstructions("No se ha podido obtener automáticamente el DUID mediante SDB. Activa o revisa Developer Mode y pulsa Reintentar.");
            }

            SetTelevisionActionsEnabled(true);
        }
        catch (OperationCanceledException)
        {
            ShowDeveloperModeInstructions("La conexión SDB no se ha completado. Comprueba la configuración de Developer Mode y pulsa Reintentar.");
        }
        catch (Exception ex)
        {
            ShowDeveloperModeInstructions($"No se ha podido preparar la instalación directa mediante SDB ({ex.Message}). Comprueba la conexión y pulsa Reintentar.");
        }
        finally
        {
            if (this.FindControl<StackPanel>("TelevisionSearchingPanel") is { } searchingPanel) searchingPanel.IsVisible = false;
        }
    }

    private async void OnContinueWithSdbClick(object? sender, Avalonia.Interactivity.RoutedEventArgs e)
    {
        if (_selectedTelevision is { } television)
            await ContinueWithSdbInstallationAsync(television);
    }

    private async void OnTelevisionSelectionChanged(object? sender, SelectionChangedEventArgs e)
    {
        if (this.FindControl<ComboBox>("TelevisionSelection")?.SelectedItem is DiscoveredTelevision selected)
            await SelectTelevisionAsync(selected);
        else
        {
            _selectedTelevision = null;
            _selectedDuid = null;
            if (this.FindControl<StackPanel>("TelevisionActivationPanel") is { } activation) activation.IsVisible = false;
            SetTelevisionActionsEnabled(false);
        }
    }

    private void OnFinishTvStoreHandoffClick(object? sender, Avalonia.Interactivity.RoutedEventArgs e) => Close();

    private void SetTelevisionActionsEnabled(bool enabled)
    {
        var hasDuid = enabled && TizenDuid.IsValid(_selectedDuid);
        if (this.FindControl<Button>("EnsureCertificateButton") is { } ensure) ensure.IsEnabled = hasDuid && !_discoveryInProgress;
        if (this.FindControl<Button>("SignWgtButton") is { } sign) sign.IsEnabled = hasDuid && !_discoveryInProgress;
        if (this.FindControl<Button>("InstallWgtButton") is { } install) install.IsEnabled = hasDuid && !_discoveryInProgress;
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
            if (button is not null) button.IsEnabled = TizenDuid.IsValid(_selectedDuid) && !_discoveryInProgress;
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
                sign.IsEnabled = TizenDuid.IsValid(_selectedDuid) && !_discoveryInProgress;
        }
    }

    private async void OnInstallWgtClick(object? sender, Avalonia.Interactivity.RoutedEventArgs e)
    {
        var television = _selectedTelevision;
        var duid = GetSelectedDuid();
        if (television is null || string.IsNullOrWhiteSpace(duid) || !TizenDuid.IsValid(duid))
        {
            SetOperationStatus("No se puede instalar: es obligatorio detectar automáticamente un DUID válido mediante SDB.");
            return;
        }

        var button = this.FindControl<Button>("InstallWgtButton");
        if (button is not null) button.IsEnabled = false;
        var temporaryDirectory = Path.Combine(Path.GetTempPath(), "MoonlightTizenInstaller", "install-" + Guid.NewGuid().ToString("N"));
        var signedPackagePath = Path.Combine(temporaryDirectory, "Moonlight-signed.wgt");

        try
        {
            Directory.CreateDirectory(temporaryDirectory);
            const CertificatePrivilegeLevel level = CertificatePrivilegeLevel.Partner;
            SetOperationStatus("Comprobando o preparando el perfil de firma Partner…");
            var profile = await _certificates.EnsureForTelevisionAsync(
                duid, level,
                progress: message => Dispatcher.UIThread.Post(() => SetOperationStatus(message)));

            await _certificates.SignWgtAsync(
                _bundledWgtPath, signedPackagePath, profile,
                new Progress<string>(message => Dispatcher.UIThread.Post(() => SetOperationStatus(message))));

            var installProgress = new Progress<string>(message =>
                Dispatcher.UIThread.Post(() => SetOperationStatus(message)));
            var endpointDescription = television.UsesTvStoreRelay
                ? $"relay de TV-Store ({television.IpAddress}:{television.SdbPort})"
                : $"SDB directo ({television.IpAddress}:{television.SdbPort})";

            SdbInstallationService.InstallationResult result;
            try
            {
                SetOperationStatus($"Instalando Moonlight mediante {endpointDescription}…");
                result = await _sdbInstaller.InstallAsync(
                    television.IpAddress, television.SdbPort, signedPackagePath, installProgress);
            }
            catch (SdbEndpointUnavailableException) when (television.UsesTvStoreRelay)
            {
                SetOperationStatus("El relay de TV-Store ha dejado de aceptar conexiones. Se intentará la conexión SDB directa por el puerto 26101…");
                result = await _sdbInstaller.InstallAsync(
                    television.IpAddress,
                    DiscoveredTelevision.DirectSdbPort,
                    signedPackagePath,
                    installProgress);
                endpointDescription = $"SDB directo ({television.IpAddress}:{DiscoveredTelevision.DirectSdbPort})";
            }

            SetOperationStatus($"Tizen ha confirmado la instalación de Moonlight (paquete {result.PackageId}) mediante {endpointDescription}.");
            RefreshCertificateStatus();
        }
        catch (OperationCanceledException)
        {
            SetOperationStatus("Instalación cancelada.");
        }
        catch (Exception ex)
        {
            SetOperationStatus($"No se pudo instalar Moonlight: {ex.Message}");
        }
        finally
        {
            try { if (Directory.Exists(temporaryDirectory)) Directory.Delete(temporaryDirectory, recursive: true); }
            catch { /* Best-effort cleanup of the temporary signed WGT. */ }
            if (button is not null)
                button.IsEnabled = TizenDuid.IsValid(_selectedDuid) && !_discoveryInProgress;
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