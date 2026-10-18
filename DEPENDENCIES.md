# Third-party dependencies

This project vendors the source code of several third-party libraries directly in the repository. They are **not active root-level Git submodules**, so upstream changes are not pulled into this repository automatically. The scheduled checker described below reports newer upstream commits; it never changes the source or builds WGT packages.

## Vendored libraries

| Component | Upstream source | Version / source reference | Local notes |
|---|---|---|---|
| `moonlight-common-c` | [moonlight-stream/moonlight-common-c](https://github.com/moonlight-stream/moonlight-common-c) | Best identifiable upstream baseline: [`8599b604`](https://github.com/moonlight-stream/moonlight-common-c/commit/8599b6042a4ba27749b0f94134dd614b4328a9bc), 11 June 2024. The project imported/updated this source tree on 18 July 2024. | Contains project-specific Tizen and Dolby audio changes. In particular, review `src/AudioStream.c`, `src/RtspConnection.c` and the Limelight API headers carefully when importing upstream changes. The baseline is a reference point, not a claim that every local file is byte-for-byte identical. |
| `opus` | [xiph/opus](https://github.com/xiph/opus) | Opus **1.5.2**, commit [`ddbe4838`](https://github.com/xiph/opus/commit/ddbe48383984d56acd9e1ab6a090c54ca6b735a6). | The repository history records the update to 1.5.2 on 30 January 2025. Core files checked against that release match the vendored snapshot. Do not upgrade without testing decoding, latency and audio compatibility on Tizen. |
| `h264bitstream` | [aizvorski/h264bitstream](https://github.com/aizvorski/h264bitstream) | Upstream reference: [`70124d30`](https://github.com/aizvorski/h264bitstream/commit/70124d3051ba45e6b326264f0b25e6f48a7479e7), 20 June 2024. | The local copy has project-maintained changes, including the [January 2026 memory-management fix](https://github.com/fidoboy/moonlight-tizen-ac3/commit/4b631afbd8d5627e4055361f342bcc701dcfdaec). The checker tracks subsequent upstream commits, not exact source equality. |
| `libgamestream` | [moonlight-stream/moonlight-embedded](https://github.com/moonlight-stream/moonlight-embedded) | Monitoring reference: [`274d3db3`](https://github.com/moonlight-stream/moonlight-embedded/commit/274d3db34da764344a7a402ee74e6080350ac0cd), a known upstream change to `libgamestream/http.c` from 25 March 2024. | This is a partial vendored snapshot with local Tizen/IPv6/HTTP changes; its precise upstream base commit cannot be established confidently from the current tree. The monitoring reference is deliberately documented as such. |
| ENet (inside `moonlight-common-c/enet`) | Tracked as part of the [Moonlight Common C source tree](https://github.com/moonlight-stream/moonlight-common-c) | Bundled source snapshot; no separate root-level submodule or independently verified pin. | Review the ENet submodule reference and compatibility notes when assessing Moonlight Common C updates. Do not replace it with an arbitrary system ENet version. |

## Bundled compatibility headers

The `ports/include` directory contains header snapshots used by the Emscripten/Tizen build rather than ordinary independently managed library checkouts. Their embedded version identifiers currently indicate:

- cURL headers: **7.44.0** (`ports/include/curl/curlver.h`)
- OpenSSL headers: **1.0.2d** (`ports/include/openssl/opensslv.h`)
- zlib headers: **1.2.8** (`ports/include/zlib.h`)

These are legacy compatibility headers. Review them together with the Samsung Emscripten SDK and its port/toolchain requirements rather than updating them independently to the latest upstream headers.

## Upstream update monitoring

[`.github/dependency-baselines.json`](.github/dependency-baselines.json) records the upstream repositories, branches and reference commits used by the weekly checker.

[`.github/workflows/check-upstream-dependencies.yml`](.github/workflows/check-upstream-dependencies.yml) runs weekly and can also be started manually. When it detects commits newer than a recorded reference, it creates or updates a single GitHub issue titled **Upstream dependency updates available**, with comparison links for review.

The monitor is intentionally **notification-only**: it does not pull upstream files, alter dependency code, run the WGT build, or assume that every upstream change should be imported. After reviewing and integrating a dependency update, maintainers should update that dependency's recorded baseline deliberately.
