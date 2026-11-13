const Controller = (function() {
  let pollingInterval = null;
  const gamepads = {};

  class Button {
    constructor(button) {
      this.value = button.value;
      this.pressed = button.pressed;
    }
  }

  class Gamepad {
    constructor(gamepad) {
      this.index = gamepad.index;
      this.buttons = gamepad.buttons.map((button) => new Button(button));
      this.axes = gamepad.axes.slice(); // Store initial axis values
    }

    analyzeButtonsAndAxes(newButtons, newAxes) {
      if (this.buttons.length !== newButtons.length || this.axes.length !== newAxes.length) {
        console.error('%c[gamepad.js, analyzeButtonsAndAxes]', 'color: gray;', 'Error: New buttons or axes layout does not match the saved one!');
        return;
      }

      const changes = [];

      for (let i = 0; i < newButtons.length; ++i) {
        if (this.buttons[i].pressed !== newButtons[i].pressed) {
          changes.push({
            type: 'button',
            index: i,
            pressed: newButtons[i].pressed,
          });
        }
      }

      for (let i = 0; i < newAxes.length; i++) {
        if (this.axes[i] !== newAxes[i]) {
          changes.push({
            type: 'axis',
            index: i,
            value: newAxes[i]
          });
        }
      }

      if (changes.length > 0) {
        window.dispatchEvent(new CustomEvent('gamepadinputchanged', {
            detail: { gamepadIndex: this.index, changes },
          })
        );
      }

      this.buttons = newButtons.map((button) => new Button(button));
      this.axes = newAxes.slice(); // Update stored axis values
      return changes.length > 0;
    }
  }

  function gamepadConnected(gamepad) {
    gamepads[gamepad.index] = new Gamepad(gamepad);
    window.dispatchEvent(new CustomEvent('esplusgamepadconnected', {
      detail: { gamepadIndex: gamepad.index, id: gamepad.id, buttonCount: gamepad.buttons.length }
    }));
    window.dispatchEvent(new CustomEvent('esplusgamepadstate', {
      detail: {
        gamepadIndex: gamepad.index,
        id: gamepad.id,
        buttons: gamepad.buttons.map((button) => button.value),
        axes: gamepad.axes.slice()
      }
    }));
  }

  function gamepadDisconnected(gamepad) {
    delete gamepads[gamepad.index];
    window.dispatchEvent(new CustomEvent('esplusgamepaddisconnected', {
      detail: { gamepadIndex: gamepad.index }
    }));
    // Let navigation release any held/repeated input owned by this controller.
    window.dispatchEvent(new CustomEvent('gamepadinputcleared', {
      detail: { gamepadIndex: gamepad.index },
    }));
  }

  function analyzeGamepad(gamepad) {
    const index = gamepad.index;
    const pGamepad = gamepads[index];

    if (pGamepad && pGamepad.analyzeButtonsAndAxes(gamepad.buttons, gamepad.axes)) {
      window.dispatchEvent(new CustomEvent('esplusgamepadstate', {
        detail: {
          gamepadIndex: gamepad.index,
          id: gamepad.id,
          buttons: gamepad.buttons.map((button) => button.value),
          axes: gamepad.axes.slice()
        }
      }));
    }
  }

  function pollGamepads() {
    const gamepads = navigator.getGamepads
      ? navigator.getGamepads()
      : navigator.webkitGetGamepads
      ? navigator.webkitGetGamepads
      : [];
    for (const gamepad of gamepads) {
      if (gamepad) {
        analyzeGamepad(gamepad);
      }
    }
  }

  function startWatching() {
    if (!pollingInterval) {
      // Register controllers that were already connected when the app started.
      const connectedGamepads = navigator.getGamepads
        ? navigator.getGamepads()
        : navigator.webkitGetGamepads
        ? navigator.webkitGetGamepads()
        : [];
      for (const gamepad of connectedGamepads) {
        if (gamepad && gamepad.connected) gamepadConnected(gamepad);
      }
      window.addEventListener('gamepadconnected', function(e) {
        gamepadConnected(e.gamepad);
      });
      window.addEventListener('gamepaddisconnected', function(e) {
        gamepadDisconnected(e.gamepad);
      });
      pollingInterval = setInterval(pollGamepads, 5);
    }
  }

  function stopWatching() {
    if (pollingInterval) {
      clearInterval(pollingInterval);
      pollingInterval = null;
    }
  }

  return {
    startWatching,
    stopWatching 
  };
})();
