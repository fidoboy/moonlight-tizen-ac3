# Moonlight Tizen Installer

Self-contained desktop installer for Moonlight on Samsung Tizen TVs.

## Layout

- `src/MoonlightTizenInstaller/`: Avalonia desktop application and guided workflow.
- `src/MoonlightTizenInstaller.Core/`: platform-independent installation, certificate and device services.
- `vendor/Apps2Samsung/`: GPL-3.0-only source components adapted from Apps2Samsung.
- `assets/`: installer artwork and bundled Moonlight WGT inputs.
- `build/`: per-platform self-contained publishing scripts.

The installer embeds the release WGT at build time. It must not download the WGT at runtime.

## Upstream source

The certificate provisioning, certificate-profile handling, Samsung login callback, Tizen package signing, device discovery and SDB workflows are being ported from [Apps2Samsung](https://github.com/Apps2Samsung/Apps2Samsung), GPL-3.0-only. The upstream baseline selected for this port is commit `aae32ed4ea762bef3f6310f2f65aeb16752f8e78` (beta).

Third-party Tizen SDK materials and Samsung CA certificates are not automatically covered by the GPL. Their redistribution terms and required notices must be checked independently before embedding them in release artifacts.

## Initial implementation boundary

This directory establishes the dedicated installer solution boundary. The desktop application and core project are intentionally separate so the device/certificate workflow can be tested independently of the UI. The installer is not yet a working release artifact; the remaining port and integration work is tracked in the source tree as it is implemented.
