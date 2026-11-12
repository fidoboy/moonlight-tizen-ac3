# Changelog

All notable changes to the independently maintained fidoboy Moonlight Tizen fork are recorded here.


## v1.2.4

### Added
- **Xbox Share button support:** Added support for the Share button on Xbox controllers. On the tested hardware running Tizen 6, Chromium M76 does not expose this button through the Gamepad API, so input from Share cannot currently be detected. Compatibility with newer browser-engine versions remains unverified. The button mapping is nevertheless implemented in Moonlight so it can be used by the app or forwarded to the host if a future Tizen version exposes the input.
- **Streaming menu activation:** Added a setting to invoke the streaming menu by holding the Select button, allowing users to choose this gamepad shortcut.
- **Gamepad test dialog dismissal:** Added the option to close the controller test dialog by holding the B button for more than one second. The Back button on the TV remote remains available to close the dialog.

### Changed
- **Performance statistics overlay:** Adjusted the overlay presentation to make it more compact, consolidating the frame-rate metrics into a single line and separating the additional metrics with a subtle divider.
- **Settings section navigation:** Kept the right-hand pane and its controls visible while navigating between settings sections, dimming the pane during the transition instead of hiding it.

### Fixed
- **Streaming startup with audio disabled:** Fixed an issue that prevented the host from starting a stream when audio was disabled in Moonlight settings.
- **Settings page navigation and control visibility:** Fixed navigation issues that could leave controls at the bottom of the Moonlight settings page hidden or inaccessible.


## v1.2.3

### Changed
- **Interface localization:** Improved interface translations in several languages.
- **Background host services:** Improved the lifecycle and coordination of background services that query and maintain host status. Host polling now remains active across the Hosts, Apps and Settings views, pauses during streaming, and resumes appropriately afterward. Manual network discovery and Auto WOL recovery run independently without interrupting known-host polling; discovery excludes known hosts, while Auto WOL only updates the registered host whose server identity matches the target.

### Fixed
- **Streaming menu input isolation:** Fixed an issue where gamepad events continued to be forwarded to the host while the streaming menu was visible. The menu now takes ownership of input while open, preventing gamepad, keyboard and mouse events from reaching the remote session; normal remote input is restored when the menu closes.
- **Stale host connectivity after startup:** Reset persisted runtime connectivity and polling state when restoring saved hosts, ensuring their online status is verified against the network before they can be selected. This prevents hosts that were online in a previous session but are now offline from appearing available and failing later during application-list retrieval.

## v1.2.2

### Added
- **Additional streaming keyboard shortcuts:** Added support for sending `CTRL + SHIFT + ESC` and `WIN + D` to the host from the streaming menu.

### Changed
- **Streaming menu layout and navigation:** Organized the menu actions into visually distinct groups and placed the keyboard shortcuts in a compact two-column layout.

## v1.2.1

### Fixed

- **Premature stream disconnection:** Removed the first-frame startup watchdog that could terminate an established streaming session when the HTML video element's `playing` event was not received within the fixed time limit, even if video was already being displayed. The connection watchdog remains in place to detect failures before the host establishes the streaming connection.


## v1.2.0

### Added
- **Idle screensaver:** Added an optional screensaver, enabled by default, that appears after 60 seconds of inactivity on the main interface. It displays the Moonlight logo and name on a black background, periodically moves to a random position, and disappears immediately when user input is detected. It is not activated during streaming, transitions, or direct launches from the Smart Hub.
- **Gamepad testing tool:** Added an interactive controller test dialog, available while a gamepad is connected. It provides controller-specific diagrams for Xbox, PlayStation and Nintendo Switch Pro controllers, highlighting button and D-pad input, trigger activation, and analog stick movement in real time.
- **Network diagnostics:** Added a diagnostic test of the connection between the TV and the host, measuring data-transfer throughput and response latency across test passes and evaluating connection stability.
- **Optional startup host discovery:** Added a setting to skip automatic network discovery of new hosts at startup when hosts are already configured. Saved hosts are still checked in the background, and new hosts can always be found manually. Automatic discovery is always enabled when no hosts are saved.
- **HEVC HDR metadata fallback:** Supplements HEVC Main10 streams with missing static HDR10 mastering-display (MDCV) and content-light-level (CLL) SEI messages using metadata supplied by the host through the Sunshine protocol, when available. Existing in-band metadata is preserved.
- **Most-used app prioritization:** Added an optional per-host setting that sorts applications by launch count, placing the most frequently launched apps first. Apps with equal counts retain the configured alphabetical order, and the setting is disabled by default.

### Changed
- **Debug log privacy and verbosity:** Sensitive information is redacted from debug logs, including network addresses, host names, pairing PINs, tokens, certificates, private keys and other sensitive identifiers. Standard stable-release packages produce less verbose logs to reduce unnecessary output; detailed logging is enabled only in builds compiled with **debug mode**. Debug logging can be controlled through build-time configuration.
- **Gamepad connection notifications:** Display the connected gamepad's name instead of its numeric index. Technical metadata appended in parentheses is omitted; the index remains the fallback when no usable name is available.
- **UI and navigation refinements:** Polished interface spacing, alignment and dialog layouts, improved remote-control and gamepad navigation, and refined localized instructions for a more consistent experience across Tizen devices.

### Fixed
- **Streaming error handling:** Unified connection and playback errors in a single dialog displayed after the stream-closing transition. Added capture of asynchronous Tizen media-player errors and presentation of the error code and diagnostic details when available. Added specific handling for rejected H.264 configurations, and ensured the interface recovers and the application list refreshes after the dialog is closed.
- **Warning dialog focus:** Improved remote-control and gamepad navigation focus restoration when warning dialogs appear, ensuring the Close button receives focus regardless of the error type or whether additional diagnostic details are available.
- **Update dialog Markdown formatting:** Fixed the rendering of release notes so Markdown markers for **bold** and *italic* text are interpreted as formatting rather than displayed literally.


## v1.1.0

### Added
- **Dynamic H.264 level selection:** Selects the lowest H.264 level that satisfies the requested resolution and frame rate, based on the standard macroblocks-per-frame and macroblocks-per-second limits. Streams exceeding the supported Level 6.2 limits are rejected instead of being advertised with an inaccurate level.
- **H.264 level override:** Added a Video Settings selector with Automatic (recommended) as the default and manual levels from 3.0 to 5.2 for hardware compatibility testing. This selector is enabled only when H.264 is selected.
- **Configuration summary position:** Added an Interface Settings menu to place the configuration summary bar at the top or bottom of the Hosts and Apps screens, or hide it entirely.

### Changed
- **Subsystem operation timeouts:** Improved timeout handling across application subsystems. When an operation exceeds its time limit, Moonlight now displays a contextual message and aborts the operation instead of waiting indefinitely.
- **Smart Hub quick-start screen:** Reworked the direct-launch startup screen to use the same streaming transition layer as the regular interface, with consistent background, progress and status messaging, and connection-encryption feedback. The streamlined launch path restores the saved streaming settings and connects directly to the selected host and application without loading the full interface.
- **Project documentation — Ethernet guidance:** Updated the project documentation to clarify that a TV's 100 Mbps Ethernet connection can be more stable or faster than Wi-Fi on a particular model; users should compare measured throughput and stability rather than assume Wi-Fi is always preferable. This is a documentation-only change, not a code change.
- **Project documentation — Video troubleshooting:** Expanded the project documentation with guidance for identifying NVENC encoder saturation when actual stream throughput is far below the configured bitrate, including controlled tests with the preset, two-pass encoding and spatial AQ. This is a documentation-only change, not a code change.
- **Main interface background:** Replaced the flat main-interface background with a vertical gradient that darkens towards the bottom while preserving the selected color theme.
- **Default interface settings:** Enabled Video frame pacing and Host address field mode by default.

### Fixed
- **H.264 MIME profile:** Replaced the fixed Level 4.2 codec string with a resolution- and frame-rate-aware profile-level-id. Automatic mode advertises the recommended level; a manual selection overrides it. Neither mode implies that every TV decoder supports the selected level.
- **Docker build directory ownership:** Ensured the Moonlight project directory is created with the correct build-user ownership, allowing the build process to access Git metadata and inject the commit SHA reliably.
- **Graceful stream disconnection (Moonlight Common C):** Fixed the ENet disconnect interceptor so it also recognizes disconnect datagrams with the shorter header that omits the optional `sentTime` field. This allows Moonlight to process the host's graceful termination notification instead of treating the session as an unexpected connection loss.


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
- **Interface sound effects:** Added optional audio feedback for navigation and interface events, which can be enabled or disabled in the app's interface settings.
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
- **Vibeshine compatibility:** Verified Dolby compatibility with the stable [Vibeshine 2.0.3 release](https://github.com/Nonary/vibeshine/releases/tag/2.0.3).

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
- Added translations for the revised navigation feedback and stream transition status messages across the supported languages.

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
- **Configurable configuration summary:** Added a persistent Interface Settings option to show or hide the configuration summary bar on the Hosts and Apps screens, or hide it entirely.
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
- Added German (`de-DE`),…