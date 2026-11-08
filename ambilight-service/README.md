# Moonlight Ambilight hybrid service

The active implementation is the native C ServiceApp in `native/`. The build workflow packages it as a sub-application inside the same signed Samsung TV hybrid WGT as Moonlight Web/WASM.

## Runtime flow

1. Moonlight Web/WASM sends an explicit Tizen AppControl `start` request to `MoonLightS.MoonlightAmbilight`, including the WLED IPv4 address, UDP port and LED count.
2. The native service captures the decoded TV video plane through Samsung's `libvideo-capture.so.0.1.0` / `secvideo_api_capture_video_main` API.
3. It samples the NV12 perimeter, converts the samples to RGB and sends WLED realtime DRGB UDP packets.
4. Moonlight sends `stop` when the Ambilight setting is disabled or the stream stops.

The Web/WASM application never receives frames and does not perform capture or image processing. No MessagePort, PPI, `libvideoenhance.so`, screenshot-to-file capture, or stream-engine changes are used.

## Build

Run **Build Moonlight Samsung TV hybrid WGT** from GitHub Actions on branch `1.2.4-pre`. The workflow builds the Moonlight Web WGT, builds the native ARM ServiceApp against the baseline Tizen 9.0 rootstrap, adds it as a Web project dependency, signs one hybrid WGT and checks the packaged application IDs and executable.

The native capture ABI uses 32-bit pointers. The workflow therefore targets the 32-bit ARM Tizen device rootstrap. The capture library is a Samsung firmware component and may not be present on every TV model/firmware; the service logs a capture initialization failure and does not affect Moonlight streaming when unavailable.

The Moonlight Web app's `required_version` remains unchanged. The native service build target is Tizen 9.0; actual compatibility with earlier TV firmware must be established by compiling against an older Samsung TV-compatible rootstrap and testing that firmware. The current CI build is not evidence of support on every TV generation.
