---
layout: docs-page
title: "Frequently Asked Questions"
description: "Frequently asked questions about Moonlight Tizen, Dolby Digital audio passthrough, installation and controller compatibility."
---

# Frequently Asked Questions

## Does this project work with ordinary Sunshine hosts?

Yes. The Dolby extension is optional. If the host does not advertise or select AC-3/E-AC-3, the client retains the normal OPUS path. No Dolby-specific host change is required for an OPUS-only stream.

## How do I get Dolby Digital 5.1 over optical?

You need all of the following:

- This project with **Enable Dolby Digital** enabled.
- A matching Sunshine build with the `ac3-audio` implementation and an available Dolby encoder.
- A TV that can pass the selected Dolby bitstream over its optical connection.
- TV sound settings configured for a compatible passthrough/bitstream mode.
- A receiver or sound system that supports AC-3 and the channel layout being sent.

For the initial setup, choose 5.1 and check the **Audio stream** line in the statistics overlay (`Ctrl+Alt+Shift+S`).

## Does enabling Dolby Digital force Dolby on every host?

No. The option requests the optional codec during negotiation. If Dolby is not offered or the host does not select it, Moonlight uses OPUS. The active codec shown by the statistics overlay is the reliable way to check what the session is receiving.

## Does Dolby Digital Plus always work over TOSLINK?

No. E-AC-3 support depends on the particular Samsung TV, firmware, sound-output mode and receiving equipment. Some TV optical outputs support only a subset of bitstream formats. Use AC-3 if the equipment does not accept E-AC-3.

## Can Dolby passthrough carry 7.1 audio?

The current experimental Sunshine encoder path is intended for Stereo or 5.1. AC-3 itself is limited to 5.1. Normal OPUS streaming can offer other channel layouts when supported by the host and client.

## How do I view the active audio codec?

During streaming, press **Ctrl+Alt+Shift+S** to show or hide the statistics overlay. The audio line reports the negotiated codec, layout, channel count and approximate bitrate.

## What is the difference between Moonlight.wgt and Moonlight-ForceGM.wgt?

`Moonlight.wgt` is the standard package. `Moonlight-ForceGM.wgt` includes additional Game Mode metadata for cases where that variant is useful. It cannot overcome a platform-level lack of Game Mode support.

## Where can I find TV and application information?

In the application, open Settings and then About/System Information. Record the TV model, Tizen version, client version, host version and the selected video/audio settings when diagnosing a problem.

## Which controllers can I use?

Controller compatibility depends on the TV model, Tizen version and how the controller is connected. A Bluetooth or USB gamepad recognized by the TV is the recommended starting point. If a controller does not work in Moonlight, first verify that the TV itself recognizes it and consult the [Troubleshooting Guide](Troubleshooting-Guide.md).
