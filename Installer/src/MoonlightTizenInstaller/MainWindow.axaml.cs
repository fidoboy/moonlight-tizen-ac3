using Avalonia.Controls;
using Avalonia.Input;
using Avalonia.VisualTree;
using System.Globalization;
using System.Net;
using System.Diagnostics;
using Avalonia.Media.Imaging;
using Avalonia.Platform;
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
    private string? _bundledWgtPath;
    private string? _bundledWgtResourceName;
    private string? _selectedWgtResourceName;
    private Bitmap? _brandBitmap;
    private WindowIcon? _windowIcon;
    private string? _selectedDuid;
    private DiscoveredTelevision? _selectedTelevision;
    private bool _discoveryInProgress;
    private bool _televisionDiscoveryFailed;
    private bool _tvStoreHandoff;
    private bool _tvStoreDeclined;
    private bool _tvStoreChosen;
    private bool _installationCompleted;
    private bool _installationFinished;
    private string? _signedPackagePathForRetry;
    private string? _signedPackageDirectoryForRetry;
    private bool _manualLanguageSelected;
    private int _wizardStep = 1;

    public MainWindow(CertificateManager certificates, TelevisionDiscoveryService discovery)
    {
        _certificates = certificates;
        _discovery = discovery;
        InitializeComponent();
        Closed += (_, _) => CleanupRetryPackage();
        InstallerLocalization.Apply(this);
        if (!InstallerLocalization.HasSupportedSystemLocale)
        {
            if (this.FindControl<StackPanel>("WelcomePage") is { } welcome)
            {
                var languagePanel = this.FindControl<Border>("LanguageSelectionPanel");
                if (languagePanel is not null) languagePanel.IsVisible = true;
            }
            if (this.FindControl<Button>("WizardNextButton") is { } startButton)
                startButton.IsEnabled = false;
        }
        Closed += (_, _) =>
        {
            _brandBitmap?.Dispose();
            try
            {
                if (_bundledWgtPath is not null && File.Exists(_bundledWgtPath))
                    File.Delete(_bundledWgtPath);
            }
            catch
            {
                // Best-effort cleanup of the temporary embedded WGT.
            }
        };
        Opened += async (_, _) =>
        {
            SetWizardStep(1);
        };
    }

    private void InitializeComponent()
    {
        AvaloniaXamlLoader.Load(this);
        var logoUri = new Uri("avares://MoonlightTizenInstaller/Assets/moonlight-logo.png");
        using (var logoStream = AssetLoader.Open(logoUri))
            _brandBitmap = new Bitmap(logoStream);
        if (this.FindControl<Image>("MoonlightBrandLogo") is { } logo)
            logo.Source = _brandBitmap;
        using (var iconStream = AssetLoader.Open(new Uri("avares://MoonlightTizenInstaller/Assets/moonlight.ico")))
            _windowIcon = Icon = new WindowIcon(iconStream);

        if (this.FindControl<Button>("FinishTvStoreHandoffButton") is { } finishButton)
            finishButton.Click += OnFinishTvStoreHandoffClick;
    }

    private void OnLanguageSelectionChanged(object? sender, SelectionChangedEventArgs e)
    {
        var selector = this.FindControl<ComboBox>("LanguageSelection");
        if (selector?.SelectedIndex is not int index || index < 0)
            return;

        InstallerLocalization.SelectLocale(index);
        _manualLanguageSelected = true;
        InstallerLocalization.Apply(this);
        if (this.FindControl<Button>("WizardNextButton") is { } startButton)
            startButton.IsEnabled = true;
    }

    private void SetWizardStep(int step)
    {
        _wizardStep = Math.Clamp(step, 1, 5);
        foreach (var (number, name) in new[]
        {
            (1, "WelcomePage"), (2, "TelevisionPage"), (3, "ConnectionPage"),
            (4, "CertificatePage"), (5, "InstallationPage")
        })
        {
            if (this.FindControl<StackPanel>(name) is { } page)
                page.IsVisible = number == _wizardStep;
        }

        for (var number = 1; number <= 5; number++)
        {
            var active = number <= _wizardStep;
            if (number < 5 && this.FindControl<Border>($"StepConnector{number}") is { } connector)
                connector.Background = new Avalonia.Media.SolidColorBrush(Avalonia.Media.Color.Parse(number < _wizardStep ? "#78B8FF" : "#40516D"));
            if (this.FindControl<Border>($"StepIndicator{number}") is { } indicator)
            {
                indicator.Background = new Avalonia.Media.SolidColorBrush(
                    Avalonia.Media.Color.Parse(active ? "#78B8FF" : "#14213A"));
                indicator.BorderBrush = new Avalonia.Media.SolidColorBrush(
                    Avalonia.Media.Color.Parse(active ? "#78B8FF" : "#40516D"));
            }
            if (this.FindControl<TextBlock>($"StepNumber{number}") is { } numeral)
                numeral.Foreground = new Avalonia.Media.SolidColorBrush(
                    Avalonia.Media.Color.Parse(active ? "#071224" : "#ACBAD0"));
            if (this.FindControl<TextBlock>($"StepLabel{number}") is { } label)
            {
                label.Foreground = new Avalonia.Media.SolidColorBrush(
                    Avalonia.Media.Color.Parse(active ? "#F5F8FF" : "#ACBAD0"));
                label.FontWeight = active
                    ? Avalonia.Media.FontWeight.SemiBold
                    : Avalonia.Media.FontWeight.Normal;
            }
        }

        var back = this.FindControl<Button>("WizardBackButton");
        var next = this.FindControl<Button>("WizardNextButton");
        var exit = this.FindControl<Button>("WizardExitButton");
        if (back is not null)
        {
            back.IsVisible = _wizardStep > 1 && !_tvStoreHandoff && _wizardStep < 5;
            back.IsEnabled = !_discoveryInProgress;
        }
        if (exit is not null)
        {
            exit.IsVisible = _wizardStep == 5 || (!_tvStoreHandoff && !_installationCompleted);
            // Keep the only available action on the installation result page
            // disabled until the transfer/installation operation has finished.
            exit.IsEnabled = _wizardStep != 5 || _installationFinished;
        }
        if (next is not null)
        {
            // Step 5 is a result-only page: the "Finish" action is never shown.
            next.IsVisible = _wizardStep < 5 && (!_tvStoreHandoff || _wizardStep == 4);
            next.Content = InstallerLocalization.T(_tvStoreHandoff
                ? "Finish"
                : _wizardStep switch
                {
                    1 => "Start",
                    2 => "Next",
                    3 => "Next",
                    4 => "Install",
                    _ => "Finish"
                });
            next.IsEnabled = !_discoveryInProgress &&
                ((_tvStoreHandoff && _wizardStep == 4) || (_wizardStep switch
                {
                    1 => InstallerLocalization.HasSupportedSystemLocale || _manualLanguageSelected,
                    2 => !_televisionDiscoveryFailed,
                    3 => _selectedTelevision is { IsDeveloperModeIpValid: true } && !_tvStoreHandoff,
                    4 => TizenDuid.IsValid(_selectedDuid) && _certificates.IsReadyForTelevision(_selectedDuid!),
                    _ => _installationFinished
                }));
        }
    }

    private async void OnWizardNextClick(object? sender, Avalonia.Interactivity.RoutedEventArgs e)
    {
        switch (_wizardStep)
        {
            case 1:
                _selectedWgtResourceName = this.FindControl<RadioButton>("ForceGmWgtOption")?.IsChecked == true
                    ? "Moonlight-ForceGM.wgt"
                    : "Moonlight.wgt";
                if (!await EnsureBundledWgtAvailableAsync())
                    return;
                SetWizardStep(2);
                await DiscoverTelevisionsAsync();
                break;
            case 2:
                SetWizardStep(3);
                break;
            case 3:
                if (_selectedTelevision is { IsDeveloperModeIpValid: true } selectedTelevision)
                    await SelectTelevisionAsync(selectedTelevision);
                break;
            case 4:
                if (_tvStoreHandoff)
                    Close();
                else if (TizenDuid.IsValid(_selectedDuid) && _certificates.IsReadyForTelevision(_selectedDuid!))
                {
                    SetWizardStep(5);
                    await InstallWgtAsync();
                }
                break;
            case 5:
                if (_installationCompleted)
                    Close();
                break;
        }
    }

    private async void OnWizardBackClick(object? sender, Avalonia.Interactivity.RoutedEventArgs e)
    {
        if (_wizardStep == 3)
        {
            // Returning from the device-selection page starts a fresh discovery pass;
            // step 2 must never be left showing the completed results of the old scan.
            SetWizardStep(2);
            await DiscoverTelevisionsAsync();
            return;
        }

        if (_wizardStep > 1)
            SetWizardStep(_wizardStep - 1);
    }

    private void OnWizardExitClick(object? sender, Avalonia.Interactivity.RoutedEventArgs e) => Close();

    private async Task<bool> EnsureBundledWgtAvailableAsync()
    {
        var resourceName = _selectedWgtResourceName ?? "Moonlight.wgt";
        try
        {
            if (_bundledWgtPath is not null && _bundledWgtResourceName == resourceName &&
                File.Exists(_bundledWgtPath) && new FileInfo(_bundledWgtPath).Length > 0)
                return true;

            if (_bundledWgtPath is not null && File.Exists(_bundledWgtPath))
                File.Delete(_bundledWgtPath);

            var outputPath = Path.Combine(
                Path.GetTempPath(), $"MoonlightTizenInstaller-{Guid.NewGuid():N}.wgt");
            _bundledWgtPath = outputPath;

            await using var resource = typeof(MainWindow).Assembly.GetManifestResourceStream(resourceName);
            if (resource is null)
                throw new FileNotFoundException($"El paquete {resourceName} no está integrado en el ejecutable.");

            await using var destination = new FileStream(
                outputPath, FileMode.CreateNew, FileAccess.Write, FileShare.None);
            await resource.CopyToAsync(destination);

            if (new FileInfo(outputPath).Length > 0)
            {
                _bundledWgtResourceName = resourceName;
                return true;
            }
        }
        catch
        {
            try
            {
                if (_bundledWgtPath is not null && File.Exists(_bundledWgtPath))
                    File.Delete(_bundledWgtPath);
            }
            catch
            {
                // Ignore cleanup failures while reporting the missing embedded package.
            }
        }

        var message = new TextBlock
        {
            Text = InstallerLocalization.T($"The {resourceName} package is missing from this executable or is damaged. Download the installer again."),
            TextWrapping = Avalonia.Media.TextWrapping.Wrap,
            Margin = new Avalonia.Thickness(20)
        };
        var closeButton = new Button
        {
            Content = InstallerLocalization.T("OK"),
            HorizontalAlignment = Avalonia.Layout.HorizontalAlignment.Right,
            MinWidth = 100,
            Margin = new Avalonia.Thickness(20, 0, 20, 20)
        };
        var dialog = new Window
        {
            Title = InstallerLocalization.T("Moonlight Tizen Installer could not be started"),
            Width = 480,
            SizeToContent = Avalonia.Controls.SizeToContent.Height,
            CanResize = false,
            WindowStartupLocation = WindowStartupLocation.CenterOwner,
            Content = new StackPanel { Children = { message, closeButton } }
        };
        closeButton.Click += (_, _) => dialog.Close();
        await dialog.ShowDialog(this);
        return false;
    }

    private async void OnDiscoverTelevisionsClick(object? sender, Avalonia.Interactivity.RoutedEventArgs e)
    {
        SetWizardStep(2);
        await DiscoverTelevisionsAsync();
    }

    private async Task DiscoverTelevisionsAsync()
    {
        if (_discoveryInProgress)
            return;

        _discoveryInProgress = true;
        _televisionDiscoveryFailed = false;
        if (this.FindControl<TextBlock>("TelevisionPageTitle") is { } pageTitle)
            pageTitle.Text = InstallerLocalization.T("Searching for your TizenOS TV");
        SetWizardStep(_wizardStep);
        _selectedDuid = null;
        _selectedTelevision = null;
        _tvStoreHandoff = false;
        SetTelevisionActionsEnabled(false);
        var searching = this.FindControl<StackPanel>("TelevisionSearchingPanel");
        var activation = this.FindControl<StackPanel>("TelevisionActivationPanel");
        var cards = this.FindControl<ListBox>("TelevisionCards");
        var retry = this.FindControl<Button>("RetryTelevisionDiscoveryButton");
        var status = this.FindControl<TextBlock>("TelevisionDiscoveryStatus");
        var searchStatus = this.FindControl<TextBlock>("TelevisionSearchStatus");
        var discoveryHint = this.FindControl<TextBlock>("TelevisionDiscoveryHint");
        var foundList = this.FindControl<StackPanel>("TelevisionFoundList");

        if (foundList is not null) foundList.Children.Clear();
        if (discoveryHint is not null)
        {
            discoveryHint.Text = InstallerLocalization.T("TVs on the local network are detected automatically.");
            discoveryHint.IsVisible = true;
        }
        if (searching is not null) searching.IsVisible = true;
        if (activation is not null) activation.IsVisible = false;
        if (cards is not null)
        {
            cards.IsVisible = false;
            cards.ItemsSource = null;
            cards.SelectedItem = null;
        }
        if (retry is not null) retry.IsEnabled = false;
        if (status is not null) status.Text = string.Empty;
        if (searchStatus is not null)
            searchStatus.Text = InstallerLocalization.T("Scanning the local network for TizenOS TVs. Please be patient; this process may take some time...");

        try
        {
            var progress = new Progress<string>(message =>
            {
                if (searchStatus is not null) searchStatus.Text = InstallerLocalization.T(HideInternalProtocolNames(message));
            });
            var discoveredProgress = new Progress<DiscoveredTelevision>(television =>
            {
                if (foundList is null)
                    return;

                var row = new StackPanel
                {
                    Orientation = Avalonia.Layout.Orientation.Horizontal,
                    Spacing = 8,
                    Margin = new Avalonia.Thickness(0, 2, 0, 0),
                    VerticalAlignment = Avalonia.Layout.VerticalAlignment.Center
                };
                row.Children.Add(new TextBlock
                {
                    Text = "✓",
                    Foreground = new Avalonia.Media.SolidColorBrush(Avalonia.Media.Color.Parse("#35C978")),
                    FontWeight = Avalonia.Media.FontWeight.Bold,
                    FontSize = 15,
                    VerticalAlignment = Avalonia.Layout.VerticalAlignment.Center
                });
                row.Children.Add(new TextBlock
                {
                    Text = $"{television.FriendlyName} ({television.IpAddress})",
                    Foreground = new Avalonia.Media.SolidColorBrush(Avalonia.Media.Color.Parse("#D6E1F2")),
                    TextWrapping = Avalonia.Media.TextWrapping.Wrap,
                    VerticalAlignment = Avalonia.Layout.VerticalAlignment.Center
                });
                foundList.Children.Add(row);
            });
            var devices = await _discovery.DiscoverAsync(progress, discoveredProgress: discoveredProgress);

            if (devices.Count == 0)
            {
                _televisionDiscoveryFailed = true;
                if (this.FindControl<TextBlock>("TelevisionPageTitle") is { } resultPageTitle)
                    resultPageTitle.Text = InstallerLocalization.T("No TV was found on the network");
                ShowDeveloperModeInstructions(
                    InstallerLocalization.T("No TizenOS TV was detected on the local network. Make sure it is powered on and connected to the same network as this computer. Enable Developer Mode and run detection again."));
                return;
            }

            // TV-Store is checked during discovery, before the connection page is shown.
            // Declining it disables further checks for the rest of this installer session.
            if (!_tvStoreDeclined && !_tvStoreChosen)
            {
                foreach (var device in devices)
                {
                    if (searchStatus is not null)
                        searchStatus.Text = InstallerLocalization.T("Checking installation options on {0}…").Replace("{0}", device.IpAddress);
                    if (!await _tvStoreInstaller.IsInstalledAsync(device.IpAddress))
                        continue;

                    var useTvStore = await AskToUseTvStoreAsync(device);
                    if (!useTvStore)
                    {
                        _tvStoreDeclined = true;
                        break;
                    }

                    _tvStoreChosen = true;
                    _tvStoreHandoff = true;
                    _selectedTelevision = device;
                    if (searchStatus is not null)
                        searchStatus.Text = InstallerLocalization.T("Sending Moonlight to TV-Store…");

                    try
                    {
                        var handoffProgress = new Progress<string>(message =>
                        {
                            if (searchStatus is not null)
                                searchStatus.Text = InstallerLocalization.T(HideInternalProtocolNames(message));
                        });
                        var handoff = await _tvStoreInstaller.TrySendForInstallationAsync(
                            device.IpAddress, _bundledWgtPath ?? throw new FileNotFoundException("The selected WGT package has not been extracted."), handoffProgress);
                        ShowTvStoreResult(handoff is not null);
                    }
                    catch (OperationCanceledException)
                    {
                        ShowTvStoreResult(false, "La transferencia se ha cancelado antes de completarse.");
                    }
                    catch (Exception ex)
                    {
                        ShowTvStoreResult(false, $"No se ha podido transferir el paquete a TV-Store: {HideInternalProtocolNames(ex.Message)}");
                    }
                    return;
                }
            }

            var localHostIp = _discovery.GetDeveloperModeHostIp(useTvStoreRelay: false);
            devices = devices.Select(device =>
            {
                var hasDeveloperIp = !string.IsNullOrWhiteSpace(device.DeveloperIp);
                var isValid = hasDeveloperIp &&
                    (device.UsesTvStoreRelay ||
                     (IPAddress.TryParse(device.DeveloperIp!.Trim(), out var developerIp) &&
                      IPAddress.TryParse(localHostIp, out var localAddress) && developerIp.Equals(localAddress)));

                return device with
                {
                    IsDeveloperModeIpValid = isValid,
                    StatusText = InstallerLocalization.T(isValid ? "Ready" : "Not available")
                };
            }).ToArray();

            if (this.FindControl<Border>("InvalidDeviceWarning") is { } invalidDeviceWarning)
                invalidDeviceWarning.IsVisible = devices.Any(device => device.IsDeveloperModeIpInvalid);

            if (cards is not null)
            {
                cards.ItemsSource = devices;
                cards.SelectedIndex = devices.Count == 1 && devices[0].IsDeveloperModeIpValid ? 0 : -1;
                cards.IsVisible = true;
            }

            _selectedTelevision = devices.Count == 1 && devices[0].IsDeveloperModeIpValid
                ? devices[0]
                : null;
            if (searching is not null) searching.IsVisible = false;
            if (this.FindControl<TextBlock>("ConnectionSummary") is { } connectionSummary)
            {
                connectionSummary.Text = devices.Count > 1
                    ? InstallerLocalization.T("The following devices have been detected. Select the one you want to use, then click the “Next” button when you are ready to continue.")
                    : InstallerLocalization.T("The following device has been detected. Click the “Next” button when you are ready to continue.");
            }
            if (status is not null) status.Text = string.Empty;
            SetWizardStep(3);
        }
        catch (OperationCanceledException)
        {
            ShowDeveloperModeInstructions(InstallerLocalization.T("The search did not complete. Make sure the TV is on and connected to the network, then try again."));
        }
        catch (Exception ex)
        {
            ShowDeveloperModeInstructions(InstallerLocalization.T($"Detection could not be completed ({ex.Message}). Check the network connection and try again."));
        }
        finally
        {
            _discoveryInProgress = false;
            SetTelevisionActionsEnabled(_selectedTelevision is not null);
            if (retry is not null) retry.IsEnabled = true;
            // Re-evaluate the step button after discovery has finished. For multiple
            // devices it remains disabled until the user selects one of the cards.
            SetWizardStep(_wizardStep);
        }
    }

    private void ShowDeveloperModeInstructions(string message, bool keepSelectionPanel = false)
    {
        if (this.FindControl<StackPanel>("TelevisionSearchingPanel") is { } searching) searching.IsVisible = false;
        if (this.FindControl<ListBox>("TelevisionCards") is { } cards) cards.IsVisible = false;
        if (this.FindControl<StackPanel>("TelevisionActivationPanel") is { } activation) activation.IsVisible = true;
        if (this.FindControl<TextBlock>("TelevisionDiscoveryHint") is { } hint) hint.IsVisible = false;
        if (this.FindControl<TextBlock>("TelevisionDiscoveryStatus") is { } status) status.Text = InstallerLocalization.T(HideInternalProtocolNames(message));
        var useRelay = _selectedTelevision?.UsesTvStoreRelay == true;
        if (this.FindControl<TextBlock>("HostIpAddress") is { } hostIp)
            hostIp.Text = _discovery.GetDeveloperModeHostIp(useRelay) ?? InstallerLocalization.T("Could not determine a private IPv4 address");
        if (this.FindControl<TextBlock>("DeveloperModeHostIpDescription") is { } hostIpDescription)
            hostIpDescription.Text = useRelay
                ? InstallerLocalization.T("Enter exactly 127.0.0.1 in Host PC IP:")
                : InstallerLocalization.T("Enter this computer’s IPv4 address in Host PC IP:");
        SetWizardStep(2);
    }

    private async Task SelectTelevisionAsync(DiscoveredTelevision device)
    {
        if (_tvStoreChosen || !device.IsDeveloperModeIpValid)
            return;

        // TV-Store has already been checked during step 2. The connection step
        // now proceeds directly through the normal installation preparation.
        await ContinueWithSdbInstallationAsync(device);
    }

    private void ShowTvStoreResult(bool success, string? failureDetails = null)
    {
        _tvStoreHandoff = true;
        if (this.FindControl<StackPanel>("TelevisionSearchingPanel") is { } searching)
            searching.IsVisible = false;
        if (this.FindControl<Border>("CertificateNormalPanel") is { } normalPanel)
            normalPanel.IsVisible = false;
        _installationFinished = true;
        if (this.FindControl<TextBlock>("InstallationStepLabel") is { } stepLabel)
            stepLabel.IsVisible = true;
        if (this.FindControl<TextBlock>("InstallationPageTitle") is { } title)
            title.Text = InstallerLocalization.T("Transfer result");
        if (this.FindControl<StackPanel>("InstallationProgressPanel") is { } progressPanel)
            progressPanel.IsVisible = false;
        if (this.FindControl<TextBlock>("CertificatePageDescription") is { } description)
            description.IsVisible = false;
        if (this.FindControl<Grid>("TvStoreResultPanel") is { } resultPanel)
            resultPanel.IsVisible = true;
        if (this.FindControl<Border>("TvStoreResultIconCircle") is { } iconCircle)
        {
            var statusColor = Avalonia.Media.Color.Parse(success ? "#35C978" : "#FF5B62");
            iconCircle.Background = new Avalonia.Media.SolidColorBrush(
                Avalonia.Media.Color.Parse(success ? "#173F2B" : "#4A2025"));
            iconCircle.BorderBrush = new Avalonia.Media.SolidColorBrush(statusColor);
            iconCircle.BorderThickness = new Avalonia.Thickness(3);
        }
        if (this.FindControl<Avalonia.Controls.Shapes.Path>("TvStoreResultIcon") is { } icon)
        {
            icon.Data = Avalonia.Media.Geometry.Parse(success
                ? "M 3,12 L 9,18 L 21,6"
                : "M 6,6 L 18,18 M 18,6 L 6,18");
            icon.Stroke = new Avalonia.Media.SolidColorBrush(
                Avalonia.Media.Color.Parse(success ? "#35C978" : "#FF5B62"));
        }
        if (this.FindControl<TextBlock>("TvStoreResultTitle") is { } resultTitle)
            resultTitle.Text = InstallerLocalization.T(success
                ? "Transfer complete"
                : "The package could not be transferred");
        if (this.FindControl<TextBlock>("TvStoreResultMessage") is { } resultMessage)
        {
            var message = InstallerLocalization.T(success
                ? "Moonlight for Tizen was successfully transferred to TV-Store. To complete installation, accept the confirmation prompt on your TV. If it does not appear, open TV-Store on the television and confirm the installation there."
                : "Moonlight.wgt could not be delivered to TV-Store, so the application was not installed. Check that the TV is still connected and run the installer again. To use the normal installation route, decline TV-Store when prompted again.");
            resultMessage.Text = string.IsNullOrWhiteSpace(failureDetails)
                ? message
                : $"{message}{Environment.NewLine}{Environment.NewLine}{InstallerLocalization.T(HideInternalProtocolNames(failureDetails))}";
        }
        SetWizardStep(5);
    }

    private async Task ContinueWithSdbInstallationAsync(DiscoveredTelevision device)
    {
        _selectedTelevision = device;
        _selectedDuid = null;
        _tvStoreHandoff = false;
        if (this.FindControl<StackPanel>("TvStoreHandoffPanel") is { } handoffPanel) handoffPanel.IsVisible = false;
        if (this.FindControl<StackPanel>("TelevisionSearchingPanel") is { } searching) searching.IsVisible = true;
        if (this.FindControl<TextBlock>("TelevisionSearchStatus") is { } searchStatus)
            searchStatus.Text = InstallerLocalization.T("Preparing installation on the TV…");

        var progress = new Progress<string>(message =>
            Dispatcher.UIThread.Post(() =>
            {
                if (this.FindControl<TextBlock>("TelevisionSearchStatus") is { } status)
                    status.Text = InstallerLocalization.T(HideInternalProtocolNames(message));
            }));

        try
        {
            var withDuid = await _discovery.RetrieveDuidAsync(device, progress);
            _selectedTelevision = withDuid;
            _selectedDuid = withDuid.Duid;

            if (TizenDuid.IsValid(withDuid.Duid))
            {
                if (this.FindControl<StackPanel>("TelevisionActivationPanel") is { } activation) activation.IsVisible = false;
                var connectionMessage = InstallerLocalization.T("Connection to the TV is ready ({0}).").Replace("{0}", withDuid.IpAddress);
                if (this.FindControl<TextBlock>("ConnectionSummary") is { } summary)
                    summary.Text = connectionMessage;
                if (this.FindControl<TextBlock>("TelevisionDiscoveryStatus") is { } status)
                    status.Text = connectionMessage;
                // The selected TV is now identified and the connection is ready.
                // Continue to certificate preparation instead of leaving the user on
                // step 3 with an unchanged Install button.
                SetWizardStep(4);
            }
            else
            {
                ShowDeveloperModeInstructions(InstallerLocalization.T("Could not connect to the TV. Enable or check Developer Mode and click Retry."));
            }

            SetTelevisionActionsEnabled(true);
        }
        catch (OperationCanceledException)
        {
            ShowDeveloperModeInstructions(InstallerLocalization.T("The connection was not completed. Check the Developer Mode settings and click Retry."));
        }
        catch (Exception ex)
        {
            ShowDeveloperModeInstructions(InstallerLocalization.T($"Installation could not be prepared ({ex.Message}). Check the connection and click Retry."));
        }
        finally
        {
            if (this.FindControl<StackPanel>("TelevisionSearchingPanel") is { } searchingPanel) searchingPanel.IsVisible = false;
        }
    }

    private void OnTelevisionSelectionChanged(object? sender, SelectionChangedEventArgs e)
    {
        var cards = this.FindControl<ListBox>("TelevisionCards");
        var selectedTelevision = cards?.SelectedItem as DiscoveredTelevision;
        if (selectedTelevision is { IsDeveloperModeIpValid: false })
        {
            cards!.SelectedItem = null;
            selectedTelevision = null;
        }

        _selectedTelevision = selectedTelevision;
        _selectedDuid = null;
        SetWizardStep(_wizardStep);
    }


    private async Task<bool> AskToUseTvStoreAsync(DiscoveredTelevision television)
    {
        var localizedMessage = InstallerLocalization.T("TV-Store is installed on one of your devices: {0}. Would you like to try using it to complete the Moonlight installation there?");
        var messageParts = localizedMessage.Split("{0}", 2);
        var deviceLabel = string.IsNullOrWhiteSpace(television.Name)
            ? television.IpAddress
            : $"{television.Name} ({television.IpAddress})";
        var message = new TextBlock
        {
            TextWrapping = Avalonia.Media.TextWrapping.Wrap,
            VerticalAlignment = Avalonia.Layout.VerticalAlignment.Center,
            FontSize = 15
        };
        // TextBlock.Inlines is nullable in Avalonia; initialize it before adding runs.
        message.Inlines ??= new Avalonia.Controls.Documents.InlineCollection();
        message.Inlines.Add(new Avalonia.Controls.Documents.Run(messageParts[0]));
        message.Inlines.Add(new Avalonia.Controls.Documents.Run(deviceLabel)
        {
            FontWeight = Avalonia.Media.FontWeight.Bold
        });
        if (messageParts.Length > 1)
            message.Inlines.Add(new Avalonia.Controls.Documents.Run(messageParts[1]));
        var storeIcon = new Avalonia.Controls.Shapes.Path
        {
            Data = Avalonia.Media.Geometry.Parse("M 4,16 L 44,16 L 40,44 L 8,44 Z M 14,16 C 14,4 34,4 34,16"),
            Stroke = Avalonia.Media.Brushes.White,
            StrokeThickness = 3,
            StrokeLineCap = Avalonia.Media.PenLineCap.Round,
            Fill = Avalonia.Media.Brushes.Transparent,
            Width = 48,
            Height = 48,
            Stretch = Avalonia.Media.Stretch.Uniform
        };
        var iconContainer = new Border
        {
            Width = 76,
            Height = 76,
            CornerRadius = new Avalonia.CornerRadius(16),
            Background = new Avalonia.Media.SolidColorBrush(Avalonia.Media.Color.Parse("#203B60")),
            HorizontalAlignment = Avalonia.Layout.HorizontalAlignment.Center,
            VerticalAlignment = Avalonia.Layout.VerticalAlignment.Center,
            Child = new Viewbox
            {
                Width = 44,
                Height = 44,
                Stretch = Avalonia.Media.Stretch.Uniform,
                HorizontalAlignment = Avalonia.Layout.HorizontalAlignment.Center,
                VerticalAlignment = Avalonia.Layout.VerticalAlignment.Center,
                Child = storeIcon
            }
        };
        storeIcon.Width = 48;
        storeIcon.Height = 48;
        storeIcon.HorizontalAlignment = Avalonia.Layout.HorizontalAlignment.Center;
        storeIcon.VerticalAlignment = Avalonia.Layout.VerticalAlignment.Center;
        var useButton = new Button
        {
            Content = InstallerLocalization.T("Yes, use TV-Store"),
            Width = 190,
            MinWidth = 190,
            HorizontalContentAlignment = Avalonia.Layout.HorizontalAlignment.Center,
            Classes = { "primary" }
        };
        var normalButton = new Button
        {
            Content = InstallerLocalization.T("No"),
            Width = 190,
            MinWidth = 190,
            HorizontalContentAlignment = Avalonia.Layout.HorizontalAlignment.Center
        };
        var buttons = new StackPanel
        {
            Orientation = Avalonia.Layout.Orientation.Horizontal,
            HorizontalAlignment = Avalonia.Layout.HorizontalAlignment.Center,
            Spacing = 12,
            Margin = new Avalonia.Thickness(0, 20, 0, 0),
            Children = { normalButton, useButton }
        };
        var messageLayout = new Grid
        {
            ColumnDefinitions = new Avalonia.Controls.ColumnDefinitions("Auto,*"),
            ColumnSpacing = 20,
            Children = { iconContainer, message }
        };
        Grid.SetColumn(message, 1);
        var content = new StackPanel
        {
            Margin = new Avalonia.Thickness(26),
            Spacing = 4,
            Children = { messageLayout, buttons }
        };
        var dialog = new Window
        {
            Width = 596,
            SizeToContent = Avalonia.Controls.SizeToContent.Height,
            CanResize = false,
            SystemDecorations = SystemDecorations.None,
            ShowInTaskbar = false,
            WindowStartupLocation = WindowStartupLocation.CenterOwner,
            TransparencyLevelHint = new[] { WindowTransparencyLevel.Transparent },
            Background = Avalonia.Media.Brushes.Transparent,
            Foreground = Avalonia.Media.Brushes.White,
            Content = new Border
            {
                Margin = new Avalonia.Thickness(18),
                Background = Avalonia.Media.Brushes.Transparent,
                BoxShadow = new Avalonia.Media.BoxShadows(new Avalonia.Media.BoxShadow
                {
                    Blur = 28,
                    OffsetY = 8,
                    Color = Avalonia.Media.Color.Parse("#A0000000"),
                    Spread = 2
                }),
                Child = new Border
                {
                    Background = new Avalonia.Media.SolidColorBrush(Avalonia.Media.Color.Parse("#101A2D")),
                    BorderBrush = new Avalonia.Media.SolidColorBrush(Avalonia.Media.Color.Parse("#40516D")),
                    BorderThickness = new Avalonia.Thickness(1),
                    CornerRadius = new Avalonia.CornerRadius(14),
                    ClipToBounds = true,
                    Child = content
                }
            }
        };
        useButton.Click += (_, _) => dialog.Close(true);
        normalButton.Click += (_, _) => dialog.Close(false);
        var overlay = this.FindControl<Border>("ModalOverlay");
        if (overlay is not null) overlay.IsVisible = true;
        try
        {
            return await dialog.ShowDialog<bool>(this);
        }
        finally
        {
            if (overlay is not null) overlay.IsVisible = false;
        }
    }

    private void OnTitleBarPointerPressed(object? sender, PointerPressedEventArgs e)
    {
        if (!e.GetCurrentPoint(this).Properties.IsLeftButtonPressed)
            return;

        if (e.Source is Control source && source.GetVisualAncestors().OfType<Button>().Any())
            return;

        BeginMoveDrag(e);
    }

    private void OnWebsiteClick(object? sender, Avalonia.Interactivity.RoutedEventArgs e) =>
        OpenExternalLink("https://fidoboy.github.io/moonlight-tizen-ac3/");

    private void OnGithubClick(object? sender, Avalonia.Interactivity.RoutedEventArgs e) =>
        OpenExternalLink("https://github.com/fidoboy/moonlight-tizen-ac3");

    private static void OpenExternalLink(string url)
    {
        try
        {
            Process.Start(new ProcessStartInfo(url) { UseShellExecute = true });
        }
        catch
        {
            // Opening a project link is best-effort and must not interrupt installation.
        }
    }

    private void OnMinimizeClick(object? sender, Avalonia.Interactivity.RoutedEventArgs e) =>
        WindowState = WindowState.Minimized;

    private void OnWindowCloseClick(object? sender, Avalonia.Interactivity.RoutedEventArgs e) => Close();

    private void OnFinishTvStoreHandoffClick(object? sender, Avalonia.Interactivity.RoutedEventArgs e) => Close();

    private void SetTelevisionActionsEnabled(bool enabled)
    {
        var hasDuid = enabled && TizenDuid.IsValid(_selectedDuid);
        var certificateReady = hasDuid && _certificates.IsReadyForTelevision(_selectedDuid!);

        if (this.FindControl<Button>("GenerateCertificateButton") is { } generate)
            generate.IsEnabled = hasDuid && !certificateReady && !_discoveryInProgress;
        if (this.FindControl<Button>("InstallWgtButton") is { } install)
            install.IsEnabled = certificateReady && !_discoveryInProgress;

        if (this.FindControl<Border>("CertificateNormalPanel") is { } normalPanel)
            normalPanel.IsVisible = hasDuid && !certificateReady;
        if (this.FindControl<Border>("CertificateReadyPanel") is { } readyPanel)
            readyPanel.IsVisible = hasDuid && certificateReady;
        if (this.FindControl<StackPanel>("CertificateReadyIntro") is { } readyIntro)
            readyIntro.IsVisible = hasDuid && certificateReady;
        if (this.FindControl<TextBlock>("CertificatePageTitle") is { } certificateTitle)
            certificateTitle.Text = InstallerLocalization.T(certificateReady
                ? "Installation certificate"
                : "Prepare the installation certificate");
        if (certificateReady && this.FindControl<TextBlock>("CertificateOperationStatus") is { } certificateStatus)
            certificateStatus.IsVisible = false;
        if (hasDuid && certificateReady)
        {
            var details = _certificates.GetCertificateDetailsForTelevision(_selectedDuid!);
            if (this.FindControl<TextBlock>("CertificateIssuerDetails") is { } issuer)
                issuer.Text = details?.Subject ?? InstallerLocalization.T("Signing certificate installed");
            if (this.FindControl<TextBlock>("CertificateValidityDetails") is { } validity && details is not null)
                validity.Text = InstallerLocalization.T("Issued: {0} · Expires: {1}")
                    .Replace("{0}", details.Value.IssuedOn.ToLocalTime().ToString("d"))
                    .Replace("{1}", details.Value.ExpiresOn.ToLocalTime().ToString("d"));
        }

        if (_wizardStep == 4)
            SetWizardStep(4);
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
                status.Text = InstallerLocalization.T("A TV must be detected automatically before generating the certificate.");
            return;
        }

        if (button is not null) button.IsEnabled = false;
        if (status is not null)
        {
            status.IsVisible = true;
            status.Text = InstallerLocalization.T("Opening the website to sign in…");
        }

        try
        {
            await _certificates.EnsureForTelevisionAsync(
                duid,
                level,
                progress: message => Dispatcher.UIThread.Post(() =>
                {
                    if (status is not null) status.Text = InstallerLocalization.T(HideInternalProtocolNames(message));
                }));

            if (status is not null)
                status.Text = InstallerLocalization.T("The certificate has been generated and saved.");
        }
        catch (OperationCanceledException)
        {
            if (status is not null) status.Text = InstallerLocalization.T("Certificate generation was cancelled.");
        }
        catch (Exception ex)
        {
            if (status is not null) status.Text = InstallerLocalization.T($"Could not generate the certificate: {ex.Message}");
        }
        finally
        {
            SetTelevisionActionsEnabled(TizenDuid.IsValid(_selectedDuid));
        }
    }

    private async void OnInstallWgtClick(object? sender, Avalonia.Interactivity.RoutedEventArgs e) =>
        await InstallWgtAsync();

    private async void OnUninstallAndRetryClick(object? sender, Avalonia.Interactivity.RoutedEventArgs e)
    {
        if (this.FindControl<Button>("UninstallAndRetryButton") is { } retryButton)
            retryButton.IsEnabled = false;
        await InstallWgtAsync(uninstallAndRetry: true);
    }

    private async Task InstallWgtAsync(bool uninstallAndRetry = false)
    {
        var television = _selectedTelevision;
        var duid = GetSelectedDuid();
        if (string.IsNullOrWhiteSpace(duid) || !TizenDuid.IsValid(duid))
        {
            ShowInstallationResult(false, InstallerLocalization.T("The TV could not be identified correctly. Go back and run detection again."));
            _installationFinished = true;
            if (this.FindControl<StackPanel>("InstallationProgressPanel") is { } invalidProgress)
                invalidProgress.IsVisible = false;
            SetWizardStep(5);
            return;
        }
        if (television is null)
        {
            ShowInstallationResult(false, InstallerLocalization.T("No TV has been selected. Go back and select the device."));
            _installationFinished = true;
            if (this.FindControl<StackPanel>("InstallationProgressPanel") is { } missingProgress)
                missingProgress.IsVisible = false;
            SetWizardStep(5);
            return;
        }

        if (this.FindControl<StackPanel>("InstallationProgressPanel") is { } progressPanel)
            progressPanel.IsVisible = true;
        if (this.FindControl<Grid>("InstallationResultPanel") is { } previousResult)
            previousResult.IsVisible = false;
        if (this.FindControl<ProgressBar>("InstallationProgressBar") is { } progressBar)
        {
            progressBar.IsIndeterminate = false;
            progressBar.Minimum = 0;
            progressBar.Maximum = 100;
            progressBar.Value = 0;
            progressBar.IsVisible = true;
        }
        SetOperationStatus(InstallerLocalization.T("Preparing installation…"));
        var temporaryDirectory = uninstallAndRetry
            ? _signedPackageDirectoryForRetry ?? throw new InvalidOperationException("The signed package prepared for retry is no longer available.")
            : Path.Combine(Path.GetTempPath(), "MoonlightTizenInstaller", "install-" + Guid.NewGuid().ToString("N"));
        var signedPackagePath = uninstallAndRetry
            ? _signedPackagePathForRetry ?? throw new InvalidOperationException("The signed package prepared for retry is no longer available.")
            : Path.Combine(temporaryDirectory, "Moonlight-signed.wgt");
        var preserveSignedPackageForRetry = false;

        try
        {
            const CertificatePrivilegeLevel level = CertificatePrivilegeLevel.Partner;
            if (!uninstallAndRetry)
            {
                Directory.CreateDirectory(temporaryDirectory);
                SetOperationStatus(InstallerLocalization.T("Checking the Partner signing profile…"));
                var profile = _certificates.GetUsableForTelevision(duid, level)
                    ?? throw new InvalidOperationException(InstallerLocalization.T("The Partner certificate is unavailable or has expired. Generate or renew it before installing."));

                await _certificates.SignWgtAsync(
                    _bundledWgtPath ?? throw new FileNotFoundException("The selected WGT package has not been extracted."), signedPackagePath, profile,
                    new Progress<string>(message => Dispatcher.UIThread.Post(() => SetOperationStatus(message))));
            }
            else
            {
                if (this.FindControl<ProgressBar>("InstallationProgressBar") is { } uninstallBar)
                    uninstallBar.IsIndeterminate = true;
                SetOperationStatus(InstallerLocalization.T("Uninstalling Moonlight…"));
                try
                {
                    await _sdbInstaller.UninstallAsync(
                        television.IpAddress, television.SdbPort, signedPackagePath,
                        new Progress<string>(message => Dispatcher.UIThread.Post(() => SetOperationStatus(message))));
                }
                catch (SdbEndpointUnavailableException) when (television.UsesTvStoreRelay)
                {
                    SetOperationStatus(InstallerLocalization.T("The connection to the TV was lost. Trying to restore it…"));
                    await _sdbInstaller.UninstallAsync(
                        television.IpAddress, DiscoveredTelevision.DirectSdbPort, signedPackagePath,
                        new Progress<string>(message => Dispatcher.UIThread.Post(() => SetOperationStatus(message))));
                }
                if (this.FindControl<ProgressBar>("InstallationProgressBar") is { } installBar)
                {
                    installBar.IsIndeterminate = false;
                    installBar.Value = 0;
                }
            }

            var installProgress = new Progress<string>(message =>
                Dispatcher.UIThread.Post(() => SetOperationStatus(message)));
            SdbInstallationService.InstallationResult result;
            try
            {
                SetOperationStatus(InstallerLocalization.T("Installing Moonlight…"));
                result = await _sdbInstaller.InstallAsync(
                    television.IpAddress, television.SdbPort, signedPackagePath, installProgress);
            }
            catch (SdbEndpointUnavailableException) when (television.UsesTvStoreRelay)
            {
                SetOperationStatus(InstallerLocalization.T("The connection to the TV was lost. Trying to restore it…"));
                result = await _sdbInstaller.InstallAsync(
                    television.IpAddress,
                    DiscoveredTelevision.DirectSdbPort,
                    signedPackagePath,
                    installProgress);
            }

            SetOperationStatus(InstallerLocalization.T("Tizen has confirmed the Moonlight installation."));
            _installationCompleted = true;
            ShowInstallationResult(true, InstallerLocalization.T("Moonlight was successfully installed on the TV {0}. Check that it appears in the app list, where you can launch it whenever you want.").Replace("{0}", television.FriendlyName));
        }
        catch (OperationCanceledException)
        {
            ShowInstallationResult(false, InstallerLocalization.T("Installation was cancelled before completion."));
        }
        catch (Exception ex)
        {
            var errorMessage = ex.Message;
            if (errorMessage.Contains("author certificate", StringComparison.OrdinalIgnoreCase) ||
                errorMessage.Contains("author cert", StringComparison.OrdinalIgnoreCase) ||
                errorMessage.Contains("author-certificate", StringComparison.OrdinalIgnoreCase))
            {
                preserveSignedPackageForRetry = true;
                _signedPackagePathForRetry = signedPackagePath;
                _signedPackageDirectoryForRetry = temporaryDirectory;
                ShowInstallationResult(false,
                    InstallerLocalization.T("Tizen rejected the installation because the certificate of the currently installed version does not match the certificate of the version you are trying to install. The installed version must be removed before this signed package can be installed."));
                if (this.FindControl<TextBlock>("InstallationRetryInstructions") is { } retryInstructions)
                {
                    retryInstructions.Text = InstallerLocalization.T("If you want to uninstall the current version and try again, click “Uninstall & retry”.");
                    retryInstructions.IsVisible = true;
                }
                if (this.FindControl<Button>("UninstallAndRetryButton") is { } retryButton)
                {
                    retryButton.Content = InstallerLocalization.T("Uninstall & retry");
                    retryButton.IsEnabled = true;
                    retryButton.IsVisible = true;
                }
            }
            else
            {
                ShowInstallationResult(false, InstallerLocalization.T($"Moonlight could not be installed on the TV. {HideInternalProtocolNames(errorMessage)}"));
            }
        }
        finally
        {
            if (!preserveSignedPackageForRetry)
            {
                try { if (Directory.Exists(temporaryDirectory)) Directory.Delete(temporaryDirectory, recursive: true); }
                catch { /* Best-effort cleanup of the temporary signed WGT. */ }
                _signedPackagePathForRetry = null;
                _signedPackageDirectoryForRetry = null;
            }
            _installationFinished = true;
            if (this.FindControl<ProgressBar>("InstallationProgressBar") is { } finalProgressBar)
                finalProgressBar.IsVisible = false;
            if (this.FindControl<StackPanel>("InstallationProgressPanel") is { } finalProgressPanel)
                finalProgressPanel.IsVisible = false;
            SetWizardStep(5);
            SetTelevisionActionsEnabled(TizenDuid.IsValid(_selectedDuid));
        }
    }

    private void CleanupRetryPackage()
    {
        if (!string.IsNullOrWhiteSpace(_signedPackageDirectoryForRetry) &&
            Directory.Exists(_signedPackageDirectoryForRetry))
        {
            try { Directory.Delete(_signedPackageDirectoryForRetry, recursive: true); }
            catch { /* Best-effort cleanup when the installer window closes. */ }
        }
        _signedPackagePathForRetry = null;
        _signedPackageDirectoryForRetry = null;
    }

    private void ShowInstallationResult(bool success, string message)
    {
        if (this.FindControl<Grid>("InstallationResultPanel") is { } resultPanel)
            resultPanel.IsVisible = true;
        if (this.FindControl<Border>("InstallationResultIconCircle") is { } iconCircle)
        {
            var color = Avalonia.Media.Color.Parse(success ? "#35C978" : "#FF5B62");
            iconCircle.Background = new Avalonia.Media.SolidColorBrush(Avalonia.Media.Color.Parse(success ? "#173F2B" : "#4A2025"));
            iconCircle.BorderBrush = new Avalonia.Media.SolidColorBrush(color);
        }
        if (this.FindControl<Avalonia.Controls.Shapes.Path>("InstallationResultIcon") is { } icon)
        {
            icon.Data = Avalonia.Media.Geometry.Parse(success ? "M 3,12 L 9,18 L 21,6" : "M 6,6 L 18,18 M 18,6 L 6,18");
            // The checkmark has a lower visual center than the cross; compensate slightly upward.
            icon.Margin = success ? new Avalonia.Thickness(0, -2, 0, 0) : new Avalonia.Thickness(0);
            icon.Stroke = new Avalonia.Media.SolidColorBrush(Avalonia.Media.Color.Parse(success ? "#35C978" : "#FF5B62"));
        }
        if (this.FindControl<TextBlock>("InstallationResultTitle") is { } title)
            title.Text = InstallerLocalization.T(success ? "Installation complete" : "Moonlight could not be installed");
        if (this.FindControl<TextBlock>("InstallationResultMessage") is { } resultMessage)
            resultMessage.Text = message;
        if (this.FindControl<TextBlock>("InstallationRetryInstructions") is { } retryInstructions)
            retryInstructions.IsVisible = false;
        if (this.FindControl<Button>("UninstallAndRetryButton") is { } retryButton)
        {
            retryButton.IsVisible = false;
            retryButton.IsEnabled = true;
        }
    }

    private static string HideInternalProtocolNames(string message) =>
        message.Replace("SDB", "connection", StringComparison.OrdinalIgnoreCase);

    private void SetOperationStatus(string message)
    {
        var displayMessage = message;
        var percentMatch = System.Text.RegularExpressions.Regex.Match(
            message, @"(?<!\d)(?<percent>\d{1,3})\s*%",
            System.Text.RegularExpressions.RegexOptions.CultureInvariant);
        if (percentMatch.Success && int.TryParse(percentMatch.Groups["percent"].Value, out var percent))
        {
            percent = Math.Clamp(percent, 0, 100);
            var isInstallPhase = message.Contains("Instal", StringComparison.OrdinalIgnoreCase);
            var isTransferPhase = message.Contains("Transfer", StringComparison.OrdinalIgnoreCase) ||
                                  message.Contains("Transf", StringComparison.OrdinalIgnoreCase);
            var overallProgress = isInstallPhase ? 50 + percent / 2.0
                : isTransferPhase ? percent / 2.0 : percent;
            if (this.FindControl<ProgressBar>("InstallationProgressBar") is { } progressBar)
            {
                progressBar.IsIndeterminate = false;
                progressBar.Value = Math.Max(progressBar.Value, overallProgress);
            }
        }

        // The percentage belongs in the progress bar, not in the status copy.
        displayMessage = System.Text.RegularExpressions.Regex.Replace(displayMessage, @"\s*\d{1,3}\s*%", "");
        displayMessage = System.Text.RegularExpressions.Regex.Replace(displayMessage, @"\s{2,}", " ").Trim();
        if (this.FindControl<TextBlock>("InstallationOperationStatus") is { } status)
            status.Text = InstallerLocalization.T(HideInternalProtocolNames(displayMessage));
    }
}