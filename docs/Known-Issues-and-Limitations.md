---
layout: docs-page
title: "Known Issues and Limitations"
description: "Known compatibility issues and technical limitations of Moonlight Tizen with Dolby audio support."
---

# Known Issues and Limitations

## Dolby optical audio

- Dolby passthrough is an optional extension and requires the matching experimental Sunshine implementation. A standard host that sends OPUS remains supported but will continue using OPUS.
- AC-3 is limited to 5.1 channels. The current matching experimental encoder supports Stereo and 5.1, not 7.1.
- E-AC-3 pass-through over optical depends on the TV model, firmware, output configuration and receiver. Do not assume every TV can send E-AC-3 over TOSLINK.
- The TV's native audio pipeline must accept the compressed format. If it rejects track initialization, a Dolby stream cannot be played through that path.
- This feature has been tested with a specific Samsung TV and audio chain; compatibility across every TV/receiver combination has not been established.
- Audio bitrate shown in the overlay is an approximate measured receive rate, not a codec negotiation field or guaranteed encoder target.

## Tizen and TV limitations

- The client targets supported Samsung TVs running Tizen 5.5 or newer, but capabilities vary by model and firmware.
- Game Mode and high refresh-rate options may be restricted by the OS or TV capabilities even if a setting is visible.
- Some TVs have a 100 Mbps Ethernet port. Its practical throughput is lower than 100 Mbps, but a wired connection can still be faster and more stable than Wi-Fi on a particular TV. Compare the actual throughput and stability of both paths rather than assuming that 5 GHz Wi-Fi is always preferable. Account for FEC, audio traffic and bursty frame delivery near the Ethernet limit.
- H.264's advertised MIME level is selected automatically from the requested resolution and frame rate, using the H.264 limits for macroblocks per frame and per second. The Video Settings menu also allows a manual level override for compatibility testing. This only changes the level advertised to the TV; it does not prove that the decoder supports that level or combination. Higher frame rates and resolutions remain model- and firmware-dependent and may fail to start.
- Video resolution, frame rate, HDR, AV1 and high bitrates also depend on the TV decoder and host GPU encoder. Unsupported combinations may fall back or fail to start.

## Independent project and release status

This is an independently maintained project that includes hardware-dependent features. Its version sequence starts at 1.0.0 and is separate from versions of the [Brightcraft](https://github.com/brightcraft/moonlight-tizen) base project. Public release notes and known changes are available on the [Releases page](https://github.com/fidoboy/moonlight-tizen-ac3/releases) and in the [Changelog](../CHANGELOG.md).

When reporting a problem, include the exact project version, TV model and Tizen version, Sunshine version/branch, video settings, audio backend, channel selection and relevant logs.
