---
layout: docs-page
title: "Quick Start Guide"
description: "Quick start instructions for Moonlight Tizen and compatible GameStream hosts."
---

# Quick Start Guide

Follow these steps to install Moonlight and start streaming to your Samsung Smart TV.

## 1. Check the setup

You need a Samsung Smart TV running Tizen 5.5 or newer, a PC with a GameStream-compatible host such as Sunshine, and a stable network connection between them. A hardware-encoding-capable GPU is required.

## 2. Install Moonlight

**Recommended: use the [Moonlight desktop installer](https://github.com/fidoboy/moonlight-tizen-ac3/releases/latest).** Download the installer for your computer (Windows, Linux or macOS) and run it. It includes the Tizen app and transfers it to your TV. Keep the computer and TV on the same local network.

**Alternative methods:** install through [Apps2Samsung](https://apps2samsung.com/) or use Tizen Studio. See the [Installation Guide](Installation-Guide.md) for details.

## 3. Connect to your host

1. Install and start a GameStream-compatible host on your PC, such as [Sunshine](https://app.lizardbyte.dev/Sunshine/) or [Vibeshine](https://github.com/Nonary/vibeshine/releases).
2. Open Moonlight on the TV and select your PC when it appears.
3. Enter the PIN shown by Moonlight in the host's pairing interface on your PC.
4. Select a game or the desktop to start streaming.

## 4. Optional: Dolby audio

For Dolby passthrough, use [Vibeshine 2.0.3 or later](https://github.com/Nonary/vibeshine/releases/tag/2.0.3) and enable **Enable Dolby Digital** in Moonlight's audio settings. See the [Features Overview](Features-Overview.md) for details.

## 5. Adjust your stream

Once streaming works, adjust resolution, frame rate, bitrate, video codec and audio settings to suit your TV and network. See the [FAQ](Frequently-Asked-Questions.md) for help.
