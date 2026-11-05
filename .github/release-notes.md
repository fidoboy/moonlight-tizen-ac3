## Highlights

- **Premature stream disconnection:** Removed the first-frame startup watchdog that could terminate an established streaming session when the HTML video element's `playing` event was not received within the fixed time limit, even if video was already being displayed. The connection watchdog remains in place to detect failures before the host establishes the streaming connection.
