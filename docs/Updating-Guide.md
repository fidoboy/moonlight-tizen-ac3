# Updating Guide

## Updating to a newer project release

1. Open the [Releases page](https://github.com/fidoboy/moonlight-tizen-ac3/releases).
2. Download the latest `Moonlight.wgt`, or `Moonlight-ForceGM.wgt` if you specifically use that variant.
3. Install it with the same method you used previously (Apps2Samsung, Tizen Studio, or the relevant device tooling).
4. Launch Moonlight and verify that your saved settings and paired host entries are still present.

Use the same package variant and signing/install method whenever possible. If the TV refuses to install an update because of a version or certificate conflict, consult the [Installation Guide](Installation-Guide.md).

## Moving from Brightcraft's 1.18.x package to this project's 1.0.x series

This project starts a separate version sequence at 1.0.0. Since that number is below the original package's 1.18.x version, some TVs may not allow it to be installed as an in-place update. In that case:

1. Record the settings you need to restore.
2. Uninstall the old app using the TV's app manager or the tool used for installation.
3. Install the new project package and pair/configure hosts again if necessary.

Uninstallation may remove app-local data. This limitation follows from starting a distinct version series with the same Tizen application identity; it is not an indication that the WGT failed to build.

## Updating experimental builds

Experimental WGTs from GitHub Actions are temporary test artifacts. Download the artifact from the relevant workflow run rather than an old cached URL, and review the commit SHA before installing. Do not assume an experimental artifact is equivalent to a stable tagged release.
