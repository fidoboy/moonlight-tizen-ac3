## Highlights

### Added
- **Manual host discovery:** Added a button to rescan the network for hosts from the Hosts screen.
- **Audio FEC statistics:** Added per-interval counts for recovered packets, failed blocks, and out-of-order packets to the performance overlay.

### Changed
- **Initial host selection:** Moonlight now selects the first available host on startup. Arrow-key navigation works normally, and manually rescanning the network does not change the selection.
- **Long-dialog handling:** Made update notes scrollable within the dialog while keeping its title and Close button visible. Also improved spacing in the navigation guide and warning dialogs.
- **Latency graph:** Refined RTT colors and the legend to improve readability on local connections.
- **Identifier generation:** Updated pairing PIN and client identifier generation to use cryptographic randomness.
- **Audio compatibility:** Updated the bundled Opus version to 1.6.1.

### Fixed
- **Navigation after focus loss:** Directional keys now move the selection normally after focus is restored.
- **Latency measurements:** Corrected performance statistics to use video timestamps with the appropriate precision.
- **Connection handling:** Incorporated robustness updates to RTSP and ping messages.
- **Smart Hub previews:** Validated fallback preview filenames to prevent invalid paths.

### Localization
- Added translations for manual host discovery and audio FEC statistics in the available languages.
