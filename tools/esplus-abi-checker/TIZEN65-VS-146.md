# ESPlus CAPI: Tizen 6.5 0.0.3 vs current 1.4.6

## Sources

- Historical: `esplusplayer-0.0.3-0.src.rpm` from Tizen 6.5 Unified.
- Current: `esplusplayer-1.4.6-0.src.rpm` from Tizen Unified.
- Both source archives were extracted in GitHub Actions. No header was reconstructed or copied into this repository.

## ARM32 ABI result

Both versions compile independently with the ARM GNU EABI cross-compiler and execute under QEMU ARM32. The repository adapter aliases the actual vendor types from each version.

| Type | Tizen 6.5 / 0.0.3 | Current / 1.4.6 |
|---|---:|---:|
| `esplusplayer_audio_stream_info` | 24 bytes, align 4 | 24 bytes, align 4 |
| `esplusplayer_video_stream_info` | 36 bytes, align 4 | 36 bytes, align 4 |
| `esplusplayer_es_packet` | 48 bytes, align 8 | 48 bytes, align 8 |

The field offsets are identical:
- Audio: codec_data 0, codec_data_length 4, mime_type 8, bitrate 12, channels 16, sample_rate 20.
- Video: codec_data 0, codec_data_length 4, mime_type 8, width 12, height 16, max_width 20, max_height 24, framerate_num 28, framerate_den 32.
- Packet: type 0, buffer 4, buffer_size 8, pts 16, duration 24, matroska_color_info 32, hdr10p_metadata_size 36, hdr10p_metadata 40.

The original `stream.h` and `espacket.h` files produce no textual diff between these two packages. The ARM32 assertions pass for both.

## Public C API differences

The 1.4.6 `esplusplayer_capi.h` is an additive expansion of the 0.0.3 API:
- The core player lifecycle, packet submission, stream-info setters and existing callback registration API remain present.
- The existing seek and playing-time declarations retain their ABI types; parameter identifiers changed from `time_ms` / `ms` to `time` / `cur_time`.
- 1.4.6 adds APIs for latency monitoring, dropped-frame callbacks, decoder buffer-time callbacks, adaptive information, decoded-video-frame access, audio preloading/offload, resource allocation, stream activation/deactivation, audio easing, video rotation/scan type, time-unit selection, and related controls.
- New callback typedefs carry the existing `void *userdata` argument; this does not alter the existing callback typedefs.

## Compatibility-sensitive enum changes

The low-latency enum is not numerically identical:
- 0.0.3 defines `ESPLUSPLAYER_LOW_LATENCY_MODE_SEAMLESS_RESOLUTION_CHANGE = 0x0040`; 1.4.6 removes that enumerator and documents seamless resolution change as supported by the VIDEO mode since Tizen 6.5.
- 0.0.3 defines `ESPLUSPLAYER_LOW_LATENCY_MODE_ENABLE_GAME_MODE = 0x2000`; 1.4.6 defines it as `AUDIO | VIDEO | 0x2000`. Code must not assume the old numeric value.
- 1.4.6 adds `ESPLUSPLAYER_LOW_LATENCY_MODE_ENABLE_GAME_MODE_WITH_FIXED_RESOLUTION`.

Other enums and feature groups have also grown. Code targeting older firmware should use only enum constants and functions confirmed in that firmware's own headers or exported symbols, not copy the newest header wholesale.

## What this proves — and does not prove

This is a direct comparison of the two published source packages. It proves that the three stream/packet structures have the same ARM32 layout and that the modern `set_*` API already exists in the 0.0.3 package.

It does **not** prove that Tizen 5.5 firmware ships the same C API or implementation. The 0.0.3 package is from Tizen 6.5. Samsung's managed ESPlayer API being documented from Tizen 5.5 is not sufficient evidence that the private C API, symbols, enum values or ABI are identical there. Tizen 5.5 remains unverified.

## Reproduction

Workflow: [Check ESPlus ARM32 ABI](https://github.com/fidoboy/moonlight-tizen-ac3/actions/runs/41844107812)

The run uploads the source diff and both ARM32 layout reports as the `esplus-arm32-abi-report` artifact.
