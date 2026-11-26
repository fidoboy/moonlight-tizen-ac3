# Moonlight Tizen Installer

Self-contained desktop installer for Moonlight on Samsung Tizen TVs.

## Layout

- `src/MoonlightTizenInstaller/`: Avalonia desktop application.
- `src/MoonlightTizenInstaller.Core/`: installer-owned discovery, TV-Store hand-off and certificate services.
- `vendor/Apps2Samsung/`: restricted GPL-3.0-only source subset for Samsung certificate issuance, recovery and signing-profile handling.
- `assets/`: installer artwork and bundled Moonlight WGT inputs.
- `build/`: per-platform self-contained publishing scripts.

The build workflow downloads `Moonlight.wgt` from the latest project release, validates the ZIP container and embeds it beside the self-contained application in each platform package. The application checks that this mandatory resource exists before starting discovery.

## Television discovery

The installer scans private IPv4 networks and identifies Samsung TVs through the Samsung TV REST API on port 8001. This detection does not require Developer Mode or SDB.

When the SDB developer port (26101) is available, the installer additionally connects through SDB and reads the DUID with `0 getduid`. The DUID is only needed for certificate management and local WGT signing; it is not required for the TV-Store installation hand-off.

## Installation through Apps2Samsung TV-Store

The primary installation route uses the same no-SDB hand-off protocol as Apps2Samsung:

1. The installer checks whether Apps2Samsung TV-Store is responding on the TV at HTTP port 8077.
2. If necessary, it asks the Samsung TV REST API (port 8001) to launch TV-Store and waits for its upload service.
3. It sends the bundled `Moonlight.wgt` using `PUT /upload?name=Moonlight.wgt`.
4. It validates the SHA-256 hash reported by the TV against the local package.
5. It asks the TV to bring TV-Store to the foreground.

This is deliberately a hand-off, not a silent remote installation: TV-Store displays the pending package on the television and the user must press **Install** on the TV. TV-Store signs the package with the certificate already configured (armed) in TV-Store itself.

Consequently, this route requires Apps2Samsung TV-Store to be installed on the television and to have a usable signing certificate configured. The installer does not currently install TV-Store or provision its certificate. A successful upload and matching SHA-256 prove that the file arrived intact; they do not prove that the user confirmed installation or that Tizen accepted the package.

The transfer and app-launch operations in this route do not use SDB or Tizen Studio.

## Certificate subsystem and optional local signing

The installer also compiles a selected Apps2Samsung certificate source subset into its Core project through linked source files. `CertificateManager` is the installer-owned entry point for:

- Reusing an existing Samsung Partner signing profile when its author certificate is valid and its distributor certificate covers the selected TV DUID.
- Starting Samsung SignInGate authentication and issuing a full Partner author/distributor profile when required.
- Reissuing only the Partner distributor certificate when the author identity can be retained but the selected TV DUID is not covered.
- Signing a WGT locally with the resulting author/distributor PKCS#12 pair, writing a separate signed copy and leaving the original package untouched.
- Enumerating, exporting, previewing and importing certificate profiles.
- Maintaining automatic backups outside the application installation directory.

These certificate and local-signing operations do require Developer Mode, SDB access and a valid DUID. They are separate from the TV-Store hand-off route, which uses TV-Store's own armed certificate.

The profile store and backups are kept in the user's local application-data directory. Profile passwords are stored through Latchkey in the operating system's secure credential store (Windows Credential Manager, macOS Keychain or Linux Secret Service); they are not persisted as plaintext profile passwords by the installer. Exported `.a2scert` archives may contain sensitive credential material and must be protected accordingly.

### Certificate authority inputs

The installer does not bundle or download Samsung/Tizen SDK authority materials. The current adapter expects the following files in the `certificate-authorities` directory next to the executable:

- `vd_tizen_dev_author_ca.cer`
- `vd_tizen_dev_partner2.crt` for the Partner distributor profile used by Moonlight

If they are absent, existing profiles can still be recovered and reused, but new certificate issuance is blocked with an explicit diagnostic. The origin and redistribution terms of these inputs are reviewed separately.

## Current limitations

- The no-SDB route depends on Apps2Samsung TV-Store already being installed and armed with a signing certificate.
- The user must confirm installation on the television; the desktop installer cannot claim success merely because the upload completed.
- The installer has not yet verified the final installed state after the user confirms on the TV.
- Certificate issuance and local signing still require the separately provisioned CA inputs.
- Real-device end-to-end testing is still required across supported TV models and firmware versions.

The four-platform workflow compiles and publishes self-contained builds for Windows x64, Linux x64, macOS x64 and macOS ARM64. This build validation does not replace testing the transfer and installation against physical Samsung TVs.

## Upstream source and licensing

The selected Apps2Samsung certificate-source baseline is commit `aae32ed4ea762bef3f6310f2f65aeb16752f8e78` (branch `beta`). The vendored source and its scope are documented in `vendor/Apps2Samsung/UPSTREAM.md`; the full GPL-3.0-only text and third-party notices are included alongside it.

No Samsung/Tizen SDK assets or CA binaries/private keys are included. Samsung and Tizen marks remain the property of their respective owners. This project is not affiliated with Samsung.
