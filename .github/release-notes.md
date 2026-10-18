## Highlights

### Added
- **Host removal confirmation:** Added a confirmation warning before removing a host to help prevent accidental deletions.
- **Configurable configuration summary:** Added a persistent Interface Settings option to show or hide the configuration summary bar on the Hosts and Apps screens.
- **Live connection statistics:** Added connection-quality and host-latency graphs to the performance statistics overlay, along with a setting to customize its position on screen.
- **Enhanced native launch screen:** Added an animated starfield with perspective trails and progressive deceleration, the Dolby Double-D logo, and synchronized audio to the native startup animation.
- **Portrait launch screen support:** Added orientation-specific launch-screen assets for landscape and portrait layouts.

### Changed
- **Launch-screen transitions:** Refined the handoff between the native launch screen and the web interface to improve startup timing and prevent the wrong interface from appearing briefly during direct Smart Hub launches.
- **Configuration summary presentation:** Added dedicated icons for resolution, frame rate, bitrate, optimal bitrate, HDR, video codec, audio and gamepad information. Improved spacing, alignment, and resolution labels.
- **Performance statistics overlay:** Improved readability and layout, increased background opacity, refined graph spacing and scaling, and added more padding around the overlay content.
- **Streaming controls:** Improved media-key handling and the behavior of the Stream Menu when streaming is launched directly from a Smart Hub game or application shortcut.

### Fixed
- **Stream Menu on direct launches:** Fixed an issue that prevented Play/Pause or Back/Return from opening the Stream Menu during streams started through the direct PAYLOAD launch path.
- **Premature Stream Menu access:** Prevented the Stream Menu from opening while the connection status message is still displayed and before video is available.
- **Stream disconnection handling:** Improved the dismissal of the performance overlay during disconnection and application exit, preventing it from remaining visible over the closing screen.
- **Host application exit:** Hid the configuration summary bar while the host application is being closed and restored it when the operation finishes, including error paths.
- **Stream setup failures:** Fixed a potential hang when video stream initialization fails.

### Localization
- Added German (`de-DE`), French (`fr-FR`), Italian (`it-IT`), and Russian (`ru-RU`) translations.
- Updated English, Spanish, and Brazilian Portuguese translations for the new settings, host-removal warning, performance statistics, and interface changes.
