# Moonlight Tizen Installer

Self-contained desktop installer for Moonlight on Samsung Tizen TVs.

## Layout

- `src/MoonlightTizenInstaller/`: Avalonia desktop application.
- `src/MoonlightTizenInstaller.Core/`: installer-owned discovery, SDB installation and certificate services.
- `vendor/Apps2Samsung/`: restricted GPL-3.0-only source subset for Samsung certificate issuance, recovery and signing-profile handling.
- `assets/`: installer artwork and bundled Moonlight WGT inputs.
- `build/`: per-platform self-contained publishing scripts.

The build workflow downloads `Moonlight.wgt` from the latest project release, validates the ZIP container and embeds it beside the self-contained application in each platform package. The application checks that this mandatory resource exists before starting discovery.

## Television discovery

The installer scans private IPv4 networks and identifies Samsung TVs through the Samsung TV REST API on port 8001. This detection does not require Developer Mode or SDB.

After identifying a TV, the installer must obtain its DUID automatically through SDB using `0 getduid`. A detected TV without a valid DUID is not ready: certificate preparation, local signing and installation remain disabled until Developer Mode is configured and discovery is retried. The installer never asks the user to type a DUID.

## Installation through SDB

The installer installs Moonlight directly through Samsung's SDB protocol; TV-Store is not a prerequisite:

1. It first checks the Samsung TV REST API on port 8001 to identify each TV on the local network.
2. It requests `GET http://<TV-IP>:8077/relay`. A relay is considered usable only when TV-Store returns a valid `{ ok: true, relay: { enabled: true, listening: true, port: ... } }` report and the announced TCP port is reachable.
3. When that relay is confirmed, the installer tries the SDB connection through its reported port (26201 by default). If it is unavailable or cannot provide the DUID, discovery falls back to the conventional SDB port 26101.
4. The installer obtains the DUID automatically with `0 getduid`. A valid DUID is mandatory in every case, including when TV-Store's relay is used. Without it, installation cannot proceed and the UI displays Developer Mode instructions and a Retry button.
5. Before installation, the installer prepares/reuses the Partner certificate profile for that DUID, signs a temporary copy of the bundled WGT, transfers it to the TV and invokes `0 vd_appinstall` over the same verified SDB endpoint.

TV-Store is an optional optimization, not an installation dependency. Its relay is a TCP proxy to the TV's local `sdbd`; it does not perform package upload or signing. The relay normally listens on port `26201`, but the installer uses the actual port reported by `/relay` rather than assuming the default.

When Developer Mode's Host PC IP is `127.0.0.1`, the direct SDB port is not reachable from another machine and the TV-Store relay is required. If no working relay is available, configure Host PC IP with the installer's local IPv4 address and restart the TV; the installer then uses port `26101`. If a relay is detected but its SDB handshake cannot obtain a DUID, the UI shows `127.0.0.1` as the Host PC IP value to configure.

The installer does not request a manually entered DUID and does not claim installation success merely because a file was transferred. It checks the TV's SDB install output for a success indication or an explicit failure.

## Certificate subsystem and local signing

The installer also compiles a selected Apps2Samsung certificate source subset into its Core project through linked source files. `CertificateManager` is the installer-owned entry point for:

- Reusing an existing Samsung Partner signing profile when its author certificate is valid and its distributor certificate covers the selected TV DUID.
- Starting Samsung SignInGate authentication and issuing a full Partner author/distributor profile when required.
- Reissuing only the Partner distributor certificate when the author identity can be retained but the selected TV DUID is not covered.
- Signing a WGT locally with the resulting author/distributor PKCS#12 pair, writing a separate signed copy and leaving the original package untouched.
- Enumerating, exporting, previewing and importing certificate profiles.
- Maintaining automatic backups outside the application installation directory.

Certificate preparation, local signing and installation all require Developer Mode, a working SDB endpoint and a valid automatically retrieved DUID. The installation action signs a temporary copy of the bundled WGT with the selected TV's Partner profile and removes that temporary copy after the installation attempt.

The profile store and backups are kept in the user's local application-data directory. Profile passwords are stored through Latchkey in the operating system's secure credential store (Windows Credential Manager, macOS Keychain or Linux Secret Service); they are not persisted as plaintext profile passwords by the installer. Exported `.a2scert` archives may contain sensitive credential material and must be protected accordingly.

### Certificate authority inputs

The installer does not bundle or download Samsung/Tizen SDK authority materials. The current adapter expects the following files in the `certificate-authorities` directory next to the executable:

- `vd_tizen_dev_author_ca.cer`
- `vd_tizen_dev_partner2.crt` for the Partner distributor profile used by Moonlight

If they are absent, existing profiles can still be recovered and reused, but new certificate issuance is blocked with an explicit diagnostic. The origin and redistribution terms of these inputs are reviewed separately.

## Current limitations

- The installer detects success from the TV's SDB installation output; it does not independently query the installed-app inventory afterwards.
- The optional TV-Store relay must be enabled and listening to be selected; otherwise the installer falls back to direct SDB port 26101.
- Certificate issuance and local signing still require the separately provisioned CA inputs.
- Real-device end-to-end testing is still required across supported TV models and firmware versions.

The four-platform workflow compiles and publishes self-contained builds for Windows x64, Linux x64, macOS x64 and macOS ARM64. This build validation does not replace testing the transfer and installation against physical Samsung TVs.

## Upstream source and licensing

The selected Apps2Samsung certificate-source baseline is commit `aae32ed4ea762bef3f6310f2f65aeb16752f8e78` (branch `beta`). The vendored source and its scope are documented in `vendor/Apps2Samsung/UPSTREAM.md`; the full GPL-3.0-only text and third-party notices are included alongside it.

No Samsung/Tizen SDK assets or CA binaries/private keys are included. Samsung and Tizen marks remain the property of their respective owners. This project is not affiliated with Samsung.
