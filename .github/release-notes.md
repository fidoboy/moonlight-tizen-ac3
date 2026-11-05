## Highlights

- **Idle screensaver:** Added an optional screensaver, enabled by default, that appears after 60 seconds of inactivity on the main interface. It displays the Moonlight logo on a black background, periodically moves to a random position, and disappears immediately when user input is detected.
- **Gamepad testing tool:** Added an interactive controller test dialog with controller-specific diagrams for Xbox, PlayStation and Nintendo Switch Pro controllers. It provides real-time visual feedback for buttons, D-pad, triggers and analog sticks.
- **Network diagnostics:** Added a diagnostic test to measure data-transfer throughput and response latency between the TV and the host, including an evaluation of connection stability.
- **Optional startup host discovery:** Added a setting to skip automatic discovery of new hosts at startup when hosts are already configured. Saved hosts are still checked in the background, and manual discovery remains available.
- **HEVC HDR metadata fallback:** Added support for supplementing HEVC Main10 streams with missing static HDR10 mastering-display and content-light-level metadata supplied by the host, while preserving existing in-band metadata.
- **Most-used app prioritization:** Added an optional per-host setting to prioritize frequently launched applications. Apps with equal launch counts retain the configured alphabetical order, and the setting is disabled by default.
- **Improved debug log privacy:** Sensitive information is now redacted from debug logs, and standard release builds produce less verbose output. Detailed logging is reserved for builds compiled with debug mode.
- **Improved gamepad connection notifications:** Notifications now display the connected controller's name instead of its numeric index whenever a usable name is available.
- **UI and navigation refinements:** Improved interface spacing, alignment and dialog layouts, remote-control and gamepad navigation, and localized instructions for a more consistent experience across Tizen devices.
- **Improved streaming error handling:** Unified connection and playback errors into a single dialog displayed after the stream-closing transition. Added more detailed diagnostics for asynchronous Tizen media-player errors, rejected H.264 configurations and recovery of the application list.
- **Improved warning dialog navigation:** Fixed focus restoration when warning dialogs appear, ensuring the Close button receives focus regardless of the error type or available diagnostic details.
- **Update dialog Markdown formatting:** Fixed the rendering of release notes so that **bold** and *italic* Markdown formatting is displayed correctly.
