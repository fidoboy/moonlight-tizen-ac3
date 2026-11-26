using Avalonia.Controls;
using Avalonia.Markup.Xaml;
using Avalonia.Threading;
using Avalonia.Platform;
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
    private readonly string _bundledWgtPath = Path.Combine(Path.GetTempPath(), $"MoonlightTizenInstaller-{Guid.NewGuid():N}.wgt");
    private string? _selectedDuid;
    private DiscoveredTelevision? _selectedTelevision;
    private bool _discoveryInProgress;
    private int _currentStep = 1;

    public MainWindow(CertificateManager certificates, TelevisionDiscoveryService discovery)
    {
        _certificates = certificates;
        _discovery = discovery;
        InitializeComponent();
        SetWizardStep(1);
        Closed += (_, _) =>
        {
            try
            {
                if (File.Exists(_bundledWgtPath))
                    File.Delete(_bundledWgtPath);
            }
            catch
            {
                // Best-effort cleanup of the temporary embedded WGT.
            }
        };
        Opened += async (_, _) =>
        {
            if (!await EnsureBundledWgtAvailableAsync())
                return;

        };
    }

    private void InitializeComponent()
    {
        AvaloniaXamlLoader.Load(this);
        Icon = new WindowIcon(AssetLoader.Open(new Uri("avares://MoonlightTizenInstaller/Assets/moonlight-logo.png")));
        if (this.FindControl<Button>("FinishTvStoreHandoffButton") is { } finishButton)
            finishButton.Click += OnFinishTvStoreHandoffClick;
        if (this.FindControl<Button>("ContinueWithSdbButton") is { } sdbFallbackButton)
            sdbFallbackButton.Click += OnContinueWithSdbClick;
    }

    private async Task<bool> EnsureBundledWgtAvailableAsync()
    {
        try
        {
            if (!File.Exists(_bundledWgtPath) || new FileInfo(_bundledWgtPath).Length == 0)
            {
                await using var resource = typeof(MainWindow).Assembly.GetManifestResourceStream("Moonlight.wgt");
                if (resource is null)
                    throw new FileNotFoundException("El paquete Moonlight.wgt no está integrado en el ejecutable.");

                await using var destination = new FileStream(
                    _bundledWgtPath, FileMode.CreateNew, FileAccess.Write, FileShare.None);
                await resource.CopyToAsync(destination);
            }

            if (new FileInfo(_bundledWgtPath).Length > 0)
                return true;
        }
        catch
        {
            try
            {
                if (File.Exists(_bundledWgtPath))
                    File.Delete(_bundledWgtPath);
            }
            catch
            {
                // Ignore cleanup failures while reporting the missing embedded package.
            }
        }

        var message = new TextBlock
        {
            Text = "El paquete Moonlight.wgt no está integrado en este ejecutable o está dañado. Descarga de nuevo el instalador.",
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

    private async void OnNextClick(object? sender, Avalonia.Interactivity.RoutedEventArgs e)
    {
        switch (_currentStep)
        {
            case 1:
                SetWizardStep(2);
                await DiscoverTelevisionsAsync();
                break;
            case 2:
                if (_selectedTelevision is null && this.FindControl<StackPanel>("TelevisionSelectionPanel")?.IsVisible == true)
                    SetDiscoveryStatus("Selecciona un televisor para continuar.");
                break;
            case 3:
                if (this.FindControl<StackPanel>("TvStoreHandoffPanel")?.IsVisible == true)
                    Close();
                else if (this.FindControl<StackPanel>("TelevisionActivationPanel")?.IsVisible == true)
                    await DiscoverTelevisionsAsync();
                else if (_selectedTelevision is not null && TizenDuid.IsValid(_selectedDuid))
                    SetWizardStep(4);
                break;
            case 4:
                if (_selectedDuid is not null && _certificates.IsReadyForTelevision(_selectedDuid))
                    SetWizardStep(5);
                else
                    SetOperationStatus("Crea o renueva el certificado Partner para continuar.");
                break;
            case 5:
                if (this.FindControl<Button>("InstallWgtButton") is { IsEnabled: true } install)
                    OnInstallWgtClick(install, e);
                else
                    Close();
                break;
        }
    }

    private void SetWizardStep(int step)
    {
        _currentStep = Math.Clamp(step, 1, 5);
        for (var i = 1; i <= 5; i++)
        {
            if (this.FindControl<Border>($"Step{i}Page") is { } page)
                page.IsVisible = i == _currentStep;
            if (this.FindControl<Border>($"Step{i}Circle") is { } circle)
                circle.Background = Avalonia.Media.Brush.Parse(i <= _currentStep ? "#78B8FF" : "#26344B");
            if (this.FindControl<TextBlock>($"Step{i}Label") is { } label)
                label.Foreground = Avalonia.Media.Brush.Parse(i <= _currentStep ? "#F5F8FF" : "#718099");
        }

        if (this.FindControl<Button>("NextButton") is { } next)
            next.Content = _currentStep == 3 && this.FindControl<StackPanel>("TvStoreHandoffPanel")?.IsVisible == true
                ? "Finalizar" : _currentStep == 5 ? "Instalar" : "Siguiente";
    }

    private void SetDiscoveryStatus(string message)
    {
        if (this.FindControl<TextBlock>("TelevisionDiscoveryStatus") is { } status)
            status.Text = message;
    }

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
        SetWizardStep(3);
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

        IProgress<string> progress = new Progress<string>(message =>
            Dispatcher.UIThread.Post(() =>
            {
                if (this.FindControl<TextBlock>("TelevisionSearchStatus") is { } status)
                    status.Text = message;
            }));

        try
        {
            TvStoreHandoffService.HandoffResult? handoff;
            try
            {
                handoff = await _tvStoreInstaller.TrySendForInstallationAsync(device.IpAddress, _bundledWgtPath, progress);
            }
            catch (OperationCanceledException)
            {
                throw;
            }
            catch (Exception ex)
            {
                progress.Report($"TV-Store no ha podido completar el envío ({ex.Message}). Se continuará mediante SDB.");
                handoff = null;
            }
            if (handoff is not null)
            {
                if (this.FindControl<StackPanel>("TelevisionSearchingPanel") is { } searchingPanel) searchingPanel.IsVisible = false;
                if (this.FindControl<StackPanel>("TelevisionActionsPanel") is { } actionsPanel) actionsPanel.IsVisible = false;
                if (this.FindControl<StackPanel>("TvStoreHandoffPanel") is { } tvStorePanel) tvStorePanel.IsVisible = true;
                SetWizardStep(3);
                if (this.FindControl<TextBlock>("TvStoreHandoffStatus") is { } tvStoreStatus)
                {
                    var launchMessage = handoff.TvStoreOpened
                        ? "TV-Store se ha abierto en el televisor."
                        : "No se ha podido traer TV-Store al primer plano; si no aparece, ábrelo desde el televisor.";
                    tvStoreStatus.Text =
                        $"Moonlight.wgt se ha transferido y su SHA-256 se ha verificado ({handoff.Size:N0} bytes).\n\n" +
                        $"{launchMessage}\n\n" +
                        "En la pantalla del televisor debe aparecer la solicitud de instalación de Moonlight. Selecciona «Instalar» y acepta la confirmación de TV-Store. " +
                        "El instalador no necesita realizar ninguna otra operación por esta vía. Si TV-Store no consigue completar la instalación (por ejemplo, porque no tiene un certificado configurado), vuelve a esta ventana y pulsa «Continuar mediante SDB».";
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
            if (TizenDuid.IsValid(withDuid.Duid)) SetWizardStep(4);
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
        var certificateReady = hasDuid && _certificates.IsReadyForTelevision(_selectedDuid!);

        if (this.FindControl<Button>("GenerateCertificateButton") is { } generate)
            generate.IsEnabled = hasDuid && !certificateReady && !_discoveryInProgress;
        if (this.FindControl<Button>("InstallWgtButton") is { } install)
            install.IsEnabled = certificateReady && !_discoveryInProgress;

        if (this.FindControl<TextBlock>("CertificateOperationStatus") is { } status && hasDuid)
            status.Text = certificateReady
                ? "Certificado Partner válido. Puedes continuar."
                : "No hay un certificado Partner válido para este televisor.";

        if (this.FindControl<Button>("NextButton") is { } next && _currentStep == 4)
            next.IsEnabled = certificateReady;
    }

    private string? GetSelectedDuid() => _selectedDuid;

    private async void OnGenerateCertificateClick(object? sender, Avalonia.Interactivity.RoutedEventArgs e)
    {
        var duid = GetSelectedDuid();
        const CertificatePrivilegeLevel level = CertificatePrivilegeLevel.Partner;
        var status = this.FindControl<TextBlock>("CertificateOperationStatus");
        var button = this.FindControl<Button>("GenerateCertificateButton");

        if (string.IsNullOrWhiteSpace(duid) || !TizenDuid.IsValid(duid))
        {
            if (status is not null)
                status.Text = "Es necesario detectar automáticamente una TV mediante SDB antes de generar el certificado.";
            return;
        }

        if (button is not null) button.IsEnabled = false;
        if (status is not null)
            status.Text = "Se abrirá la página de Samsung. Inicia sesión y autoriza la generación del certificado.";

        try
        {
            await _certificates.EnsureForTelevisionAsync(
                duid,
                level,
                progress: message => Dispatcher.UIThread.Post(() =>
                {
                    if (status is not null) status.Text = message;
                }));

            if (status is not null)
                status.Text = "Certificado Partner generado y guardado.";
            SetWizardStep(5);
        }
        catch (OperationCanceledException)
        {
            if (status is not null) status.Text = "La generación del certificado se ha cancelado.";
        }
        catch (Exception ex)
        {
            if (status is not null) status.Text = $"No se pudo generar el certificado: {ex.Message}";
        }
        finally
        {
            SetTelevisionActionsEnabled(TizenDuid.IsValid(_selectedDuid));
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
            SetOperationStatus("Comprobando el perfil de firma Partner…");
            var profile = _certificates.GetUsableForTelevision(duid, level)
                ?? throw new InvalidOperationException("El certificado Partner no está disponible o ha caducado. Genera o renueva el certificado antes de instalar.");

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

            SetOperationStatus($"Moonlight se ha instalado correctamente ({result.PackageId}).");
            if (this.FindControl<Button>("NextButton") is { } next) next.Content = "Cerrar";
            if (this.FindControl<Button>("InstallWgtButton") is { } installButton) installButton.IsEnabled = false;
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
            SetTelevisionActionsEnabled(TizenDuid.IsValid(_selectedDuid));
        }
    }

    private void SetOperationStatus(string message)
    {
        var target = _currentStep == 5 ? "InstallationStatus" : "CertificateOperationStatus";
        if (this.FindControl<TextBlock>(target) is { } status)
            status.Text = message;
    }
}