# Moonlight Tizen Installer

Self-contained desktop installer for Moonlight on Samsung Tizen TVs.

## Layout

- `src/MoonlightTizenInstaller/`: Avalonia desktop application.
- `src/MoonlightTizenInstaller.Core/`: installer-owned workflow and certificate façade.
- `vendor/Apps2Samsung/`: restricted GPL-3.0-only source subset for Samsung certificate issuance, recovery and signing-profile handling.
- `assets/`: installer artwork and bundled Moonlight WGT inputs.
- `build/`: per-platform self-contained publishing scripts.

The final installer is intended to embed the release WGT at build time; the current build workflow only compiles the desktop application and does not yet assemble release artifacts or embed a WGT. Runtime WGT downloads are not part of the design.

## Certificate subsystem

The installer now compiles the selected Apps2Samsung certificate source subset into its Core project through linked source files. `CertificateManager` is the installer-owned entry point for:

- Reusing an existing Samsung signing profile when its author certificate is valid and its distributor certificate covers the selected TV DUID.
- Starting Samsung SignInGate authentication and issuing a full author/distributor profile when required.
- Reissuing only the distributor certificate when the author identity can be retained but the selected TV DUID is not covered.
- Signing a WGT locally with the resulting author/distributor PKCS#12 pair, writing a separate signed copy and leaving the original package untouched.
- Enumerating, exporting, previewing and importing certificate profiles.
- Maintaining automatic backups outside the application installation directory.

The profile store and backups are kept in the user's local application-data directory. Upstream profile format is retained for compatibility with Apps2Samsung certificate archives.

### Certificate authority inputs

The installer does not bundle or download Samsung/Tizen SDK authority materials. The current adapter expects the following files in the `certificate-authorities` directory next to the executable:

- `vd_tizen_dev_author_ca.cer`
- `vd_tizen_dev_public2.crt` for Public distributor profiles
- `vd_tizen_dev_partner2.crt` for Partner distributor profiles

If they are absent, existing profiles can still be recovered and reused, but new certificate issuance is blocked with an explicit diagnostic. The origin and redistribution terms of these inputs will be reviewed separately for the GHCR development image.

### Security and operational notes

Samsung authentication is performed in the system browser through the upstream loopback callback. Certificate profile files retain the upstream Apps2Samsung layout, including its `password.txt` file; the installer currently protects them by storing the profile directory under the current user's local application data and must not sync it to cloud storage. A future platform-specific secret-store migration should replace plaintext password persistence without breaking archive compatibility.

The certificate and local WGT-signing subsystem is integrated and covered by the four-platform compile workflow. The end-to-end installer is not yet complete: TV discovery must supply the real DUID to `EnsureForTelevisionAsync`, the authorized CA files must be provisioned, and the signed WGT still has to be handed to the separate TV installation stage. No SDB transport or TV installation functionality is included. WGT signing uses the local `TizenWgtSigner` implementation from `TizenSdb.Core` and does not require a TV connection or Tizen Studio.

## Upstream source and licensing

The selected Apps2Samsung source baseline is commit `aae32ed4ea762bef3f6310f2f65aeb16752f8e78` (beta). The vendored source and its scope are documented in `vendor/Apps2Samsung/UPSTREAM.md`; the full GPL-3.0-only text and third-party notices are included alongside it.

No Samsung/Tizen SDK assets or CA binaries/private keys are included. Samsung and Tizen marks remain the property of their respective owners. This project is not affiliated with Samsung.
