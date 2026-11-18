# Moonlight FFmpeg integration

This directory vendors the unmodified upstream FFmpeg 4.4.8 source
from the signed `n4.4.8` release tag
(upstream commit `209fceb8783e7996d04f35503d62fae0c42f2575`).

The WebAssembly build uses Samsung's Emscripten SDK and enables only
the AC-3 and E-AC-3 decoders plus the core libraries required by the
decoder and PCM conversion path: `libavcodec`, `libavutil`, and
`libswresample`.

Build work files are generated under `build/`; installed static
libraries and headers are generated under `install/`. Both paths
are ignored by Git. No FFmpeg command-line tools, demuxers, muxers,
network protocols, filters, video codecs, or encoders are included.

The upstream source is not patched. See FFmpeg's license files in
this directory and https://ffmpeg.org/legal.html. Because Moonlight
statically links LGPL libraries into WebAssembly, distribution must
preserve the LGPL rights to replace/relink the library and provide
the corresponding source and relinkable build materials.
