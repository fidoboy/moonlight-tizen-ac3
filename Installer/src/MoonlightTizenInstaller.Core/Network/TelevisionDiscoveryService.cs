using System.Net;
using System.Net.NetworkInformation;
using System.Net.Sockets;
using System.Text.Json.Nodes;
using System.Text.RegularExpressions;
using TizenSdb.SdbClient;

namespace MoonlightTizenInstaller.Core.Network;

public sealed record DiscoveredTelevision(
    string IpAddress,
    string? Duid,
    string? Name,
    int SdbPort,
    bool TvStoreRelayAvailable)
{
    public const int DirectSdbPort = 26101;
    public bool UsesTvStoreRelay => SdbPort != DirectSdbPort;

    public string DisplayName
    {
        get
        {
            var name = string.IsNullOrWhiteSpace(Name) ? "Samsung TV" : Name;
            var endpoint = UsesTvStoreRelay ? $"SDB relay :{SdbPort}" : $"SDB :{SdbPort}";
            return string.IsNullOrWhiteSpace(Duid)
                ? $"{name} ({IpAddress}) — {endpoint}"
                : $"{name} ({IpAddress}) — {endpoint} — {Duid}";
        }
    }
}

/// <summary>
/// Finds Samsung TVs through the Samsung REST API without requiring Developer Mode.
/// The caller first attempts the optional TV-Store upload hand-off; only if that route cannot
/// complete does it retrieve the DUID automatically over the verified SDB route.
/// </summary>
public sealed class TelevisionDiscoveryService
{
    private const int SdbPort = DiscoveredTelevision.DirectSdbPort;
    private const int TvStoreServicePort = 8077;
    private const int ProbeTimeoutMilliseconds = 650;
    private const int MaxHostsPerInterface = 4096;
    private const int MaxConcurrentProbes = 96;
    private static readonly Regex ValidDuid = new("^[A-Za-z0-9]{10,64}$", RegexOptions.Compiled);
    private static readonly HttpClient Http = new() { Timeout = TimeSpan.FromSeconds(2) };
    private readonly string _sdbKeyDirectory;
    private sealed record TelevisionApiInfo(string Name, string? DeveloperIp);

    public TelevisionDiscoveryService(string sdbKeyDirectory)
    {
        _sdbKeyDirectory = sdbKeyDirectory;
        Directory.CreateDirectory(_sdbKeyDirectory);
        SdbTcpDevice.KeyDirectory = _sdbKeyDirectory;
    }

    public async Task<IReadOnlyList<DiscoveredTelevision>> DiscoverAsync(
        IProgress<string>? progress = null,
        CancellationToken cancellationToken = default)
    {
        SdbTcpDevice.KeyDirectory = _sdbKeyDirectory;
        var addresses = GetCandidateAddresses();
        if (addresses.Count == 0)
            return Array.Empty<DiscoveredTelevision>();

        progress?.Report($"Buscando televisores Samsung en la red ({addresses.Count} direcciones posibles)…");
        using var gate = new SemaphoreSlim(MaxConcurrentProbes);
        var found = new System.Collections.Concurrent.ConcurrentBag<DiscoveredTelevision>();

        await Task.WhenAll(addresses.Select(async ip =>
        {
            await gate.WaitAsync(cancellationToken).ConfigureAwait(false);
            try
            {
                var television = await TryDiscoverTelevisionAsync(ip, cancellationToken).ConfigureAwait(false);
                if (television is not null)
                    found.Add(television);
            }
            finally
            {
                gate.Release();
            }
        })).ConfigureAwait(false);

        return found.OrderBy(item => IPAddress.Parse(item.IpAddress).GetAddressBytes(), ByteArrayComparer.Instance)
            .ToArray();
    }

    /// <summary>
    /// Returns the IPv4 address to enter in Developer Mode. TV-Store's relay requires
    /// Host PC IP 127.0.0.1; direct SDB requires this computer's LAN address.
    /// </summary>
    public string? GetDeveloperModeHostIp(bool useTvStoreRelay) =>
        useTvStoreRelay ? IPAddress.Loopback.ToString() : GetHostIpv4Address();

    public string? GetHostIpv4Address()
    {
        var candidates = new List<(IPAddress Address, bool HasGateway, int Metric)>();
        foreach (var networkInterface in NetworkInterface.GetAllNetworkInterfaces())
        {
            if (networkInterface.OperationalStatus != OperationalStatus.Up ||
                networkInterface.NetworkInterfaceType is NetworkInterfaceType.Loopback or NetworkInterfaceType.Tunnel)
                continue;

            try
            {
                var properties = networkInterface.GetIPProperties();
                var hasGateway = properties.GatewayAddresses.Any(gateway =>
                    gateway.Address.AddressFamily == AddressFamily.InterNetwork &&
                    !gateway.Address.Equals(IPAddress.Any));
                var metric = properties.GetIPv4Properties()?.Index ?? int.MaxValue;
                foreach (var unicast in properties.UnicastAddresses)
                {
                    var address = unicast.Address;
                    if (address.AddressFamily == AddressFamily.InterNetwork &&
                        !IPAddress.IsLoopback(address) && IsPrivateIpv4(address))
                        candidates.Add((address, hasGateway, metric));
                }
            }
            catch { /* Ignore interfaces that disappear while the adapter list is inspected. */ }
        }

        return candidates
            .OrderByDescending(candidate => candidate.HasGateway)
            .ThenBy(candidate => candidate.Metric)
            .Select(candidate => candidate.Address.ToString())
            .FirstOrDefault();
    }

    private static List<IPAddress> GetCandidateAddresses()
    {
        var candidates = new HashSet<IPAddress>();
        foreach (var networkInterface in NetworkInterface.GetAllNetworkInterfaces())
        {
            if (networkInterface.OperationalStatus != OperationalStatus.Up ||
                networkInterface.NetworkInterfaceType is NetworkInterfaceType.Loopback or NetworkInterfaceType.Tunnel)
                continue;

            IPInterfaceProperties properties;
            try { properties = networkInterface.GetIPProperties(); }
            catch { continue; }

            foreach (var unicast in properties.UnicastAddresses)
            {
                var address = unicast.Address;
                var mask = unicast.IPv4Mask;
                if (address.AddressFamily != AddressFamily.InterNetwork || mask is null ||
                    IPAddress.IsLoopback(address) || address.Equals(IPAddress.Any) || !IsPrivateIpv4(address))
                    continue;

                var ip = ToUInt32(address);
                var maskBits = ToUInt32(mask);
                var network = ip & maskBits;
                var broadcast = network | ~maskBits;
                var hostCount = (ulong)broadcast - network;
                if (hostCount < 2 || hostCount > MaxHostsPerInterface)
                    continue;

                for (uint current = network + 1; current < broadcast; current++)
                {
                    if (current != ip)
                        candidates.Add(FromUInt32(current));
                }
            }
        }
        return candidates.ToList();
    }

    private async Task<DiscoveredTelevision?> TryDiscoverTelevisionAsync(
        IPAddress address,
        CancellationToken cancellationToken)
    {
        var apiInfo = await TryGetTelevisionApiInfoAsync(address, cancellationToken).ConfigureAwait(false);
        if (apiInfo is null)
            return null;

        // TV-Store 0.3.15+ exposes GET /relay on its service port. Require its JSON status
        // to say enabled and listening; an open HTTP port alone does not prove a usable relay.
        var relayPort = await TryGetActiveTvStoreRelayPortAsync(address, cancellationToken).ConfigureAwait(false);
        var relayAvailable = relayPort is { } candidateRelayPort &&
                             await IsTcpPortOpenAsync(address, candidateRelayPort, cancellationToken).ConfigureAwait(false);
        var developerUsesLoopback = string.Equals(apiInfo.DeveloperIp?.Trim(), IPAddress.Loopback.ToString(), StringComparison.Ordinal);
        var tryRelayFirst = relayAvailable && (developerUsesLoopback || string.IsNullOrWhiteSpace(apiInfo.DeveloperIp));

        var selectedPort = tryRelayFirst ? relayPort!.Value : SdbPort;
        return new DiscoveredTelevision(address.ToString(), null, apiInfo.Name, selectedPort, relayAvailable);
    }

    private static async Task<int?> TryGetActiveTvStoreRelayPortAsync(
        IPAddress address,
        CancellationToken cancellationToken)
    {
        try
        {
            using var response = await Http.GetAsync($"http://{address}:{TvStoreServicePort}/relay", cancellationToken).ConfigureAwait(false);
            if (!response.IsSuccessStatusCode)
                return null;

            var json = JsonNode.Parse(await response.Content.ReadAsStringAsync(cancellationToken).ConfigureAwait(false));
            if (json?["ok"]?.GetValue<bool>() != true)
                return null;

            var relay = json["relay"];
            if (relay?["enabled"]?.GetValue<bool>() != true || relay["listening"]?.GetValue<bool>() != true)
                return null;

            var port = relay["port"]?.GetValue<int>();
            if (port is null or < 1024 or > 65535 || port == SdbPort || port == TvStoreServicePort)
                return null;

            return port;
        }
        catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested) { throw; }
        catch { return null; }
    }

    private static async Task<bool> IsTcpPortOpenAsync(IPAddress address, int port, CancellationToken cancellationToken)
    {
        try
        {
            using var client = new TcpClient();
            using var timeout = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);
            timeout.CancelAfter(ProbeTimeoutMilliseconds);
            await client.ConnectAsync(address, port, timeout.Token).ConfigureAwait(false);
            return true;
        }
        catch (OperationCanceledException) when (!cancellationToken.IsCancellationRequested) { return false; }
        catch (SocketException) { return false; }
    }

    /// <summary>
    /// Reads the DUID only after the optional TV-Store hand-off has been attempted.
    /// The selected endpoint follows Developer Mode's Host PC IP; direct SDB and the
    /// confirmed TV-Store relay are tried as fallbacks when the preferred route fails.
    /// </summary>
    public async Task<DiscoveredTelevision> RetrieveDuidAsync(
        DiscoveredTelevision television,
        IProgress<string>? progress = null,
        CancellationToken cancellationToken = default)
    {
        ArgumentNullException.ThrowIfNull(television);
        var address = IPAddress.Parse(television.IpAddress);
        var ports = new List<int> { television.SdbPort };
        if (television.SdbPort != SdbPort)
            ports.Add(SdbPort);

        if (television.TvStoreRelayAvailable)
        {
            var relayPort = await TryGetActiveTvStoreRelayPortAsync(address, cancellationToken).ConfigureAwait(false);
            if (relayPort is { } port && !ports.Contains(port))
                ports.Add(port);
        }

        foreach (var port in ports)
        {
            progress?.Report($"Obteniendo automáticamente el DUID mediante SDB en {television.IpAddress}:{port}…");
            if (!await IsTcpPortOpenAsync(address, port, cancellationToken).ConfigureAwait(false))
                continue;

            var duid = await TryReadDuidAsync(address, port, cancellationToken).ConfigureAwait(false);
            if (duid is not null)
                return television with { Duid = duid, SdbPort = port };
        }

        return television with { Duid = null };
    }

    private async Task<string?> TryReadDuidAsync(IPAddress address, int port, CancellationToken cancellationToken)
    {
        SdbTcpDevice.KeyDirectory = _sdbKeyDirectory;
        await using var device = new SdbTcpDevice(address, port);
        using var timeout = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);
        timeout.CancelAfter(TimeSpan.FromSeconds(15));

        try
        {
            await device.ConnectAsync(timeout.Token).ConfigureAwait(false);
            var response = await device.ShellCommandAsync("0 getduid", timeout.Token).ConfigureAwait(false);
            return response.Split(new[] { '\r', '\n' }, StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries)
                .FirstOrDefault(line => ValidDuid.IsMatch(line));
        }
        catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested) { throw; }
        catch { return null; }
    }

    private static bool IsPrivateIpv4(IPAddress address)
    {
        var bytes = address.GetAddressBytes();
        return bytes[0] == 10 || (bytes[0] == 172 && bytes[1] is >= 16 and <= 31) || (bytes[0] == 192 && bytes[1] == 168);
    }

    private static async Task<TelevisionApiInfo?> TryGetTelevisionApiInfoAsync(IPAddress address, CancellationToken cancellationToken)
    {
        try
        {
            using var response = await Http.GetAsync($"http://{address}:8001/api/v2/", cancellationToken).ConfigureAwait(false);
            if (!response.IsSuccessStatusCode)
                return null;

            var json = JsonNode.Parse(await response.Content.ReadAsStringAsync(cancellationToken).ConfigureAwait(false));
            var device = json?["device"];
            if (device is null)
                return null;

            var name = device["name"]?.GetValue<string>();
            return new TelevisionApiInfo(
                string.IsNullOrWhiteSpace(name) ? "Samsung TV" : WebUtility.HtmlDecode(name),
                device["developerIP"]?.GetValue<string>());
        }
        catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested) { throw; }
        catch { return null; }
    }

    private static uint ToUInt32(IPAddress address)
    {
        var bytes = address.GetAddressBytes();
        return ((uint)bytes[0] << 24) | ((uint)bytes[1] << 16) | ((uint)bytes[2] << 8) | bytes[3];
    }

    private static IPAddress FromUInt32(uint value) => new(new[] { (byte)(value >> 24), (byte)(value >> 16), (byte)(value >> 8), (byte)value });

    private sealed class ByteArrayComparer : IComparer<byte[]>
    {
        public static ByteArrayComparer Instance { get; } = new();
        public int Compare(byte[]? x, byte[]? y)
        {
            if (ReferenceEquals(x, y)) return 0;
            if (x is null) return -1;
            if (y is null) return 1;
            for (var i = 0; i < Math.Min(x.Length, y.Length); i++)
            {
                var comparison = x[i].CompareTo(y[i]);
                if (comparison != 0) return comparison;
            }
            return x.Length.CompareTo(y.Length);
        }
    }
}
