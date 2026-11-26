using Apps2Samsung.Certificate;
using Apps2Samsung.Extensions;
using Apps2Samsung.Interfaces;
using Apps2Samsung.Models;
using Apps2Samsung.Services;
using Apps2Samsung.Samsung;

namespace MoonlightTizenInstaller.Core.Certificates;

/// <summary>
/// Installer-owned façade over the narrowly vendored Apps2Samsung certificate workflow.
/// Keeps upstream implementation details out of the desktop UI.
/// </summary>
public sealed class CertificateManager
{
    private readonly CertificateInstallerOptions _options;
    private readonly CertificateProvisioningService _provisioning;
    private readonly WgtSigningService _signer = new();

    public CertificateManager(CertificateInstallerOptions options)
    {
        _options = options;
        Directory.CreateDirectory(options.ProfileStorePath);
        Directory.CreateDirectory(options.BackupDirectory);

        CertificateBackups.Configure(
            options.ProfileStorePath,
            options.BackupIndexPath,
            new FolderBackupTarget(options.BackupDirectory, options.BackupDirectory));

        var http = new HttpClient { Timeout = TimeSpan.FromSeconds(45) };
        var certificateService = new TizenCertificateService(http, CertificateEndpoints.Default);
        ISamsungLoginService loginService = new SamsungLoginService();
        _provisioning = new CertificateProvisioningService(certificateService, loginService);
    }

    public string ProfileStorePath => _options.ProfileStorePath;

    public Task<string> SignWgtAsync(
        string inputPath,
        string outputPath,
        CertificateProfile profile,
        IProgress<string>? progress = null,
        CancellationToken cancellationToken = default) =>
        _signer.SignCopyAsync(inputPath, outputPath, profile, progress, cancellationToken);

    /// <summary>
    /// Reuses an existing profile where possible. A Samsung browser sign-in is only triggered
    /// when a new author certificate or a distributor renewal is actually required.
    /// </summary>
    public Task<CertificateProfile> EnsureForTelevisionAsync(
        string televisionDuid,
        CertificatePrivilegeLevel level = CertificatePrivilegeLevel.Public,
        IEnumerable<string>? additionalDuids = null,
        bool forceNewAuthorCertificate = false,
        Action<string>? progress = null,
        CancellationToken cancellationToken = default)
    {
        if (!TizenDuid.IsValid(televisionDuid))
            throw new ArgumentException("Se requiere un DUID válido del televisor.", nameof(televisionDuid));

        CertificateSecrets.EnsureAvailable();
        ValidateAuthorityFilesOnlyWhenIssuanceIsRequired(televisionDuid, level, additionalDuids, forceNewAuthorCertificate);
        return _provisioning.EnsureAsync(
            televisionDuid,
            level,
            _options.ProfileStorePath,
            _options.CertificateAuthorityDirectory,
            additionalDuids,
            forceNewAuthorCertificate,
            progress: progress is null ? null : new ProgressCallback(progress),
            ct: cancellationToken);
    }

    public IReadOnlyList<CertificateArchiveProfile> GetRecoverableProfiles() =>
        CertificateArchive.UsableProfiles(_options.ProfileStorePath)
            .Select(item => item.Profile)
            .ToArray();

    public IReadOnlyList<CertificateArchiveProfile> ExportProfiles(Stream destination)
    {
        ArgumentNullException.ThrowIfNull(destination);
        return CertificateArchive.ExportAll(destination, _options.ProfileStorePath, includePassword: true);
    }

    public CertificateArchivePreview PreviewImport(Stream source)
    {
        ArgumentNullException.ThrowIfNull(source);
        return CertificateArchive.Preview(source, _options.ProfileStorePath);
    }

    public CertificateArchiveImportResult ImportProfiles(Stream source)
    {
        ArgumentNullException.ThrowIfNull(source);
        return CertificateArchive.Import(source, _options.ProfileStorePath);
    }

    public CertificateBackupStatus? GetBackupStatus() => CertificateBackups.Status();

    private void ValidateAuthorityFilesOnlyWhenIssuanceIsRequired(
        string televisionDuid,
        CertificatePrivilegeLevel level,
        IEnumerable<string>? additionalDuids,
        bool forceNewAuthorCertificate)
    {
        var profileDirectory = Path.Combine(_options.ProfileStorePath, CertificateProvisioningService.ProfileName(level));
        var hasAuthor = !forceNewAuthorCertificate && CertificateProvisioningService.HasUsableAuthorCert(profileDirectory);
        var coveredDuids = hasAuthor
            ? CertificateProvisioningService.GetCoveredDuids(profileDirectory)
            : new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        var extraDuids = (additionalDuids ?? Enumerable.Empty<string>())
            .Where(TizenDuid.IsValid)
            .ToArray();
        var alreadyCovered = coveredDuids.Contains(televisionDuid) && extraDuids.All(coveredDuids.Contains);

        // Existing profiles that already cover this TV can be reused without SDK CA materials.
        if (hasAuthor && alreadyCovered)
            return;

        var distributorFile = level == CertificatePrivilegeLevel.Partner
            ? "vd_tizen_dev_partner2.crt"
            : "vd_tizen_dev_public2.crt";
        var required = new[]
        {
            "vd_tizen_dev_author_ca.cer",
            distributorFile
        };
        var missing = required
            .Select(name => Path.Combine(_options.CertificateAuthorityDirectory, name))
            .Where(path => !File.Exists(path))
            .Select(Path.GetFileName)
            .ToArray();

        if (missing.Length > 0)
        {
            throw new InvalidOperationException(
                "Faltan materiales de autoridad de certificados Tizen requeridos para firmar: " +
                string.Join(", ", missing) +
                ". Deben proporcionarse desde el entorno de desarrollo autorizado; el instalador no los descarga ni los redistribuye.");
        }
    }
}
