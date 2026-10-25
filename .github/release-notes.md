## Highlights

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
