# Moonlight Ambilight .NET Tizen service

The active Ambilight implementation is the original Tizen .NET `ServiceApplication` in this directory. The C implementation under `native/` is an earlier packaging experiment and is not used by the hybrid build.

## Runtime boundary

Moonlight Web/WASM is the orchestrator. It sends Tizen AppControl requests to `MoonLightS.MoonlightAmbilight`:

- `command=start` with `wledIp`, `wledPort` and `ledCount`.
- `command=stop` to end capture.

The .NET service handles those requests in `Program.cs`, captures the decoded TV video plane through Samsung's `libvideo-capture.so.0.1.0` / `secvideo_api_capture_video_main` API, samples the NV12 frame and sends WLED realtime DRGB UDP packets.

The Web/WASM side never receives or processes video frames. It does not intercept EMSS, copy video buffers, or implement capture. No MessagePort, PPI, `libvideoenhance.so`, screenshot-to-file fallback, or streaming-engine changes are involved.

## Build and package

GitHub Actions workflow **Build Moonlight Samsung TV hybrid WGT** on branch `1.2.4-pre`:

1. Builds Moonlight Web/WASM and obtains its base WGT.
2. Builds `TizenAmbilight.csproj` with .NET 8 and `Tizen.NET.Sdk/1.1.9`, producing the .NET Tizen TPK.
3. Uses Tizen Core CLI to merge the Web WGT and .NET TPK into one signed hybrid WGT.
4. Validates the package/application identities, the .NET assembly, signatures and Web-to-service AppControl fields.

The Web UI and service use package ID `MoonLightS`, with distinct application IDs `MoonLightS.MoonlightWasm` and `MoonLightS.MoonlightAmbilight`. The service manifest version is aligned with the Web package during CI.

The build target currently follows the service project's `tizen90` target. A successful build proves compilation and packaging for that target; it does not by itself prove compatibility with every older Samsung TV firmware or verify video-plane capture on hardware.

## Capture compatibility

The capture API uses the 32-bit Samsung TV ABI and the 960x540 NV12 plane layout. The capture library is supplied by Samsung firmware and may not be present on every model or firmware version. Capture initialization failure is confined to Ambilight and must not affect Moonlight streaming.
