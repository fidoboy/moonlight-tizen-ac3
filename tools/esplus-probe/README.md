# Moonlight ESPlus preliminary probe

Standalone Tizen TV **.NET TPK** for checking whether the TV firmware exposes
`libesplusplayer.so`, whether its expected exports are present, and whether the
sandbox can open candidate video/audio/input device nodes.

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
- `LIBRARY_LOADED_SYMBOLS_OK`: the library loads and all ten expected entry
  points are exported. This confirms symbol-level compatibility only; it does
  not yet prove that the function signatures or player lifecycle work.
- `LIBRARY_LOADED_SYMBOLS_INCOMPLETE`: the library loads, but one or more
  expected exports are missing.
- `DEVICE OPEN OK` / `DEVICE OPEN FAILED`: reports read-only, non-blocking
  access to the device nodes found by the probe. It does not change permissions
  or attempt to initialize a device.

The probe deliberately does **not** call `esplusplayer_create()`,
`esplusplayer_open()`, or any playback function. If this stage succeeds, the
next test will exercise create/open/close in a separate controlled build.
