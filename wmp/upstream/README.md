# Upstream WMP engine import

Source: https://github.com/WMP/moonlight-tizen50-core
Imported from upstream `main` at commit `9d7e244f41b0ce90595a5334112d0033fc5db571`.
License: GPL-3.0; see [LICENSE](LICENSE). Original source headers and copyright notices are retained.

## Layout

- `mlclient/`: upstream native engine implementation and its internal/public headers.
- `build/`: upstream Tizen toolchain/dependency acquisition and core-build scripts.

This is an upstream source import, not yet the final WGT-integrated service build. The sources are retained here as the porting base; integration/adaptation belongs under `wmp/service/`.

## Deliberately not imported

- The upstream .NET/TizenFX host and its UI package: this project uses its existing native Tizen ServiceApp and hybrid WGT.
- The upstream CLI `main.c` and standalone client packaging.
- `esplusplayer_tv50.h`: the upstream ESPlus interface header is not redistributed here because it describes Samsung's proprietary player API. The project-specific ABI adapters must use only independently verified declarations and must not vendor proprietary headers.
- Samsung TV libraries, SDK binaries, toolchains, and generated dependency artifacts.
- The upstream `third_party/moonlight-tizen` git submodule as a nested submodule; dependency provenance/build handling will be integrated with this repository's own submodule and build layout.

## Porting constraints

The upstream player implementation currently targets the legacy `add_*` ESPlus API. The project also needs the distinct `set_*` API generation. Keep those adapters separate and select exactly one family for a session. Do not mix symbols or structure layouts between generations.

The upstream implementation includes player monitoring/recovery behavior. Before integrating it, remove any player-side watchdog or inferred session-abort logic that conflicts with this project's rule that Moonlight Common C owns session validity and disconnection.

Do not treat this source import as a successful build or a validated TV runtime. No compilation or device test is implied by this import.
