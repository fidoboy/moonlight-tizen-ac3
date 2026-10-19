---
layout: docs-page
title: "Troubleshooting Guide"
description: "Troubleshooting common Moonlight Tizen connection, audio and streaming issues."
---

# Troubleshooting Guide

## Moonlight does not find the host

1. Confirm that Sunshine is running and that the TV and PC are reachable on the same network.
2. Check the host firewall and router isolation settings.
3. Try Add Host with the PC's IPv4 address, IPv6 address or DNS hostname.
4. If the host uses custom ports, confirm that those ports are configured consistently.
5. If discovery works intermittently, test with the TV connected over a reliable 5 GHz Wi-Fi connection or Ethernet.

## Pairing fails

- Confirm that the PIN is entered into the correct host's Sunshine Web UI.
- Remove stale pairing entries only if you can pair the client again.
- Verify system time and that the TV and PC can communicate without a firewall rule blocking the host.

## Stream starts but video freezes, goes black or drops frames

- Start with a lower resolution, 60 FPS and a conservative bitrate.
- Verify that the selected video codec is supported by both TV and host GPU.
- Update GPU drivers and Sunshine if the issue also occurs from other clients.
- If wired Ethernet is unstable at high bitrates, test another network path. Some TVs have Fast Ethernet ports despite the host being connected at Gigabit speeds.

## No audio or audio has the wrong channel layout

- Check the TV audio output, receiver input, volume and mute settings.
- Try the default OPUS path first. If that works, enable optical output only when testing Dolby.
- Use Stereo first, then 5.1 after confirming that the TV/receiver chain supports it.
- Remember that the current Dolby host implementation supports Stereo and 5.1. Do not select 7.1 for the Dolby encoder path.

## Statistics show OPUS instead of AC-3 or E-AC-3

1. Confirm that **Enable Dolby Digital** is enabled in Moonlight.
2. Confirm that the host is running the matching experimental [Sunshine ac3-audio branch](https://github.com/fidoboy/Sunshine/tree/ac3-audio) and was built with the optional FFmpeg Dolby encoder available.
3. Start a new stream after changing the host's audio settings.
4. Verify that the host log reports the intended AC-3 or E-AC-3 codec and bitrate.
5. If Sunshine does not offer or select Dolby, OPUS is the expected compatibility fallback.

An enabled setting alone does not prove a Dolby stream was negotiated. The audio statistics line reflects the active session.

## Controller or remote-control input does not work

- Confirm that the TV recognizes the controller in its own settings.
- Reconnect the controller before launching Moonlight.
- Test basic remote navigation in the host list and settings before starting a stream.
- If only a single game has input problems, compare it with another application to isolate game-specific mappings.

## Collecting useful diagnostic information

Record the Moonlight project version, TV model/Tizen version, Sunshine version and branch, codec and channel layout shown in statistics, resolution/FPS/bitrate settings, and whether the issue reproduces with OPUS. Avoid posting public IP addresses, PINs, private keys or other secrets.
