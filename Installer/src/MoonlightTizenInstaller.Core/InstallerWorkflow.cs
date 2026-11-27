namespace MoonlightTizenInstaller.Core;

/// <summary>Coordinates the guided installer workflow.</summary>
public interface IInstallerWorkflow
{
    Task DiscoverTelevisionsAsync(CancellationToken cancellationToken);
    Task PrepareSigningCertificatesAsync(CancellationToken cancellationToken);
    Task SignAndInstallAsync(CancellationToken cancellationToken);
}
