---
layout: docs-page
title: "Features Overview"
description: "Overview of Moonlight Tizen features, Dolby audio support and configuration."
---

# Features Overview

This page describes the Moonlight for Tizen client project. Feature availability depends on TV model, Tizen version, host configuration, network and connected peripherals.

## Primary feature over other clients: Dolby audio over digital output

The defining feature of this project is optional passthrough of Dolby Digital and Dolby Digital Plus audio for compatible Samsung TVs connected to a receiver or sound system over optical (TOSLINK) or HDMI.

- **AC-3 (Dolby Digital):** stereo or 5.1-channel compressed audio can be sent to Tizen's native EMSS audio renderer when the host negotiates AC-3 successfully.
- **E-AC-3 (Dolby Digital Plus):** supported where the host, TV firmware, audio-output configuration and receiving equipment accept the format. E-AC-3 over optical is not guaranteed on every TV.
- **Stereo and 5.1:** the current matching experimental Sunshine encoder supports stereo and 5.1. AC-3 is limited to 5.1. Seven-point-one selection remains available through the regular audio path when supported, but it is not part of the current Dolby encoder path.
- **Opt-in negotiation:** enable the **Enable Dolby Digital** option to request the Dolby path. Dolby audio is used only when the host advertises and selects a supported format.
- **OPUS compatibility:** if a host only sends OPUS, does not advertise the optional Dolby extension, or does not select a Dolby format, the client continues using its normal OPUS path. Existing OPUS-only hosts do not need changes.
- **Compatible host:** Dolby passthrough currently requires the matching experimental [fidoboy/Sunshine ac3-audio branch](https://github.com/fidoboy/Sunshine/tree/ac3-audio). The ordinary client audio path remains available when that host functionality is absent.

The optical-audio path has been tested end-to-end with an experimental Sunshine build, a Samsung TV, and a compatible optical-connected audio system. Results can differ across TV models, firmware and receivers. See [Known Issues and Limitations](Known-Issues-and-Limitations.md#dolby-optical-audio).

## Audio stream statistics

The performance overlay can be opened with **Ctrl+Alt+Shift+S** when a keyboard is connected to the TV. Alternatively, press **Play/Pause** or **Back** on the TV remote to open the streaming menu and select the statistics option. It reports the negotiated audio codec, the channel layout and channel count, and an approximate measured audio bitrate alongside the existing video codec and streaming statistics. The codec label reflects the active session, not merely the selected preference.

## Other improvements specific to this project

- **Interface localization:** the interface is available in English, Spanish, German, French, Italian, Russian, and Brazilian Portuguese.
- **Remote-accessible streaming menu:** open the streaming menu with **Play/Pause** or **Back** on the TV remote to reach streaming controls and statistics without needing a keyboard.
- **Enhanced real-time statistics overlay:** includes live graphs for host latency and connection quality/throughput, helping identify latency spikes, degraded reception, insufficient bandwidth, and other communication problems.
- **Smart Hub direct-launch shortcuts:** launch configured applications on the remote host directly from Smart Hub, bypassing the usual Moonlight interface, update check, and host-discovery steps.
- **Quit host app on disconnect:** optional best-effort request to close the running host application after a normal disconnection. Unexpected connection failures do not trigger it.
- **Animated native launch screen:** adds a generated animated splash screen for supported Tizen startup behavior.
- **Digital-output settings refinements:** improves setting state, channel choices and remote-control navigation when the Dolby option is enabled.
- **Startup behavior:** improves the transition from the native launch screen to the host list and avoids an unnecessary full-screen loading overlay.
- **Input and UI refinements:** includes keyboard-handling, focus and settings-navigation improvements.

## Core Moonlight Tizen features inherited from the community project

- Stream games, applications and the full desktop from NVIDIA GameStream-compatible installations or Sunshine.
- Support for Samsung TVs running supported Tizen versions (5.5 and newer).
- H.264, HEVC and AV1 video decoding when supported by the TV and host GPU.
- HDR streaming and configurable resolution, frame rate, bitrate and color range, within hardware limits.
- Automatic host discovery and pairing, with IPv4, IPv6, DNS hostnames and optional custom ports.
- Wake-on-LAN, online/offline host status, app sorting and host management.
- Keyboard, mouse and gamepad input, including multi-controller play, gamepad navigation and optional mouse emulation.
- EMSS and Web Audio playback backends, with audio settings dependent on the chosen backend.
- Smart Hub Preview support where supported by the Tizen version.
- Streaming statistics, connection warnings and latency-related options such as Game Mode when supported.

## Compatibility note

The Dolby capability is an optional extension and does not replace the general OPUS streaming protocol. The matching Sunshine host must also be built with the Dolby encoder available and configured to select AC-3 or E-AC-3. For the installation process, start with the [Quick Start Guide](Quick-Start-Guide.md).
