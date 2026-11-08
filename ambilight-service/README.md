# Moonlight Ambilight .NET Tizen service

The active Ambilight implementation is the isolated Tizen .NET `ServiceApplication` in this directory. The C implementation under `native/` is an earlier packaging experiment and is not used by the hybrid build. The upstream GUI, PPI, telemetry and unrelated features are not included.

## Runtime boundary and lifecycle

Moonlight Web/WASM is the orchestrator. On Moonlight startup it sends `command=initialize` to `MoonLightS.MoonlightAmbilight`. The service probes whether Samsung's video-plane capture library and entry point are present, then stays alive but idle when supported. If the probe fails, it replies `supported=false` and exits; Moonlight disables only the Ambilight setting.

When Ambilight is enabled during a stream, Web/WASM sends `command=start` with `wledIp`, `wledPort` and `ledCount`. Turning the setting off or ending a stream sends `command=stop`. Closing or restarting Moonlight sends `command=shutdown`, which stops capture and terminates the service.

The .NET service captures the decoded TV video plane through Samsung's `libvideo-capture.so.0.1.0` / `secvideo_api_capture_video_main` API, samples the NV12 plane and sends WLED realtime DRGB UDP packets. Web/WASM never receives or processes video frames. It does not intercept EMSS, copy video buffers or implement capture. No MessagePort, PPI, `libvideoenhance.so`, screenshot-to-file fallback or streaming-engine changes are involved.

## Build and package

GitHub Actions workflow **Build Moonlight Samsung TV hybrid WGT** on branch `1.2.4-pre`:

1. Builds Moonlight Web/WASM and obtains its base WGT.
2. Builds `TizenAmbilight.csproj` with the upstream project's toolchain and target: .NET 8, `Tizen.NET.Sdk/1.1.9`, `tizen90` (Tizen API 9), and the same `dotnet msbuild -restore -t:Rebuild -p:Configuration=Release -v:m` command used by the upstream CI. Only the service entry point, application identity and lifecycle are adapted for Moonlight; the Tizen build target is not downgraded.
3. Uses Tizen Core CLI to merge the Web WGT and .NET TPK into one signed hybrid WGT.
4. Validates package/application identities, the .NET assembly, signatures and the Web-to-service AppControl fields.

The Web UI and service use package ID `MoonLightS`, with distinct application IDs `MoonLightS.MoonlightWasm` and `MoonLightS.MoonlightAmbilight`. The Web WGT retains Moonlight's Tizen 5.5 minimum. The service's .NET target is API 9, matching the upstream service project; it is an optional component and must not change the Web application's required version. On a TV where this service runtime or the capture library is unavailable, only Ambilight is disabled. The outer hybrid package is explicitly checked in CI to retain the Web application's Tizen 5.5 minimum.

## Capture compatibility

The capture implementation uses a specific 32-bit Samsung TV ABI and the 960x540 NV12 plane layout. It refuses to enter the native API from a 64-bit process because that pointer layout has not been validated there. The capture library is a Samsung firmware component and may also be absent on a model or firmware version. The startup probe checks the library, symbol and process ABI; actual video capture is exercised only when the user enables Ambilight during a stream. A failed check disables Ambilight only and must never prevent installation, startup, EMSS/WMP streaming or any other Moonlight feature.
