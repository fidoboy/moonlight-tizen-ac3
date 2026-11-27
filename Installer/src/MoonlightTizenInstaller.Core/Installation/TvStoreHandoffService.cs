using System.Net;
using System.Security.Cryptography;
using System.Text.Json.Nodes;

namespace MoonlightTizenInstaller.Core.Installation;

/// <summary>
/// Hands the bundled WGT to an installed and reachable TV-Store instance.
/// The caller must treat a failed handoff as a terminal result when the user has
/// explicitly chosen this route; it must not silently fall back to another installer.
/// </summary>
public sealed class TvStoreHandoffService
{
    public const int ServicePort = 8077;
    private const int RestPort = 8001;
    private const string TvStoreAppId = "A2STVStore.Store";
    private const int LaunchPollCount = 10;
    private static readonly TimeSpan ProbeTimeout = TimeSpan.FromSeconds(4);
    private static readonly TimeSpan UploadTimeout = TimeSpan.FromMinutes(5);
    private static readonly TimeSpan LaunchPollInterval = TimeSpan.FromSeconds(2);
    private static readonly HttpClient Http = new() { Timeout = Timeout.InfiniteTimeSpan };

    public sealed record HandoffResult(string FileName, long Size, string Sha256, bool TvStoreOpened);

    /// <summary>
    /// Performs a read-only check for an installed TV-Store instance or its upload service.
    /// This method never launches TV-Store.
    /// </summary>
    public async Task<bool> IsInstalledAsync(
        string televisionIp,
        CancellationToken cancellationToken = default)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(televisionIp);
        return await IsUploadPageAvailableAsync(televisionIp, cancellationToken).ConfigureAwait(false) ||
               await IsTvStoreInstalledAsync(televisionIp, cancellationToken).ConfigureAwait(false);
    }

    /// <summary>
    /// Returns null when TV-Store is not reachable, cannot be started, or refuses the upload.
    /// A non-null result means the WGT is waiting in TV-Store for the user to accept.
    /// It does not mean that the user has completed installation.
    /// </summary>
    public async Task<HandoffResult?> TrySendForInstallationAsync(
        string televisionIp,
        string packagePath,
        IProgress<string>? progress = null,
        CancellationToken cancellationToken = default)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(televisionIp);
        ArgumentException.ThrowIfNullOrWhiteSpace(packagePath);
        if (!File.Exists(packagePath))
            throw new FileNotFoundException("No se encuentra el WGT que se va a enviar a TV-Store.", packagePath);

        var serviceAvailable = await IsUploadPageAvailableAsync(televisionIp, cancellationToken).ConfigureAwait(false);
        var launchAccepted = false;

        if (!serviceAvailable)
        {
            if (!await IsTvStoreInstalledAsync(televisionIp, cancellationToken).ConfigureAwait(false))
            {
                progress?.Report("TV-Store is not installed or its presence cannot be confirmed.");
                return null;
            }

            progress?.Report("TV-Store is installed. Launching it to prepare for package reception…");
            launchAccepted = await LaunchTvStoreAsync(televisionIp, cancellationToken).ConfigureAwait(false);
            if (!launchAccepted)
            {
                progress?.Report("Could not launch TV-Store.");
                return null;
            }

            for (var attempt = 0; attempt < LaunchPollCount; attempt++)
            {
                await Task.Delay(LaunchPollInterval, cancellationToken).ConfigureAwait(false);
                if (await IsUploadPageAvailableAsync(televisionIp, cancellationToken).ConfigureAwait(false))
                {
                    serviceAvailable = true;
                    break;
                }
            }
        }

        if (!serviceAvailable)
        {
            progress?.Report("TV-Store is installed, but its receiving service is unavailable.");
            return null;
        }

        progress?.Report("TV-Store is ready. Sending Moonlight.wgt…");
        var upload = await UploadAsync(televisionIp, packagePath, progress, cancellationToken).ConfigureAwait(false);
        if (upload is null)
        {
            progress?.Report("TV-Store did not accept or verify the package.");
            return null;
        }

        // Uploads remain pending on the TV even if launching the foreground app fails.
        // Try to bring it forward so the user sees the Install/Not now prompt.
        var opened = await LaunchTvStoreAsync(televisionIp, cancellationToken).ConfigureAwait(false);
        progress?.Report(opened
            ? "Moonlight.wgt se ha entregado a TV-Store. Confirma «Instalar» en la pantalla del televisor."
            : "Moonlight.wgt se ha entregado a TV-Store. Abre TV-Store en el televisor y confirma «Instalar».");

        return upload with { TvStoreOpened = opened || launchAccepted };
    }

    private static async Task<bool> IsUploadPageAvailableAsync(string televisionIp, CancellationToken cancellationToken)
    {
        using var timeout = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);
        timeout.CancelAfter(ProbeTimeout);
        try
        {
            using var response = await Http.GetAsync(
                $"http://{televisionIp}:{ServicePort}/upload",
                HttpCompletionOption.ResponseHeadersRead,
                timeout.Token).ConfigureAwait(false);
            if (!response.IsSuccessStatusCode)
                return false;

            var html = await response.Content.ReadAsStringAsync(timeout.Token).ConfigureAwait(false);
            return html.Contains("Send an app to this TV", StringComparison.OrdinalIgnoreCase) &&
                   html.Contains("/upload?name=", StringComparison.OrdinalIgnoreCase);
        }
        catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested) { throw; }
        catch { return false; }
    }

    private static async Task<bool> IsTvStoreInstalledAsync(string televisionIp, CancellationToken cancellationToken)
    {
        using var timeout = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);
        timeout.CancelAfter(ProbeTimeout);
        try
        {
            using var response = await Http.GetAsync(
                $"http://{televisionIp}:{RestPort}/api/v2/applications/{Uri.EscapeDataString(TvStoreAppId)}",
                HttpCompletionOption.ResponseHeadersRead,
                timeout.Token).ConfigureAwait(false);
            return response.IsSuccessStatusCode;
        }
        catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested) { throw; }
        catch { return false; }
    }

    private static async Task<bool> LaunchTvStoreAsync(string televisionIp, CancellationToken cancellationToken)
    {
        using var timeout = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);
        timeout.CancelAfter(ProbeTimeout);
        try
        {
            using var response = await Http.PostAsync(
                $"http://{televisionIp}:{RestPort}/api/v2/applications/{Uri.EscapeDataString(TvStoreAppId)}",
                content: null,
                timeout.Token).ConfigureAwait(false);
            return response.IsSuccessStatusCode;
        }
        catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested) { throw; }
        catch { return false; }
    }

    private static async Task<HandoffResult?> UploadAsync(
        string televisionIp,
        string packagePath,
        IProgress<string>? progress,
        CancellationToken cancellationToken)
    {
        // TV-Store identifies the catalog application by its canonical release filename.
        // Never expose the installer temporary/random filename to its upload endpoint.
        const string fileName = "Moonlight.wgt";
        string localSha256;
        long localSize;
        await using (var source = File.OpenRead(packagePath))
        {
            localSize = source.Length;
            localSha256 = Convert.ToHexString(await SHA256.HashDataAsync(source, cancellationToken).ConfigureAwait(false))
                .ToLowerInvariant();
        }

        using var timeout = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);
        timeout.CancelAfter(UploadTimeout);
        try
        {
            await using var package = File.OpenRead(packagePath);
            using var content = new StreamContent(package);
            content.Headers.ContentType = new System.Net.Http.Headers.MediaTypeHeaderValue("application/octet-stream");
            using var response = await Http.PutAsync(
                $"http://{televisionIp}:{ServicePort}/upload?name={Uri.EscapeDataString(fileName)}",
                content,
                timeout.Token).ConfigureAwait(false);

            var responseText = await response.Content.ReadAsStringAsync(timeout.Token).ConfigureAwait(false);
            JsonNode? answer;
            try { answer = JsonNode.Parse(responseText); }
            catch { answer = null; }

            if (!response.IsSuccessStatusCode || answer?["ok"]?.GetValue<bool>() != true)
            {
                var reason = answer?["error"]?.GetValue<string>() ?? $"HTTP {(int)response.StatusCode}";
                progress?.Report($"TV-Store rejected the package: {reason}");
                return null;
            }

            var upload = answer["upload"];
            var receivedSha256 = upload?["sha256"]?.GetValue<string>()?.ToLowerInvariant();
            var receivedSize = upload?["size"]?.GetValue<long>();
            if (!string.Equals(receivedSha256, localSha256, StringComparison.Ordinal) ||
                receivedSize != localSize)
            {
                progress?.Report("TV-Store did not confirm the integrity of the received WGT.");
                return null;
            }

            return new HandoffResult(fileName, localSize, localSha256, TvStoreOpened: false);
        }
        catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested) { throw; }
        catch (Exception ex)
        {
            progress?.Report($"Could not transfer the WGT to TV-Store: {ex.Message}");
            return null;
        }
    }
}
