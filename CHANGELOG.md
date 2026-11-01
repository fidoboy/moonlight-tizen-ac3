# Changelog

All notable changes to the independently maintained fidoboy Moonlight Tizen fork are recorded here.


## v1.1.0

### Added
- **Configuration summary position:** Added an Interface Settings menu to place the configuration summary bar at the top or bottom of the Hosts and Apps screens, or hide it entirely.

### Changed
- **Main interface background:** Replaced the flat main-interface background with a vertical gradient that darkens towards the bottom while preserving the selected color theme.
- **Bottom configuration summary:** Increased the bar's background opacity to approximately 70% when displayed at the bottom of the screen, improving readability while keeping its contents fully opaque.
- **Default interface settings:** Enabled Video frame pacing and Host address field mode by default.

### Fixed
- **Docker build directory ownership:** Ensured the Moonlight project directory is created with the correct build-user ownership, allowing the build process to access Git metadata and inject the commit SHA reliably.


## v1.0.9

### Added

### Changed
- **Localization and interface descriptions:** Updated and corrected translations across all supported languages for greater consistency and a formal, user-appropriate tone. Added new explanatory descriptions to interface settings, including Connection warnings and Performance statistics.
- **Streaming transition status messages:** Improved the information displayed during stream startup and shutdown, with a persistent title identifying whether an application is starting or resuming and clearer, contextual status messages below the progress bar.

### Fixed
- **Statistics overlay terminology:** Clarified the Dolby audio decoding label in the statistics overlay across all supported translations.
- **Host details status:** Fixed the host details dialog always displaying hosts as online and paired, regardless of their actual `online` and `paired` boolean values.
- **Gamepad navigation sounds:** Fixed an issue that could prevent navigation sounds from playing under certain conditions when navigating with a gamepad.

## v1.0.8 — Dolby audio and interface improvements

### Added
- **Dolby speaker layout:** Added a dedicated setting to select the 5.1 speaker configuration used for Dolby Digital audio, with Side Surround and Rear Surround options.
- **Dolby decoding mode:** Added a setting to select between Hardware, Automatic and Software decoding modes for Dolby Digital audio.
- **Interface backgrounds:** Added three optional background styles and interface customization options.
- **Interface color themes:** Added selectable application color themes, configurable from the settings menu.
- **Interface sound effects:** Added optional audio feedback for navigation and interface events, which can be enabled or disabled in settings.
- **Settings navigation:** Improved navigation and focus handling throughout the settings interface, including the layout and behavior of selection menus.
- **Streaming statistics:** Added decoder mode and connection encryption status to the statistics overlay.
- **Connection encryption status:** Added information about the connection's encryption status to the host negotiation screen before a new stream starts.

### Changed
- **Streaming transitions:** Refined the visual behavior of stream transitions and the return to the main interface.
- **Moonlight components:** Updated upstream components and dependencies, including Opus to version 1.6.1, while preserving the Tizen-specific adaptations required by this fork.
- **Circular list navigation:** Changed navigation in the host and application lists to wrap around, returning to the first item when moving past the last one.

### Fixed
- **HDR codec switching:** Fixed HDR setting state handling when switching between H.264 and HDR-compatible codecs (HEVC and AV1), ensuring the setting is disabled for H.264 and re-enabled for supported codecs.
- **Settings panel scrolling:** Fixed settings navigation so that scrolling through the options no longer moves the entire screen, keeping the left section navigation stationary while the right settings panel scrolls independently. Also improved focused-item visibility to prevent elements from being obscured at the bottom edge of the screen.

## v1.0.7 — Navigation and streaming transition improvements

### Added
- **Animated transition background:** Added an animated starfield background during stream transitions, with an option in the app's interface settings to enable or disable this feature.
- **Navigation feedback:** Added contextual snackbar notifications when loading hosts and applications takes longer than expected.
- **Vibeshine compatibility:** Verified compatibility with Vibeshine using the [2.0.2 nightly build](https://github.com/Nonary/vibeshine/releases/tag/2.0.2-nightly.d20261025.ddf42cfa263d).

### Changed
- **Host and application navigation:** Refined transitions between the Hosts and Apps screens, with smoother animations and improved loading feedback.
- **Stream transition presentation:** Improved the timing and visibility of transition animations and status messages during stream startup and shutdown.
- **Startup experience:** Refined host discovery and loading behavior to provide clearer feedback while the host list is being restored.

### Fixed
- **Stream video visibility:** Fixed the transition-screen behavior that could prevent the remote video from appearing correctly when a stream started.
- **Emscripten string handling:** Fixed a potential heap corruption issue when reading C++ strings through Embind, based on a patch by [**mmadej20**](https://github.com/mmadej20).
- **Transition cleanup:** Improved the handling of transition backgrounds and status messages when entering or leaving a streaming session.
- **Navigation recovery:** Improved the handling of loading and stream-exit errors to help prevent the interface from becoming stuck in an inconsistent state.

### Localization
- Updated translations for the revised navigation feedback and stream transition status messages across the supported languages.

## v1.0.6 — Dialog display fix

### Fixed
- **Long-dialog handling:** Fixed the display of update dialogs when release notes exceed the available height, keeping the dialog within the viewport and allowing the text to scroll.

## v1.0.5 — Navigation and diagnostics improvements

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

## v1.0.4 — Interface improvements and animated launch screen

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

## v1.0.3 — Smart Hub integration and interface improvements

### Added
- **Direct app launching from Samsung Smart Hub:** Added support for launching games and applications directly from their Smart Hub shortcuts. Moonlight connects to the selected host and starts the requested application without loading the full interface, restoring the host grid, or navigating through the usual host and app screens. This significantly reduces startup time compared with the previous launch flow.
- **Configuration summary:** Added a compact summary to the Hosts and Apps screens showing the current resolution, frame rate, bitrate, optimal bitrate, HDR status, video codec, Dolby audio setting, audio channel configuration, and Game Mode status.
- **Direct-launch status feedback:** Added lightweight status messages during direct launches, including host and application information where available.

### Changed
- **Unchanged standard startup:** Launching Moonlight from its own Smart Hub application icon retains the normal startup flow. Direct launching applies only when opening a game or application through its Smart Hub shortcut.
- **Back/Return navigation:** Pressing the Back/Return key during streaming now opens or closes the Stream Menu. Navigation behavior outside streaming remains unchanged.
- **Session-local statistics visibility:** Showing or hiding the performance-statistics overlay no longer modifies or saves the persistent setting. The saved preference continues to determine the default visibility for new streaming sessions.
- **Build identification:** Added a visual marker for non-official builds in the system information panel, while official stable releases retain a clean version display.

### Fixed
- **Stream Menu highlighting:** Fixed an issue that could leave an additional menu item highlighted when navigating with the remote control.
- **Direct-launch error handling:** Improved handling of unavailable hosts, saved-configuration errors, connection failures, and application launch or resume failures.
- **Direct-launch session termination:** Ensured Moonlight exits cleanly when a direct-launch streaming session ends, rather than returning to the regular host and app screens. The optional setting to quit the host application on normal disconnection is still honored.
- **Status overlay behavior:** Refined direct-launch status messages so they do not obscure the video and are hidden when the connection or video becomes available.

### Localization
- Updated English, Spanish, and Brazilian Portuguese translations for the configuration summary and the revised navigation guide.

## v1.0.2 — Stream controls, gamepad identity and pairing fixes

### Added
- Added the Stream Menu, opened with the remote's Play/Pause key while streaming, with host keyboard shortcuts, performance-statistics toggle and disconnect controls.
- Added gamepad controller-family reporting and preserved physical controller indices to improve host-side controller profile selection.
- Added an About setting to disable automatic update checks at startup; checks remain enabled by default and can still be initiated manually.

### Fixed
- Fixed pairing requests being canceled by unrelated HTTP request timeouts and corrected host-polling lifecycle during pairing and cancellation.
- Improved handling of Play, Pause and Play/Pause media keys while streaming.
- Refined the update-check switch styling and navigation, shortened the Spanish Stream Menu statistics label, and localized the new menu options.
- Removed the obsolete warning from the surround-audio channel settings.

### Credits
- **Diogo8500** — [Stream Menu (PR #177)](https://github.com/brightcraft/moonlight-tizen/pull/177), [pairing cancellation fix (PR #179)](https://github.com/brightcraft/moonlight-tizen/pull/179) and [host polling fix (PR #180)](https://github.com/brightcraft/moonlight-tizen/pull/180), related to [issue #176](https://github.com/brightcraft/moonlight-tizen/issues/176).
- **principalwater** — gamepad identity and physical-index handling, based on [PR #171](https://github.com/brightcraft/moonlight-tizen/pull/171) and [issue #172](https://github.com/brightcraft/moonlight-tizen/issues/172).
- **eduardomozart** — media-key handling for Play, Pause and Play/Pause ([commit `833becf`](https://github.com/brightcraft/moonlight-tizen/commit/833becf3408b9a7aeeea0d18d2126bf2ce522387)).

## v1.0.0 — First independent release

### Added
- Optional AC-3 (Dolby Digital) and E-AC-3 (Dolby Digital Plus) passthrough for compatible Samsung TV optical-audio setups.
- Explicit optional codec negotiation with the matching experimental Sunshine implementation, with OPUS fallback for hosts that do not select a Dolby format.
- Audio statistics for negotiated codec, channel layout, channel count and approximate receive bitrate.
- Spanish localization (`es-ES`).
- Optional request to quit the host application after normal disconnection.
- Animated native Tizen launch screen and startup behavior refinements.
- Settings navigation, disabled-state and input handling refinements.
- Initial independent release/versioning series, starting at 1.0.0.

## Inherited base-client history

The entries below document the historical [Brightcraft](https://github.com/brightcraft/moonlight-tizen) base-client releases from which this fork was created. Their version numbers belong to that base project and are not releases in the independent fidoboy version series.

### Base client v1.18.0

### Added
- Added automatic selection of the last opened host and app when navigating between views
- Introduced a new 'Decrypt host audio' setting intended for Wolf and Punktfunk-style hosts
- Added a 'Disabled' option to the 'Audio backend' setting to disable audio output from the TV

### Changed
- Improved video frame pacing efficiency by reducing CPU usage when frame pacing is enabled

### Removed
- Removed the always-zero network jitter frame drop statistic from the performance stats

### Fixed
- Fixed dialogs stretching to the full screen height instead of sizing to their content
- Fixed incorrect bitrate calculations in the performance stats when enabled mid-stream
- Fixed Docker image tagging in release workflows for forks with uppercase repository names
- Fixed a startup crash when checking for cached app updates with an invalid or missing version

### Base client v1.17.2

### Added
- Added ForceGM variant detection to the System Info panel for easier identification

### Changed
- Improved build metadata injection in the Dockerfile for development and release builds
- Prevented paired hosts from falling back to unauthenticated HTTP when refreshing server metadata

### Fixed
- Fixed a security vulnerability that allowed untrusted host metadata to be executed within the application

### Base client v1.17.1

### Added
- Reintroduced i18n workflow to synchronize locale files from the source of truth

### Changed
- Extended the Game Mode restrictions to newer platform versions (Tizen 9.0+)
- Refactored the 'Update Moonlight' dialog to use static HTML for cleaner code structure

### Fixed
- Fixed EMSS pipeline cleanup when connections terminate unexpectedly
- Fixed last frame number not resetting on new streams to prevent stats underflow
- Fixed decoding time statistic displaying incorrect values due to integer underflow
- Fixed the 'Update App' button notification not being restored after restarting the app
- Fixed the 'Update App' button not being displayed after manually checking for updates
- Fixed an issue where rapid or multiple clicks on a host could trigger concurrent executions

### Base client v1.17.0

### Added
- Added an intermediate hamburger menu highlight when navigating up from a host card
- Added automatic Wake-on-LAN support to wake offline hosts with a per-host toggle
- Added host availability polling to the wake-up process to detect when the host becomes reachable
- Added a warning when Wake-on-LAN is used with hosts configured with randomized MAC addresses

### Changed
- Improved the manual Wake PC action with an interactive wake-up dialog and visual feedback
- Handled enabling/disabling of 'Wake PC' and 'Refresh Apps' options based on the host's online status

### Fixed
- Fixed default Sunshine box art remaining cached after custom app box art was added
- Fixed localhost addresses being used as connection candidates causing failed connections
- Fixed zero MAC addresses being stored for unpaired hosts causing invalid Wake-on-LAN requests
- Fixed Wake-on-LAN failing to send magic packets in some cases due to a socket initialization error

### Base client v1.16.1

### Added
- Improved host polling and subnet scanning reliability and performance
- Improved Smart Hub deep link handling during host discovery at app startup
- Improved translation extraction and synchronization for more reliable string handling
- Prevented i18n initialization from delaying the initial loading screen at app launch

### Fixed
- Fixed an unnecessary database write for the language preference on startup
- Fixed corrupted PNG box art affecting the Apps list and Smart Hub Previews
- Fixed experimental badges disappearing from settings labels after translation
- Fixed UI freezes and hosts incorrectly appearing offline due to network timeouts
- Fixed…