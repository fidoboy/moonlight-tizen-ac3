---
layout: docs-page
title: "Troubleshooting Guide"
description: "Troubleshooting common Moonlight Tizen connection, audio and streaming issues."
---

# Troubleshooting Guide

## Apps2Samsung does not list the TV

1. Make sure **Developer Mode** is enabled on the Samsung TV. Press **Home**, open **Apps**, then open **App Settings** (usually the gear icon). On some older models, you can enter the code while the Apps screen is open.
2. Enter **12345** using the remote's number keys. If your Smart Remote has no number keys, open its on-screen keypad with the **123** button and enter the digits there. When the **Developer Mode** dialog appears, turn Developer Mode **On**.
3. In **Host PC IP**, enter the local IPv4 address of the computer running Apps2Samsung. It must match that computer's current address exactly. Use the IPv4 address of its active Wi-Fi or Ethernet adapter—not the TV's IP address, router gateway, `127.0.0.1` or public Internet address. Save the setting and restart the TV.
4. Confirm that the TV and computer are on the same local network, then scan for the TV again in Apps2Samsung. Guest Wi-Fi or router client isolation can block communication.

See the [Installation Guide](Installation-Guide.html) and [Samsung's official TV Device guide](https://developer.samsung.com/smarttv/develop/getting-started/using-sdk/tv-device.html) for more details.

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
2. Confirm that the host is running the matching [experimental Sunshine build](https://nightly.link/fidoboy/Sunshine/actions/runs/38719776826), built with the optional FFmpeg Dolby encoder. On the host, open **Settings → Audio/Video** and select **AC-3 (Dolby Digital)** or **E-AC-3 (Dolby Digital Plus)** from the stream audio format dropdown. If you use Vibeshine instead, use the [Vibeshine nightly distribution](https://github.com/Nonary/vibeshine/releases/tag/2.0.2-nightly.d20261025.ddf42cfa263d) or a newer nightly build.
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

The Moonlight app version, TV model and Tizen OS version are shown inside Moonlight under **Settings → About**. Open that screen to collect those details. Also record the Sunshine version and branch, the codec and channel layout shown in the streaming statistics, the resolution/FPS/bitrate settings, and whether the problem also occurs with OPUS. Then [open an issue on GitHub](https://github.com/fidoboy/moonlight-tizen-ac3/issues) and include the relevant information. Do not post public IP addresses, PINs, private keys or other secrets.
