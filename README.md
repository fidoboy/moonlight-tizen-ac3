<p align="center">
  <img src="docs/assets/moonlight-tizen-banner.svg" alt="Moonlight for Tizen with Dolby Digital" width="100%" />
</p>

# Moonlight Tizen with AC-3 support

[![Release Version](https://img.shields.io/github/v/release/fidoboy/moonlight-tizen-ac3?style=for-the-badge&logo=github)](https://github.com/fidoboy/moonlight-tizen-ac3/releases/latest)
[![Build Status](https://img.shields.io/github/actions/workflow/status/fidoboy/moonlight-tizen-ac3/build-ac3-passthrough.yml?branch=master&style=for-the-badge&logo=docker)](https://github.com/fidoboy/moonlight-tizen-ac3/actions/workflows/build-ac3-passthrough.yml?query=branch%3Amaster)
[<img src="https://img.shields.io/badge/Tizen-TV-blue?style=for-the-badge" />](https://www.tizen.org/)
[![Total Downloads](https://img.shields.io/github/downloads/fidoboy/moonlight-tizen-ac3/total?style=for-the-badge&logo=github)](https://github.com/fidoboy/moonlight-tizen-ac3/releases)
[![Project Website](https://img.shields.io/website?url=https%3A%2F%2Ffidoboy.github.io%2Fmoonlight-tizen-ac3%2F&style=for-the-badge&link=https%3A%2F%2Ffidoboy.github.io%2Fmoonlight-tizen-ac3%2F
)](https://fidoboy.github.io/moonlight-tizen-ac3/)

Moonlight Tizen with AC-3 support is a port of [Moonlight ChromeOS](https://github.com/moonlight-stream/moonlight-chrome), an open-source client for NVIDIA GameStream and [Sunshine](https://app.lizardbyte.dev/Sunshine/). It lets you stream games, applications, and your desktop from a PC to a Smart TV running TizenOS.

<p align="center">
  <br>
  <a href="https://fidoboy.github.io/moonlight-tizen-ac3/" target="_blank">
    <img src="docs/assets/visit-website-button.svg" alt="Visit app website" height="56">
  </a>
  <br><br>
</p>

This repository is an **independently maintained project derived from** [Brightcraft's Moonlight Tizen](https://github.com/brightcraft/moonlight-tizen). It builds on Brightcraft's extensive maintenance and development, as well as the earlier work of [OneLiberty](https://github.com/OneLiberty/moonlight-chrome-tizen) and the other contributors acknowledged below. It follows its own release series and development roadmap. In short, this client is a more advanced version of the original **Moonlight for Tizen**, previously maintained by Brightcraft, with additional features and improvements.

> [!IMPORTANT]
>
> ## Main purpose: optional <img src="docs/assets/dolby-double-d.svg" alt="Dolby double-D symbol" width="26" height="26" /> Dolby Digital audio over optical or HDMI output
>
> The principal reason for this independent project is optional **AC-3 (Dolby Digital) or E-AC-3 (Dolby Digital Plus) passthrough** for compatible TizenOS Smart TVs connected over optical (TOSLINK) or HDMI to a receiver or sound system that supports the selected Dolby format. When the host and playback path support it, the client passes the compressed audio stream to Tizen's native EMSS audio renderer, allowing **stereo or 5.1 surround sound** over a supported optical or HDMI setup.
>
> - **AC-3 is limited to 5.1 channels.** The current matching experimental Sunshine encoder supports stereo and 5.1; the effective output also depends on the TV model, its audio-output settings, and the receiver or soundbar.
> - **Opus compatibility is preserved.** Dolby negotiation is optional. If a host only provides Opus, or does not select AC-3/E-AC-3, Moonlight continues using the normal Opus path. Hosts that do not implement the optional Dolby extensions remain compatible and do not need to be modified.
> - **Dolby passthrough requires a compatible host.** The matching experimental implementation is available in [fidoboy/Sunshine — pr/dolby-ac3-eac3](https://github.com/fidoboy/Sunshine/tree/pr/dolby-ac3-eac3) and this experimental build, already tested with this client, can be [downloaded here](https://nightly.link/fidoboy/Sunshine/actions/runs/38719776826/build-Windows-AMD64.zip) (x64) or [here](https://nightly.link/fidoboy/Sunshine/actions/runs/38719776826/build-Windows-ARM64.zip) (ARM). It's also available with [this Vibeshine](https://github.com/Nonary/vibeshine/releases/tag/2.0.2-nightly.d20261025.ddf42cfa263d) nightly build. With a host that only offers Opus, the client continues to work as usual.
>
> The complete path has been tested with an experimental Sunshine host and Moonlight Tizen on a Samsung TV, including AC-3 and E-AC-3 in default and High Quality audio modes. Results depend on the connected TV and audio equipment.

### Other improvements in this project

- **Faster Smart Hub app launching:** games and applications can now be launched directly from their Smart Hub shortcuts without loading Moonlight's full interface, significantly reducing startup time. Launching Moonlight from its own app icon retains the normal startup flow.
- **Streaming configuration summary bar:** the Hosts and Apps screens show the current Moonlight streaming configuration at a glance, including resolution, frame rate, bitrate, HDR, video codec, Dolby audio, channel layout, and Game Mode.
- **Remote-accessible Stream Menu:** press the TV remote's Play/Pause button while streaming to open the Stream Menu, which provides host keyboard shortcuts, performance-statistics controls, disconnect, and close-menu actions.
- **Audio stream and enhanced statistics:** displays the negotiated audio codec, channel layout, channel count, and approximate audio bitrate alongside the existing video statistics. Also adds latency graphs and improves the statistics overlay's readability and layout.
- **Additional language support:** adds the German (de-DE), French (fr-FR), Italian (it-IT), Russian (ru-RU) and Spanish (es-ES) translations for the interface, including the new settings and audio statistics.
- **Quit host app on disconnect:** an optional setting requests that the running host application quit after a normal disconnection; unexpected connection failures do not trigger it.
- **Animated native launch screen:** adds an animated Tizen splash screen.
  
  <img width="640" height="360" alt="Moonlight-Tizen-Launch-Preview" src="https://github.com/user-attachments/assets/dde25aae-c907-46ae-a6f7-a77af1684cfa" />

- **Settings and input refinements:** improves optical-output settings, their disabled-state presentation and remote navigation, with related keyboard/input refinements.

---

## ⚙️ Prerequisites

Before proceeding with the installation, please take a moment to ensure that your current hardware, network, and input setup fully meet the necessary requirements described below:
- **Client:** Smart TV running Tizen OS version 5.5 or newer (model year 2020 onwards).
- **Host software:** Install and configure a streaming host compatible with the GameStream protocol. Options include [NVIDIA GameStream (legacy, for SHIELD)](https://www.nvidia.com/en-us/support/gamestream/gamestream-pc-setup/), [Sunshine](https://app.lizardbyte.dev/Sunshine/), [Apollo](https://github.com/ClassicOldSong/Apollo), [Vibeshine](https://github.com/Nonary/vibeshine), and [Punktfunk](https://punktfunk.unom.io/) with its GameStream/Moonlight compatibility enabled.
- **Host hardware:** Gaming PC with a GPU capable of hardware encoding that meets the [system requirements](https://docs.lizardbyte.dev/projects/sunshine/latest/index.html#%EF%B8%8F-system-requirements) for optimal streaming performance.
- **Audio equipment (optional):** For optical or HDMI surround sound, the TV must support Dolby Digital output over its optical (TOSLINK) or HDMI output connection, and the connected receiver or speaker system must support the selected Dolby format. Configure the TV's digital audio output settings accordingly. Actual format support depends on the TV model, firmware, and connected equipment.
- **Dolby audio (optional):** To receive AC-3 (Dolby Digital) or E-AC-3 (Dolby Digital Plus), the host must explicitly support and transmit one of these formats. This is currently available only in the [experimental Sunshine branch maintained for this project](https://github.com/fidoboy/Sunshine/tree/pr/dolby-ac3-eac3) which is awaiting upstream review and can be can be [downloaded here](https://nightly.link/fidoboy/Sunshine/actions/runs/38719776826/build-Windows-AMD64.zip) (x64) or [here](https://nightly.link/fidoboy/Sunshine/actions/runs/38719776826/build-Windows-ARM64.zip) (ARM). It's also available with Vibeshine starting with [this nightly build](https://github.com/Nonary/vibeshine/releases/tag/2.0.2-nightly.d20261025.ddf42cfa263d). Other compatible hosts can still stream audio using Opus.
- **Network:** Mid-range or high-end wireless router with a stable wireless connection (Wi-Fi 5/6) for the TV and a wired gigabit Ethernet connection (CAT5e or better) for the host PC are strongly recommended.
- **Input:** [Supported gamepad](https://github.com/fidoboy/moonlight-tizen-ac3/blob/master/docs/Frequently-Asked-Questions.md#which-controllers-can-i-use) connected to your TV or directly connected to a nearby PC is highly recommended for the best streaming experience.

---

### 📺 Supported TVs

Moonlight for Tizen (AC-3) is designed for Smart TVs running **Tizen OS 5.5 or later**.

Although Tizen is primarily associated with Samsung TVs, Samsung also licenses its Tizen TV platform to other manufacturers. These include brands such as Akai, Bauhn, Linsar, RCA, Vispera, Sunny, Axen, EKO, QBELL, and Axdia.

- [Samsung Tizen OS licensing partnerships (2022)](https://news.samsung.com/uk/samsung-tizen-os-expands-its-global-presence-with-new-licensing-partnerships)
- [Expansion of the Tizen OS licensing program (2025)](https://news.samsung.com/global/samsung-expands-tizen-os-licensing-program-with-new-global-partners-and-enhanced-offerings)

**Compatibility note:** Moonlight for Tizen (AC-3) has been tested on Samsung Smart TVs. Compatibility with Tizen-powered TVs from other manufacturers has not been verified and may vary by model, firmware, and available platform features.

---

## 📦 Installation

Download `Moonlight.wgt` or `Moonlight-ForceGM.wgt` from the [latest stable release](https://github.com/fidoboy/moonlight-tizen-ac3/releases/latest) and install it using [Apps2Samsung](https://apps2samsung.com/#download) or Tizen Studio. Both methods require enabling Developer Mode on the TV. See the [Installation Guide](https://github.com/fidoboy/moonlight-tizen-ac3/blob/master/docs/Installation-Guide.md) for step-by-step instructions.

---


## 📚 Documentation

The guides are maintained in this repository and describe this project's current behavior.

- [Quick Start Guide](https://github.com/fidoboy/moonlight-tizen-ac3/blob/master/docs/Quick-Start-Guide.md)
- [Installation Guide](https://github.com/fidoboy/moonlight-tizen-ac3/blob/master/docs/Installation-Guide.md)
- [Updating Guide](https://github.com/fidoboy/moonlight-tizen-ac3/blob/master/docs/Updating-Guide.md)
- [Features Overview](https://github.com/fidoboy/moonlight-tizen-ac3/blob/master/docs/Features-Overview.md)
- [Frequently Asked Questions](https://github.com/fidoboy/moonlight-tizen-ac3/blob/master/docs/Frequently-Asked-Questions.md)
- [Known Issues and Limitations](https://github.com/fidoboy/moonlight-tizen-ac3/blob/master/docs/Known-Issues-and-Limitations.md)
- [Troubleshooting Guide](https://github.com/fidoboy/moonlight-tizen-ac3/blob/master/docs/Troubleshooting-Guide.md)
- [Development Guide](https://github.com/fidoboy/moonlight-tizen-ac3/blob/master/docs/Development-Guide.md)

---


## 📖 Project history and independent development

This project continues the work of the broader Moonlight Tizen community. The original technical foundation was laid by the [Samsung Developers Forum](https://github.com/SamsungDForum/moonlight-chrome), which demonstrated how Moonlight could run on Tizen by porting the ChromeOS client to WebAssembly, adapting network access, and using the Tizen WASM Player for hardware-accelerated media playback.

The project was then made into a more readily installable Tizen application by [KyroFrCode](https://github.com/KyroFrCode/moonlight-chrome-tizen). Community forks continued to extend it. In particular, [OneLiberty](https://github.com/OneLiberty/moonlight-chrome-tizen) contributed important features such as video codec selection, gamepad mouse emulation, Wake-on-LAN, and IP address input improvements. Other contributors added features including surround-sound configuration, performance statistics, localization, networking support, and additional fixes.

[Brightcraft's dedicated Moonlight Tizen repository](https://github.com/brightcraft/moonlight-tizen) built on that foundation with extensive ongoing work: refactoring the codebase, updating core libraries, resolving long-standing bugs, improving the UI/UX, maintaining the build process, and integrating community contributions. That work made the application more mature and feature-rich, and provides the technical foundation on which this project builds.

The fidoboy/moonlight-tizen-ac3 project is maintained independently. Its primary focus is optional Dolby Digital / Dolby Digital Plus passthrough for compatible optical audio setups, while preserving the normal Opus streaming path for hosts that do not support Dolby. The additional features listed above are maintained alongside that core objective. This project preserves attribution to the earlier projects and contributors whose work it builds upon.


---

## 📝 Changelogs

See the project's [CHANGELOG](https://github.com/fidoboy/moonlight-tizen-ac3/blob/master/CHANGELOG.md) for this release series. Earlier history remains represented in the repository and in the upstream projects acknowledged below.


---

## 🛠️ Contributing and reporting issues

This project is developed and maintained independently. Please report reproducible bugs or request features through [GitHub Issues](https://github.com/fidoboy/moonlight-tizen-ac3/issues/new/choose). Before reporting a problem, consult the [Troubleshooting Guide](https://github.com/fidoboy/moonlight-tizen-ac3/blob/master/docs/Troubleshooting-Guide.md) and [Known Issues and Limitations](https://github.com/fidoboy/moonlight-tizen-ac3/blob/master/docs/Known-Issues-and-Limitations.md). Do not include pairing PINs, passwords, private keys, or other secrets in reports. For code contributions, open a pull request against `master` with a focused description and test results where possible. Consult the local [Development Guide](https://github.com/fidoboy/moonlight-tizen-ac3/blob/master/docs/Development-Guide.md) for build and release procedures.


---


## ⚖️ License

This project is licensed under the GNU General Public License v3.0. See the project's [LICENSE](https://github.com/fidoboy/moonlight-tizen-ac3/blob/master/LICENSE) file for the full license text.


---

## 🙏 Contributors

This project is made possible thanks to the people who dedicate their time, knowledge, and feedback to making it better.

The contributor graph below reflects contributions to this repository. Special thanks to Brightcraft and the earlier contributors are recorded separately below.

<a href="https://github.com/fidoboy/moonlight-tizen-ac3/graphs/contributors?all=1">
  <img src="https://contrib.rocks/image?repo=fidoboy/moonlight-tizen-ac3"/>
</a>

### Special thanks to:

- [Moonlight Game Streaming Project](https://github.com/moonlight-stream) — for creating the core Moonlight implementation, adapting the NVIDIA GameStream protocol, and developing the Moonlight Chrome OS client. The project’s open-source work made it possible to bring Moonlight streaming support to additional platforms and serves as the foundation for the entire Tizen port.
- [Samsung Developers Forum](https://github.com/SamsungDForum/moonlight-chrome) — for creating the first Tizen OS (WASM) adaptation based on the Moonlight Chrome OS client. Their work made Moonlight available on Samsung Smart TVs by integrating the client with Tizen’s WASM environment, including video and audio playback through Tizen WASM Player, platform-specific adjustments, and the initial groundwork required for running Moonlight on Tizen devices.
- [KyroFrCode](https://github.com/KyroFrCode/moonlight-chrome-tizen) — for further developing the Tizen implementation by introducing improvements such as a dedicated application build method, 1440p resolution support, a shortcut combo to stop the streaming session, and audio volume control using the remote. Their work helped provide the starting point for later community development of the Tizen client.
- [OneLiberty](https://github.com/OneLiberty/moonlight-chrome-tizen) — for expanding the Tizen implementation in their fork with features such as video codec selection, mouse emulation using the gamepad, Wake-on-LAN (WoL), a new IP address input mode, and other improvements. These changes served as a foundation that was later adapted, improved, and integrated into this project.
- [Brightcraft](https://github.com/brightcraft/moonlight-tizen) — for the extensive maintenance and development of the dedicated Moonlight Tizen client, including codebase refactoring, core-library updates, bug fixes, UI/UX improvements, build maintenance, and integration of community contributions. This independent project builds directly on that work.
- [toypoodlegaming](https://github.com/toypoodlegaming/moonlight-chrome-tizen) — for further expanding the functionality in their fork with features such as 5.1 and 7.1 surround sound configuration, performance statistics, and enhanced bitrate calculation. These changes served as a foundation that was later adapted, improved, and integrated into this project.
- [eduardomozart](https://github.com/eduardomozart) — for contributing to the project with localization support featuring Tizen-first locale detection, HTTP subnet scanning, IPv6 and DNS hostname support, custom port support, Smart Hub Preview support, and build optimizations, along with numerous fixes and improvements that were further refined and integrated into the application.
- [fophillips](https://github.com/fophillips) — for contributing to the project by integrating the Web Audio backend implementation from [ruanformigoni](https://github.com/ruanformigoni) alongside the existing EMSS backend, with an Audio Backend selection setting for switching between the two renderers.
