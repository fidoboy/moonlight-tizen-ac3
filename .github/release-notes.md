## Highlights

- **Improved host connectivity management:** Refined background host polling across the Hosts, Apps and Settings views. Polling now pauses during streaming and resumes appropriately; manual discovery and Auto WOL operate independently without interrupting checks for known hosts.
- **Streaming menu input isolation:** Fixed gamepad, keyboard and mouse events reaching the remote session while the streaming menu is open. The menu now takes ownership of input until it closes.
- **More reliable host status after startup:** Reset persisted runtime connectivity state when restoring saved hosts, so their availability is verified against the network before selection.
- **Interface localization:** Improved translations across several supported languages.
