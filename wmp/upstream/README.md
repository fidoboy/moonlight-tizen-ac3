# Native WMP engine

This directory contains the native streaming engine used by the experimental WMP/ESPlusPlayer playback path in Moonlight Tizen.

The engine is built as `libmlengine.so`. It links the native ARM build of Moonlight Common C with the project’s native client and renderer code. Moonlight Common C and ESPlusPlayer therefore run in the same native process: compressed video and audio data is delivered through the native renderer callbacks directly to ESPlusPlayer. The auxiliary .NET service hosts the engine and handles control/status messages; MessagePort is not used to transport media payloads.

## Layout

- `mlclient/`: native engine entry points, Moonlight Common C integration, ESPlusPlayer lifecycle and packet submission, audio/video renderer callbacks, discovery/pairing, and native input handling.
- `build/`: Tizen toolchain and dependency setup, native Moonlight Common C build, and `libmlengine.so` build scripts.

The native engine is a separate build target from the WASM client. Both targets are built from the repository’s Moonlight Common C source submodule; they are separate binaries/configurations, not separate Common C source trees.

## ESPlus compatibility layer

Project-owned typed adapters live in `../service/src/wmp_esplus_adapter.[ch]` and are compiled into the engine by `mlclient/build-engine-so.sh`. The player and renderer sources use this neutral interface rather than including a Samsung proprietary player header.

The neutral stream contract maps each ABI family into its own native structure:

- SET video fields are stride/slice-height/integer-frame-rate/interlaced.
- ADD video fields are max-width/max-height/rational-frame-rate.
- Audio fields are copied field-by-field.
- Semantic MIME mapping accounts for the SET video enum starting at H263=0, and for ADD's DTS=7/OPUS=8 versus SET's OPUS=7/no-DTS ordering.

SET callbacks carry userdata; ADD callbacks have no userdata and use the legacy process-global adapter singleton. Both packet layouts are constructed independently: SET timestamps are milliseconds in the expanded packet, while ADD timestamps remain nanoseconds in the compact packet. Submit outcomes 0 through 4 are normalized while retaining the raw result.

Stream-registration call results are normalized independently from submit results. The ADD TV50 interface documents its `int` return as a C++ bool (`1` success, `0` failure); other values remain unclassified. The SET implementation returns `0` when the underlying `SetStream` operation succeeds, `-38` when it reports failure or is unavailable, and `-22` for null arguments. This contract has been confirmed independently in the extracted ELF64 x86-64 library and the ARM32 `libesplusplayer.so` from a Samsung AU7172 running Tizen 6. The adapter classifies `0` as success, `-22`/`-38` as native failures, and preserves other values as `UNCLASSIFIED`.

The player, video renderer and audio renderer use the neutral contract for player creation, callback binding, open/prepare/start/stop/close, Ecore display configuration, stream registration and packet submission. The proprietary player header is not included or copied by the engine build script.

The SET lifecycle/display return convention (zero success, -22/-38 native failure) is confirmed in the target TV's ARM32 disassembly. The ADD playing-time query remains optional and ADD-only: its SET return contract has not been independently verified. Depth sampling/nudge metrics are therefore not enabled for SET. The display-mode call is optional; the Ecore overlay attachment is required for the video path.

## Runtime constraints

Select exactly one ABI family for a session. Never mix ADD and SET symbols, callback conventions, stream-info layouts or packet layouts. Display capability discovery is independent of ABI family detection.

The player-side stall watchdog and autonomous seek/IDR recovery are not used. Player error/resource callbacks are observational only; Moonlight Common C remains authoritative for session validity and disconnection.

A source change or adapter implementation does not by itself imply a successful build or validated TV runtime. Build and device-test status must be established separately.
