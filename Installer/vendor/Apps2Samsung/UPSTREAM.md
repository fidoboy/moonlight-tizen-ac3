# Apps2Samsung certificate code provenance

The files in this directory are copied from **Apps2Samsung** at upstream commit
`aae32ed4ea762bef3f6310f2f65aeb16752f8e78` (branch `beta`).

- Upstream: https://github.com/Apps2Samsung/Apps2Samsung
- Upstream license: GPL-3.0-only; see [LICENSE](LICENSE).
- The copied source files are preserved verbatim, including their upstream namespaces and comments.
- This is a deliberately restricted source subset for Samsung certificate issuance, profile recovery,
  profile validation and preparation of signing credentials for a WGT.
- No Apps2Samsung device discovery, SDB transport, package installation, catalog, Jellyfin, remote-control,
  mobile UI, Tizen-local certificate-generation or Tizen SDK asset code is included.

## Included source areas

- `Certificate/`: Samsung author/distributor certificate provisioning, endpoint definitions, profile
  validation, archive/import/export, backups, CA authority metadata/store, and PEM conversion of PKCS#12
  signing profiles.
- `Samsung/`: OAuth constants and the login-service contract.
- `Desktop/`: the upstream loopback callback implementation used to receive the Samsung SignInGate token.
- `Models/`, `Core/`, `Extensions/`: only the shared models and platform/progress helpers required by
  the selected certificate implementation.

## Deliberately excluded

The upstream `Certificate/TizenSdk/` directory, `TizenSdkAssets.cs`, all Samsung/Tizen CA binaries,
private keys, distributor-signer PKCS#12 files, and all other SDK-derived materials are excluded.
Their redistribution conditions will be assessed separately for the development-container image.

The source subset is not yet wired into the installer's build graph. Some upstream types are coupled to
Apps2Samsung-wide configuration and helper abstractions; the next integration step is to isolate those
dependencies behind installer-owned interfaces, then compile and test the certificate workflow. Do not
treat the presence of these files as a claim that certificate issuance is already operational.
