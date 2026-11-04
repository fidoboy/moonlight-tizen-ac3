# Moonlight ESPlus preliminary probe

Standalone Tizen TV **.NET TPK** for inventorying the exports of the firmware's
`libesplusplayer.so`, comparing the legacy `add_*_stream_info` names with the
later `set_*_stream_info` names, and checking read-only access to candidate
audio/video/input device nodes.

This package is diagnostic only. It does not contain Samsung libraries, does not
initialize the player, does not start a stream, and does not change the Moonlight
WGT or its EMSS audio/video path.

## Build

Requirements:

- Tizen Studio CLI (Web CLI is sufficient for TPK packaging).
- .NET SDK 8.
- Java 11 or newer.
- A Tizen signing profile.

Copy the existing project icon into the probe directory and build:

```sh
cp res/icon.png tools/esplus-probe/icon.png
dotnet build tools/esplus-probe/MoonlightEsplusProbe.csproj \
  --configuration Release \
  -p:TizenManifestFile="$PWD/tools/esplus-probe/tizen-manifest.xml"
```

The Tizen .NET SDK produces the signed `.tpk` under
`tools/esplus-probe/bin/Release`. Use a development certificate; Apps2Samsung
must re-sign the package for the target TV as usual.

## Install and run

1. Install the TPK on the TV with Apps2Samsung.
2. Start the package once using the Tizen CLI (Developer Mode / SDB connection):

   ```sh
   tizen run -p org.fidoboy.moonlight.esplusprobe.app
   ```

   The application opens a simple NUI screen confirming that it started. The
   diagnostic checks run on a background worker so native library loading or
   device enumeration cannot block the UI lifecycle. The results are written
   to the `MLPROBE` log.
3. Capture the native log:

   ```sh
   sdb dlogutil -d | grep MLPROBE
   ```

   Stop the command after the line `[MLPROBE] === PROBE COMPLETE ===`.

## Interpreting the result

- `LIBRARY_LOAD_FAILED`: the library is absent, inaccessible, or one of its
  required dynamic dependencies cannot be resolved. The accompanying
  `dlerror` text distinguishes many of these cases.
- `SYMBOL SUMMARY`: total candidate exports found; the inventory includes
  common lifecycle functions, both stream-configuration naming families,
  display functions, callbacks and optional controls.
- `CORE SYMBOLS`: whether the baseline lifecycle/packet/display names were
  found. This is not proof that their signatures or behavior match.
- `LEGACY add_* STREAM API` / `LATER set_* STREAM API`: whether both, one,
  or neither stream-configuration symbol was exported for that naming family.
- `ABI HINT`: a preliminary classification based only on exported names.
  It is deliberately not an ABI certification. Structures, alignment, calling
  conventions, callback signatures, return values and timestamp units remain
  unverified until compared with the matching headers/binary or exercised in
  a separate controlled test.
- `DEVICE OPEN OK` / `DEVICE OPEN FAILED`: reports read-only, non-blocking
  access to the device nodes found by the probe. It does not change permissions
  or attempt to initialize a device.

The probe deliberately does **not** call `esplusplayer_create()`,
`esplusplayer_open()`, callbacks, or any playback function. It only loads the
library and resolves symbol addresses. A missing `add_*` name does not mean the
library is unusable: the `set_*` family is inventoried as an alternative, and
vice versa. The next stage must validate the matching ABI declarations before
any function pointer is invoked.
