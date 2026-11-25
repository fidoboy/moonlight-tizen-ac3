# Moonlight Tizen Installer

Self-contained desktop installer for Moonlight on Samsung Tizen TVs.

## Layout

- `src/MoonlightTizenInstaller/`: Avalonia desktop application and guided workflow.
- `src/MoonlightTizenInstaller.Core/`: installer-owned workflow and service adapters.
- `vendor/Apps2Samsung/`: restricted GPL-3.0-only source subset for Samsung certificate issuance, recovery and signing-profile handling.
- `assets/`: installer artwork and bundled Moonlight WGT inputs.
- `build/`: per-platform self-contained publishing scripts.

The installer embeds the release WGT at build time. It must not download the WGT at runtime.

## Certificate subsystem provenance

The selected Apps2Samsung source baseline is commit `aae32ed4ea762bef3f6310f2f65aeb16752f8e78` (beta). The vendored source and its scope are documented in `vendor/Apps2Samsung/UPSTREAM.md`; the full GPL-3.0-only text and third-party notices are included alongside it.

The subset is deliberately limited to Samsung author/distributor certificate provisioning, profile validation and archive/backup handling, Samsung SignInGate callback authentication, and the models/helpers those paths depend on. SDB, TV discovery, package installation, catalog, remote-control, Jellyfin, mobile UI and unrelated Apps2Samsung features are not included.

No Samsung/Tizen SDK assets or CA binaries/private keys are included. Their redistribution terms will be reviewed separately for the existing GHCR development image, as requested.

## Integration status

The upstream certificate source has been copied into the vendor area verbatim. It is not yet compiled into the installer: several upstream abstractions are coupled to Apps2Samsung-wide configuration and helper contracts. Those dependencies must be isolated behind installer-owned services before the certificate workflow can be considered operational. The current Avalonia window remains a scaffold, not a usable installer.
