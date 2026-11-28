using System;
using System.IO;
using Latchkey;

namespace Apps2Samsung.Certificate;

/// <summary>Stores PKCS#12 passwords in the operating system credential vault.</summary>
public static class CertificateSecrets
{
    private const string ServiceName = "com.fidoboy.moonlight-tizen-installer.certificates";
    private const string LegacyPasswordFileName = "password.txt";
    private static readonly Lazy<ILatchkey> Store = new(() => LatchkeyFactory.Create(ServiceName));

    private static string Key(string profileName) => "profile:" + profileName;

    public static string? Get(string profileName) => Store.Value.Get(Key(profileName));

    public static void EnsureAvailable()
    {
        var probeKey = "vault-check:" + Guid.NewGuid().ToString("N");
        Store.Value.Set(probeKey, Guid.NewGuid().ToString("N"));
        Store.Value.Delete(probeKey);
    }

    public static string GetRequired(string profileName) =>
        Get(profileName) ?? throw new InvalidOperationException(
            $"No secure password is available for certificate profile '{profileName}'. Import its original certificate archive or sign in again.");

    public static void Set(string profileName, string password)
    {
        if (string.IsNullOrWhiteSpace(profileName))
            throw new ArgumentException("A profile name is required.", nameof(profileName));
        if (string.IsNullOrEmpty(password))
            throw new ArgumentException("A non-empty PKCS#12 password is required.", nameof(password));
        Store.Value.Set(Key(profileName), password);
    }

    public static void SetForDirectory(string profileDirectory, string password)
    {
        var profileName = Path.GetFileName(Path.TrimEndingDirectorySeparator(profileDirectory));
        Set(profileName, password);
        DeleteLegacyFile(profileDirectory);
    }

    /// <summary>Migrates a legacy password.txt only after its value is safely stored in the OS vault.</summary>
    public static string? GetOrMigrate(string profileDirectory)
    {
        var profileName = Path.GetFileName(Path.TrimEndingDirectorySeparator(profileDirectory));
        var password = Get(profileName);
        var legacyPath = Path.Combine(profileDirectory, LegacyPasswordFileName);

        if (!string.IsNullOrEmpty(password))
        {
            DeleteLegacyFile(profileDirectory);
            return password;
        }
        if (!File.Exists(legacyPath))
            return null;

        // Fail closed if the OS vault is unavailable; never fall back to plaintext operation.
        var legacyPassword = File.ReadAllText(legacyPath).Trim();
        if (string.IsNullOrEmpty(legacyPassword))
            return null;

        Set(profileName, legacyPassword);
        DeleteLegacyFile(profileDirectory);
        return legacyPassword;
    }

    /// <summary>Moves a profile password to its renamed profile key without losing the old value on failure.</summary>
    public static void RenameProfile(string oldProfileName, string newProfileName)
    {
        if (string.IsNullOrWhiteSpace(oldProfileName) || string.IsNullOrWhiteSpace(newProfileName))
            throw new ArgumentException("Both profile names are required.");

        var oldPassword = Get(oldProfileName);
        if (string.IsNullOrEmpty(oldPassword))
            return;

        if (string.IsNullOrEmpty(Get(newProfileName)))
            Set(newProfileName, oldPassword);

        // Delete the legacy key only after the new key is safely present.
        if (!string.IsNullOrEmpty(Get(newProfileName)))
            Delete(oldProfileName);
    }

    public static void Delete(string profileName) => Store.Value.Delete(Key(profileName));

    private static void DeleteLegacyFile(string profileDirectory)
    {
        var path = Path.Combine(profileDirectory, LegacyPasswordFileName);
        if (File.Exists(path))
            File.Delete(path);
    }
}
