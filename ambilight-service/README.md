# Moonlight Ambilight native service

Samsung TV .NET ServiceApplication based on the video-plane capture implementation from
[TizenAmbilight](https://github.com/RitwickVerma/TizenAmbilight).

This service captures the decoded video plane with
`libvideo-capture.so.0.1.0` / `secvideo_api_capture_video_main`, samples the perimeter,
converts the samples to RGB, and sends WLED realtime DRGB UDP frames (port 21324 by default).

Configuration is read from Tizen Preferences:
- `wledIp`: WLED IPv4 address (required; empty disables output)
- `wledPort`: UDP port (default 21324)
- `ledCount`: number of LEDs (default 73; maximum 490)

The service is a separate TV-profile TPK project. It is not an IoT-Headed WGT and does not use
MessagePort, PPI, `libvideoenhance.so`, or screenshot-to-file capture.
