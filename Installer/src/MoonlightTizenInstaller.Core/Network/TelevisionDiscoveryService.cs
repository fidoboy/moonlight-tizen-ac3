using System.Net;
using System.Net.NetworkInformation;
using System.Net.Sockets;
using System.Text.Json.Nodes;
using System.Text.RegularExpressions;
using TizenSdb.SdbClient;

namespace MoonlightTizenInstaller.Core.Network;

public sealed record DiscoveredTelevision(string IpAddress, string? Duid, string? Name)
{
    public string DisplayName => string.IsNullOrWhiteSpace(Duid)
        ? $"{(string.IsNullOrWhiteSpace(Name) ? "Samsung TV" : Name)} ({IpAddress}) — Developer Mode no disponible"
        : string.IsNullOrWhiteSpace(Name)
            ? $"{IpAddress} — {Duid}"
            : $"{Name} ({IpAddress}) — {Duid}";
}

/// <summary>
/// Discovers Samsung TVs on the directly connected IPv4 LANs through the Samsung TV REST API.
/// DUID retrieval is optional and is attempted only when the SDB developer port is available.
/// This allows the TV-Store installation hand-off to work without Developer Mode.
/// </summary>
public sealed class TelevisionDiscoveryService
{
    private const int SdbPort = 26101;
    private const int ProbeTimeoutMilliseconds = 650;
    private const int MaxHostsPerInterface = 4096;
    private const int MaxConcurrentProbes = 96;
    private static readonly Regex ValidDuid = new("^[A-Za-z0-9]{10,64}$", RegexOptions.Compiled);
    private readonly string _sdbKeyDirectory;

    public TelevisionDiscoveryService(string sdbKeyDirectory)
    {
        _sdbKeyDirectory = sdbKeyDirectory;
        Directory.CreateDirectory(_sdbKeyDirectory);
        // Persist the SDB host key in the installer's per-user data directory, not ~/.sdb.
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
    /// Returns the private IPv4 address of the active LAN interface to enter in the TV's
    /// Developer Mode "Host PC IP" field. Prefer an interface with a default gateway.
    /// </summary>
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

    private static async Task<bool> IsSdbPortOpenAsync(IPAddress address, CancellationToken cancellationToken)
    {
        try
        {
            using var client = new TcpClient();
            using var timeout = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);
            timeout.CancelAfter(ProbeTimeoutMilliseconds);
            await client.ConnectAsync(address, SdbPort, timeout.Token).ConfigureAwait(false);
            return true;
        }
        catch (OperationCanceledException) when (!cancellationToken.IsCancellationRequested) { return false; }
        catch (SocketException) { return false; }
    }

    private static async Task<DiscoveredTelevision?> TryDiscoverTelevisionAsync(IPAddress address, CancellationToken cancellationToken)
    {
        // The Samsung TV REST API is independent of Developer Mode/SDB. It is enough to identify
        // the TV for the TV-Store hand-off installation route.
        var name = await TryGetTvNameAsync(address, cancellationToken).ConfigureAwait(false);
        if (name is null)
            return null;

        // DUID is optional: only certificate issuance and local signing need the developer channel.
        string? duid = null;
        if (await IsSdbPortOpenAsync(address, cancellationToken).ConfigureAwait(false))
            duid = await TryReadDuidAsync(address, cancellationToken).ConfigureAwait(false);

        return new DiscoveredTelevision(address.ToString(), duid, name);
    }

    private static async Task<string?> TryReadDuidAsync(IPAddress address, CancellationToken cancellationToken)
    {
        await using var device = new SdbTcpDevice(address, SdbPort);
        for (var attempt = 1; attempt <= 3; attempt++)
        {
            using var timeout = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);
            timeout.CancelAfter(TimeSpan.FromSeconds(10));
            try
            {
                await device.ConnectAsync(timeout.Token).ConfigureAwait(false);
                var response = await device.ShellCommandAsync("0 getduid", timeout.Token).ConfigureAwait(false);
                var duid = response.Split(new[] { '\r', '\n' }, StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries)
                    .FirstOrDefault(line => ValidDuid.IsMatch(line));
                if (duid is not null)
                    return duid;
            }
            catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested) { throw; }
            catch { /* Samsung TVs can close a fresh SDB session mid-handshake; retry on a fresh socket. */ }

            try { await device.DisconnectAsync().ConfigureAwait(false); } catch { }
            if (attempt < 3)
                await Task.Delay(500, cancellationToken).ConfigureAwait(false);
        }
        return null;
    }

    private static bool IsPrivateIpv4(IPAddress address)
    {
        var bytes = address.GetAddressBytes();
        return bytes[0] == 10 ||
               (bytes[0] == 172 && bytes[1] is >= 16 and <= 31) ||
               (bytes[0] == 192 && bytes[1] == 168);
    }

    private static async Task<string?> TryGetTvNameAsync(IPAddress address, CancellationToken cancellationToken)
    {
        try
        {
            using var http = new HttpClient { Timeout = TimeSpan.FromSeconds(2) };
            using var response = await http.GetAsync($"http://{address}:8001/api/v2/", cancellationToken).ConfigureAwait(false);
            if (!response.IsSuccessStatusCode)
                return null;
            var json = JsonNode.Parse(await response.Content.ReadAsStringAsync(cancellationToken).ConfigureAwait(false));
            var device = json?["device"];
            if (device is null)
                return null;
            var name = device["name"]?.GetValue<string>();
            return string.IsNullOrWhiteSpace(name) ? "Samsung TV" : WebUtility.HtmlDecode(name);
        }
        catch { return null; }
    }

    private static uint ToUInt32(IPAddress address)
    {
        var bytes = address.GetAddressBytes();
        return ((uint)bytes[0] << 24) | ((uint)bytes[1] << 16) | ((uint)bytes[2] << 8) | bytes[3];
    }

    private static IPAddress FromUInt32(uint value) =>
        new(new[] { (byte)(value >> 24), (byte)(value >> 16), (byte)(value >> 8), (byte)value });

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
