# Moonlight Ambilight .NET Tizen service

The active Ambilight implementation is the isolated Tizen .NET `ServiceApplication` in this directory. The C implementation under `native/` is an earlier packaging experiment and is not used by the hybrid build. The upstream GUI, PPI, telemetry and unrelated features are not included.

## Runtime boundary and lifecycle

Moonlight Web/WASM is the orchestrator. On Moonlight startup it sends `command=initialize` to `MoonLightS.MoonlightAmbilight` to probe whether Samsung's video-plane capture library and entry point are present. The service replies with the capability result and exits in all cases; no idle process remains resident. If the probe fails, Moonlight disables only the Ambilight setting.

Ambilight startup is owned by one idempotent Web/WASM coordinator shared by EMSS and WMP. It starts the service only when both the connection-established signal and the negotiated-profile signal are present, and only when the persisted Ambilight setting is explicitly enabled. Concurrent or repeated readiness notifications share one in-flight startup and cannot launch duplicate service processes. EMSS publishes the profile after RTSP negotiation; WMP publishes it after the native decoder accepts its first video frame. The negotiated video format, actual HDR state, encoder colorspace and color range are resolved first; the resulting `hdr`, `colorSpace` and `fullRange` values are sent with `command=start`, `wledIp`, `wledPort` and `ledCount`. EMSS enables HDR only when HDR was requested and a 10-bit video format was negotiated. WMP uses its native `VideoHdrActive` state rather than inferring HDR from the requested toggle. An HDR request that falls back to an SDR format uses the SDR transfer path while retaining the configured encoder colorspace. Web/WASM terminates any stale service before launching a fresh process. Turning the setting off sends `command=stop`. Ending the stream sends `command=shutdown`, which stops capture and terminates the service. A failed start is followed by process cleanup.

The .NET service captures the decoded TV video plane through Samsung's `libvideo-capture.so.0.1.0` / `secvideo_api_capture_video_main` API. It detects letterbox/pillarbox margins, samples a band within each perimeter LED zone, and averages Y, U and V over the same region of the NV12 frame. SDR conversion honours Rec.601/709/2020 matrix selection and limited/full range. HDR uses the BT.2020 non-constant-luminance matrix, PQ-to-SDR tone mapping with a highlight shoulder, and linear-light BT.2020-to-BT.709 gamut mapping. A temporal filter stabilizes zone output before WLED realtime DRGB UDP packets are sent. Web/WASM never receives or processes video frames. It does not intercept EMSS, copy video buffers or implement capture. The PPI API in `libvideoenhance.so` is implemented as a separate, explicitly invoked diagnostic backend. It resolves one complete symbol family (`ppi_ve_*`, `ve_*` or `cs_ve_*`), queries the TV-reported slot count, block dimensions, measurement-space dimensions and settle time, and can perform a serialized one-shot RGB10 read. The normal capture loop never calls PPI; no `rc=-4` detection, automatic backend selection, DRM fallback or hand-back logic is enabled. PPI values are not passed through the NV12/HDR conversion pipeline.

## Build and package

The production hybrid workflow builds Ambilight with the same Tizen .NET toolchain and runtime target as WMP:

- `Tizen.NET.Sdk/1.1.6` and `tizen80` (Tizen 6.0 / API 8).
- Package manifest API `6.0` and service-application API `8`.
- Tizen Core project profile `tv-samsung-6.0` and project metadata API `6.0`.

WMP and Ambilight therefore share the Tizen 6.0 / API 8 service target. The outer hybrid WGT retains its existing package API floor of 5.5; that outer floor does not change the API level required by either embedded service. The Web UI and the two services retain their distinct application IDs under package ID `MoonLightS`.

## PPI backend (diagnostic stage only)

`command=ppi-probe` explicitly loads `libvideoenhance.so`, resolves all three measurement exports from one symbol family, reads the hardware condition structure and samples the centre of slot 0. The service reply includes the reported capabilities and the RGB10 sample. The sample operation validates the slot and coordinates against the values reported by the TV, waits the reported settle interval (clamped to a conservative 1–100 ms range), and serializes all native calls behind one lock. The probe shuts the library down before the short-lived service exits. It does not change the active backend or send PPI colours to WLED. This command is intended for controlled device verification; it is not part of normal stream startup.

The PPI ABI is undocumented and device-dependent. A successful build or symbol lookup is not proof that a particular TV returns fresh measurements. Verify `condition rc`, slot count, block dimensions, settle interval and repeated RGB readings on actual hardware before enabling any future DRM selector. No manifest privilege has been added on the basis of this implementation alone.

## Capture compatibility

The capture implementation uses a specific 32-bit Samsung TV ABI and the 960x540 NV12 plane layout. It refuses to enter the native API from a 64-bit process because that pointer layout has not been validated there. The capture library is a Samsung firmware component and may also be absent on a model or firmware version. On supported platform versions the service startup probe checks the library, symbol and process ABI; actual video capture is exercised only when the user enables Ambilight during a stream. A failed check disables Ambilight only and must never prevent installation, startup, EMSS/WMP streaming or any other Moonlight feature.

## Diagnostic workflow

The separate **Diagnose Tizen build-app hybrid support** workflow verifies the shared Tizen build image, rebuilds this service TPK, and tests whether Tizen `build-app` accepts the service project or a prebuilt TPK as a hybrid package component. It is a packaging investigation only; it does not produce or publish a production WGT.
