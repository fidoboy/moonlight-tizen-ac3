function navigateWithSound(direction) {
  var previousFocus = document.querySelector('.hovered') || document.activeElement;
  Navigation[direction]();
  var currentFocus = document.querySelector('.hovered') || document.activeElement;
  if (currentFocus && currentFocus !== previousFocus &&
      typeof window.playNavigationSound === 'function') {
    window.playNavigationSound();
  }
}

function remoteControllerHandler(e) {
  isGamepadActive = false;
  const keyCode = e.keyCode;

  switch (keyCode) {
    case tvKey.KEY_UP:
      // Navigate in the up direction
      navigateWithSound('up');
      break;
    case tvKey.KEY_DOWN:
      // Navigate in the down direction
      navigateWithSound('down');
      break;
    case tvKey.KEY_LEFT:
      // Navigate in the left direction
      navigateWithSound('left');
      break;
    case tvKey.KEY_RIGHT:
      // Navigate in the right direction
      navigateWithSound('right');
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
      if (isInGame) {
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
