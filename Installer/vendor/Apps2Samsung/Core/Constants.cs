namespace Apps2Samsung.Helpers.Core;

/// <summary>
/// Minimal installer-scoped compatibility constants required by the selected upstream
/// certificate sources. Unrelated Apps2Samsung application constants are intentionally omitted.
/// </summary>
public static class Constants
{
    public static class AppIdentifiers
    {
        public const string Jelly2SamsDefault = "Jelly2Sams";
        public const string JellyfinAppName = "org.jellyfin";
    }

    public static class Certificate
    {
        public const string AuthorFileName = "author.p12";
        public const string DistributorFileName = "distributor.p12";
        public const string PasswordFileName = "password.txt";
    }

    public static class Samsung
    {
        public const string LoopbackHost = "127.0.0.1";
    }

    public static class TizenVersions
    {
        public const string PushInstallMax = "5.5";
        public const string CertificateRequired = "6.0";
    }
}
