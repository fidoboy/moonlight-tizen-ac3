namespace MoonlightTizenInstaller.Core;

/// <summary>
/// Coordinates the guided TV discovery, certificate preparation, package signing
/// and installation workflow. Platform-specific UI and persistence stay outside
/// this assembly.
/// </summary>
public interface IInstallerWorkflow
{
    Task DiscoverTelevisionsAsync(CancellationToken cancellationToken);
    Task PrepareSigningCertificatesAsync(CancellationToken cancellationToken);
    Task SignAndInstallAsync(CancellationToken cancellationToken);
}
