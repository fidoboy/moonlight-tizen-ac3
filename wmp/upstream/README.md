# Upstream WMP engine import

Source: https://github.com/WMP/moonlight-tizen50-core
Imported from upstream `main` at commit `9d7e244f41b0ce90595a5334112d0033fc5db571`.
License: GPL-3.0; see [LICENSE](LICENSE). Original source headers and copyright notices are retained.

## Layout

- `mlclient/`: upstream native engine implementation and its internal/public headers.
- `build/`: upstream Tizen toolchain/dependency acquisition and core-build scripts.

This is an upstream source import, not yet the final WGT-integrated service build. The sources are retained here as the porting base; integration/adaptation belongs under `wmp/`.

## Deliberately not imported

- The upstream .NET/TizenFX host and its UI package: this project uses its existing native Tizen ServiceApp and hybrid WGT.
- The upstream CLI `main.c` and standalone client packaging.
- `esplusplayer_tv50.h`: the upstream ESPlus interface header is not redistributed here because it describes Samsung's proprietary player API. Project-owned adapters use independently verified declarations and do not vendor proprietary headers.
- Samsung TV libraries, SDK binaries, toolchains, and generated dependency artifacts.
- The upstream `third_party/moonlight-tizen` git submodule as a nested submodule; dependency provenance/build handling will be integrated with this repository's own submodule and build layout.

## ESPlus compatibility boundary

The upstream player source currently targets the legacy ADD API. Project-owned
typed adapters live in `../service/src/wmp_esplus_adapter.[ch]` and are
compiled into the engine by `mlclient/build-engine-so.sh`.

The neutral stream contract maps each family into its own native structure.
SET video fields are stride/slice-height/integer-frame-rate/interlaced; ADD
video fields are max-width/max-height/rational-frame-rate. Audio fields are
copied field-by-field. Semantic MIME mapping accounts for the SET video enum
starting at H263=0, and for ADD's DTS=7/OPUS=8 versus SET's OPUS=7/no-DTS
ordering.

SET callbacks carry userdata; ADD callbacks have no userdata and use the
legacy process-global adapter singleton. Both packet layouts are constructed
independently: SET timestamps are milliseconds in the expanded packet, while
ADD timestamps remain nanoseconds in the compact packet. Submit outcomes
0 through 4 are normalized while retaining the raw result.

Stream-registration call results are normalized independently from submit
results. The legacy TV50 ADD header explicitly documents its `int` return as
a C++ bool (`1` success, `0` failure); other values remain unclassified.
The SET implementation returns `0` when the underlying `SetStream`
operation succeeds, `-38` when it reports failure or is unavailable, and
`-22` for null arguments. This contract has been confirmed independently
in the extracted ELF64 x86-64 library and the ARM32 `libesplusplayer.so`
pulled from the Samsung AU7172 running Tizen 6. The adapter classifies
`0` as success, `-22`/`-38` as native failures, and preserves other values
as `UNCLASSIFIED`.

The imported `esplus_player.c`, `video_esplus.c` and `audio_opus.c` have
not yet been migrated to call these adapters; therefore dual-family playback
is not yet integrated. Do not treat inclusion of the adapter objects in the
build script as evidence that the engine selects and uses both families at
runtime.

## Porting constraints

Select exactly one ABI family for a session. Never mix ADD and SET symbols,
callback conventions, stream-info layouts or packet layouts. Display capability
discovery is independent of ABI family detection.

The upstream implementation includes player monitoring/recovery behavior.
Before integrating it, remove any player-side watchdog or inferred session-abort
logic that conflicts with this project's rule that Moonlight Common C owns
session validity and disconnection.

Do not treat this source import or adapter implementation as a successful
build or a validated TV runtime. No compilation or device test is implied.
