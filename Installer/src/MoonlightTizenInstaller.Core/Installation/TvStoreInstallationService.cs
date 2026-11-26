using System.Net;
using System.Security.Cryptography;
using System.Text.Json.Nodes;

namespace MoonlightTizenInstaller.Core.Installation;

/// <summary>
/// Transfers the bundled WGT to Apps2Samsung TV-Store over its HTTP upload endpoint.
/// This is a hand-off: the user confirms installation on the TV, and TV-Store signs
/// the package with the certificate already armed in TV-Store. No SDB connection is used.
/// </summary>
public sealed class TvStoreInstallationService
{
    public const int UploadPort = 8077;
    private const int SamsungApiPort = 8001;
    private const string TvStoreAppId = "A2STVStore.Store";

    private static readonly HttpClient Http = new() { Timeout = Timeout.InfiniteTimeSpan };
    private static readonly TimeSpan ProbeTimeout = TimeSpan.FromSeconds(4);
    private static readonly TimeSpan UploadTimeout = TimeSpan.FromMinutes(5);
    private static readonly TimeSpan LaunchPollInterval = TimeSpan.FromSeconds(2);
    private const int LaunchPollCount = 10;

    public sealed record HandoffResult(string FileName, long Size, string Sha256, bool TvStoreOpened);

    public async Task<HandoffResult> SendForInstallationAsync(
        string televisionIp,
        string packagePath,
        IProgress<string>? progress = null,
        CancellationToken cancellationToken = default)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(televisionIp);
        ArgumentException.ThrowIfNullOrWhiteSpace(packagePath);

        if (!File.Exists(packagePath))
            throw new FileNotFoundException("No se encuentra el paquete Moonlight.wgt.", packagePath);

        if (!string.Equals(Path.GetExtension(packagePath), ".wgt", StringComparison.OrdinalIgnoreCase))
            throw new ArgumentException("El paquete debe tener extensión .wgt.", nameof(packagePath));

        if (!await EnsureTvStoreRunningAsync(televisionIp, progress, cancellationToken).ConfigureAwait(false))
        {
            throw new InvalidOperationException(
                "No se ha podido abrir Apps2Samsung TV-Store en el televisor. " +
                "Comprueba que TV-Store está instalado y que el televisor está encendido y conectado a la red.");
        }

        cancellationToken.ThrowIfCancellationRequested();
        progress?.Report("Enviando Moonlight.wgt a TV-Store…");

        var fileName = Path.GetFileName(packagePath);
        string localHash;
        await using (var source = File.OpenRead(packagePath))
            localHash = Convert.ToHexString(await SHA256.HashDataAsync(source, cancellationToken).ConfigureAwait(false))
                .ToLowerInvariant();

        JsonNode? answer;
        int statusCode;
        using (var timeout = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken))
        {
            timeout.CancelAfter(UploadTimeout);
            try
            {
                await using var body = File.OpenRead(packagePath);
                using var content = new StreamContent(body);
                using var response = await Http.PutAsync(
                    UploadUri(televisionIp, fileName),
                    content,
                    timeout.Token).ConfigureAwait(false);

                statusCode = (int)response.StatusCode;
                var responseText = await response.Content.ReadAsStringAsync(timeout.Token).ConfigureAwait(false);
                try { answer = JsonNode.Parse(responseText); }
                catch (System.Text.Json.JsonException) { answer = null; }
            }
            catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested)
            {
                throw;
            }
            catch (Exception ex)
            {
                throw new InvalidOperationException($"TV-Store no ha podido recibir el paquete: {ex.Message}", ex);
            }
        }

        if (answer?["ok"]?.GetValue<bool>() != true)
        {
            var reason = answer?["error"]?.GetValue<string>() ?? $"HTTP {statusCode}";
            throw new InvalidOperationException($"TV-Store ha rechazado Moonlight.wgt: {reason}");
        }

        var upload = answer["upload"];
        var receivedName = upload?["name"]?.GetValue<string>() ?? fileName;
        var receivedSize = upload?["size"]?.GetValue<long>() ?? 0;
        var receivedHash = (upload?["sha256"]?.GetValue<string>() ?? string.Empty).ToLowerInvariant();

        if (!string.Equals(receivedHash, localHash, StringComparison.Ordinal))
        {
            throw new InvalidOperationException(
                $"La copia recibida por el televisor no coincide con el original (SHA-256: {receivedHash}; enviado: {localHash}).");
        }

        progress?.Report("Paquete recibido íntegramente. Abriendo TV-Store en el televisor…");
        var opened = await TryLaunchTvStoreAsync(televisionIp, cancellationToken).ConfigureAwait(false);

        progress?.Report(opened
            ? "Moonlight.wgt está esperando confirmación en la pantalla del televisor."
            : "Moonlight.wgt se ha transferido. Abre TV-Store manualmente en el televisor para confirmar la instalación.");

        return new HandoffResult(receivedName, receivedSize, receivedHash, opened);
    }

    private static async Task<bool> EnsureTvStoreRunningAsync(
        string televisionIp,
        IProgress<string>? progress,
        CancellationToken cancellationToken)
    {
        if (await IsUploadEndpointAvailableAsync(televisionIp, cancellationToken).ConfigureAwait(false))
            return true;

        progress?.Report("Abriendo Apps2Samsung TV-Store mediante la API de red del televisor…");
        if (!await TryLaunchTvStoreAsync(televisionIp, cancellationToken).ConfigureAwait(false))
            return false;

        for (var attempt = 0; attempt < LaunchPollCount; attempt++)
        {
            await Task.Delay(LaunchPollInterval, cancellationToken).ConfigureAwait(false);
            if (await IsUploadEndpointAvailableAsync(televisionIp, cancellationToken).ConfigureAwait(false))
                return true;
        }

        return false;
    }

    private static async Task<bool> IsUploadEndpointAvailableAsync(string televisionIp, CancellationToken cancellationToken)
    {
        using var timeout = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);
        timeout.CancelAfter(ProbeTimeout);
        try
        {
            using var response = await Http.GetAsync(
                UploadUri(televisionIp),
                HttpCompletionOption.ResponseHeadersRead,
                timeout.Token).ConfigureAwait(false);
            return response.IsSuccessStatusCode;
        }
        catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested)
        {
            throw;
        }
        catch
        {
            return false;
        }
    }

    // Samsung's public REST app-launch endpoint; this is the same no-SDB route used by
    // Apps2Samsung's SamsungRemoteApps when no SDB engine is supplied.
    private static async Task<bool> TryLaunchTvStoreAsync(string televisionIp, CancellationToken cancellationToken)
    {
        try
        {
            using var response = await Http.PostAsync(
                $"http://{televisionIp}:{SamsungApiPort}/api/v2/applications/{Uri.EscapeDataString(TvStoreAppId)}",
                content: null,
                cancellationToken).ConfigureAwait(false);
            return response.IsSuccessStatusCode;
        }
        catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested)
        {
            throw;
        }
        catch
        {
            return false;
        }
    }

    private static Uri UploadUri(string televisionIp, string? fileName = null) =>
        new($"http://{televisionIp}:{UploadPort}/upload" +
            (fileName is null ? string.Empty : $"?name={Uri.EscapeDataString(fileName)}"));
}
