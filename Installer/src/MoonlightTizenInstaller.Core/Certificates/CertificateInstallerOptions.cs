namespace MoonlightTizenInstaller.Core.Certificates;

/// <summary>Persistent paths used by the certificate subsystem.</summary>
public sealed record CertificateInstallerOptions(
    string DataDirectory,
    string CertificateAuthorityDirectory)
{
    public string ProfileStorePath => Path.Combine(DataDirectory, "certificates");
    public string BackupDirectory => Path.Combine(DataDirectory, "certificate-backups");
    public string BackupIndexPath => Path.Combine(DataDirectory, "certificate-backups.json");
}
