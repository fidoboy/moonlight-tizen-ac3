# Moonlight Ambilight .NET Tizen service

The active Ambilight implementation is the isolated Tizen .NET `ServiceApplication` in this directory. The C implementation under `native/` is an earlier packaging experiment and is not used by the hybrid build. The upstream GUI, PPI, telemetry and unrelated features are not included.

## Runtime boundary and lifecycle

Moonlight Web/WASM is the orchestrator. On Moonlight startup it sends `command=initialize` to `MoonLightS.MoonlightAmbilight`. The service probes whether Samsung's video-plane capture library and entry point are present, then stays alive but idle when supported. If the probe fails, it replies `supported=false` and exits; Moonlight disables only the Ambilight setting.

When Ambilight is enabled during a stream, Web/WASM sends `command=start` with `wledIp`, `wledPort` and `ledCount`. Turning the setting off or ending a stream sends `command=stop`. Closing or restarting Moonlight sends `command=shutdown`, which stops capture and terminates the service.

The .NET service captures the decoded TV video plane through Samsung's `libvideo-capture.so.0.1.0` / `secvideo_api_capture_video_main` API, samples the NV12 plane and sends WLED realtime DRGB UDP packets. Web/WASM never receives or processes video frames. It does not intercept EMSS, copy video buffers or implement capture. No MessagePort, PPI, `libvideoenhance.so`, screenshot-to-file fallback or streaming-engine changes are involved.

## Build and package

GitHub Actions workflow **Build Moonlight Samsung TV hybrid WGT** on branch `1.2.4-pre`:

1. Builds Moonlight Web/WASM and obtains its base WGT.
2. Builds `TizenAmbilight.csproj` with .NET 8 and `Tizen.NET.Sdk/1.1.9` targeting Tizen API 7 / Tizen 5.5.
3. Uses Tizen Core CLI to merge the Web WGT and .NET TPK into one signed hybrid WGT.
4. Validates package/application identities, the .NET assembly, signatures and the Web-to-service AppControl fields.

The Web UI and service use package ID `MoonLightS`, with distinct application IDs `MoonLightS.MoonlightWasm` and `MoonLightS.MoonlightAmbilight`. The service and package manifest target Tizen 5.5 so including this optional service does not raise Moonlight's minimum platform version.

## Capture compatibility

The capture API uses the 32-bit Samsung TV ABI and the 960x540 NV12 plane layout. The capture library is a Samsung firmware component and may be absent on a model or firmware version. The startup probe detects the library and symbol; actual capture is exercised only when the user enables Ambilight during a stream. Any capture failure is isolated to Ambilight and must not affect Moonlight streaming.
