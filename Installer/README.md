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

The installer scans private IPv4 networks and identifies Samsung TVs through the Samsung TV REST API on port 8001. This first phase does not require Developer Mode and deliberately does not attempt SDB or ask for a DUID.

Once a TV is selected, the installer first tries the optional Apps2Samsung TV-Store hand-off. If that route cannot be confirmed or cannot accept the WGT, the installer continues with direct installation and retrieves the DUID automatically through SDB. The user is never asked to enter a DUID manually.

## Preferred installation through Apps2Samsung TV-Store

TV-Store is the preferred route when it is installed and its service can be reached:

1. The installer checks `GET http://<TV-IP>:8077/upload` and verifies that the response is TV-Store's upload page.
2. If the service is not running, it checks that the TV lists `A2STVStore.Store` through the Samsung REST application endpoint, launches it through port 8001 and waits up to approximately 20 seconds for the upload service to become available.
3. It sends the bundled, unsigned `Moonlight.wgt` using `PUT /upload?name=Moonlight.wgt`.
4. It verifies the received size and SHA-256 against the local file, then asks the TV to bring TV-Store to the foreground.
5. The desktop installer tells the user to accept «Instalar» on the TV-Store screen. Once the hand-off is complete, the installer offers «Finalizar» and closes without performing certificate preparation or SDB installation.

TV-Store performs signing with the certificate already configured in TV-Store itself. This route does not use the installer's local Partner profile, does not require a DUID, and does not require Developer Mode. A successful upload and hash match confirm delivery to TV-Store, not that the user has accepted or completed installation. If TV-Store is absent, inaccessible, cannot start, or refuses/does not verify the package, the installer falls back to direct SDB installation instead of stopping. After a successful hand-off the user can finish and close the installer; if TV-Store later cannot complete installation (for example, because it has no signing certificate configured), the hand-off screen also offers an explicit «Continue through SDB» fallback.

## Fallback installation through SDB

When the TV-Store hand-off is unavailable or fails, the installer uses the direct Tizen installation route:

1. It uses the selected TV's Samsung REST metadata to determine the Developer Mode Host PC IP route.
2. If TV-Store's relay is confirmed enabled, listening and reachable, and the TV is configured with Host PC IP `127.0.0.1`, the installer uses the relay port reported by `GET http://<TV-IP>:8077/relay` (normally `26201`). Otherwise it uses the conventional SDB port `26101`. If the preferred relay endpoint fails, direct SDB is tried as a fallback.
3. It obtains the DUID automatically with `0 getduid`. A valid DUID is mandatory for this route. If it cannot be obtained, the UI displays Developer Mode instructions, the appropriate Host PC IP value and a Retry button. No manual DUID entry is provided.
4. It prepares/reuses the Partner certificate profile for that DUID, signs a temporary copy of the bundled WGT, transfers it to the TV and invokes `0 vd_appinstall` over the verified SDB endpoint.

The TV-Store relay is only an optional SDB transport for this fallback route. The installer does not depend on TV-Store being installed or running: the conventional SDB port remains the fallback.

## Certificate subsystem and local signing

The installer also compiles a selected Apps2Samsung certificate source subset into its Core project through linked source files. `CertificateManager` is the installer-owned entry point for:

- Reusing an existing Samsung Partner signing profile when its author certificate is valid and its distributor certificate covers the selected TV DUID.
- Starting Samsung SignInGate authentication and issuing a full Partner author/distributor profile when required.
- Reissuing only the Partner distributor certificate when the author identity can be retained but the selected TV DUID is not covered.
- Signing a WGT locally with the resulting author/distributor PKCS#12 pair, writing a separate signed copy and leaving the original package untouched.
- Enumerating, exporting, previewing and importing certificate profiles.
- Maintaining automatic backups outside the application installation directory.

Certificate preparation, local signing and the direct SDB installation fallback require Developer Mode, a working SDB endpoint and a valid automatically retrieved DUID. The SDB installation action signs a temporary copy of the bundled WGT with the selected TV's Partner profile and removes that temporary copy after the installation attempt. The preferred TV-Store hand-off is independent of these local certificate operations.

The profile store and backups are kept in the user's local application-data directory. Profile passwords are stored through Latchkey in the operating system's secure credential store (Windows Credential Manager, macOS Keychain or Linux Secret Service); they are not persisted as plaintext profile passwords by the installer. Exported `.a2scert` archives may contain sensitive credential material and must be protected accordingly.

### Certificate authority inputs

The installer does not bundle or download Samsung/Tizen SDK authority materials. The current adapter expects the following files in the `certificate-authorities` directory next to the executable:

- `vd_tizen_dev_author_ca.cer`
- `vd_tizen_dev_partner2.crt` for the Partner distributor profile used by Moonlight

If they are absent, existing profiles can still be recovered and reused, but new certificate issuance is blocked with an explicit diagnostic. The origin and redistribution terms of these inputs are reviewed separately.

## Current limitations

- The installer detects success from the TV's SDB installation output; it does not independently query the installed-app inventory afterwards.
- The TV-Store hand-off confirms upload integrity but does not independently verify the user's final acceptance or installed-app state.
- The direct SDB fallback detects success from the TV's SDB installation output; it does not independently query the installed-app inventory afterwards.
- Certificate issuance and local signing still require the separately provisioned CA inputs.
- Certificate issuance and local signing still require the separately provisioned CA inputs.
- Real-device end-to-end testing is still required across supported TV models and firmware versions.

The four-platform workflow compiles and publishes self-contained builds for Windows x64, Linux x64, macOS x64 and macOS ARM64. The Linux x64 build uses `linuxdeploy` to bundle the executable, desktop entry, icon and detected shared-library dependencies into a portable `MoonlightTizenInstaller-x86_64.AppImage`. This build validation does not replace testing the transfer and installation against physical Samsung TVs.

## Upstream source and licensing

The selected Apps2Samsung certificate-source baseline is commit `aae32ed4ea762bef3f6310f2f65aeb16752f8e78` (branch `beta`). The vendored source and its scope are documented in `vendor/Apps2Samsung/UPSTREAM.md`; the full GPL-3.0-only text and third-party notices are included alongside it.

No Samsung/Tizen SDK assets or CA binaries/private keys are included. Samsung and Tizen marks remain the property of their respective owners. This project is not affiliated with Samsung.
