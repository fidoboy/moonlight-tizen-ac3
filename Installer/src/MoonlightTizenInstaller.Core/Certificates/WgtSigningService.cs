using Apps2Samsung.Certificate;
using TizenSdb.SigningManager;

namespace MoonlightTizenInstaller.Core.Certificates;

/// <summary>Signs a WGT locally with a prepared Samsung author/distributor profile.</summary>
public sealed class WgtSigningService
{
    public async Task<string> SignCopyAsync(
        string inputPath,
        string outputPath,
        CertificateProfile profile,
        IProgress<string>? progress = null,
        CancellationToken cancellationToken = default)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(inputPath);
        ArgumentException.ThrowIfNullOrWhiteSpace(outputPath);
        ArgumentNullException.ThrowIfNull(profile);

        if (!File.Exists(inputPath))
            throw new FileNotFoundException("No se encuentra el WGT de entrada.", inputPath);
        if (!string.Equals(Path.GetExtension(inputPath), ".wgt", StringComparison.OrdinalIgnoreCase))
            throw new ArgumentException("El archivo de entrada debe ser un WGT.", nameof(inputPath));

        var inputFullPath = Path.GetFullPath(inputPath);
        var outputFullPath = Path.GetFullPath(outputPath);
        var comparison = OperatingSystem.IsLinux() ? StringComparison.Ordinal : StringComparison.OrdinalIgnoreCase;
        if (string.Equals(inputFullPath, outputFullPath, comparison))
            throw new ArgumentException("El WGT original nunca se modifica; el destino debe ser otro archivo.", nameof(outputPath));

        var validity = CertificateValidity.CheckSigningProfile(
            profile.AuthorP12,
            profile.DistributorP12,
            profile.Password);
        if (validity.IsNotYetValid)
            throw new CertificateNotYetValidException(validity);

        cancellationToken.ThrowIfCancellationRequested();
        progress?.Report("Firmando el WGT…");

        var stagingDirectory = Path.Combine(Path.GetTempPath(), "MoonlightTizenInstaller", "signing", Guid.NewGuid().ToString("N"));
        Directory.CreateDirectory(stagingDirectory);
        var stagedPath = Path.Combine(stagingDirectory, Path.GetFileName(inputFullPath));

        try
        {
            File.Copy(inputFullPath, stagedPath, overwrite: false);
            cancellationToken.ThrowIfCancellationRequested();

            // TizenWgtSigner performs an entirely local package operation; no TV/SDB
            // connection or Tizen Studio installation is needed for signing.
            await TizenWgtSigner.ReSignWgtWithCertsInPlace(
                stagedPath,
                profile.AuthorP12,
                profile.DistributorP12,
                profile.Password,
                backupPath: null);

            cancellationToken.ThrowIfCancellationRequested();
            if (!File.Exists(stagedPath) || new FileInfo(stagedPath).Length == 0)
                throw new InvalidOperationException("El firmador no ha generado un WGT de salida válido.");

            var outputDirectory = Path.GetDirectoryName(outputFullPath);
            if (!string.IsNullOrEmpty(outputDirectory))
                Directory.CreateDirectory(outputDirectory);

            File.Copy(stagedPath, outputFullPath, overwrite: true);
            progress?.Report("WGT firmado correctamente.");
            return outputFullPath;
        }
        finally
        {
            try
            {
                if (Directory.Exists(stagingDirectory))
                    Directory.Delete(stagingDirectory, recursive: true);
            }
            catch
            {
                // Temporary-file cleanup is best effort; the signing result is already determined.
            }
        }
    }
}
