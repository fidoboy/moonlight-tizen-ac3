# Apps2Samsung certificate code provenance

The files in this directory are copied from **Apps2Samsung** at upstream commit
`aae32ed4ea762bef3f6310f2f65aeb16752f8e78` (branch `beta`).

- Upstream: https://github.com/Apps2Samsung/Apps2Samsung
- Upstream license: GPL-3.0-only; see [LICENSE](LICENSE).
- The copied source files are preserved verbatim, including their upstream namespaces and comments.
- This is a deliberately restricted source subset for Samsung certificate issuance, profile recovery,
  profile validation, recovery and signing of WGT packages.
- No Apps2Samsung package installation, catalog, Jellyfin, remote-control,
  mobile UI, Tizen-local certificate-generation or Tizen SDK asset code is included.

## Included source areas

- `Certificate/`: Samsung author/distributor certificate provisioning, endpoint definitions, profile
  validation, archive/import/export, backups, CA authority metadata/store and signing-profile validity.
  `TizenDistributorLevel.cs` is included as a type dependency; SDK-backed Tizen certificate generation is not.
- `Samsung/`: OAuth constants and the login-service contract.
- `Desktop/`: the upstream loopback callback implementation used to receive the Samsung SignInGate token.
- `Models/`, `Core/`, `Extensions/`: only the shared models, platform certificate-loading policy,
  JSON options and progress delegate required by the selected certificate implementation.

## Deliberately excluded

The upstream `Certificate/TizenSdk/` directory, `TizenSdkAssets.cs`, all Samsung/Tizen CA binaries,
private keys, distributor-signer PKCS#12 files, and all other SDK-derived materials are excluded.
Their redistribution conditions will be assessed separately for the development-container image.

The selected source files are linked into `MoonlightTizenInstaller.Core`; the installer-owned `CertificateManager`
provides the UI-facing boundary. The certificate workflow, archive recovery and local WGT signing compile
on Windows x64, Linux x64, macOS x64 and macOS arm64 in the repository's installer build workflow.
Actual Samsung certificate issuance still requires the separately reviewed CA files listed in
`Installer/README.md`, and successful signing against real Samsung-issued profiles remains a runtime test.
