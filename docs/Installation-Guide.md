# Installation Guide

The client is packaged as a signed Tizen widget (`.wgt`). Choose an installation method that matches your TV, computer and installed Samsung development tools.

## Download a package

- **Moonlight.wgt:** standard signed widget for installation with Apps2Samsung or Tizen Studio.
- **Moonlight-ForceGM.wgt:** alternative signed widget with additional Game Mode metadata. It does not enable Game Mode on models or Tizen versions where the platform does not support it.

Find the latest public packages on the [Releases page](https://github.com/fidoboy/moonlight-tizen-ac3/releases). Development builds may also be available as temporary artifacts from [GitHub Actions](https://github.com/fidoboy/moonlight-tizen-ac3/actions/workflows/build-ac3-passthrough.yml); those artifacts are intended for testing and expire according to the workflow's retention policy.

## Method A: Apps2Samsung

[Apps2Samsung](https://apps2samsung.com/#download) installs a signed WGT from a computer over the local network. Developer Mode must be enabled on the TV.

1. Connect the TV and computer to the same network.
2. On the TV, open Apps and enter the Smart Hub remote-control code required by your model to expose the Developer Mode option.
3. Enable Developer Mode and enter the computer's IP address where requested.
4. Restart the TV if its Developer Mode screen requests it.
5. Use the [Apps2Samsung](https://apps2samsung.com/#download) installer to connect to the TV and install the downloaded WGT.

The exact menu labels and code-entry behavior vary across Samsung TV generations. Do not change unrelated TV settings when enabling Developer Mode.

## Method B: Tizen Studio

Tizen Studio is the official Samsung/Tizen development environment and is useful for developers and more involved troubleshooting.

1. Install Tizen Studio and the TV tools appropriate for the target Tizen version.
2. Enable Developer Mode on the TV and note its IP address.
3. In Device Manager, connect to the TV.
4. Configure a certificate profile accepted by the TV and sign the WGT as required by Tizen Studio.
5. Install the package using the Tizen package/deploy tools or the IDE.

Use Samsung's current documentation for installing Tizen Studio and setting up TV certificates because those procedures vary by SDK and operating system.

## Building the package

The repository's [Development Guide](Development-Guide.md) explains how to build the WGT with the included Dockerfile. Docker builds are useful when testing the exact source revision or the two package variants.

## Moving from the Brightcraft base application

The independent release series starts at version 1.0.0, while the base application used a higher 1.18.x version. Tizen may therefore reject an in-place downgrade or treat the package signature differently. If installation fails, uninstall the previous application before installing this project. Uninstalling can remove local application data, so note your settings and host details first.

## First launch

Start Moonlight from the TV's Apps screen, allow local-network discovery, then pair it with the host PC. If it does not appear automatically, use Add Host and enter the host IP address or DNS name. See the [Quick Start Guide](Quick-Start-Guide.md).
