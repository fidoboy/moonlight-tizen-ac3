# FFmpeg source and Moonlight integration

This directory contains the unmodified upstream FFmpeg 4.4.8 source. The
source is pinned to the signed upstream `n4.4.8` release tag at commit
`209fceb8783e7996d04f35503d62fae0c42f2575`.

Moonlight's WebAssembly build uses Samsung's Emscripten SDK and enables only
the AC-3 and E-AC-3 decoders plus the core libraries required by the decoder
and PCM conversion path:

- `libavcodec`
- `libavutil`
- `libswresample`

No FFmpeg command-line tools, demuxers, muxers, network protocols, filters,
video codecs, or encoders are included.

The build script compiles a clean working copy under `build/source/` so the
vendored upstream source remains unchanged. Installed static libraries and
headers are written to `install/`. Both generated directories are ignored
by Git.

See the upstream license files in this directory and
https://ffmpeg.org/legal.html. Because Moonlight statically links LGPL
libraries into WebAssembly, distribution must preserve the LGPL rights to
replace/relink the library and provide the corresponding source and
relinkable build materials.
