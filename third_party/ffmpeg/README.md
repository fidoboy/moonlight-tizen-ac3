# FFmpeg integration

This project builds FFmpeg 4.4.8 with the Samsung Emscripten SDK installed by both `Dockerfile` and
`Dockerfile.webapp`. The build is deliberately restricted to the native AC-3
and E-AC-3 decoders, their AC-3 parser, and the core libraries needed by the
decoder and PCM conversion path.

The resulting static libraries are:

- `libavcodec`
- `libswresample`
- `libavutil`

No FFmpeg command-line tools, demuxers, muxers, network protocols, filters,
video codecs, or encoders are included.

The source archive is downloaded from the official FFmpeg release URL by
`scripts/build-ffmpeg.sh`. This project does not patch the upstream source.

See [FFmpeg's license information](https://ffmpeg.org/legal.html). Because
Moonlight statically links the LGPL libraries into WebAssembly, distribution
must also preserve the LGPL rights to replace/relink the library; the release
process must make the corresponding source and relinkable build materials
available alongside distributed binaries.
