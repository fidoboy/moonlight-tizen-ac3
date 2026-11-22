---
layout: docs-page
title: "Features Overview"
description: "Overview of Moonlight Tizen features, Dolby audio support and configuration."
---

# Features Overview

This page describes the Moonlight for Tizen client project. Feature availability depends on TV model, Tizen version, host configuration, network and connected peripherals.

## Primary feature over other clients: Dolby audio over digital output

The defining feature of this project is optional Dolby Digital and Dolby Digital Plus audio output for compatible Samsung TVs connected to a receiver or sound system over optical (TOSLINK) or HDMI. Unlike earlier versions, the host does not need to provide a native Dolby audio stream.

- **AC-3 (Dolby Digital):** stereo or 5.1-channel compressed audio can be delivered to Tizen's native EMSS audio renderer when the format is available and supported by the TV and connected equipment.
- **E-AC-3 (Dolby Digital Plus):** supported where the TV firmware, audio-output configuration and receiving equipment accept the format. E-AC-3 over optical is not guaranteed on every TV.
- **Host-side Dolby support (recommended):** when the host can provide AC-3 or E-AC-3 natively, Moonlight can use that stream directly. This is strongly recommended because it avoids real-time audio conversion on the TV client and therefore reduces additional audio-processing latency, improving responsiveness to controls and sound.
- **OPUS-to-Dolby conversion:** if the host does not provide Dolby audio, it can continue sending OPUS. Moonlight for Tizen will attempt to convert the incoming OPUS audio to Dolby Digital in real time, subject to the TV model, Tizen audio capabilities, selected settings and connected audio equipment. This provides broader compatibility with GameStream hosts and different TV/audio configurations, although software conversion can add latency.
- **Stereo and surround sound:** the available channel layout and Dolby format depend on the incoming stream, the conversion path and the capabilities of the TV and receiver. AC-3 output is limited to 5.1 channels.

The Dolby audio path has been tested with compatible Samsung TVs and external audio equipment. Results can differ across TV models, firmware versions and receivers. See [Known Issues and Limitations](Known-Issues-and-Limitations.md#dolby-optical-audio).

## Audio stream statistics

The performance overlay can be opened with **Ctrl+Alt+Shift+S** when a keyboard is connected to the TV. Alternatively, press **Play/Pause** or **Back** on the TV remote to open the streaming menu and select the statistics option. It reports the negotiated audio codec, the channel layout and channel count, and an approximate measured audio bitrate alongside the existing video codec and streaming statistics. The codec label reflects the active session, not merely the selected preference.

## Other improvements specific to this project

- **Interface localization:** the interface is available in English, Spanish, German, French, Italian, Russian, and Brazilian Portuguese.
- **Remote-accessible streaming menu:** open the streaming menu with **Play/Pause** or **Back** on the TV remote, or hold **Select** on a game controller for one second and release it, to reach streaming controls and statistics without needing a keyboard.
- **Enhanced real-time statistics overlay:** includes live graphs for host latency and connection quality/throughput, helping identify latency spikes, degraded reception, insufficient bandwidth, and other communication problems.
- **Smart Hub direct-launch shortcuts:** launch configured applications on the remote host directly from Smart Hub, bypassing the usual Moonlight interface, update check, and host-discovery steps.
- **Quit host app on disconnect:** optional best-effort request to close the running host application after a normal disconnection. Unexpected connection failures do not trigger it.
- **Animated native launch screen:** adds a generated animated splash screen for supported Tizen startup behavior.
- **Digital-output settings refinements:** improves setting state, channel choices and remote-control navigation when the Dolby option is enabled.
- **Startup behavior:** improves the transition from the native launch screen to the host list and avoids an unnecessary full-screen loading overlay.
- **Input and UI refinements:** includes keyboard-handling, focus and settings-navigation improvements.

- **Interface themes and decorations:** choose from different color schemes and interface decorations.
- **Screensaver:** while the TV remains powered on but no stream is being received, displays a simple moving logo to help save energy and protect the screen. Its movement prevents the same static shape from remaining illuminated in one position for too long.
- **Animated wallpapers:** optional animated backgrounds provide a look and feel similar to video-game consoles. They give the interface a console-like appearance while remaining useful for other purposes, such as business demonstrations or using the TV as a wireless secondary display for a computer. Animated wallpapers can be disabled.
- **Audio handling improvements:** this project improves handling of different audio codecs, supporting both native playback and software-based processing or conversion according to each TV's capabilities. This broadens compatibility across more TV models and audio configurations, although results and the overall experience may vary from one setup to another.

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

Moonlight for Tizen is compatible with host software that uses the GameStream protocol; the host does not have to provide Dolby Digital audio. If you want to use Dolby Digital, however, a host that can provide AC-3 or E-AC-3 natively is preferable. Native Dolby output avoids real-time OPUS-to-Dolby conversion on the TV client, reducing additional audio-processing latency and generally providing a more responsive experience. When the host only provides OPUS, Moonlight will attempt real-time conversion where supported by the TV and connected audio equipment. For installation, start with the [Quick Start Guide](Quick-Start-Guide.md).
