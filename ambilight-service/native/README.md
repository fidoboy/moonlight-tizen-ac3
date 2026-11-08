# Moonlight Ambilight native TV service

This is the native C ServiceApp packaged alongside the Moonlight Web/WASM UI in one Samsung TV hybrid WGT.

- Receives explicit AppControl requests from `MoonLightS.MoonlightWasm`.
- `command=start` supplies `wledIp`, `wledPort` and `ledCount`.
- `command=stop` ends the capture worker.
- Captures the decoded TV video plane through Samsung's `libvideo-capture.so.0.1.0` API.
- Converts NV12 perimeter samples to WLED realtime DRGB UDP packets (port 21324 by default).

The Web/WASM side only controls the service. It does not receive frames or process video.

The capture ABI is the 32-bit Samsung TV ABI: the service must be built for the ARM 32-bit TV target. The service fails closed on a non-32-bit process. Availability of the Samsung capture library remains firmware/model dependent.
