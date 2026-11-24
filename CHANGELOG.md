# Changelog

All notable changes to the independently maintained fidoboy Moonlight Tizen fork are recorded here.


## v1.3.1

### Changed
- **Stream shutdown sequence:** Made the closing transition report its work in a visible, sequential status flow. WMP service termination, Ambilight shutdown, local audio restoration, optional remote application closure, and return to the Apps view are handled in order. Each operation has a bounded wait; failures and timeouts are recorded without preventing the interface from recovering.
- **Closing transition feedback:** Ensure a status is visible as soon as the closing transition appears, avoiding an initially blank progress screen. Preserve the established local audio restoration message.
- **Remote application lifecycle:** Restrict host-side application closure to the startup-failure and orderly-shutdown paths where it is appropriate, and honor the corresponding setting. Do not send a remote quit request for failures after playback has begun or when the setting is disabled.
- **Moonlight Common C upstream improvements (issue [#63](https://github.com/fidoboy/moonlight-tizen-ac3/issues/63)):** Integrated the applicable upstream improvements into the Tizen fork:
  - Improved video depacketization reliability through safer concurrent access to decoder state and frame data, more robust frame-loss and refresh handling, and safer queue and shutdown processing.
  - Reduced the risk of network-statistics queries blocking stream processing by using non-blocking access to ENet synchronization and retaining the latest available round-trip-time estimate.
  - Improved timing reliability on POSIX systems by using a monotonic clock where supported.
  - Enabled the C11 language features required by the library's atomic and synchronization code.
  - Preserved the fork's Tizen-specific platform, renderer, networking and Dolby Digital/AC-3/E-AC-3 adaptations.

### Fixed
- **Automatic optimal bitrate setting:** Fixed the automatic optimal-bitrate mode continuing to overwrite the manually configured bitrate after the mode had been disabled.
- **Native WMP engine lifecycle:** Fixed several issues in the initialization and handling of the native WMP engine, particularly during quick launches from Samsung Smart Hub shortcuts.
- **Video depacketizer concurrency:** Applied the compatible upstream synchronization and state-management fixes while retaining defensive handling for the Tizen integration.
- **Stream-closing status progression:** Prevented later shutdown operations from prematurely replacing earlier status messages, and ensured each stage advances only after the preceding operation completes, fails, or times out.


## v1.3.0

### Added
- **Experimental native WMP streaming engine:** Added a selectable native playback engine alongside the existing EMSS engine. The engine can be selected from the Streaming engine setting in the interface; EMSS remains the recommended option, while the native WMP/ESPlusPlayer implementation is experimental and may not deliver optimal results on every TV model. This implementation would not have been possible without the outstanding research and technical investigations carried out by [janowski.m](https://github.com/WMP/moonlight-tizen50), which provided the essential groundwork for bringing native WMP streaming to Moonlight for Tizen.
- **Experimental Ambilight integration:** Added an optional feature that captures the TV's decoded video plane during streaming, derives ambient colours from the image, and sends them to a WLED controller using the WLED realtime DRGB UDP protocol. Enable it from the Ambilight setting and enter the controller's IPv4 address. The implementation relies on a Samsung video-capture API and is available only on compatible TVs running Tizen 6.5 or later; hardware and firmware compatibility is not guaranteed. Ambilight operates independently of the selected streaming engine and is stopped when the stream ends. This integration builds on the work of [RitwickVerma's TizenAmbilight project](https://github.com/RitwickVerma/TizenAmbilight), whose research and implementation provided the foundation for bringing Ambilight support to Moonlight for Tizen.
- **Xbox Share button support:** Added support for the Share button on Xbox controllers. On the tested hardware running Tizen 6, Chromium M76 does not expose this button through the Gamepad API, so input from Share cannot currently be detected. Compatibility with newer browser-engine versions remains unverified. The button mapping is nevertheless implemented in Moonlight so it can be used by the app or forwarded to the host if a future Tizen version exposes the input.
- **Streaming menu activation:** Added a setting to invoke the streaming menu by holding the Select button, allowing users to choose this gamepad shortcut.
- **Mouse emulation stick selection:** Added a setting to choose whether the left or right gamepad stick controls mouse movement when START-based mouse emulation is enabled. The right stick remains the default, and the other stick is used for scrolling.
- **Gamepad test dialog dismissal:** Added the option to close the controller test dialog by holding the B button for more than one second. The Back button on the TV remote remains available to close the dialog.
- **Opus hardware passthrough:** Added direct Opus audio passthrough to EMSS, attempting hardware decoding first and falling back to libopus 1.6.1 software decoding when EMSS rejects the hardware track configuration.
- **Dolby Digital software decoding:** Added real-time AC-3/E-AC-3 decoding to PCM for EMSS streams when Dolby Digital (DD) is enabled and the Dolby decoding mode is set to **Software**. This provides software-decoded PCM output instead of Dolby bitstream passthrough; Hardware mode retains the existing passthrough path.
- **Manual app artwork regeneration:** Added a dedicated control in the Apps view to rebuild all application artwork for the selected host on demand. It refreshes the host's application list, forcibly retrieves the current images and regenerates their local cached artwork and Samsung Smart Hub Preview thumbnails, allowing stale, changed, missing or damaged cached images to be reconciled manually. This is an explicit recovery/maintenance action and is not required during normal use; routine app-list refreshes continue to reuse valid cached images without downloading them all again. The gamepad test control is also available from the Apps view when a controller is connected.

### Changed
- **Dolby Digital audio fallback:** The host no longer needs to provide a Dolby Digital audio stream. When available, the host-provided stream remains the preferred option. If Dolby Digital is enabled in Moonlight but cannot be negotiated with the host, Moonlight attempts to transcode the received OPUS audio to E-AC-3 in real time.
- **Audio-aware optimal bitrate calculation:** Improved the optimal streaming bitrate calculation performed after each host negotiation to account for audio stream requirements. The calculation now considers the negotiated audio codec, audio quality mode, and number of audio channels when determining the recommended streaming bitrate.
- **Expanded System Info diagnostics:** Extended the System Info panel with additional TV and network details, including firmware version, TV model series, model name and model group, Developer Mode status and configured IP address, the TV's local IP address, active network connection type (Wi-Fi or Ethernet), and Internet connectivity status. The existing application and Tizen platform version information is retained.
- **Moonlight Common C:** Updated the bundled library with various fixes and improvements.
- **Expanded performance statistics overlay:** Expanded the information provided by the performance statistics overlay with additional audio and playback diagnostics, including the received audio quality, the audio decoder operating mode (Hardware or Software), and decoding latency when using software decoding. The layout has also been refined to make better use of the available space, grouping frame-rate metrics on a single line and separating the remaining statistics with a subtle divider.
- **Settings section navigation:** Kept the right-hand pane and its controls visible while navigating between settings sections, dimming the pane during the transition instead of hiding it.

### Fixed
- **Samsung Smart Hub Preview integration:** Fixed the application metadata so that Smart Hub Preview correctly displays the host name associated with the applications shown in its app cards.
- **Performance statistics robustness:** Made unavailable, invalid or incomplete video, network and audio measurements non-fatal. Invalid counters and timing intervals now produce unavailable placeholders instead of unsafe calculations, and unknown video formats no longer trigger assertions. Statistics overlay rendering errors are isolated from stream processing.
- **Performance statistics startup timing:** Kept the statistics overlay hidden until the startup transition has completely disappeared, then enforced an additional one-second delay before its first reveal.
- **Streaming with audio output disabled:** Kept the GameStream audio transport and UDP ping active while discarding received audio packets without decoding or routing them to a playback backend.
- **Settings page navigation and control visibility:** Fixed navigation issues that could leave controls at the bottom of the Moonlight settings page hidden or inaccessible.
- **Host status icon during startup:** Fixed an initialization issue that could leave a host card without its status icon when the host did not respond to a request in time.


## v1.2.3

### Changed
- **Interface localization:** Improved interface translations in several languages.
- **Background host services:** Improved the lifecycle and coordination of background services that query and maintain host status. Host polling now remains active across the Hosts, Apps and Settings views, pauses during streaming, and resumes appropriately afterward. Manual network discovery and Auto WOL recovery run independently without interrupting known-host polling; discovery excludes known hosts, while Auto WOL only updates the registered host whose server identity matches the target.

### Fixed
- **Streaming menu input isolation:** Fixed an issue where gamepad events continued to be forwarded to the host while the streaming menu was visible. The menu now takes ownership of input while open, preventing gamepad, keyboard and mouse events from reaching the remote session; normal remote input is restored when the menu closes.
- **Stale host connectivity after startup:** Reset persisted runtime connectivity and polling state when restoring saved hosts, ensuring their online status is verified against the network before they can be selected. This prevents hosts that were online in a previous session but are now offline from appearing available and failing later during application-list retrieval.

