# Moonlight Ambilight .NET Tizen service

The active Ambilight implementation is the isolated Tizen .NET `ServiceApplication` in this directory. The C implementation under `native/` is an earlier packaging experiment and is not used by the hybrid build. The upstream GUI, PPI, telemetry and unrelated features are not included.

## Runtime boundary and lifecycle

Moonlight Web/WASM is the orchestrator. On Moonlight startup it sends `command=initialize` to `MoonLightS.MoonlightAmbilight` to probe whether Samsung's video-plane capture library and entry point are present. The service replies with the capability result and exits in all cases; no idle process remains resident. If the probe fails, Moonlight disables only the Ambilight setting.

When Ambilight is enabled for a stream, Web/WASM first checks for an existing service process, terminates it if present, and verifies that it has exited. It then launches a fresh service with `command=start` and `wledIp`, `wledPort` and `ledCount`; the service initializes video capture in that new process. Turning the setting off sends `command=stop`. Ending the stream sends `command=shutdown`, which stops capture and terminates the service. A failed start is followed by process cleanup.

The .NET service captures the decoded TV video plane through Samsung's `libvideo-capture.so.0.1.0` / `secvideo_api_capture_video_main` API, samples the NV12 plane and sends WLED realtime DRGB UDP packets. Web/WASM never receives or processes video frames. It does not intercept EMSS, copy video buffers or implement capture. No MessagePort, PPI, `libvideoenhance.so`, screenshot-to-file fallback or streaming-engine changes are involved.

## Build and package

The production hybrid workflow builds Ambilight with the same Tizen .NET toolchain and runtime target as WMP:

- `Tizen.NET.Sdk/1.1.6` and `tizen80` (Tizen 6.0 / API 8).
- Package manifest API `6.0` and service-application API `8`.
- Tizen Core project profile `tv-samsung-6.0` and project metadata API `6.0`.

WMP and Ambilight therefore share the Tizen 6.0 / API 8 service target. The outer hybrid WGT retains its existing package API floor of 5.5; that outer floor does not change the API level required by either embedded service. The Web UI and the two services retain their distinct application IDs under package ID `MoonLightS`.

## Capture compatibility

The capture implementation uses a specific 32-bit Samsung TV ABI and the 960x540 NV12 plane layout. It refuses to enter the native API from a 64-bit process because that pointer layout has not been validated there. The capture library is a Samsung firmware component and may also be absent on a model or firmware version. On supported platform versions the service startup probe checks the library, symbol and process ABI; actual video capture is exercised only when the user enables Ambilight during a stream. A failed check disables Ambilight only and must never prevent installation, startup, EMSS/WMP streaming or any other Moonlight feature.

## Diagnostic workflow

The separate **Diagnose Tizen build-app hybrid support** workflow verifies the shared Tizen build image, rebuilds this service TPK, and tests whether Tizen `build-app` accepts the service project or a prebuilt TPK as a hybrid package component. It is a packaging investigation only; it does not produce or publish a production WGT.
