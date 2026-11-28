## Highlights

- **Linux AppImage distribution:** The installer is now distributed as a self-contained AppImage, including its desktop entry and application icon. On GNOME, it registers a local launcher and icon so the running application is correctly associated with its dock entry.
- **macOS DMG distribution:** Replaced ZIP archives with DMG disk images for Intel and Apple Silicon. Each image contains the Moonlight Tizen Installer app bundle, its application icon, and an Applications shortcut for drag-and-drop installation.
- **Improved installer reliability across platforms:** Fixed the Linux installer download filename and link, improved signing-certificate profile validation and reuse (including certificate validity checks and legacy profile support), and corrected the wizard's transition to the final result page across all desktop platforms.

