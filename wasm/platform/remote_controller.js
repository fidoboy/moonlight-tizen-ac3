function remoteControllerHandler(e) {
  isGamepadActive = false;
  const keyCode = e.keyCode;

  // In native-engine mode the WASM input loop does not own the stream.
  // Forward TV remote navigation keys directly to Moonlight Common C instead.
  if (isInGame === true && isDialogOpen !== true && window._activeStreamingEngine === 'ESPLUSPLAYER' &&
      window.ESPlusPlayerTransport &&
      typeof window.ESPlusPlayerTransport.sendKey === 'function') {
    let virtualKey = 0;
    switch (keyCode) {
      case tvKey.KEY_UP: virtualKey = 0x26; break;
      case tvKey.KEY_DOWN: virtualKey = 0x28; break;
      case tvKey.KEY_LEFT: virtualKey = 0x25; break;
      case tvKey.KEY_RIGHT: virtualKey = 0x27; break;
      case tvKey.KEY_ENTER:
      case tvKey.KEY_REMOTE_ENTER: virtualKey = 0x0D; break;
      case tvKey.KEY_RETURN: virtualKey = 0x1B; break;
      default: break;
    }
    if (virtualKey !== 0) {
      e.preventDefault();
      window.ESPlusPlayerTransport.sendKey(virtualKey, 3, 0);
      window.ESPlusPlayerTransport.sendKey(virtualKey, 4, 0);
      return;
    }
  }

  switch (keyCode) {
    case tvKey.KEY_UP:
      // Navigate in the up direction
      Navigation.up();
      break;
    case tvKey.KEY_DOWN:
      // Navigate in the down direction
      Navigation.down();
      break;
    case tvKey.KEY_LEFT:
      // Navigate in the left direction
      Navigation.left();
      break;
    case tvKey.KEY_RIGHT:
      // Navigate in the right direction
      Navigation.right();
      break;
    case tvKey.KEY_ENTER:
    case tvKey.KEY_REMOTE_ENTER:
      e.preventDefault(); // Prevent native asynchronous click
      // Select the current item
      Navigation.accept();
      break;
    case tvKey.KEY_RETURN:
      // Go back or cancel the operation
      Navigation.back();
      break;
    case tvKey.KEY_PLAY_PAUSE:
    case tvKey.KEY_PAUSE:
    case tvKey.KEY_PLAY:
      // Use the registered Tizen remote-controller events for media keys.
      if (isInGame || (typeof window.isNativeStreamingEngineActive === 'function' &&
          window.isNativeStreamingEngineActive())) {
        e.preventDefault();
        toggleStreamMenuDialog();
      }
      break;
    case tvKey.KEY_VOLUME_UP:
      // Increase the volume
      tizen.tvaudiocontrol.setVolumeUp();
      break;
    case tvKey.KEY_VOLUME_DOWN:
      // Decrease the volume
      tizen.tvaudiocontrol.setVolumeDown();
      break;
    case tvKey.KEY_VOLUME_MUTE:
      // Mute the volume
      tizen.tvaudiocontrol.setMute();
      break;
    case tvKey.KEY_CHANNEL_UP:
      // Triggers the press action
      Navigation.press();
      break;
    case tvKey.KEY_CHANNEL_DOWN:
      // Triggers the switch action
      Navigation.switch();
      break;
    case tvKey.KEY_RED:
      // Terminate the connection
      if (isInGame === true) {
        requestManualStreamStop();
      }
      break;
    case tvKey.KEY_YELLOW:
      // Toggle performance stats overlay
      if (isInGame === true) {
        Module.toggleStats();
      }
      break;
    default:
      break;
  }
}
