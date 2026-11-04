# Direct vendor-header ABI check

The adapter `esplus_native_adapter.h` includes Samsung's original
`esplusplayer_capi/stream.h` and `esplusplayer_capi/espacket.h` from the
official `esplusplayer-1.4.6-0.src.rpm` source package. The workflow downloads
and extracts that package before compiling the adapter for 32-bit ARM.
