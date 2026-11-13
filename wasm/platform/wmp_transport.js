/*
 * Moonlight ESPlusPlayer native control channel.
 *
 * Control messages use trusted Tizen MessagePorts. This channel is for small
 * commands and status replies only; encoded audio/video packets must use a
 * separate data path.
 */
(function(global) {
  'use strict';

  // Keep the legacy service application ID, MessagePort names, and protocol stable
  // so an app update can continue using the already-registered native service.
  var SERVICE_APP_ID = 'MoonLightS.WmpService';
  var CONTROL_PORT = 'MoonlightWmpControl';
  var REPLY_PORT = 'MoonlightWmpReply';
  var PROTOCOL = 'moonlight-wmp/1';

  var localPort = null;
  var remotePort = null;
  var listenerId = null;
  var connectPromise = null;
  var nextRequestId = 0;
  var pending = Object.create(null);

  function debugLog(stage, details) {
    // The runtime log policy also filters console.debug, but keep this guard
    // here so ESPlusPlayer diagnostics can never leak into a non-Debug build.
    if (global.DEBUG_MODE !== true ||
        !global.console ||
        typeof global.console.debug !== 'function') return;
    try {
      global.console.debug('[esplusplayer]', stage, details === undefined ? '' : details);
    } catch (error) {}
  }

  function errorDetails(error) {
    if (!error) return {message: String(error)};
    return {
      name: error.name || null,
      message: error.message || String(error),
      code: error.code !== undefined ? error.code : null,
      domain: error.domain !== undefined ? error.domain : null
    };
  }

  function summarizePayload(command, payload) {
    if (!payload || typeof payload !== 'object' || command !== 'start_session') return {};
    return {
      hostProvided: !!payload.host,
      resolution: payload.w && payload.h ? String(payload.w) + 'x' + String(payload.h) : null,
      fps: payload.fps,
      bitrateKbps: payload.bitrate,
      codecMode: payload.codecMode,
      audioEnabled: payload.audioEnabled === true,
      audioConfig: payload.audioConfig,
      opticalOutputEnabled: !!payload.opticalOutputEnabled,
      videoCodec: payload.videoCodec,
      hdr: !!payload.hdr,
      fullRange: !!payload.fullRange
    };
  }

  function makeError(message) {
    return new Error('ESPlusPlayer transport: ' + message);
  }

  function readMessage(items) {
    var result = {};
    if (!Array.isArray(items)) return result;
    items.forEach(function(item) {
      if (!item || typeof item.key !== 'string') return;
      var value = item.value;
      result[item.key] = Array.isArray(value) ? value[0] : value;
    });
    return result;
  }

  function handleMessage(items) {
    var message = readMessage(items);
    if (message.protocol !== PROTOCOL) {
      debugLog('ignored MessagePort message with unexpected protocol', {
        receivedProtocol: message.protocol || null
      });
      return;
    }

    if (message.type === 'event') {
      if (message.event === 'Connection Established') {
        nativeGamepadMask = 0;
      }
      if (message.event === 'wmpDiagnosticReady') {
        if (global.DEBUG_MODE === true) {
          if (global.console && typeof global.console.info === 'function') {
            global.console.info('[esplusplayer] native diagnostic log requested (last 100 lines)');
          }
          request('get_logs').then(function(response) {
            var payload = response && response.payload ? response.payload : {};
            if (global.console && typeof global.console.info === 'function') {
              global.console.info('[esplusplayer] native diagnostic log received (' +
                Number(payload.count || 0) + ' lines)');
              if (Number(payload.hostCount || 0) > 0) {
                global.console.info('[esplusplayer] host diagnostic log (' +
                  Number(payload.hostCount) + ' lines)');
              }
            }
          }).catch(function(error) {
            debugLog('could not retrieve native diagnostic log', errorDetails(error));
          });
        }
        return;
      }
      if (message.event === 'wmpNativeLog') {
        if (global.DEBUG_MODE === true && global.console &&
            typeof global.console.info === 'function') {
          global.console.info('[esplusplayer/native]', message.detail || '');
        }
        return;
      }
      if (message.event === 'wmpHostDiagnostic') {
        if (global.DEBUG_MODE === true && global.console &&
            typeof global.console.info === 'function') {
          global.console.info('[esplusplayer/host]', message.detail || '');
        }
        return;
      }
      if (message.event === 'wmpDiagnostic') {
        debugLog('native service lifecycle diagnostic received', {
          detail: message.detail || null
        });
        return;
      }
      debugLog('native event received', {
        event: message.event || null,
        detail: message.detail || null
      });
      if (message.event && /^wmpPlayerError: /.test(String(message.event))) {
        var playerErrorCode = String(message.event).slice('wmpPlayerError: '.length);
        global.pendingStreamApiMessage = message.detail || ('ESPlus player error ' + playerErrorCode);
        debugLog('native player error reported', {
          code: playerErrorCode,
          detail: message.detail || null
        });
        // A fatal player error is followed by streamTerminated from the native
        // host. Do not show the transient connection-warning overlay here:
        // the shared stream-termination path owns the closing transition and
        // the final error dialog for both ESPlusPlayer and EMSS.
        return;
      }
      if (message.event && /^wmpAudioCodec: (PENDING|OPUS|AC-3|E-AC-3)$/.test(String(message.event))) {
        var activeCodec = String(message.event).slice('wmpAudioCodec: '.length);
        global._esplusActiveAudioCodec = activeCodec === 'PENDING' ? null : activeCodec;
        if (typeof global.refreshPerformanceStatsEngineStatus === 'function') {
          global.refreshPerformanceStatsEngineStatus();
        }
        return;
      }
      if (message.detail) global.pendingStreamApiMessage = String(message.detail);
      if (typeof global.handleMessage === 'function' && message.event) {
        global.handleMessage(String(message.event));
      }
      if (message.event === 'Connection Established') {
        syncNativeGamepads();
      }
      return;
    }
    if (message.type !== 'response') return;

    var id = String(message.id || '');
    var pendingRequest = pending[id];
    if (!pendingRequest) {
      debugLog('ignored response without a pending request', {
        id: id,
        status: message.status || null
      });
      return;
    }

    delete pending[id];

    var response = {
      id: id,
      status: String(message.status || 'error'),
      payload: {}
    };

    try {
      response.payload = JSON.parse(String(message.payload || '{}'));
    } catch (error) {
      debugLog('native response contained invalid JSON', {
        id: id,
        command: pendingRequest.command,
        error: errorDetails(error),
        rawPayloadLength: String(message.payload || '').length
      });
      pendingRequest.reject(makeError('native service returned invalid JSON'));
      return;
    }

    debugLog('native response received', {
      id: id,
      command: pendingRequest.command,
      status: response.status,
      elapsedMs: Date.now() - pendingRequest.startedAt,
      payload: response.payload
    });

    if (response.status === 'ok') {
      pendingRequest.resolve(response);
    } else {
      var errorMessage = response.payload.error || 'native command failed';
      if (response.payload.field) errorMessage += ': ' + String(response.payload.field);
      var error = makeError(errorMessage);
      if (response.payload.code !== undefined) error.code = Number(response.payload.code);
      error.nativePayload = response.payload;
      pendingRequest.reject(error);
    }
  }

  function connect() {
    if (connectPromise) {
      debugLog('reusing in-progress ESPlusPlayer service connection', {
        serviceAppId: SERVICE_APP_ID
      });
      return connectPromise;
    }

    var connectStartedAt = Date.now();
    debugLog('connecting to ESPlusPlayer native service', {
      serviceAppId: SERVICE_APP_ID,
      controlPort: CONTROL_PORT,
      replyPort: REPLY_PORT,
      tizenAvailable: !!global.tizen,
      messagePortApiAvailable: !!(global.tizen && global.tizen.messageport),
      applicationLaunchApiAvailable: !!(global.tizen && global.tizen.application &&
        typeof global.tizen.application.launch === 'function')
    });

    connectPromise = new Promise(function(resolve, reject) {
      try {
        if (!global.tizen ||
            !tizen.messageport ||
            !tizen.application ||
            typeof tizen.application.launch !== 'function') {
          throw makeError('required Tizen APIs are unavailable');
        }

        debugLog('requesting trusted local reply MessagePort', {replyPort: REPLY_PORT});
        localPort = tizen.messageport.requestTrustedLocalMessagePort(REPLY_PORT);
        debugLog('trusted local reply MessagePort acquired', {
          replyPort: REPLY_PORT,
          portAvailable: !!localPort
        });
        listenerId = localPort.addMessagePortListener(handleMessage);
        debugLog('local MessagePort listener registered', {listenerId: listenerId});

        debugLog('launching ESPlusPlayer ServiceApp', {serviceAppId: SERVICE_APP_ID});
        tizen.application.launch(SERVICE_APP_ID, function() {
          debugLog('ESPlusPlayer ServiceApp launch callback succeeded', {
            serviceAppId: SERVICE_APP_ID,
            elapsedMs: Date.now() - connectStartedAt
          });
          var remotePortAttempt = 0;
          var maxRemotePortAttempts = 30;
          var remotePortRetryDelayMs = 100;

          function openRemoteControlPort(lastError) {
            remotePortAttempt++;
            try {
              debugLog('requesting trusted remote control MessagePort', {
                serviceAppId: SERVICE_APP_ID,
                controlPort: CONTROL_PORT,
                attempt: remotePortAttempt,
                maxAttempts: maxRemotePortAttempts
              });
              var candidatePort = tizen.messageport.requestTrustedRemoteMessagePort(
                SERVICE_APP_ID, CONTROL_PORT
              );
              if (!candidatePort) {
                var unavailableError = new Error('trusted remote control port is not available yet');
                unavailableError.portNotReady = true;
                throw unavailableError;
              }
              if (candidatePort.isTrusted !== true) {
                throw makeError('native control port is not trusted');
              }

              remotePort = candidatePort;
              debugLog('remote control MessagePort acquired', {
                serviceAppId: SERVICE_APP_ID,
                controlPort: CONTROL_PORT,
                portAvailable: true,
                trusted: true,
                attempts: remotePortAttempt,
                elapsedMs: Date.now() - connectStartedAt
              });
              resolve({
                serviceAppId: SERVICE_APP_ID,
                controlPort: CONTROL_PORT,
                trusted: true
              });
            } catch (error) {
              var errorMessage = error && error.message ? error.message : String(error);
              var portNotReady = !!(error && error.portNotReady) ||
                !!(error && error.name === 'NotFoundError') ||
                /port.{0,80}not found|not found.{0,80}port/i.test(errorMessage);

              if (portNotReady && remotePortAttempt < maxRemotePortAttempts) {
                debugLog('trusted remote control MessagePort is not registered yet; retrying', {
                  serviceAppId: SERVICE_APP_ID,
                  controlPort: CONTROL_PORT,
                  attempt: remotePortAttempt,
                  maxAttempts: maxRemotePortAttempts,
                  retryInMs: remotePortRetryDelayMs,
                  elapsedMs: Date.now() - connectStartedAt,
                  error: errorDetails(error)
                });
                global.setTimeout(function() {
                  openRemoteControlPort(error);
                }, remotePortRetryDelayMs);
                return;
              }

              debugLog('could not open trusted remote control MessagePort', {
                serviceAppId: SERVICE_APP_ID,
                controlPort: CONTROL_PORT,
                attempts: remotePortAttempt,
                elapsedMs: Date.now() - connectStartedAt,
                previousError: lastError ? errorDetails(lastError) : null,
                error: errorDetails(error)
              });
              close();
              reject(makeError('native control port is unavailable: ' + errorMessage));
            }
          }

          openRemoteControlPort(null);
        }, function(error) {
          debugLog('ESPlusPlayer ServiceApp launch failed', {
            serviceAppId: SERVICE_APP_ID,
            elapsedMs: Date.now() - connectStartedAt,
            error: errorDetails(error)
          });
          close();
          reject(makeError('could not launch native service: ' +
            (error && error.message ? error.message : String(error))));
        });
      } catch (error) {
        debugLog('ESPlusPlayer service connection setup failed synchronously', {
          serviceAppId: SERVICE_APP_ID,
          elapsedMs: Date.now() - connectStartedAt,
          error: errorDetails(error)
        });
        connectPromise = null;
        reject(error && error.message && error.message.indexOf('ESPlusPlayer transport:') === 0
          ? error
          : makeError(error.message || String(error)));
      }
    });

    return connectPromise;
  }

  function request(command, payload) {
    if (typeof command !== 'string' || !command) {
      return Promise.reject(makeError('command must be a non-empty string'));
    }

    var serializedPayload;
    try {
      serializedPayload = JSON.stringify(payload === undefined ? {} : payload);
    } catch (error) {
      debugLog('request payload serialization failed', {
        command: command,
        error: errorDetails(error)
      });
      return Promise.reject(makeError('payload is not JSON serializable'));
    }

    if (serializedPayload.length > 2048) {
      debugLog('request rejected because payload is too large', {
        command: command,
        payloadLength: serializedPayload.length,
        maximumLength: 2048
      });
      return Promise.reject(makeError('control payload exceeds 2048 characters'));
    }

    debugLog('native command queued', {
      command: command,
      payloadLength: serializedPayload.length,
      parameters: summarizePayload(command, payload)
    });

    return connect().then(function() {
      return new Promise(function(resolve, reject) {
        var id = String(++nextRequestId);
        pending[id] = {
          resolve: resolve,
          reject: reject,
          command: command,
          startedAt: Date.now()
        };

        try {
          var items = [
            {key: 'protocol', value: PROTOCOL},
            {key: 'id', value: id},
            {key: 'command', value: command},
            {key: 'payload', value: serializedPayload}
          ];
          if (payload && typeof payload === 'object' && !Array.isArray(payload)) {
            Object.keys(payload).forEach(function(key) {
              if (!/^[A-Za-z][A-Za-z0-9]*$/.test(key)) return;
              var value = payload[key];
              if (value === undefined || value === null) return;
              items.push({key: 'arg_' + key, value: String(value)});
            });
          }
          debugLog('sending native command over MessagePort', {
            id: id,
            command: command,
            itemCount: items.length
          });
          remotePort.sendMessage(items, localPort);
        } catch (error) {
          delete pending[id];
          debugLog('native command send failed', {
            id: id,
            command: command,
            error: errorDetails(error)
          });
          reject(makeError('could not send command: ' + error.message));
        }
      });
    }).catch(function(error) {
      debugLog('native command failed before receiving a response', {
        command: command,
        error: errorDetails(error)
      });
      throw error;
    });
  }

  // Input is high-frequency and does not need a response. Keep it on the
  // trusted control port without creating one pending request per sample.
  function sendInput(command, payload) {
    if (!command || !payload || typeof payload !== 'object') return Promise.resolve(false);
    return connect().then(function() {
      var items = [
        {key: 'protocol', value: PROTOCOL},
        {key: 'id', value: ''},
        {key: 'command', value: command},
        {key: 'payload', value: '{}'}
      ];
      Object.keys(payload).forEach(function(key) {
        if (/^[A-Za-z][A-Za-z0-9]*$/.test(key) &&
            payload[key] !== undefined && payload[key] !== null) {
          items.push({key: 'arg_' + key, value: String(payload[key])});
        }
      });
      remotePort.sendMessage(items, localPort);
      return true;
    }).catch(function(error) {
      debugLog('native input forwarding failed', {
        command: command,
        error: errorDetails(error)
      });
      return false;
    });
  }

  function sendKey(keyCode, keyAction, modifiers) {
    return sendInput('input_key', {
      keyCode: keyCode,
      keyAction: keyAction,
      modifiers: modifiers || 0
    });
  }

  function sendMouseMove(deltaX, deltaY) {
    if (!deltaX && !deltaY) return Promise.resolve(false);
    return sendInput('mouse_move', {deltaX: deltaX, deltaY: deltaY});
  }

  function sendMouseButton(button, pressed) {
    return sendInput('mouse_button', {button: button, pressed: pressed ? 1 : 0});
  }

  function sendMouseScroll(amount) {
    if (!amount) return Promise.resolve(false);
    return sendInput('mouse_scroll', {amount: amount});
  }

  function sendGamepadArrival(index, activeMask, type, supportedButtons, capabilities) {
    return sendInput('gamepad_arrival', {
      index: index, activeMask: activeMask, type: type,
      supportedButtons: supportedButtons, capabilities: capabilities || 0
    });
  }

  function sendGamepadState(index, activeMask, buttons, leftTrigger, rightTrigger,
                            lsX, lsY, rsX, rsY) {
    return sendInput('gamepad_state', {
      index: index, activeMask: activeMask, buttons: buttons,
      leftTrigger: leftTrigger, rightTrigger: rightTrigger,
      lsX: lsX, lsY: lsY, rsX: rsX, rsY: rsY
    });
  }

  function close() {
    var pendingCount = Object.keys(pending).length;
    debugLog('closing ESPlusPlayer transport', {
      localPortAvailable: !!localPort,
      remotePortAvailable: !!remotePort,
      listenerRegistered: listenerId !== null,
      pendingRequests: pendingCount
    });
    if (localPort && listenerId !== null) {
      try {
        localPort.removeMessagePortListener(listenerId);
      } catch (error) {
        debugLog('failed to remove local MessagePort listener', {
          listenerId: listenerId,
          error: errorDetails(error)
        });
      }
    }
    localPort = null;
    remotePort = null;
    listenerId = null;
    connectPromise = null;

    Object.keys(pending).forEach(function(id) {
      pending[id].reject(makeError('reply channel closed'));
      delete pending[id];
    });
  }

  var nativeGamepadMask = 0;

  function nativeInputActive() {
    return global._activeStreamingEngine === 'ESPLUSPLAYER' && global._activeStreamingEngineConfirmed === true;
  }

  function controllerType(id) {
    id = String(id || '').toLowerCase();
    if (id.indexOf('054c') !== -1 || /dualsense|dualshock|playstation|sony/.test(id)) return 2;
    if (id.indexOf('045e') !== -1 || id.indexOf('xbox') !== -1) return 1;
    if (id.indexOf('057e') !== -1 || /nintendo|joy-con/.test(id)) return 3;
    return 0;
  }

  function supportedButtons(count) {
    var flags = [0x1000, 0x2000, 0x4000, 0x8000, 0x0100, 0x0200,
      0, 0, 0x0020, 0x0010, 0x0040, 0x0080, 0x0001, 0x0002,
      0x0004, 0x0008, 0x0400, 0x200000];
    var result = 0;
    for (var i = 0; i < count && i < flags.length; i++) result |= flags[i];
    return result;
  }

  function onGamepadConnected(event) {
    if (!nativeInputActive()) return;
    var detail = event.detail || {};
    var index = Number(detail.gamepadIndex);
    if (!Number.isInteger(index) || index < 0 || index > 15) return;
    nativeGamepadMask |= (1 << index);
    sendGamepadArrival(index, nativeGamepadMask, controllerType(detail.id),
      supportedButtons(Number(detail.buttonCount) || 0),
      Number(detail.buttonCount) > 7 ? 1 : 0);
  }

  function onGamepadDisconnected(event) {
    if (!nativeInputActive()) return;
    var detail = event.detail || {};
    var index = Number(detail.gamepadIndex);
    if (!Number.isInteger(index) || index < 0 || index > 15) return;
    nativeGamepadMask &= ~(1 << index);
    sendGamepadState(index, nativeGamepadMask, 0, 0, 0, 0, 0, 0, 0);
  }

  function onGamepadState(event) {
    if (!nativeInputActive()) return;
    var detail = event.detail || {};
    var index = Number(detail.gamepadIndex);
    if (!Number.isInteger(index) || index < 0 || index > 15 ||
        !(nativeGamepadMask & (1 << index))) return;
    var buttons = Array.isArray(detail.buttons) ? detail.buttons : [];
    var axes = Array.isArray(detail.axes) ? detail.axes : [];
    var map = [0x1000, 0x2000, 0x4000, 0x8000, 0x0100, 0x0200,
      0, 0, 0x0020, 0x0010, 0x0040, 0x0080, 0x0001, 0x0002,
      0x0004, 0x0008, 0x0400, 0x200000];
    var flags = 0;
    for (var i = 0; i < buttons.length && i < map.length; i++) {
      if (Number(buttons[i]) > 0.5) flags |= map[i];
    }
    if (flags === (0x0020 | 0x0010 | 0x0100 | 0x0200)) {
      request('stop_session').catch(function() {});
      return;
    }
    if (flags === (0x0020 | 0x0100 | 0x0200 | 0x4000)) {
      request('toggle_stats').catch(function() {});
      return;
    }
    function axis(index) {
      var value = Number(axes[index] || 0);
      return Math.max(-32768, Math.min(32767, Math.round(value * 32767)));
    }
    sendGamepadState(index, nativeGamepadMask, flags,
      Math.round(Math.max(0, Math.min(1, Number(buttons[6] || 0))) * 255),
      Math.round(Math.max(0, Math.min(1, Number(buttons[7] || 0))) * 255),
      axis(0), -axis(1), axis(2), -axis(3));
  }

  function syncNativeGamepads() {
    if (!nativeInputActive() || !global.navigator) return;
    var pads = global.navigator.getGamepads
      ? global.navigator.getGamepads()
      : global.navigator.webkitGetGamepads
      ? global.navigator.webkitGetGamepads()
      : [];
    for (var i = 0; i < pads.length && i < 16; i++) {
      var pad = pads[i];
      if (!pad || !pad.connected) continue;
      onGamepadConnected({detail: {
        gamepadIndex: pad.index, id: pad.id, buttonCount: pad.buttons.length
      }});
      onGamepadState({detail: {
        gamepadIndex: pad.index, id: pad.id,
        buttons: pad.buttons.map(function(button) { return button.value; }),
        axes: Array.prototype.slice.call(pad.axes)
      }});
    }
  }

  var pressedKeys = Object.create(null);
  var wheelRemainder = 0;

  function inputUiBlocked() {
    return global.isDialogOpen === true ||
      global.isPairingInProgress === true ||
      global.isGamepadTestDialogOpen === true;
  }

  function inputModifiers(event) {
    return (event.shiftKey ? 0x01 : 0) |
      (event.ctrlKey ? 0x02 : 0) |
      (event.altKey ? 0x04 : 0) |
      (event.metaKey ? 0x08 : 0);
  }

  function isEditableTarget(target) {
    if (!target) return false;
    var tag = String(target.tagName || '').toLowerCase();
    return tag === 'input' || tag === 'textarea' || tag === 'select' ||
      target.isContentEditable === true;
  }

  function onPhysicalKeyboard(event) {
    if (!nativeInputActive() || inputUiBlocked() || isEditableTarget(event.target)) return;
    var code = Number(event.keyCode || event.which || 0);
    if (!code || code > 0xFFFF) return;
    // Samsung remote keys are already translated by remote_controller.js.
    var isSamsungRemoteKey = global.tvKey && (
      code === global.tvKey.KEY_UP || code === global.tvKey.KEY_DOWN ||
      code === global.tvKey.KEY_LEFT || code === global.tvKey.KEY_RIGHT ||
      code === global.tvKey.KEY_ENTER || code === global.tvKey.KEY_REMOTE_ENTER ||
      code === global.tvKey.KEY_RETURN
    );
    // DOM keyboard events carry a physical KeyboardEvent.code; Samsung's
    // platform remote callback is handled separately by remote_controller.js.
    if (isSamsungRemoteKey && (!event.code || event.code === 'Unidentified')) return;

    var key = String(code);
    if (event.type === 'keydown') {
      if (pressedKeys[key]) {
        if (event.cancelable) event.preventDefault();
        return;
      }
      pressedKeys[key] = true;
      sendKey(code, 3, inputModifiers(event));
    } else {
      if (!pressedKeys[key]) return;
      delete pressedKeys[key];
      sendKey(code, 4, inputModifiers(event));
    }
    if (event.cancelable) event.preventDefault();
  }

  function releasePressedKeys() {
    Object.keys(pressedKeys).forEach(function(key) {
      sendKey(Number(key), 4, 0);
      delete pressedKeys[key];
    });
  }

  function onMouseMove(event) {
    if (!nativeInputActive() || inputUiBlocked()) return;
    var locked = global.document &&
      (global.document.pointerLockElement || global.document.webkitPointerLockElement);
    if (!locked) return;
    var dx = Number(event.movementX || event.webkitMovementX || 0);
    var dy = Number(event.movementY || event.webkitMovementY || 0);
    if (dx || dy) sendMouseMove(Math.round(dx), Math.round(dy));
  }

  function onMouseButton(event) {
    if (!nativeInputActive() || inputUiBlocked()) return;
    if (event.button < 0 || event.button > 2) return;
    sendMouseButton(event.button, event.type === 'mousedown');
    // Do not cancel mousedown: the video surface still needs the user gesture
    // to acquire pointer lock for relative mouse movement.
  }

  function onMouseWheel(event) {
    if (!nativeInputActive() || inputUiBlocked()) return;
    var wheelDelta = Number(event.deltaY || 0);
    if (event.deltaMode === 1) wheelDelta *= 33;
    else if (event.deltaMode === 2) wheelDelta *= 100;
    wheelRemainder += -wheelDelta / 100;
    var amount = wheelRemainder < 0 ? Math.ceil(wheelRemainder) : Math.floor(wheelRemainder);
    if (amount !== 0) {
      wheelRemainder -= amount;
      sendMouseScroll(amount);
      if (event.cancelable) event.preventDefault();
    }
  }

  if (global.document && global.document.addEventListener) {
    global.document.addEventListener('keydown', onPhysicalKeyboard, true);
    global.document.addEventListener('keyup', onPhysicalKeyboard, true);
    global.document.addEventListener('mousemove', onMouseMove, true);
    global.document.addEventListener('mousedown', onMouseButton, true);
    global.document.addEventListener('mouseup', onMouseButton, true);
    global.document.addEventListener('wheel', onMouseWheel, {capture: true, passive: false});
  }
  global.addEventListener('blur', releasePressedKeys);
  global.addEventListener('pagehide', releasePressedKeys);

  global.addEventListener('esplusgamepadconnected', onGamepadConnected);
  global.addEventListener('esplusgamepaddisconnected', onGamepadDisconnected);
  global.addEventListener('esplusgamepadstate', onGamepadState);

  global.ESPlusPlayerTransport = {
    connect: connect,
    request: request,
    ping: function() { return request('ping'); },
    getStatus: function() { return request('get_status'); },
    getLogs: function() { return request('get_logs'); },
    toggleStats: function() { return request('toggle_stats'); },
    probeEsplus: function() { return request('probe_esplus'); },
    startStream: function(parameters) { return request('start_session', parameters); },
    stopStream: function() { return request('stop_session'); },
    sendKey: sendKey,
    sendMouseMove: sendMouseMove,
    sendMouseButton: sendMouseButton,
    sendMouseScroll: sendMouseScroll,
    sendGamepadArrival: sendGamepadArrival,
    sendGamepadState: sendGamepadState,
    syncGamepads: syncNativeGamepads,
    close: close
  };
})(window);
