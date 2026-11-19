# FFmpeg 9.0.2 — Moonlight WebAssembly integration

This experimental branch pins the FFmpeg source to the official upstream
release tag `n9.0.2`, commit
`946fcce07b6dcd0331c8cc609192aeff5e1924f8`.

The FFmpeg source is checked out as a Git submodule at `ffmpeg/`.
The build uses Samsung's preinstalled Emscripten SDK and enables only the
codecs and libraries required by Moonlight's audio paths:

- Opus decoder
- AC-3 and E-AC-3 decoders
- AC-3 and E-AC-3 encoders
- `libavcodec`, `libavutil`, and `libswresample`

No FFmpeg command-line tools, demuxers, muxers, network protocols, filters,
video codecs, or devices are built.

The build script copies the upstream source to `ffmpeg-build/source/`,
leaving the submodule clean. Installed static libraries and headers are
placed in `ffmpeg-install/`. The install directory contains a version
marker so artifacts from FFmpeg 4.4.8 cannot be reused accidentally.

The GitHub Actions cache is independently namespaced for FFmpeg 9.0.2.
