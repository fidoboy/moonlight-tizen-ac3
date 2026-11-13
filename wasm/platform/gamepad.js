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
        if (this.buttons[i].pressed !== newButtons[i].pressed || this.buttons[i].value !== newButtons[i].value) {
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
    if (!gamepad || gamepad.index == null) return;
    if (gamepads[gamepad.index]) {
      analyzeGamepad(gamepad);
      return;
    }
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
    if (!gamepads[gamepad.index]) return;
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

  function readGamepads() {
    let list = [];
    try {
      if (navigator.getGamepads) list = navigator.getGamepads();
      else if (navigator.webkitGetGamepads) list = navigator.webkitGetGamepads();
    } catch (error) {
      return [];
    }
    // Older WebKit implementations expose an array-like GamepadList rather
    // than a fully iterable Array.
    try { return Array.prototype.slice.call(list || []); }
    catch (error) { return []; }
  }

  function pollGamepads() {
    const connected = Object.create(null);
    const current = readGamepads();
    for (const gamepad of current) {
      if (!gamepad || !gamepad.connected) continue;
      connected[gamepad.index] = true;
      if (gamepads[gamepad.index]) analyzeGamepad(gamepad);
      else gamepadConnected(gamepad);
    }

    // Some Tizen WebKit versions do not dispatch gamepadconnected /
    // gamepaddisconnected reliably. Reconcile the polled list with our state.
    Object.keys(gamepads).forEach((index) => {
      if (!connected[index]) gamepadDisconnected({index: Number(index)});
    });
  }

  function startWatching() {
    if (!pollingInterval) {
      // Register controllers already connected before the first polling tick.
      pollGamepads();
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
