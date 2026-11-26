using System.Reflection;
using System.Security.Cryptography.X509Certificates;
using Apps2Samsung.Certificate;
using Apps2Samsung.Extensions;
using Apps2Samsung.Interfaces;
using Apps2Samsung.Models;
using Apps2Samsung.Services;
using Apps2Samsung.Samsung;

namespace MoonlightTizenInstaller.Core.Certificates;

/// <summary>
/// Keeps one Partner signing profile in the installer's private application-data directory.
/// Samsung CA authorities are embedded in this installer and materialized automatically.
/// </summary>
public sealed class CertificateManager
{
    private readonly CertificateInstallerOptions _options;
    private readonly CertificateProvisioningService _provisioning;
    private readonly WgtSigningService _signer = new();

    private static readonly string[] AuthorityResources =
    {
        "authorities.vd_tizen_dev_author_ca.cer.b64",
        "authorities.vd_tizen_dev_public2.crt.b64",
        "authorities.vd_tizen_dev_partner2.crt.b64"
    };

    public CertificateManager(CertificateInstallerOptions options)
    {
        _options = options;
        Directory.CreateDirectory(options.ProfileStorePath);
        EnsureAuthorityFiles();

        var http = new HttpClient { Timeout = TimeSpan.FromSeconds(45) };
        var certificateService = new TizenCertificateService(http, CertificateEndpoints.Default);
        ISamsungLoginService loginService = new SamsungLoginService();
        _provisioning = new CertificateProvisioningService(certificateService, loginService);
    }

    public CertificateProfile? GetUsableForTelevision(
        string televisionDuid,
        CertificatePrivilegeLevel level = CertificatePrivilegeLevel.Partner)
    {
        if (!TizenDuid.IsValid(televisionDuid))
            return null;

        var profileName = CertificateProvisioningService.ProfileName(level);
        var profileDirectory = Path.Combine(_options.ProfileStorePath, profileName);
        var authorPath = Path.Combine(profileDirectory, "author.p12");
        var distributorPath = Path.Combine(profileDirectory, "distributor.p12");
        var password = CertificateSecrets.GetOrMigrate(profileDirectory);

        if (string.IsNullOrEmpty(password) ||
            !IsCertificateCurrentlyValid(authorPath, password) ||
            !IsCertificateCurrentlyValid(distributorPath, password) ||
            !CertificateProvisioningService.GetCoveredDuids(profileDirectory).Contains(televisionDuid))
            return null;

        return new CertificateProfile(
            authorPath, distributorPath, password, profileDirectory, profileName, level);
    }

    public bool IsReadyForTelevision(string televisionDuid)
    {
        try { return GetUsableForTelevision(televisionDuid) is not null; }
        catch { return false; }
    }

    public (string Subject, DateTime IssuedOn, DateTime ExpiresOn)? GetCertificateDetailsForTelevision(string televisionDuid)
    {
        var profile = GetUsableForTelevision(televisionDuid);
        if (profile is null)
            return null;

        try
        {
#pragma warning disable SYSLIB0057
            using var certificate = new X509Certificate2(
                profile.AuthorP12, profile.Password, X509KeyStorageFlags.EphemeralKeySet);
#pragma warning restore SYSLIB0057
            return (certificate.GetNameInfo(X509NameType.SimpleName, false),
                certificate.NotBefore, certificate.NotAfter);
        }
        catch
        {
            return null;
        }
    }

    public Task<CertificateProfile> EnsureForTelevisionAsync(
        string televisionDuid,
        CertificatePrivilegeLevel level = CertificatePrivilegeLevel.Partner,
        Action<string>? progress = null,
        CancellationToken cancellationToken = default)
    {
        if (!TizenDuid.IsValid(televisionDuid))
            throw new ArgumentException("Se requiere un DUID válido del televisor.", nameof(televisionDuid));

        CertificateSecrets.EnsureAvailable();
        return _provisioning.EnsureAsync(
            televisionDuid,
            level,
            _options.ProfileStorePath,
            _options.CertificateAuthorityDirectory,
            progress: progress is null ? null : new ProgressCallback(progress),
            ct: cancellationToken);
    }

    public Task<string> SignWgtAsync(
        string inputPath,
        string outputPath,
        CertificateProfile profile,
        IProgress<string>? progress = null,
        CancellationToken cancellationToken = default) =>
        _signer.SignCopyAsync(inputPath, outputPath, profile, progress, cancellationToken);

    private void EnsureAuthorityFiles()
    {
        Directory.CreateDirectory(_options.CertificateAuthorityDirectory);
        var assembly = Assembly.GetExecutingAssembly();
        foreach (var resourceName in AuthorityResources)
        {
            var fileName = resourceName["authorities.".Length..^4];
            var target = Path.Combine(_options.CertificateAuthorityDirectory, fileName);
            using var source = assembly.GetManifestResourceStream(resourceName)
                ?? throw new InvalidOperationException($"No se encontró el recurso de autoridad '{resourceName}'.");
            using var memory = new MemoryStream();
            source.CopyTo(memory);
            var certificateBytes = Convert.FromBase64String(System.Text.Encoding.ASCII.GetString(memory.ToArray()).Trim());
            File.WriteAllBytes(target, certificateBytes);
        }
    }

    private static bool IsCertificateCurrentlyValid(string path, string password)
    {
        try
        {
            if (!File.Exists(path))
                return false;
#pragma warning disable SYSLIB0057
            using var certificate = new X509Certificate2(
                path, password, X509KeyStorageFlags.EphemeralKeySet);
#pragma warning restore SYSLIB0057
            var now = DateTime.UtcNow;
            return certificate.NotBefore.ToUniversalTime() <= now &&
                   certificate.NotAfter.ToUniversalTime() >= now;
        }
        catch
        {
            return false;
        }
    }
}
