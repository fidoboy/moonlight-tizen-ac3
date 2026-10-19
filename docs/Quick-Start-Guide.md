---
layout: docs-page
title: "Quick Start Guide"
description: "Quick start instructions for Moonlight Tizen and compatible GameStream hosts."
---

# Quick Start Guide

This guide covers the shortest path from installation to a working stream on a Samsung Smart TV.

## 1. Check the setup

You will need:

- A Samsung Smart TV running Tizen 5.5 or newer.
- A PC running Sunshine or another compatible GameStream host.
- A hardware-encoding-capable GPU on the host.
- A stable network connection between the TV and PC. Ethernet for the host and a reliable 5 GHz Wi-Fi or Ethernet connection for the TV are good starting points.
- A compatible gamepad if you intend to play games with a controller.

See [Prerequisites in the README](https://github.com/fidoboy/moonlight-tizen-ac3#-prerequisites) for more details.

## 2. Install the client

**Recommended: install through the official [Apps2Samsung website](https://apps2samsung.com/).** Download and run Apps2Samsung on your computer, select your TV, find **Moonlight** in its app catalog, and select the `fidoboy · Enhanced · Dolby` variant. This is the simplest option because Apps2Samsung prepares and signs the package for you.

**Alternative: manual WGT installation.** Download `Moonlight.wgt` from the [latest stable release](https://github.com/fidoboy/moonlight-tizen-ac3/releases/latest), then install it using either method:

- **Apps2Samsung:** choose **Custom WGT / TPK** and select the downloaded file.
- **Tizen Studio:** connect to the TV with Developer Mode enabled and install the package using the Tizen deployment tools and a certificate profile accepted by the TV. See the [Installation Guide](Installation-Guide.md) for details.

Use `Moonlight-ForceGM.wgt` only if your TV specifically needs the alternative Game Mode metadata.
## 3. Configure the host and pair

1. Install and start Sunshine on the host PC.
2. Make sure the PC and TV can communicate over the same network and that the host firewall permits the streaming connections.
3. Launch Moonlight on the TV and select the host when it appears.
4. Moonlight displays a PIN. Open the Sunshine Web UI on the PC, enter that PIN in the pairing section and confirm.
5. Select a game or desktop entry to start streaming.

For a new setup, begin with conservative default resolution, frame rate and bitrate settings. Increase them after confirming that the stream is stable.

## 4. Enable Dolby optical output (optional)

Dolby passthrough requires the matching experimental [Sunshine ac3-audio build](https://github.com/fidoboy/Sunshine/tree/ac3-audio) — download the Windows [x64 build](https://nightly.link/fidoboy/Sunshine/actions/runs/38719776826/build-Windows-AMD64.zip) or [ARM64 build](https://nightly.link/fidoboy/Sunshine/actions/runs/38719776826/build-Windows-ARM64.zip) — plus a compatible TV audio path and a receiver or sound system that supports the format.

1. Connect the TV's optical output to the receiver or sound system.
2. In the TV's sound settings, choose an output mode that passes through a supported Dolby bitstream rather than forcing PCM stereo. The exact labels vary by model.
3. In Moonlight Settings, enable **Enable Dolby Digital** and select Stereo or 5.1.
4. Start a stream and open the performance overlay with **Ctrl+Alt+Shift+S**. Check whether the active audio line reports OPUS, AC-3 or E-AC-3 and the expected channel layout.

If the host only offers OPUS, the stream continues to use OPUS. An enabled client switch alone cannot make an OPUS-only host send Dolby audio.

## 5. Tune the stream

Once the first stream is working, adjust resolution, frame rate, bitrate, video codec and audio settings to match the TV and network capabilities. See [Features Overview](Features-Overview.md) and the [FAQ](Frequently-Asked-Questions.md) for details.
