using System.IO.Compression;
using System.Net;
using System.Text;
using System.Text.RegularExpressions;
using System.Xml.Linq;
using MoonlightTizenInstaller.Core.Network;
using TizenSdb.SdbClient;

namespace MoonlightTizenInstaller.Core.Installation;

public sealed class SdbEndpointUnavailableException : IOException
{
    public SdbEndpointUnavailableException(string message, Exception innerException)
        : base(message, innerException) { }
}

/// <summary>
/// Installs a signed WGT through the Samsung SDB protocol. The connection endpoint is selected
/// during discovery: TV-Store's verified relay when usable, otherwise the conventional port 26101.
/// </summary>
public sealed class SdbInstallationService
{
    private const string DefaultSdkToolPath = "/opt/usr/apps/tmp";
    private const string RemotePackageName = "MoonlightInstaller.wgt";
    private static readonly Regex InstallProgress = new(@"installing\[(\d{1,3})\]", RegexOptions.IgnoreCase | RegexOptions.Compiled);

    public sealed record InstallationResult(string PackageId, int SdbPort, string Output);

    public async Task<InstallationResult> InstallAsync(
        string televisionIp,
        int sdbPort,
        string packagePath,
        IProgress<string>? progress = null,
        CancellationToken cancellationToken = default)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(televisionIp);
        ArgumentException.ThrowIfNullOrWhiteSpace(packagePath);
        if (!File.Exists(packagePath))
            throw new FileNotFoundException("No se encuentra el WGT que se va a instalar.", packagePath);
        if (sdbPort is < 1 or > 65535)
            throw new ArgumentOutOfRangeException(nameof(sdbPort));

        var packageId = ReadPackageId(packagePath);
        if (packageId.Any(char.IsWhiteSpace))
            throw new InvalidDataException("El identificador de aplicación del WGT contiene espacios y no se puede enviar mediante SDB.");

        progress?.Report($"Connecting over the connection to {televisionIp}:{sdbPort}…");
        await using var device = new SdbTcpDevice(IPAddress.Parse(televisionIp), sdbPort);
        try
        {
            await device.ConnectAsync(cancellationToken).ConfigureAwait(false);
        }
        catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested)
        {
            throw;
        }
        catch (Exception ex) when (sdbPort != DiscoveredTelevision.DirectSdbPort)
        {
            throw new SdbEndpointUnavailableException(
                $"El endpoint SDB alternativo {televisionIp}:{sdbPort} ha dejado de estar disponible.",
                ex);
        }

        var capabilities = await device.CapabilityAsync(cancellationToken).ConfigureAwait(false);
        var sdkToolPath = capabilities.TryGetValue("sdk_toolpath", out var reportedPath) &&
                          !string.IsNullOrWhiteSpace(reportedPath)
            ? reportedPath.Trim().TrimEnd('/')
            : DefaultSdkToolPath;
        var remotePath = $"{sdkToolPath}/{RemotePackageName}";

        progress?.Report("Transferring the signed package to the TV…");
        await using (var package = File.OpenRead(packagePath))
        {
            var transferProgress = new Progress<double>(fraction =>
                progress?.Report($"Transferring Moonlight.wgt… {Math.Clamp((int)Math.Round(fraction), 0, 100)} %"));
            await device.PushAsync(package, remotePath, transferProgress, cancellationToken).ConfigureAwait(false);
        }

        progress?.Report("Requesting installation from Tizen…");
        var output = new StringBuilder();
        await foreach (var line in device.ShellCommandLinesAsync(
                           $"0 vd_appinstall {packageId} {remotePath}",
                           cancellationToken).ConfigureAwait(false))
        {
            output.AppendLine(line);
            var match = InstallProgress.Match(line);
            if (match.Success && int.TryParse(match.Groups[1].Value, out var percent))
                progress?.Report($"Installing Moonlight… {Math.Clamp(percent, 0, 100)} %");
        }

        var result = output.ToString();
        if (string.IsNullOrWhiteSpace(result))
            throw new InvalidOperationException("El televisor no ha devuelto ningún resultado para la solicitud de instalación.");

        if (result.Contains("install failed[", StringComparison.OrdinalIgnoreCase) ||
            result.Contains("val[fail]", StringComparison.OrdinalIgnoreCase) ||
            result.Contains("download failed[116]", StringComparison.OrdinalIgnoreCase))
        {
            throw new InvalidOperationException($"Tizen ha rechazado la instalación de Moonlight:{Environment.NewLine}{result.Trim()}");
        }

        var confirmed = result.Contains("install completed", StringComparison.OrdinalIgnoreCase) ||
                        result.Contains("installing[100]", StringComparison.OrdinalIgnoreCase) ||
                        result.Contains("appInstall return : [0]", StringComparison.OrdinalIgnoreCase);
        if (!confirmed)
            throw new InvalidOperationException(
                $"La TV no ha confirmado que la instalación haya terminado correctamente. Respuesta de SDB:{Environment.NewLine}{result.Trim()}");

        progress?.Report("Tizen has confirmed the Moonlight installation.");
        return new InstallationResult(packageId, sdbPort, result.Trim());
    }

    public async Task<string> UninstallAsync(
        string televisionIp,
        int sdbPort,
        string packagePath,
        IProgress<string>? progress = null,
        CancellationToken cancellationToken = default)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(televisionIp);
        ArgumentException.ThrowIfNullOrWhiteSpace(packagePath);
        if (!File.Exists(packagePath))
            throw new FileNotFoundException("No se encuentra el WGT firmado necesario para identificar la aplicación.", packagePath);
        if (sdbPort is < 1 or > 65535)
            throw new ArgumentOutOfRangeException(nameof(sdbPort));

        var packageId = ReadPackageId(packagePath);
        progress?.Report("Uninstalling Moonlight…");

        await using var device = new SdbTcpDevice(IPAddress.Parse(televisionIp), sdbPort);
        try
        {
            await device.ConnectAsync(cancellationToken).ConfigureAwait(false);
        }
        catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested)
        {
            throw;
        }
        catch (Exception ex) when (sdbPort != DiscoveredTelevision.DirectSdbPort)
        {
            throw new SdbEndpointUnavailableException(
                $"The SDB endpoint {televisionIp}:{sdbPort} is no longer available.",
                ex);
        }

        var output = new StringBuilder();
        await foreach (var line in device.ShellCommandLinesAsync(
                           $"0 vd_appuninstall {packageId}",
                           cancellationToken).ConfigureAwait(false))
        {
            output.AppendLine(line);
        }

        var result = output.ToString().Trim();
        if (string.IsNullOrWhiteSpace(result) ||
            result.Contains("uninstall failed[", StringComparison.OrdinalIgnoreCase) ||
            result.Contains("val[fail]", StringComparison.OrdinalIgnoreCase) ||
            result.Contains("app uninstall return : [1]", StringComparison.OrdinalIgnoreCase))
        {
            throw new InvalidOperationException(
                string.IsNullOrWhiteSpace(result)
                    ? "The TV did not return a result for the Moonlight uninstall request."
                    : $"The TV could not uninstall Moonlight: {result}");
        }

        var confirmed = result.Contains("app uninstall return : [0]", StringComparison.OrdinalIgnoreCase) ||
                        result.Contains("uninstall completed", StringComparison.OrdinalIgnoreCase) ||
                        result.Contains("uninstalling[100]", StringComparison.OrdinalIgnoreCase);
        if (!confirmed)
            throw new InvalidOperationException(
                $"The TV did not confirm that Moonlight was uninstalled successfully: {result}");

        return result;
    }

    private static string ReadPackageId(string packagePath)
    {
        using var archive = ZipFile.OpenRead(packagePath);
        var config = archive.GetEntry("config.xml")
            ?? throw new InvalidDataException("El WGT no contiene config.xml.");

        using var stream = config.Open();
        var document = XDocument.Load(stream);
        var application = document.Descendants()
            .FirstOrDefault(element => string.Equals(element.Name.LocalName, "application", StringComparison.OrdinalIgnoreCase));
        var packageId = application?.Attribute("id")?.Value;
        if (string.IsNullOrWhiteSpace(packageId))
            packageId = document.Root?.Attribute("id")?.Value;

        if (string.IsNullOrWhiteSpace(packageId))
            throw new InvalidDataException("No se ha podido obtener el identificador de aplicación de config.xml.");

        return packageId.Trim();
    }
}
