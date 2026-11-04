# Samsung ESPlus CAPI header provenance

The ABI workflow downloads the official Tizen Unified source package:
`esplusplayer-1.4.6-0.src.rpm`

Source repository:
https://download.tizen.org/snapshots/TIZEN/Tizen/Tizen-Unified/latest/repos/standard/source/

The source archive contains the public headers under
`include/esplusplayer_capi/`. The workflow compiles the repository adapter
against those original headers for the ARM32 layout comparison. Vendor source
is kept as a short-lived Actions artifact rather than copied into this tree.
