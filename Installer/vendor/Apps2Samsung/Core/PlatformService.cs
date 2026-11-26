using System.Security.Cryptography.X509Certificates;

namespace Apps2Samsung.Helpers.Core;

/// <summary>Only the cross-platform PKCS#12 loading policy needed by the certificate subset.</summary>
public static class PlatformService
{
    public static bool IsWindows => OperatingSystem.IsWindows();
    public static bool IsLinux => OperatingSystem.IsLinux();
    public static bool IsMacOS => OperatingSystem.IsMacOS();

    public static X509KeyStorageFlags SigningCertificateFlags => X509KeyStorageFlags.Exportable;
}
