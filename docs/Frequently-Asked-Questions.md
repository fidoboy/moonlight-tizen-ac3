---
layout: docs-page
title: "Frequently Asked Questions"
description: "Frequently asked questions about Moonlight Tizen, Dolby Digital audio passthrough, installation and controller compatibility."
---

# Frequently Asked Questions


## How do I update the app when a new version is available?

The app on your TV will notify you when a new release is available. If you used the recommended Apps2Samsung installation method, simply open Apps2Samsung again and select **Moonlight** with the **fidoboy · Enhanced · Dolby** variant to download the latest version. If you prefer to install it manually, download the new WGT package from the [latest release page](https://github.com/fidoboy/moonlight-tizen-ac3/releases/latest) and install it on your TV.

## How can I get better image quality or configure Moonlight for a more stable stream?

It is best to leave automatic bitrate optimization enabled for the first few connections. After each new connection, Moonlight recalculates the recommended bitrate based on the settings and negotiated characteristics that affect bandwidth usage, helping it identify a balanced value for your setup. Once that value stops changing because the host and Moonlight configurations remain the same, you can use it as a starting point for manual adjustments: disable automatic optimization and gradually increase the bitrate to try to improve image quality, at the cost of using more network bandwidth, or reduce it slightly if network conditions are less favorable, at the cost of some image quality. How far you can adjust it depends on the capabilities of the hardware at every point in the stream, as well as the available network bandwidth. Beyond a certain point, increasing the bitrate may no longer produce a noticeable improvement in image quality, even if the network can carry it.

## Does this project work with ordinary Sunshine or other GameStream-compatible hosts?

Yes. This Moonlight client should work correctly with legacy [NVIDIA GameStream](https://nvidia.custhelp.com/app/answers/detail/a_id/5436/~/game-stream-service-update), as well as modern compatible host software such as [Sunshine](https://github.com/LizardByte/Sunshine), [Apollo](https://github.com/ClassicOldSong/Apollo), [Punktfunk](https://punktfunk.unom.io/), [Vibeshine](https://github.com/Nonary/vibeshine), or any other server that uses the same protocol. Vibeshine is recommended because it offers advanced features and native Dolby Digital audio support. If Dolby Digital is enabled in Moonlight's settings but the host does not provide native Dolby Digital support, Moonlight will attempt to provide it through software encoding where possible; otherwise, it will use a best-effort approach. If Dolby Digital cannot be used for a stream, Moonlight remains backward-compatible and falls back to standard OPUS audio.

## How do I get Dolby Digital 5.1 over optical or HDMI TV outputs?

To use Dolby Digital through your TV's audio outputs, you need:

- This project with **Enable Dolby Digital** enabled.
- An external audio device connected to the TV if you want to use one, especially for 5.1 surround sound.
- A TV that can pass audio through its optical output or HDMI ARC/eARC connection. The results may vary depending on the TV model and the version of Tizen it runs.
- An external receiver or sound system capable of decoding Dolby Digital (AC-3) or Dolby Digital Plus (E-AC-3), if the TV sends audio to it in either of those formats.

The host does not need to provide a native Dolby Digital audio stream. Moonlight can provide Dolby Digital through its own audio handling, so the outcome depends primarily on the TV's capabilities and audio settings. Both optical and HDMI ARC/eARC connections are supported.

For the initial setup, choose 5.1 and check the **Audio stream** line in the statistics overlay. You can leave statistics enabled in Moonlight's **Advanced Settings**, or show them manually during a stream: open the streaming menu with **Play/Pause** on the TV remote or by holding the gamepad's **Select** button, then choose the statistics option. If a keyboard is connected to the TV, press **Ctrl+Alt+Shift+S** to show or hide the statistics directly.

## Does enabling Dolby Digital force Dolby on every host?

No. The option requests Dolby Digital when the stream is negotiated, but it does not force every host to provide it. If Dolby Digital is not offered or the host cannot select or provide it, Moonlight uses OPUS or the best available compatible audio path. The statistics overlay provides the most detailed information about the audio format negotiated for the stream and can be enabled optionally. You can also verify the actual output more reliably on the external receiver or sound system, if it has a display or an indicator LED that lights up when it receives a Dolby Digital signal. This helps confirm whether the audio output you are actually getting matches the settings selected in Moonlight. Ultimately, success depends on the combination of the host's capabilities, the TV model and its audio handling, and the capabilities of the external audio equipment.

## Does Dolby Digital Plus always work over TOSLINK?

No. E-AC-3 support depends on the particular Samsung TV, firmware, sound-output mode and receiving equipment. Some TV optical outputs support only a subset of bitstream formats. Use AC-3 if the equipment does not accept E-AC-3.

## Can Dolby passthrough carry 7.1 audio?

The current implementation is limited to Stereo and 5.1 channels. E-AC-3 theoretically supports 7.1, but the current FFmpeg encoder path used by this build does not expose that option. If FFmpeg adds support in the future, it may become possible to select 7.1 for E-AC-3. AC-3 itself remains limited to 5.1. Standard OPUS streaming may offer other channel layouts when supported by the host and client.

## How do I view the active video and audio codecs?

If a keyboard is connected to the TV, press **Ctrl+Alt+Shift+S** to show or hide the statistics overlay. Alternatively, press **Play/Pause** on the TV remote or press and hold the gamepad's **Select** button for one second, then release it, to open the streaming menu. Select the option to show statistics.

The stream lines in the overlay provide more information than just the negotiated codec names:

- **Video stream:** Shows the stream resolution and frame rate, followed by the negotiated video codec. When H.264 is used, its level may also be shown (for example, **H.264 L4.1**). This is the H.264 level selected for the stream's resolution and frame rate; it is not the H.264 Baseline profile. When HDR has been enabled and successfully negotiated with the host, the codec is identified as **HEVC 10-bit HDR** or **AV1 10-bit HDR**. If the corresponding 10-bit codec is shown as **SDR**, HDR was not negotiated for that stream.
- **Audio stream:** Shows the negotiated audio codec (OPUS, AC-3 or E-AC-3), the channel layout and channel count, and the bitrate currently being received. The bitrate is measured during the stream and can vary; it does not have to remain at the bitrate initially negotiated with the host. The **[Hardware]** or **[Software]** label indicates the active audio processing path. **[Hardware]** means the TV is handling the decoding through its native hardware support. This is generally preferable because it avoids software decoding in Moonlight and helps keep latency as low as possible. **[Software]** means Moonlight is performing software decoding or conversion/transcoding before delivering the audio to the TV, which can add processing latency.
- **HQ indicator:** When high-quality audio has been requested, an **HQ** superscript may appear beside the codec. Green means the host has confirmed that high-quality audio is active. White means the request was made, but Moonlight could not confirm from the host's response that the high-quality mode is actually being used.
- **Audio input / Audio transcode:** When Moonlight performs audio processing or format conversion in software before delivering audio to the TV, additional lines show the incoming audio bitrate and the average time spent processing each audio segment. This can happen when the incoming format is not natively supported by the TV, when Moonlight converts OPUS to PCM, AC-3 or E-AC-3, or when incoming AC-3 or E-AC-3 is converted to another format, such as PCM, because of the TV's capabilities or the selected audio settings. The reported time indicates the processing delay introduced by this software audio path.
- **Audio FEC:** Shows how many audio packets were recovered, how many FEC blocks failed, and how many packets arrived out of order during the latest measurement interval.

The **Frame rates** line separately reports received, decoded and accepted frames per second. **Incoming bitrate from network** shows the actual overall incoming network bitrate, which can fluctuate during a stream rather than staying fixed at the initially negotiated value. Other statistics report network latency, missing frames, average decoding time, frame queue delay and renderer submission time.

## Where can I find TV and application information?

In the application, open Settings and then About > System information. Record the TV model, Tizen version, client version, host version and the selected video/audio settings when diagnosing a problem.

If you need to report a problem or submit a suggestion, use the [GitHub issue tracker](https://github.com/fidoboy/moonlight-tizen-ac3/issues).

## Which controllers can I use?

Controller compatibility depends on the TV model, Tizen version and how the controller is connected. A Bluetooth or USB gamepad recognized by the TV is the recommended starting point. Compatible Xbox, PlayStation and Nintendo Wii Pro-style gamepads should generally work correctly, provided the TV recognizes them. When Moonlight detects a connected game controller, a button appears at the top of its interface. Select it to open the controller test, which displays visual indicators as you press buttons or move the sticks. If a controller does not work in Moonlight, first verify that the TV itself recognizes it and consult the [Troubleshooting Guide](Troubleshooting-Guide.md).
