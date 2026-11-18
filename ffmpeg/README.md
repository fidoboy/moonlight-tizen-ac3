# FFmpeg integration

The WebAssembly build compiles FFmpeg 4.4.8 locally with the Samsung
Emscripten SDK. The build is deliberately restricted to the native AC-3
and E-AC-3 decoders and the core libraries needed by the decoder and PCM
conversion path.

The resulting static libraries are:

- `libavcodec`
- `libswresample`
- `libavutil`

No FFmpeg command-line tools, demuxers, muxers, network protocols, filters,
video codecs, or encoders are included.

The source archive is downloaded from the official FFmpeg release URL by
`scripts/build-ffmpeg.sh`. Build sources and installed artifacts are kept
under this directory (`build/` and `install/`) and are ignored by Git.
The upstream source is not patched.

See [FFmpeg's license information](https://ffmpeg.org/legal.html). Because
Moonlight statically links the LGPL libraries into WebAssembly, distribution
must also preserve the LGPL rights to replace/relink the library; the release
process must make the corresponding source and relinkable build materials
available alongside distributed binaries.
