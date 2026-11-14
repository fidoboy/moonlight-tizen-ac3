
// Build-time logging controls. The release build stays quiet unless DEBUG_MODE is injected by CI.
var DEBUG_MODE = false;
var LOG_SHOW_PRIVATE_DATA = false;

// Keep normal runtime logs limited to the small set of lifecycle events useful to users.
(function installRuntimeLogPolicy() {
  var originalLog = console.log ? console.log.bind(console) : function() {};
  var originalInfo = console.info ? console.info.bind(console) : function() {};
  var originalDebug = console.debug ? console.debug.bind(console) : function() {};
  var originalWarn = console.warn ? console.warn.bind(console) : function() {};
  var originalError = console.error ? console.error.bind(console) : function() {};

  function isEssentialLog(args) {
    var tag = typeof args[0] === 'string' ? args[0] : '';
    var message = args.slice(2).map(function(value) {
      return typeof value === 'string' ? value : '';
    }).join(' ');
    return (tag.indexOf('[common.js, createWASMModule]') !== -1 && message.indexOf('WASM runtime initialized') !== -1) ||
      (tag.indexOf('[index.js, onWindowLoad]') !== -1 && message.indexOf('App Version:') !== -1) ||
      (tag.indexOf('[index.js, showStreamMode]') !== -1 && (message.indexOf('Entering "Show Stream" mode.') !== -1 || message.indexOf('Closing "Show Stream" mode.') !== -1)) ||
      tag === '[stream]' ||
      (tag.indexOf('[common.js, createWASMModule]') !== -1 && message.indexOf('WASM exit called') !== -1) ||
      (tag.indexOf('[index.js, exitAppDialog]') !== -1 && message.indexOf('exiting application') !== -1);
  }

  var HIDDEN_LOG_VALUE = '--- HIDDEN ---';

  function isAlwaysSensitiveLogKey(key) {
    var normalizedKey = String(key || '').replace(/[^a-z0-9]/gi, '').toLowerCase();
    return /^(?:cert|certificate|privatekey|ppkstr|secret|password|token|pin|externalip|publicip|mac|macaddress|clientuid|serveruid|uniqueid|uid)$/.test(normalizedKey);
  }

  function isAddressLogKey(key) {
    var normalizedKey = String(key || '').replace(/[^a-z0-9]/gi, '').toLowerCase();
    return /^(?:address|ip|ipaddress|localip|localaddress|externaladdress|userenteredaddress)$/.test(normalizedKey);
  }

  function isPrivateIPv4(address) {
    var parts = address.split('.');
    if (parts.length !== 4) return false;
    var octets = parts.map(function(part) { return Number(part); });
    if (octets.some(function(part) { return !Number.isInteger(part) || part < 0 || part > 255; })) return false;
    return octets[0] === 0 || octets[0] === 10 || octets[0] === 127 ||
      (octets[0] === 169 && octets[1] === 254) ||
      (octets[0] === 172 && octets[1] >= 16 && octets[1] <= 31) ||
      (octets[0] === 192 && octets[1] === 168);
  }

  function isPrivateIPv6(address) {
    var value = address.replace(/^\[|\]$/g, '').toLowerCase();
    if (value === '::' || value === '::1') return true;
    var doubleColon = value.indexOf('::');
    if (doubleColon !== -1 && value.indexOf('::', doubleColon + 2) !== -1) return false;
    var halves = value.split('::');
    var left = halves[0] ? halves[0].split(':') : [];
    var right = halves.length > 1 && halves[1] ? halves[1].split(':') : [];
    var groups = left.concat(right);
    if (groups.some(function(group) { return !/^[0-9a-f]{1,4}$/.test(group); })) return false;
    if ((halves.length === 1 && groups.length !== 8) || (halves.length === 2 && groups.length >= 8)) return false;
    var first = parseInt(groups[0] || '0', 16);
    return (first & 0xfe00) === 0xfc00 || (first & 0xffc0) === 0xfe80;
  }

  function isPrivateAddressLiteral(address) {
    if (/^(?:[0-9]{1,3}\.){3}[0-9]{1,3}$/.test(address)) return isPrivateIPv4(address);
    if (address.indexOf(':') !== -1) return isPrivateIPv6(address);
    return false;
  }

  function sanitizeIpAddresses(value) {
    var versions = [];
    value = value.replace(/(\b(?:gfe|app|server)\s+version\s*:\s*)([0-9]+(?:\.[0-9]+){2,})/gi, function(match, label, version) {
      var marker = '__LOG_VERSION_' + versions.length + '__';
      versions.push(version);
      return label + marker;
    });
    value = value.replace(/\b(?:[0-9]{1,3}\.){3}[0-9]{1,3}\b/g, function(address) {
      return isPrivateIPv4(address) ? address : HIDDEN_LOG_VALUE;
    });
    value = value.replace(/__LOG_VERSION_(\d+)__/g, function(match, index) {
      return versions[Number(index)] || match;
    });
    return value.replace(/(^|[^a-z0-9:])(\[?(?:[0-9a-f]{0,4}:){2,7}[0-9a-f]{0,4}\]?)(?=$|[^a-z0-9:])/gi, function(match, prefix, address) {
      return prefix + (isPrivateIPv6(address) ? address : HIDDEN_LOG_VALUE);
    });
  }

  function sanitizeLogValue(value, key, seen) {
    if (LOG_SHOW_PRIVATE_DATA) return value;
    if (key && isAlwaysSensitiveLogKey(key)) return HIDDEN_LOG_VALUE;
    if (typeof value === 'string') {
      if (key && isAddressLogKey(key) && value && !isPrivateAddressLiteral(value)) return HIDDEN_LOG_VALUE;
      return sanitizeIpAddresses(value)
        .replace(/-----BEGIN CERTIFICATE-----[\s\S]*?-----END CERTIFICATE-----/g, HIDDEN_LOG_VALUE)
        .replace(/-----BEGIN (?:RSA |EC |ENCRYPTED )?PRIVATE KEY-----[\s\S]*?-----END (?:RSA |EC |ENCRYPTED )?PRIVATE KEY-----/g, HIDDEN_LOG_VALUE)
        .replace(/\b(?:[0-9a-f]{2}:){5}[0-9a-f]{2}\b/gi, HIDDEN_LOG_VALUE)
        .replace(/\b[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}\b/gi, HIDDEN_LOG_VALUE)
        .replace(/\b[0-9a-f]{16}(?:[0-9a-f]{16})?\b/gi, HIDDEN_LOG_VALUE)
        .replace(/(\bPIN\s*[:=]?\s*)\d{4,8}\b/gi, '$1' + HIDDEN_LOG_VALUE);
    }
    if (!value || typeof value !== 'object') return value;
    var isPlainObject = false;
    var isHostRecord = false;
    try {
      var prototype = Object.getPrototypeOf(value);
      isPlainObject = prototype === Object.prototype || prototype === null;
      isHostRecord = value.hostname !== undefined && value.externalIP !== undefined &&
        value.serverUid !== undefined && value.address !== undefined;
    } catch (error) {}
    if (!Array.isArray(value) && !isPlainObject && !isHostRecord) return value;
    seen = seen || [];
    if (seen.indexOf(value) !== -1) return '[Circular]';
    seen.push(value);
    var output = Array.isArray(value) ? [] : {};
    Object.keys(value).forEach(function(childKey) {
      try { output[childKey] = sanitizeLogValue(value[childKey], childKey, seen); }
      catch (error) { output[childKey] = '[Unavailable]'; }
    });
    seen.pop();
    return output;
  }

  function safeArgs(args) {
    return args.map(function(value) { return sanitizeLogValue(value, '', []); });
  }

  console.log = function() {
    var args = Array.prototype.slice.call(arguments);
    if (!DEBUG_MODE && !isEssentialLog(args)) return;
    originalLog.apply(null, safeArgs(args));
  };
  console.info = function() {
    var args = Array.prototype.slice.call(arguments);
    if (!DEBUG_MODE && !isEssentialLog(args)) return;
    originalInfo.apply(null, safeArgs(args));
  };
  console.debug = function() {
    if (!DEBUG_MODE) return;
    originalDebug.apply(null, safeArgs(Array.prototype.slice.call(arguments)));
  };
  console.warn = function() {
    originalWarn.apply(null, safeArgs(Array.prototype.slice.call(arguments)));
  };
  console.error = function() {
    originalError.apply(null, safeArgs(Array.prototype.slice.call(arguments)));
  };
})();

// Initialize global variables and constants
var appInfo = tizen.application.getAppInfo(); // Retrieve the application information
var platformVer = tizen.systeminfo.getCapability("http://tizen.org/feature/platform.version"); // Retrieve the device platform version
var modelSeries = webapis.productinfo.getModel(); // Retrieve the device model series
var modelName = webapis.productinfo.getRealModel(); // Retrieve the device model name
var modelGroup = webapis.productinfo.getModelCode(); // Retrieve the device model group
var is4kPanel = false;
var is8kPanel = false;
var panelCapabilitiesChecked = false;
var maxSupportedWidth;
var maxSupportedHeight;

// Display capabilities are queried once when the Settings screen is entered.
var isHdrCapable = null;
var hosts = {}; // Hosts is an associative array of NvHTTP objects, keyed by server UID
var isHostOpening = false; // Prevents concurrent hostChosen executions, initial value is false
var isHostsLoaded = false; // Indicates if IndexedDB has finished loading hosts
var isStartupHttpReady = false;
var isStartupHostsLoaded = false;
var isStartupLocaleReady = false;
var isStartupWindowLoaded = false;
var ambilightSupportState = 'checking';
var ambilightInitializationPromise = null;
var isStartupUiRestored = false;
var isDeferredStartupScheduled = false;
var isDeferredStartupStarted = false;
var deferredStartupTimeout = null;
var isNormalStartupPreparationStarted = false;
var isNormalStartupPrepared = false;
var isSubnetScanFinished = false; // Indicates if the initial subnet scan has completed
var subnetScannerLoadPromise = null;

// Load the legacy DNS helpers and the Tizen subnet scanner only when discovery is
// actually requested. Keep a shared promise so startup, manual refresh and WOL
// cannot race into loading duplicate script instances.
function ensureSubnetScannerLoaded() {
  if (typeof window.startSubnetScanner === 'function') {
    return Promise.resolve();
  }
  if (subnetScannerLoadPromise) {
    return subnetScannerLoadPromise;
  }

  function loadDiscoveryScript(src) {
    return new Promise(function(resolve, reject) {
      var script = document.createElement('script');
      script.type = 'text/javascript';
      script.async = false;
      script.src = src;
      script.onload = function() { resolve(); };
      script.onerror = function() {
        reject(new Error('Failed to load network discovery script: ' + src));
      };
      document.head.appendChild(script);
    });
  }

  subnetScannerLoadPromise = loadDiscoveryScript('static/js/mdns-browser/dns.js')
    .then(function() {
      return loadDiscoveryScript('static/js/mdns-browser/main.js');
    })
    .then(function() {
      if (typeof window.startSubnetScanner !== 'function') {
        throw new Error('Network subnet scanner did not initialize correctly');
      }
    })
    .catch(function(error) {
      subnetScannerLoadPromise = null;
      throw error;
    });

  return subnetScannerLoadPromise;
}
var activePolls = {}; // Active polling cycles, keyed by server UID
var hostPollingPausedForNetworkTest = false;
var pairingCert; // Loads the generated certificate
var myUniqueid;
var api; // The `api` should only be set if we're in a host-specific screen, on the initial screen it should always be null
var isInGame = false; // Flag indicating whether the game has started, initial value is false
var dolbyDecodingModeSupported = false;
var dolbyDecodingModeSupportChecked = false;

// Audio backend preferences hidden by the active streaming-engine / Dolby policy.
// Keep the historical storage key audioBackendBeforeWmp when migrating saved preferences.
var audioBackendBeforeESPlusPlayerPreference = null;
var audioBackendBeforeAc3Preference = null;
var audioBackendPolicyLoadState = { streamingEngine: false, audioBackend: false, ac3AudioMode: false, beforeESPlusPlayer: false, beforeAc3: false };

// Per-operation limits prevent a stalled Tizen subsystem or host request from
// leaving either launch path indefinitely on its loading screen.
const STREAM_OPERATION_TIMEOUTS = {
  hostRefresh: 15000, appLookup: 10000, audioShutdown: 8000,
  hostLaunch: 15000, streamConnection: 15000
};
const SMART_HUB_STARTUP_ERROR_MIN_VISIBLE_MS = 4500;
var streamStartupWatchdogTimeout = null;
var streamStartupFailureHandled = false;
var streamStartupGeneration = 0;

function isStreamStartupCurrent(generation) {
  return generation === streamStartupGeneration && !streamStartupFailureHandled &&
    (!_directSmartHubLaunch || !_directSmartHubLaunchFailed);
}

function withOperationTimeout(operation, timeoutMs, operationName, onTimeout) {
  return new Promise(function(resolve, reject) {
    var settled = false;
    var timeoutId = window.setTimeout(function() {
      if (settled) return;
      settled = true;
      var error = new Error(operationName + ' timed out after ' + timeoutMs + ' ms');
      error.name = 'TimeoutError';
      error.operation = operationName;
      if (typeof onTimeout === 'function') {
        try { onTimeout(error); }
        catch (callbackError) {
          console.warn('%c[index.js, withOperationTimeout]', 'color: gray;', 'Timeout cancellation callback failed:', callbackError);
        }
      }
      reject(error);
    }, timeoutMs);
    Promise.resolve(operation).then(function(value) {
      if (settled) return;
      settled = true;
      window.clearTimeout(timeoutId);
      resolve(value);
    }, function(error) {
      if (settled) return;
      settled = true;
      window.clearTimeout(timeoutId);
      reject(error);
    });
  });
}

function clearStreamStartupWatchdog() {
  if (streamStartupWatchdogTimeout !== null) {
    window.clearTimeout(streamStartupWatchdogTimeout);
    streamStartupWatchdogTimeout = null;
  }
}

function armStreamStartupWatchdog(stage, timeoutMs) {
  clearStreamStartupWatchdog();
  var startupGeneration = streamStartupGeneration;
  streamStartupWatchdogTimeout = window.setTimeout(function() {
    streamStartupWatchdogTimeout = null;
    if (!isStreamStartupCurrent(startupGeneration)) return;
    streamStartupTimeoutFailure(stage);
  }, timeoutMs);
}

function streamStartupTimeoutFailure(stage, customMessage) {
  if (streamStartupFailureHandled) return;
  streamStartupFailureHandled = true;
  streamStartupGeneration++;
  window._streamStartupFailureHandled = true;
  var message = customMessage || (stage === 'video'
    ? t('The host connected, but no video frame was received in time.')
    : (stage === 'initialization'
      ? t('Moonlight could not prepare the saved host and streaming settings in time.')
      : t('The host did not establish the streaming connection in time.')));
  var transitionMessage = stage === 'video'
    ? t('Connection ended. Frame loss detected.')
    : message;
  console.error('%c[index.js, streamStartupTimeoutFailure]', 'color: red;', message);
  if (isInGame) {
    try {
      var stopResult = sendMessage('stopRequest', []);
      if (stopResult && typeof stopResult.catch === 'function') {
        stopResult.catch(function(error) {
          console.warn('%c[index.js, streamStartupTimeoutFailure]', 'color: gray;', 'Could not stop the timed-out stream request:', error);
        });
      }
    } catch (error) {
      console.warn('%c[index.js, streamStartupTimeoutFailure]', 'color: gray;', 'Could not stop the timed-out stream request:', error);
    }
  }

  if (_directSmartHubLaunch) {
    directSmartHubLaunchFailure(transitionMessage);
    return;
  }
  $('#loadingSpinnerTitle').text(t('Connection Error'));
  $('#loadingSpinnerMessage').text(transitionMessage);
  var finishFailure = function() {
    // The full interface will show the error in a modal after it has returned
    // and the transition layer has completely disappeared.
    isInGame = false;
    // Streaming may already have stopped background polling; resume it explicitly.
    startPollingHosts();
    showHosts(function() {
      hideStreamTransitionBackground(function() {
        warningDialog(t('Error'), message, null, true, 'OK', { code: null, apiMessage: null });
      });
    });
  };
  if (typeof showStreamTransitionBackground === 'function') showStreamTransitionBackground(finishFailure);
  else {
    var layer = document.getElementById('stream-transition-layer');
    if (layer) layer.style.display = 'block';
    finishFailure();
  }
}

// Non-timeout host launch failures follow the same transition -> UI -> error-dialog
// sequence, while retaining the host API status code and its original message.
function streamStartupApiFailure(host, message, errorCode, apiMessage) {
  if (streamStartupFailureHandled) return;
  streamStartupFailureHandled = true;
  streamStartupGeneration++;
  window._streamStartupFailureHandled = true;
  clearStreamStartupWatchdog();

  if (_directSmartHubLaunch) {
    directSmartHubLaunchFailure(message);
    return;
  }

  var numericErrorCode = errorCode == null || errorCode === ''
    ? null : Number(errorCode);
  if (!Number.isFinite(numericErrorCode) || numericErrorCode === 0) {
    numericErrorCode = null;
  }
  var rawApiMessage = typeof apiMessage === 'string' ? apiMessage : '';
  $('#loadingSpinnerTitle').text(t('Connection Error'));
  $('#loadingSpinnerMessage').text(message);
  isInGame = false;

  var showErrorDialog = function() {
    hideStreamTransitionBackground(function() {
      warningDialog(t('Error'), message, null, true, 'OK', {
        code: numericErrorCode,
        apiMessage: rawApiMessage
      });
    });
  };

  showApps(host, {
    suppressLoadingSnackbar: true,
    suppressEmptyListSnackbar: true
  }).then(function() {
    Navigation.switch();
    Navigation.change(Views.Apps);
    showErrorDialog();
  }).catch(function(recoveryError) {
    console.error('%c[index.js, streamStartupApiFailure]', 'color: red;', 'Could not restore the Apps view after a launch error:', recoveryError);
    // Fall back to Hosts without showing a secondary snackbar that could obscure the error.
    showHostsMode(true);
    $('#host-grid').stop(true, true).show();
    $('#game-grid').stop(true, true).hide();
    $('#settings-list').hide();
    Navigation.change(Views.Hosts);
    Navigation.switch();
    showErrorDialog();
  });
}

// Shared UI timing: change this single value to tune all interface fades.
const UI_FADE_DURATION_MS = 300;
const STREAM_TRANSITION_ELEMENT_OFFSET_MS = 100;
document.documentElement.style.setProperty('--ui-fade-duration', UI_FADE_DURATION_MS + 'ms');

var uiLayerFadeTimers = Object.create(null);
var uiElementFadeTimers = new WeakMap();

function resolveUiElement(elementOrId) {
  if (typeof elementOrId === 'string') return document.getElementById(elementOrId);
  if (elementOrId && elementOrId.jquery) return elementOrId[0] || null;
  return elementOrId || null;
}

var deferredMainUiActions = [];

function isMainUiLayerActive() {
  var layer = document.getElementById('main-ui-layer');
  if (!layer || layer.classList.contains('ui-inactive') || isInGame === true ||
      getComputedStyle(layer).display === 'none' || uiLayerFadeTimers['main-ui-layer']) {
    return false;
  }
  return (parseFloat(getComputedStyle(layer).opacity) || 0) >= 0.999;
}

function runWhenMainUiActive(callback) {
  if (typeof callback !== 'function') return;
  if (isMainUiLayerActive()) {
    callback();
    return;
  }
  deferredMainUiActions.push(callback);
}

function flushDeferredMainUiActions() {
  if (!isMainUiLayerActive() || deferredMainUiActions.length === 0) return;
  var pendingActions = deferredMainUiActions.splice(0);
  pendingActions.forEach(function(callback) {
    try { callback(); }
    catch (error) {
      console.error('%c[index.js, flushDeferredMainUiActions]', 'color: red;', 'Deferred main UI action failed:', error);
    }
  });
}

function showUiLayer(layerId, callback) {
  var layer = resolveUiElement(layerId);
  if (!layer) { if (typeof callback === 'function') callback(); return; }
  var computedDisplay = getComputedStyle(layer).display;
  var computedOpacity = computedDisplay === 'none' ? 0 : (parseFloat(getComputedStyle(layer).opacity) || 0);
  if (computedDisplay !== 'none' && computedOpacity >= 0.999 && !uiLayerFadeTimers[layerId]) {
    if (typeof callback === 'function') callback();
    if (layer.id === 'main-ui-layer') {
      flushDeferredMainUiActions();
      if (typeof syncScreensaverTimer === 'function') syncScreensaverTimer();
    }
    return;
  }
  if (uiLayerFadeTimers[layerId]) window.clearTimeout(uiLayerFadeTimers[layerId]);
  var token = (layer._uiFadeToken || 0) + 1;
  layer._uiFadeToken = token;
  layer._uiFadeTarget = 'visible';
  // The root class is the authoritative global inactive state for the main Web UI.
  if (layer.id === 'main-ui-layer') layer.classList.remove('ui-inactive');
  layer.style.transition = 'none';
  layer.style.display = 'block';
  layer.setAttribute('aria-hidden', 'false');
  layer.style.opacity = String(computedOpacity);
  layer.offsetWidth;
  layer.style.transition = 'opacity ' + UI_FADE_DURATION_MS + 'ms ease-in-out';
  window.requestAnimationFrame(function() {
    if (layer._uiFadeToken !== token) return;
    layer.style.opacity = '1';
  });
  uiLayerFadeTimers[layerId] = window.setTimeout(function() {
    if (layer._uiFadeToken !== token) return;
    delete uiLayerFadeTimers[layerId];
    if (typeof callback === 'function') callback();
    if (layer.id === 'main-ui-layer') {
      flushDeferredMainUiActions();
      if (typeof syncScreensaverTimer === 'function') syncScreensaverTimer();
    }
  }, UI_FADE_DURATION_MS);
}

function hideUiLayer(layerId, callback, durationMs) {
  var fadeDuration = (typeof durationMs === 'number' && durationMs >= 0) ? durationMs : UI_FADE_DURATION_MS;
  var layer = resolveUiElement(layerId);
  if (!layer || getComputedStyle(layer).display === 'none') {
    if (typeof callback === 'function') callback();
    return;
  }
  if (layer.style.opacity === '0' && uiLayerFadeTimers[layerId] && layer._uiFadeTarget === 'hidden') return;
  if (uiLayerFadeTimers[layerId]) window.clearTimeout(uiLayerFadeTimers[layerId]);
  var token = (layer._uiFadeToken || 0) + 1;
  layer._uiFadeToken = token;
  layer._uiFadeTarget = 'hidden';
  layer.style.transition = 'opacity ' + fadeDuration + 'ms ease-in-out';
  layer.style.opacity = '0';
  uiLayerFadeTimers[layerId] = window.setTimeout(function() {
    if (layer._uiFadeToken !== token) return;
    if (layer.id === 'main-ui-layer') layer.classList.add('ui-inactive');
    layer.style.display = 'none';
    layer.setAttribute('aria-hidden', 'true');
    layer.style.opacity = '';
    delete uiLayerFadeTimers[layerId];
    if (typeof callback === 'function') callback();
  }, fadeDuration);
}

function hideUiLayerImmediately(layerId) {
  var layer = resolveUiElement(layerId);
  if (!layer) return;
  if (uiLayerFadeTimers[layerId]) {
    window.clearTimeout(uiLayerFadeTimers[layerId]);
    delete uiLayerFadeTimers[layerId];
  }
  layer._uiFadeToken = (layer._uiFadeToken || 0) + 1;
  layer._uiFadeTarget = 'hidden';
  layer.style.transition = 'none';
  layer.style.opacity = '0';
  if (layer.id === 'main-ui-layer') layer.classList.add('ui-inactive');
  layer.style.display = 'none';
  layer.setAttribute('aria-hidden', 'true');
}

function fadeInUiElement(elementOrId, displayValue, callback) {
  var element = resolveUiElement(elementOrId);
  if (!element) { if (typeof callback === 'function') callback(); return; }
  var existingTimer = uiElementFadeTimers.get(element);
  var wasDisplayed = getComputedStyle(element).display !== 'none';
  var currentOpacity = wasDisplayed ? (parseFloat(getComputedStyle(element).opacity) || 0) : 0;
  if (wasDisplayed && currentOpacity >= 0.999 && !existingTimer) {
    if (typeof callback === 'function') callback();
    return;
  }
  if (existingTimer) window.clearTimeout(existingTimer);
  var token = (element._uiFadeToken || 0) + 1;
  element._uiFadeToken = token;
  element._uiFadeTarget = 'visible';
  element.classList.add('ui-fade-managed');
  element.style.transition = 'none';
  element.style.display = displayValue || '';
  element.style.opacity = String(currentOpacity);
  element.offsetWidth;
  element.style.transition = 'opacity ' + UI_FADE_DURATION_MS + 'ms ease-in-out';
  window.requestAnimationFrame(function() {
    if (element._uiFadeToken !== token) return;
    element.style.opacity = '1';
  });
  uiElementFadeTimers.set(element, window.setTimeout(function() {
    if (element._uiFadeToken !== token) return;
    uiElementFadeTimers.delete(element);
    if (typeof callback === 'function') callback();
  }, UI_FADE_DURATION_MS));
}

function fadeOutUiElement(elementOrId, callback) {
  var element = resolveUiElement(elementOrId);
  if (!element || getComputedStyle(element).display === 'none') {
    if (typeof callback === 'function') callback();
    return;
  }
  var existingTimer = uiElementFadeTimers.get(element);
  if (element.style.opacity === '0' && existingTimer && element._uiFadeTarget === 'hidden') return;
  if (existingTimer) window.clearTimeout(existingTimer);
  var token = (element._uiFadeToken || 0) + 1;
  element._uiFadeToken = token;
  element._uiFadeTarget = 'hidden';
  element.classList.add('ui-fade-managed');
  element.style.transition = 'opacity ' + UI_FADE_DURATION_MS + 'ms ease-in-out';
  element.style.opacity = '0';
  uiElementFadeTimers.set(element, window.setTimeout(function() {
    if (element._uiFadeToken !== token) return;
    element.style.display = 'none';
    element.style.opacity = '';
    uiElementFadeTimers.delete(element);
    if (typeof callback === 'function') callback();
  }, UI_FADE_DURATION_MS));
}

function hideStreamDiagnosticsLayer(afterHidden) {
  hideUiLayer('stream-diagnostics-layer', function() {
    $('#connection-warnings').css('display', 'none').text('');
    $('#performance-stats').css('display', 'none').text('');
    if (typeof afterHidden === 'function') afterHidden();
  });
}

function showUiDialog(dialogLike) {
  var dlg = resolveUiElement(dialogLike);
  if (!dlg || typeof dlg.show !== 'function') return;
  if (dlg._uiDialogFadeTimer) window.clearTimeout(dlg._uiDialogFadeTimer);
  dlg._uiDialogFadeTimer = null;
  if (dlg.open) {
    var currentOpacity = parseFloat(getComputedStyle(dlg).opacity) || 0;
    dlg.style.transition = 'none';
    dlg.style.opacity = String(currentOpacity);
    dlg.offsetWidth;
    dlg.style.transition = 'opacity ' + UI_FADE_DURATION_MS + 'ms ease-in-out';
    window.requestAnimationFrame(function() { dlg.style.opacity = '1'; });
    return;
  }
  dlg.style.transition = 'none';
  dlg.style.opacity = '0';
  dlg.show();
  dlg.offsetWidth;
  dlg.style.transition = 'opacity ' + UI_FADE_DURATION_MS + 'ms ease-in-out';
  window.requestAnimationFrame(function() { dlg.style.opacity = '1'; });
}

function closeUiDialog(dialogLike, callback) {
  var dlg = resolveUiElement(dialogLike);
  if (!dlg || typeof dlg.close !== 'function' || !dlg.open) {
    if (typeof callback === 'function') callback();
    return;
  }
  if (dlg._uiDialogFadeTimer) return;
  dlg.style.transition = 'opacity ' + UI_FADE_DURATION_MS + 'ms ease-in-out';
  dlg.style.opacity = '0';
  dlg._uiDialogFadeTimer = window.setTimeout(function() {
    dlg._uiDialogFadeTimer = null;
    try { dlg.close(); } finally { dlg.style.opacity = ''; }
    if (typeof callback === 'function') callback();
  }, UI_FADE_DURATION_MS);
}


// Best-effort keyboard capture for the Windows/Meta key. If Tizen's Web Runtime dispatches the
// event to the app, suppress its local browser default while allowing it to bubble to the WASM
// canvas handler for forwarding to the host. This cannot override keys consumed by Tizen system UI.
function preventNativeMetaKeyDefault(event) {
  if (!isInGame || !event) {
    return;
  }

  const keyCode = event.keyCode || event.which;
  const isMetaKey = event.key === 'Meta' || event.key === 'OS' ||
    event.code === 'MetaLeft' || event.code === 'MetaRight' ||
    event.code === 'OSLeft' || event.code === 'OSRight' ||
    keyCode === 91 || keyCode === 92 || keyCode === 224;

  if (isMetaKey && event.cancelable) {
    event.preventDefault();
  }
}

document.addEventListener('keydown', preventNativeMetaKeyDefault, true);
document.addEventListener('keyup', preventNativeMetaKeyDefault, true);

var isDialogOpen = false; // Flag indicating whether the dialog is open, initial value is false
var isPairingInProgress = false; // Flag indicating whether a pairing process is in progress, initial value is false
var wasPairingCanceled = false; // Flag indicating whether the current pairing process was canceled by the user, initial value is false
var isGamepadActive = false; // Flag indicating whether the gamepad input is active, initial value is false
var isGamepadTestDialogOpen = false;
var gamepadTestDialogState = null;
var isClickPrevented = false; // Flag indicating whether the click event should be prevented, initial value is false
var resFpsWarning = false; // Flag indicating whether the video resolution and frame rate warning message has shown, initial value is false
var bitrateWarning = false; // Flag indicating whether the video bitrate warning message has shown, initial value is false
var codecWarning = false; // Flag indicating whether the video codec warning message has shown, initial value is false
var repeatAction = null;
var repeatGamepadIndex = null;
var repeatAnimationFrame = null;
var lastInvokeTime = 0;
var repeatTimeout = null;
var navigationTimeout = null;
var navigationGamepadIndex = null;
const BUILD_TYPE = '__BUILD_TYPE__'; // Placeholder for build type, which should be replaced during the build process
const BUILD_COMMIT = '__BUILD_COMMIT__'; // Placeholder for build commit, which should be replaced during the build process
const OFFICIAL_RELEASE = '__OFFICIAL_RELEASE__' === 'true'; // Only stable GitHub Releases set this flag
const REPO_OWNER = '__REPO_OWNER__'; // Placeholder for repository owner, which should be replaced during the build process
const REPO_NAME = '__REPO_NAME__'; // Placeholder for repository name, which should be replaced during the build process
var _smartHubLocalMessagePort = null; // Local message port for receiving messages from the Smart Hub service
var _smartHubMessagePortListener = null; // Listener ID for the Smart Hub local message port
var _previewApps = {}; // Per-host app cache for Smart Hub Preview: {serverUid: {hostname, address, apps: [{id, title, imageUri}]}}
var _isSmartHubSupported = false; // Flag indicating if Smart Hub Preview is supported on this device

// Experimental direct launch state for Smart Hub app tiles.
var _directSmartHubLaunch = window._directSmartHubLaunch || null;
var _directSmartHubHost = null;
var _directSmartHubHostReady = false;
var _directSmartHubSettingsReady = false;
var _directSmartHubStreamSettings = null;
var _directSmartHubLaunchStarted = false;
var _directSmartHubLaunchFailed = false;

const REPEAT_DELAY = 350; // Repeat delay set to 350ms (milliseconds)
const REPEAT_INTERVAL = 100; // Repeat interval set to 100ms (milliseconds)
const ACTION_THRESHOLD = 0.5; // Threshold for initial navigation set to 0.5
const NAVIGATION_DELAY = 150; // Navigation delay set to 150ms (milliseconds)
const UPDATE_TIMESTAMP = 'lastUpdateCheck'; // Use the update check timestamp key to determine the last update check
const UPDATE_VERSION = 'latestUpdateVersion'; // // Use the update version key to cache the latest version found
const UPDATE_INTERVAL = 24 * 60 * 60 * 1000; // Automatic check for updates interval is set to 24 hours
var startupUpdateCheckPending = false;
var startupUpdateCheckTimeout = null;

// Reflect disabled checkbox state on the visible Material Design Lite switch.
// The checkbox itself is visually hidden, so CSS alone cannot dim the switch row.
function syncDisabledSwitchAppearance(input) {
  if (!input || !input.classList || !input.classList.contains('mdl-switch__input')) {
    return;
  }

  let switchElement = input.parentElement;
  while (switchElement && !switchElement.classList.contains('mdl-switch')) {
    switchElement = switchElement.parentElement;
  }

  if (switchElement) {
    switchElement.classList.toggle('ui-disabled', input.disabled);
  }
}

function initializeDisabledSwitchAppearance() {
  document.querySelectorAll('.mdl-switch__input').forEach(syncDisabledSwitchAppearance);

  if (typeof MutationObserver !== 'function' || !document.body) {
    return;
  }

  const settingsRoot = document.getElementById('settings-list');
  if (!settingsRoot) {
    return;
  }

  const observer = new MutationObserver((mutations) => {
    mutations.forEach((mutation) => {
      if (mutation.type === 'attributes' && mutation.attributeName === 'disabled') {
        syncDisabledSwitchAppearance(mutation.target);
        return;
      }

      if (mutation.type === 'childList') {
        mutation.addedNodes.forEach((node) => {
          if (node.nodeType !== 1) {
            return;
          }
          if (node.matches && node.matches('.mdl-switch__input')) {
            syncDisabledSwitchAppearance(node);
          }
          if (node.querySelectorAll) {
            node.querySelectorAll('.mdl-switch__input').forEach(syncDisabledSwitchAppearance);
          }
        });
      }
    });
  });

  observer.observe(settingsRoot, {
    subtree: true,
    attributes: true,
    attributeFilter: ['disabled'],
    childList: true
  });
}

// Called by the common.js module
function attachListeners() {
  initializeDisabledSwitchAppearance();
  if (!window._streamTransitionResizeListenerAttached) {
    window.addEventListener('resize', resizeStreamTransitionBackground);
    window._streamTransitionResizeListenerAttached = true;
  }
  changeUiModeForWasmLoad();

  // Refresh dynamic Ambilight status after translations are applied.
  // Its description is state-driven and must not be overwritten by data-i18n.
  if (window.i18n && typeof window.i18n.onRefresh === 'function') {
    window.i18n.onRefresh(loadSystemInfo);
    window.i18n.onRefresh(updateAmbilightDescription);
  } else {
    // Fallback if i18n is not present
    loadSystemInfo();
    updateAmbilightDescription();
  }

  const i18nInitPromise = (window.i18n && typeof window.i18n.init === 'function')
    ? window.i18n.init().catch((error) => {
      console.warn('%c[index.js, attachListeners]', 'color: green;', 'Warning: i18n initialization failed: ' + error);
    })
    : Promise.resolve();

  i18nInitPromise.finally(() => {
    if (window.i18n && typeof window.i18n.populateLanguageMenu === 'function') {
      window.i18n.populateLanguageMenu(saveLanguagePreference);
    }

    // Start the optional Ambilight capability probe only after the locale is ready,
    // so its checking and result descriptions are rendered in the selected language.
    initializeAmbilightSupport();

    // Normal initialization reaches this point only after the HTML launch
    // presentation has completed. The localized loading message appears once hosts are ready.
    isStartupLocaleReady = true;
    maybeRestoreUiAfterStartup();
  });

  initIpAddressFields();
  initAmbilightWledIpFields();

  $('#addHostContainer').on('click', addHostDialog);
  $('#settingsBtn').on('click', showSettings);
  $('#refreshHostsBtn').on('click', refreshHosts);
  $('#gamepadTestBtn').on('click', gamepadTestDialog);
  $('#supportBtn').on('click', appSupportDialog);
  $('#goBackBtn').on('click', showHosts);
  installNavigationTooltipActionHiding();
  $('#restoreDefaultsBtn').on('click', restoreDefaultsDialog);
  $('.videoResolutionMenu li').on('click', function() {
    if (!this.hidden && !this.disabled) saveResolution.call(this);
  });
  $('.videoFramerateMenu li').on('click', saveFramerate);
  $('.streamingEngineMenu li').on('click', saveStreamingEngine);
  $('.performanceStatsPositionMenu li').on('click', savePerformanceStatsPosition);
  $('#bitrateSlider').on('input', saveBitrate);
  $('#framePacingSwitch').on('click', saveFramePacing);
  $('#ipAddressFieldModeSwitch').on('click', saveIpAddressFieldMode);
  $('.configSummaryPositionMenu li').on('click', saveConfigSummaryPosition);
  $('#navigationSoundSwitch').on('click', saveNavigationSoundPreference);
  $('#ambilightSwitch').on('click', saveAmbilightPreference);
  $('#ambilightWledIpTextInput, #ambilightWledIpField1, #ambilightWledIpField2, #ambilightWledIpField3, #ambilightWledIpField4')
    .on('change', saveAmbilightWledIp);
  loadAmbilightPreferences();
  $('#streamTransitionBackgroundSwitch').on('click', saveStreamTransitionBackground);
  $('#screensaverSwitch').on('click', saveScreensaverPreference);
  $('.ambientBackgroundMenu li').on('click', saveAmbientBackgroundPreset);
  initializeColorThemeSelector();
  $('#ipAddressTextInput').on('input', updateIpAddressInputValidationState);
  $('#discoverNewHostsAtStartupSwitch').on('click', saveDiscoverNewHostsAtStartup);
  $('#sortAppsListSwitch').on('click', saveSortAppsList);
  $('#sortAppsByUsageSwitch').on('click', saveSortAppsByUsage);
  $('#optimizeGamesSwitch').on('click', saveOptimizeGames);
  $('#quitAppAfterDisconnectSwitch').on('click', saveQuitAppAfterDisconnect);
  $('#removeAllHostsBtn').on('click', deleteAllHostsDialog);
  $('#rumbleFeedbackSwitch').on('click', saveRumbleFeedback);
  $('#mouseEmulationSwitch').on('click', saveMouseEmulation);
  $('#selectHoldStreamMenuSwitch').on('click', saveSelectHoldStreamMenu);
  $('#flipABfaceButtonsSwitch').on('click', saveFlipABfaceButtons);
  $('#flipXYfaceButtonsSwitch').on('click', saveFlipXYfaceButtons);
  $('.audioBackendMenu li').on('click', saveAudioBackend);
  $('.audioConfigMenu li').on('click', saveAudioConfiguration);
  $('#ac3AudioModeSwitch').on('click', saveAc3AudioMode);
  $('.dolbyChannelLayoutMenu li').on('click', saveDolbyChannelLayout);
  $('.dolbyDecodingModeMenu li').on('click', saveDolbyDecodingMode);
  $('#audioSyncSwitch').on('click', saveAudioSync);
  $('#jitterSlider').on('input', saveAudioJitter);
  $('#playHostAudioSwitch').on('click', savePlayHostAudio);
  $('#decryptHostAudioSwitch').on('click', saveDecryptHostAudio);
  $('.videoCodecMenu li').on('click', saveVideoCodec);
  $('.h264LevelMenu li').on('click', saveH264Level);
  $('#hdrModeSwitch').on('click', saveHdrMode);
  $('#fullRangeSwitch').on('click', saveFullRange);
  $('#gameModeSwitch').on('click', saveGameMode);
  $('#unlockAllFpsSwitch').on('click', saveUnlockAllFps);
  $('#optimizeBitrateSwitch').on('click', saveOptimizeBitrate);
  $('#disableWarningsSwitch').on('click', saveDisableWarnings);
  $('#performanceStatsSwitch').on('click', savePerformanceStats);
  $('#navigationGuideBtn').on('click', navigationGuideDialog);
  $('#checkUpdatesBtn').on('click', checkForAppUpdates);
  $('#automaticUpdateChecksSwitch').on('click', saveAutomaticUpdateChecks);
  $('#restartAppBtn').on('click', restartAppDialog);

  const registerMenu = (elementId, view) => {
    $(`#${elementId}`).on('click', () => {
      if (view.isActive()) {
        Navigation.pop();
      } else {
        Navigation.push(view);
      }
    });
  }

  registerMenu('selectStreamingEngine', Views.SelectStreamingEngineMenu);
  registerMenu('selectResolution', Views.SelectResolutionMenu);
  registerMenu('selectFramerate', Views.SelectFramerateMenu);
  registerMenu('selectBitrate', Views.SelectBitrateMenu);
  registerMenu('selectLanguage', Views.SelectLanguageMenu);
  registerMenu('selectAmbientBackground', Views.AmbientBackgroundMenu);
  registerMenu('selectAudioBackend', Views.SelectAudioBackendMenu);
  registerMenu('selectAudio', Views.SelectAudioMenu);
  registerMenu('selectDolbyChannelLayout', Views.SelectDolbyChannelLayoutMenu);
  registerMenu('selectDolbyDecodingMode', Views.SelectDolbyDecodingModeMenu);
  registerMenu('selectAudioJitter', Views.SelectAudioJitterMenu);
  registerMenu('selectCodec', Views.SelectCodecMenu);
  registerMenu('selectH264Level', Views.SelectH264LevelMenu);
  registerMenu('selectPerformanceStatsPosition', Views.SelectPerformanceStatsPositionMenu);
  registerMenu('selectConfigSummaryPosition', Views.ConfigSummaryPositionMenu);

  $(window).resize(fullscreenWasmModule);

  Controller.startWatching();
  updateGamepadTestButtonVisibility();
  window.addEventListener('gamepadconnected', updateGamepadTestButtonVisibility);
  window.addEventListener('gamepaddisconnected', updateGamepadTestButtonVisibility);
  window.addEventListener('gamepadinputchanged', handleGamepadTestInput);
  window.addEventListener('gamepadinputcleared', (e) => {
    const gamepadIndex = e.detail.gamepadIndex;
    if (gamepadTestDialogState && gamepadTestDialogState.gamepadIndex === gamepadIndex) {
      closeGamepadTestDialog();
    }
    updateGamepadTestButtonVisibility();
    stopGamepadRepeat(gamepadIndex);

    // Also cancel a delayed navigation action that was queued by this controller.
    if (navigationGamepadIndex === gamepadIndex) {
      clearTimeout(navigationTimeout);
      navigationTimeout = null;
      navigationGamepadIndex = null;
    }
  });

  window.addEventListener('gamepadinputchanged', (e) => {
    if (isGamepadTestDialogOpen) return;
    isGamepadActive = true;
    const gamepadIndex = e.detail.gamepadIndex;
    const changes = e.detail.changes;
    // Iterate through each change in the gamepad input
    changes.forEach((change) => {
      const { type, index, pressed, value } = change;
      if (type === 'button') {
        // Handle button mapping
        const buttonMapping = {
          0: () => delayedNavigation(() => Navigation.accept(), gamepadIndex),
          1: () => delayedNavigation(() => Navigation.back(), gamepadIndex),
          8: () => delayedNavigation(() => Navigation.switch(), gamepadIndex),
        };
        // Handle D-Pad mapping
        const dPadMapping = {
          12: () => Navigation.up(),
          13: () => Navigation.down(),
          14: () => Navigation.left(),
          15: () => Navigation.right(),
        };
        // Handle button press
        if (pressed) {
          if (buttonMapping[index]) {
            buttonMapping[index]();
            // Clear repeat action and timeout for non-navigation buttons
            stopGamepadRepeat(gamepadIndex);
          } else if (dPadMapping[index]) {
            dPadMapping[index]();
            startGamepadRepeat(dPadMapping[index], gamepadIndex);
          }
        } else {
          // Clear repeat action and timeout if button is released
          stopGamepadRepeat(gamepadIndex);
        }
      } else if (type === 'axis') {
        // Handle axis mapping
        const axisMapping = {
          0: (value) => value < -ACTION_THRESHOLD ? (delayedNavigation(() => Navigation.left(), gamepadIndex), () => Navigation.left()) :
            value > ACTION_THRESHOLD ? (delayedNavigation(() => Navigation.right(), gamepadIndex), () => Navigation.right()) : null,
          1: (value) => value < -ACTION_THRESHOLD ? (delayedNavigation(() => Navigation.up(), gamepadIndex), () => Navigation.up()) :
            value > ACTION_THRESHOLD ? (delayedNavigation(() => Navigation.down(), gamepadIndex), () => Navigation.down()) : null,
        };
        // Handle axis value
        if (axisMapping[index]) {
          const axisValue = axisMapping[index](value);
          if (axisValue && Math.abs(value) > ACTION_THRESHOLD) {
            startGamepadRepeat(axisValue, gamepadIndex);
          } else {
            // Clear this controller's repeat when its axis returns to neutral.
            stopGamepadRepeat(gamepadIndex);
          }
        }
      }
    });
  });
}

function changeUiModeForWasmLoad() {
  // Direct Smart Hub launches bypass the home UI while the normal route is held
  // behind the HTML launch presentation until its animation has completed.
  if (_directSmartHubLaunch) {
    document.documentElement.classList.add('app-starting');
    $('#main-header').hide();
    $('#main-header').children().hide();
    $('#main-content').children().hide();
  }

  // Startup progress is shown in a snackbar, not a full-screen spinner.
  $('#wasmSpinner').hide();
  $('#wasmSpinnerMessage, #loadingSpinnerTitle, #loadingSpinnerMessage').empty();
}

function finishNormalStartupPreparation() {
  isNormalStartupPrepared = true;
}

function loadConfigSummarySettings(callback) {
  // Preload every persisted setting displayed in the summary strip before the
  // normal UI is restored. getData invokes its callback on both success and
  // read failure, so the barrier cannot be held by a missing setting.
  var pending = 10;
  var finished = false;
  function completeOne() {
    pending--;
    if (pending === 0 && !finished) {
      finished = true;
      updateConfigSummaryBar();
      updateHdrControlState();
      updateH264LevelControlState();
      callback();
    }
  }
  function applyMenuValue(key, selector, value) {
    if (value == null) return;
    $(selector + ' li').each(function() {
      if ($(this).data('value') === value) {
        var target = $(selector === '.videoResolutionMenu' ? '#selectResolution' :
          selector === '.videoFramerateMenu' ? '#selectFramerate' :
          selector === '.audioBackendMenu' ? '#selectAudioBackend' :
          selector === '.audioConfigMenu' ? '#selectAudio' : '#selectCodec');
        target.text($(this).text()).attr('data-value', value).data('value', value);
      }
    });
  }
  function applySwitch(key, selector, defaultEnabled) {
    getData(key, function(result) {
      var value = result && result[key];
      var enabled = value == null ? defaultEnabled :
        (value === true || value === 'true' || value === 1);
      var input = document.querySelector(selector);
      if (input) {
        if (input.MaterialSwitch) {
          if (enabled) input.MaterialSwitch.on();
          else input.MaterialSwitch.off();
        } else {
          input.checked = enabled;
        }
      }
      completeOne();
    });
  }

  getData('resolution', function(result) {
    var value = result && result.resolution;
    if (value != null) {
      // Restore the saved preference unchanged. Panel limits are applied only
      // when Settings explicitly queries the display capabilities.
      applyMenuValue('resolution', '.videoResolutionMenu', value);
    }
    completeOne();
  });
  getData('frameRate', function(result) {
    applyMenuValue('frameRate', '.videoFramerateMenu', result && result.frameRate);
    completeOne();
  });
  getData('bitrate', function(result) {
    var value = result && result.bitrate != null ? result.bitrate : '10';
    var slider = document.getElementById('bitrateSlider');
    if (slider) slider.value = value;
    var label = document.getElementById('selectBitrate');
    if (label) label.textContent = value + ' Mbps';
    completeOne();
  });
  getData('audioBackend', function(result) {
    // Restored by loadUserDataCb after the engine and Dolby policy are loaded.
    completeOne();
  });
  getData('audioConfig', function(result) {
    applyMenuValue('audioConfig', '.audioConfigMenu', result && result.audioConfig);
    completeOne();
  });
  getData('videoCodec', function(result) {
    applyMenuValue('videoCodec', '.videoCodecMenu', result && result.videoCodec);
    completeOne();
  });
  applySwitch('optimizeBitrate', '#optimizeBitrateBtn', false);
  applySwitch('hdrMode', '#hdrModeBtn', false);
  applySwitch('ac3AudioMode', '#ac3AudioModeBtn', false);
  applySwitch('gameMode', '#gameModeBtn',
    parseFloat(platformVer) < 9.0 && parseFloat(platformVer) !== 5.5);
}

// Hide navigation tooltips before any top-bar action starts. Keep them hidden
// until both pointer hover and keyboard focus have left the activated button.
function installNavigationTooltipActionHiding() {
  const navigationButtonSelector =
    '#goBackBtn, #settingsBtn, #refreshHostsBtn, #gamepadTestBtn, ' +
    '#supportBtn, #restoreDefaultsBtn, #updateAppBtn';

  document.addEventListener('click', function(event) {
    const button = event.target && event.target.closest
      ? event.target.closest(navigationButtonSelector) : null;
    if (!button) return;

    const tooltip = document.querySelector(
      '#popup-layer .mdl-tooltip[for="' + button.id + '"]'
    );
    if (tooltip) {
      tooltip.classList.add('ui-hidden-for-action');
      tooltip.classList.remove('is-active');
    }
  }, true);

  function restoreTooltipWhenButtonIsInactive(event) {
    const button = event.target && event.target.closest
      ? event.target.closest(navigationButtonSelector) : null;
    if (!button || (event.relatedTarget && button.contains(event.relatedTarget))) return;
    if (button.matches(':hover') || button.matches(':focus')) return;

    const tooltip = document.querySelector(
      '#popup-layer .mdl-tooltip[for="' + button.id + '"]'
    );
    if (tooltip) tooltip.classList.remove('ui-hidden-for-action');
  }

  document.addEventListener('mouseout', restoreTooltipWhenButtonIsInactive, true);
  document.addEventListener('focusout', restoreTooltipWhenButtonIsInactive, true);
}

function maybePrepareNormalStartup() {
  // Normal launch waits for locale and all settings shown in the summary strip.
  // Direct Smart Hub launches retain their existing direct-stream startup path.
  if (_directSmartHubLaunch || !isStartupWindowLoaded || !isStartupLocaleReady ||
      isNormalStartupPreparationStarted || isNormalStartupPrepared) {
    return;
  }

  isNormalStartupPreparationStarted = true;

  var headerTitle = document.getElementById('header-title');
  if (headerTitle) headerTitle.textContent = t('Hosts');
  $('#goBackBtn, #restoreDefaultsBtn').hide();
  $('#settingsBtn, #supportBtn, #updateAppBtn').show();
  $('#settings-list, #game-grid, #wasmSpinner').hide();
  document.documentElement.classList.remove('app-starting');

  var prepareSummaryAndContinue = function() {
    initializeConfigSummaryBar();

    var continueStartup = function() {
      var layout = document.querySelector('.mdl-layout');
      if (layout) void layout.getBoundingClientRect();
      finishNormalStartupPreparation();
      scheduleDeferredNormalStartup();
    };

    if (typeof window.requestAnimationFrame === 'function') {
      window.requestAnimationFrame(continueStartup);
    } else {
      window.setTimeout(continueStartup, 0);
    }
  };

  getData('showConfigSummaryBar', function(previousValue) {
    var storedValue = previousValue && previousValue.showConfigSummaryBar;
    applyConfigSummaryPosition(storedValue == null ? 'bottom' : storedValue);
    configSummaryPreferenceLoaded = true;
    getData('colorTheme', function(themeResult) {
      applyColorTheme(themeResult && themeResult.colorTheme);
      loadConfigSummarySettings(prepareSummaryAndContinue);
    });
  });
}

function scheduleDeferredNormalStartup() {
  if (_directSmartHubLaunch || isDeferredStartupScheduled || isDeferredStartupStarted) return;

  isDeferredStartupScheduled = true;
  // Replace the fixed post-splash delay with visible feedback while startup proceeds.
  deferredStartupTimeout = window.setTimeout(startDeferredNormalStartup, 0);
}

function startDeferredNormalStartup() {
  if (_directSmartHubLaunch || isDeferredStartupStarted) return;

  isDeferredStartupStarted = true;
  deferredStartupTimeout = null;

  // Reveal the Hosts UI before showing startup feedback.
  if (!isStartupUiRestored) {
    isStartupUiRestored = true;
    restoreUiAfterWasmLoad();
  }

  var runStartupWork = function() {
    if (window.componentHandler && typeof window.componentHandler.upgradeDom === 'function') {
      window.componentHandler.upgradeDom();
    }

    // Show startup feedback before beginning the background initialization.
    window.startupEngineSnackbarPromise = snackbarLogPersistent('Starting background services...');
    window.startupEngineSnackbarPromise.then(function() {
      // Restore the cached update badge only after the normal UI is visible and the
      // HTML launch presentation has completed. Keep it aligned with host recovery.
      restoreUpdateBadgeFromCache();
      loadUserData();

      if (typeof window.startNormalStartupWasm === 'function') {
        window.startNormalStartupWasm();
      } else {
        console.error('%c[index.js, startDeferredNormalStartup]', 'color: red;', 'Deferred WebAssembly startup hook is unavailable.');
      }
    });

    probeSmartHubSupport().then(function() {
      handleDeepLink();
      window.addEventListener('appcontrol', handleDeepLink);
    });
  };

  var startStartupWork = function() {
    // Restore saved hosts locally after WebAssembly initialization.
    // Keep this step silent until we know whether there are hosts to check.
    if (typeof window.requestAnimationFrame === 'function') {
      window.requestAnimationFrame(runStartupWork);
    } else {
      window.setTimeout(runStartupWork, 0);
    }
  };

  // Start the grace period only after the browser has had a rendering opportunity
  // for the newly visible Web UI; this avoids competing with the splash transition.
  if (typeof window.requestAnimationFrame === 'function') {
    window.requestAnimationFrame(function() {
      window.setTimeout(startStartupWork, 200);
    });
  } else {
    window.setTimeout(startStartupWork, 200);
  }
}

function maybeRestoreUiAfterStartup() {
  // Repeated calls from HTTP/host callbacks are harmless: index.html made the route decision once.
  if (_directSmartHubLaunch || !isStartupLocaleReady) return;
  maybePrepareNormalStartup();
}

function moduleDidLoad() {
  loadHTTPCerts();
}

// Check if the application is running in a forced Game Mode variant based on Tizen AppMetaData
function checkForceGMVariant() {
  try {
    var metaData = tizen.application.getAppMetaData(appInfo.id);
    // Check if the AppMetaData contains the key-value pair indicating forced Game Mode
    if (metaData && metaData.some(m => m.key === 'http://samsung.com/tv/metadata/use.game.mode' && m.value === 'true')) {
      return true;
    }
  } catch (error) {
    console.warn('%c[index.js, checkForceGMVariant]', 'color: green;', 'Failed to probe AppMetaData for ForceGM check: ', error);
  }
  // Return false if the application is not running in a forced Game Mode variant
  return false;
}

// Formats the build version and marks all builds outside official stable releases as experimental
function getBuildVersion(version) {
  var versionLabel = OFFICIAL_RELEASE ? version : `${version} EXPERIMENTAL`;
  if (!OFFICIAL_RELEASE && BUILD_COMMIT && BUILD_COMMIT !== '__BUILD_COMMIT__') {
    return `${versionLabel} (pre-${BUILD_COMMIT})`;
  }
  return versionLabel;
}

// Stop a repeated navigation action, optionally only when owned by one controller.
function stopGamepadRepeat(gamepadIndex) {
  if (gamepadIndex !== undefined && gamepadIndex !== null &&
      repeatGamepadIndex !== gamepadIndex) {
    return;
  }

  repeatAction = null;
  repeatGamepadIndex = null;
  clearTimeout(repeatTimeout);
  repeatTimeout = null;
  if (repeatAnimationFrame !== null) {
    cancelAnimationFrame(repeatAnimationFrame);
    repeatAnimationFrame = null;
  }
}

// Start one repeated navigation action and associate it with its source controller.
function startGamepadRepeat(action, gamepadIndex) {
  stopGamepadRepeat();
  repeatAction = action;
  repeatGamepadIndex = gamepadIndex;
  lastInvokeTime = Date.now();
  repeatTimeout = setTimeout(() => {
    repeatTimeout = null;
    if (repeatAction) {
      repeatAnimationFrame = requestAnimationFrame(repeatActionHandler);
    }
  }, REPEAT_DELAY);
}

// Handles repeated execution of the current action based on a specified interval.
function repeatActionHandler() {
  repeatAnimationFrame = null;
  if (repeatAction && Date.now() - lastInvokeTime > REPEAT_INTERVAL) {
    repeatAction();
    lastInvokeTime = Date.now();
  }
  if (repeatAction) {
    repeatAnimationFrame = requestAnimationFrame(repeatActionHandler);
  }
}

// Delays navigation-related callback execution after a specified delay.
function delayedNavigation(callback, gamepadIndex) {
  clearTimeout(navigationTimeout);
  navigationGamepadIndex = gamepadIndex;
  navigationTimeout = setTimeout(() => {
    navigationTimeout = null;
    navigationGamepadIndex = null;
    callback();
  }, NAVIGATION_DELAY);
}

// Updates the host status indicator based on the host's online and paired status
function updateHostStatusIndicator(host) {
  // Find the desired host cell using the server UUID
  var hostCell = document.querySelector('#host-' + host.serverUid);
  var indicator = document.querySelector('#host-status-' + host.serverUid);

  // Update the host cell inactive styling class
  if (hostCell) {
    // Check if the host is currently online
    if (host.online) {
      // If the host is online, show it as active
      hostCell.classList.remove('host-cell-inactive');
    } else {
      // If the host is offline, show it as inactive
      hostCell.classList.add('host-cell-inactive');
    }
  }

  if (!indicator) {
    return;
  }

  // Before the first status request has completed, show no icon at all.
  // Once resolved (including timeout/failure), every host has exactly one
  // authoritative visual state: connected, unpaired, or disconnected.
  if (host._statusVerified !== true) {
    indicator.textContent = '';
    indicator.style.display = 'none';
    return;
  }

  indicator.style.display = 'block';
  if (!host.online) {
    indicator.textContent = 'power_off';
  } else if (!host.paired) {
    indicator.textContent = 'lock';
  } else {
    indicator.textContent = 'check';
  }
}

function beginBackgroundPollingOfHost(host, initialStatusAlreadyVerified) {
  if (isInGame === true || hostPollingPausedForNetworkTest) return Promise.resolve();

  var hostUID = host.serverUid;
  var existingCycle = activePolls[hostUID];
  // Repeated starts share the existing initialization and never create another chain.
  if (existingCycle) return existingCycle.initializationPromise || Promise.resolve();

  // The cycle object is also its identity: callbacks from an invalidated cycle
  // cannot act on a newer cycle registered under the same server UID.
  var cycle = { timeoutId: null, initializationPromise: null };
  activePolls[hostUID] = cycle;
  var isCurrentCycle = function() {
    return activePolls[hostUID] === cycle;
  };

  // Count overlapping initial refreshes so network-test quiescence checks do
  // not mistake an older, still-finishing request for an idle host.
  host._backgroundStatusRefreshCount = (host._backgroundStatusRefreshCount || 0) + 1;
  host._backgroundStatusRefreshInProgress = true;

  // Until this refresh (or a successful discovery check) confirms the host,
  // treat a restored/known host as offline rather than showing stale persisted state.
  var refreshServerInfoSucceeded = initialStatusAlreadyVerified === true;
  host._statusVerified = refreshServerInfoSucceeded;
  if (!refreshServerInfoSucceeded) {
    host.online = false;
    updateHostStatusIndicator(host);
  }

  var initialStatusPromise = refreshServerInfoSucceeded
    ? Promise.resolve()
    : Promise.resolve().then(function() {
        return withOperationTimeout(host.refreshServerInfo(), 10000, 'Background host status refresh');
      });

  cycle.initializationPromise = initialStatusPromise.then(function() {
    if (!isCurrentCycle()) return;
    refreshServerInfoSucceeded = true;
    if (DEBUG_MODE) {
      console.log('%c[index.js, beginBackgroundPollingOfHost]', 'color: green;', 'Starting background polling of host ' + host.serverUid, host, '\n' + host.toString());
    }
    host.online = true;
    host._statusVerified = true;
  }, function(failedRefreshInfo) {
    if (isCurrentCycle()) {
      // A failed status refresh means the host cannot currently be confirmed
      // online. Mark it offline without changing its persisted pairing state.
      host.online = false;
      host._statusVerified = true;
      console.warn('%c[index.js, beginBackgroundPollingOfHost]', 'color: orange;', 'Server info refresh failed; marking host offline while preserving its pairing state:', failedRefreshInfo, host.hostname, host.address);
    }
  }).then(function() {
    host._backgroundStatusRefreshCount = Math.max(0, (host._backgroundStatusRefreshCount || 1) - 1);
    host._backgroundStatusRefreshInProgress = host._backgroundStatusRefreshCount > 0;

    if (!isCurrentCycle()) return;
    if (isInGame === true || hostPollingPausedForNetworkTest) return;

    if (refreshServerInfoSucceeded) {
      host._statusVerified = true;
      host._consecutivePollFailures = 0;
    }
    updateHostStatusIndicator(host);

    var scheduleNextPoll = function(delay) {
      if (!isCurrentCycle() || isInGame === true || hostPollingPausedForNetworkTest) return;
      cycle.timeoutId = window.setTimeout(function() {
        cycle.timeoutId = null;
        if (!isCurrentCycle() || isInGame === true || hostPollingPausedForNetworkTest) return;

        host.pollServer(function(returnedHost) {
          if (!isCurrentCycle() || isInGame === true || hostPollingPausedForNetworkTest) return;
          returnedHost._statusVerified = true;
          updateHostStatusIndicator(returnedHost);

          // If the host shown in Apps goes offline, return to Hosts.
          if (!returnedHost.online &&
              api === returnedHost &&
              $('#game-grid').is(':visible') &&
              $('#hosts-carousel-viewport').is(':hidden')) {
            showHostsMode(true);
            Navigation.change(Views.Hosts);
            Navigation.start();
            Navigation.switch();
          }
          // Keep polling this host after returning to Hosts so its recovery
          // can be detected without requiring another user action.
          scheduleNextPoll(5000);
        });
      }, delay);
    };

    // Even an offline result is retried on the regular five-second cadence.
    scheduleNextPoll(5000);
  });

  return cycle.initializationPromise;
}
function startPollingHosts(excludedHost) {
  // Calls from startup/discovery callbacks must not restart polling during a stream or network test.
  if (isInGame === true || hostPollingPausedForNetworkTest) return Promise.resolve();

  var pollPromises = [];
  for (var hostUID in hosts) {
    var host = hosts[hostUID];
    // Apps recovery resumes the selected host only after its box art downloads finish.
    if (host === excludedHost) continue;
    pollPromises.push(beginBackgroundPollingOfHost(host));
  }
  return Promise.all(pollPromises);
}

function endBackgroundPollingOfHost(host) {
  console.log('%c[index.js, endBackgroundPollingOfHost]', 'color: green;', 'Stopping background polling of host ' + host.serverUid, host, '\n' + host.toString());

  // Invalidate this exact cycle. Pending network requests may finish, but
  // their callbacks can no longer schedule another poll.
  var cycle = activePolls[host.serverUid];
  if (cycle) {
    if (cycle.timeoutId !== null) {
      window.clearTimeout(cycle.timeoutId);
      cycle.timeoutId = null;
    }
    delete activePolls[host.serverUid];
  }
}
function stopPollingHosts() {
  for (var hostUID in hosts) {
    endBackgroundPollingOfHost(hosts[hostUID]);
  }
}

function waitForBackgroundHostPollingToFinish(timeoutMs) {
  var startedAt = Date.now();
  var timeout = Math.max(1000, Number(timeoutMs) || 15000);

  return new Promise(function(resolve, reject) {
    var check = function() {
      var busy = false;
      for (var hostUID in hosts) {
        var host = hosts[hostUID];
        if (host._backgroundStatusRefreshInProgress ||
            host._pollInProgress ||
            host._backgroundAppListRefreshInProgress ||
            (Array.isArray(host._pollCompletionCallbacks) && host._pollCompletionCallbacks.length > 0)) {
          busy = true;
          break;
        }
      }

      if (!busy) {
        resolve();
      } else if (Date.now() - startedAt >= timeout) {
        reject(new Error('Background host polling did not finish before the network test.'));
      } else {
        window.setTimeout(check, 50);
      }
    };
    check();
  });
}

function pauseBackgroundHostPollingForNetworkTest() {
  if (hostPollingPausedForNetworkTest) {
    return Promise.reject(new Error('A network test is already running.'));
  }
  hostPollingPausedForNetworkTest = true;
  stopPollingHosts();
  return waitForBackgroundHostPollingToFinish(30000).catch(function(error) {
    hostPollingPausedForNetworkTest = false;
    startPollingHosts();
    throw error;
  });
}

function resumeBackgroundHostPollingAfterNetworkTest() {
  if (!hostPollingPausedForNetworkTest) return;
  hostPollingPausedForNetworkTest = false;
  startPollingHosts();
}

var persistentSnackbarVisible = false;
var persistentSnackbarShownAt = 0;
var snackbarTransitionPromise = Promise.resolve();

function clearQueuedSnackbarNotifications() {
  var snackbarElement = document.getElementById('snackbar');
  var snackbar = snackbarElement && snackbarElement.MaterialSnackbar;
  // MDL queues notifications while its current snackbar is still in the
  // 250 ms exit transition. Remove stale queued messages so they cannot
  // reappear after the operation that owned them has already finished.
  if (snackbar && Array.isArray(snackbar.queuedNotifications_)) {
    snackbar.queuedNotifications_.length = 0;
  }
}

var SNACKBAR_PHASE_COURTESY_MS = 100;
var SNACKBAR_MIN_VISIBLE_MS = 2000;

function waitForSnackbarMinimumVisible() {
  var elapsed = persistentSnackbarShownAt ? Date.now() - persistentSnackbarShownAt : SNACKBAR_MIN_VISIBLE_MS;
  var remaining = Math.max(0, SNACKBAR_MIN_VISIBLE_MS - elapsed);
  return remaining > 0 ? new Promise(function(resolve) {
    window.setTimeout(resolve, remaining);
  }) : Promise.resolve();
}

function waitForSnackbarPhaseCourtesy() {
  return new Promise(function(resolve) {
    window.setTimeout(resolve, SNACKBAR_PHASE_COURTESY_MS);
  });
}

function waitForSnackbarTransform(action) {
  var snackbarElement = document.getElementById('snackbar');
  if (!snackbarElement) {
    if (typeof action === 'function') action();
    snackbarTransitionPromise = Promise.resolve();
    return snackbarTransitionPromise;
  }
  snackbarTransitionPromise = new Promise(function(resolve) {
    var settled = false;
    var fallbackTimer = null;
    function finish(event) {
      if (event && (event.target !== snackbarElement || event.propertyName !== 'transform')) return;
      if (settled) return;
      settled = true;
      snackbarElement.removeEventListener('transitionend', onTransitionEnd);
      if (fallbackTimer !== null) window.clearTimeout(fallbackTimer);
      resolve();
    }
    function onTransitionEnd(event) { finish(event); }
    snackbarElement.addEventListener('transitionend', onTransitionEnd);
    fallbackTimer = window.setTimeout(finish, UI_FADE_DURATION_MS + 120);
    if (typeof action === 'function') action();
  });
  return snackbarTransitionPromise;
}

function snackbarLog(...args) {
  return Promise.resolve(snackbarTransitionPromise).then(function() {
    return dismissPersistentSnackbar();
  }).then(function() {
    return waitForSnackbarPhaseCourtesy();
  }).then(function() {
    clearQueuedSnackbarNotifications();
    setSnackbarProgress(false);
    const translatedMessage = t(...args);
    console.log('%c[index.js, snackbarLog]', 'color: green;', ...args);
    return waitForSnackbarTransform(function() {
      document.querySelector('#snackbar').MaterialSnackbar.showSnackbar({
        message: translatedMessage, timeout: 2500
      });
    });
  });
}

function snackbarLogLong(...args) {
  return Promise.resolve(snackbarTransitionPromise).then(function() {
    return dismissPersistentSnackbar();
  }).then(function() {
    return waitForSnackbarPhaseCourtesy();
  }).then(function() {
    clearQueuedSnackbarNotifications();
    setSnackbarProgress(false);
    const translatedMessage = t(...args);
    console.log('%c[index.js, snackbarLogLong]', 'color: green;', ...args);
    return waitForSnackbarTransform(function() {
      document.querySelector('#snackbar').MaterialSnackbar.showSnackbar({
        message: translatedMessage, timeout: 5000
      });
    });
  });
}

function setSnackbarProgress(isVisible) {
  const snackbarElement = document.getElementById('snackbar');
  if (snackbarElement) snackbarElement.classList.toggle('is-progress', isVisible === true);
}

function snackbarLogPersistent(...args) {
  return Promise.resolve(snackbarTransitionPromise).then(function() {
    return dismissPersistentSnackbar();
  }).then(function() {
    return waitForSnackbarPhaseCourtesy();
  }).then(function() {
    clearQueuedSnackbarNotifications();
    setSnackbarProgress(true);
    const translatedMessage = t(...args);
    console.log('%c[index.js, snackbarLogPersistent]', 'color: green;', ...args);
    persistentSnackbarVisible = true;
    // The caller may start its work only after this slide-in has completed.
    return waitForSnackbarTransform(function() {
      document.querySelector('#snackbar').MaterialSnackbar.showSnackbar({
        message: translatedMessage,
        timeout: 2147483647
      });
    }).then(function() {
      persistentSnackbarShownAt = Date.now();
    });
  });
}

function dismissPersistentSnackbar() {
  clearQueuedSnackbarNotifications();
  if (!persistentSnackbarVisible) return Promise.resolve(snackbarTransitionPromise);
  persistentSnackbarVisible = false;
  return waitForSnackbarMinimumVisible().then(function() {
    return waitForSnackbarTransform(function() {
    const snackbarElement = document.querySelector('#snackbar');
    if (snackbarElement) {
      if (snackbarElement.MaterialSnackbar &&
          typeof snackbarElement.MaterialSnackbar.cleanup_ === 'function') {
        snackbarElement.MaterialSnackbar.cleanup_();
      }
      snackbarElement.classList.remove('mdl-snackbar--active');
      snackbarElement.setAttribute('aria-hidden', 'true');
    }
    }).then(function() {
      // Keep the spinner visible until the snackbar has completely slid out.
      setSnackbarProgress(false);
      persistentSnackbarShownAt = 0;
    });
  });
}

var isManualHostRefreshRunning = false;

// Discover only previously unknown hosts without touching registered-host polling.
function refreshHosts() {
  if (isManualHostRefreshRunning || initialHostListInteractionLocked) return;
  isManualHostRefreshRunning = true;
  lockHostListInteraction();

  var button = document.getElementById('refreshHostsBtn');
  if (button) {
    button.disabled = true;
    button.setAttribute('aria-busy', 'true');
  }

  // The manual scan is an independent discovery operation. It must not
  // stop, restart, or otherwise participate in polling known hosts.
  snackbarLogPersistent('Scanning the local network to discover new hosts...').then(function() {
    return ensureSubnetScannerLoaded().then(function() {
      return startManualSubnetScanner();
    });
  })
    .then(function(newHostCount) {
      isSubnetScanFinished = true;
      runWhenMainUiActive(function() {
        if (newHostCount > 0) {
          snackbarLog('Network scan completed.');
        } else {
          snackbarLog('Network scan completed. No new hosts found.');
        }
      });
    })
    .catch(function(error) {
      console.error('%c[index.js, refreshHosts]', 'color: red;', 'Network scan failed:', error);
      isSubnetScanFinished = true;
      runWhenMainUiActive(function() { snackbarLogLong('Network scan failed.'); });
    })
    .finally(function() {
      isManualHostRefreshRunning = false;
      runWhenMainUiActive(function() {
        if (button) {
          button.disabled = false;
          button.removeAttribute('aria-busy');
        }
        unlockHostListInteraction();
      });
    });
}

// Handle layout elements when displaying the Hosts view
function showHostsMode(deferAmbientBackgroundActivation) {
  $('#background-layer').show();
  if (typeof setNavigationSoundEnabled === 'function') setNavigationSoundEnabled(navigationSoundPreferenceEnabled);
  if (!deferAmbientBackgroundActivation) updateAmbientBackgroundActivation(true);
  console.log('%c[index.js, showHostsMode]', 'color: green;', 'Entering "Show Hosts" mode.');
  $('#main-content').removeClass('settings-view-active');

  hideStreamDiagnosticsLayer();
  $('#header-title').html(t('Hosts'));
  $('#header-logo').show();
  $('#main-header').show();
  $('.mdl-layout__content').show();
  $('.nav-menu-parent').show();
  $('#updateAppBtn').show();
  $('#settingsBtn').show();
  $('#refreshHostsBtn').show();
  $('#supportBtn').show();
  updateGamepadTestButtonVisibility();
  $('#main-content').children().not('#listener, #wasmSpinner').show();
  $('#hosts-carousel-viewport').show();
  $('#host-grid').show();
  $('#settings-list').hide();
  $('#game-grid').hide();
  $('#goBackBtn').hide();
  $('#restoreDefaultsBtn').hide();
  $('#main-content').removeClass('fullscreen');
  $('#listener').removeClass('fullscreen');

  showUiLayer('main-ui-layer');
  Navigation.start();
  Navigation.pop();
}

// Move once from Add Host to the first loaded host using normal navigation.
function selectFirstHostAfterAddHost() {
  var hostGrid = document.getElementById('host-grid');
  if (!hostGrid || typeof Views === 'undefined' || !Views.Hosts || !Views.Hosts.view) {
    return;
  }

  var items = hostGrid.children;
  if (items.length < 2 || items[1].id.indexOf('host-container-') !== 0) {
    return;
  }

  var view = Views.Hosts.view;
  var previousItem = view.current();

  // Do not steal focus if the user has already selected a real host.
  if (previousItem && previousItem !== items[0]) {
    return;
  }

  if (previousItem) unmark(previousItem);
  view.reset();
  Navigation.right();
}

var initialHostListInteractionLocked = false;
var initialHostSnackbarObserver = null;

function lockHostListInteraction() {
  initialHostListInteractionLocked = true;
  Navigation.stop();
  $('#host-grid').addClass('host-list-locked');
}

function unlockHostListInteraction() {
  if (!initialHostListInteractionLocked) return;

  initialHostListInteractionLocked = false;
  $('#host-grid').removeClass('host-list-locked');
  Navigation.start();
  // The initial selection attempt may have happened while Navigation was stopped.
  // Retry now that navigation is active, but only replace the Add Host selection.
  selectFirstHostAfterAddHost();
  Navigation.switch();

  if (initialHostSnackbarObserver) {
    initialHostSnackbarObserver.disconnect();
    initialHostSnackbarObserver = null;
  }
}

function finishInitialHostDiscovery() {
  runWhenMainUiActive(function() {
    unlockHostListInteraction();
    // Start the ambient background only after startup host discovery and network scanning finish.
    $('#main-ui-layer').addClass('ambient-trails-ready');
    updateAmbientBackgroundActivation(true);

    // Keep update notifications out of the initial host-loading/check/discovery sequence.
    if (startupUpdateCheckTimeout === null) {
      startupUpdateCheckTimeout = window.setTimeout(function() {
        startupUpdateCheckTimeout = null;
        checkForAppUpdatesAtStartup();
      }, 10000);
    }
  });
}

var appListInteractionLocked = false;

function lockAppListInteraction() {
  appListInteractionLocked = true;
  Navigation.stop();
  $('#game-grid').addClass('app-list-locked');
}

function unlockAppListInteraction() {
  appListInteractionLocked = false;
  $('#game-grid').removeClass('app-list-locked');
  Navigation.start();
}

var viewLoadingSnackbarTimer = null;

function scheduleViewLoadingSnackbar(message) {
  clearTimeout(viewLoadingSnackbarTimer);
  viewLoadingSnackbarTimer = setTimeout(function() {
    snackbarLogPersistent(message);
  }, 1000);
}

function clearViewLoadingSnackbarTimer() {
  clearTimeout(viewLoadingSnackbarTimer);
  viewLoadingSnackbarTimer = null;
}

// Return to the Hosts grid with a short fade transition.
function showHosts(onShown) {
  Navigation.stop();
  scheduleViewLoadingSnackbar('Loading Hosts...');

  // Fade out the Apps grid, then reveal the Hosts grid.
  $('#game-grid').stop(true, true).fadeOut(UI_FADE_DURATION_MS, function() {
    $('#settings-list').hide();

    // Navigate to the Hosts view once the Apps grid has faded out.
    showHostsMode();

    $('#host-grid').stop(true, true).hide().fadeIn(UI_FADE_DURATION_MS, function() {
      updateGamepadTestButtonVisibility();
      clearViewLoadingSnackbarTimer();
      dismissPersistentSnackbar();
      Navigation.switch();
      if (typeof onShown === 'function') onShown();
    });
  });
}

function restoreUiAfterWasmLoad() {
  loadAmbientBackgroundPreference();

  // Show the localized UI immediately; host restoration and connectivity checks run independently.
  document.documentElement.classList.remove('app-starting');

  // Stop navigation before showing the loading screen
  Navigation.stop();

  $('#main-header').children().not('#goBackBtn, #restoreDefaultsBtn').show();
  $('#main-content').children().not('#listener, #wasmSpinner, #settings-list, #game-grid').show();
  $('#wasmSpinner').hide();

  // Start at the first host when loading the Hosts view.
  Views.Hosts.view.reset();

  // Navigate to the Hosts view and establish the complete initial focus state before paint.
  Navigation.push(Views.Hosts);
  showHostsMode();
  Navigation.switch();
  Navigation.switch();
  lockHostListInteraction();
  updateConfigSummaryBar();

  // Find mDNS host discovered using ServiceFinder (network service discovery)
  // findNvService(function(finder, opt_error) {
  //   if (finder.byService_['_nvstream._tcp']) {
  //     var ips = Object.keys(finder.byService_['_nvstream._tcp']);
  //     for (var i in ips) {
  //       var ip = ips[i];
  //       if (finder.byService_['_nvstream._tcp'][ip]) {
  //         var mDnsDiscoveredHost = new NvHTTP(ip, myUniqueid);
  //         mDnsDiscoveredHost.pollServer(function(returnedDiscoveredHost) {
  //           // Just drop this if the host doesn't respond
  //           if (!returnedDiscoveredHost.online) {
  //             return;
  //           }
  //           if (hosts[returnedDiscoveredHost.serverUid] != null) {
  //             // If we're seeing a host we've already seen before, update it for the current local IP
  //             hosts[returnedDiscoveredHost.serverUid].address = returnedDiscoveredHost.address;
  //             hosts[returnedDiscoveredHost.serverUid].updateExternalAddressIP4();
  //           } else {
  //             // Host must be in the grid before starting background polling
  //             addHostToGrid(returnedDiscoveredHost, true);
  //             beginBackgroundPollingOfHost(returnedDiscoveredHost);
  //           }
  //           saveHosts();
  //         });
  //       }
  //     }
  //   }
  // });
}

// Handles the selection of a host, manages the connection, pairing process, including error handling
function hostChosen(host, onSuccessCallback) {
  // Check if a host is already being opened to prevent concurrent executions
  if (isHostOpening) {
    return;
  }

  // Set the flag to indicate that a host is currently being opened
  isHostOpening = true;

  // Check if a pairing request is already in progress to prevent multiple pairing attempts
  if (isPairingInProgress) {
    // Set the flag to indicate that a host is unable to be opened due to an ongoing pairing request
    isHostOpening = false;
    snackbarLogLong('A pairing request is currently in progress. Please wait for it to timeout or finish before trying again.');
    return;
  }
  localStorage.setItem('lastOpenedHost', host.serverUid);

  // If the host is already offline or fails to connect, notify the user.
  if (!host.online) {
    // Set the flag to indicate that a host is unable to be opened due to being offline or failing to connect
    isHostOpening = false;
    // Only show the Wake PC dialog if the user has explicitly enabled per-host Auto WOL toggle
    if (host.autoWolEnabled === true) {
      autoWolDialog(host, function() {
        // Success callback: The host is now online.
        if (onSuccessCallback) {
          onSuccessCallback();
        } else {
          // Re-call hostChosen(host) to proceed normally.
          hostChosen(host);
        }
      });
    } else {
      // Let the user know what to do to bring the host back online and until then, we'll be back to the previous view.
      console.error('%c[index.js, hostChosen]', 'color: green;', 'Error: Connection to host failed or host is offline!');
      snackbarLogLong('Host %1$s appears to be offline right now. Make sure it is powered on and that the GameStream server is running on the remote host.', host.hostname || t('the host'));
    }
    return;
  }

  api = host;
  // If the host is not yet paired or has been removed from the server, go to the pairing flow.
  if (!host.paired) {
    // Avoid delay from other polling during the pairing operation.
    stopPollingHosts();

    // Continue with the pairing flow
    pairingDialog(host, function() {
      // Resume polling for all hosts after pairing. showApps() will pause the
      // selected host again while its box art downloads are in progress.
      startPollingHosts();
      // After pairing the host, save the host object, show the apps, and navigate to the Apps view
      saveHosts();
      Navigation.push(Views.Apps);
      showApps(host).then(() => {
        // Scroll to the current game row
        Navigation.switch();
        // Switch to Apps view
        Navigation.change(Views.Apps);
      }).catch(console.error).finally(() => {
        // Reset the flag to indicate that a host failed to show apps list
        isHostOpening = false;
      });
    }, function() {
      // Reset the flag to indicate that a host failed due to unsuccessful pairing
      isHostOpening = false;
      // Resume background polling after the pairing flow
      startPollingHosts();
    });
  } else {
    // But if the host is already paired and online, then we show the apps and navigate to the Apps view as usual.
    Navigation.push(Views.Apps);
    showApps(host).then(() => {
      // Scroll to the current game row
      Navigation.switch();
      // Switch to Apps view
      Navigation.change(Views.Apps);
    }).catch(console.error).finally(() => {
      // Reset the flag to indicate that a host failed to show apps list
      isHostOpening = false;
    });
  }
}

// Handles the change of input mode based on the state of the IP address field mode switch
function handleIpAddressFieldMode() {
  // Finds the existing switch, input field, and select fields elements
  const ipAddressFieldModeSwitch = document.getElementById('ipAddressFieldModeSwitch');
  const ipAddressInputField = document.getElementById('ipAddressInputField');
  const ipAddressSelectFields = document.getElementById('ipAddressSelectFields');
  const ipAddressInput = document.getElementById('ipAddressTextInput');
  const textField = ipAddressInput ? ipAddressInput.closest('.mdl-textfield') : null;

  // Checks if the IP address field mode switch is checked
  if (ipAddressFieldModeSwitch.checked) {
    // Hides the input field and shows the select field
    ipAddressInputField.style.display = 'none';
    ipAddressSelectFields.style.display = 'block';
    if (ipAddressInput && textField) {
      ipAddressInput.setCustomValidity('');
      textField.classList.remove('is-invalid');
    }
  } else {
    // Shows the input field and hides the select field
    ipAddressInputField.style.display = 'block';
    ipAddressSelectFields.style.display = 'none';
    updateIpAddressInputValidationState();
  }
  updateAmbilightWledIpInputMode();
}

// Populates the select IP address fields with options from a specified range
function populateSelectFields(element, start, end, selectedValue) {
  // Iterate through the range from start to end
  for (let i = start; i <= end; i++) {
    // Create a new option element
    const option = document.createElement('option');
    // Set the value and text of the option to the current iteration value
    option.value = i;
    option.text = i;
    // Checks if the current iteration value matches the selected value
    if (i === selectedValue) {
      // Mark the option as selected
      option.selected = true;
    }
    // Append the created option to the select element
    element.appendChild(option);
  }
}

// Initialize the IP address select fields with predefined values
function initIpAddressFields() {
  // Find the existing select fields elements and set the values
  const ipAddressFields = [
    { element: 'ipAddressField1', selectedValue: 192 },
    { element: 'ipAddressField2', selectedValue: 168 },
    { element: 'ipAddressField3', selectedValue: 0 },
    { element: 'ipAddressField4', selectedValue: 0 },
  ];

  // Populate each IP address field with the selected values
  ipAddressFields.forEach(ipAddressField => {
    const element = document.getElementById(ipAddressField.element);
    populateSelectFields(element, 0, 255, ipAddressField.selectedValue);
  });
}

function refreshPanelResolutionCapabilities() {
  var productInfo = typeof webapis !== 'undefined' && webapis.productinfo;
  var supports4k = null;
  var supports8k = null;

  // A missing API, an exception, or an unexpected return value means unknown,
  // not unsupported. Only an explicit false result may impose a restriction.
  if (productInfo && typeof productInfo.isUdPanelSupported === 'function') {
    try {
      var result4k = productInfo.isUdPanelSupported();
      if (result4k === true || result4k === false) supports4k = result4k;
    } catch (error) {
      console.warn('%c[index.js, refreshPanelResolutionCapabilities]', 'color: gray;', 'Could not determine UHD panel capability:', error);
    }
  }
  if (productInfo && typeof productInfo.is8KPanelSupported === 'function') {
    try {
      var result8k = productInfo.is8KPanelSupported();
      if (result8k === true || result8k === false) supports8k = result8k;
    } catch (error) {
      console.warn('%c[index.js, refreshPanelResolutionCapabilities]', 'color: gray;', 'Could not determine 8K panel capability:', error);
    }
  }

  is4kPanel = supports4k;
  is8kPanel = supports8k;
  panelCapabilitiesChecked = true;

  if (is8kPanel === true || is8kPanel === null) {
    // Unknown 8K capability must not hide the option from the user.
    maxSupportedWidth = 7680;
    maxSupportedHeight = 4320;
  } else if (is4kPanel === true || is4kPanel === null) {
    // Explicitly not 8K, but UHD is either confirmed or still unknown.
    maxSupportedWidth = 3840;
    maxSupportedHeight = 2160;
  } else {
    // Both UHD and 8K have been explicitly reported as unsupported.
    maxSupportedWidth = 1920;
    maxSupportedHeight = 1080;
  }

  console.log('%c[index.js, refreshPanelResolutionCapabilities]', 'color: green;', 'Panel resolution capability:', {
    is4kPanel: is4kPanel,
    is8kPanel: is8kPanel,
    maxSupportedWidth: maxSupportedWidth,
    maxSupportedHeight: maxSupportedHeight
  });
}

function refreshHdrCapability() {
  isHdrCapable = null;
  try {
    if (typeof webapis !== 'undefined' && webapis.avinfo &&
        typeof webapis.avinfo.isHdrTvSupport === 'function') {
      var result = webapis.avinfo.isHdrTvSupport();
      if (result === true || result === false) isHdrCapable = result;
    }
  } catch (error) {
    // An unavailable or failing query is unknown, not proof that HDR is unsupported.
    console.warn('%c[index.js, refreshHdrCapability]', 'color: gray;', 'Could not determine HDR capability:', error);
  }

  console.log('%c[index.js, refreshHdrCapability]', 'color: green;', 'HDR capable:', isHdrCapable);
}

function filterUnsupportedResolutions() {
  $('.videoResolutionMenu li').each(function() {
    var resData = $(this).data('value');
    if (!resData) return;

    var resWidth = parseInt(resData.split(':')[0], 10);
    var unsupported = !Number.isFinite(resWidth) || resWidth > maxSupportedWidth;

    // Hide unsupported choices instead of leaving disabled entries in the menu.
    this.hidden = unsupported;
    this.disabled = unsupported;
    $(this).attr('aria-disabled', unsupported ? 'true' : 'false');
    $(this).toggleClass('unsupported-resolution', unsupported);
  });
}

function updateVideoResolutionAvailability() {
  filterUnsupportedResolutions();

  var selectedResolution = $('#selectResolution').attr('data-value') || $('#selectResolution').data('value');
  var selectedWidth = selectedResolution ? parseInt(selectedResolution.split(':')[0], 10) : 0;

  if (!selectedResolution || !Number.isFinite(selectedWidth) || selectedWidth > maxSupportedWidth) {
    var fallbackResolution = maxSupportedWidth >= 3840 ? '3840:2160' : '1920:1080';
    var fallbackOption = $('.videoResolutionMenu li').filter(function() {
      return $(this).data('value') === fallbackResolution;
    }).first();

    if (fallbackOption.length && !fallbackOption[0].hidden) {
      $('#selectResolution')
        .text(fallbackOption.text())
        .attr('data-value', fallbackResolution)
        .data('value', fallbackResolution);
      storeData('resolution', fallbackResolution, null);
      updateConfigSummaryBar();
    }
  }
}

function isValidPort(port) {
  return Number.isInteger(port) && port > 0 && port <= 65535;
}

function isValidHostAddress(address) {
  if (!address) {
    return false;
  }

  // IPv4 regex
  const ipv4Regex = /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;
  
  // IPv6 regex
  const ipv6Regex = /^(([0-9a-fA-F]{1,4}:){7,7}[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,7}:|([0-9a-fA-F]{1,4}:){1,6}:[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,5}(:[0-9a-fA-F]{1,4}){1,2}|([0-9a-fA-F]{1,4}:){1,4}(:[0-9a-fA-F]{1,4}){1,3}|([0-9a-fA-F]{1,4}:){1,3}(:[0-9a-fA-F]{1,4}){1,4}|([0-9a-fA-F]{1,4}:){1,2}(:[0-9a-fA-F]{1,4}){1,5}|[0-9a-fA-F]{1,4}:((:[0-9a-fA-F]{1,4}){1,6})|:((:[0-9a-fA-F]{1,4}){1,7}|:))$/;
  
  // Hostname regex (FQDN or short hostname)
  const hostnameRegex = /^(([a-zA-Z0-9]|[a-zA-Z0-9][a-zA-Z0-9\-]*[a-zA-Z0-9])\.)*([A-Za-z0-9]|[A-Za-z0-9][A-Za-z0-9\-]*[A-Za-z0-9])$/;

  return ipv4Regex.test(address) || ipv6Regex.test(address) || hostnameRegex.test(address);
}

function isPotentialAddressWithOptionalPort(rawInput) {
  const input = (rawInput || '').trim();
  if (!input) {
    return true;
  }

  // Relaxed validation while typing: allow alphanumeric, dots, hyphens, colons, and brackets
  return /^[a-zA-Z0-9.:\[\]\-]*$/.test(input);
}

function updateIpAddressInputValidationState() {
  const ipAddressInput = document.getElementById('ipAddressTextInput');
  const textField = ipAddressInput ? ipAddressInput.closest('.mdl-textfield') : null;
  const usingSelectFields = $('#ipAddressFieldModeSwitch').prop('checked');

  if (!ipAddressInput || !textField || usingSelectFields) {
    return;
  }

  const inputValue = ipAddressInput.value;
  const isPotentialValue = isPotentialAddressWithOptionalPort(inputValue);

  if (!inputValue.trim()) {
    ipAddressInput.setCustomValidity('');
    textField.classList.remove('is-invalid');
    return;
  }

  if (isPotentialValue) {
    ipAddressInput.setCustomValidity('');
    textField.classList.remove('is-invalid');
  } else {
    ipAddressInput.setCustomValidity('invalid-host');
    textField.classList.add('is-invalid');
  }
}

function parseHostAndPortInput(rawInput) {
  const input = (rawInput || '').trim();

  if (!input) {
    return { valid: false, error: t('Please enter a valid host address!') };
  }

  let hostPart = input;
  let portPart = '';

  // Check for IPv6 with port like [fe80::1]:47989
  const ipv6PortMatch = input.match(/^\[(.*)\]:(\d+)$/);
  // Check for IPv6 surrounded by brackets without port like [fe80::1]
  const ipv6BracketMatch = input.match(/^\[(.*)\]$/);
  
  if (ipv6PortMatch) {
    hostPart = ipv6PortMatch[1];
    portPart = ipv6PortMatch[2];
  } else if (ipv6BracketMatch) {
    hostPart = ipv6BracketMatch[1];
  } else {
    // Check if it has a port but is not an IPv6 address
    const firstColon = input.indexOf(':');
    const lastColon = input.lastIndexOf(':');
    
    if (firstColon > 0 && firstColon === lastColon) {
      hostPart = input.substring(0, firstColon).trim();
      portPart = input.substring(firstColon + 1).trim();
    } else {
      hostPart = input;
    }
  }

  if (!hostPart) {
    return { valid: false, error: t('Please enter a valid host address!') };
  }

  if (!isValidHostAddress(hostPart)) {
    return { valid: false, error: t('Please enter a valid host address!') };
  }

  if (portPart) {
    if (!/^\d{1,5}$/.test(portPart)) {
      return { valid: false, error: t('Port must be a numeric value between 1 and 65535!') };
    }

    const parsedPort = parseInt(portPart, 10);
    if (!isValidPort(parsedPort)) {
      return { valid: false, error: t('Please enter a valid port number between 1 and 65535!') };
    }

    return { valid: true, addr: hostPart, port: parsedPort };
  }

  return { valid: true, addr: hostPart, port: 47989 };
}

// If the `Add Host +` is selected on the host grid, then show the 
// Add Host dialog to enter the connection details for the host PC
function addHostDialog() {
  if (typeof window.abortSubnetScan === 'function') window.abortSubnetScan();
  // Find the existing overlay and dialog elements
  var addHostOverlay = document.querySelector('#addHostDialogOverlay');
  var addHostDialog = document.querySelector('#addHostDialog');
  
  // Show the dialog and push the view
  fadeInUiElement(addHostOverlay, 'flex');
  showUiDialog(addHostDialog);
  isDialogOpen = true;
  Navigation.push(Views.AddHostDialog);
  updateIpAddressInputValidationState();
  // Remove focus from any current active element
  document.activeElement.blur();

  // Cancel the operation if the Cancel button is pressed
  $('#cancelAddHost').off('click');
  $('#cancelAddHost').on('click', function() {
    console.log('%c[index.js, addHostDialog]', 'color: green;', 'Closing app dialog and returning.');
    fadeOutUiElement(addHostOverlay);
    closeUiDialog(addHostDialog);
    isDialogOpen = false;
    Navigation.pop();
    // Re-enable the Continue button after canceling the operation
    $('#continueAddHost').removeClass('mdl-button--disabled').prop('disabled', false);
    // Clear the input field after canceling the operation
    $('#ipAddressTextInput').val('');
    updateIpAddressInputValidationState();
    initIpAddressFields();
  });

  // Send a connection request if the Continue button is pressed
  $('#continueAddHost').off('click');
  $('#continueAddHost').on('click', function() {
    console.log('%c[index.js, addHostDialog]', 'color: green;', 'Adding host, closing app dialog, and returning.');
    // Get the IP address value from the input field or select fields
    var inputHost;
    if ($('#ipAddressFieldModeSwitch').prop('checked')) {
      var ipAddressField1 = $('#ipAddressField1').val();
      var ipAddressField2 = $('#ipAddressField2').val();
      var ipAddressField3 = $('#ipAddressField3').val();
      var ipAddressField4 = $('#ipAddressField4').val();
      inputHost = ipAddressField1 + '.' + ipAddressField2 + '.' + ipAddressField3 + '.' + ipAddressField4;
    } else {
      inputHost = $('#ipAddressTextInput').val();
    }
    // Get the IP address and port from the input and validate them
    var parsedHostInput;
    if ($('#ipAddressFieldModeSwitch').prop('checked')) {
      // Select fields only provide IP octets, so always use default HTTP port
      parsedHostInput = { valid: true, addr: inputHost, port: 47989 };
    } else {
      parsedHostInput = parseHostAndPortInput(inputHost);
    }
    // If the input is invalid, show an error message and return early
    if (!parsedHostInput.valid) {
      snackbarLog(parsedHostInput.error);
      return;
    }
    // Disable the Continue button to prevent multiple connection requests
    setTimeout(() => {
      // Add disabled state after 2 seconds
      $('#continueAddHost').addClass('mdl-button--disabled').prop('disabled', true);
      Navigation.switch();
      // Re-enable the Continue button after 12 seconds
      setTimeout(() => {
        $('#continueAddHost').removeClass('mdl-button--disabled').prop('disabled', false);
        Navigation.switch();
      }, 12000);
    }, 2000);
    // Send a connection request to the Host object based on the given IP address
    var _nvhttpHost = new NvHTTP(parsedHostInput.addr, myUniqueid, parsedHostInput.addr);
    _nvhttpHost.httpPort = parsedHostInput.port;
    console.log('%c[index.js, addHostDialog]', 'color: green;', 'Sending connection request to host address ' + _nvhttpHost.hostname);
    _nvhttpHost.refreshServerInfoAtAddress(parsedHostInput.addr).then(function(success) {
      snackbarLogPersistent('Connecting to %1$s...', _nvhttpHost.hostname);
      // Close the dialog if the user has provided the IP address
      console.log('%c[index.js, addHostDialog]', 'color: green;', 'Closing app dialog and returning.');
      fadeOutUiElement(addHostOverlay);
      closeUiDialog(addHostDialog);
      isDialogOpen = false;
      Navigation.pop();
      // Avoid delay from other polling during pairing
      stopPollingHosts();
      // Check if we already have record of this host. If so, we'll
      // need the PPK string to ensure our pairing status is accurate.
      if (hosts[_nvhttpHost.serverUid] != null) {
        // Update the addresses
        hosts[_nvhttpHost.serverUid].address = _nvhttpHost.address;
        hosts[_nvhttpHost.serverUid].userEnteredAddress = _nvhttpHost.userEnteredAddress;
        hosts[_nvhttpHost.serverUid].httpPort = _nvhttpHost.httpPort;
        // Use the host in the array directly to ensure the PPK propagates after pairing
        pairingDialog(hosts[_nvhttpHost.serverUid], function() {
          saveHosts();
          startPollingHosts();
        }, function() {
          // Resume background polling after the pairing flow
          startPollingHosts();
        });
      } else {
        pairingDialog(_nvhttpHost, function() {
          // Add the host to the grid after successful pairing
          addHostToGrid(_nvhttpHost);
          saveHosts();
          startPollingHosts();
        }, function() {
          // Resume background polling after the pairing flow
          startPollingHosts();
        });
      }
      // Re-enable the Continue button after successful processing
      $('#continueAddHost').removeClass('mdl-button--disabled').prop('disabled', false);
      // Clear the input field after successful processing
      $('#ipAddressTextInput').val('');
      updateIpAddressInputValidationState();
      initIpAddressFields();
    }.bind(this), function(failure) {
      console.error('%c[index.js, addHostDialog]', 'color: green;', 'Error: Failed API object:\n', _nvhttpHost, '\n' + _nvhttpHost.toString()); // Logging both object (for console) and toString-ed object (for text logs)
      snackbarLogLong('Failed to connect to %1$s. Ensure Sunshine is running on your host PC or GameStream is enabled in GeForce Experience SHIELD settings.', _nvhttpHost.hostname || t('the host'));
      // Re-enable the Continue button after failure processing
      $('#continueAddHost').removeClass('mdl-button--disabled').prop('disabled', false);
      // Clear the input field after failure processing
      $('#ipAddressTextInput').val('');
      updateIpAddressInputValidationState();
      initIpAddressFields();
    }.bind(this));
  });
}

// Show the Pairing dialog before pairing with the given NvHTTP host object. Returns whether the pairing was successful or failed.
function pairingDialog(nvhttpHost, onSuccess, onFailure) {
  if (typeof window.abortSubnetScan === 'function') window.abortSubnetScan();
  if (!onFailure) {
    onFailure = function() {}
  }

  if (!pairingCert) {
    console.warn('%c[index.js, pairingDialog]', 'color: green;', 'Warning: Pairing certificate is not generated yet. Please ensure Wasm is initialized properly!');
    snackbarLogLong('Something went wrong with the pairing certificate. Please try pairing with the host PC again.');
    onFailure();
    return;
  }

  nvhttpHost.pollServer(function(returnedNvHTTPHost) {
    if (!returnedNvHTTPHost.online) {
      console.error('%c[index.js, pairingDialog]', 'color: green;', 'Error: Failed to connect to ' + nvhttpHost.hostname + '. Ensure your host PC is online!', nvhttpHost, '\n' + nvhttpHost.toString()); // Logging both object (for console) and toString-ed object (for text logs)
      snackbarLogLong('Failed to connect to %1$s. Ensure Sunshine is running on your host PC or GameStream is enabled in GeForce Experience SHIELD settings.', nvhttpHost.hostname || t('the host'));
      onFailure();
      return;
    }

    if (nvhttpHost.paired) {
      onSuccess();
      return;
    }

    if (nvhttpHost.currentGame != 0) {
      snackbarLogLong('%1$s is currently in a game session. Please quit the running app or restart the computer, then try again.', nvhttpHost.hostname);
      onFailure();
      return;
    }

    // Find the existing overlay and dialog elements
    var pairingOverlay = document.querySelector('#pairingDialogOverlay');
    var pairingDialog = document.querySelector('#pairingDialog');
    var randomNumber = String('0000' + cryptoRand(10000)).slice(-4);

    // Rollback to 'Cancel' button text when opening
    $('#cancelPairing').text('Cancel');

    // Change the dialog text element to include the random PIN number
    $('#pairingDialogText').html(
      t('Please enter the following PIN on the target PC: %1$s<br><br>', randomNumber) + 
      t('If your host PC is running Sunshine (all GPUs), navigate to the Sunshine Web UI to enter the PIN.<br><br>') + 
      t('Alternatively, if your host PC has NVIDIA GameStream (NVIDIA-only), navigate to the GeForce Experience to enter the PIN.<br><br>') + 
      t('This dialog will close once the pairing is complete.')
    );

    // Show the dialog and push the view
    fadeInUiElement(pairingOverlay, 'flex');
    showUiDialog(pairingDialog);
    isDialogOpen = true;
    Navigation.push(Views.PairingDialog);

    isPairingInProgress = true;
    wasPairingCanceled = false;

    // Cancel the operation if the Cancel button is pressed
    $('#cancelPairing').off('click');
    $('#cancelPairing').on('click', function() {
      console.log('%c[index.js, pairingDialog]', 'color: green;', 'Closing app dialog and returning.');
      sendMessage('cancelRequest', []);
      wasPairingCanceled = true;
      fadeOutUiElement(pairingOverlay);
      closeUiDialog(pairingDialog);
      isDialogOpen = false;
      Navigation.pop();
    });

    console.log('%c[index.js, pairingDialog]', 'color: green;', 'Sending pairing request to ' + nvhttpHost.hostname + ' with PIN ' + randomNumber);
    nvhttpHost.pair(randomNumber).then(function() {
      isPairingInProgress = false;
      snackbarLog('Successfully paired with %1$s', nvhttpHost.hostname);
      // Close the dialog if the pairing was successful
      console.log('%c[index.js, pairingDialog]', 'color: green;', 'Closing app dialog and returning.');
      fadeOutUiElement(pairingOverlay);
      closeUiDialog(pairingDialog);
      isDialogOpen = false;
      Navigation.pop();
      onSuccess();
    }, function(failedPairing) {
      isPairingInProgress = false;
      if (wasPairingCanceled) {
        console.log('%c[index.js, pairingDialog]', 'color: green;', 'Ignored pairing failure due to cancellation.');
        // Still let the caller recover, so the host can be selected again and the hosts are polled again
        onFailure();
        return;
      }
      console.error('%c[index.js, pairingDialog]', 'color: green;', 'Error: Failed API object:\n', nvhttpHost, '\n' + nvhttpHost.toString()); // Logging both object (for console) and toString-ed object (for text logs)
      snackbarLog('Failed to pair with %1$s', nvhttpHost.hostname);
      // Keep the modal opened, but change the button for "Close"
      $('#cancelPairing').text('Close');

      // If the host is already in a streaming session or failed during pairing,
      // change the dialog text element to include the hostname and display the returned error message
      if (nvhttpHost.currentGame != 0) {
        $('#pairingDialogText').html(t('Error: %1$s is currently busy!<br><br>You must stop the running app in order to pair with the host.', escapeHTML(nvhttpHost.hostname)));
      } else {
        $('#pairingDialogText').html(t('Error: Failed to pair with %1$s.<br><br>Please, try pairing with the host again.', escapeHTML(nvhttpHost.hostname)));
      }
      onFailure();
    });
  });
}

function autoWolDialog(host, onSuccess, onCancel) {
  var autoWolOverlay = document.querySelector('#autoWolDialogOverlay');
  var autoWolDialog = document.querySelector('#autoWolDialog');

  // Reset the button text to their default state
  $('#cancelAutoWol').html(t('Cancel'));
  Views.AutoWolDialog.view.reset();

  // Set the checkbox state based on the host's autoWolEnabled property
  if (host.autoWolEnabled === true) {
    document.querySelector('#autoWolCheckboxBtn').MaterialSwitch.on();
  } else {
    document.querySelector('#autoWolCheckboxBtn').MaterialSwitch.off();
  }

  // Attach onchange event listener to the Auto WOL checkbox
  $('#autoWolCheckboxSwitch').off('change');
  $('#autoWolCheckboxSwitch').on('change', function() {
    host.autoWolEnabled = $(this).prop('checked');
    console.log('%c[index.js, autoWolDialog]', 'color: green;', 'Host autoWolEnabled set to: ' + host.autoWolEnabled);
    saveHosts();
  });

  fadeInUiElement(autoWolOverlay, 'flex');
  showUiDialog(autoWolDialog);
  isDialogOpen = true;
  Navigation.push(Views.AutoWolDialog);
  focusElement('cancelAutoWol');

  var isPolling = true;
  var pollTimeout = null;
  var hasFailed = false;
  // Auto WOL owns its discovery lifecycle; cancelling it must not abort
  // startup discovery or the independent manual subnet scan.
  var autoWolScanState = {
    cancelled: false,
    abortController: null,
    promise: null
  };

  var stopPollingTasks = function() {
    isPolling = false;
    if (pollTimeout) clearTimeout(pollTimeout);
    if (typeof abortAutoWolSubnetScan === 'function') {
      abortAutoWolSubnetScan(autoWolScanState);
    }
  };

  var cleanup = function() {
    stopPollingTasks();
    fadeOutUiElement(autoWolOverlay);
    closeUiDialog(autoWolDialog);
    isDialogOpen = false;
    Navigation.pop();
  };

  var sendWakeRequest = function() {
    $('#autoWolDialogText').html(t('Sending a Wake-on-LAN request to %1$s...', escapeHTML(host.hostname)));

    host.sendWOL().then(function(msg) {
      if (msg) console.log('%c[index.js, autoWolDialog]', 'color: green;', msg);
      $('#autoWolDialogText').html(
        t('Wake-on-LAN request sent to %1$s.', escapeHTML(host.hostname)) + '<br><br>' +
        t('Waiting for the host PC to wake up and connect to the network...')
      );

      var pollLoop = function() {
        if (!isPolling) return;

        // Search only for this host identity. The Auto WOL scanner has its own
        // cancellation state and never registers or updates any other host.
        var scanPromise = ensureSubnetScannerLoaded().then(function() {
          return startAutoWolSubnetScanner(host, autoWolScanState);
        }).catch(function(e) {
          console.warn('%c[index.js, autoWolDialog]', 'color: orange;', 'Subnet scan failed during WOL wait, continuing to poll:', e);
        });

        scanPromise.then(function() {
          if (!isPolling) return; // In case the dialog was closed during the scan
          
          host.pollServer(function(returnedHost) {
            if (!isPolling) return; // In case the dialog was closed while pollServer was running

            if (returnedHost.online) {
              cleanup();
              if (onSuccess) onSuccess();

              // Instantly update the UI to remove the offline styling
              updateHostStatusIndicator(returnedHost);
            } else {
              // Wait 1 second AFTER the previous poll finished before starting the next one.
              // This prevents rapid CPU spinning if the network drops temporarily and requests 
              // fail instantly, while still keeping the WOL check feeling responsive.
              pollTimeout = setTimeout(pollLoop, 1000);
            }
          });
        });
      };

      // Kick off the sequential polling loop
      pollLoop();

    }).catch(function(error) {
      hasFailed = true;
      stopPollingTasks();

      var errorMessage = typeof error === 'string' ? error : (error && error.message ? error.message : 'Unknown error');
      var translatedError = replaceKnownWolErrorLabels(errorMessage);
      $('#autoWolDialogText').html(
        t('Failed to send Wake-on-LAN request to %1$s!', escapeHTML(host.hostname)) + '<br><br>' +
        t('Error: %1$s', translatedError)
      );
      // Change the button text to "OK" to indicate that the user can acknowledge the failure
      $('#cancelAutoWol').html(t('OK'));
    });
  };

  $('#cancelAutoWol').off('click');
  $('#cancelAutoWol').on('click', function() {
    if (hasFailed) {
      console.error('%c[index.js, autoWolDialog]', 'color: green;', 'Wake-on-LAN request failed: ' + errorMessage);
    } else {
      console.log('%c[index.js, autoWolDialog]', 'color: green;', 'Wake-on-LAN request canceled by user.');
    }
    cleanup();
    if (onCancel) onCancel();
  });

  // Send wake request immediately since user explicitly opened the Wake PC menu
  sendWakeRequest();
}

// Add the new NvHTTP Host object inside the host grid
function addHostToGrid(host, ismDNSDiscovered) {
  // Create the host container with the appropriate attributes for the host card
  var hostContainer = $('<div>', {
    id: 'host-container-' + host.serverUid,
    class: 'host-container mdl-card mdl-shadow--4dp',
    role: 'link',
    tabindex: 0,
    'aria-label': host.hostname
  });

  // Create the host cell to serve as a holder for the host box
  var hostCell = $('<div>', {
    id: 'host-' + host.serverUid,
    class: 'mdl-card__title mdl-card--expand'
  });

  // Create the host title wrapper to hold the host title text
  var hostTitle = $('<div>', {
    class: 'host-title mdl-card__title-text'
  });

  // Create the host text placeholder that will contain the host name
  var hostText = $('<span>', {
    class: 'host-text',
    text: host.hostname
  });

  // Create the host menu button with the appropriate attributes for the host menu
  var hostMenu = $('<div>', {
    id: 'hostMenuButton-' + host.serverUid,
    class: 'host-menu',
    role: 'button',
    tabindex: 0,
    'aria-label': host.hostname + ' menu'
  });

  // Create the host center icon to indicate the host's status (online/offline/unpaired)
  var hostStatusIndicator = $('<i>', {
    id: 'host-status-' + host.serverUid,
    class: 'material-symbols-outlined host-center-icon'
  });

  // Append the host text to the host title wrapper
  hostTitle.append(hostText);

  // Handle animation state based on host title text length
  if (host.hostname.length <= 26) {
    // For host title text of 26 characters or less, disable scrolling text animation
    hostText.addClass('disable-animation');
  } else {
    // For host title text longer than 26 characters, enable scrolling text animation
    hostText.removeClass('disable-animation');
  }

  // Append the host title to the host cell
  hostCell.append(hostTitle);

  // Append the host cell to the host container
  hostContainer.append(hostCell);

  // Append the host menu button to the host container
  hostContainer.append(hostMenu);

  // Append the host status indicator to the host container
  hostContainer.append(hostStatusIndicator);

  // Attach the click event listener to the host container
  hostContainer.off('click');
  hostContainer.on('click', function() {
    // Prevent further clicks
    if (isClickPrevented) {
      return;
    }
    // Block subsequent clicks immediately
    isClickPrevented = true;
    // Select the host when the Click key is pressed
    hostChosen(host);
    // Reset the click flag after 2 second delay
    setTimeout(() => isClickPrevented = false, 2000);
  });

  // Attach the click event listener to the host menu button
  hostMenu.off('click');
  hostMenu.on('click', function(e) {
    // Prevent the click event from propagating to the host container
    e.stopPropagation();
    // Select the host menu button when the Click key is pressed
    hostMenuDialog(host);
  });

  $('#host-grid').append(hostContainer);

  // The indicator must be updated after insertion so the DOM lookup can find it.
  updateHostStatusIndicator(host);

  if (typeof updateHostsCarousel === 'function') updateHostsCarousel();

  // Store the host object in the hosts array using its server UID as the key
  hosts[host.serverUid] = host;

  // Update the host's external IPv4 address if it was discovered via mDNS
  if (ismDNSDiscovered) {
    hosts[host.serverUid].updateExternalAddressIP4();
  }
}

// Function to correctly update and store the valid MAC address of the host in IndexedDB
function updateMacAddress(host) {
  getData('hosts', function(previousValue) {
    var dbHosts = previousValue.hosts != null ? previousValue.hosts : {};
    if (host.macAddress != '00:00:00:00:00:00') {
      if (dbHosts[host.serverUid] && dbHosts[host.serverUid].macAddress != host.macAddress) {
        console.log('%c[index.js, updateMacAddress]', 'color: green;', 'Updated MAC address for host ' + host.hostname + ' from ' + dbHosts[host.serverUid].macAddress + ' to ' + host.macAddress);
        if (hosts[host.serverUid]) {
          hosts[host.serverUid].macAddress = host.macAddress;
        }
        saveHosts();
      }
    }
  });
}

// Show the Host Menu dialog with host button options
function hostMenuDialog(host) {
  // Create an overlay for the dialog and append it to the body
  var hostMenuDialogOverlay = $('<div>', {
    id: 'hostMenuDialogOverlay-' + host.serverUid,
    class: 'dialog-overlay'
  }).appendTo('#popup-layer');

  // Create the dialog element and append it to the overlay
  var hostMenuDialog = $('<dialog>', {
    id: 'hostMenuDialog-' + host.serverUid,
    class: 'mdl-dialog'
  }).appendTo(hostMenuDialogOverlay);

  // Add the dialog title with the host's name
  $('<h3>', {
    id: 'hostMenuDialogTitle-' + host.serverUid,
    class: 'mdl-dialog__title',
    text: host.hostname
  }).appendTo(hostMenuDialog);

  // Create a content section inside the dialog
  var hostMenuDialogContent = $('<div>', {
    class: 'mdl-dialog__content'
  }).appendTo(hostMenuDialog);

  // Define the options for the menu with the corresponding attributes
  var hostMenuDialogOptions = [
    {
      id: 'refreshApps-' + host.hostname,
      class: 'host-menu-button',
      'data-i18n': 'Refresh apps',
      text: t('Refresh apps'),
      disabled: !host.online,
      action: function() {
        // Refresh the list of apps for the target host
        snackbarLogLong('Refreshing the list of %1$s applications...', host.hostname);
        host.clearBoxArt();
        host.getAppListWithCacheFlush();
      }
    },
    {
      id: 'wakeHost-' + host.hostname,
      class: 'host-menu-button',
      'data-i18n': 'Wake PC',
      text: t('Wake PC'),
      disabled: host.online,
      action: function() {
        // Check if MAC is randomized
        if (isRandomMacAddress(host.macAddress)) {
          // Show warning dialog for randomized MAC addresses
          setTimeout(() => wakeOnLanWarningDialog(host), 100);
        } else {
          // Send a Wake-on-LAN request to the target host
          setTimeout(() => autoWolDialog(host, function() {}, function() {}), 100);
        }
      }
    },
    {
      id: 'deleteHost-' + host.hostname,
      class: 'host-menu-button',
      'data-i18n': 'Delete PC',
      text: t('Delete PC'),
      action: function() {
        // Remove the selected host from the list
        setTimeout(() => deleteHostDialog(host), 100);
      }
    },
    {
      id: 'testNetwork-' + host.hostname,
      class: 'host-menu-button',
      'data-i18n': 'Network Test',
      text: t('Network Test'),
      disabled: !host.online || !host.paired,
      action: function() {
        // Open the network test after the host menu has been dismissed.
        setTimeout(() => hostNetworkTestDialog(host), 100);
      }
    },
    {
      id: 'viewDetails-' + host.hostname,
      class: 'host-menu-button',
      'data-i18n': 'View Details',
      text: t('View Details'),
      action: function() {
        // View details of the selected host
        setTimeout(() => hostDetailsDialog(host), 100);
      }
    },
  ];

  // Loop through each option to create a button in the dialog
  hostMenuDialogOptions.forEach(function(menuOption) {
    var hostMenuDialogOption = $('<button>', {
      type: 'button',
      id: menuOption.id,
      class: 'mdl-button mdl-js-button mdl-button--raised mdl-button--colored mdl-js-ripple-effect',
      text: menuOption.text,
      disabled: menuOption.disabled || false
    });
    // Trigger the action if the Option button is pressed
    hostMenuDialogOption.off('click');
    hostMenuDialogOption.click(function() {
      Navigation.pop();
      menuOption.action();
      $(hostMenuDialogOverlay).css('display', 'none');
      closeUiDialog(hostMenuDialog[0]);
      hostMenuDialogOverlay.remove();
      isDialogOpen = false;
    });
    // Append the button to the dialog content
    hostMenuDialogOption.appendTo(hostMenuDialogContent);
  });

  // Create the actions section inside the dialog
  var hostMenuDialogActions = $('<div>', {
    class: 'mdl-dialog__actions'
  }).appendTo(hostMenuDialog);

  // Create and set up the Close button
  var closeHostMenuDialog = $('<button>', {
    type: 'button',
    id: 'closeHostMenu',
    class: 'mdl-button mdl-js-button mdl-button--raised mdl-button--colored mdl-js-ripple-effect',
    'data-i18n': 'Close menu',
    text: t('Close menu')
  });

  // Close the dialog if the Close button is pressed
  closeHostMenuDialog.off('click');
  closeHostMenuDialog.click(function() {
    console.log('%c[index.js, hostMenuDialog]', 'color: green;', 'Closing app dialog and returning.');
    $(hostMenuDialogOverlay).css('display', 'none');
    closeUiDialog(hostMenuDialog[0]);
    hostMenuDialogOverlay.remove();
    isDialogOpen = false;
    Navigation.pop();
  }).appendTo(hostMenuDialogActions);

  // If the dialog element doesn't support the showModal method, register it with dialogPolyfill
  if (!hostMenuDialog[0].showModal) {
    dialogPolyfill.registerDialog(hostMenuDialog[0]);
  }

  // Show the dialog and push the view
  fadeInUiElement(hostMenuDialogOverlay, 'flex');
  showUiDialog(hostMenuDialog[0]);
  isDialogOpen = true;
  Navigation.push(Views.HostMenuDialog, host.hostname);
  setTimeout(() => Navigation.switch(), 5);
}

// Match the PlayStation vendor/name checks used by gamepad.cpp. Unknown IDs use the Xbox diagram.
function isPlayStationGamepadId(id) {
  id = typeof id === 'string' ? id.toLowerCase() : '';
  return id.indexOf('vendor: 054c') !== -1 || id.indexOf('vendor:054c') !== -1 ||
    id.indexOf('054c-') === 0 || id.indexOf('dualsense') !== -1 ||
    id.indexOf('dualshock') !== -1 || id.indexOf('playstation') !== -1 ||
    id.indexOf('sony interactive entertainment') !== -1 ||
    id.indexOf('sony computer entertainment') !== -1;
}

function isNintendoSwitchProGamepadId(id) {
  var value = String(id || '').toLowerCase();
  return /(?:^|[^0-9a-f])057e[- :]+2009(?:$|[^0-9a-f])/.test(value) ||
    /vendor:\s*057e.*product:\s*2009/.test(value) ||
    value.indexOf('nintendo switch pro controller') !== -1 ||
    value.indexOf('switch pro controller') !== -1;
}

// Return a browser-reported connected controller for the test UI, independently
// of the activity timestamp used by Moonlight's protocol controller mask.
function getConnectedGamepadForTest() {
  var gamepads = navigator.getGamepads
    ? navigator.getGamepads()
    : navigator.webkitGetGamepads
    ? navigator.webkitGetGamepads()
    : [];
  for (var i = 0; i < gamepads.length; i++) {
    var gamepad = gamepads[i];
    if (gamepad && gamepad.connected && gamepad.buttons && gamepad.buttons.length &&
        typeof gamepad.id === 'string' && gamepad.id.trim()) {
      return gamepad;
    }
  }
  return null;
}

// Keep the gamepad test entry visible only while a controller is connected.
function updateGamepadTestButtonVisibility() {
  var connected = !!getConnectedGamepadForTest();
  var hostGrid = document.getElementById('host-grid');
  var settingsList = document.getElementById('settings-list');
  var gameGrid = document.getElementById('game-grid');
  var onHostsView = !!hostGrid && window.getComputedStyle(hostGrid).display !== 'none' &&
    (!settingsList || window.getComputedStyle(settingsList).display === 'none') &&
    (!gameGrid || window.getComputedStyle(gameGrid).display === 'none');
  var button = document.getElementById('gamepadTestBtn');
  if (button) button.hidden = !(connected && onHostsView);
}

// Consume gamepad input exclusively while the controller test modal is open.
function handleGamepadTestInput(event) {
  if (!isGamepadTestDialogOpen || !gamepadTestDialogState || !event || !event.detail) {
    var gamepadTestButton = document.getElementById('gamepadTestBtn');
    if (gamepadTestButton && gamepadTestButton.hidden) updateGamepadTestButtonVisibility();
    return;
  }
  if (event.detail.gamepadIndex !== gamepadTestDialogState.gamepadIndex) return;

  event.detail.changes.forEach(function(change) {
    if (change.type === 'button') {
      gamepadTestDialogState.buttonStates[change.index] = !!change.pressed;
      if (change.index === 1) {
        var testState = gamepadTestDialogState;
        if (testState.bHoldTimeout) {
          window.clearTimeout(testState.bHoldTimeout);
          testState.bHoldTimeout = null;
        }
        if (change.pressed) {
          testState.bHoldTimeout = window.setTimeout(function() {
            if (gamepadTestDialogState === testState && testState.buttonStates[1]) {
              closeGamepadTestDialog();
            }
          }, 1000);
        }
      }
      var buttonIds = gamepadTestDialogState.buttonIds[change.index];
      if (buttonIds) {
        if (!Array.isArray(buttonIds)) buttonIds = [buttonIds];
        buttonIds.forEach(function(buttonId) {
          var element = document.getElementById(buttonId);
          if (element) element.classList.toggle('gamepad-test-active', change.pressed);
        });
      }

    } else if (change.type === 'axis') {
      gamepadTestDialogState.axes[change.index] = change.value;
      updateGamepadTestStick(0, gamepadTestDialogState.axes[0], gamepadTestDialogState.axes[1]);
      updateGamepadTestStick(1, gamepadTestDialogState.axes[2], gamepadTestDialogState.axes[3]);
    }
  });
}

function updateGamepadTestStick(stickIndex, x, y) {
  var arrow = document.getElementById(stickIndex === 0 ? 'gamepadTestLeftStickArrow' : 'gamepadTestRightStickArrow');
  if (!arrow) return;
  x = Number.isFinite(x) ? x : 0;
  y = Number.isFinite(y) ? y : 0;
  var magnitude = Math.sqrt(x * x + y * y);
  if (magnitude < 0.16) {
    arrow.setAttribute('opacity', '0');
    return;
  }
  var length = Math.min(1, magnitude) * 23;
  var controllerType = gamepadTestDialogState && gamepadTestDialogState.controllerType;
  var isPlayStation = controllerType === 'ps';
  var isNintendoSwitch = controllerType === 'switch';
  var centerX = isNintendoSwitch ? (stickIndex === 0 ? 390 : 960) :
    (isPlayStation ? (stickIndex === 0 ? 295.14 : 617.17) : (stickIndex === 0 ? 113 : 278));
  var centerY = isNintendoSwitch ? (stickIndex === 0 ? 329 : 526) :
    (isPlayStation ? 419.52 : (stickIndex === 0 ? 160 : 238));
  var endX = x / magnitude * length;
  var endY = y / magnitude * length;
  arrow.setAttribute('d', 'M ' + centerX + ' ' + centerY + ' L ' + (centerX + endX) + ' ' + (centerY + endY) +
    ' M ' + (centerX + endX) + ' ' + (centerY + endY) + ' l ' + (-endX / length * 6 - endY / length * 4) + ' ' + (-endY / length * 6 + endX / length * 4) +
    ' M ' + (centerX + endX) + ' ' + (centerY + endY) + ' l ' + (-endX / length * 6 + endY / length * 4) + ' ' + (-endY / length * 6 - endX / length * 4));
  arrow.setAttribute('opacity', '1');
}

var NINTENDO_SWITCH_PRO_GAMEPAD_TEST_SVG = "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"69 43 1397 945\"><g transform=\"scale(0.25)\" fill=\"currentColor\"><path d=\"M0 0 C1 0 2 0 4 0 C21 0 37 1 54 4 C55 5 56 5 58 5 C65 6 71 8 78 10 C78 10 78 10 80 11 C85 13 91 15 96 17 C97 18 98 19 100 19 C115 26 129 33 143 42 C145 44 147 45 149 46 C154 50 158 53 163 56 C165 58 167 59 168 60 C175 65 181 69 187 74 C191 78 195 81 200 85 C205 89 211 94 217 98 C221 102 226 106 230 109 C235 113 240 117 244 121 C249 125 253 128 258 132 C261 134 261 134 262 135 C262 135 262 135 265 135 C275 136 285 136 295 136 C298 136 300 136 303 136 C323 137 341 140 359 147 C365 150 370 152 376 155 C377 156 379 157 381 158 C388 161 394 165 401 168 C404 170 408 172 412 174 C412 175 413 175 414 175 C416 177 418 178 421 179 C421 180 422 180 423 180 C423 181 423 181 425 181 C425 182 425 182 427 182 C429 183 431 184 433 184 C435 184 437 184 440 184 C441 184 441 184 442 184 C444 184 447 184 449 184 C451 184 452 184 454 184 C457 184 461 184 464 183 C471 183 478 183 485 183 C485 183 486 183 487 183 C540 181 593 180 646 179 C655 179 664 179 672 179 C765 177 858 176 951 176 C971 176 991 176 1010 176 C1013 176 1015 176 1017 176 C1052 175 1086 175 1121 175 C1215 174 1308 174 1701 176 C1709 176 1716 176 1724 176 C1772 177 1819 177 1867 178 C1889 179 1912 179 1934 180 C1935 180 1936 180 1936 180 C1947 180 1958 180 1969 180 C2000 181 2032 181 2064 182 C2068 182 2072 183 2076 183 C2079 183 2081 183 2084 183 C2085 183 2086 183 2088 183 C2094 183 2101 183 2107 184 C2132 185 2132 185 2140 182 C2146 180 2151 177 2155 173 C2159 170 2164 168 2168 166 C2169 165 2170 165 2171 164 C2194 153 2217 142 2242 138 C2255 136 2268 136 2281 136 C2283 136 2285 136 2287 136 C2292 136 2297 136 2302 136 C2307 132 2313 128 2318 123 C2323 118 2328 114 2334 110 C2338 107 2342 103 2347 100 C2353 94 2360 89 2367 83 C2369 81 2371 80 2373 78 C2382 70 2392 63 2402 56 C2403 55 2405 53 2407 52 C2418 44 2429 38 2441 31 C2442 31 2443 30 2444 30 C2470 15 2497 6 2527 1 C2532 1 2538 0 2543 0 C2544 0 2545 0 2546 0 C2591 -1 2638 2 2683 10 C2689 11 2695 11 2701 12 C2728 15 2754 20 2780 24 C2781 25 2782 25 2784 25 C2821 32 2858 39 2894 49 C2902 51 2909 53 2917 55 C2929 58 2940 61 2952 64 C2953 65 2953 65 2954 65 C2966 69 2978 73 2990 77 C2993 78 2997 80 3001 81 C3008 83 3015 86 3022 90 C3025 92 3029 93 3033 95 C3040 98 3048 101 3055 104 C3056 105 3057 105 3058 106 C3081 117 3103 130 3123 145 C3123 146 3124 146 3124 147 C3131 152 3138 157 3144 162 C3144 163 3144 164 3144 164 C3144 164 3144 164 3145 165 C3148 167 3150 168 3152 171 C3155 173 3157 176 3160 178 C3164 181 3166 184 3169 187 C3171 189 3173 191 3175 193 C3179 199 3184 205 3188 211 C3190 212 3191 214 3192 215 C3199 224 3206 234 3212 243 C3212 244 3213 245 3213 246 C3220 256 3227 267 3233 279 C3234 281 3235 284 3236 286 C3240 293 3244 300 3246 307 C3248 311 3250 315 3252 320 C3252 320 3252 321 3253 322 C3253 322 3253 323 3254 324 C3254 325 3254 325 3255 326 C3255 328 3256 329 3257 330 C3259 336 3262 343 3264 349 C3264 351 3265 353 3266 355 C3266 356 3266 357 3267 358 C3268 363 3270 367 3271 372 C3272 373 3272 375 3273 376 C3273 377 3273 378 3274 379 C3281 386 3288 391 3295 396 C3302 401 3308 406 3314 411 C3317 413 3321 416 3324 418 C3327 421 3330 423 3333 426 C3335 428 3338 430 3340 432 C3342 434 3343 435 3345 436 C3345 436 3346 437 3347 438 C3347 438 3347 438 3349 439 C3349 440 3349 440 3351 441 C3359 447 3366 455 3374 462 C3374 463 3375 464 3376 464 C3382 470 3388 477 3393 483 C3394 485 3395 486 3397 488 C3411 506 3423 524 3435 543 C3437 546 3439 549 3440 552 C3443 556 3446 561 3448 565 C3450 568 3452 572 3453 575 C3457 582 3461 588 3464 595 C3465 598 3467 600 3468 603 C3475 615 3481 628 3486 642 C3488 648 3491 653 3494 659 C3496 663 3498 668 3500 673 C3502 676 3503 680 3505 683 C3507 688 3509 693 3511 698 C3515 709 3520 719 3524 729 C3526 735 3529 741 3531 746 C3532 751 3534 755 3536 760 C3542 773 3547 787 3552 801 C3553 805 3554 808 3555 812 C3566 841 3576 870 3585 900 C3586 904 3587 907 3589 911 C3589 912 3589 913 3589 913 C3591 918 3592 922 3594 927 C3599 942 3603 958 3607 974 C3610 984 3613 994 3616 1003 C3620 1017 3624 1031 3628 1045 C3629 1051 3630 1056 3632 1061 C3635 1071 3637 1080 3640 1090 C3641 1096 3643 1103 3645 1110 C3647 1115 3648 1121 3649 1126 C3650 1131 3651 1136 3653 1140 C3654 1145 3656 1150 3657 1155 C3658 1160 3659 1164 3660 1169 C3664 1180 3667 1192 3670 1204 C3670 1206 3671 1208 3671 1210 C3674 1222 3677 1234 3680 1246 C3682 1253 3684 1261 3686 1268 C3688 1277 3690 1286 3692 1294 C3694 1302 3696 1309 3697 1316 C3699 1321 3700 1326 3701 1331 C3702 1335 3703 1339 3704 1342 C3707 1351 3709 1361 3711 1370 C3712 1378 3714 1385 3716 1393 C3719 1402 3721 1411 3723 1420 C3726 1434 3729 1447 3733 1461 C3735 1469 3737 1477 3739 1485 C3741 1497 3744 1509 3747 1522 C3747 1522 3747 1523 3747 1524 C3749 1529 3750 1535 3751 1540 C3752 1544 3753 1549 3754 1554 C3755 1555 3755 1557 3756 1559 C3757 1564 3758 1569 3759 1574 C3761 1582 3763 1589 3765 1597 C3770 1620 3775 1643 3781 1666 C3784 1682 3788 1698 3792 1714 C3796 1729 3799 1745 3802 1760 C3803 1761 3803 1762 3803 1762 C3803 1765 3804 1768 3804 1770 C3808 1789 3812 1807 3817 1825 C3821 1840 3824 1854 3827 1868 C3828 1874 3829 1880 3831 1886 C3831 1888 3832 1890 3832 1892 C3833 1897 3834 1901 3835 1906 C3836 1909 3837 1913 3838 1917 C3838 1917 3838 1917 3838 1919 C3841 1932 3844 1944 3846 1957 C3848 1966 3850 1975 3853 1985 C3856 1998 3858 2011 3861 2024 C3864 2038 3867 2052 3870 2066 C3872 2074 3874 2082 3876 2091 C3876 2091 3876 2091 3876 2093 C3876 2094 3877 2095 3877 2096 C3877 2097 3877 2099 3878 2100 C3878 2101 3878 2102 3878 2103 C3881 2115 3884 2128 3887 2140 C3890 2152 3892 2163 3895 2175 C3896 2183 3898 2191 3900 2199 C3902 2210 3905 2221 3907 2232 C3909 2242 3911 2251 3913 2261 C3916 2274 3918 2286 3921 2299 C3922 2307 3923 2314 3925 2322 C3925 2322 3925 2323 3925 2324 C3926 2329 3927 2334 3928 2338 C3929 2342 3929 2345 3930 2348 C3931 2355 3933 2362 3934 2370 C3934 2371 3935 2372 3935 2373 C3938 2387 3941 2401 3944 2415 C3946 2428 3949 2440 3951 2453 C3952 2461 3953 2469 3955 2477 C3956 2481 3957 2486 3958 2490 C3959 2498 3960 2505 3961 2512 C3965 2531 3968 2550 3971 2569 C3971 2570 3971 2571 3971 2571 C3972 2572 3972 2573 3972 2574 C3973 2581 3974 2589 3975 2596 C3976 2601 3977 2606 3978 2611 C3978 2612 3978 2613 3978 2614 C3979 2621 3980 2627 3981 2634 C3982 2638 3983 2643 3983 2647 C3986 2668 3989 2688 3992 2709 C3992 2710 3992 2711 3992 2712 C3996 2746 4000 2780 4003 2813 C4003 2814 4003 2815 4003 2815 C4003 2818 4004 2822 4004 2825 C4004 2831 4005 2837 4006 2842 C4007 2857 4008 2873 4009 2888 C4009 2891 4009 2893 4009 2896 C4010 2920 4012 2945 4012 2969 C4012 2970 4012 2971 4012 2972 C4012 2979 4012 2986 4012 2993 C4012 2993 4012 2993 4012 2996 C4012 3018 4011 3040 4009 3062 C4009 3063 4009 3063 4009 3066 C4006 3103 4002 3140 3995 3176 C3995 3177 3994 3178 3994 3179 C3991 3198 3987 3216 3981 3234 C3980 3238 3979 3242 3978 3246 C3974 3262 3969 3277 3964 3292 C3963 3294 3963 3295 3962 3296 C3961 3300 3960 3303 3959 3306 C3958 3309 3957 3311 3956 3313 C3952 3325 3947 3336 3942 3347 C3941 3348 3941 3349 3941 3349 C3939 3352 3938 3355 3937 3359 C3935 3361 3934 3364 3933 3366 C3926 3382 3917 3398 3908 3413 C3906 3416 3904 3419 3902 3423 C3899 3427 3897 3431 3894 3436 C3892 3439 3890 3442 3888 3445 C3879 3456 3871 3468 3862 3479 C3861 3480 3860 3481 3860 3482 C3855 3488 3849 3494 3843 3500 C3843 3501 3842 3502 3842 3502 C3841 3502 3841 3502 3840 3504 C3839 3505 3839 3505 3838 3507 C3837 3507 3836 3507 3836 3507 C3835 3508 3835 3508 3835 3509 C3834 3511 3832 3513 3831 3515 C3830 3515 3829 3516 3829 3517 C3828 3517 3827 3518 3827 3519 C3826 3519 3825 3520 3825 3521 C3820 3525 3815 3529 3810 3533 C3807 3536 3804 3538 3801 3541 C3795 3547 3788 3553 3781 3558 C3780 3559 3780 3559 3778 3561 C3771 3566 3765 3570 3758 3574 C3755 3576 3753 3577 3751 3579 C3749 3580 3748 3580 3747 3581 C3745 3582 3743 3584 3741 3585 C3736 3588 3730 3591 3725 3594 C3723 3595 3722 3596 3721 3596 C3704 3606 3686 3613 3668 3620 C3667 3621 3666 3621 3666 3621 C3660 3623 3655 3625 3650 3626 C3648 3627 3647 3627 3645 3628 C3631 3632 3617 3635 3603 3638 C3602 3639 3601 3639 3600 3639 C3576 3644 3552 3648 3528 3648 C3527 3648 3527 3648 3524 3648 C3477 3649 3430 3644 3385 3632 C3384 3632 3384 3632 3382 3632 C3373 3629 3363 3626 3354 3623 C3353 3623 3352 3623 3351 3622 C3346 3620 3341 3619 3336 3616 C3334 3616 3333 3615 3332 3615 C3322 3610 3312 3606 3302 3601 C3300 3600 3297 3599 3295 3598 C3294 3598 3294 3598 3292 3597 C3291 3596 3289 3595 3287 3595 C3282 3592 3277 3589 3272 3586 C3270 3585 3268 3584 3267 3584 C3252 3575 3238 3566 3224 3556 C3223 3555 3221 3554 3219 3552 C3214 3549 3209 3545 3205 3541 C3202 3539 3200 3537 3197 3535 C3193 3531 3189 3527 3184 3524 C3182 3521 3179 3519 3176 3517 C3169 3511 3163 3505 3158 3499 C3154 3495 3150 3491 3147 3487 C3142 3482 3137 3478 3133 3472 C3132 3471 3131 3470 3130 3469 C3118 3456 3107 3442 3096 3427 C3095 3425 3093 3423 3091 3421 C3084 3412 3077 3402 3071 3392 C3070 3392 3070 3391 3069 3390 C3063 3380 3056 3370 3050 3360 C3049 3360 3049 3359 3048 3358 C3044 3351 3039 3344 3035 3336 C3034 3333 3032 3330 3030 3327 C3026 3321 3023 3316 3020 3310 C3017 3305 3014 3299 3011 3294 C3006 3285 3001 3277 2996 3268 C2992 3261 2989 3255 2985 3248 C2981 3240 2977 3232 2973 3224 C2969 3216 2965 3209 2961 3201 C2957 3193 2953 3185 2949 3177 C2947 3174 2945 3171 2944 3167 C2942 3163 2940 3159 2938 3155 C2934 3148 2931 3141 2927 3134 C2923 3126 2919 3118 2915 3110 C2913 3107 2911 3104 2910 3100 C2909 3099 2908 3098 2908 3096 C2907 3096 2907 3095 2907 3094 C2904 3088 2904 3088 2903 3086 C2902 3085 2901 3084 2901 3082 C2899 3079 2897 3076 2896 3072 C2892 3065 2889 3059 2885 3052 C2882 3046 2879 3040 2876 3034 C2873 3027 2870 3021 2867 3014 C2865 3011 2863 3008 2862 3004 C2861 3003 2860 3002 2860 3000 C2856 2992 2856 2992 2855 2990 C2854 2989 2853 2988 2853 2986 C2851 2983 2849 2980 2848 2976 C2844 2968 2840 2960 2835 2952 C2833 2948 2831 2944 2829 2939 C2825 2932 2821 2924 2817 2917 C2816 2914 2815 2912 2813 2910 C2808 2900 2803 2891 2798 2881 C2795 2876 2793 2871 2790 2866 C2783 2852 2775 2839 2767 2826 C2766 2823 2764 2820 2762 2817 C2758 2810 2754 2803 2750 2797 C2747 2792 2744 2787 2741 2782 C2739 2777 2736 2772 2732 2767 C2731 2764 2729 2762 2728 2760 C2722 2749 2715 2738 2708 2728 C2707 2727 2706 2726 2705 2725 C2677 2685 2677 2685 2661 2667 C2660 2666 2658 2665 2657 2663 C2657 2663 2656 2662 2656 2661 C2654 2660 2653 2658 2652 2657 C2646 2650 2639 2644 2632 2637 C2631 2637 2630 2636 2630 2635 C2628 2634 2626 2632 2624 2630 C2623 2630 2622 2629 2621 2628 C2603 2613 2583 2599 2562 2589 C2560 2588 2558 2587 2556 2586 C2552 2584 2547 2582 2543 2581 C2542 2580 2541 2580 2541 2580 C2536 2578 2531 2576 2526 2575 C2524 2574 2522 2574 2519 2573 C2435 2547 2341 2550 2210 2548 C2209 2548 2208 2548 2206 2548 C2118 2547 2029 2547 1929 2547 C1928 2547 1927 2547 1926 2547 C1877 2547 1827 2547 1778 2547 C1748 2547 1717 2547 1686 2547 C1684 2547 1682 2547 1680 2547 C1671 2547 1663 2547 1654 2547 C1630 2547 1606 2547 1581 2547 C1580 2547 1579 2547 1578 2547 C1543 2547 1508 2547 1474 2547 C1472 2547 1471 2547 1470 2547 C1452 2547 1434 2547 1415 2547 C1343 2547 1271 2547 1199 2547 C1181 2547 1163 2547 1145 2547 C1144 2547 1143 2547 1141 2547 C1107 2547 1072 2547 1037 2547 C1036 2547 1035 2547 1034 2547 C1010 2547 985 2547 961 2547 C953 2547 944 2547 935 2547 C933 2547 931 2547 929 2547 C898 2547 868 2547 837 2547 C648 2547 648 2547 379 2548 C374 2548 369 2548 365 2548 C311 2549 257 2549 203 2551 C197 2551 191 2552 185 2552 C153 2553 121 2556 90 2562 C89 2562 89 2562 88 2562 C72 2565 56 2569 40 2574 C40 2574 40 2574 37 2575 C30 2578 23 2580 17 2583 C15 2584 13 2585 11 2586 C-12 2595 -33 2608 -52 2624 C-53 2625 -53 2625 -54 2626 C-61 2632 -69 2639 -76 2646 C-77 2648 -79 2649 -81 2651 C-84 2653 -87 2656 -89 2659 C-91 2661 -93 2663 -94 2664 C-101 2671 -107 2679 -113 2687 C-114 2688 -115 2690 -117 2692 C-127 2704 -136 2717 -145 2730 C-147 2733 -148 2735 -150 2737 C-157 2748 -163 2758 -170 2769 C-173 2774 -175 2778 -178 2783 C-186 2795 -193 2808 -200 2820 C-202 2823 -203 2825 -204 2827 C-205 2829 -206 2831 -207 2832 C-208 2834 -209 2835 -210 2837 C-216 2848 -223 2860 -229 2872 C-232 2878 -235 2883 -238 2888 C-239 2891 -241 2893 -242 2896 C-244 2901 -247 2906 -250 2911 C-250 2911 -250 2912 -251 2913 C-253 2917 -255 2921 -258 2925 C-262 2933 -266 2940 -269 2948 C-272 2954 -275 2960 -278 2966 C-284 2976 -289 2986 -294 2996 C-298 3005 -302 3014 -307 3022 C-312 3032 -317 3042 -322 3053 C-325 3058 -327 3064 -330 3069 C-332 3074 -334 3078 -336 3082 C-338 3084 -339 3087 -341 3090 C-342 3094 -344 3098 -346 3101 C-350 3111 -355 3120 -360 3128 C-364 3136 -367 3144 -371 3151 C-375 3159 -379 3167 -383 3175 C-386 3181 -389 3187 -392 3193 C-395 3199 -398 3205 -402 3211 C-404 3214 -406 3218 -407 3222 C-411 3228 -414 3235 -418 3241 C-419 3245 -421 3248 -423 3251 C-428 3261 -433 3270 -439 3279 C-442 3284 -444 3289 -447 3294 C-451 3303 -456 3311 -461 3319 C-463 3323 -466 3327 -468 3331 C-469 3333 -470 3335 -471 3336 C-473 3340 -475 3343 -477 3347 C-483 3356 -488 3365 -494 3374 C-495 3375 -497 3377 -498 3379 C-504 3389 -510 3398 -517 3407 C-518 3409 -520 3411 -521 3414 C-527 3422 -533 3431 -540 3439 C-541 3440 -542 3442 -543 3443 C-549 3450 -555 3457 -560 3463 C-561 3464 -561 3465 -562 3465 C-564 3467 -565 3469 -567 3471 C-568 3472 -568 3472 -569 3473 C-572 3477 -575 3480 -579 3484 C-580 3486 -582 3487 -584 3489 C-585 3490 -585 3491 -586 3492 C-587 3492 -588 3492 -588 3492 C-588 3493 -588 3493 -589 3494 C-590 3497 -592 3498 -594 3500 C-595 3500 -596 3500 -596 3500 C-597 3501 -597 3502 -597 3503 C-597 3503 -597 3503 -598 3504 C-603 3508 -607 3512 -611 3515 C-616 3521 -622 3526 -628 3531 C-631 3533 -633 3535 -635 3537 C-643 3543 -651 3550 -659 3555 C-660 3556 -660 3556 -662 3557 C-685 3573 -708 3587 -732 3599 C-734 3600 -736 3601 -738 3602 C-756 3611 -774 3618 -793 3624 C-794 3625 -795 3625 -795 3625 C-804 3628 -813 3630 -821 3632 C-822 3633 -823 3633 -824 3633 C-846 3639 -869 3643 -891 3646 C-892 3646 -893 3646 -894 3646 C-945 3652 -998 3648 -1049 3636 C-1052 3636 -1054 3635 -1057 3634 C-1058 3634 -1058 3634 -1060 3634 C-1064 3633 -1067 3632 -1070 3631 C-1071 3631 -1071 3631 -1074 3630 C-1087 3626 -1100 3622 -1113 3616 C-1114 3616 -1114 3616 -1115 3616 C-1125 3612 -1134 3608 -1143 3603 C-1144 3603 -1146 3602 -1147 3602 C-1154 3598 -1161 3594 -1168 3590 C-1169 3590 -1170 3589 -1171 3589 C-1201 3572 -1227 3552 -1252 3529 C-1254 3528 -1255 3527 -1257 3525 C-1258 3524 -1259 3523 -1260 3522 C-1260 3522 -1260 3521 -1260 3520 C-1261 3520 -1261 3520 -1262 3520 C-1265 3518 -1267 3515 -1270 3513 C-1271 3512 -1271 3512 -1272 3511 C-1275 3508 -1278 3504 -1282 3500 C-1284 3498 -1286 3496 -1288 3493 C-1291 3489 -1295 3485 -1298 3481 C-1300 3479 -1301 3478 -1302 3476 C-1314 3462 -1324 3446 -1335 3431 C-1336 3429 -1337 3427 -1339 3425 C-1345 3415 -1350 3406 -1356 3396 C-1357 3393 -1359 3391 -1360 3389 C-1366 3378 -1371 3367 -1376 3356 C-1377 3356 -1377 3355 -1377 3354 C-1382 3344 -1386 3334 -1390 3323 C-1391 3322 -1391 3322 -1391 3321 C-1405 3287 -1416 3252 -1424 3216 C-1424 3216 -1424 3216 -1425 3213 C-1434 3174 -1440 3135 -1444 3095 C-1444 3091 -1445 3087 -1445 3084 C-1447 3062 -1448 3041 -1448 3019 C-1448 3019 -1448 3018 -1448 3017 C-1448 3007 -1448 2997 -1448 2987 C-1448 2984 -1448 2981 -1448 2978 C-1448 2912 -1444 2847 -1437 2782 C-1436 2778 -1436 2774 -1435 2770 C-1432 2732 -1427 2695 -1422 2658 C-1421 2652 -1420 2646 -1419 2639 C-1416 2621 -1414 2603 -1410 2584 C-1409 2580 -1409 2575 -1408 2570 C-1407 2569 -1407 2567 -1407 2566 C-1405 2555 -1403 2545 -1402 2534 C-1399 2516 -1396 2499 -1392 2481 C-1391 2474 -1389 2467 -1388 2460 C-1388 2458 -1387 2455 -1387 2453 C-1385 2446 -1384 2438 -1383 2431 C-1380 2417 -1377 2403 -1375 2389 C-1373 2380 -1371 2372 -1370 2363 C-1367 2351 -1365 2338 -1362 2325 C-1359 2312 -1356 2298 -1354 2285 C-1350 2266 -1346 2248 -1342 2230 C-1341 2223 -1339 2216 -1338 2209 C-1334 2192 -1331 2175 -1327 2159 C-1324 2147 -1322 2135 -1319 2123 C-1317 2111 -1314 2100 -1311 2088 C-1309 2079 -1307 2070 -1305 2060 C-1304 2053 -1302 2045 -1300 2037 C-1298 2028 -1296 2019 -1294 2010 C-1292 1998 -1289 1985 -1286 1973 C-1283 1960 -1280 1947 -1277 1934 C-1277 1934 -1277 1933 -1277 1932 C-1276 1929 -1276 1926 -1275 1923 C-1273 1914 -1271 1905 -1269 1896 C-1268 1892 -1267 1888 -1266 1884 C-1262 1863 -1257 1843 -1252 1823 C-1249 1808 -1245 1793 -1242 1778 C-1239 1763 -1236 1748 -1232 1734 C-1229 1719 -1226 1704 -1222 1690 C-1217 1664 -1210 1637 -1204 1611 C-1200 1595 -1196 1578 -1192 1561 C-1191 1555 -1189 1549 -1188 1542 C-1187 1539 -1186 1535 -1185 1531 C-1185 1530 -1185 1530 -1184 1529 C-1182 1518 -1179 1506 -1177 1495 C-1174 1484 -1171 1473 -1169 1462 C-1166 1451 -1163 1439 -1161 1427 C-1158 1417 -1156 1407 -1153 1396 C-1151 1387 -1149 1377 -1147 1368 C-1144 1355 -1141 1343 -1137 1330 C-1135 1324 -1134 1317 -1132 1311 C-1129 1297 -1126 1283 -1122 1268 C-1119 1257 -1116 1245 -1113 1233 C-1112 1226 -1110 1218 -1107 1211 C-1105 1204 -1104 1198 -1102 1191 C-1100 1181 -1098 1172 -1095 1163 C-1092 1153 -1090 1143 -1087 1133 C-1082 1114 -1077 1095 -1072 1076 C-1071 1074 -1070 1071 -1070 1068 C-1070 1068 -1070 1068 -1069 1066 C-1066 1057 -1064 1048 -1062 1038 C-1059 1028 -1056 1018 -1053 1007 C-1051 1002 -1050 996 -1048 990 C-1048 988 -1047 986 -1046 983 C-1044 975 -1042 967 -1039 959 C-1035 942 -1030 925 -1024 908 C-1023 905 -1023 903 -1022 901 C-1019 893 -1017 884 -1014 876 C-1014 875 -1014 875 -1013 874 C-1004 845 -994 816 -983 788 C-981 784 -980 780 -979 777 C-975 766 -970 755 -966 744 C-964 740 -963 736 -961 733 C-955 718 -949 703 -943 689 C-940 682 -937 675 -934 669 C-932 663 -929 657 -926 651 C-924 647 -922 642 -920 637 C-914 624 -908 612 -901 599 C-899 595 -896 591 -894 586 C-887 572 -879 558 -870 544 C-870 544 -869 543 -869 542 C-853 516 -835 492 -815 470 C-813 468 -811 466 -810 464 C-807 461 -804 459 -801 456 C-799 454 -798 453 -796 451 C-790 444 -782 439 -775 434 C-768 428 -762 423 -755 417 C-743 406 -730 396 -716 386 C-713 384 -710 382 -707 379 C-707 379 -707 378 -707 377 C-703 365 -699 353 -695 341 C-694 339 -694 338 -693 336 C-690 325 -685 315 -680 305 C-677 300 -675 296 -673 291 C-672 289 -671 287 -670 286 C-670 285 -670 284 -669 284 C-662 268 -654 253 -644 239 C-643 237 -642 235 -640 233 C-635 225 -629 218 -623 210 C-623 210 -623 210 -622 208 C-608 192 -594 176 -578 162 C-577 161 -576 160 -575 160 C-550 138 -522 119 -491 105 C-488 103 -484 101 -480 99 C-466 92 -451 86 -435 81 C-429 79 -423 77 -417 74 C-397 67 -376 60 -355 55 C-351 54 -347 53 -342 52 C-314 44 -285 37 -256 32 C-250 31 -243 30 -237 29 C-205 22 -173 17 -141 13 C-140 13 -139 13 -138 13 C-137 12 -137 12 -136 12 C-130 12 -124 11 -118 10 C-93 6 -68 3 -42 1 C-40 1 -39 1 -37 1 C-24 0 -12 0 0 0 Z M-64 30 C-71 31 -78 32 -85 32 C-109 34 -133 38 -157 41 C-158 41 -158 41 -160 42 C-160 42 -160 42 -163 42 C-169 43 -174 44 -180 45 C-204 48 -228 52 -251 57 C-252 57 -253 58 -253 58 C-272 62 -291 66 -310 70 C-313 71 -316 72 -320 73 C-336 77 -353 81 -369 86 C-370 87 -371 87 -372 87 C-388 92 -404 97 -420 103 C-426 105 -432 107 -438 109 C-438 110 -438 110 -440 110 C-441 111 -442 111 -443 111 C-444 112 -445 112 -446 112 C-447 113 -449 114 -451 114 C-462 118 -472 123 -482 129 C-485 131 -488 132 -491 134 C-498 137 -505 141 -511 145 C-512 146 -514 147 -515 147 C-532 158 -547 170 -562 184 C-564 185 -566 187 -568 189 C-572 192 -574 194 -577 198 C-579 201 -582 203 -585 206 C-591 212 -596 218 -601 224 C-602 225 -603 226 -603 227 C-611 237 -619 247 -625 258 C-627 260 -628 262 -629 264 C-636 276 -643 288 -650 301 C-651 303 -652 305 -653 308 C-658 317 -662 326 -665 335 C-665 336 -666 336 -666 337 C-670 348 -670 348 -671 352 C-670 353 -669 353 -668 353 C-668 353 -667 352 -666 352 C-663 350 -661 349 -658 347 C-634 334 -634 334 -624 327 C-622 326 -619 324 -616 323 C-613 321 -609 318 -605 316 C-594 310 -583 305 -571 299 C-570 299 -568 298 -566 297 C-559 293 -551 290 -543 286 C-541 285 -538 284 -536 283 C-525 278 -514 273 -503 268 C-500 267 -497 266 -494 265 C-485 261 -475 257 -465 254 C-459 252 -454 250 -449 248 C-437 243 -425 239 -412 235 C-409 234 -406 233 -402 232 C-396 230 -390 228 -384 226 C-380 225 -377 224 -373 223 C-359 219 -344 214 -329 210 C-328 210 -328 210 -327 210 C-317 207 -306 204 -296 202 C-292 201 -287 200 -283 199 C-277 197 -271 196 -265 195 C-257 193 -249 191 -241 189 C-227 186 -213 183 -199 180 C-195 180 -190 179 -186 178 C-166 174 -145 170 -125 167 C-124 167 -124 167 -123 167 C-108 165 -94 162 -79 160 C-78 160 -77 160 -76 160 C-48 156 -20 152 9 149 C13 149 16 149 20 148 C22 148 23 148 25 148 C29 148 33 147 38 147 C47 146 56 145 65 144 C66 144 67 144 68 144 C84 142 100 142 116 141 C125 141 135 140 144 139 C158 138 173 138 187 138 C191 138 194 138 198 138 C205 137 212 137 219 137 C219 136 219 135 220 134 C217 132 215 130 212 128 C208 125 205 121 201 118 C195 113 189 108 183 103 C181 101 179 100 177 99 C165 89 153 80 140 71 C137 69 134 67 131 65 C115 54 97 45 79 38 C78 38 76 37 75 37 C60 31 44 28 28 27 C26 26 24 26 22 26 C-6 22 -37 27 -64 30 Z M2479 42 C2477 43 2475 44 2473 44 C2466 47 2459 51 2452 54 C2451 55 2450 56 2448 57 C2443 59 2439 62 2434 65 C2431 68 2428 70 2425 72 C2424 73 2423 73 2422 74 C2420 75 2418 77 2416 78 C2409 83 2401 89 2394 95 C2392 96 2390 98 2388 99 C2380 106 2371 112 2363 119 C2362 120 2361 121 2360 122 C2355 126 2350 129 2346 133 C2346 134 2346 135 2347 136 C2350 137 2353 137 2356 137 C2357 137 2357 137 2360 137 C2361 137 2362 137 2364 137 C2379 137 2395 138 2411 139 C2419 139 2426 140 2433 140 C2479 142 2525 146 2570 151 C2573 151 2575 152 2577 152 C2598 154 2619 157 2639 160 C2645 161 2651 162 2656 163 C2659 163 2661 163 2663 164 C2665 164 2666 164 2667 164 C2676 166 2685 167 2693 169 C2698 170 2703 170 2708 171 C2708 171 2708 171 2711 172 C2716 173 2721 173 2726 174 C2758 180 2758 180 2770 183 C2775 184 2780 185 2785 186 C2795 187 2805 189 2815 191 C2816 192 2817 192 2818 192 C2834 195 2850 199 2866 204 C2874 206 2883 208 2891 210 C2896 211 2902 213 2907 214 C2909 215 2911 215 2912 216 C2913 216 2914 216 2915 217 C2918 217 2921 218 2924 219 C2933 222 2942 224 2951 227 C2951 227 2952 228 2953 228 C2990 239 3026 251 3062 266 C3062 266 3063 266 3063 266 C3070 269 3077 272 3083 274 C3085 276 3088 276 3090 277 C3104 283 3117 289 3131 296 C3137 300 3143 303 3149 306 C3164 313 3179 321 3193 330 C3197 332 3202 335 3207 337 C3212 341 3218 344 3224 347 C3226 349 3229 351 3232 352 C3233 352 3235 352 3237 351 C3235 346 3233 341 3231 336 C3230 334 3230 332 3229 330 C3229 330 3229 330 3228 328 C3227 326 3226 324 3226 323 C3213 291 3194 261 3174 234 C3174 234 3174 234 3172 233 C3167 226 3162 219 3156 213 C3154 211 3152 209 3151 207 C3139 194 3127 182 3113 172 C3111 170 3109 168 3107 166 C3092 154 3075 145 3059 136 C3056 135 3054 133 3051 132 C3047 129 3043 127 3039 125 C3039 125 3039 125 3037 124 C3021 117 3005 110 2989 105 C2984 103 2979 101 2975 99 C2970 97 2965 96 2961 94 C2958 93 2955 92 2952 91 C2896 73 2838 60 2780 51 C2777 50 2774 50 2771 49 C2763 48 2754 46 2746 45 C2734 44 2722 42 2709 40 C2682 35 2654 32 2625 30 C2619 29 2612 29 2606 28 C2561 24 2522 25 2479 42 Z M242 160 C228 161 215 161 202 161 C199 161 196 161 193 161 C105 164 105 164 64 168 C54 170 44 170 34 171 C16 173 -2 174 -20 177 C-24 177 -28 178 -32 178 C-62 182 -92 186 -123 192 C-131 193 -139 195 -147 196 C-163 198 -178 201 -193 204 C-198 205 -202 206 -207 207 C-210 208 -212 208 -215 209 C-217 209 -218 210 -220 210 C-231 212 -242 215 -253 217 C-254 217 -255 218 -255 218 C-259 219 -264 220 -268 221 C-277 223 -287 225 -296 228 C-303 229 -309 231 -315 233 C-319 234 -324 235 -328 236 C-337 238 -345 240 -354 243 C-356 243 -359 244 -361 245 C-362 245 -363 245 -364 245 C-365 246 -367 246 -368 247 C-372 248 -376 249 -380 251 C-384 252 -387 253 -391 254 C-400 257 -410 260 -419 264 C-423 265 -427 266 -430 267 C-449 273 -467 281 -485 288 C-488 289 -491 290 -494 292 C-495 292 -496 292 -497 293 C-499 293 -500 294 -502 295 C-506 297 -511 298 -515 300 C-517 301 -520 302 -522 303 C-540 310 -558 320 -575 329 C-579 331 -582 333 -585 335 C-586 335 -587 335 -588 336 C-592 338 -596 340 -601 343 C-605 345 -610 347 -614 350 C-616 351 -619 353 -622 354 C-627 357 -631 360 -636 363 C-642 367 -648 371 -654 375 C-663 380 -671 385 -679 391 C-681 393 -683 394 -685 395 C-688 397 -690 399 -693 401 C-693 402 -693 403 -693 404 C-690 404 -687 403 -684 402 C-683 401 -681 400 -680 400 C-674 397 -668 394 -662 391 C-656 389 -651 386 -645 383 C-629 375 -612 368 -595 362 C-591 360 -588 359 -584 358 C-577 354 -569 351 -561 349 C-559 348 -557 347 -554 346 C-546 343 -538 340 -530 338 C-524 336 -518 334 -513 332 C-512 332 -511 332 -510 331 C-506 330 -502 328 -499 327 C-495 325 -491 324 -488 323 C-481 321 -474 319 -468 317 C-451 312 -434 306 -416 302 C-409 300 -402 298 -395 296 C-395 295 -395 295 -392 295 C-388 294 -384 292 -380 291 C-374 289 -367 287 -361 286 C-361 285 -361 285 -359 285 C-346 282 -333 279 -320 276 C-316 275 -312 274 -308 273 C-290 269 -272 265 -254 261 C-251 261 -248 260 -245 259 C-214 253 -183 247 -152 242 C-144 241 -135 240 -127 238 C-98 234 -70 230 -42 226 C-38 225 -35 225 -32 225 C7 219 46 215 86 212 C92 211 98 211 104 210 C145 207 187 204 229 202 C239 202 249 201 260 200 C262 200 264 200 267 200 C270 200 273 200 276 199 C303 198 330 197 357 197 C361 197 364 197 368 197 C375 197 383 196 390 196 C390 195 390 194 391 192 C387 189 383 186 378 184 C377 184 377 183 376 183 C362 176 349 171 335 166 C334 166 333 166 332 165 C313 159 291 161 272 160 C271 160 269 160 268 160 C259 160 251 160 242 160 Z M2265 162 C2263 162 2261 162 2259 162 C2246 163 2234 164 2222 169 C2212 173 2202 177 2193 182 C2190 183 2186 185 2183 187 C2179 188 2176 190 2173 192 C2173 194 2173 195 2174 196 C2174 196 2175 196 2176 196 C2255 198 2255 198 2277 200 C2289 200 2301 201 2313 201 C2327 202 2340 202 2354 204 C2363 204 2372 205 2381 205 C2422 207 2463 210 2504 214 C2510 215 2516 216 2522 216 C2537 217 2551 219 2566 221 C2569 222 2572 222 2576 223 C2577 223 2578 223 2578 223 C2586 224 2593 225 2600 226 C2612 227 2623 229 2635 230 C2642 232 2650 233 2658 234 C2668 235 2679 237 2690 239 C2694 239 2698 240 2703 241 C2718 243 2733 246 2749 248 C2750 248 2752 249 2753 249 C2764 250 2774 253 2784 255 C2788 256 2792 256 2796 257 C2798 258 2799 258 2801 258 C2801 258 2802 258 2803 259 C2816 261 2829 264 2842 267 C2843 267 2844 267 2846 268 C2848 268 2850 268 2852 269 C2853 269 2854 269 2855 270 C2858 270 2861 271 2864 272 C2866 273 2868 273 2871 274 C2879 275 2886 277 2894 279 C2897 279 2899 280 2901 280 C2911 282 2920 285 2929 287 C2933 288 2936 289 2940 290 C2948 292 2956 294 2964 297 C2969 298 2973 299 2978 300 C2982 302 2987 303 2991 304 C2992 305 2993 305 2995 305 C2996 306 2997 306 2998 306 C3001 307 3004 308 3007 309 C3020 312 3032 316 3045 320 C3049 322 3052 323 3056 324 C3066 327 3075 331 3085 334 C3085 334 3085 334 3087 335 C3139 352 3139 352 3163 363 C3167 365 3171 366 3175 368 C3184 371 3193 375 3202 379 C3205 380 3207 381 3209 382 C3220 386 3230 392 3241 398 C3245 400 3250 402 3255 404 C3256 404 3258 404 3260 403 C3256 399 3253 396 3249 393 C3246 391 3244 390 3242 389 C3233 384 3226 379 3218 373 C3209 367 3200 361 3190 355 C3188 354 3185 352 3183 351 C3171 344 3159 337 3146 331 C3143 329 3139 328 3136 326 C3127 321 3118 316 3109 312 C3107 311 3105 311 3103 310 C3096 306 3089 304 3082 301 C3078 299 3073 297 3069 295 C3066 294 3063 293 3060 291 C3059 291 3058 291 3058 290 C3032 279 3005 270 2978 261 C2967 258 2957 254 2947 251 C2934 247 2921 243 2908 239 C2900 237 2893 235 2886 233 C2879 231 2873 230 2866 228 C2860 227 2854 226 2848 224 C2847 224 2846 224 2845 224 C2839 222 2834 221 2829 220 C2787 210 2745 202 2703 195 C2699 194 2696 194 2692 193 C2671 189 2651 186 2630 183 C2625 183 2620 182 2615 181 C2605 180 2595 178 2585 177 C2582 177 2579 177 2576 176 C2575 176 2574 176 2573 176 C2568 175 2563 175 2557 174 C2483 165 2408 162 2333 161 C2332 161 2332 161 2330 161 C2308 161 2287 162 2265 162 Z M882 202 C857 202 832 203 807 203 C802 203 797 203 792 203 C791 203 790 203 789 203 C787 203 785 203 783 203 C780 203 778 203 775 203 C685 204 596 205 507 208 C506 208 505 208 504 208 C503 208 502 208 501 208 C500 208 498 208 496 208 C495 208 495 208 494 208 C478 208 462 209 446 209 C398 210 349 211 301 213 C300 213 299 213 298 214 C273 215 249 216 225 217 C223 217 222 217 221 218 C216 218 210 218 205 219 C199 219 192 219 185 220 C184 220 184 220 183 220 C179 220 176 220 172 221 C162 221 152 222 142 223 C135 223 128 224 121 224 C117 225 113 225 109 225 C106 226 102 226 99 226 C82 227 66 229 49 231 C43 231 37 232 32 232 C-19 237 -70 244 -120 252 C-121 252 -122 253 -123 253 C-131 254 -140 256 -148 257 C-155 258 -163 260 -170 261 C-210 268 -250 275 -290 284 C-294 285 -298 286 -302 287 C-320 291 -339 296 -357 301 C-365 303 -373 305 -381 307 C-390 308 -398 311 -407 314 C-412 315 -418 317 -423 319 C-424 319 -425 320 -427 320 C-435 323 -443 325 -452 327 C-458 329 -463 330 -468 332 C-477 335 -486 338 -494 341 C-507 345 -519 349 -531 353 C-533 354 -535 355 -536 355 C-540 357 -544 358 -548 359 C-551 361 -555 362 -559 363 C-594 376 -594 376 -608 383 C-617 387 -626 391 -635 394 C-642 397 -648 399 -654 402 C-657 403 -659 405 -661 406 C-671 410 -681 415 -692 420 C-694 422 -697 423 -699 424 C-700 425 -700 425 -702 426 C-705 427 -708 429 -711 430 C-712 431 -713 431 -714 432 C-716 433 -718 434 -721 435 C-743 446 -766 458 -783 475 C-784 476 -785 477 -785 477 C-794 486 -803 494 -810 504 C-811 506 -812 507 -813 508 C-816 511 -819 515 -821 518 C-821 519 -821 520 -821 520 C-822 520 -823 520 -823 520 C-852 562 -852 562 -861 579 C-862 580 -862 582 -863 583 C-868 591 -872 600 -876 608 C-878 612 -880 615 -881 618 C-882 619 -882 620 -882 620 C-884 624 -886 627 -887 630 C-892 639 -896 648 -900 657 C-901 659 -902 661 -903 663 C-905 668 -907 672 -909 677 C-911 683 -914 688 -916 693 C-921 702 -924 711 -928 720 C-929 721 -929 722 -929 723 C-930 725 -931 727 -932 729 C-933 732 -934 735 -935 737 C-938 744 -941 752 -944 759 C-946 766 -949 772 -951 778 C-960 799 -967 821 -974 842 C-976 847 -978 852 -979 858 C-980 859 -980 859 -980 860 C-982 864 -983 869 -985 873 C-989 884 -993 896 -996 908 C-998 913 -1000 919 -1001 924 C-1002 926 -1003 929 -1003 931 C-1005 935 -1006 939 -1007 944 C-1014 966 -1021 987 -1026 1009 C-1028 1017 -1031 1025 -1033 1033 C-1035 1041 -1037 1049 -1039 1057 C-1041 1064 -1043 1071 -1045 1078 C-1049 1090 -1052 1102 -1055 1115 C-1056 1118 -1057 1121 -1058 1124 C-1058 1125 -1058 1126 -1058 1127 C-1061 1136 -1063 1146 -1066 1156 C-1068 1164 -1070 1172 -1073 1180 C-1075 1189 -1077 1198 -1079 1207 C-1082 1216 -1084 1226 -1086 1235 C-1087 1236 -1087 1237 -1087 1238 C-1088 1243 -1089 1247 -1091 1252 C-1093 1263 -1096 1275 -1099 1286 C-1100 1290 -1101 1294 -1102 1297 C-1102 1298 -1102 1299 -1102 1300 C-1103 1304 -1104 1308 -1105 1312 C-1105 1313 -1105 1313 -1106 1314 C-1106 1316 -1106 1318 -1106 1320 C-1105 1324 -1105 1325 -1103 1328 C-1102 1329 -1102 1330 -1101 1332 C-1100 1333 -1099 1334 -1098 1336 C-1097 1336 -1097 1337 -1097 1337 C-1095 1340 -1093 1343 -1091 1346 C-1091 1346 -1091 1346 -1089 1348 C-1088 1350 -1087 1352 -1085 1354 C-1085 1355 -1084 1357 -1083 1358 C-1083 1358 -1082 1359 -1081 1360 C-1079 1364 -1076 1368 -1073 1371 C-1073 1372 -1072 1373 -1072 1373 C-1070 1375 -1069 1377 -1067 1380 C-1066 1380 -1066 1381 -1065 1382 C-1062 1386 -1058 1391 -1055 1395 C-1052 1399 -1049 1403 -1046 1407 C-1038 1417 -1031 1427 -1023 1436 C-1021 1438 -1021 1438 -1019 1441 C-1019 1441 -1018 1441 -1017 1441 C-1017 1442 -1017 1442 -1016 1443 C-1015 1445 -1014 1447 -1013 1449 C-1012 1449 -1011 1450 -1011 1451 C-1010 1451 -1010 1452 -1009 1453 C-1009 1454 -1008 1454 -1007 1455 C-1006 1456 -1005 1458 -1004 1459 C-1002 1462 -1000 1464 -998 1467 C-990 1477 -982 1486 -973 1496 C-968 1501 -964 1506 -959 1512 C-955 1517 -951 1522 -947 1527 C-944 1530 -942 1533 -939 1536 C-939 1536 -938 1536 -937 1536 C-937 1537 -937 1537 -937 1538 C-935 1541 -933 1543 -931 1546 C-928 1549 -925 1552 -922 1555 C-918 1560 -914 1564 -910 1568 C-908 1570 -908 1570 -907 1572 C-907 1572 -906 1572 -905 1572 C-905 1573 -905 1573 -904 1574 C-903 1576 -902 1578 -900 1580 C-900 1580 -899 1581 -899 1582 C-898 1582 -898 1583 -897 1584 C-892 1589 -888 1594 -883 1600 C-883 1600 -882 1600 -881 1600 C-881 1601 -881 1601 -881 1602 C-879 1605 -877 1608 -874 1610 C-874 1611 -873 1611 -873 1612 C-872 1613 -871 1614 -870 1615 C-868 1617 -867 1619 -865 1621 C-861 1626 -856 1632 -851 1637 C-847 1642 -842 1647 -838 1652 C-838 1653 -838 1653 -836 1655 C-835 1657 -833 1659 -831 1661 C-831 1661 -830 1661 -829 1661 C-829 1662 -829 1662 -829 1663 C-827 1666 -825 1669 -822 1671 C-822 1672 -821 1673 -821 1673 C-818 1677 -814 1680 -811 1684 C-807 1689 -802 1694 -798 1699 C-793 1705 -788 1711 -783 1717 C-780 1720 -777 1724 -775 1727 C-772 1730 -769 1734 -767 1737 C-763 1741 -759 1746 -756 1751 C-752 1755 -748 1760 -744 1764 C-742 1767 -740 1769 -738 1772 C-735 1775 -732 1779 -729 1782 C-726 1786 -722 1790 -719 1794 C-716 1797 -713 1801 -711 1804 C-707 1809 -703 1814 -699 1819 C-695 1823 -691 1828 -688 1832 C-684 1837 -680 1842 -676 1848 C-672 1853 -668 1857 -664 1862 C-654 1873 -645 1884 -637 1895 C-632 1901 -628 1907 -623 1912 C-621 1915 -619 1918 -616 1921 C-615 1922 -614 1924 -613 1925 C-607 1933 -600 1940 -594 1948 C-593 1950 -591 1952 -589 1954 C-583 1962 -576 1971 -569 1980 C-565 1986 -560 1993 -555 1999 C-549 2006 -543 2013 -538 2020 C-532 2028 -526 2036 -520 2043 C-516 2048 -512 2053 -508 2058 C-505 2062 -502 2066 -499 2070 C-496 2074 -494 2078 -491 2081 C-488 2085 -486 2088 -483 2092 C-482 2092 -482 2093 -481 2094 C-479 2097 -476 2100 -474 2104 C-468 2111 -463 2118 -457 2125 C-454 2130 -450 2135 -447 2139 C-443 2144 -440 2148 -437 2153 C-434 2157 -430 2161 -427 2166 C-422 2173 -416 2181 -411 2189 C-409 2190 -408 2192 -407 2194 C-404 2198 -401 2202 -398 2205 C-398 2206 -397 2207 -397 2207 C-391 2216 -385 2224 -379 2233 C-375 2238 -371 2244 -368 2249 C-364 2254 -360 2260 -357 2265 C-355 2267 -354 2269 -352 2271 C-348 2277 -344 2284 -339 2290 C-334 2299 -328 2307 -322 2315 C-319 2319 -316 2324 -314 2329 C-312 2332 -309 2336 -307 2339 C-305 2342 -303 2345 -301 2349 C-296 2358 -290 2366 -284 2375 C-284 2376 -284 2376 -282 2379 C-281 2380 -281 2381 -280 2382 C-280 2383 -279 2383 -279 2384 C-277 2387 -275 2390 -273 2393 C-266 2404 -259 2415 -253 2426 C-251 2428 -250 2431 -248 2434 C-246 2437 -244 2440 -242 2444 C-242 2444 -242 2444 -241 2446 C-240 2448 -239 2450 -238 2453 C-233 2460 -229 2468 -225 2476 C-221 2483 -217 2490 -213 2498 C-211 2503 -208 2507 -205 2512 C-203 2517 -200 2522 -198 2527 C-198 2528 -198 2529 -197 2530 C-196 2532 -195 2535 -194 2537 C-194 2538 -193 2539 -193 2540 C-192 2543 -190 2546 -189 2548 C-189 2549 -189 2550 -188 2551 C-184 2561 -180 2570 -176 2580 C-175 2583 -175 2585 -174 2587 C-172 2591 -170 2596 -169 2600 C-168 2602 -168 2604 -167 2606 C-165 2612 -163 2618 -161 2624 C-161 2625 -161 2625 -161 2626 C-158 2636 -156 2646 -153 2656 C-153 2657 -153 2658 -153 2659 C-151 2667 -149 2674 -148 2681 C-147 2682 -146 2682 -144 2682 C-141 2680 -139 2677 -136 2674 C-136 2673 -135 2672 -134 2671 C-133 2669 -132 2668 -130 2666 C-120 2653 -110 2641 -98 2629 C-98 2629 -97 2628 -97 2628 C-88 2619 -79 2610 -68 2603 C-68 2603 -68 2602 -68 2601 C-68 2601 -67 2601 -67 2601 C-64 2599 -61 2597 -58 2595 C-42 2584 -26 2573 -8 2565 C-7 2565 -5 2564 -4 2563 C1 2561 6 2559 11 2557 C12 2557 12 2557 13 2556 C34 2548 56 2543 78 2538 C80 2538 83 2537 85 2537 C111 2531 138 2529 165 2527 C168 2527 170 2527 172 2527 C197 2526 222 2525 248 2524 C248 2524 249 2524 250 2524 C311 2523 372 2522 433 2522 C436 2522 438 2522 441 2522 C530 2521 619 2521 844 2521 C873 2521 903 2521 932 2521 C934 2521 936 2521 938 2521 C946 2521 955 2521 963 2521 C986 2521 1009 2521 1032 2521 C1033 2521 1033 2521 1035 2521 C1069 2521 1102 2521 1135 2521 C1136 2521 1137 2521 1139 2521 C1156 2521 1173 2521 1191 2521 C1260 2521 1329 2521 1398 2521 C1415 2521 1433 2521 1450 2521 C1451 2521 1451 2521 1454 2521 C1487 2521 1520 2521 1553 2521 C1554 2521 1554 2521 1557 2521 C1580 2521 1603 2521 1626 2521 C1634 2521 1642 2521 1651 2521 C1653 2521 1655 2521 1657 2521 C1689 2521 1721 2521 1754 2521 C1787 2521 1820 2521 1854 2521 C1858 2521 1861 2521 1865 2521 C1866 2521 1867 2521 1868 2521 C1880 2521 1892 2521 1904 2521 C1973 2521 2042 2521 2111 2522 C2111 2522 2111 2522 2113 2522 C2156 2522 2198 2523 2240 2523 C2244 2523 2248 2523 2252 2523 C2270 2524 2287 2524 2304 2524 C2308 2524 2311 2524 2314 2524 C2368 2525 2422 2527 2476 2536 C2478 2536 2480 2537 2482 2537 C2491 2538 2500 2541 2509 2543 C2510 2543 2511 2543 2512 2544 C2518 2545 2523 2547 2528 2549 C2531 2550 2535 2551 2539 2552 C2544 2554 2550 2556 2555 2558 C2557 2559 2559 2560 2562 2561 C2586 2570 2607 2584 2628 2599 C2629 2600 2630 2601 2631 2601 C2641 2609 2651 2618 2660 2627 C2661 2628 2662 2629 2663 2630 C2663 2631 2664 2632 2665 2632 C2665 2632 2666 2632 2667 2632 C2667 2633 2667 2633 2667 2634 C2669 2637 2671 2638 2673 2640 C2677 2644 2681 2649 2684 2653 C2686 2655 2688 2657 2689 2659 C2696 2667 2703 2676 2709 2684 C2710 2684 2711 2683 2713 2682 C2713 2682 2713 2682 2713 2680 C2716 2662 2720 2643 2726 2625 C2727 2622 2728 2619 2729 2616 C2735 2596 2742 2577 2750 2557 C2752 2553 2754 2549 2755 2545 C2759 2535 2764 2525 2769 2515 C2770 2513 2771 2511 2772 2509 C2777 2499 2782 2489 2788 2480 C2794 2468 2794 2468 2797 2462 C2800 2455 2804 2448 2808 2442 C2815 2430 2822 2419 2829 2407 C2832 2402 2835 2397 2838 2391 C2843 2383 2848 2375 2853 2367 C2858 2360 2862 2353 2867 2346 C2873 2337 2879 2328 2885 2318 C2890 2310 2895 2303 2901 2295 C2906 2287 2912 2279 2918 2271 C2923 2263 2929 2255 2934 2247 C2936 2244 2939 2241 2941 2238 C2941 2238 2942 2237 2942 2236 C2943 2235 2944 2234 2945 2233 C2947 2230 2950 2226 2952 2223 C2954 2220 2956 2217 2958 2214 C2963 2207 2968 2200 2974 2193 C2976 2189 2979 2186 2981 2182 C2987 2174 2993 2167 2998 2159 C3004 2152 3010 2144 3015 2136 C3024 2125 3032 2113 3041 2102 C3045 2097 3048 2092 3052 2088 C3054 2084 3057 2081 3060 2078 C3064 2072 3068 2066 3073 2060 C3079 2051 3086 2043 3093 2034 C3098 2028 3103 2021 3108 2014 C3112 2009 3117 2004 3121 1998 C3125 1993 3129 1988 3133 1982 C3139 1975 3145 1968 3151 1960 C3154 1956 3158 1952 3161 1947 C3168 1938 3175 1930 3182 1921 C3188 1915 3192 1909 3197 1902 C3201 1897 3205 1892 3209 1887 C3212 1884 3214 1881 3217 1878 C3223 1870 3229 1863 3235 1855 C3237 1853 3239 1850 3241 1848 C3244 1844 3247 1841 3250 1838 C3256 1830 3262 1823 3268 1815 C3274 1807 3281 1798 3288 1790 C3291 1787 3293 1784 3295 1782 C3296 1781 3296 1781 3297 1780 C3300 1776 3304 1771 3307 1767 C3310 1764 3313 1761 3315 1758 C3319 1753 3323 1748 3327 1743 C3329 1741 3331 1738 3333 1736 C3334 1735 3335 1734 3335 1734 C3337 1732 3338 1731 3339 1729 C3339 1729 3339 1729 3341 1727 C3341 1727 3341 1727 3342 1725 C3344 1723 3344 1723 3345 1720 C3345 1720 3346 1720 3347 1720 C3347 1720 3347 1720 3348 1718 C3352 1714 3356 1709 3360 1705 C3363 1701 3366 1697 3369 1693 C3373 1688 3377 1683 3382 1679 C3384 1676 3386 1674 3388 1671 C3395 1662 3403 1654 3411 1645 C3415 1640 3419 1635 3423 1630 C3428 1624 3434 1617 3439 1611 C3443 1607 3447 1603 3450 1598 C3453 1595 3456 1592 3458 1589 C3463 1584 3468 1578 3473 1572 C3474 1570 3476 1568 3478 1566 C3478 1566 3478 1566 3480 1564 C3482 1561 3484 1559 3487 1556 C3488 1554 3490 1552 3492 1550 C3492 1550 3493 1549 3493 1549 C3495 1546 3497 1544 3499 1542 C3504 1536 3509 1530 3514 1524 C3519 1520 3523 1515 3526 1510 C3533 1503 3539 1495 3546 1488 C3550 1483 3554 1478 3558 1473 C3560 1470 3563 1467 3566 1463 C3570 1459 3574 1455 3577 1450 C3581 1445 3585 1440 3589 1436 C3593 1430 3598 1424 3603 1419 C3606 1415 3609 1411 3612 1407 C3618 1400 3623 1393 3629 1385 C3631 1382 3633 1379 3635 1376 C3640 1369 3645 1362 3650 1354 C3652 1352 3653 1351 3654 1349 C3658 1343 3662 1338 3666 1332 C3666 1331 3666 1331 3667 1330 C3669 1327 3670 1324 3672 1321 C3671 1316 3669 1310 3668 1305 C3668 1304 3668 1304 3667 1303 C3666 1298 3665 1293 3664 1289 C3660 1275 3657 1261 3654 1247 C3651 1233 3647 1219 3643 1205 C3643 1204 3642 1202 3642 1201 C3641 1197 3640 1194 3639 1190 C3639 1188 3638 1186 3638 1184 C3636 1178 3634 1172 3632 1165 C3630 1158 3628 1150 3627 1142 C3623 1127 3619 1111 3615 1096 C3614 1093 3613 1091 3612 1088 C3611 1084 3610 1081 3609 1077 C3608 1071 3606 1065 3604 1059 C3603 1053 3602 1048 3600 1043 C3598 1037 3596 1030 3595 1023 C3589 1003 3583 983 3577 963 C3575 957 3573 951 3572 945 C3563 914 3553 884 3542 854 C3541 849 3539 845 3538 841 C3533 827 3528 813 3523 798 C3522 797 3522 796 3521 795 C3515 776 3508 758 3500 740 C3499 736 3497 732 3496 728 C3495 727 3494 725 3494 724 C3493 722 3492 719 3491 716 C3488 710 3486 704 3483 698 C3481 694 3480 691 3478 687 C3474 677 3470 668 3465 658 C3464 656 3463 654 3462 652 C3462 651 3461 650 3461 649 C3458 643 3455 636 3452 629 C3447 620 3443 610 3438 601 C3436 599 3435 596 3434 593 C3431 588 3429 584 3426 580 C3425 577 3423 575 3422 572 C3415 560 3408 549 3400 537 C3399 536 3398 534 3396 532 C3387 518 3378 505 3367 492 C3366 492 3365 492 3365 492 C3365 492 3364 491 3364 491 C3359 482 3349 474 3342 467 C3337 463 3332 460 3327 457 C3326 457 3324 456 3323 455 C3320 453 3316 451 3313 449 C3312 449 3311 448 3310 448 C3302 443 3294 439 3285 435 C3283 433 3280 432 3278 431 C3270 427 3263 423 3255 419 C3252 418 3250 416 3248 415 C3240 411 3231 407 3222 403 C3217 401 3212 399 3206 396 C3179 384 3179 384 3165 379 C3161 378 3156 376 3151 373 C3144 370 3135 367 3127 364 C3125 364 3122 363 3120 362 C3119 361 3118 361 3116 361 C3113 359 3109 358 3105 357 C3085 350 3065 343 3045 336 C3039 334 3034 333 3028 331 C3028 331 3028 331 3026 330 C3023 329 3020 328 3018 327 C3006 324 2994 320 2982 317 C2981 316 2981 316 2980 316 C2968 312 2956 309 2944 306 C2941 305 2938 305 2935 304 C2927 302 2920 300 2912 298 C2906 297 2901 296 2896 295 C2886 292 2876 290 2867 288 C2861 286 2856 285 2851 284 C2827 278 2803 274 2778 270 C2776 269 2774 269 2772 268 C2771 268 2769 268 2768 268 C2759 266 2751 265 2742 263 C2731 260 2720 259 2709 257 C2706 256 2702 256 2699 255 C2674 251 2648 247 2623 244 C2620 243 2617 243 2614 242 C2605 241 2595 240 2586 239 C2585 239 2584 239 2582 239 C2580 238 2577 238 2575 238 C2570 237 2566 237 2562 236 C2544 234 2526 233 2508 231 C2499 230 2490 229 2481 228 C2459 226 2437 224 2416 222 C2415 222 2414 222 2413 222 C2412 222 2411 222 2410 222 C2403 221 2395 221 2388 220 C2347 217 2307 215 2267 214 C2262 213 2256 213 2251 213 C2174 210 2097 208 2019 206 C2013 206 2006 206 1999 206 C1929 205 1859 204 1789 203 C1786 203 1782 203 1779 203 C1774 202 1768 202 1763 202 C1761 202 1759 202 1757 202 C1733 202 1710 202 1687 201 C1685 201 1683 201 1681 201 C1609 200 1537 200 1466 200 C1455 200 1445 200 1435 200 C1432 200 1429 200 1426 200 C1425 200 1424 200 1424 200 C1403 200 1382 200 1361 200 C1360 200 1359 200 1358 200 C1354 200 1350 200 1346 200 C1346 200 1345 200 1344 200 C1342 200 1341 200 1339 200 C1315 200 1292 200 1268 200 C1115 200 1115 200 882 202 Z M-1112 1346 C-1113 1347 -1113 1347 -1115 1349 C-1119 1362 -1122 1375 -1125 1387 C-1126 1392 -1127 1398 -1128 1403 C-1128 1404 -1129 1405 -1129 1406 C-1130 1412 -1132 1418 -1133 1424 C-1136 1438 -1140 1452 -1143 1467 C-1148 1491 -1154 1515 -1159 1539 C-1161 1547 -1163 1555 -1165 1563 C-1169 1580 -1173 1596 -1177 1612 C-1179 1620 -1181 1627 -1183 1635 C-1184 1640 -1185 1645 -1186 1651 C-1191 1670 -1195 1688 -1199 1707 C-1201 1718 -1203 1728 -1206 1739 C-1210 1754 -1213 1769 -1217 1784 C-1217 1788 -1218 1792 -1219 1796 C-1223 1812 -1226 1828 -1230 1843 C-1233 1858 -1237 1873 -1240 1887 C-1246 1915 -1252 1942 -1258 1970 C-1261 1981 -1263 1992 -1266 2004 C-1270 2022 -1274 2041 -1278 2060 C-1280 2067 -1281 2074 -1283 2081 C-1283 2082 -1283 2084 -1284 2085 C-1286 2095 -1288 2104 -1290 2114 C-1293 2129 -1297 2144 -1300 2160 C-1300 2160 -1300 2161 -1301 2162 C-1305 2183 -1310 2203 -1314 2224 C-1315 2231 -1317 2238 -1318 2245 C-1321 2256 -1323 2266 -1325 2277 C-1327 2286 -1328 2294 -1330 2303 C-1332 2314 -1335 2324 -1337 2335 C-1338 2343 -1340 2350 -1341 2358 C-1345 2376 -1349 2393 -1352 2411 C-1354 2422 -1356 2433 -1358 2444 C-1360 2452 -1361 2459 -1363 2467 C-1364 2473 -1365 2479 -1366 2485 C-1370 2507 -1374 2530 -1378 2552 C-1379 2559 -1380 2565 -1381 2572 C-1381 2573 -1382 2574 -1382 2575 C-1382 2577 -1382 2579 -1383 2581 C-1386 2601 -1389 2622 -1392 2642 C-1393 2647 -1394 2653 -1395 2658 C-1396 2665 -1397 2672 -1398 2678 C-1399 2688 -1400 2697 -1401 2707 C-1404 2722 -1406 2738 -1407 2753 C-1407 2755 -1408 2756 -1408 2758 C-1410 2778 -1412 2798 -1414 2818 C-1414 2821 -1414 2824 -1415 2827 C-1416 2840 -1417 2854 -1418 2867 C-1418 2870 -1418 2873 -1418 2876 C-1419 2878 -1419 2880 -1419 2882 C-1419 2886 -1419 2890 -1420 2894 C-1420 2904 -1421 2914 -1421 2924 C-1421 2924 -1421 2924 -1421 2927 C-1421 2949 -1421 2971 -1421 2993 C-1421 2996 -1421 2999 -1421 3002 C-1422 3049 -1419 3095 -1412 3142 C-1411 3144 -1411 3147 -1411 3149 C-1408 3166 -1405 3184 -1401 3201 C-1401 3202 -1400 3203 -1400 3204 C-1397 3219 -1393 3234 -1388 3249 C-1388 3251 -1387 3252 -1387 3254 C-1387 3255 -1386 3256 -1386 3256 C-1385 3259 -1385 3261 -1384 3263 C-1381 3273 -1378 3284 -1374 3294 C-1374 3295 -1373 3295 -1373 3296 C-1369 3307 -1364 3318 -1359 3329 C-1358 3332 -1357 3334 -1356 3336 C-1356 3337 -1355 3338 -1355 3339 C-1353 3342 -1352 3346 -1350 3349 C-1347 3356 -1344 3363 -1340 3369 C-1339 3372 -1338 3374 -1336 3377 C-1329 3391 -1320 3406 -1311 3419 C-1311 3420 -1310 3421 -1309 3422 C-1302 3433 -1294 3444 -1286 3455 C-1284 3456 -1283 3458 -1282 3459 C-1269 3475 -1255 3492 -1239 3505 C-1237 3508 -1235 3510 -1233 3512 C-1219 3525 -1204 3537 -1188 3547 C-1188 3548 -1188 3548 -1185 3549 C-1176 3556 -1166 3562 -1156 3567 C-1153 3569 -1150 3571 -1146 3573 C-1141 3576 -1135 3579 -1129 3581 C-1127 3582 -1125 3583 -1123 3584 C-1121 3585 -1118 3586 -1116 3587 C-1116 3588 -1115 3588 -1114 3588 C-1108 3591 -1102 3593 -1095 3596 C-1094 3596 -1093 3597 -1092 3597 C-1084 3600 -1076 3602 -1068 3605 C-1067 3605 -1065 3606 -1063 3606 C-1021 3619 -976 3626 -932 3624 C-908 3623 -883 3620 -859 3616 C-857 3615 -854 3615 -851 3614 C-818 3608 -784 3596 -753 3581 C-752 3581 -750 3580 -749 3579 C-736 3573 -723 3566 -710 3558 C-710 3558 -710 3558 -708 3557 C-688 3545 -670 3532 -653 3518 C-652 3517 -651 3517 -651 3516 C-650 3516 -649 3515 -649 3515 C-647 3513 -646 3512 -644 3511 C-644 3511 -644 3510 -644 3509 C-644 3509 -644 3509 -643 3509 C-640 3507 -638 3505 -635 3503 C-635 3503 -635 3502 -635 3501 C-635 3501 -635 3501 -633 3501 C-631 3499 -630 3498 -628 3496 C-627 3495 -627 3495 -626 3494 C-625 3494 -625 3493 -624 3492 C-623 3491 -622 3490 -620 3488 C-620 3488 -619 3487 -619 3487 C-617 3485 -617 3485 -615 3484 C-615 3484 -615 3483 -615 3482 C-615 3482 -615 3482 -613 3482 C-609 3479 -606 3475 -603 3471 C-601 3470 -600 3469 -599 3468 C-597 3465 -595 3462 -592 3460 C-588 3455 -584 3451 -580 3446 C-580 3446 -579 3445 -579 3445 C-572 3437 -565 3429 -559 3420 C-559 3419 -558 3419 -557 3418 C-556 3416 -555 3414 -553 3412 C-551 3409 -549 3407 -547 3404 C-542 3397 -537 3389 -532 3382 C-531 3381 -530 3379 -529 3378 C-524 3372 -520 3366 -517 3360 C-515 3357 -514 3355 -513 3353 C-512 3352 -512 3351 -511 3350 C-508 3346 -505 3341 -502 3336 C-502 3335 -501 3334 -501 3333 C-498 3329 -495 3325 -493 3321 C-486 3310 -480 3299 -474 3288 C-471 3282 -467 3276 -463 3269 C-459 3261 -454 3253 -450 3245 C-447 3240 -444 3234 -441 3229 C-438 3223 -435 3217 -431 3211 C-428 3205 -425 3199 -422 3193 C-417 3184 -413 3176 -409 3168 C-407 3163 -405 3158 -402 3154 C-397 3145 -393 3136 -388 3127 C-388 3126 -387 3125 -387 3124 C-386 3123 -386 3122 -385 3121 C-382 3114 -379 3108 -376 3102 C-372 3096 -370 3090 -367 3084 C-363 3076 -360 3069 -356 3062 C-352 3056 -350 3050 -347 3044 C-343 3036 -340 3029 -336 3022 C-332 3016 -330 3010 -327 3004 C-324 2997 -320 2990 -317 2984 C-313 2977 -310 2971 -307 2964 C-301 2952 -295 2939 -288 2928 C-284 2921 -281 2914 -277 2907 C-273 2898 -269 2890 -264 2882 C-261 2876 -258 2871 -255 2865 C-253 2860 -250 2856 -248 2851 C-245 2847 -243 2843 -241 2839 C-238 2834 -235 2828 -232 2823 C-229 2817 -226 2812 -224 2807 C-222 2804 -221 2802 -219 2799 C-218 2797 -217 2795 -215 2792 C-214 2791 -213 2789 -212 2787 C-211 2785 -210 2784 -209 2782 C-207 2777 -204 2773 -201 2768 C-201 2768 -200 2767 -200 2766 C-195 2758 -190 2750 -184 2742 C-182 2739 -180 2736 -178 2733 C-172 2724 -166 2715 -160 2706 C-161 2697 -162 2688 -164 2679 C-164 2676 -165 2674 -165 2671 C-167 2660 -170 2649 -173 2638 C-173 2638 -173 2638 -174 2635 C-179 2620 -184 2605 -189 2590 C-190 2589 -190 2588 -191 2587 C-192 2583 -193 2579 -195 2576 C-195 2575 -196 2573 -196 2572 C-199 2566 -202 2559 -205 2553 C-207 2550 -208 2546 -210 2542 C-212 2537 -214 2533 -217 2528 C-217 2527 -218 2526 -218 2525 C-222 2517 -226 2510 -229 2502 C-230 2500 -231 2499 -232 2497 C-239 2482 -247 2467 -256 2453 C-258 2449 -260 2445 -262 2442 C-265 2437 -268 2432 -271 2427 C-274 2422 -277 2417 -280 2412 C-284 2405 -289 2397 -293 2390 C-294 2389 -295 2387 -296 2385 C-300 2380 -303 2374 -307 2369 C-310 2365 -312 2361 -315 2357 C-322 2345 -330 2334 -337 2322 C-340 2319 -342 2315 -345 2311 C-346 2310 -346 2309 -347 2307 C-349 2305 -350 2303 -351 2301 C-356 2295 -360 2289 -364 2282 C-368 2277 -372 2271 -376 2266 C-393 2241 -393 2241 -402 2229 C-405 2225 -408 2221 -411 2217 C-418 2207 -425 2197 -432 2187 C-437 2181 -441 2175 -446 2169 C-460 2150 -460 2150 -466 2142 C-470 2137 -473 2133 -476 2128 C-480 2123 -484 2118 -487 2113 C-491 2109 -494 2105 -497 2101 C-507 2087 -517 2074 -527 2061 C-534 2053 -540 2045 -546 2037 C-550 2032 -553 2028 -557 2023 C-561 2018 -564 2014 -568 2009 C-577 1996 -587 1984 -597 1972 C-598 1969 -600 1967 -602 1965 C-609 1956 -616 1947 -623 1938 C-624 1937 -625 1936 -626 1935 C-629 1931 -632 1927 -636 1923 C-642 1916 -647 1909 -653 1901 C-657 1897 -661 1892 -664 1888 C-668 1884 -670 1880 -673 1877 C-676 1874 -678 1871 -680 1868 C-685 1863 -689 1858 -693 1853 C-698 1846 -703 1840 -709 1833 C-711 1831 -713 1828 -715 1825 C-717 1822 -720 1820 -722 1817 C-723 1816 -724 1814 -726 1812 C-729 1808 -733 1804 -736 1800 C-742 1792 -748 1785 -754 1777 C-755 1776 -756 1775 -756 1774 C-758 1772 -760 1770 -761 1768 C-762 1768 -763 1768 -763 1768 C-763 1768 -764 1767 -764 1767 C-765 1764 -767 1762 -769 1760 C-775 1754 -781 1747 -785 1740 C-786 1740 -787 1740 -787 1740 C-788 1740 -788 1739 -788 1739 C-789 1736 -791 1735 -792 1733 C-792 1732 -792 1732 -794 1730 C-795 1730 -795 1729 -796 1728 C-797 1727 -798 1725 -800 1724 C-800 1723 -801 1722 -802 1721 C-804 1719 -806 1716 -808 1714 C-814 1706 -820 1699 -826 1692 C-836 1681 -836 1681 -840 1675 C-843 1672 -846 1668 -849 1665 C-853 1660 -857 1655 -861 1650 C-865 1646 -868 1642 -872 1638 C-874 1635 -876 1633 -879 1630 C-883 1625 -887 1620 -892 1615 C-897 1609 -903 1603 -908 1596 C-913 1590 -918 1585 -923 1579 C-928 1574 -932 1569 -937 1563 C-944 1555 -951 1547 -958 1539 C-962 1535 -966 1530 -970 1525 C-972 1522 -975 1519 -978 1516 C-983 1511 -988 1505 -992 1499 C-994 1497 -996 1495 -997 1493 C-999 1492 -1000 1490 -1001 1488 C-1002 1488 -1003 1488 -1003 1488 C-1003 1488 -1004 1487 -1004 1487 C-1006 1484 -1008 1481 -1010 1478 C-1014 1473 -1018 1469 -1022 1463 C-1026 1459 -1029 1455 -1033 1450 C-1037 1445 -1042 1439 -1046 1434 C-1050 1429 -1053 1425 -1057 1421 C-1067 1408 -1077 1395 -1086 1381 C-1088 1378 -1091 1375 -1093 1371 C-1094 1370 -1095 1368 -1096 1367 C-1098 1363 -1101 1360 -1103 1356 C-1104 1355 -1105 1354 -1105 1353 C-1107 1351 -1109 1349 -1110 1346 C-1111 1346 -1112 1346 -1112 1346 Z M3675 1347 C3672 1350 3671 1352 3669 1355 C3666 1360 3662 1365 3659 1370 C3655 1375 3652 1379 3649 1384 C3645 1390 3641 1396 3637 1401 C3635 1403 3634 1405 3632 1407 C3629 1411 3626 1415 3623 1419 C3619 1424 3616 1428 3612 1433 C3603 1445 3594 1456 3584 1467 C3580 1472 3577 1476 3574 1480 C3568 1488 3561 1495 3555 1502 C3555 1503 3555 1504 3555 1504 C3554 1504 3553 1504 3553 1504 C3552 1505 3552 1506 3551 1506 C3547 1512 3542 1517 3537 1523 C3534 1526 3531 1530 3528 1534 C3526 1536 3525 1538 3523 1539 C3523 1540 3523 1541 3523 1541 C3522 1541 3521 1541 3521 1541 C3520 1542 3520 1543 3519 1543 C3513 1550 3507 1557 3501 1564 C3497 1569 3493 1573 3489 1578 C3482 1587 3474 1595 3467 1604 C3463 1608 3460 1612 3456 1616 C3453 1620 3450 1624 3447 1627 C3444 1631 3441 1634 3438 1638 C3435 1642 3431 1646 3427 1651 C3422 1656 3417 1662 3413 1667 C3410 1671 3407 1674 3404 1677 C3401 1681 3397 1685 3394 1689 C3390 1695 3385 1701 3380 1706 C3373 1713 3367 1721 3361 1728 C3358 1733 3354 1737 3351 1741 C3351 1742 3351 1743 3351 1743 C3350 1744 3349 1744 3348 1744 C3346 1746 3344 1748 3343 1750 C3343 1751 3343 1752 3343 1752 C3342 1752 3341 1752 3341 1752 C3340 1753 3339 1754 3339 1755 C3332 1764 3325 1772 3317 1781 C3312 1788 3306 1794 3301 1801 C3296 1807 3292 1813 3287 1818 C3287 1819 3287 1820 3287 1820 C3286 1820 3285 1820 3285 1820 C3284 1821 3283 1822 3283 1823 C3278 1829 3273 1835 3268 1841 C3265 1845 3261 1849 3258 1854 C3254 1859 3250 1864 3246 1868 C3238 1878 3230 1888 3222 1898 C3219 1902 3215 1906 3212 1910 C3208 1915 3204 1919 3201 1924 C3196 1931 3190 1937 3185 1944 C3176 1954 3168 1965 3160 1976 C3156 1981 3152 1986 3148 1990 C3141 1999 3135 2007 3129 2015 C3125 2020 3122 2024 3118 2028 C3113 2035 3107 2042 3102 2050 C3096 2057 3091 2065 3085 2072 C3081 2078 3076 2083 3072 2089 C3071 2090 3069 2092 3068 2094 C3064 2100 3059 2106 3054 2112 C3051 2116 3048 2120 3045 2124 C3040 2130 3035 2137 3030 2144 C3028 2147 3026 2150 3024 2152 C3018 2159 3013 2167 3008 2174 C3004 2180 3000 2186 2995 2191 C2989 2200 2983 2208 2977 2216 C2975 2218 2974 2220 2973 2222 C2972 2223 2971 2224 2971 2225 C2969 2227 2967 2230 2965 2233 C2964 2234 2963 2235 2963 2236 C2961 2237 2960 2239 2959 2241 C2954 2247 2950 2253 2946 2259 C2943 2263 2940 2267 2937 2271 C2934 2275 2931 2280 2928 2284 C2927 2287 2925 2289 2923 2292 C2920 2295 2918 2298 2916 2302 C2911 2311 2904 2320 2898 2328 C2893 2335 2888 2343 2884 2350 C2883 2351 2883 2352 2882 2353 C2879 2357 2877 2362 2874 2366 C2865 2380 2865 2380 2861 2387 C2857 2392 2854 2397 2851 2402 C2849 2404 2848 2406 2847 2408 C2842 2417 2837 2425 2832 2434 C2829 2438 2826 2443 2824 2448 C2822 2451 2820 2454 2818 2458 C2816 2461 2814 2465 2811 2469 C2808 2473 2806 2478 2804 2483 C2802 2487 2800 2490 2798 2494 C2788 2510 2781 2528 2773 2546 C2771 2550 2769 2555 2767 2560 C2760 2573 2755 2587 2750 2602 C2749 2604 2748 2605 2748 2607 C2742 2622 2738 2637 2734 2652 C2734 2655 2733 2659 2732 2662 C2730 2672 2727 2682 2726 2692 C2726 2692 2726 2692 2725 2695 C2725 2698 2725 2701 2725 2704 C2726 2709 2728 2712 2731 2716 C2731 2716 2731 2716 2732 2718 C2734 2720 2735 2723 2737 2725 C2737 2726 2738 2727 2738 2728 C2741 2732 2744 2736 2746 2740 C2754 2753 2762 2765 2770 2778 C2776 2790 2783 2801 2790 2813 C2795 2820 2799 2827 2803 2835 C2803 2836 2804 2838 2805 2839 C2805 2840 2805 2840 2806 2841 C2808 2844 2810 2848 2812 2852 C2815 2856 2817 2860 2819 2865 C2821 2869 2823 2873 2826 2877 C2829 2883 2832 2889 2835 2895 C2837 2899 2839 2903 2842 2908 C2842 2908 2842 2908 2843 2910 C2846 2916 2849 2921 2852 2927 C2855 2932 2857 2937 2859 2942 C2861 2944 2862 2947 2864 2950 C2867 2956 2871 2963 2874 2969 C2875 2972 2876 2975 2878 2977 C2879 2981 2881 2984 2883 2987 C2886 2994 2890 3001 2893 3008 C2896 3014 2899 3020 2902 3026 C2904 3031 2907 3036 2910 3041 C2913 3047 2916 3053 2919 3060 C2923 3067 2926 3074 2930 3081 C2934 3088 2937 3095 2941 3102 C2942 3106 2944 3109 2946 3112 C2946 3114 2947 3115 2948 3116 C2948 3117 2948 3117 2949 3118 C2953 3127 2953 3127 2955 3131 C2956 3133 2957 3136 2959 3138 C2962 3144 2965 3150 2968 3157 C2971 3164 2975 3171 2978 3177 C2981 3183 2984 3188 2987 3193 C2990 3199 2992 3204 2995 3210 C2998 3215 3000 3220 3003 3225 C3006 3230 3009 3236 3012 3241 C3014 3245 3016 3248 3017 3252 C3022 3261 3027 3269 3032 3278 C3034 3282 3037 3287 3039 3292 C3041 3295 3043 3298 3045 3302 C3047 3304 3048 3307 3050 3310 C3052 3314 3055 3319 3058 3323 C3060 3326 3062 3329 3063 3332 C3075 3351 3087 3369 3099 3387 C3100 3389 3101 3390 3102 3391 C3109 3401 3116 3411 3124 3420 C3127 3424 3130 3427 3133 3431 C3133 3431 3134 3432 3134 3433 C3137 3436 3140 3440 3143 3443 C3147 3448 3151 3453 3155 3458 C3160 3462 3160 3462 3161 3464 C3161 3464 3162 3464 3163 3464 C3163 3465 3163 3465 3164 3466 C3165 3468 3166 3470 3168 3472 C3169 3472 3169 3473 3170 3474 C3171 3474 3171 3475 3172 3476 C3173 3477 3174 3477 3174 3478 C3177 3480 3179 3483 3181 3485 C3183 3487 3185 3488 3186 3490 C3190 3494 3194 3497 3198 3501 C3198 3501 3199 3501 3200 3501 C3200 3502 3200 3503 3201 3504 C3202 3506 3204 3507 3206 3509 C3207 3509 3208 3510 3209 3511 C3211 3513 3214 3515 3217 3517 C3217 3517 3218 3517 3219 3517 C3219 3518 3219 3519 3219 3519 C3234 3532 3251 3543 3268 3554 C3271 3556 3273 3557 3275 3558 C3290 3568 3305 3576 3322 3583 C3324 3584 3327 3585 3330 3587 C3347 3595 3366 3600 3385 3606 C3387 3606 3390 3607 3392 3608 C3404 3611 3415 3614 3427 3616 C3428 3616 3428 3617 3429 3617 C3476 3626 3522 3626 3569 3619 C3570 3619 3571 3619 3573 3619 C3596 3616 3618 3610 3641 3602 C3642 3602 3643 3602 3643 3601 C3656 3597 3668 3593 3680 3587 C3683 3586 3685 3585 3688 3583 C3701 3578 3713 3571 3725 3564 C3727 3563 3729 3561 3731 3560 C3754 3546 3776 3530 3795 3512 C3797 3510 3799 3508 3802 3506 C3811 3498 3820 3489 3828 3479 C3830 3476 3832 3474 3835 3471 C3849 3455 3861 3437 3873 3419 C3874 3418 3875 3416 3876 3414 C3878 3412 3879 3410 3881 3407 C3881 3406 3882 3405 3883 3403 C3895 3385 3905 3365 3914 3345 C3914 3345 3914 3344 3915 3343 C3916 3339 3918 3335 3920 3331 C3920 3330 3921 3329 3922 3327 C3938 3290 3951 3251 3960 3211 C3961 3209 3961 3207 3962 3205 C3967 3184 3970 3163 3974 3142 C3974 3141 3974 3140 3974 3139 C3977 3122 3979 3104 3981 3087 C3981 3084 3981 3082 3981 3080 C3982 3076 3982 3072 3982 3068 C3983 3067 3983 3065 3983 3064 C3985 3039 3985 3013 3985 2987 C3985 2982 3985 2977 3985 2972 C3985 2941 3984 2909 3982 2877 C3982 2877 3982 2877 3982 2873 C3980 2856 3979 2838 3977 2820 C3977 2815 3976 2810 3976 2805 C3972 2760 3967 2715 3960 2671 C3960 2669 3959 2668 3959 2666 C3959 2666 3959 2666 3959 2664 C3958 2656 3957 2649 3956 2641 C3954 2627 3952 2612 3949 2598 C3949 2597 3949 2595 3948 2594 C3948 2593 3948 2593 3948 2591 C3947 2584 3946 2578 3945 2571 C3945 2570 3944 2569 3944 2567 C3943 2559 3943 2559 3942 2554 C3940 2538 3937 2521 3934 2504 C3932 2498 3931 2492 3930 2486 C3930 2483 3929 2480 3928 2476 C3928 2475 3928 2474 3928 2472 C3927 2472 3927 2471 3927 2470 C3927 2468 3926 2466 3926 2464 C3926 2464 3926 2463 3926 2462 C3925 2461 3925 2460 3925 2458 C3924 2455 3924 2452 3923 2448 C3922 2441 3920 2435 3919 2428 C3914 2400 3914 2400 3911 2387 C3911 2386 3911 2386 3911 2385 C3908 2372 3906 2359 3903 2346 C3903 2345 3903 2344 3903 2343 C3901 2333 3898 2323 3896 2313 C3894 2302 3891 2290 3889 2279 C3884 2255 3879 2231 3874 2207 C3874 2204 3873 2202 3873 2200 C3867 2170 3860 2141 3854 2111 C3853 2107 3852 2102 3850 2097 C3850 2096 3850 2095 3850 2094 C3849 2089 3848 2084 3847 2079 C3845 2071 3843 2062 3841 2053 C3837 2037 3833 2020 3830 2004 C3827 1991 3824 1978 3822 1965 C3819 1952 3816 1938 3813 1925 C3813 1924 3812 1923 3812 1922 C3810 1915 3809 1907 3807 1900 C3807 1899 3807 1899 3806 1897 C3804 1884 3801 1871 3798 1859 C3797 1851 3795 1843 3793 1835 C3791 1827 3789 1819 3787 1810 C3784 1796 3781 1783 3778 1769 C3777 1768 3777 1767 3777 1766 C3775 1757 3773 1749 3771 1740 C3768 1727 3765 1714 3762 1702 C3760 1693 3758 1684 3756 1676 C3754 1669 3753 1663 3752 1656 C3750 1649 3749 1643 3747 1636 C3747 1635 3747 1635 3747 1633 C3744 1620 3740 1606 3737 1593 C3735 1585 3733 1577 3731 1569 C3730 1564 3729 1559 3728 1555 C3725 1544 3723 1534 3721 1524 C3717 1508 3714 1492 3710 1477 C3708 1469 3706 1461 3704 1453 C3704 1453 3704 1453 3703 1451 C3698 1428 3692 1405 3687 1382 C3687 1381 3687 1380 3687 1379 C3686 1377 3686 1376 3685 1374 C3684 1369 3683 1364 3681 1359 C3680 1355 3680 1352 3680 1348 C3679 1348 3679 1348 3675 1347 Z\" transform=\"translate(1788 236)\"/><g id=\"gamepadTestSwitchPath2\" class=\"gamepad-test-control\" data-gamepad-control=\"LB\"><path d=\"M0 0 C2 0 4 0 6 0 C6 0 7 0 8 0 C9 0 10 0 11 0 C12 0 12 1 13 1 C14 21 14 42 15 63 C15 63 15 63 16 64 C28 65 39 65 51 66 C51 66 52 67 52 67 C52 71 52 74 52 78 C52 78 51 79 51 79 C23 80 23 80 10 80 C9 80 8 80 7 80 C4 80 1 80 -2 79 C-3 62 -3 44 -3 27 C-3 25 -2 22 -2 19 C-2 13 -2 7 -2 1 C-1 1 -1 0 0 0 Z\" transform=\"translate(1543 316)\"/></g><g id=\"gamepadTestSwitchPath3\" class=\"gamepad-test-control\" data-gamepad-control=\"RB\"><path d=\"M0 0 C4 0 9 0 13 0 C13 0 13 0 16 0 C35 0 35 0 41 2 C44 3 47 5 50 7 C52 9 54 11 55 14 C56 17 57 20 57 23 C57 28 56 32 55 36 C53 39 51 42 49 44 C47 46 44 47 42 49 C44 53 46 57 49 60 C52 65 55 70 58 76 C58 77 58 78 58 79 C54 80 49 80 45 80 C42 78 40 76 38 73 C38 72 37 72 37 71 C36 70 36 69 35 67 C34 66 34 65 33 64 C33 63 32 62 31 61 C30 58 28 56 27 53 C26 53 26 52 25 52 C23 52 22 52 20 52 C19 52 18 52 17 52 C16 52 16 52 15 52 C15 52 14 53 14 53 C14 54 14 54 14 55 C14 58 14 60 14 63 C14 64 13 65 13 66 C13 67 13 68 13 69 C13 70 13 71 13 72 C13 74 13 76 12 79 C6 80 3 80 -3 79 C-3 54 -3 28 -3 2 C-2 1 -1 1 0 0 Z M16 14 C15 15 13 17 12 18 C12 24 13 29 13 35 C14 36 16 36 17 37 C20 37 20 37 24 37 C25 37 26 37 28 37 C31 37 31 37 34 36 C35 36 35 35 36 35 C38 32 38 32 40 30 C40 27 40 24 40 21 C39 20 38 19 37 18 C36 18 36 17 35 16 C33 15 33 15 31 14 C28 14 25 14 22 14 C21 14 20 14 18 14 C18 14 17 14 16 14 Z\" transform=\"translate(4544 316)\"/></g><path d=\"M0 0 C1 0 2 0 3 0 C19 0 35 2 50 8 C57 10 64 13 70 17 C71 18 72 19 73 19 C87 28 101 40 111 53 C121 66 128 80 133 96 C133 98 134 100 134 102 C135 103 135 104 135 105 C137 111 138 118 139 124 C139 125 139 125 139 127 C140 142 139 156 135 170 C135 171 135 172 135 173 C131 187 126 201 118 213 C107 228 94 242 79 252 C67 260 55 266 42 271 C41 271 40 271 39 271 C27 275 15 276 3 276 C0 276 -2 276 -4 276 C-20 276 -35 273 -50 267 C-65 262 -78 253 -90 243 C-99 235 -107 226 -114 216 C-115 215 -116 213 -117 212 C-125 199 -130 186 -133 172 C-133 171 -134 170 -134 169 C-134 168 -134 167 -135 166 C-137 155 -138 144 -138 133 C-138 132 -138 131 -138 130 C-137 113 -132 96 -126 80 C-123 74 -120 68 -116 62 C-115 61 -114 61 -114 60 C-106 48 -97 38 -86 29 C-84 28 -82 27 -81 25 C-70 17 -58 11 -45 6 C-30 2 -16 0 0 0 Z M-49 30 C-50 31 -51 31 -53 32 C-53 32 -54 33 -55 33 C-66 39 -77 47 -86 56 C-89 60 -91 63 -94 66 C-94 67 -95 68 -95 69 C-103 80 -110 93 -114 105 C-118 120 -119 135 -118 150 C-117 160 -115 169 -111 178 C-111 180 -110 181 -109 183 C-109 184 -109 184 -108 185 C-103 195 -98 203 -92 211 C-90 213 -89 215 -88 217 C-87 218 -86 219 -85 220 C-84 220 -83 220 -83 220 C-82 221 -82 222 -82 222 C-81 224 -81 224 -79 226 C-76 228 -73 230 -71 232 C-70 233 -70 233 -68 234 C-58 242 -46 247 -33 251 C-18 256 -4 257 12 256 C27 255 40 250 53 244 C64 239 73 231 82 223 C83 223 84 222 85 221 C91 216 95 209 99 202 C100 202 100 202 101 200 C108 189 113 176 116 163 C117 163 117 162 117 161 C119 154 119 146 119 139 C119 136 119 134 119 132 C119 121 117 112 114 101 C113 98 111 94 109 90 C109 90 109 90 108 87 C101 74 93 62 83 51 C75 44 65 37 55 32 C55 32 54 32 53 31 C45 27 37 25 28 22 C28 22 28 22 25 21 C0 16 -26 20 -49 30 Z\" transform=\"translate(3674 797)\"/><g id=\"gamepadTestSwitchPath5\" class=\"gamepad-test-control\" data-gamepad-control=\"Select\"><path d=\"M0 0 C17 6 32 16 46 28 C47 28 47 28 49 30 C53 33 55 36 58 40 C59 41 60 42 61 43 C71 54 79 67 85 81 C86 85 87 88 88 92 C89 93 89 93 89 94 C91 101 92 108 93 115 C93 116 93 118 94 119 C95 134 94 150 91 165 C87 180 81 194 72 207 C67 215 60 223 52 230 C52 230 51 231 51 232 C41 242 29 250 16 256 C15 257 14 257 12 258 C12 258 11 259 10 259 C-4 265 -18 269 -32 270 C-45 270 -56 270 -69 268 C-70 268 -71 268 -72 267 C-87 265 -100 259 -113 252 C-127 245 -139 234 -149 222 C-160 209 -168 195 -174 179 C-180 162 -183 145 -183 127 C-182 112 -179 96 -173 81 C-166 63 -155 48 -143 34 C-141 32 -139 31 -138 29 C-137 29 -136 29 -136 29 C-136 28 -136 28 -136 27 C-119 14 -103 4 -82 -2 C-56 -9 -26 -8 0 0 Z M-95 26 C-103 29 -110 34 -117 39 C-117 40 -118 40 -119 41 C-125 45 -129 49 -134 55 C-134 56 -135 57 -136 58 C-141 64 -145 70 -149 77 C-149 77 -149 77 -150 80 C-156 90 -159 101 -161 112 C-163 129 -162 146 -159 163 C-155 176 -149 188 -141 199 C-136 207 -130 214 -123 220 C-122 221 -121 221 -120 222 C-113 228 -107 232 -99 236 C-97 237 -94 238 -92 239 C-80 245 -67 248 -53 250 C-39 251 -26 249 -14 246 C-2 243 9 238 20 231 C25 227 29 224 33 220 C34 219 35 218 36 218 C46 209 53 199 59 188 C60 187 60 186 61 186 C67 176 70 164 72 153 C75 140 75 126 73 113 C72 110 71 106 70 103 C70 102 70 101 70 100 C67 88 59 76 52 65 C48 59 44 54 39 49 C39 49 38 49 37 49 C37 48 37 48 35 45 C35 45 34 45 33 45 C33 44 33 43 32 42 C20 32 20 32 13 29 C13 29 12 28 12 28 C-2 21 -16 16 -31 14 C-53 12 -76 16 -95 26 Z\" transform=\"translate(2512 806)\"/></g><g id=\"gamepadTestSwitchPath6\" class=\"gamepad-test-control\" data-gamepad-control=\"X\"><path d=\"M0 0 C20 7 38 16 54 29 C58 32 61 35 64 38 C65 39 67 40 68 42 C85 56 97 74 107 92 C116 109 122 127 126 146 C126 147 127 147 127 148 C131 167 131 187 128 206 C128 210 127 214 126 218 C126 219 126 219 126 220 C122 240 115 260 105 277 C104 279 103 281 101 283 C100 284 99 286 98 287 C87 304 73 320 57 332 C55 334 52 335 50 337 C48 339 45 341 42 343 C25 354 6 362 -14 368 C-21 370 -29 371 -37 372 C-38 372 -38 372 -39 372 C-47 373 -56 373 -64 373 C-65 373 -66 373 -67 373 C-85 373 -102 371 -120 365 C-121 365 -122 364 -123 364 C-129 362 -135 360 -141 357 C-141 357 -142 357 -143 356 C-163 346 -180 334 -197 318 C-198 317 -198 317 -199 316 C-205 311 -209 305 -214 299 C-214 299 -214 299 -215 297 C-228 281 -238 262 -245 242 C-248 233 -250 223 -252 213 C-252 212 -252 211 -253 210 C-256 190 -254 168 -251 148 C-250 141 -248 134 -246 127 C-246 126 -245 125 -245 125 C-238 102 -228 84 -214 65 C-210 60 -206 56 -202 51 C-200 49 -199 48 -197 46 C-194 42 -191 39 -187 36 C-186 35 -185 34 -184 34 C-167 20 -148 8 -127 1 C-125 0 -122 -1 -119 -2 C-118 -2 -117 -2 -117 -3 C-78 -14 -38 -12 0 0 Z M-95 12 C-96 12 -96 12 -97 12 C-114 16 -131 22 -147 31 C-150 33 -153 35 -156 37 C-157 38 -158 38 -159 39 C-163 42 -168 45 -172 48 C-172 49 -172 49 -172 50 C-172 50 -173 51 -174 51 C-181 55 -187 62 -192 68 C-203 81 -212 96 -220 112 C-220 113 -221 114 -221 115 C-229 132 -233 152 -235 171 C-236 190 -234 211 -229 229 C-223 248 -215 266 -203 282 C-202 283 -200 285 -199 287 C-199 287 -199 287 -197 290 C-187 302 -176 313 -163 322 C-162 323 -161 323 -160 324 C-144 335 -125 345 -106 350 C-89 354 -71 356 -54 355 C-39 354 -24 351 -10 346 C-9 346 -8 345 -7 345 C11 339 28 330 43 318 C46 316 49 313 52 310 C54 309 55 307 57 305 C61 302 64 299 67 295 C68 294 69 293 69 292 C76 285 80 278 85 270 C85 269 86 269 86 268 C87 266 88 265 89 263 C90 262 90 262 91 261 C99 248 104 233 107 218 C109 207 110 195 110 183 C110 182 110 181 110 181 C110 161 107 141 100 122 C95 110 90 99 82 88 C81 87 80 85 79 84 C72 74 65 63 55 55 C54 55 53 54 52 54 C52 53 51 52 51 51 C20 28 20 28 1 21 C0 21 0 21 -1 20 C-10 17 -20 14 -30 12 C-31 12 -32 12 -34 12 C-54 8 -74 8 -95 12 Z\" transform=\"translate(4592 813)\"/></g><path d=\"M0 0 C2 0 3 0 5 0 C6 0 7 0 8 0 C8 0 8 0 10 0 C11 1 13 2 14 3 C15 6 15 8 15 11 C15 12 15 13 15 15 C15 16 15 17 15 18 C15 19 15 20 15 21 C15 25 15 29 15 33 C15 42 15 51 15 60 C33 60 51 61 70 61 C71 62 71 62 74 67 C74 69 74 72 74 74 C73 76 71 78 70 80 C61 80 61 80 15 81 C15 98 15 116 15 134 C14 136 13 137 12 139 C10 140 10 140 8 141 C5 141 5 141 2 141 C0 140 -2 138 -4 137 C-5 130 -5 123 -5 115 C-5 104 -5 93 -6 82 C-6 82 -6 82 -8 81 C-10 81 -11 81 -13 81 C-14 81 -15 81 -16 81 C-17 81 -18 81 -20 81 C-21 81 -22 81 -23 81 C-27 81 -30 80 -34 80 C-37 80 -39 80 -42 80 C-48 80 -54 80 -60 80 C-61 78 -63 77 -64 75 C-64 72 -64 69 -64 66 C-62 64 -61 63 -59 61 C-50 61 -50 61 -5 60 C-5 42 -5 24 -5 6 C-4 4 -3 3 -2 1 C-1 1 -1 0 0 0 Z\" transform=\"translate(3669 864)\"/><g id=\"gamepadTestSwitchPath8\" class=\"gamepad-test-control\" data-gamepad-control=\"LeftStick\"><path d=\"M0 0 C4 0 8 0 11 0 C31 0 49 1 68 4 C69 4 69 4 72 5 C84 6 95 9 107 11 C108 11 109 12 110 12 C133 17 153 24 174 34 C177 35 180 36 183 38 C188 40 193 42 198 45 C198 45 199 45 200 46 C205 48 209 51 214 54 C216 55 219 57 222 58 C239 66 253 78 267 90 C269 91 271 92 272 94 C278 98 283 103 289 109 C291 111 293 113 295 114 C303 121 310 130 317 138 C317 139 317 140 317 140 C318 140 318 140 319 140 C328 151 336 162 343 173 C345 174 346 176 347 178 C351 183 354 188 357 193 C358 196 360 199 361 201 C364 207 367 212 370 218 C370 219 370 219 372 221 C381 240 390 260 396 281 C397 283 398 286 399 288 C401 295 402 302 404 308 C404 309 404 310 405 311 C407 322 410 333 412 344 C412 346 413 348 413 350 C422 395 419 445 412 490 C410 500 409 510 406 520 C406 521 406 522 405 523 C395 565 379 605 356 642 C355 644 354 646 352 648 C344 662 335 675 324 687 C322 690 319 694 317 697 C313 702 309 707 304 711 C302 713 301 715 299 717 C289 729 277 740 264 750 C262 751 260 753 258 755 C250 762 242 768 234 773 C231 775 229 776 226 778 C219 783 211 787 203 792 C201 793 198 795 195 797 C163 816 125 830 88 838 C85 838 83 839 80 840 C56 845 32 848 8 848 C7 848 6 848 5 848 C-2 848 -10 848 -17 848 C-18 848 -19 848 -20 848 C-59 848 -97 842 -134 830 C-135 830 -136 829 -137 829 C-139 828 -141 828 -143 827 C-146 826 -149 825 -151 824 C-158 822 -165 820 -172 817 C-172 817 -173 816 -174 816 C-183 813 -191 809 -200 804 C-201 804 -202 803 -203 803 C-238 784 -270 762 -299 735 C-301 733 -303 731 -305 730 C-308 727 -310 724 -313 721 C-314 719 -316 718 -318 716 C-319 715 -320 714 -321 713 C-322 712 -323 711 -324 710 C-324 710 -324 709 -324 708 C-325 708 -326 708 -327 707 C-327 707 -328 706 -328 705 C-335 697 -335 697 -339 693 C-345 686 -351 678 -356 670 C-357 669 -358 668 -358 666 C-375 642 -390 617 -401 589 C-402 587 -403 584 -404 582 C-407 576 -409 570 -411 563 C-412 561 -412 559 -413 557 C-419 539 -424 520 -428 501 C-428 501 -428 501 -428 499 C-431 484 -432 470 -433 455 C-433 453 -433 452 -433 450 C-436 405 -430 359 -418 315 C-416 311 -415 307 -414 303 C-414 302 -413 301 -413 301 C-407 283 -401 265 -392 248 C-391 246 -390 245 -389 243 C-379 223 -368 202 -354 184 C-353 183 -352 182 -352 181 C-343 170 -335 159 -325 148 C-324 147 -322 145 -321 144 C-321 144 -321 144 -320 142 C-318 141 -317 139 -316 138 C-313 134 -309 131 -305 127 C-303 125 -300 123 -298 121 C-292 114 -285 107 -278 101 C-275 99 -272 97 -269 94 C-263 90 -258 85 -252 81 C-250 80 -248 79 -246 78 C-238 72 -230 67 -222 62 C-221 62 -220 61 -220 61 C-209 55 -198 49 -187 43 C-186 43 -186 43 -185 42 C-177 38 -168 35 -160 32 C-156 30 -152 29 -149 27 C-118 15 -85 7 -52 2 C-51 2 -50 2 -49 2 C-33 0 -16 0 0 0 Z M-134 40 C-137 41 -140 42 -143 43 C-145 44 -147 45 -149 46 C-154 48 -160 51 -166 53 C-167 53 -167 54 -168 54 C-190 64 -212 76 -232 89 C-233 90 -234 91 -235 91 C-249 101 -262 111 -275 123 C-276 124 -277 125 -279 126 C-284 131 -290 136 -295 141 C-296 142 -297 143 -298 144 C-303 149 -307 154 -312 159 C-313 160 -314 161 -315 163 C-325 174 -334 186 -343 199 C-344 200 -344 202 -345 203 C-347 205 -348 207 -350 210 C-351 212 -352 214 -354 216 C-362 230 -370 243 -377 258 C-378 261 -380 264 -381 266 C-384 272 -386 279 -388 285 C-390 288 -391 292 -392 295 C-402 321 -408 347 -412 375 C-413 377 -413 379 -413 381 C-420 421 -417 463 -409 502 C-409 506 -408 510 -407 514 C-407 516 -406 517 -406 519 C-401 544 -392 569 -381 592 C-380 594 -379 596 -378 597 C-371 614 -371 614 -366 621 C-365 623 -363 626 -362 628 C-358 636 -353 643 -348 650 C-346 653 -345 656 -343 658 C-338 665 -333 672 -328 678 C-327 679 -326 680 -325 681 C-319 689 -312 697 -305 704 C-302 707 -299 710 -296 713 C-284 726 -284 726 -277 731 C-276 732 -274 733 -273 735 C-272 735 -271 736 -270 737 C-269 737 -269 737 -268 737 C-268 738 -267 739 -267 740 C-246 756 -246 756 -238 761 C-237 762 -237 762 -236 762 C-229 767 -222 772 -214 776 C-212 777 -210 778 -209 779 C-205 781 -201 783 -197 785 C-197 785 -196 786 -195 786 C-176 795 -157 804 -137 811 C-135 811 -133 812 -131 812 C-119 816 -108 819 -96 821 C-94 822 -92 822 -91 822 C-86 823 -81 824 -76 825 C-75 825 -74 825 -74 826 C-29 834 19 832 64 825 C77 822 91 819 104 815 C105 815 107 814 108 814 C130 807 152 799 173 788 C175 787 177 786 179 785 C181 784 183 783 185 782 C186 781 187 781 188 780 C189 780 190 779 191 779 C192 778 193 778 194 778 C196 776 198 775 200 773 C202 772 204 771 205 770 C211 767 217 763 222 759 C223 758 225 757 226 756 C229 754 233 751 236 749 C237 748 239 747 240 746 C247 741 253 736 259 730 C261 728 261 728 263 727 C263 727 263 726 263 725 C263 725 263 725 265 725 C268 723 270 720 273 718 C278 712 278 712 281 709 C285 706 288 703 291 699 C292 698 293 697 294 696 C296 694 298 691 300 689 C302 687 304 684 306 682 C317 670 326 656 335 642 C336 641 337 640 337 639 C350 620 360 598 369 577 C369 577 370 576 370 575 C381 552 386 526 392 501 C392 500 393 499 393 498 C403 455 403 408 397 364 C396 351 394 338 391 325 C391 324 391 324 391 323 C386 299 379 274 368 253 C366 250 365 246 363 243 C356 226 347 209 337 194 C336 192 335 190 334 189 C324 173 312 158 299 145 C298 143 297 142 296 140 C291 135 286 129 280 124 C280 124 280 124 278 122 C275 119 273 117 271 115 C270 115 270 115 269 115 C269 114 268 113 268 112 C256 102 243 92 229 83 C229 83 229 83 227 82 C207 68 186 57 163 47 C163 47 163 47 161 46 C154 44 148 41 141 39 C140 39 139 39 138 38 C114 30 89 24 63 20 C62 20 61 20 60 20 C-3 12 -75 17 -134 40 Z\" transform=\"translate(1568 892)\"/></g><g id=\"gamepadTestSwitchPath9\" class=\"gamepad-test-control\" data-gamepad-control=\"X\"><path d=\"M0 0 C2 0 4 0 6 0 C7 0 8 0 9 0 C10 0 11 0 13 0 C14 0 15 0 16 0 C19 0 22 0 25 0 C25 0 25 0 26 1 C26 3 26 4 26 6 C26 6 26 6 24 8 C22 11 20 14 18 17 C17 18 17 18 16 19 C15 21 13 23 12 25 C12 26 11 26 11 27 C5 35 -1 44 -7 52 C-10 56 -13 60 -15 64 C-17 66 -17 66 -18 69 C-18 70 -18 70 -18 71 C-9 85 0 99 10 112 C16 121 22 129 28 138 C28 139 28 141 28 142 C27 142 27 143 26 143 C24 143 22 143 20 143 C19 143 18 143 17 143 C16 143 15 143 13 143 C12 143 11 143 10 143 C7 143 4 143 1 143 C-3 139 -6 136 -8 131 C-9 130 -10 129 -11 128 C-11 127 -11 126 -12 126 C-19 114 -27 103 -35 92 C-36 92 -37 93 -38 93 C-38 94 -39 95 -40 95 C-45 103 -50 111 -55 119 C-59 125 -63 130 -66 136 C-68 138 -68 138 -73 143 C-81 143 -89 143 -97 143 C-98 142 -98 142 -99 141 C-99 139 -99 139 -98 137 C-97 135 -97 135 -95 133 C-92 128 -89 124 -86 119 C-82 114 -79 109 -75 104 C-71 98 -67 93 -64 87 C-60 82 -57 77 -53 72 C-53 70 -53 69 -53 67 C-54 66 -54 66 -55 65 C-59 59 -63 53 -67 47 C-71 41 -76 35 -80 29 C-85 23 -89 16 -94 10 C-95 8 -95 8 -97 6 C-97 4 -96 3 -96 1 C-87 1 -79 1 -70 1 C-64 7 -64 7 -62 10 C-62 11 -61 12 -61 12 C-60 13 -60 14 -59 15 C-54 22 -50 29 -45 35 C-42 39 -40 43 -37 47 C-36 47 -36 47 -33 46 C-33 46 -33 46 -31 44 C-28 39 -25 34 -22 29 C-19 25 -16 21 -13 16 C-5 4 -5 4 -2 1 C-1 1 -1 0 0 0 Z\" transform=\"translate(4566 922)\"/></g><g id=\"gamepadTestSwitchPath10\" class=\"gamepad-test-control\" data-gamepad-control=\"Start\"><path d=\"M0 0 C41 0 81 0 123 0 C125 2 127 3 129 5 C129 8 130 10 130 13 C129 15 127 17 126 19 C123 20 121 21 119 21 C118 21 117 21 116 21 C115 21 115 21 113 21 C112 21 111 21 109 21 C109 21 109 21 106 21 C102 21 98 21 94 21 C92 21 89 21 86 21 C81 21 75 21 70 21 C63 21 57 21 50 21 C45 21 39 21 34 21 C30 21 27 21 24 21 C20 21 16 21 13 21 C12 21 12 21 9 21 C8 21 7 21 6 21 C5 21 4 21 3 21 C1 21 -1 20 -4 19 C-5 17 -6 16 -7 14 C-7 11 -6 8 -6 5 C-4 3 -2 2 0 0 Z\" transform=\"translate(2406 928)\"/></g><g id=\"gamepadTestSwitchPath11\" class=\"gamepad-test-control\" data-gamepad-control=\"LeftStick\"><path d=\"M0 0 C1 0 2 0 3 0 C6 0 8 0 10 0 C14 0 17 0 21 0 C41 0 60 2 79 6 C80 6 82 7 83 7 C102 11 121 17 139 25 C140 26 141 26 142 26 C150 30 158 34 166 38 C167 39 168 39 169 40 C181 47 192 54 203 62 C205 64 207 65 209 66 C216 71 222 76 228 82 C231 85 233 87 236 89 C236 90 236 91 236 91 C237 91 237 92 238 92 C243 95 246 99 250 103 C251 104 252 106 253 107 C254 109 256 110 257 111 C263 118 269 126 275 133 C276 135 277 137 278 138 C283 145 288 152 292 160 C293 162 295 164 296 166 C306 183 315 202 321 221 C321 222 322 224 322 225 C328 244 333 263 336 282 C336 285 336 288 337 291 C342 322 340 357 334 389 C333 391 333 394 332 396 C332 397 332 398 331 399 C327 417 323 435 315 451 C314 453 313 456 312 458 C310 464 306 471 303 477 C302 479 301 481 300 483 C296 491 291 499 286 507 C286 508 286 508 285 509 C275 523 266 536 255 548 C254 548 254 548 253 548 C253 549 253 549 252 550 C251 553 249 554 247 557 C246 557 245 558 244 559 C244 560 244 560 242 562 C241 563 240 564 239 565 C234 570 229 575 223 579 C221 581 218 583 216 585 C208 591 200 598 191 603 C190 604 189 604 188 605 C186 607 183 608 180 610 C179 611 178 612 177 612 C166 619 155 624 144 629 C142 630 139 631 137 632 C116 642 92 648 69 652 C67 652 65 652 64 653 C25 660 -14 658 -53 651 C-60 650 -67 648 -74 646 C-76 646 -79 645 -81 644 C-86 643 -91 641 -96 639 C-99 638 -102 638 -105 637 C-116 633 -127 629 -137 623 C-138 623 -139 622 -140 622 C-152 615 -165 608 -176 599 C-177 599 -178 598 -179 597 C-190 589 -200 581 -210 572 C-211 571 -213 570 -214 569 C-218 565 -222 561 -225 557 C-227 555 -229 553 -231 551 C-252 530 -270 502 -283 476 C-289 463 -295 449 -300 435 C-300 434 -301 433 -301 432 C-303 426 -305 419 -307 412 C-307 411 -307 410 -308 408 C-317 367 -319 327 -314 285 C-311 260 -304 235 -295 212 C-295 211 -294 210 -294 209 C-283 183 -271 158 -254 136 C-253 135 -253 134 -252 133 C-250 130 -247 127 -245 124 C-245 124 -244 123 -244 123 C-232 108 -220 95 -206 82 C-205 81 -204 80 -203 80 C-193 70 -182 62 -170 54 C-169 54 -168 53 -168 53 C-161 48 -154 45 -147 41 C-147 41 -147 41 -144 39 C-142 38 -140 37 -138 36 C-135 34 -133 33 -130 32 C-121 26 -111 22 -101 19 C-99 18 -97 17 -95 17 C-65 6 -32 0 0 0 Z M-108 50 C-111 52 -114 53 -118 55 C-118 55 -119 55 -120 56 C-122 57 -123 57 -125 58 C-127 59 -128 60 -130 61 C-140 65 -150 72 -159 78 C-160 79 -160 79 -161 80 C-170 85 -178 92 -185 99 C-188 101 -190 103 -193 105 C-193 106 -193 107 -193 107 C-193 107 -193 107 -196 108 C-198 110 -199 111 -201 113 C-201 114 -201 115 -201 115 C-202 116 -202 116 -205 117 C-205 118 -205 119 -205 119 C-205 119 -205 119 -208 120 C-208 121 -209 121 -209 122 C-210 122 -210 123 -211 124 C-212 124 -212 125 -213 126 C-214 127 -216 129 -217 130 C-228 142 -237 155 -245 169 C-245 170 -245 170 -246 172 C-266 207 -280 242 -287 281 C-287 282 -288 283 -288 284 C-290 298 -290 311 -290 325 C-290 328 -290 331 -290 334 C-290 352 -289 370 -286 387 C-285 388 -285 389 -285 390 C-284 393 -284 396 -283 399 C-283 400 -283 401 -282 402 C-278 423 -270 443 -260 462 C-259 464 -258 466 -257 468 C-248 487 -238 505 -223 520 C-219 524 -216 529 -212 533 C-209 537 -206 541 -202 544 C-201 544 -201 544 -200 544 C-199 546 -199 547 -198 548 C-197 548 -197 548 -196 548 C-196 549 -195 549 -195 550 C-194 552 -194 552 -193 554 C-190 556 -188 557 -186 559 C-185 560 -185 560 -184 561 C-176 567 -168 574 -159 579 C-157 580 -155 582 -153 583 C-146 588 -138 592 -129 596 C-127 598 -124 599 -122 601 C-112 606 -102 610 -92 614 C-90 614 -88 615 -86 616 C-57 627 -26 631 5 632 C31 632 57 630 82 623 C83 623 83 623 85 622 C112 615 137 605 161 591 C163 590 166 588 169 587 C176 583 182 577 189 572 C190 571 191 571 192 570 C207 558 223 545 235 530 C236 529 237 528 237 527 C242 522 242 522 244 519 C244 518 245 517 245 516 C246 516 246 516 247 516 C265 493 281 468 291 440 C291 440 292 439 292 438 C293 434 295 430 296 425 C297 423 298 421 299 418 C304 404 307 390 309 375 C309 373 310 372 310 370 C312 358 313 347 313 335 C313 335 313 335 313 332 C313 329 313 326 313 323 C313 322 313 322 313 321 C312 285 305 252 292 218 C289 209 285 201 280 192 C279 190 278 187 276 185 C272 176 267 167 261 159 C260 157 259 156 257 154 C253 148 248 142 244 136 C242 134 240 132 239 130 C228 117 217 105 203 95 C200 93 198 91 196 89 C190 84 183 80 177 75 C176 74 175 74 174 73 C163 65 151 59 139 53 C138 53 138 53 137 52 C133 50 130 49 126 47 C126 47 126 47 124 46 C93 33 58 27 25 25 C-21 23 -65 33 -108 50 Z\" transform=\"translate(1552 988)\"/></g><g id=\"gamepadTestSwitchPath12\" class=\"gamepad-test-control\" data-gamepad-control=\"LeftStick\"><path d=\"M0 0 C1 0 1 0 2 0 C18 4 33 9 48 16 C50 17 53 18 55 18 C66 22 76 29 86 36 C87 37 88 37 89 38 C111 53 133 72 148 94 C149 95 149 96 150 97 C151 98 151 99 152 100 C169 123 182 151 190 179 C195 196 200 215 200 234 C200 235 200 236 200 236 C201 262 200 287 193 312 C193 313 193 313 192 314 C191 318 190 322 189 326 C189 327 188 328 188 329 C182 347 174 364 165 380 C164 381 164 382 163 383 C155 397 144 412 132 424 C131 425 130 426 130 427 C125 431 121 435 116 439 C115 440 113 442 112 443 C93 461 71 473 48 483 C45 484 42 485 39 487 C33 490 26 492 19 494 C18 494 17 495 16 495 C-5 501 -27 503 -48 504 C-49 504 -50 504 -51 504 C-76 505 -104 501 -128 494 C-143 489 -158 484 -172 476 C-173 476 -173 475 -174 475 C-190 466 -206 455 -220 443 C-221 443 -221 442 -222 442 C-244 423 -260 402 -274 378 C-284 361 -292 345 -297 327 C-297 326 -298 325 -298 324 C-305 300 -309 276 -309 250 C-309 250 -309 249 -309 248 C-309 238 -309 227 -307 217 C-307 216 -307 215 -307 215 C-303 189 -296 164 -284 141 C-284 141 -283 140 -283 139 C-281 136 -280 133 -278 130 C-269 112 -258 97 -245 82 C-244 80 -242 79 -241 77 C-240 77 -240 76 -239 76 C-238 74 -236 72 -235 70 C-234 70 -234 70 -233 70 C-233 69 -232 69 -232 68 C-230 64 -227 62 -224 59 C-220 56 -217 53 -213 50 C-212 49 -211 49 -211 48 C-195 35 -179 25 -160 18 C-156 16 -153 15 -150 13 C-134 6 -118 1 -101 -2 C-101 -2 -101 -2 -98 -2 C-96 -3 -94 -3 -91 -4 C-91 -4 -91 -4 -89 -4 C-60 -9 -29 -6 0 0 Z M-57 11 C-57 11 -57 11 -59 11 C-76 12 -92 13 -108 17 C-109 17 -110 17 -111 18 C-129 22 -146 28 -163 37 C-163 37 -163 37 -166 39 C-186 49 -204 63 -220 79 C-221 80 -221 80 -222 81 C-234 92 -243 104 -252 118 C-253 119 -254 120 -254 122 C-256 124 -257 126 -259 129 C-260 131 -261 132 -262 134 C-275 153 -281 176 -287 198 C-288 203 -289 209 -290 215 C-290 216 -290 216 -290 217 C-294 241 -293 267 -289 291 C-288 292 -288 293 -288 294 C-288 296 -287 297 -287 299 C-285 312 -280 324 -276 336 C-276 336 -276 336 -275 339 C-270 352 -264 365 -256 377 C-255 378 -255 379 -254 380 C-245 394 -233 407 -222 419 C-220 421 -219 422 -218 424 C-212 430 -205 435 -199 440 C-197 441 -196 442 -195 443 C-175 458 -153 468 -130 476 C-122 479 -113 481 -105 483 C-103 483 -101 483 -99 484 C-74 490 -47 489 -21 486 C-6 484 8 481 22 476 C22 476 22 476 24 475 C48 467 70 455 90 439 C92 438 93 437 95 436 C107 427 119 416 128 404 C128 403 128 403 128 402 C129 402 129 402 130 402 C145 382 145 382 150 373 C150 372 151 372 151 371 C165 349 175 323 180 297 C182 284 184 271 184 258 C184 257 184 256 184 255 C184 243 184 231 182 219 C182 217 182 216 181 214 C178 192 172 171 163 151 C162 149 161 147 160 145 C152 127 140 108 127 94 C123 91 120 87 117 84 C105 70 91 58 75 49 C73 48 71 47 69 45 C52 36 35 27 17 21 C16 21 15 20 14 20 C-9 13 -33 10 -57 11 Z\" transform=\"translate(1617 1066)\"/></g><g id=\"gamepadTestSwitchPath13\" class=\"gamepad-test-control\" data-gamepad-control=\"Y\"><path d=\"M0 0 C3 1 7 2 10 3 C11 3 12 4 13 4 C27 8 39 15 51 22 C52 23 53 23 54 24 C62 29 69 34 76 40 C77 41 78 41 78 42 C83 46 87 50 90 54 C91 55 92 57 93 58 C94 58 94 59 95 59 C96 61 97 62 99 63 C112 77 120 93 128 110 C131 116 133 123 135 130 C135 131 135 131 136 134 C141 151 143 167 143 185 C143 186 143 186 143 188 C143 204 142 219 137 234 C137 235 137 237 136 238 C135 241 134 244 133 247 C133 248 133 249 132 250 C130 257 127 264 123 271 C123 272 123 273 122 274 C119 279 116 285 112 290 C111 291 111 292 110 294 C104 302 98 309 91 316 C91 317 90 317 90 318 C77 332 62 343 45 352 C43 353 41 354 39 355 C21 365 1 371 -19 375 C-40 378 -63 377 -84 373 C-92 372 -99 370 -107 367 C-107 367 -108 367 -109 366 C-128 360 -144 351 -161 339 C-161 339 -162 338 -163 338 C-178 327 -192 312 -203 296 C-215 279 -225 259 -231 239 C-232 237 -232 234 -233 232 C-233 231 -233 230 -234 229 C-239 207 -239 182 -237 160 C-235 140 -228 119 -220 101 C-212 87 -204 74 -194 62 C-193 62 -193 62 -192 60 C-176 42 -157 27 -135 15 C-124 9 -112 4 -99 1 C-97 0 -96 0 -94 -1 C-64 -10 -30 -8 0 0 Z M-116 27 C-119 28 -121 29 -123 30 C-124 31 -125 31 -126 31 C-132 35 -139 39 -145 43 C-145 43 -145 43 -146 44 C-166 59 -181 76 -194 96 C-204 111 -210 127 -214 144 C-219 167 -220 190 -217 213 C-216 221 -214 229 -211 237 C-210 239 -210 241 -209 243 C-205 258 -197 273 -188 285 C-187 285 -186 285 -186 285 C-186 286 -185 286 -185 287 C-179 298 -167 308 -158 317 C-154 320 -150 323 -146 326 C-145 327 -144 327 -143 328 C-135 334 -126 338 -117 342 C-116 342 -115 343 -114 343 C-95 351 -74 356 -53 357 C-35 358 -16 355 2 350 C19 344 36 337 50 326 C51 326 52 325 52 325 C69 312 84 298 95 280 C96 280 96 280 97 277 C98 276 98 276 99 275 C109 259 116 240 120 222 C120 221 120 220 120 219 C121 218 121 217 121 216 C123 206 124 197 124 187 C124 187 124 187 124 185 C124 166 121 147 115 129 C108 110 97 91 84 75 C81 72 79 70 77 68 C75 66 74 64 72 63 C64 54 54 45 43 39 C42 39 41 39 40 38 C38 37 37 36 35 35 C23 29 10 24 -3 20 C-4 19 -6 19 -8 18 C-44 8 -82 13 -116 27 Z\" transform=\"translate(4197 1151)\"/></g><g id=\"gamepadTestSwitchPath14\" class=\"gamepad-test-control\" data-gamepad-control=\"A\"><path d=\"M0 0 C20 6 40 13 58 25 C59 25 59 26 60 26 C77 38 93 52 106 69 C106 69 106 69 107 71 C121 88 131 106 137 127 C145 151 147 175 146 200 C145 219 142 238 135 255 C125 278 114 298 97 316 C95 318 92 321 90 323 C89 324 88 325 88 326 C77 336 66 345 53 352 C52 352 51 353 51 353 C44 357 38 360 31 363 C30 363 30 364 29 364 C18 369 6 373 -6 375 C-7 375 -7 376 -8 376 C-29 380 -53 380 -73 377 C-91 374 -108 369 -124 361 C-125 360 -126 360 -128 359 C-135 356 -141 352 -148 347 C-150 345 -152 344 -155 342 C-156 342 -157 341 -158 340 C-161 338 -164 336 -167 334 C-167 333 -167 333 -167 332 C-168 332 -168 332 -169 331 C-171 330 -174 328 -176 326 C-176 325 -176 325 -176 324 C-177 323 -179 323 -180 322 C-180 321 -180 321 -180 320 C-181 320 -182 319 -183 319 C-192 309 -200 298 -207 286 C-208 285 -208 284 -209 283 C-215 273 -220 261 -223 250 C-224 248 -225 246 -225 244 C-228 238 -229 231 -231 224 C-231 223 -231 223 -231 222 C-236 201 -235 178 -232 157 C-231 144 -227 131 -222 119 C-222 118 -221 117 -221 115 C-213 96 -202 78 -188 62 C-186 61 -185 59 -183 57 C-182 56 -182 56 -181 55 C-166 40 -152 28 -133 18 C-132 17 -131 17 -130 16 C-120 11 -110 8 -100 4 C-99 4 -98 3 -96 3 C-67 -7 -30 -8 0 0 Z M-101 25 C-102 25 -102 26 -103 26 C-121 32 -137 41 -151 53 C-152 54 -153 55 -154 55 C-168 66 -179 79 -188 94 C-189 95 -189 96 -190 97 C-199 110 -206 125 -210 141 C-210 143 -211 144 -211 146 C-211 147 -211 148 -212 149 C-215 162 -216 176 -216 190 C-216 191 -216 191 -216 192 C-216 210 -212 228 -206 245 C-206 245 -206 245 -205 247 C-205 248 -204 248 -204 249 C-199 263 -193 275 -184 287 C-182 289 -180 292 -178 295 C-177 295 -177 295 -176 295 C-176 296 -176 296 -175 297 C-174 299 -172 301 -170 304 C-169 305 -168 305 -168 306 C-167 306 -167 306 -166 308 C-165 308 -165 308 -164 308 C-164 308 -164 308 -163 311 C-162 312 -161 313 -159 314 C-159 315 -158 316 -157 316 C-155 318 -153 319 -151 320 C-151 321 -151 321 -151 322 C-128 339 -128 339 -115 344 C-114 344 -114 345 -113 345 C-101 350 -89 353 -77 356 C-76 356 -76 356 -75 357 C-59 360 -42 360 -25 358 C-2 355 19 348 40 337 C55 329 69 318 80 306 C89 296 96 286 103 275 C103 274 104 274 104 273 C113 259 118 244 122 229 C122 228 123 227 123 226 C127 210 128 192 127 175 C125 154 120 135 112 115 C110 110 107 105 104 100 C104 100 104 100 103 98 C98 89 91 81 84 74 C82 71 81 69 79 67 C78 67 78 67 77 67 C77 66 76 65 76 64 C73 62 71 60 68 58 C66 56 64 54 63 53 C56 47 48 43 41 38 C40 38 40 38 38 36 C31 32 24 29 17 26 C16 26 15 25 14 25 C-4 18 -24 15 -44 15 C-63 14 -83 18 -101 25 Z\" transform=\"translate(4939 1149)\"/></g><path d=\"M0 0 C1 0 1 0 3 1 C12 2 21 4 29 7 C30 8 31 8 32 8 C44 13 55 20 64 27 C70 32 75 36 79 41 C80 42 81 43 81 43 C90 53 97 64 103 75 C107 85 109 94 111 103 C111 104 112 105 112 106 C115 120 116 134 113 149 C111 165 106 181 98 195 C91 207 83 218 72 226 C70 228 68 231 66 233 C54 243 42 249 28 255 C17 259 4 262 -8 262 C-27 263 -45 261 -63 255 C-66 254 -69 253 -72 251 C-72 251 -72 251 -75 250 C-88 244 -100 235 -110 225 C-114 221 -118 216 -122 211 C-122 211 -123 210 -124 209 C-133 196 -140 180 -144 165 C-148 151 -150 137 -149 122 C-148 112 -145 101 -143 91 C-142 90 -142 89 -142 88 C-138 76 -132 64 -124 54 C-123 52 -122 51 -121 49 C-120 48 -119 47 -118 45 C-116 42 -113 40 -111 37 C-110 37 -109 37 -109 37 C-108 36 -108 35 -108 34 C-104 32 -101 29 -97 26 C-95 25 -93 23 -92 22 C-83 15 -72 10 -62 6 C-52 3 -43 1 -33 -1 C-32 -1 -32 -1 -30 -1 C-20 -2 -10 -2 0 0 Z M-57 25 C-70 31 -82 38 -93 47 C-94 49 -96 51 -98 53 C-98 54 -99 55 -100 56 C-109 65 -116 76 -121 88 C-126 98 -128 107 -129 118 C-130 135 -129 152 -124 168 C-121 177 -116 186 -111 193 C-110 194 -110 194 -110 195 C-101 206 -93 216 -81 224 C-77 226 -74 228 -70 230 C-69 231 -68 231 -68 231 C-61 235 -55 237 -48 239 C-47 239 -47 239 -45 240 C-34 244 -21 244 -10 243 C3 243 16 239 28 234 C40 228 52 220 62 211 C71 201 79 190 85 177 C90 165 94 153 94 139 C95 126 94 112 91 100 C86 87 81 75 73 64 C63 52 52 42 39 33 C36 31 32 30 28 28 C27 28 26 27 25 27 C13 23 1 20 -12 19 C-13 19 -14 19 -15 19 C-29 19 -44 20 -57 25 Z\" transform=\"translate(3549 1247)\"/><path d=\"M0 0 C15 0 29 0 44 0 C47 0 50 0 53 0 C57 0 61 0 66 0 C67 0 69 0 70 0 C76 0 81 0 87 2 C93 5 99 7 105 12 C110 17 114 23 118 29 C118 31 119 32 119 33 C120 34 120 35 121 36 C123 41 123 46 123 51 C123 53 123 54 123 56 C123 57 123 59 123 60 C123 64 123 68 123 72 C123 75 123 79 123 82 C123 90 123 98 123 105 C123 114 123 122 123 130 C123 137 123 144 123 151 C123 155 123 159 123 163 C123 167 123 171 123 175 C123 176 123 177 123 179 C123 187 122 194 119 202 C117 209 114 214 109 219 C105 223 102 226 97 229 C91 232 85 234 78 235 C76 235 74 235 72 235 C71 235 70 235 69 235 C67 235 66 235 65 235 C63 235 62 235 60 235 C56 235 51 235 47 235 C45 235 44 235 42 235 C35 235 27 235 20 235 C11 235 3 235 -6 235 C-13 235 -19 235 -26 235 C-30 235 -34 235 -38 235 C-41 236 -45 236 -49 236 C-51 236 -53 236 -55 236 C-64 236 -72 234 -81 231 C-87 228 -93 224 -98 219 C-102 215 -105 211 -108 205 C-111 195 -112 185 -112 174 C-112 173 -112 172 -112 170 C-112 166 -112 161 -112 157 C-112 155 -112 154 -112 152 C-112 145 -112 138 -112 130 C-112 122 -112 113 -112 105 C-112 99 -112 92 -112 85 C-112 82 -112 78 -112 74 C-112 45 -112 45 -109 33 C-107 28 -105 24 -102 20 C-102 20 -102 20 -100 18 C-96 13 -92 10 -87 7 C-81 4 -75 1 -69 1 C-65 0 -62 0 -59 0 C-57 0 -56 0 -55 0 C-51 0 -48 0 -45 0 C-41 0 -37 0 -34 0 C-26 0 -18 0 -10 0 C-7 0 -3 0 0 0 Z M-71 25 C-75 27 -78 30 -82 33 C-84 36 -86 39 -88 43 C-90 50 -90 57 -90 64 C-90 66 -90 67 -90 68 C-90 72 -90 76 -90 79 C-90 83 -90 87 -90 91 C-90 97 -90 103 -90 110 C-90 117 -90 124 -90 132 C-90 138 -90 144 -90 151 C-90 155 -90 158 -90 162 C-90 166 -90 169 -90 173 C-90 175 -90 177 -90 178 C-90 185 -90 190 -88 196 C-86 199 -84 202 -82 204 C-78 207 -74 210 -69 212 C-66 212 -66 212 -63 212 C-61 212 -60 212 -59 212 C-58 212 -56 212 -55 212 C-53 212 -52 213 -51 213 C-47 213 -43 213 -39 213 C-37 213 -34 213 -32 213 C-23 213 -15 213 -7 213 C1 213 9 213 17 213 C24 213 30 213 37 213 C41 213 45 213 49 213 C53 213 57 213 61 213 C63 213 65 213 67 213 C70 213 74 213 77 212 C82 210 86 208 90 204 C93 202 95 199 97 196 C99 193 99 191 100 188 C100 184 100 181 100 177 C100 175 100 174 100 173 C100 169 100 165 100 161 C100 158 100 154 100 151 C100 144 100 136 100 128 C100 120 100 113 100 105 C100 98 100 91 100 84 C100 80 100 76 100 72 C100 68 100 65 100 61 C100 59 100 58 100 57 C100 52 100 48 99 44 C98 40 96 37 93 33 C90 30 87 27 83 25 C74 22 64 23 54 23 C53 23 51 23 50 23 C47 23 43 23 40 23 C38 23 35 23 33 23 C26 23 18 23 11 23 C4 23 -3 23 -10 23 C-16 23 -22 23 -28 23 C-32 23 -36 23 -39 23 C-43 23 -47 23 -51 23 C-52 23 -54 23 -55 23 C-60 23 -65 23 -71 25 Z\" transform=\"translate(2605 1252)\"/><g id=\"gamepadTestSwitchPath17\" class=\"gamepad-test-control\" data-gamepad-control=\"A\"><path d=\"M0 0 C2 0 3 0 5 0 C6 0 7 0 8 0 C9 0 11 0 12 0 C12 0 12 0 15 0 C18 0 20 0 23 0 C25 3 27 5 28 9 C29 10 29 11 30 13 C32 19 34 26 37 32 C37 33 38 34 38 34 C39 36 39 38 40 40 C44 49 48 59 51 69 C54 76 57 84 60 91 C63 97 65 103 68 110 C71 119 74 128 78 137 C77 138 75 140 74 141 C71 141 71 141 54 140 C52 137 50 134 49 130 C49 130 48 129 48 128 C48 127 47 126 47 125 C46 124 46 122 45 120 C45 119 44 119 44 118 C43 114 41 110 39 106 C21 106 3 105 -15 105 C-20 110 -20 110 -21 112 C-21 113 -21 113 -22 114 C-22 115 -22 115 -22 116 C-23 117 -23 117 -23 118 C-23 119 -24 120 -24 120 C-26 126 -27 131 -29 137 C-30 138 -30 138 -34 141 C-40 141 -47 141 -53 141 C-54 140 -55 140 -56 139 C-55 133 -54 128 -51 122 C-51 121 -51 121 -50 120 C-49 117 -48 115 -47 112 C-47 111 -46 110 -46 109 C-45 107 -44 105 -43 103 C-42 100 -41 96 -39 93 C-37 88 -35 83 -33 79 C-27 63 -21 48 -15 33 C-11 22 -7 12 -2 1 C-1 1 -1 0 0 0 Z M9 32 C7 35 7 36 6 39 C4 44 2 49 0 54 C-1 56 -1 58 -2 60 C-3 63 -4 66 -5 69 C-8 75 -8 75 -8 78 C-8 80 -8 80 -8 83 C-4 84 -1 84 3 84 C4 84 5 84 6 84 C8 84 10 84 12 84 C14 84 15 84 17 84 C21 84 24 84 28 84 C29 83 30 82 31 81 C26 65 19 49 13 33 C12 33 10 32 9 32 Z\" transform=\"translate(4884 1264)\"/></g><g id=\"gamepadTestSwitchPath18\" class=\"gamepad-test-control\" data-gamepad-control=\"Y\"><path d=\"M0 0 C9 0 17 0 26 0 C30 4 32 6 35 11 C35 12 36 13 37 14 C37 15 38 16 38 16 C40 19 42 22 43 25 C44 26 44 26 45 27 C45 28 46 29 47 30 C49 33 51 36 53 39 C53 40 53 40 54 41 C57 46 61 52 64 57 C65 56 67 56 68 55 C69 54 69 53 70 52 C73 46 76 40 81 35 C82 33 84 30 85 28 C88 22 91 17 95 12 C97 9 99 7 101 4 C102 2 102 2 104 0 C112 0 121 0 129 0 C129 2 130 3 130 5 C130 6 129 6 129 7 C125 13 121 19 117 25 C115 28 113 31 110 34 C109 36 107 38 106 41 C102 47 98 53 94 59 C92 62 91 65 89 67 C88 68 88 68 85 73 C83 76 81 79 79 82 C79 101 78 121 78 141 C77 142 77 142 76 143 C69 143 61 143 54 143 C53 142 53 141 52 140 C52 139 52 139 52 138 C52 131 52 124 52 117 C52 114 52 112 52 109 C52 105 52 101 52 98 C52 97 52 95 52 94 C52 86 52 86 51 83 C50 79 48 76 46 74 C43 69 40 64 37 60 C32 52 27 45 22 38 C20 35 19 32 17 30 C16 29 16 28 15 27 C12 23 12 23 -1 3 C-1 2 0 1 0 0 Z\" transform=\"translate(4085 1268)\"/></g><g id=\"gamepadTestSwitchPath19\" class=\"gamepad-test-control\" data-gamepad-control=\"Home\"><path d=\"M0 0 C2 0 3 1 5 1 C6 2 6 2 7 3 C13 8 18 13 24 18 C27 20 30 23 33 25 C37 29 41 33 46 36 C46 37 46 37 46 38 C47 38 47 38 48 39 C51 40 53 42 55 45 C59 48 63 52 67 55 C67 57 67 58 67 60 C66 61 65 61 64 62 C61 62 59 62 56 62 C55 63 54 63 53 64 C53 83 52 103 52 123 C51 124 51 125 50 126 C18 126 -13 126 -46 126 C-47 125 -48 124 -49 123 C-49 104 -50 84 -50 64 C-50 64 -51 63 -51 63 C-55 62 -59 62 -63 61 C-63 59 -64 58 -64 56 C-59 51 -54 46 -49 42 C-47 40 -44 38 -42 36 C-39 33 -36 30 -32 27 C-27 23 -22 19 -18 15 C-13 11 -8 7 -3 3 C-1 1 -1 1 0 0 Z M-24 59 C-25 60 -27 61 -28 62 C-28 76 -28 90 -28 105 C-27 106 -26 107 -25 108 C-17 108 -10 108 -2 108 C1 108 3 108 6 108 C10 108 13 108 17 108 C18 108 18 108 21 108 C22 108 23 108 24 108 C24 108 24 108 27 108 C27 108 28 108 29 108 C30 108 30 107 31 107 C32 102 32 98 32 93 C32 93 32 93 32 90 C32 88 32 85 32 82 C32 80 32 78 32 77 C32 72 32 68 32 63 C31 62 29 60 28 59 C11 59 -6 59 -24 59 Z\" transform=\"translate(3529 1309)\"/></g><g id=\"gamepadTestSwitchPath20\" class=\"gamepad-test-control\" data-gamepad-control=\"Home\"><path d=\"M0 0 C7 2 14 5 20 10 C27 16 32 23 37 31 C40 37 42 43 43 50 C44 55 44 60 43 65 C41 74 39 82 35 90 C30 97 25 103 18 108 C11 113 4 116 -4 118 C-11 120 -18 120 -25 119 C-32 118 -38 117 -44 114 C-51 110 -56 105 -61 100 C-66 95 -71 89 -74 82 C-76 75 -78 67 -78 59 C-78 50 -76 42 -72 33 C-69 26 -65 20 -60 14 C-55 10 -50 6 -44 4 C-30 -2 -15 -4 0 0 Z M-31 17 C-38 20 -43 24 -48 28 C-52 31 -54 35 -56 39 C-57 40 -57 41 -58 41 C-59 45 -60 48 -61 51 C-61 57 -61 63 -60 69 C-59 71 -58 73 -57 75 C-57 76 -57 77 -56 78 C-53 83 -50 87 -46 91 C-41 95 -36 98 -30 100 C-25 102 -19 102 -13 102 C-8 101 -3 100 2 98 C6 95 11 92 14 88 C19 83 22 76 24 70 C26 64 26 57 26 51 C25 46 23 41 20 36 C17 32 14 28 10 25 C7 23 4 21 1 19 C0 19 -1 18 -2 17 C-7 16 -12 15 -17 15 C-22 15 -27 16 -31 17 Z\" transform=\"translate(2627 1312)\"/></g><g id=\"gamepadTestSwitchPath21\" class=\"gamepad-test-control\" data-gamepad-control=\"B\"><path d=\"M0 0 C20 6 39 16 56 29 C58 31 61 33 64 35 C64 36 65 37 66 38 C69 40 71 42 74 44 C74 45 74 45 75 46 C81 52 86 59 92 65 C92 66 93 67 93 68 C95 70 96 72 98 73 C98 74 98 74 99 76 C112 93 120 114 126 135 C131 155 132 178 130 199 C130 207 128 216 126 224 C126 225 126 226 126 227 C123 238 120 248 116 257 C115 259 114 261 114 262 C107 276 99 289 90 301 C89 303 88 304 87 305 C83 309 80 313 76 317 C75 317 74 317 74 317 C73 318 73 319 73 320 C56 335 39 348 19 357 C18 358 18 358 16 359 C-2 367 -22 373 -43 375 C-66 377 -89 375 -111 369 C-117 367 -122 365 -127 363 C-128 363 -128 363 -130 363 C-147 356 -163 346 -177 335 C-178 335 -179 334 -180 334 C-193 323 -206 311 -215 296 C-216 295 -217 294 -218 293 C-233 271 -241 249 -248 224 C-253 208 -255 190 -253 173 C-253 168 -252 162 -251 156 C-251 155 -251 155 -251 154 C-249 144 -247 135 -244 125 C-244 124 -244 123 -243 122 C-237 103 -229 84 -216 68 C-211 61 -205 54 -198 47 C-198 47 -197 46 -196 45 C-183 32 -167 19 -151 11 C-128 0 -103 -7 -78 -10 C-51 -12 -26 -8 0 0 Z M-126 22 C-141 29 -155 36 -168 46 C-169 47 -169 47 -171 49 C-178 54 -178 54 -181 58 C-183 60 -184 61 -187 63 C-191 67 -194 71 -197 76 C-198 76 -199 77 -199 78 C-204 85 -208 91 -212 98 C-213 99 -213 100 -214 101 C-223 118 -229 137 -232 156 C-235 176 -235 197 -230 217 C-226 236 -219 255 -209 271 C-208 273 -207 275 -206 277 C-203 281 -200 285 -197 288 C-195 290 -195 290 -193 293 C-193 293 -192 293 -191 293 C-191 294 -191 295 -191 295 C-189 299 -185 302 -182 305 C-182 305 -182 305 -180 307 C-165 322 -147 333 -128 342 C-126 342 -125 343 -123 343 C-123 344 -123 344 -120 345 C-104 352 -88 355 -71 355 C-52 356 -32 355 -13 349 C8 342 28 331 46 317 C49 315 51 313 54 310 C54 310 55 309 56 309 C60 305 64 301 68 296 C68 296 69 295 70 294 C76 286 81 279 87 270 C88 269 89 267 90 265 C96 256 99 248 102 238 C103 237 103 235 104 233 C111 211 111 190 111 167 C110 149 105 132 99 115 C93 102 85 89 77 77 C76 77 76 77 75 75 C63 59 48 47 31 36 C27 33 22 31 18 28 C17 28 17 28 15 27 C13 26 12 25 10 24 C9 24 8 24 8 24 C-9 16 -28 11 -46 10 C-73 8 -101 11 -126 22 Z\" transform=\"translate(4590 1503)\"/></g><g id=\"gamepadTestSwitchPath22\" class=\"gamepad-test-control\" data-gamepad-control=\"B\"><path d=\"M0 0 C8 0 15 0 23 0 C26 0 30 0 33 0 C64 -1 64 -1 76 3 C81 5 85 8 90 12 C92 14 95 16 96 19 C99 25 100 30 100 35 C100 40 100 44 99 49 C97 53 95 57 92 61 C89 64 89 64 87 65 C86 66 85 66 84 67 C85 68 85 70 86 71 C87 71 87 72 88 72 C91 74 94 75 97 78 C100 81 103 85 106 89 C108 95 108 101 107 108 C107 112 107 116 105 121 C103 126 100 130 96 134 C93 136 93 136 91 138 C90 139 89 139 88 140 C84 143 79 144 73 145 C66 147 59 146 52 146 C51 146 49 146 47 146 C43 146 39 146 35 146 C31 146 27 146 23 146 C15 146 7 146 -1 146 C-2 145 -3 143 -4 142 C-4 96 -4 50 -4 3 C-3 2 -1 1 0 0 Z M23 22 C23 22 22 23 22 23 C22 35 22 46 22 58 C23 59 23 59 24 60 C29 60 34 60 39 60 C41 60 42 60 44 60 C46 60 49 60 51 60 C52 60 52 60 54 60 C56 60 58 60 60 60 C64 59 67 57 70 54 C72 52 74 49 75 46 C76 42 76 38 75 34 C74 33 73 31 72 30 C72 30 71 29 71 28 C69 26 67 24 64 23 C62 22 60 22 58 22 C56 22 54 22 53 22 C52 22 52 22 50 22 C47 22 45 22 42 22 C40 22 38 22 37 22 C32 22 28 22 23 22 Z M24 81 C23 82 23 82 22 83 C21 96 21 109 21 122 C22 123 24 125 25 126 C30 126 35 126 40 126 C42 126 44 126 45 126 C63 125 63 125 70 123 C72 122 72 122 75 120 C78 117 79 116 80 113 C82 109 82 107 83 103 C82 100 82 98 81 96 C80 93 79 91 77 89 C75 87 74 86 72 85 C71 84 70 84 70 83 C66 82 64 81 60 81 C57 81 54 81 51 81 C51 81 50 81 49 81 C47 81 44 81 42 81 C40 81 38 81 36 81 C32 81 28 81 24 81 Z\" transform=\"translate(4481 1614)\"/></g><path d=\"M0 0 C1 0 2 0 2 0 C5 0 8 0 11 0 C13 0 15 0 17 0 C23 0 30 0 36 0 C38 0 40 0 43 0 C53 0 64 0 74 0 C86 0 98 0 110 0 C120 0 129 0 138 0 C144 0 149 0 155 0 C160 0 165 0 171 0 C173 0 175 0 176 0 C186 0 195 0 205 3 C209 5 212 7 216 9 C217 9 217 10 218 10 C220 11 221 12 223 13 C223 14 223 14 223 15 C223 15 223 15 224 16 C227 18 229 20 232 22 C232 23 232 23 232 24 C232 24 233 24 234 24 C239 32 243 40 245 50 C246 56 246 62 246 68 C246 70 246 71 246 73 C246 77 246 81 246 85 C246 89 246 94 246 98 C246 106 246 114 246 123 C246 132 246 141 246 150 C247 184 247 218 247 252 C247 253 247 253 250 255 C250 255 250 255 253 255 C276 255 299 255 322 255 C333 255 344 255 355 255 C365 255 375 255 384 255 C389 255 395 255 400 255 C405 255 409 255 414 255 C416 255 418 255 420 255 C443 255 443 255 453 258 C456 259 458 261 461 262 C462 263 463 263 463 264 C471 268 477 274 483 280 C488 287 491 293 494 301 C496 312 496 322 496 333 C496 335 496 337 496 339 C496 345 496 350 496 355 C496 360 496 364 496 369 C496 380 496 390 496 401 C496 412 496 423 496 434 C496 443 496 453 496 462 C496 468 496 474 496 479 C496 485 496 490 496 495 C496 497 496 499 496 501 C496 511 496 520 493 530 C490 538 486 544 481 550 C480 551 479 551 479 552 C478 552 478 552 477 554 C472 559 467 563 461 566 C455 569 448 571 442 572 C434 573 426 573 418 573 C415 573 413 573 411 573 C404 573 398 573 392 573 C386 573 380 573 374 573 C358 573 342 573 327 573 C326 573 325 573 324 573 C298 573 273 573 247 573 C247 574 247 575 247 576 C247 601 247 626 247 650 C246 662 246 674 246 686 C246 696 246 707 246 717 C246 723 246 728 246 734 C246 739 246 744 246 749 C246 751 246 753 246 755 C246 765 246 774 243 783 C240 791 236 798 230 805 C225 810 219 815 212 818 C205 822 197 824 189 824 C184 825 178 825 172 825 C170 825 168 825 166 825 C161 825 156 825 150 825 C145 825 140 825 134 825 C125 825 116 825 107 825 C96 825 85 825 75 825 C63 825 52 825 41 824 C38 824 34 824 31 824 C26 824 21 824 16 824 C14 824 12 824 10 824 C-1 824 -12 824 -22 820 C-29 817 -36 814 -42 809 C-48 803 -53 797 -57 789 C-59 785 -60 781 -61 776 C-61 776 -61 776 -62 774 C-63 769 -64 764 -64 759 C-64 758 -64 757 -64 756 C-64 754 -64 751 -64 749 C-64 747 -64 745 -64 743 C-64 738 -64 733 -63 727 C-63 722 -63 717 -63 711 C-63 701 -63 691 -63 681 C-63 669 -63 658 -63 646 C-63 623 -63 599 -63 575 C-64 574 -65 574 -66 573 C-67 573 -68 573 -69 573 C-91 573 -113 573 -135 573 C-146 573 -157 573 -167 573 C-177 573 -186 573 -195 573 C-200 573 -205 573 -210 573 C-215 573 -219 573 -224 573 C-226 573 -227 573 -229 573 C-238 573 -247 573 -256 572 C-256 572 -257 572 -258 572 C-264 571 -270 570 -276 567 C-283 563 -289 559 -295 553 C-300 547 -304 540 -308 532 C-308 530 -309 529 -309 527 C-309 527 -309 527 -310 525 C-313 516 -313 506 -313 497 C-313 495 -313 493 -313 491 C-313 485 -313 480 -313 475 C-313 470 -313 466 -313 461 C-313 451 -313 440 -313 430 C-313 419 -313 408 -313 398 C-313 388 -313 379 -313 370 C-313 364 -313 359 -313 353 C-313 348 -313 343 -313 337 C-313 335 -313 334 -313 332 C-313 320 -312 309 -308 297 C-305 289 -301 283 -295 276 C-289 270 -283 265 -275 261 C-268 258 -262 256 -254 255 C-251 255 -247 255 -244 255 C-243 255 -242 255 -241 255 C-239 255 -237 255 -234 255 C-231 255 -227 255 -224 255 C-219 255 -213 255 -208 255 C-195 255 -182 255 -169 255 C-167 255 -166 255 -165 255 C-141 255 -118 255 -94 255 C-94 255 -94 255 -92 255 C-83 254 -73 254 -64 254 C-64 249 -63 245 -63 240 C-63 239 -63 238 -63 238 C-63 235 -63 233 -63 230 C-63 229 -63 227 -63 225 C-63 221 -63 218 -63 214 C-63 208 -63 202 -63 196 C-63 180 -63 163 -63 146 C-63 137 -63 128 -63 119 C-63 113 -63 107 -63 101 C-63 98 -64 94 -64 90 C-64 89 -64 87 -64 85 C-64 76 -63 67 -62 58 C-62 58 -62 57 -62 56 C-61 49 -60 43 -57 36 C-56 33 -54 30 -51 27 C-51 26 -50 25 -49 24 C-45 19 -40 14 -34 10 C-28 6 -21 3 -14 1 C-10 0 -5 0 0 0 Z M-17 29 C-22 32 -26 36 -30 41 C-33 45 -36 49 -37 53 C-38 58 -38 62 -38 66 C-38 67 -38 68 -38 69 C-38 72 -38 75 -38 77 C-38 79 -38 81 -38 83 C-38 88 -38 92 -38 96 C-38 103 -38 110 -39 117 C-39 119 -39 122 -39 124 C-39 125 -39 126 -39 127 C-39 143 -39 159 -39 175 C-39 186 -39 197 -39 207 C-39 213 -39 219 -39 224 C-39 230 -39 235 -39 240 C-39 242 -39 244 -39 246 C-39 261 -39 261 -40 267 C-41 269 -41 269 -43 273 C-45 274 -45 274 -51 279 C-52 279 -53 279 -54 279 C-80 279 -105 279 -130 279 C-142 279 -155 279 -167 279 C-177 279 -188 279 -199 279 C-204 279 -210 279 -216 279 C-221 279 -226 279 -231 279 C-233 279 -235 279 -237 279 C-252 279 -252 279 -258 281 C-264 284 -269 288 -274 292 C-279 297 -282 302 -285 308 C-286 313 -286 317 -286 321 C-286 322 -286 323 -286 324 C-286 327 -286 329 -286 332 C-286 334 -286 336 -286 338 C-286 344 -286 349 -286 354 C-286 358 -287 361 -287 364 C-287 375 -287 386 -287 396 C-287 408 -287 420 -287 433 C-287 442 -287 451 -287 461 C-287 467 -287 472 -287 478 C-287 483 -287 488 -287 494 C-287 496 -287 497 -287 499 C-287 502 -287 505 -287 507 C-287 508 -287 508 -287 510 C-287 515 -286 519 -284 523 C-282 528 -280 532 -277 536 C-274 539 -271 541 -268 543 C-266 544 -265 544 -263 545 C-263 545 -262 546 -261 546 C-258 548 -254 549 -250 549 C-248 549 -247 549 -245 549 C-244 549 -243 549 -241 549 C-240 549 -239 549 -238 549 C-236 549 -234 549 -232 549 C-230 549 -227 549 -225 549 C-217 549 -209 549 -201 549 C-200 549 -199 549 -198 549 C-169 549 -141 549 -112 550 C-110 550 -108 550 -105 550 C-88 550 -70 550 -52 550 C-51 551 -50 552 -48 553 C-48 553 -48 553 -46 555 C-44 556 -44 556 -42 558 C-40 563 -39 568 -39 573 C-39 579 -39 584 -39 590 C-39 592 -39 594 -39 596 C-39 600 -39 604 -39 608 C-39 615 -39 621 -39 628 C-39 647 -39 665 -39 684 C-39 694 -39 704 -39 715 C-39 721 -39 727 -39 734 C-39 738 -39 742 -39 746 C-39 748 -39 750 -39 752 C-39 768 -39 768 -36 775 C-35 778 -33 782 -30 785 C-26 789 -22 793 -17 795 C-16 796 -15 797 -13 797 C-12 798 -11 798 -10 799 C-2 801 6 801 14 801 C16 801 18 801 20 801 C25 801 30 801 35 801 C39 801 43 801 48 801 C58 801 68 801 78 801 C88 801 98 801 109 801 C117 801 126 801 135 801 C140 801 146 801 151 801 C156 801 161 801 166 801 C168 801 170 801 171 801 C186 801 186 801 192 799 C197 797 202 795 207 791 C211 787 215 782 218 777 C220 773 221 769 222 765 C222 762 222 760 222 757 C222 756 222 755 222 754 C222 752 222 749 222 746 C222 744 222 742 222 740 C222 736 222 732 222 728 C222 721 222 714 222 708 C222 691 222 675 222 658 C222 646 222 633 222 620 C222 614 222 607 222 600 C222 596 222 592 222 588 C222 586 222 584 222 582 C222 580 222 577 222 575 C222 574 222 573 222 572 C222 569 223 565 224 562 C226 558 226 558 228 555 C231 553 233 552 236 550 C237 550 238 550 239 550 C262 550 286 550 309 550 C321 550 332 550 343 550 C353 550 363 550 373 550 C379 549 384 549 389 549 C394 549 399 549 404 549 C406 549 408 549 409 549 C436 549 436 549 443 547 C449 545 454 541 459 537 C462 533 465 529 468 524 C469 520 471 516 471 511 C471 509 471 508 471 506 C471 506 471 505 471 504 C471 501 471 498 471 496 C471 494 471 492 471 490 C471 484 471 479 471 474 C471 469 471 465 471 460 C471 449 471 439 471 428 C471 417 471 406 471 396 C471 386 471 377 471 367 C471 362 471 356 471 351 C471 345 471 340 471 335 C471 333 471 331 471 329 C471 314 471 314 470 309 C468 304 465 299 462 295 C458 291 454 288 449 285 C447 284 445 283 443 282 C442 282 441 281 441 281 C437 280 433 280 429 280 C429 280 428 280 427 280 C424 280 421 280 419 280 C417 280 415 280 412 280 C407 280 402 280 396 280 C391 280 385 280 379 280 C368 280 358 280 347 280 C335 280 322 279 310 279 C285 279 260 279 235 279 C233 278 232 277 231 277 C230 276 230 276 229 275 C227 273 226 272 224 269 C223 267 223 265 222 263 C222 261 222 259 222 256 C222 256 222 255 222 254 C222 251 222 248 222 246 C222 244 222 241 222 239 C222 235 222 231 222 227 C222 220 222 213 222 206 C222 190 222 174 222 159 C222 144 222 130 222 115 C222 109 222 102 222 95 C222 91 222 87 222 82 C222 80 222 78 222 76 C222 60 222 60 220 52 C218 47 215 43 212 39 C209 35 206 33 202 30 C197 27 191 25 186 24 C180 23 173 24 167 24 C165 24 163 24 162 24 C157 24 152 24 147 24 C143 24 138 24 134 24 C124 24 115 24 105 24 C95 24 85 24 74 24 C66 24 57 24 48 24 C43 24 38 24 33 23 C28 23 23 23 18 24 C16 24 15 24 13 23 C2 23 -7 24 -17 29 Z\" transform=\"translate(2153 1644)\"/><g id=\"gamepadTestSwitchPath24\" class=\"gamepad-test-control\" data-gamepad-control=\"RightStick\"><path d=\"M0 0 C1 0 2 0 2 0 C7 0 11 0 15 0 C18 0 22 0 25 0 C61 0 61 0 78 3 C81 3 84 4 87 4 C97 6 107 8 116 10 C117 10 118 11 119 11 C160 21 199 36 234 58 C235 59 236 59 237 60 C248 66 258 73 268 81 C270 83 272 84 275 86 C282 91 289 97 295 102 C295 103 295 104 295 104 C296 104 296 104 297 105 C300 107 303 109 305 112 C306 112 306 113 307 114 C308 115 309 116 311 117 C312 119 314 121 316 123 C323 130 329 137 335 144 C336 145 337 147 338 148 C348 159 356 171 364 183 C365 184 365 185 366 185 C371 193 376 201 380 209 C381 211 383 213 384 215 C388 222 391 229 394 236 C395 239 396 241 397 243 C403 257 408 270 412 284 C413 286 414 289 415 291 C422 312 426 334 429 355 C429 356 429 356 429 358 C431 374 431 391 431 407 C431 410 431 413 432 416 C432 434 430 451 427 469 C427 470 427 471 427 472 C421 511 410 549 393 585 C392 587 391 590 389 592 C377 619 361 646 342 668 C340 671 337 674 335 676 C332 680 329 683 327 687 C326 688 325 689 324 690 C322 692 320 695 317 697 C316 699 314 701 312 702 C311 704 309 705 308 707 C307 708 306 709 305 710 C298 717 291 723 283 729 C282 730 280 732 279 733 C278 733 278 733 277 735 C275 736 274 737 272 738 C268 742 265 744 260 747 C258 749 256 750 254 751 C242 760 228 768 215 776 C212 777 210 779 207 780 C202 784 196 786 190 789 C189 789 188 790 187 790 C185 791 183 792 181 793 C179 794 177 795 175 796 C169 798 164 801 157 803 C156 803 155 803 155 804 C153 804 151 805 149 805 C146 806 144 807 142 808 C98 822 53 829 8 827 C-39 826 -86 817 -130 799 C-133 798 -137 796 -141 794 C-142 794 -143 793 -145 792 C-146 792 -148 791 -150 790 C-150 790 -150 790 -153 789 C-162 785 -170 780 -179 776 C-179 775 -179 775 -181 774 C-191 769 -200 763 -209 756 C-210 756 -211 755 -211 755 C-213 754 -214 753 -216 752 C-217 750 -219 749 -221 748 C-232 740 -242 731 -253 722 C-254 720 -256 719 -258 717 C-267 710 -275 702 -282 693 C-284 691 -286 689 -288 687 C-297 677 -305 666 -313 655 C-313 654 -314 653 -315 652 C-326 635 -338 619 -347 600 C-347 600 -347 600 -348 597 C-354 585 -359 573 -363 561 C-365 556 -367 552 -369 547 C-375 532 -379 516 -383 499 C-383 499 -383 498 -383 497 C-384 494 -384 492 -385 489 C-385 488 -385 487 -385 485 C-387 474 -389 462 -390 450 C-390 449 -390 448 -390 447 C-394 407 -392 367 -383 327 C-382 325 -382 323 -381 321 C-378 304 -372 288 -367 272 C-366 271 -366 270 -366 270 C-363 261 -359 252 -355 243 C-354 243 -354 242 -354 241 C-350 233 -345 225 -341 217 C-339 213 -337 209 -335 205 C-327 191 -317 177 -308 164 C-307 164 -306 164 -306 164 C-305 164 -305 163 -305 163 C-301 155 -294 147 -288 141 C-286 139 -284 137 -283 135 C-278 130 -274 125 -269 121 C-268 119 -267 118 -265 116 C-260 111 -254 106 -248 101 C-245 99 -243 97 -240 94 C-223 78 -203 66 -183 54 C-182 54 -181 53 -181 53 C-170 47 -159 41 -148 36 C-147 36 -146 36 -145 35 C-113 20 -80 11 -45 4 C-44 4 -44 4 -42 4 C-28 1 -14 0 0 0 Z M-81 30 C-84 31 -87 32 -90 33 C-99 36 -108 39 -117 43 C-118 43 -119 43 -119 43 C-129 47 -139 51 -149 56 C-151 57 -153 58 -155 59 C-168 66 -180 73 -193 81 C-193 82 -193 82 -196 83 C-202 87 -207 91 -213 95 C-214 96 -215 97 -216 97 C-223 103 -229 108 -236 114 C-238 115 -240 117 -242 119 C-245 121 -247 124 -250 126 C-251 128 -253 129 -254 131 C-256 132 -257 134 -259 136 C-259 136 -259 136 -262 138 C-267 143 -271 148 -276 153 C-276 154 -277 155 -277 155 C-293 174 -307 193 -319 214 C-321 216 -322 219 -324 222 C-329 230 -334 239 -338 249 C-340 254 -342 259 -344 263 C-352 281 -358 300 -363 318 C-363 319 -363 319 -364 321 C-371 350 -374 379 -374 408 C-374 411 -374 413 -374 416 C-374 433 -373 449 -371 466 C-371 466 -371 466 -370 468 C-367 491 -362 513 -355 535 C-354 537 -353 540 -352 542 C-347 558 -341 574 -333 589 C-332 590 -332 591 -331 592 C-326 601 -321 611 -315 620 C-314 622 -312 624 -311 627 C-308 632 -305 636 -302 641 C-301 642 -300 643 -299 645 C-295 651 -290 657 -285 663 C-283 665 -281 668 -279 670 C-271 680 -262 689 -253 698 C-252 699 -250 701 -249 702 C-242 709 -236 715 -229 720 C-227 721 -226 722 -225 723 C-214 732 -203 740 -191 747 C-188 749 -185 751 -182 753 C-177 756 -173 758 -168 761 C-165 762 -163 763 -160 765 C-150 771 -138 776 -127 780 C-125 781 -123 782 -121 783 C-111 787 -102 790 -92 793 C-91 793 -90 794 -89 794 C-73 799 -57 802 -40 804 C-39 804 -38 805 -37 805 C-2 810 33 811 68 806 C69 806 70 806 71 806 C83 804 95 802 106 799 C107 799 109 799 110 798 C129 794 147 787 165 780 C167 779 169 778 172 777 C182 773 192 769 201 763 C203 762 205 761 207 760 C217 755 226 749 235 743 C236 743 237 742 239 741 C251 733 263 724 274 713 C276 712 277 711 278 710 C279 709 280 709 280 708 C282 707 283 706 284 704 C290 699 296 693 302 688 C302 687 302 687 304 685 C309 680 314 675 318 670 C319 669 320 668 321 667 C327 660 333 651 339 643 C341 641 342 638 344 636 C351 627 356 617 362 607 C363 605 365 603 366 600 C372 591 376 581 380 571 C381 570 381 570 381 569 C386 558 390 548 393 537 C394 535 395 533 395 531 C399 522 401 513 403 503 C404 502 404 502 404 501 C415 455 417 408 412 361 C409 334 403 307 394 280 C393 279 392 277 391 275 C382 248 370 223 354 199 C354 199 354 199 352 196 C348 190 343 183 339 177 C337 175 336 173 334 171 C323 157 312 143 299 131 C298 130 298 129 297 129 C296 127 294 126 293 124 C292 123 291 123 290 122 C287 119 285 117 282 115 C282 115 281 115 280 115 C280 114 280 113 279 112 C244 83 206 61 163 43 C163 43 162 43 161 42 C151 38 140 35 129 32 C126 31 123 30 120 29 C58 11 -19 10 -81 30 Z\" transform=\"translate(3821 1692)\"/></g><g id=\"gamepadTestSwitchPath25\" class=\"gamepad-test-control\" data-gamepad-control=\"DpadUp\"><path d=\"M0 0 C2 0 3 0 5 0 C8 2 10 4 11 7 C12 8 12 8 13 10 C16 16 19 22 23 28 C23 29 23 29 25 31 C35 49 35 49 39 55 C42 58 44 62 46 66 C47 68 48 69 49 71 C49 72 49 72 48 75 C47 76 46 76 45 77 C34 77 23 77 12 77 C7 77 2 77 -4 77 C-8 77 -13 77 -18 77 C-20 77 -22 77 -24 77 C-27 77 -29 77 -32 77 C-32 77 -32 77 -34 77 C-36 77 -38 77 -40 77 C-41 77 -41 76 -42 76 C-42 74 -42 72 -42 70 C-39 65 -36 60 -33 55 C-28 46 -22 37 -17 28 C-13 21 -9 14 -5 7 C-4 6 -4 6 -4 5 C-1 1 -1 1 0 0 Z\" transform=\"translate(2242 1752)\"/></g><g id=\"gamepadTestSwitchPath26\" class=\"gamepad-test-control\" data-gamepad-control=\"RightStick\"><path d=\"M0 0 C0 0 0 0 3 0 C16 0 29 0 42 2 C44 2 46 3 48 3 C68 5 87 10 107 17 C110 18 113 19 115 20 C126 24 136 29 146 34 C148 35 150 36 152 37 C169 46 186 57 201 69 C203 70 204 71 206 72 C209 75 212 78 215 81 C217 83 219 85 221 87 C223 88 225 90 226 92 C227 92 228 93 229 94 C233 98 237 103 241 107 C243 109 244 111 246 112 C252 119 258 126 263 133 C264 135 265 137 267 139 C268 142 270 144 272 147 C273 149 274 151 276 153 C283 163 288 174 293 185 C294 187 295 189 296 191 C300 199 303 207 306 216 C306 217 307 218 307 218 C314 238 318 257 321 278 C321 279 321 279 321 280 C323 296 324 312 324 328 C324 329 324 329 324 331 C324 343 324 354 322 366 C322 367 322 367 322 369 C319 386 315 403 310 420 C310 421 310 422 309 423 C305 435 301 447 295 459 C294 461 293 463 292 465 C287 477 281 488 274 499 C273 500 273 501 272 502 C267 510 261 517 255 525 C253 527 251 530 249 532 C244 540 237 547 230 553 C229 555 227 557 225 558 C218 565 212 571 204 577 C203 578 203 578 202 579 C180 596 157 611 131 621 C128 622 125 623 122 625 C109 631 95 635 81 639 C80 639 80 639 78 640 C54 647 29 648 4 648 C3 648 2 648 1 648 C-11 648 -24 648 -36 646 C-37 646 -38 646 -39 646 C-54 644 -70 640 -85 636 C-86 636 -87 636 -87 636 C-104 632 -119 625 -134 618 C-135 618 -137 617 -138 616 C-146 613 -154 608 -162 603 C-164 602 -166 601 -168 599 C-176 595 -184 590 -191 584 C-191 584 -191 584 -194 582 C-210 570 -227 555 -239 539 C-239 539 -239 539 -240 536 C-241 536 -242 536 -243 535 C-254 522 -263 509 -272 495 C-273 493 -275 491 -276 489 C-280 483 -283 477 -286 470 C-286 469 -287 468 -288 467 C-289 463 -291 459 -293 455 C-293 454 -294 454 -294 453 C-304 431 -311 408 -316 385 C-316 385 -316 384 -316 383 C-324 348 -322 309 -317 273 C-315 259 -311 244 -307 230 C-307 230 -307 230 -306 227 C-300 205 -289 183 -278 163 C-277 162 -277 161 -276 160 C-266 141 -254 124 -239 109 C-238 107 -236 105 -235 103 C-224 91 -213 80 -200 70 C-198 69 -196 68 -194 66 C-194 66 -194 66 -192 65 C-191 64 -190 63 -189 62 C-172 48 -151 37 -131 28 C-131 28 -131 28 -129 27 C-103 16 -75 8 -47 3 C-47 3 -47 3 -45 3 C-30 1 -15 0 0 0 Z M-65 33 C-65 33 -65 33 -68 34 C-80 37 -92 41 -104 45 C-104 45 -104 45 -107 46 C-137 56 -165 77 -190 96 C-192 98 -194 100 -196 101 C-196 102 -196 103 -196 103 C-197 103 -197 104 -198 104 C-202 106 -206 110 -210 114 C-211 115 -212 117 -213 118 C-214 119 -216 121 -217 122 C-225 131 -231 140 -238 149 C-239 150 -239 151 -240 152 C-242 154 -243 157 -245 159 C-245 159 -245 159 -246 161 C-257 176 -265 192 -272 210 C-273 212 -274 214 -275 217 C-288 247 -294 279 -296 312 C-297 345 -292 379 -283 410 C-281 414 -280 418 -279 421 C-279 422 -278 423 -278 424 C-270 446 -259 469 -246 487 C-245 488 -245 489 -244 490 C-236 502 -228 512 -219 523 C-218 523 -218 523 -217 523 C-217 524 -216 524 -216 525 C-215 527 -213 529 -211 531 C-211 532 -210 532 -209 533 C-208 534 -208 535 -207 536 C-206 536 -206 536 -205 538 C-181 561 -154 580 -123 594 C-119 596 -114 598 -110 600 C-109 601 -107 602 -106 602 C-100 605 -93 607 -87 609 C-86 610 -85 610 -84 610 C-63 617 -42 620 -21 622 C-20 622 -19 622 -18 622 C-2 623 15 624 31 622 C32 622 34 622 35 622 C47 620 58 618 70 615 C71 615 71 615 72 615 C103 607 132 594 159 577 C161 575 164 573 167 572 C173 568 178 564 184 559 C184 559 184 558 184 557 C185 557 185 557 186 557 C189 555 191 552 194 550 C195 549 196 548 197 547 C198 547 198 546 199 546 C201 544 203 542 205 540 C207 538 210 535 213 532 C213 532 213 532 215 531 C219 526 223 522 227 517 C228 516 229 515 229 515 C246 495 259 473 270 449 C270 448 271 447 271 446 C282 424 288 402 293 378 C293 378 293 378 294 376 C295 371 295 366 296 361 C296 360 296 360 296 359 C301 324 298 289 290 255 C288 246 286 237 283 228 C283 227 283 227 282 226 C277 211 271 197 263 183 C261 180 260 178 258 175 C250 159 239 145 228 131 C227 129 225 127 223 124 C222 124 222 124 221 124 C221 124 221 123 220 123 C219 120 217 118 214 115 C213 114 213 114 212 113 C195 96 176 81 156 69 C154 68 152 66 150 65 C136 56 119 48 103 43 C102 43 101 42 100 42 C97 41 93 40 90 39 C89 39 88 39 87 38 C69 33 51 30 33 27 C33 27 33 27 31 27 C22 26 13 26 5 26 C4 26 3 26 2 26 C-21 26 -43 28 -65 33 Z\" transform=\"translate(3840 1780)\"/></g><g id=\"gamepadTestSwitchPath27\" class=\"gamepad-test-control\" data-gamepad-control=\"RightStick\"><path d=\"M0 0 C3 1 6 2 9 3 C10 4 11 4 12 4 C39 15 63 29 85 48 C88 51 91 53 94 55 C94 56 94 57 94 57 C94 58 95 58 95 58 C99 60 102 63 105 67 C106 67 107 68 107 69 C113 75 118 81 123 88 C125 89 126 91 127 92 C144 114 156 139 164 165 C167 175 169 184 171 193 C171 194 171 195 171 196 C173 205 174 215 175 224 C175 225 175 226 175 227 C176 260 172 293 162 324 C157 338 150 350 144 362 C143 364 142 366 141 367 C135 380 126 391 117 401 C115 403 114 405 112 407 C96 427 77 441 56 455 C55 456 55 456 53 457 C36 469 16 476 -4 482 C-5 483 -7 484 -9 484 C-18 487 -26 489 -34 490 C-36 490 -37 490 -38 491 C-62 494 -86 494 -109 491 C-110 491 -111 491 -112 491 C-123 489 -134 487 -145 483 C-146 483 -147 483 -148 482 C-151 481 -155 480 -158 479 C-159 479 -160 479 -161 478 C-188 469 -213 453 -235 436 C-253 421 -268 404 -281 385 C-282 384 -283 383 -283 382 C-298 362 -308 338 -316 314 C-317 313 -317 313 -317 312 C-326 285 -328 258 -327 229 C-327 204 -321 177 -312 153 C-307 142 -302 130 -296 119 C-296 118 -295 117 -294 116 C-288 103 -279 92 -270 80 C-268 78 -266 76 -265 73 C-262 70 -259 67 -256 64 C-256 64 -255 63 -255 62 C-250 57 -244 53 -239 49 C-237 47 -235 45 -233 44 C-226 37 -218 31 -209 26 C-208 26 -207 25 -206 24 C-180 8 -153 -1 -123 -8 C-116 -9 -109 -10 -102 -11 C-102 -11 -102 -11 -99 -11 C-65 -14 -32 -11 0 0 Z M-143 14 C-144 15 -145 15 -146 15 C-162 20 -177 26 -191 35 C-194 36 -196 38 -199 39 C-219 50 -235 67 -251 83 C-251 84 -251 85 -251 85 C-252 86 -253 86 -254 86 C-275 113 -290 140 -301 171 C-303 180 -306 189 -307 198 C-307 199 -308 200 -308 200 C-311 216 -312 232 -311 248 C-311 250 -311 251 -311 252 C-310 277 -305 303 -295 326 C-293 332 -290 337 -287 342 C-287 344 -286 345 -285 346 C-282 354 -278 361 -273 368 C-273 369 -272 370 -272 371 C-267 378 -262 384 -257 391 C-256 392 -255 393 -254 394 C-249 399 -245 404 -240 409 C-240 409 -240 409 -238 411 C-232 416 -227 422 -220 426 C-220 426 -219 426 -218 426 C-218 427 -218 428 -218 428 C-211 434 -203 440 -194 444 C-194 445 -193 445 -192 445 C-176 454 -160 461 -142 467 C-142 468 -141 468 -140 468 C-118 475 -93 478 -70 477 C-43 476 -16 472 10 461 C15 459 21 456 27 452 C29 451 32 449 35 448 C52 440 66 428 81 415 C81 415 82 414 82 414 C97 400 110 386 121 368 C121 367 122 366 123 365 C127 358 131 351 135 344 C135 343 136 342 136 341 C140 334 143 326 146 318 C146 317 147 315 148 314 C154 295 159 276 159 256 C159 255 159 254 159 253 C159 250 159 247 159 244 C159 243 159 242 159 241 C159 228 159 215 156 201 C156 199 155 197 155 195 C152 177 146 158 138 141 C138 141 138 141 137 139 C127 120 115 101 101 85 C99 83 99 83 97 80 C96 80 95 80 95 80 C94 80 94 79 94 78 C92 74 88 71 85 68 C84 68 84 67 83 67 C69 54 52 42 35 34 C33 32 33 32 30 31 C16 22 -1 16 -17 12 C-18 12 -19 12 -19 12 C-24 11 -28 10 -33 9 C-34 8 -36 8 -37 8 C-71 0 -111 4 -143 14 Z\" transform=\"translate(3918 1863)\"/></g><g id=\"gamepadTestSwitchPath28\" class=\"gamepad-test-control\" data-gamepad-control=\"DpadLeft\"><path d=\"M0 0 C2 0 3 1 5 1 C5 1 5 1 6 2 C6 13 6 24 6 35 C7 41 7 46 7 51 C7 56 7 61 7 66 C7 68 7 70 7 72 C7 74 7 77 7 80 C7 80 7 80 7 82 C7 84 7 86 7 88 C6 91 6 91 5 92 C3 92 2 93 0 93 C-4 91 -8 89 -12 86 C-18 83 -23 79 -28 76 C-29 76 -29 75 -30 75 C-33 73 -36 72 -39 70 C-47 65 -55 60 -63 55 C-63 55 -64 54 -65 54 C-67 52 -69 51 -71 49 C-71 47 -70 46 -70 44 C-66 41 -62 38 -58 36 C-51 32 -44 27 -37 23 C-28 17 -19 11 -9 6 C-6 4 -3 2 0 0 Z\" transform=\"translate(2016 2012)\"/></g><g id=\"gamepadTestSwitchPath29\" class=\"gamepad-test-control\" data-gamepad-control=\"DpadRight\"><path d=\"M0 0 C2 0 5 0 7 0 C8 1 9 1 10 2 C17 7 24 11 31 16 C37 19 42 23 48 26 C54 31 60 35 67 38 C70 40 73 42 76 45 C76 47 75 48 75 50 C69 54 63 58 56 62 C55 62 54 63 54 64 C52 64 50 65 49 66 C42 70 36 74 30 78 C29 78 29 78 26 80 C26 80 26 80 23 82 C21 83 18 85 16 86 C15 87 14 88 13 88 C10 90 8 91 5 93 C3 93 2 92 0 92 C-1 91 -1 90 -2 89 C-2 61 -2 32 -2 3 C-1 2 -1 1 0 0 Z\" transform=\"translate(2469 2012)\"/></g><g id=\"gamepadTestSwitchPath30\" class=\"gamepad-test-control\" data-gamepad-control=\"DpadDown\"><path d=\"M0 0 C28 0 57 0 86 0 C87 1 88 2 89 3 C89 6 89 6 88 9 C87 11 86 12 84 14 C82 17 81 21 79 24 C77 26 76 29 74 31 C70 37 67 43 64 49 C59 58 54 66 48 75 C47 75 47 76 46 77 C46 77 45 78 45 78 C44 78 43 79 42 79 C39 76 36 73 34 69 C34 68 33 68 33 67 C32 65 31 64 30 62 C29 60 28 59 27 57 C26 56 26 55 25 54 C24 52 22 49 21 47 C16 40 12 33 8 26 C7 24 6 22 4 20 C4 18 3 17 2 15 C1 15 1 14 1 13 C0 12 -1 10 -2 8 C-2 5 -2 5 -2 2 C-1 1 -1 1 0 0 Z\" transform=\"translate(2202 2285)\"/></g><path d=\"M0 0 C2 0 4 0 6 0 C7 0 8 0 9 0 C10 0 12 0 13 0 C14 0 14 0 17 0 C20 0 22 0 25 0 C29 0 32 0 36 0 C39 0 42 0 46 0 C47 0 48 0 49 0 C51 0 52 0 53 0 C54 0 55 0 56 0 C59 0 59 0 62 1 C63 1 63 1 65 3 C66 5 68 7 69 9 C69 29 69 50 69 71 C68 72 68 72 64 77 C64 77 64 77 62 78 C60 78 58 78 56 78 C55 78 53 78 52 78 C51 78 49 78 48 78 C46 78 45 78 44 78 C40 78 36 78 32 78 C28 78 25 78 21 78 C13 78 6 78 -2 78 C-5 75 -7 73 -9 70 C-11 60 -10 49 -10 38 C-10 35 -10 32 -10 29 C-10 27 -10 25 -10 23 C-10 22 -10 21 -10 20 C-10 17 -10 14 -9 11 C-9 9 -8 7 -7 5 C-2 1 -2 1 0 0 Z M8 14 C7 15 6 16 5 17 C5 32 5 47 5 62 C6 63 7 63 8 64 C23 64 37 64 52 64 C53 63 53 63 54 62 C54 47 54 32 54 17 C53 16 52 15 51 14 C37 14 23 14 8 14 Z\" transform=\"translate(2803 2562)\"/><path d=\"M0 0 C1 1 2 2 3 3 C4 3 5 4 5 4 C6 5 6 5 7 6 C7 6 7 6 8 8 C9 20 9 31 9 43 C9 44 9 46 9 47 C9 56 9 64 7 72 C5 74 2 76 0 78 C-12 79 -23 79 -35 79 C-38 79 -40 79 -43 79 C-45 79 -46 79 -48 79 C-49 79 -50 79 -51 79 C-55 79 -59 79 -64 77 C-68 73 -68 73 -69 71 C-70 68 -70 66 -70 63 C-70 61 -70 60 -70 59 C-70 58 -70 57 -70 55 C-70 54 -70 53 -70 52 C-70 49 -70 46 -70 44 C-70 41 -70 38 -70 36 C-70 32 -70 28 -70 24 C-70 23 -70 22 -70 20 C-70 17 -70 14 -70 11 C-69 7 -69 7 -67 5 C-65 3 -63 1 -60 0 C-58 0 -57 0 -55 0 C-55 0 -55 0 -52 0 C-51 0 -50 -1 -49 -1 C-48 -1 -47 -1 -45 -1 C-30 -1 -15 -2 0 0 Z M-53 14 C-53 15 -53 15 -56 18 C-56 33 -55 47 -55 62 C-54 63 -53 63 -52 64 C-37 64 -23 64 -8 64 C-7 63 -7 63 -6 62 C-6 47 -6 32 -6 17 C-7 16 -8 15 -9 14 C-24 14 -38 14 -53 14 Z\" transform=\"translate(3020 2562)\"/><path d=\"M0 0 C1 0 1 0 3 0 C5 0 6 0 7 0 C8 0 8 0 11 0 C14 0 16 0 19 0 C22 0 26 0 29 0 C33 0 36 0 39 0 C40 0 40 0 43 0 C47 0 51 0 56 1 C58 3 60 6 62 8 C63 21 63 35 63 48 C63 50 63 52 63 54 C63 59 63 64 63 69 C62 72 62 72 60 74 C59 76 57 77 55 78 C34 78 13 78 -9 78 C-11 76 -13 74 -16 72 C-17 69 -17 66 -17 63 C-17 62 -17 60 -17 59 C-17 58 -17 57 -17 56 C-17 54 -17 53 -17 52 C-17 49 -17 47 -17 44 C-17 41 -17 39 -17 36 C-17 32 -17 28 -17 24 C-17 24 -17 24 -17 21 C-17 17 -17 14 -17 11 C-16 8 -14 6 -12 4 C-9 1 -5 0 0 0 Z M1 14 C1 15 1 15 -2 18 C-2 32 -2 47 -2 61 C-1 62 0 63 1 64 C16 64 30 64 45 64 C46 63 47 62 48 60 C48 46 48 31 48 16 C48 16 47 15 46 14 C31 14 17 14 1 14 Z\" transform=\"translate(3125 2562)\"/><path d=\"M0 0 C6 4 6 4 8 6 C8 7 9 7 9 8 C10 21 10 33 10 46 C10 46 10 47 10 48 C10 56 10 63 9 71 C7 73 4 76 2 78 C-19 78 -40 78 -61 78 C-67 73 -67 73 -68 71 C-69 68 -69 66 -69 63 C-69 63 -69 63 -69 60 C-69 58 -69 57 -69 56 C-69 54 -69 53 -69 52 C-69 48 -69 45 -69 41 C-69 38 -69 34 -69 31 C-69 24 -69 17 -69 10 C-65 4 -65 4 -63 3 C-62 2 -60 1 -59 0 C-39 -2 -20 -1 0 0 Z M-51 14 C-51 14 -51 14 -54 16 C-55 21 -55 26 -55 32 C-55 33 -55 33 -55 34 C-55 37 -55 39 -55 42 C-55 44 -55 45 -55 47 C-55 51 -55 56 -55 60 C-54 61 -52 63 -51 64 C-36 64 -22 64 -7 64 C-6 63 -6 63 -5 62 C-5 47 -5 32 -5 17 C-6 16 -7 15 -8 14 C-22 14 -36 14 -51 14 Z\" transform=\"translate(3335 2562)\"/></g><path id=\"gamepadTestLeftStickArrow\" class=\"gamepad-test-stick-arrow\" opacity=\"0\" d=\"\"/><path id=\"gamepadTestRightStickArrow\" class=\"gamepad-test-stick-arrow\" opacity=\"0\" d=\"\"/><g transform=\"scale(0.25)\" fill=\"currentColor\"><g id=\"gamepadTestSwitchZL\" class=\"gamepad-test-control\" data-gamepad-control=\"ZL\"><path d=\"M0 18 C0 8 8 0 18 0 H152 C162 0 170 8 170 18 V52 C170 62 162 70 152 70 H18 C8 70 0 62 0 52 Z\" transform=\"translate(1485 220)\"/></g><g id=\"gamepadTestSwitchZR\" class=\"gamepad-test-control\" data-gamepad-control=\"ZR\"><path d=\"M0 18 C0 8 8 0 18 0 H152 C162 0 170 8 170 18 V52 C170 62 162 70 152 70 H18 C8 70 0 62 0 52 Z\" transform=\"translate(4460 220)\"/></g></g></svg>";

var PLAYSTATION_GAMEPAD_TEST_SVG = "<svg id=\"gamepadTestSvg\" xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 640 518\" stroke-width=\"1\" class=\"gamepad-test-svg\" role=\"img\" aria-label=\"PlayStation controller diagram\"><style>\n.gamepad-test-svg #Button_infills path { fill: #596372; stroke: #c1c8d1; stroke-width: 2; }\n#gamepadTestSvg #Outline #Controller_outline { fill: #292f39; stroke: #8993a1; stroke-width: 3; }\n#gamepadTestSvg #Speaker_grill circle { fill: #8993a1; stroke: none; }\n#gamepadTestSvg #L3_surround, #gamepadTestSvg #R3_surround { fill: #242a33; stroke: #59616c; stroke-width: 2; }\n#gamepadTestSvg #Button_outlines path { fill: none; stroke: #8993a1; stroke-width: 2; }\n#gamepadTestSvg #Trackpad_infill path { fill: #596372; stroke: #c1c8d1; stroke-width: 2; }\n#gamepadTestSvg #Trackpad_outline path { fill: #292f39; stroke: #8993a1; stroke-width: 3; }\n.gamepad-test-svg #L3_infill path, .gamepad-test-svg #R3_infill path { fill: #aab3bf; stroke: #dce1e7; stroke-width: 2; }\n#gamepadTestSvg #L3_outline path, #gamepadTestSvg #R3_outline path { fill: none; stroke: #59616c; stroke-width: 2; }\n#gamepadTestSvg .gamepad-test-control.gamepad-test-active > path { fill: #65d66e; stroke: #d5ffd8; }\n#gamepadTestSvg .gamepad-test-control.gamepad-test-active { fill: #65d66e; stroke: #d5ffd8; }\n#gamepadTestSvg .gamepad-test-stick-arrow { fill: none; stroke: #ffd45c; stroke-width: 4; stroke-linecap: round; stroke-linejoin: round; }\n</style>\n  <g id=\"Button_infills\">\n    <g id=\"Mute_infill\" transform=\"translate(0,0.65) scale(0.70)\">\n      <path id=\"Mute_infill\" d=\"M454.47,468.7c-6.47,0-12.69.04-18.75.14-.92.01-2.18.28-2.96,1.48-.56.85-.83,2.14-.8,3.81.03,2.24.41,3.3,3.67,3.32,4.47.03,8.94.02,13.41.02l5.53-.03c1.83,0,3.67,0,5.5-.01,4.41-.01,8.97-.03,13.46.04,3.68.09,4.03-1.61,4.06-3.62.02-1.47-.23-2.58-.76-3.39-.67-1.03-1.83-1.6-3.26-1.62-6.64-.08-12.98-.12-19.1-.12Z\"/>\n    </g>\n    <g id=\"gamepadTestDpadDown\" class=\"gamepad-test-control\" transform=\"translate(0,0.65) scale(0.70)\">\n      <path d=\"M177.4,357.17c-1.88,2.05-4.45,3.18-7.24,3.18h-22.91c-2.79,0-5.36-1.13-7.25-3.18-1.88-2.05-2.79-4.71-2.55-7.49l1.25-14.78c.43-5.04,2.71-9.71,6.42-13.16l9.04-8.39c1.21-1.12,2.74-1.68,4.27-1.68s2.98.54,4.18,1.61l9.44,8.45c3.87,3.47,6.24,8.23,6.68,13.4l1.23,14.55c.24,2.78-.67,5.44-2.56,7.49Z\"/>\n    </g>\n    <g id=\"PS_infill\" transform=\"translate(0,0.65) scale(0.70)\">\n      <path d=\"M455.41,437.59c11.37.03,20.87-9.06,21-20.1.14-11.24-9.39-20.97-20.61-21.05-11.23-.08-21,9.57-20.99,20.72,0,11.16,9.32,20.4,20.6,20.43Z\"/>\n    </g>\n    <g id=\"gamepadTestDpadRight\" class=\"gamepad-test-control\" transform=\"translate(0,0.65) scale(0.70)\">\n      <path d=\"M223.51,284.09v22.91c0,2.79-1.13,5.36-3.18,7.24-2.05,1.89-4.71,2.8-7.49,2.56l-14.55-1.23c-5.17-.44-9.93-2.81-13.39-6.68l-8.46-9.44c-2.17-2.43-2.14-6.06.07-8.45l8.4-9.04c3.44-3.71,8.11-5.99,13.15-6.42l14.78-1.25c2.78-.24,5.44.67,7.49,2.56,2.05,1.88,3.18,4.45,3.18,7.24Z\"/>\n    </g>\n    <g id=\"gamepadTestDpadLeft\" class=\"gamepad-test-control\" transform=\"translate(0,0.65) scale(0.70)\">\n      <path d=\"M140.97,299.45l-8.46,9.44c-3.46,3.87-8.22,6.24-13.39,6.68l-14.55,1.23c-2.78.24-5.44-.67-7.49-2.56-2.05-1.88-3.18-4.45-3.18-7.24v-22.91c0-2.79,1.13-5.36,3.18-7.24,1.84-1.69,4.17-2.6,6.63-2.6.28,0,.57.01.86.04l14.78,1.25c5.04.43,9.71,2.71,13.15,6.42l8.4,9.04c2.21,2.39,2.24,6.02.07,8.45Z\"/>\n    </g>\n    <g id=\"gamepadTestDpadUp\" class=\"gamepad-test-control\" transform=\"translate(0,0.65) scale(0.70)\">\n      <path d=\"M179.96,241.41l-1.23,14.55c-.44,5.17-2.81,9.93-6.68,13.39l-9.44,8.46c-2.43,2.17-6.06,2.14-8.45-.07l-9.04-8.4c-3.71-3.44-5.99-8.11-6.42-13.15l-1.25-14.78c-.24-2.78.67-5.44,2.55-7.49,1.89-2.05,4.46-3.18,7.25-3.18h22.91c2.79,0,5.36,1.13,7.24,3.18,1.89,2.05,2.8,4.71,2.56,7.49Z\"/>\n    </g>\n    <g id=\"gamepadTestY\" class=\"gamepad-test-control\" transform=\"translate(0,0.65) scale(0.70)\">\n      <path d=\"M751.45,261.08c15.08-.01,26.75-11.5,26.73-26.31-.02-14.47-12.19-26.62-26.73-26.69-14.57-.07-26.65,11.99-26.66,26.63-.01,14.84,11.65,26.37,26.66,26.36Z\"/>\n    </g>\n    <g id=\"gamepadTestA\" class=\"gamepad-test-control\" transform=\"translate(0,0.65) scale(0.70)\">\n      <path d=\"M750.93,379.05c15.44-.06,27.38-11.64,27.24-26.43-.13-14.28-12.84-26.83-26.99-26.3-14.58.55-26.43,12.2-26.39,26.91.04,14.23,11.83,25.88,26.14,25.82Z\"/>\n    </g>\n    <g id=\"gamepadTestB\" class=\"gamepad-test-control\" transform=\"translate(0,0.65) scale(0.70)\">\n      <path d=\"M787.29,293.47c-.03,14.49,11.88,26.68,26.15,26.75,14.74.08,26.99-11.95,26.95-26.46-.04-14.51-12.12-26.34-27.04-26.48-14.04-.14-26.03,11.91-26.06,26.18Z\"/>\n    </g>\n    <g id=\"gamepadTestX\" class=\"gamepad-test-control\" transform=\"translate(0,0.65) scale(0.70)\">\n      <path d=\"M689.1,320.22c14.61.11,27.23-12.13,27.17-26.35-.06-14.09-12.36-26.44-26.54-26.66-14.42-.22-26.52,11.67-26.66,26.18-.13,14.49,11.74,26.73,26.03,26.83Z\"/>\n    </g>\n    <g id=\"gamepadTestStart\" class=\"gamepad-test-control\" transform=\"translate(0,0.65) scale(0.70)\">\n      <path d=\"M691.58,199.27l-4.27,17.92c-.91,3.82-4.76,6.19-8.58,5.28-3.82-.91-6.19-4.76-5.28-8.58l4.27-17.92c.78-3.27,3.71-5.48,6.93-5.48.54,0,1.1.06,1.65.19,1.85.44,3.42,1.58,4.42,3.2s1.3,3.53.86,5.38Z\"/>\n    </g>\n    <g id=\"gamepadTestSelect\" class=\"gamepad-test-control\" transform=\"translate(0,0.65) scale(0.70)\">\n      <path d=\"M224.03,191.39c.55-.13,1.11-.19,1.65-.19,3.22,0,6.15,2.21,6.93,5.47l4.27,17.93c.44,1.85.13,3.76-.86,5.38-1,1.62-2.57,2.76-4.42,3.2-3.82.91-7.67-1.46-8.58-5.28l-4.27-17.92c-.91-3.82,1.46-7.67,5.28-8.58Z\"/>\n    </g>\n    <g id=\"gamepadTestRT\" class=\"gamepad-test-control\" transform=\"translate(0,0.65) scale(0.70)\">\n      <path d=\"M800.14,115.88c-1.06,1.16-2.71,1.73-5.05,1.73-.01,0-.03,0-.04-.01-24.46-6.24-52.88-10.2-84.5-11.76h-.12c-4.19.08-7.09-.8-8.55-2.62-1.41-1.74-1.67-4.53-.77-8.29l.03-.15,9.87-67.57c3.29-14.17,13.23-21.12,30.28-21.12,2.57,0,5.31.16,8.22.47,13.16,1.54,22.93,6.87,29.86,16.29,2.6,3.53,4.67,7.72,6.16,12.44,7.81,24.72,11.55,46.61,15.88,71.95l.15.88c.41,3.61-.06,6.25-1.42,7.76Z\"/>\n    </g>\n    <g id=\"gamepadTestLT\" class=\"gamepad-test-control\" transform=\"translate(0,0.65) scale(0.70)\">\n      <path d=\"M208.41,103.22c-1.47,1.82-4.36,2.7-8.55,2.62h-.12c-31.62,1.56-60.04,5.52-84.5,11.76-.01.01-.03.01-.04.01-2.34,0-4-.57-5.05-1.73-1.36-1.51-1.84-4.15-1.42-7.76l.15-.88c4.33-25.34,8.07-47.23,15.87-71.95,1.49-4.72,3.57-8.91,6.17-12.44,6.93-9.42,16.7-14.75,29.86-16.29,2.9-.31,5.64-.47,8.22-.47,17.05,0,26.98,6.95,30.28,21.12l9.87,67.57.03.15c.89,3.76.63,6.55-.77,8.29Z\"/>\n    </g>\n    <g id=\"gamepadTestRB\" class=\"gamepad-test-control\" transform=\"translate(0,0.65) scale(0.70)\">\n      <path d=\"M805.8,173.73c-45.97-8.48-86.34-15.03-123.26-19.99,2.9-8.22,9.5-13.32,20.48-15.9,26.02-3.4,53.76,2.2,87.27,17.61.98.44,1.96.95,2.94,1.51,9.2,5.27,12.41,9.42,12.57,16.77Z\"/>\n    </g>\n    <g id=\"gamepadTestLB\" class=\"gamepad-test-control\" transform=\"translate(0,0.65) scale(0.70)\">\n      <path d=\"M226.89,153.84c-42.76,6.62-84.3,13.1-123.56,19.27.76-6.19,2.09-12.15,27.86-22.29,28.7-10.58,37.26-12.24,70.44-13.64,2.49-.11,4.68,0,6.67.32,9.71,1.57,15.81,6.94,18.59,16.34Z\"/>\n    </g>\n  </g>\n  <g id=\"Outline\" transform=\"translate(0,0.65) scale(0.70)\">\n    <g id=\"Controller\">\n      <path id=\"Controller_outline\" d=\"M804.61,172.5s.09.02.13.02c-45.03-8.29-84.58-14.71-120.82-19.6.06,0,.12.02.17.02-.09.21-.14.44-.23.66-1.95.4-4.06.27-6,.85-.01-.01-.04-.03-.06-.05-.04-.13-.09-.26-.14-.39.02,0,.04,0,.07,0-4.87-.52-9.74-1.01-14.62-1.5-4.79-.46-9.6-.91-14.4-1.34h-.01s-.37-.05-.37-.05c-9.11-.83-18.27-1.58-27.45-2.28,0,.04,0,.08,0,.11,6.85.92,13.16,2.58,18.67,6.93,0,0-.01-.01-.02-.02,1.13.1,2.24.2,3.36.3,5.18,1.42,9.39,5.36,10.93,10.49,1.6,5.35,1.3,12.24-.9,20.47l-21.05,109.2c-4.19,26.12-19.01,37.08-42.82,41.56l-143.01.03-128.89-.03c-23.72-4.39-39.07-18.19-42.83-41.64l-2.11-10.93c-.29-2.09-.65-4.23-1.12-6.43l-12.19-62.64-5.57-28.92-.04-.19c-.09-.35-.16-.68-.25-1.03l-1.25-6.42s0-.03-.01-.04c-.67-4.99-.48-9.34.61-12.98,1.44-4.81,5.22-8.56,9.95-10.19,1.68-.14,3.36-.28,5.03-.42-.01,0-.02.02-.04.03.13-.02.26-.04.39-.06,1.51-.96,3.05-1.79,4.52-2.46,4.51-2.11,9.69-3.99,14.78-4.58-8.71.66-17.56,1.37-26.29,2.11l-1.11.09c-9.48.82-18.77,1.68-27.61,2.55l-.46.05s0-.01,0-.02c-.02.03-.03.06-.04.09-1.99.06-3.94-.42-5.98-.72,0-.03,0-.06-.01-.09.03,0,.06,0,.08-.01-41.23,6.38-81.95,12.73-121.09,18.88,0-.03.01-.07.02-.1l-5.76,1.61c-1.39.76-2.77,1.68-4.11,2.75-6.4,5.15-12.04,13.69-17.24,26.11-27.39,64.19-47.54,129.24-59.9,193.34C4.64,462.34-.21,530.22,3.08,597.4c2.41,40.48,7.54,66.82,16.62,85.41,9.85,20.12,24.59,31.39,46.4,35.45l39.76,12.39.33.07h.1c.97.12,1.93.18,2.86.18,13.63,0,18.84-11.41,21.55-19.96,27.65-75.71,49.02-130.11,67.27-171.19,8.52-19.59,24.3-29.11,48.23-29.11,3.5,0,7.23.21,11.11.63h.17c60.68,2.54,123.31,3.82,186.16,3.82,70.29,0,142.26-1.6,213.94-4.76,2.31-.2,4.59-.3,6.77-.3,23.28,0,39.64,11.03,50,33.68,26.25,62.96,48.44,119.86,67.83,173.94,3.28,8.94,9.45,13.47,18.32,13.47,1.52,0,3.14-.14,4.82-.4h.06s45.5-13.11,45.5-13.11c2-.48,4.05-1.09,6.27-1.86l.13-.04.72-.25v-.02c15.47-5.75,26.84-17.21,34.75-35,7.77-17.48,12.58-41.33,15.58-77.35,4.35-57.49-1.58-134.16-16.29-210.35-15.8-81.82-40.06-154.86-68.3-205.65-2.37-4.62-4.05-7.26-5.79-9.11-2.01-2.17-4.26-3.46-7.64-4.35,0-.05-.03.03-.04-.02M654.75,157.28c1.32.12,2.27.2,2.26.19,4.84.46,9.76.95,14.92,1.48-3.75,2.27-6.89,5.18-9.51,8.8-.01-.02-.01-.04-.02-.06-.81,1.03-1.56,2.12-2.23,3.26-.18-2.07-.53-4.04-1.07-5.86-.89-2.98-2.4-5.62-4.35-7.82ZM251.1,157.47l.22-.17.34-.03c-2.05,2.16-3.62,4.8-4.53,7.83-.29.95-.5,1.95-.69,2.98-.3-.5-.5-.83-.51-.82-2.55-3.31-5.76-6.16-9.46-8.41,4.54-.44,9.37-.89,14.63-1.37ZM63.74,711.34c-1.7,0-3.53-.26-5.45-.77l-.46-.09c-15.03-4.97-25.58-14.54-33.18-30.09-8.75-17.89-13.71-43.59-16.08-83.29C2.18,466.43,27.04,334.31,82.48,204.42c5.96-14.26,12.4-22.95,19.68-26.57,36.97-5.81,77.23-12.09,119.66-18.67,12.6,2.24,22,10.48,24.57,21.52.29,2.12.73,4.32,1.3,6.61l5.63,28.91,13.52,70.16c3.04,22.28-4.43,36.44-19.51,54.89-33.86,35.52-63.96,83.16-92.02,145.65-22.57,50.27-43.21,108.54-64.97,183.45-3.79,15.91-8.97,32.96-18.74,38.81-2.41,1.45-4.98,2.16-7.85,2.16ZM804.28,725.31c-1.3.21-2.54.31-3.7.31-6.47,0-10.8-3.22-13.23-9.84-19.36-54.03-41.59-111.02-67.97-174.28-11.21-24.52-29.78-36.96-55.17-36.96-2.28,0-4.64.1-6.97.3-71.45,3.15-143.25,4.75-213.42,4.75-62.79,0-125.39-1.28-185.99-3.8-3.91-.42-7.72-.63-11.32-.63-26.2,0-44.22,10.9-53.58,32.37-18.31,41.24-39.73,95.76-67.43,171.64-3.62,11.38-8.49,16.23-16.28,16.23-.66,0-1.36-.03-2.07-.1l-34.11-10.63c.47-.24.93-.49,1.38-.76,11.51-6.9,17.19-25.2,21.22-42.14,31.82-109.48,78.28-245.56,155.72-326.77l.12-.14c10.32-12.6,15.94-21.99,18.94-31.77.01.02.02.03.03.05l.04-.29c.47-1.24.83-2.6,1.14-4.03,5.82,18.4,22.43,32.57,45.18,34.56l129.25.04,143.13-.03h.24c23.32-2.05,38.12-13.14,44.92-33.72.1.51.2,1.01.32,1.53,3.02,14.37,11.49,26.24,20.3,37l.17.19c81.44,78.96,128.1,212.33,162.99,332.38,5.91,20.1,10.54,31.1,19.1,35.05l-32.95,9.49ZM902.84,602.66c-4.81,57.88-14.43,96.11-47.36,107.83-4.19,1.09-7.37,1.59-9.99,1.59-9.87,0-14.41-6.75-22.08-32.85-22.39-77.03-43.38-136.08-66.05-185.82-29.41-64.53-61.55-113.22-98.27-148.86-16.5-20.18-23.88-35.21-18.4-61.3l20.03-98.96c4.49-15.34,12.4-22.67,27.28-25.27,35.69,4.91,74.62,11.29,119,19.5h.07c5.65,1.12,7.18,2.15,11.82,11.17,60.68,109.11,92.4,301.63,83.95,412.97Z\"/>\n      <g id=\"Speaker_grill\">\n        <circle cx=\"420.29\" cy=\"357.71\" r=\"4.82\"/>\n        <circle cx=\"437.84\" cy=\"357.71\" r=\"4.82\"/>\n        <circle cx=\"455.38\" cy=\"357.71\" r=\"4.82\"/>\n        <circle cx=\"472.93\" cy=\"357.71\" r=\"4.82\"/>\n        <circle cx=\"490.47\" cy=\"358.68\" r=\"4.82\"/>\n      </g>\n      <path id=\"L3_surround\" d=\"M340.92,373.72c-12.1-11.94-28.56-18.52-46.36-18.52-1.03,0-2.06.02-3.11.06-16.56.69-32.12,7.92-43.82,20.35-11.43,12.15-17.66,28.1-17.11,43.7-.63,16.4,5.79,32.86,17.63,45.16,12.39,12.87,29.14,19.96,47.17,19.96h.13c17.75-.03,34.16-6.86,46.21-19.24,12.14-12.46,18.58-29.31,18.14-47.45-.41-16.77-7.12-32.41-18.9-44.04ZM296.63,478.55c-.35,0-.7,0-1.06,0-16.24,0-31.34-6.14-42.53-17.29-11.18-11.15-17.33-26.19-17.32-42.36.02-27.96,22.56-58.15,58.94-58.15h.29c16.72.07,32,6.28,43.02,17.47,10.8,10.97,16.65,25.88,16.48,41.98-.4,36.53-29.71,58.36-57.82,58.36Z\"/>\n      <path id=\"R3_surround\" d=\"M617.17,355.14c-1.39,0-2.81.05-4.21.13-16.38,1.04-31.68,7.93-43.07,19.39-11.63,11.71-18.09,27.2-18.18,43.63-.1,18.38,6.27,34.57,18.42,46.8,12.21,12.3,29.46,19.38,47.3,19.41h.1c16.61,0,32.4-6.7,44.48-18.88,12.21-12.3,19.13-29.12,19-46.1.29-16.6-6.42-33.11-18.41-45.31-12.1-12.31-28.23-19.09-45.43-19.09ZM675.5,419.52c-.02,32.9-25.99,58.85-59.12,59.08h-.4c-15.55,0-30.85-6.54-41.96-17.95-11.2-11.5-17.15-26.51-16.74-42.27.84-32.25,26.93-57.61,59.4-57.74h.24c16.08,0,31.03,6.27,42.11,17.65,10.89,11.19,16.89,26.21,16.48,41.23Z\"/>\n    </g>\n    <g id=\"Button_outlines\">\n      <path id=\"L1\" d=\"M131.54,151.76c28.58-10.54,37.1-12.19,70.13-13.58.62-.03,1.21-.04,1.78-.04,1.7,0,3.23.11,4.69.35,8.92,1.44,14.64,6.2,17.45,14.54-.03,0-.06,0-.08.01,0,.03,0,.06.01.09,2.04.3,3.99.78,5.98.72.02-.03.03-.06.04-.09-3.07-11.83-10.65-18.79-22.53-20.72-1.76-.27-3.6-.41-5.61-.41-.63,0-1.28,0-1.95.04-5.25.22-9.69.44-13.55.68-23.59,1.48-33.63,4.15-58.32,13.26-1.9.75-3.55,1.43-5.01,2.05l-.16.07c-23.9,10.2-24.72,17.05-25.6,24.3-.02.13-.04.25-.05.38l5.76-1.61c.79-5.14,3.38-10.75,27.02-20.05Z\"/>\n      <path id=\"R1\" d=\"M804.81,159.88c-2.27-2.33-5.34-4.53-9.35-6.83-1.04-.6-2.15-1.17-3.28-1.69-27.77-12.77-52.08-18.98-74.31-18.98-5.21,0-10.43.34-15.56,1.02l-.23.04c-13.31,3.1-21.29,9.84-24.35,20.58-.02,0-.04,0-.07,0,.05.13.1.26.14.39.02.02.05.03.06.05.49-.18,1-.3,1.52-.33,1.52-.11,3.01-.3,4.48-.51.01-.04.03-.08.05-.12.05-.18.11-.36.18-.54-.06,0-.12-.02-.17-.02,2.98-7.21,9.14-11.7,19.28-14.1,4.8-.62,9.73-.94,14.65-.94,21.43,0,44.99,6.05,72.03,18.48.91.41,1.84.89,2.85,1.47,8.44,4.83,11.54,8.54,12.01,14.69-.05,0-.09-.02-.13-.02.06.13.12.25.16.39.02.06.05.12.07.18,1.01.07,1.98.26,2.89.58.87-.31,1.74-.34,2.57-.15-.14-5.55-1.73-9.75-5.49-13.61Z\"/>\n      <path id=\"L2_outline\" d=\"M115.16,122.1h.4l.52-.07.06-.02c24.15-6.19,52.33-10.12,83.69-11.68h.47c5.39,0,9.3-1.44,11.61-4.29,2.31-2.88,2.86-6.94,1.67-11.99l-9.91-67.79c-3.78-16.37-15.49-24.66-34.81-24.66-2.7,0-5.6.17-8.61.49-14.28,1.66-25.37,7.75-32.97,18.08-2.9,3.94-5.2,8.57-6.83,13.75-7.91,25.05-11.67,47.06-16.02,72.55l-.18,1.03c-.57,5.06.28,8.9,2.55,11.39,1.92,2.12,4.73,3.2,8.34,3.2ZM109.72,108.29l.15-.89c4.32-25.3,8.06-47.16,15.84-71.81,1.46-4.61,3.48-8.7,6.02-12.15,6.76-9.19,16.3-14.38,29.16-15.89,2.88-.31,5.61-.46,8.11-.46,16.53,0,26.12,6.66,29.29,20.26l9.88,67.62.04.18c.81,3.44.62,5.94-.57,7.43-1.21,1.5-3.65,2.25-7.25,2.25h-.69c-31.62,1.56-60.09,5.52-84.61,11.76-1.98-.02-3.35-.48-4.19-1.4-1.15-1.27-1.55-3.69-1.18-6.92Z\"/>\n      <path id=\"R2_outline\" d=\"M709.98,110.34h.41c31.43,1.56,59.6,5.48,83.74,11.68l.06.02.53.07h.4c3.61,0,6.42-1.08,8.34-3.2,2.27-2.5,3.13-6.33,2.54-11.45l-.17-.97c-4.35-25.49-8.11-47.5-16.02-72.55-1.63-5.18-3.93-9.81-6.83-13.75-7.61-10.33-18.71-16.42-32.99-18.08-3-.33-5.89-.49-8.6-.49-19.32,0-31.03,8.3-34.82,24.74l-9.87,67.63c-1.21,5.13-.66,9.2,1.66,12.08,2.31,2.85,6.22,4.29,11.61,4.29ZM702.09,95.12l.04-.2,9.85-67.49c3.18-13.69,12.77-20.35,29.31-20.35,2.49,0,5.22.16,8.1.46,12.87,1.51,22.41,6.7,29.17,15.89,2.53,3.43,4.55,7.52,6.01,12.15,7.79,24.65,11.52,46.51,15.85,71.82l.14.83c.37,3.3-.03,5.71-1.17,6.97-.85.93-2.22,1.39-4.19,1.4-24.52-6.25-52.99-10.21-84.66-11.77h-.64c-3.56,0-6.07-.77-7.26-2.25-1.2-1.49-1.4-3.99-.56-7.47Z\"/>\n      <path id=\"Create_outline\" class=\"gamepad-test-control\" d=\"M218.64,218.94c1.25,5.26,5.9,8.93,11.31,8.93.92,0,1.83-.11,2.69-.32,3.02-.72,5.57-2.57,7.2-5.22,1.63-2.65,2.13-5.76,1.41-8.77l-4.26-17.93c-1.25-5.26-5.9-8.93-11.31-8.93-.9,0-1.81.11-2.7.32-3.02.71-5.57,2.57-7.2,5.21-1.63,2.65-2.13,5.76-1.42,8.78l4.27,17.93ZM220.47,195.11c.86-1.4,2.21-2.37,3.79-2.75.46-.11.93-.16,1.42-.16,2.85,0,5.3,1.93,5.96,4.7l4.27,17.93c.38,1.59.11,3.23-.74,4.62-.86,1.4-2.21,2.38-3.8,2.75-.47.11-.94.17-1.42.17-2.85,0-5.3-1.94-5.96-4.71l-4.27-17.93c-.38-1.59-.11-3.23.75-4.62Z\"/>\n      <path id=\"Options_outline\" d=\"M677.7,226.85c.91.21,1.82.32,2.69.32,5.4,0,10.05-3.68,11.3-8.94l4.27-17.92c.72-3.02.22-6.15-1.41-8.79-1.63-2.64-4.18-4.5-7.2-5.22-.88-.21-1.79-.31-2.69-.31-5.41,0-10.06,3.67-11.32,8.93l-4.27,17.93c-1.49,6.23,2.38,12.51,8.62,14.01ZM674.43,214.12l4.26-17.92c.66-2.77,3.11-4.71,5.96-4.71.5,0,.96.06,1.42.17,1.59.38,2.94,1.35,3.8,2.74.85,1.38,1.12,3.03.74,4.63l-4.26,17.92c-.66,2.77-3.11,4.71-5.96,4.71-.47,0-.95-.06-1.42-.17-1.59-.38-2.94-1.35-3.8-2.75-.86-1.39-1.12-3.04-.74-4.63Z\"/>\n      <path id=\"Left_outline\" d=\"M99.81,321.31c1.27.35,2.6.53,3.93.53.42,0,.83-.02,1.25-.06l14.55-1.23c5.53-.47,10.68-2.71,14.76-6.39.68-.6,1.32-1.25,1.94-1.94l8.45-9.44c3.91-4.36,3.85-10.88-.13-15.18l-8.39-9.04c-4.29-4.63-10.11-7.47-16.4-8l-14.78-1.25c-4.13-.36-8.24,1.05-11.29,3.85s-4.8,6.79-4.8,10.93v22.91c0,4.14,1.75,8.12,4.8,10.93,1.75,1.61,3.85,2.76,6.11,3.38ZM93.9,284.09c0-2.79,1.13-5.36,3.18-7.24,1.84-1.69,4.17-2.6,6.63-2.6.28,0,.57.01.86.04l14.78,1.25c5.04.43,9.71,2.71,13.15,6.42l8.4,9.04c2.21,2.39,2.24,6.02.07,8.45l-8.46,9.44c-3.46,3.87-8.22,6.24-13.39,6.68l-14.55,1.23c-2.78.24-5.44-.67-7.49-2.56-2.05-1.88-3.18-4.45-3.18-7.24v-22.91Z\"/>\n      <path id=\"Right_outline\" d=\"M172.85,287.6c-3.98,4.3-4.04,10.82-.14,15.18l8.27,9.23.19.21c4.32,4.83,10.25,7.78,16.7,8.33l14.55,1.23c.42.04.83.06,1.25.06,1.4,0,2.79-.2,4.12-.58,2.18-.64,4.22-1.76,5.92-3.33,3.05-2.81,4.8-6.79,4.8-10.93v-22.91c0-4.14-1.75-8.13-4.8-10.93-3.05-2.8-7.16-4.2-11.29-3.85l-14.78,1.25c-.74.06-1.48.16-2.2.28-2.7.47-5.27,1.36-7.65,2.64-2.43,1.31-4.64,3.01-6.55,5.08l-8.39,9.04ZM198.06,275.54l14.78-1.25c2.78-.24,5.44.67,7.49,2.56,2.05,1.88,3.18,4.45,3.18,7.24v22.91c0,2.79-1.13,5.36-3.18,7.24-2.05,1.89-4.71,2.8-7.49,2.56l-14.55-1.23c-5.17-.44-9.93-2.81-13.39-6.68l-8.46-9.44c-2.17-2.43-2.14-6.06.07-8.45l8.4-9.04c3.44-3.71,8.11-5.99,13.15-6.42Z\"/>\n      <path id=\"Down_outline\" d=\"M183.71,334.71c-.13-1.61-.42-3.18-.84-4.71-.05-.16-.1-.32-.15-.47-.22-.68-.45-1.34-.69-2-1.43-3.61-3.69-6.87-6.65-9.52l-9.44-8.46c-4.36-3.9-10.88-3.85-15.18.14l-9.04,8.39c-1.05.97-2,2.01-2.85,3.12-2.94,3.82-4.74,8.41-5.15,13.28l-1.25,14.78c-.15,1.83.03,3.65.54,5.38.62,2.18,1.75,4.21,3.31,5.91,2.8,3.05,6.79,4.8,10.93,4.8h22.91c4.14,0,8.12-1.75,10.93-4.8,2.8-3.05,4.2-7.16,3.85-11.29l-1.23-14.55ZM177.4,357.17c-1.88,2.05-4.45,3.18-7.24,3.18h-22.91c-2.79,0-5.36-1.13-7.25-3.18-1.88-2.05-2.79-4.71-2.55-7.49l1.25-14.78c.43-5.04,2.71-9.71,6.42-13.16l9.04-8.39c1.21-1.12,2.74-1.68,4.27-1.68s2.98.54,4.18,1.61l9.44,8.45c3.87,3.47,6.24,8.23,6.68,13.4l1.23,14.55c.24,2.78-.67,5.44-2.56,7.49Z\"/>\n      <path id=\"Up_outline\" d=\"M133.72,256.61c.48,5.73,2.88,11.07,6.81,15.22.38.41.78.8,1.19,1.18l9.04,8.39c2.18,2.02,4.92,3.03,7.67,3.03s5.36-.97,7.51-2.9l9.44-8.45c1.35-1.2,2.55-2.53,3.58-3.96,2.51-3.43,4.1-7.44,4.64-11.72.05-.34.08-.68.11-1.02l1.23-14.55c.35-4.13-1.05-8.24-3.85-11.29-2.81-3.05-6.79-4.8-10.93-4.8h-22.91c-4.14,0-8.13,1.75-10.93,4.8-1.53,1.66-2.64,3.64-3.27,5.76-.54,1.77-.74,3.65-.58,5.53l1.25,14.78ZM140,233.92c1.89-2.05,4.46-3.18,7.25-3.18h22.91c2.79,0,5.36,1.13,7.24,3.18,1.89,2.05,2.8,4.71,2.56,7.49l-1.23,14.55c-.44,5.17-2.81,9.93-6.68,13.39l-9.44,8.46c-2.43,2.17-6.06,2.14-8.45-.07l-9.04-8.4c-3.71-3.44-5.99-8.11-6.42-13.15l-1.25-14.78c-.24-2.78.67-5.44,2.55-7.49Z\"/>\n      <path id=\"Cross_outline\" d=\"M751.82,321.39h-.11c-8.53,0-16.94,3.65-23.08,10.01-5.91,6.13-9.01,13.94-8.72,21.98.63,17.53,13.54,30.1,31.38,30.57h.03c17.47,0,31.35-13.6,31.6-30.96.12-8.05-3.19-16.1-9.08-22.09-5.9-6.01-13.93-9.48-22.02-9.51ZM770.09,370.25c-4.93,5-11.74,7.77-19.16,7.8h-.1c-13.76,0-24.99-11.14-25.03-24.82-.04-13.99,11.13-25.37,25.43-25.91.28-.01.56-.02.84-.02,13.25,0,24.99,11.83,25.12,25.32.06,6.67-2.46,12.93-7.09,17.63Z\"/>\n      <path id=\"Triangle_outline\" d=\"M751.06,266c.21,0,.41,0,.62,0,8.36,0,16.79-3.45,22.54-9.22,5.71-5.73,8.72-13.49,8.69-22.44-.05-17.11-14.19-31.03-31.52-31.03h-.19c-17.15.1-31.24,14.15-31.4,31.3-.08,8.08,3.16,15.85,9.1,21.87,5.94,6.02,14.02,9.48,22.16,9.51ZM751.32,209.08h.12c13.93.07,25.71,11.83,25.73,25.69.01,6.89-2.62,13.27-7.4,17.98-4.79,4.71-11.3,7.31-18.35,7.32-6.99,0-13.47-2.6-18.25-7.33-4.77-4.72-7.4-11.13-7.39-18.03.01-14.13,11.47-25.63,25.53-25.63Z\"/>\n      <path id=\"Circle_outline\" d=\"M791.23,272.06c-5.72,5.82-8.79,13.5-8.65,21.62.31,17.85,13.17,30.72,31.27,31.3.3,0,.6.01.9.01,16.35,0,30.24-14.13,30.33-30.86.05-8.44-3.12-16.31-8.92-22.14-5.91-5.94-13.96-9.21-22.68-9.21-8.47,0-16.37,3.3-22.25,9.28ZM839.39,293.77c.02,6.64-2.62,12.96-7.44,17.78-4.93,4.95-11.46,7.67-18.37,7.67,0,0-.14,0-.14,0-13.66-.07-25.18-11.87-25.15-25.75.03-13.65,11.4-25.19,24.83-25.19h.23c14.33.14,26.01,11.57,26.05,25.49Z\"/>\n      <path id=\"Square_outline\" d=\"M691.99,262.62c-.79-.06-1.6-.09-2.38-.09-8.46,0-16.39,3.35-22.34,9.45-5.74,5.88-8.93,13.76-8.74,21.58-.29,17.51,12.78,31.02,30.42,31.42.26,0,.52,0,.78,0,17.09,0,30.37-12.98,30.9-30.18.51-16.54-12.34-30.97-28.64-32.18ZM707.82,311.38c-4.97,4.99-11.72,7.85-18.53,7.85,0,0-.18,0-.18,0-6.58-.05-12.82-2.74-17.59-7.59-4.87-4.95-7.51-11.43-7.45-18.24.13-13.89,11.46-25.19,25.26-25.19h.38c13.56.21,25.5,12.2,25.56,25.67.03,6.44-2.62,12.65-7.44,17.5Z\"/>\n      <path id=\"PS_outline\" d=\"M455.4,442.49h.21c14.28-.12,25.41-11.31,25.35-25.47-.06-14.05-11.44-25.51-25.42-25.54-13.74,0-25.39,11.7-25.44,25.55-.03,6.72,2.63,13.09,7.46,17.95,4.82,4.84,11.16,7.51,17.84,7.51ZM441.75,403.34c3.78-3.75,8.85-5.9,13.92-5.9h.13c5.08.04,10.12,2.23,13.84,6.02,3.73,3.8,5.84,8.91,5.78,14.02-.13,10.54-9.08,19.11-20,19.11h0c-10.81-.02-19.6-8.74-19.6-19.43,0-5.03,2.17-10.07,5.94-13.82Z\"/>\n      <path id=\"Mute_outline\" d=\"M474.24,464.3c-6.6-.06-13.03-.1-19.11-.1-6.51,0-12.67.04-18.82.11-2.55.03-4.67.99-6.15,2.77-1.4,1.7-2.12,4.04-2.07,6.78.07,3.52,1.54,7.73,8.15,7.76,2.64.01,5.27.02,7.91.02h11.06s1.74-.03,1.74-.03c0,0,7.44-.02,9.31-.02,2.62,0,5.25,0,7.86.04h.17c7.21,0,8.38-5.01,8.43-8,.05-2.57-.65-4.8-2.03-6.45-1.54-1.85-3.77-2.85-6.45-2.88ZM473.79,476.4h-2.19c-2.66-.05-2.76-.04-5.42-.04-1.84,0-10.97.03-10.97.03l-5.52.04h-5.9c-2.5,0-5,0-7.5-.02-.93,0-2.31-.66-2.33-2.29-.02-1.53-.18-2.63.18-3.31.57-1.06,1.65-1.24,2.25-1.25,6.08-.11,12.21-.17,18.74-.17,6.06,0,12.48.05,19.09.15,1.14.02,2.07.53,2.55,1.42.21.4.5,1.12.47,2.82-.02,1.47-.69,2.61-3.43,2.61Z\"/>\n    </g>\n  </g>\n  <g transform=\"translate(0,0.65) scale(0.70)\">\n    <g id=\"Trackpad_infill\" >\n      <path d=\"M452.27,328.53v-.02c40.22,0,80.43.07,120.65-.07,6.47-.02,13.17.01,19.36-1.58,19.32-4.99,29.59-18.18,33.51-36.6,7.44-34.93,15.37-69.99,21.95-105.09,1.8-9.6-.91-20.7-9.35-26.91-6.53-4.8-15.07-5.38-22.94-6-15.84-1.24-31.65-1.69-47.52-2.33-25.29-1.01-52.32-3.71-77.62-4-59.86-.67-117.65,1.12-177.41,5.09-10.18.68-20.91.48-30.97,2.12-12.6,2.05-25.72,12.82-22.5,31.32,2.97,17.08,7.65,34.26,11,51.28,3.72,18.85,7.61,37.68,11.08,56.58,2.33,12.67,8.64,23.23,19.04,30.56,9.97,7.03,21.64,5.61,33.14,5.62,39.53.06,79.06.02,118.6.02Z\"/>\n    </g>\n    <g id=\"Trackpad_outline\" >\n      <path d=\"M272.25,153.56c-4.52,2.07-9.76,5.6-12.42,9.85-4.66,6.89-3.71,15.95-1.11,26.9l19.74,98.37c4.52,27.51,18.61,41.63,45.84,43.95h.12l235.94.06c-4.66-.08,4.33,0,9.56,0,35.3,0,49.5-11.1,56.07-37.73l20.44-101.35c4.26-16.93,3.93-29.59-6.87-37.71-6.24-4.92-13.49-6.41-21.4-7.26-52.97-4-107.12-6.03-161.4-6.03-.3,0-.6,0-.9,0-2.3-.01-4.58-.02-6.81-.02-.36,0-.72,0-1.08,0-.33,0-.66,0-1,0-3.06.02-6.18.05-9.34.09-48.92.43-98.66,2.47-148.15,6.11-5.85.15-12,2.31-17.24,4.76ZM641.07,192.4l-20.45,101.35c-6.01,24.35-18.98,33.44-50.41,33.44-3.02,0-6.24.2-9.64,0l-235.88-.06c-24.7-2.11-36.7-14.33-40.82-39.44l-19.79-98.56c-2.23-9.46-3.46-17.08.31-22.64,4.07-6.04,11.93-10.09,23.26-12.03,13.9-1.04,27.83-1.95,41.74-2.73,35.06-1.79,70.63-3.02,101.96-3.47.19,0,.38,0,.58,0,1.55-.02,3.08-.04,4.6-.06,6.53-.06,13.04-.09,19.54-.09,46.61.2,104.83,2.34,158.55,5.8,3.45.26,7.4.89,10.36,1.77,18.01,5.87,21.08,16.85,16.09,36.73Z\"/>\n    </g>\n  </g>\n  <g id=\"gamepadTestLeftStick\" class=\"gamepad-test-control\" transform=\"translate(0,0.65) scale(0.70)\">\n    <g id=\"gamepadTestL3\" class=\"gamepad-test-control\">\n      <path d=\"M295.63,461.03c23.36,0,41.53-17.87,41.57-40.86.03-23.53-18.65-42.27-42.16-42.27-23.09,0-41.82,18.55-41.83,41.45-.01,23.9,18.09,41.69,42.42,41.69Z\"/>\n    </g>\n    <g id=\"L3_outline\">\n      <path d=\"M295.14,466.67c-26.36-.18-47.62-21.47-47.16-47.19.51-28.21,21.76-46.51,47.28-47.04,25.52-.53,47.65,22.07,47.37,47.25-.29,26.05-21.63,47.15-47.5,46.98ZM295.63,461.03c23.36,0,41.53-17.87,41.57-40.86.03-23.53-18.65-42.27-42.16-42.27-23.09,0-41.82,18.55-41.83,41.45-.01,23.9,18.09,41.69,42.42,41.69Z\"/>\n    </g>\n    <path id=\"gamepadTestLeftStickArrow\" class=\"gamepad-test-stick-arrow\" opacity=\"0\" d=\"\"/>\n  </g>\n  <g id=\"gamepadTestRightStick\" class=\"gamepad-test-control\" transform=\"translate(0,0.65) scale(0.70)\">\n    <g id=\"gamepadTestR3\" class=\"gamepad-test-control\">\n      <path d=\"M658.23,419.7c.55-22.76-17.76-41.19-40.35-41.72-23.43-.55-42.68,18.19-43.29,40.74-.65,23.92,18.7,41.15,39.11,42.46,25.96,1.66,44.96-18.72,44.52-41.48Z\"/>\n    </g>\n    <g id=\"R3_outline\">\n      <path d=\"M664.07,419.78c-.01,26.37-21.16,47.39-47.6,47.32-26.19-.06-48.19-21.58-47.62-47.5.59-26.82,21.12-47.52,48.44-47.45,26.83.08,46.79,21.47,46.78,47.62ZM658.23,419.7c.55-22.76-17.76-41.19-40.35-41.72-23.43-.55-42.68,18.19-43.29,40.74-.65,23.92,18.7,41.15,39.11,42.46,25.96,1.66,44.96-18.72,44.52-41.48Z\"/>\n    </g>\n    <path id=\"gamepadTestRightStickArrow\" class=\"gamepad-test-stick-arrow\" opacity=\"0\" d=\"\"/>\n  </g>\n  <g id=\"TriggerPercentages\" transform=\"translate(0,0.65) scale(0.70)\">\n    <text id=\"L2_percentage\" x=\"160\" y=\"80\" font-family=\"Arial, sans-serif\" font-size=\"24\" font-weight=\"bold\" fill=\"#1a237e\" text-anchor=\"middle\" opacity=\"0\">0 %</text>\n    <text id=\"R2_percentage\" x=\"750\" y=\"80\" font-family=\"Arial, sans-serif\" font-size=\"24\" font-weight=\"bold\" fill=\"#1a237e\" text-anchor=\"middle\" opacity=\"0\">0 %</text>\n  </g>\n</svg>";

function gamepadTestDialog() {
  if (isGamepadTestDialogOpen) return;
  var selectedGamepad = getConnectedGamepadForTest();
  if (!selectedGamepad) {
    updateGamepadTestButtonVisibility();
    return;
  }
  var gamepadIndex = selectedGamepad.index;
  var controllerType = isNintendoSwitchProGamepadId(selectedGamepad.id) ? 'switch' :
    (isPlayStationGamepadId(selectedGamepad.id) ? 'ps' : 'xbox');

  var overlay = $('<div>', { id: 'gamepadTestOverlay', class: 'dialog-overlay gamepad-test-overlay' }).appendTo('#popup-layer');
  var dialog = $('<dialog>', { id: 'gamepadTestDialog', class: 'mdl-dialog gamepad-test-dialog' }).appendTo(overlay);
  $('<h3>', {
    class: 'mdl-dialog__title gamepad-test-title',
    text: t('Game Controller Test')
  }).appendTo(dialog);
  var content = $('<div>', { class: 'mdl-dialog__content gamepad-test-content' }).appendTo(dialog);
  var svg = controllerType === 'switch' ? NINTENDO_SWITCH_PRO_GAMEPAD_TEST_SVG :
    (controllerType === 'ps' ? PLAYSTATION_GAMEPAD_TEST_SVG : `
    <svg xmlns="http://www.w3.org/2000/svg" id="gamepadTestSvg" class="gamepad-test-svg" viewBox="0 0 441 383" role="img" aria-label="Game controller diagram">
      <g id="gamepadTestController">
        <path d="M220.5 294.5C220.5 294.5 195 294.5 150 294.5C105 294.5 81.5 378.5 49.5 378.5C17.5 378.5 4 363.9 4 317.5C4 271.1 43.5 165.5 55 137.5C66.5 109.5 95.5 92.0001 128 92.0001C154 92.0001 200.5 92.0001 220.5 92.0001" class="gamepad-test-shell"/>
        <path d="M220 294.5C220 294.5 245.5 294.5 290.5 294.5C335.5 294.5 359 378.5 391 378.5C423 378.5 436.5 363.9 436.5 317.5C436.5 271.1 397 165.5 385.5 137.5C374 109.5 345 92.0001 312.5 92.0001C286.5 92.0001 240 92.0001 220 92.0001" class="gamepad-test-shell"/>
        <g id="gamepadTestLT" class="gamepad-test-control"><path d="m152.5,52.9702c0,4.61877 -3.358,8.36308 -7.5,8.36308l-13,0c-4.142,0 -7.5,-3.74432 -7.5,-8.36308l0,-22.8591c0,-8.62177 6.268,-15.6111 14,-15.6111c7.732,0 14,6.98932 14,15.6111l0,22.8591z" class="gamepad-test-trigger"/></g>
        <g id="gamepadTestRT" class="gamepad-test-control"><path d="m316.83334,53.44044c0,4.6352 -3.43795,8.39285 -7.67857,8.39285l-13.30953,0c-4.24062,0 -7.67857,-3.75765 -7.67857,-8.39285l0,-22.94046c0,-8.65246 6.41724,-15.66665 14.33334,-15.66665c7.9161,0 14.33334,7.0142 14.33334,15.66665l0,22.94046l-0.00001,0z" class="gamepad-test-trigger"/></g>
        <g id="gamepadTestLB" class="gamepad-test-control"><rect x="116.83332" y="66.83335" width="43.33334" height="17.00004" rx="6.5"/><text x="138.5" y="79">LB</text></g>
        <g id="gamepadTestRB" class="gamepad-test-control"><rect x="281.33334" y="67" width="42.66666" height="17.00003" rx="6.5"/><text x="302.5" y="79">RB</text></g>
        <line y2="302.5" x2="126.00001" y1="214.49998" x1="27.50001" class="gamepad-test-detail-line"/>
        <line y2="295.73418" x2="410.73581" y1="200.43247" x1="306.59558" class="gamepad-test-detail-line" transform="rotate(89 358.666 248.083)"/>
        <circle cx="113" cy="160" r="37.5" class="gamepad-test-stick-base"/>
        <circle cx="278" cy="238" r="37.5" class="gamepad-test-stick-base"/>
        <g id="gamepadTestLeftStick" class="gamepad-test-control">
          <circle cx="113" cy="160" r="28" class="gamepad-test-stick-cap"/>
          <circle cx="113" cy="160" r="22" class="gamepad-test-stick-inner"/>
          <path id="gamepadTestLeftStickArrow" class="gamepad-test-stick-arrow" opacity="0" d=""/>
        </g>
        <g id="gamepadTestRightStick" class="gamepad-test-control">
          <circle cx="278" cy="238" r="28" class="gamepad-test-stick-cap"/>
          <circle cx="278" cy="238" r="22" class="gamepad-test-stick-inner"/>
          <path id="gamepadTestRightStickArrow" class="gamepad-test-stick-arrow" opacity="0" d=""/>
        </g>
        <circle cx="166" cy="238" r="37.5" class="gamepad-test-dpad-base"/>
        <g id="gamepadTestDpad">
          <rect id="gamepadTestDpadUp" class="gamepad-test-control gamepad-test-dpad-control" x="159" y="211" width="14" height="20"/>
          <rect id="gamepadTestDpadDown" class="gamepad-test-control gamepad-test-dpad-control" x="159" y="244" width="14" height="20"/>
          <rect id="gamepadTestDpadLeft" class="gamepad-test-control gamepad-test-dpad-control" x="142" y="231" width="20" height="14"/>
          <rect id="gamepadTestDpadRight" class="gamepad-test-control gamepad-test-dpad-control" x="170" y="231" width="20" height="14"/>
          <rect x="159" y="228" width="14" height="19" class="gamepad-test-dpad-center"/>
        </g>
        <circle cx="329" cy="160" r="37.5" class="gamepad-test-face-base"/>
        <g id="gamepadTestY" class="gamepad-test-control"><circle cx="329" cy="140" r="13"/><text x="329" y="144">Y</text></g>
        <g id="gamepadTestX" class="gamepad-test-control"><circle cx="310" cy="162" r="13"/><text x="310" y="166">X</text></g>
        <g id="gamepadTestB" class="gamepad-test-control"><circle cx="348" cy="161" r="13"/><text x="348" y="165">B</text></g>
        <g id="gamepadTestA" class="gamepad-test-control"><circle cx="330" cy="181" r="13"/><text x="330" y="185">A</text></g>
        <g id="gamepadTestSelect" class="gamepad-test-control"><circle cx="188" cy="162" r="10"/><rect x="184" y="159" width="8" height="6" class="gamepad-test-small-detail"/><text x="188" y="166">−</text></g>
        <g id="gamepadTestStart" class="gamepad-test-control"><circle cx="253" cy="162" r="10"/><path d="M248 158h10 M248 162h10 M248 166h10" class="gamepad-test-small-detail"/></g>
        <g id="gamepadTestHome" class="gamepad-test-control"><rect x="211.5" y="153" width="18" height="18" rx="9"/><path d="M220.5 158 V164 M218 160.5 L220.5 158 L223 160.5 M218 166 H223" class="gamepad-test-small-detail"/></g>
        <circle cx="220.5" cy="125" r="14" class="gamepad-test-home-base"/>
        <path d="M215.5 125 L220.5 120 L225.5 125 V130 H215.5 Z" class="gamepad-test-home-icon"/>
        <g id="gamepadTestL3" class="gamepad-test-control"><circle cx="113" cy="160" r="10" class="gamepad-test-stick-click"/></g>
        <g id="gamepadTestR3" class="gamepad-test-control"><circle cx="278" cy="238" r="10" class="gamepad-test-stick-click"/></g>
      </g>
    </svg>`);
  // Parse the controller graphic as SVG XML so older Tizen WebKit builds
  // preserve the SVG namespace instead of treating the markup as HTML.
  var svgDocument = new DOMParser().parseFromString(svg, 'image/svg+xml');
  var svgElement = svgDocument.documentElement;
  if (svgElement && svgElement.localName === 'svg') {
    var layout = $('<div>', { class: 'gamepad-test-layout' }).appendTo(content);
    $('<div>', { class: 'gamepad-test-side-margin' }).appendTo(layout);
    var center = $('<div>', { class: 'gamepad-test-center' }).appendTo(layout);
    if (controllerType === 'switch') svgElement.style.transform = 'translateY(40px)';
    center[0].appendChild(document.importNode(svgElement, true));
    $('<div>', { class: 'gamepad-test-side-margin' }).appendTo(layout);
  }
  $('<p>', {
    class: 'gamepad-test-instructions',
    text: t('Press the buttons and move the sticks on your controller to test that all buttons work. The corresponding controls should light up on the screen. To close this dialog, press the Back button on your TV remote or hold the B button on your controller for more than 1 second.')
  }).appendTo(content);
  if (!dialog[0].showModal) dialogPolyfill.registerDialog(dialog[0]);
  isGamepadTestDialogOpen = true;
  isDialogOpen = true;
  gamepadTestDialogState = {
    overlay: overlay[0],
    dialog: dialog[0],
    returnFocusId: 'gamepadTestBtn',
    gamepadIndex: gamepadIndex,
    controllerType: controllerType,
    axes: selectedGamepad ? selectedGamepad.axes.slice(0, 4) : [0, 0, 0, 0],
    buttonStates: selectedGamepad ? selectedGamepad.buttons.map(function(button) { return !!button.pressed; }) : [],
    buttonIds: controllerType === 'switch' ? {
      0: ['gamepadTestSwitchPath21', 'gamepadTestSwitchPath22'],
      1: ['gamepadTestSwitchPath14', 'gamepadTestSwitchPath17'],
      2: ['gamepadTestSwitchPath13', 'gamepadTestSwitchPath18'],
      3: ['gamepadTestSwitchPath6', 'gamepadTestSwitchPath9'],
      4: ['gamepadTestSwitchPath2'], 5: ['gamepadTestSwitchPath3'],
      6: ['gamepadTestSwitchZL'], 7: ['gamepadTestSwitchZR'],
      8: ['gamepadTestSwitchPath5'], 9: ['gamepadTestSwitchPath10'],
      10: ['gamepadTestSwitchPath8', 'gamepadTestSwitchPath11', 'gamepadTestSwitchPath12'],
      11: ['gamepadTestSwitchPath24', 'gamepadTestSwitchPath26', 'gamepadTestSwitchPath27'],
      12: ['gamepadTestSwitchPath25'], 13: ['gamepadTestSwitchPath30'],
      14: ['gamepadTestSwitchPath28'], 15: ['gamepadTestSwitchPath29'],
      16: ['gamepadTestSwitchPath19', 'gamepadTestSwitchPath20']
    } : {
      0: 'gamepadTestA', 1: 'gamepadTestB', 2: 'gamepadTestX', 3: 'gamepadTestY',
      4: 'gamepadTestLB', 5: 'gamepadTestRB', 6: 'gamepadTestLT', 7: 'gamepadTestRT',
      8: 'gamepadTestSelect', 9: 'gamepadTestStart', 10: 'gamepadTestL3', 11: 'gamepadTestR3',
      12: 'gamepadTestDpadUp', 13: 'gamepadTestDpadDown', 14: 'gamepadTestDpadLeft', 15: 'gamepadTestDpadRight',
      17: controllerType === 'xbox' ? 'gamepadTestHome' : null
    }
  };
  // The TV remote's Back/Return key is the only way to dismiss this dialog.
  gamepadTestDialogState.blockKeyboard = function(event) {
    var keyName = String(event.key || event.code || '').toLowerCase();
    var keyCode = event.keyCode || event.which;
    var isBackKey = keyName === 'xf86back' || keyName === 'browserback' ||
      (typeof tvKey !== 'undefined' &&
        (keyCode === tvKey.KEY_RETURN || keyCode === tvKey.KEY_BACK));
    if (isBackKey) {
      event.preventDefault();
      event.stopImmediatePropagation();
      if (event.type === 'keydown' && !event.repeat) closeGamepadTestDialog();
      return;
    }
    event.preventDefault();
    event.stopImmediatePropagation();
  };
  document.addEventListener('keydown', gamepadTestDialogState.blockKeyboard, true);
  document.addEventListener('keyup', gamepadTestDialogState.blockKeyboard, true);

  if (selectedGamepad) {
    selectedGamepad.buttons.forEach(function(button, index) {
      var buttonIds = gamepadTestDialogState.buttonIds[index];
      if (!buttonIds) return;
      if (!Array.isArray(buttonIds)) buttonIds = [buttonIds];
      buttonIds.forEach(function(buttonId) {
        var element = document.getElementById(buttonId);
        if (element && button.pressed) element.classList.add('gamepad-test-active');
      });
    });
  }
  updateGamepadTestStick(0, gamepadTestDialogState.axes[0], gamepadTestDialogState.axes[1]);
  updateGamepadTestStick(1, gamepadTestDialogState.axes[2], gamepadTestDialogState.axes[3]);
  fadeInUiElement(overlay, 'flex');
  showUiDialog(dialog[0]);
}

function closeGamepadTestDialog() {
  if (!gamepadTestDialogState) return;
  var state = gamepadTestDialogState;
  if (state.bHoldTimeout) {
    window.clearTimeout(state.bHoldTimeout);
    state.bHoldTimeout = null;
  }
  document.removeEventListener('keydown', state.blockKeyboard, true);
  document.removeEventListener('keyup', state.blockKeyboard, true);
  closeUiDialog(state.dialog);
  fadeOutUiElement($(state.overlay), function() {
    $(state.overlay).remove();
  });
  gamepadTestDialogState = null;
  isGamepadTestDialogOpen = false;
  isDialogOpen = false;
  updateGamepadTestButtonVisibility();

  // Restore the navigation selection and focus to the button that opened the test.
  var returnFocusElement = state.returnFocusId && document.getElementById(state.returnFocusId);
  if (returnFocusElement && !returnFocusElement.hidden) {
    mark(returnFocusElement);
    focusElement(returnFocusElement);
  }
}

// Show a lightweight host-to-TV network test and its final report.
function hostNetworkTestDialog(host) {
  var overlay = $('<div>', {
    id: 'hostNetworkTestOverlay-' + host.serverUid,
    class: 'dialog-overlay'
  }).appendTo('#popup-layer');
  var dialog = $('<dialog>', {
    id: 'hostNetworkTestDialog-' + host.serverUid,
    class: 'mdl-dialog'
  }).appendTo(overlay);

  var title = $('<h3>', {
    class: 'mdl-dialog__title network-test-title'
  }).appendTo(dialog);
  $('<i>', {
    class: 'material-icons network-test-title-icon',
    text: 'schedule',
    'aria-hidden': 'true'
  }).appendTo(title);
  $('<span>', { text: t('Network Test') }).appendTo(title);

  var content = $('<div>', { class: 'mdl-dialog__content' }).appendTo(dialog);
  var status = $('<p>', {
    id: 'hostNetworkTestStatus-' + host.serverUid,
    class: 'network-test-status',
    text: t('Obtaining preliminary data...')
  }).appendTo(content);
  var progress = $('<div>', {
    id: 'hostNetworkTestProgress-' + host.serverUid,
    class: 'mdl-progress mdl-js-progress network-test-progress'
  }).appendTo(content);
  componentHandler.upgradeElement(progress[0]);

  var setProgress = function(elapsedMs) {
    var progressComponent = progress[0].MaterialProgress;
    if (progressComponent && typeof progressComponent.setProgress === 'function') {
      progressComponent.setProgress(Math.max(0, Math.min(100, elapsedMs / 400)));
    }
  };
  var result = $('<div>', {
    id: 'hostNetworkTestResult-' + host.serverUid,
    class: 'network-test-result'
  }).css({ 'white-space': 'pre-line' }).appendTo(content);
  var verdict = $('<div>', {
    id: 'hostNetworkTestVerdict-' + host.serverUid,
    class: 'network-test-verdict',
    'aria-live': 'polite'
  }).appendTo(content);

  var actions = $('<div>', { class: 'mdl-dialog__actions' }).appendTo(dialog);
  var actionButton = $('<button>', {
    type: 'button',
    id: 'closeHostNetworkTest',
    class: 'mdl-button mdl-js-button mdl-button--raised mdl-button--colored mdl-js-ripple-effect',
    text: t('Stop')
  }).appendTo(actions);

  var finished = false;
  var cancelled = false;
  var dialogClosed = false;
  var testStartedAt = null;
  var progressTimer = null;

  var closeDialog = function() {
    if (dialogClosed) return;
    dialogClosed = true;
    finished = true;
    if (progressTimer !== null) window.clearInterval(progressTimer);
    // Pop navigation while the dialog button still exists so leave() can blur it.
    Navigation.pop();
    fadeOutUiElement(overlay);
    closeUiDialog(dialog[0]);
    overlay.remove();
    isDialogOpen = false;
  };

  actionButton.on('click', function() {
    if (finished) {
      closeDialog();
      return;
    }
    cancelled = true;
    closeDialog();
  });

  if (!dialog[0].showModal) dialogPolyfill.registerDialog(dialog[0]);
  fadeInUiElement(overlay, 'flex');
  showUiDialog(dialog[0]);
  isDialogOpen = true;
  Navigation.push(Views.NetworkTestDialog);
  setTimeout(function() { Navigation.switch(); }, 5);

  var pollingPauseAcquired = false;
  var networkTestOperation = pauseBackgroundHostPollingForNetworkTest().then(function() {
    pollingPauseAcquired = true;
    if (cancelled) {
      return {
        completed: true,
        cancelled: true,
        measurementStarted: false,
        bytes: 0,
        elapsedMs: 0,
        averageMbps: 0,
        minPassMbps: 0,
        maxPassMbps: 0,
        passCount: 0,
        successfulRequests: 0,
        failedRequests: 0,
        baselineBytes: 0,
        baselineAssetCount: 0,
        baselineErrors: 0
      };
    }

    return host.runNetworkTest(40000, function(stats) {
      if (cancelled || finished) return;
      if (stats.started && testStartedAt === null) {
        testStartedAt = Date.now();
        progressTimer = window.setInterval(function() {
          if (finished) return;
          setProgress(Date.now() - testStartedAt);
        }, 150);
        status.text(t('Performing measurement. Please wait...'));
        return;
      }

      if (stats.measurementStarted) {
        setProgress(stats.elapsedMs);
      }
    }, function() { return cancelled; });
  });

  networkTestOperation = networkTestOperation.then(function(stats) {
    if (pollingPauseAcquired) {
      resumeBackgroundHostPollingAfterNetworkTest();
      pollingPauseAcquired = false;
    }
    return stats;
  }, function(error) {
    if (pollingPauseAcquired) {
      resumeBackgroundHostPollingAfterNetworkTest();
      pollingPauseAcquired = false;
    }
    throw error;
  });

  networkTestOperation.then(function(stats) {
    if (dialogClosed) return;
    if (cancelled && !stats.cancelled) stats.cancelled = true;
    finished = true;
    if (progressTimer !== null) window.clearInterval(progressTimer);

    if (!stats.measurementStarted) {
      setProgress(0);
      status.text(t('Test stopped before measurement could begin.'));
      result.text('');
    } else {
      setProgress(stats.elapsedMs);
      status.text(stats.cancelled ? t('Test stopped.') : t('Test completed.'));
      var variationPercent = stats.passCount >= 2
        ? Math.round(((stats.maxPassMbps - stats.minPassMbps) / ((stats.maxPassMbps + stats.minPassMbps) / 2)) * 100)
        : null;
      var lines = [
        t('Approximate average download speed: %1$s Mbps', stats.averageMbps.toFixed(2))
      ];
      if (Number.isFinite(stats.averageLatencyMs)) {
        lines.push(t('Average network latency:') + ' ' + Math.round(stats.averageLatencyMs) + ' ms');
      }
      if (variationPercent !== null) {
        lines.push(t('Speed variation across complete image-set passes: %1$s–%2$s Mbps', variationPercent + '%'));
      }
      if (stats.failedRequests > 0) {
        lines.push(t('Download errors: %1$s', stats.failedRequests));
      }
      result.text(lines.join('\n'));

      var verdictSeverity = 0;
      var verdictType = null;
      var verdictIcon = '';
      var verdictMessage = '';

      // Severity: 0 = green, 1 = amber, 2 = red. The worst indicator wins.
      if (stats.averageMbps < 0.5) {
        verdictSeverity = 2;
      } else if (stats.averageMbps < 1) {
        verdictSeverity = Math.max(verdictSeverity, 1);
      }
      if (variationPercent !== null) {
        if (variationPercent > 30) {
          verdictSeverity = 2;
        } else if (variationPercent >= 23) {
          verdictSeverity = Math.max(verdictSeverity, 1);
        }
      }
      if (Number.isFinite(stats.averageLatencyMs)) {
        if (stats.averageLatencyMs > 1300) {
          verdictSeverity = 2;
        } else if (stats.averageLatencyMs > 1000) {
          verdictSeverity = Math.max(verdictSeverity, 1);
        }
      }
      // Keep download failures as an independent warning signal.
      if (stats.failedRequests > 5) {
        verdictSeverity = 2;
      } else if (stats.failedRequests > 1) {
        verdictSeverity = Math.max(verdictSeverity, 1);
      }

      if (verdictSeverity === 2) {
        verdictType = 'error';
        verdictIcon = '✕';
        verdictMessage = t('The connection to the host is too slow or unstable.');
      } else if (verdictSeverity === 1) {
        verdictType = 'warning';
        verdictIcon = '⚠';
        verdictMessage = t('The connection to the host may be limited or unstable.');
      } else {
        verdictType = 'stable';
        verdictIcon = '✓';
        verdictMessage = t('The connection to the host seems stable.');
      }
      if (verdictType) {
        verdict.addClass('network-test-verdict--' + verdictType);
        $('<span>', { class: 'network-test-verdict-icon', text: verdictIcon }).appendTo(verdict);
        $('<span>', { class: 'network-test-verdict-text', text: verdictMessage }).appendTo(verdict);
      }
    }

    actionButton.text(t('Close'));
    actionButton.prop('disabled', false);
    Navigation.switch();
  }).catch(function(error) {
    if (dialogClosed) return;
    finished = true;
    if (progressTimer !== null) window.clearInterval(progressTimer);
    status.text(t('Network test could not be completed.'));
    result.text(t(error && error.message ? error.message : String(error)));
    actionButton.text(t('Close'));
    actionButton.prop('disabled', false);
    Navigation.switch();
  });
}

// Show a confirmation with the Delete Host dialog before removing the host object
function deleteHostDialog(host) {
  // Find the existing overlay and dialog elements
  var deleteHostOverlay = document.querySelector('#deleteHostDialogOverlay');
  var deleteHostDialog = document.querySelector('#deleteHostDialog');

  // Change the dialog title and text elements to include the hostname
  document.getElementById('deleteHostDialogTitle').innerHTML = t('Delete Host');
  document.getElementById('deleteHostDialogText').innerHTML = t('Are you sure you want to delete %1$s?', escapeHTML(host.hostname));

  // Show the dialog and push the view
  fadeInUiElement(deleteHostOverlay, 'flex');
  showUiDialog(deleteHostDialog);
  isDialogOpen = true;
  Navigation.push(Views.DeleteHostDialog);

  // Cancel the operation if the Cancel button is pressed
  $('#cancelDeleteHost').off('click');
  $('#cancelDeleteHost').on('click', function() {
    console.log('%c[index.js, deleteHostDialog]', 'color: green;', 'Closing app dialog and returning.');
    fadeOutUiElement(deleteHostOverlay);
    closeUiDialog(deleteHostDialog);
    isDialogOpen = false;
    Navigation.pop();
  });

  // Remove the host object if the Continue button is pressed
  // locally remove the hostname/ip from the saved `hosts` array
  // NOTE: this does not make the host forget the pairing to us
  // This means we can re-add the host, and will still be paired
  $('#continueDeleteHost').off('click');
  $('#continueDeleteHost').on('click', function() {
    console.log('%c[index.js, deleteHostDialog]', 'color: green;', 'Removing host, closing app dialog, and returning.');
    // Remove the host container from the grid
    $('#host-container-' + host.serverUid).remove();
    // Stop background polling for removed host
    endBackgroundPollingOfHost(host);
    // Remove the host from the hosts object
    delete hosts[host.serverUid];
    // Save the updated hosts
    saveHosts();
    // Remove the host from the preview app cache and update Smart Hub Preview
    delete _previewApps[host.serverUid];
    savePreviewApps();
    updatePreviewData();
    // If host removed, show snackbar message
    snackbarLog('%1$s has been deleted successfully.', host.hostname);
    fadeOutUiElement(deleteHostOverlay);
    closeUiDialog(deleteHostDialog);
    isDialogOpen = false;
    Navigation.pop();
    // Reset the Hosts view navigation index to prevent possible out-of-bounds errors
    Views.Hosts.view.reset();
    Navigation.switch();
  });
}

// Show a confirmation with the Delete Host dialog before removing all hosts objects
function deleteAllHostsDialog() {
  if (Object.keys(hosts).length === 0) {
    // If there are no hosts, show snackbar message
    snackbarLog('No host exists.');
    return;
  } else {
    // Find the existing overlay and dialog elements
    var deleteHostOverlay = document.querySelector('#deleteHostDialogOverlay');
    var deleteHostDialog = document.querySelector('#deleteHostDialog');

    // Change the dialog title and text elements
    document.getElementById('deleteHostDialogTitle').innerHTML = t('Delete All Hosts');
    document.getElementById('deleteHostDialogText').innerHTML = t('Are you sure you want to delete all existing hosts?') + '<br><br><strong class="host-removal-consequences">' + t('All saved host entries will be removed from Moonlight. To use these hosts again, you may need to add and pair them again. The host PCs and their files will not be affected.') + '</strong>';
    
    // Show the dialog and push the view
    fadeInUiElement(deleteHostOverlay, 'flex');
    showUiDialog(deleteHostDialog);
    isDialogOpen = true;
    Navigation.push(Views.DeleteHostDialog);
  
    // Cancel the operation if the Cancel button is pressed
    $('#cancelDeleteHost').off('click');
    $('#cancelDeleteHost').on('click', function() {
      console.log('%c[index.js, deleteAllHostsDialog]', 'color: green;', 'Closing app dialog and returning.');
      fadeOutUiElement(deleteHostOverlay);
      closeUiDialog(deleteHostDialog);
      isDialogOpen = false;
      Navigation.pop();
      Navigation.switch();
    });
  
    // Remove all existing hosts if the Continue button is pressed
    $('#continueDeleteHost').off('click');
    $('#continueDeleteHost').on('click', function() {
      console.log('%c[index.js, deleteAllHostsDialog]', 'color: green;', 'Removing all hosts, closing app dialog, and returning.');
      // Stop background polling for all hosts before removing them
      stopPollingHosts();
      // Iterate through all hosts and remove them
      for (var serverUid in hosts) {
        if (hosts.hasOwnProperty(serverUid)) {
          var host = hosts[serverUid];
          // Remove the host container from the grid
          $('#host-container-' + host.serverUid).remove();
          // Remove the host from the hosts object
          delete hosts[host.serverUid];
          // Save the updated hosts (empty hosts object)
          saveHosts();
        }
      }
      // An empty host list must always trigger discovery on the next startup.
      document.querySelector('#discoverNewHostsAtStartupBtn').MaterialSwitch.on();
      storeData('discoverNewHostsAtStartup', true, null);
      // If all hosts removed, show snackbar message
      snackbarLog('All hosts have been deleted successfully.');
      // Clear the preview app cache and update Smart Hub Preview
      _previewApps = {};
      savePreviewApps();
      updatePreviewData();
      fadeOutUiElement(deleteHostOverlay);
      closeUiDialog(deleteHostDialog);
      isDialogOpen = false;
      Navigation.pop();
      // Reset the Hosts view navigation index to prevent possible out-of-bounds errors
      Views.Hosts.view.reset();
      Navigation.switch();
    });
  }
}

// Show the Host Details dialog with host information details
function hostDetailsDialog(host) {
  // Create an overlay for the dialog and append it to the body
  var hostDetailsDialogOverlay = $('<div>', {
    id: 'hostDetailsDialogOverlay-' + host.serverUid,
    class: 'dialog-overlay'
  }).appendTo('#popup-layer');

  // Create the dialog element and append it to the overlay
  var hostDetailsDialog = $('<dialog>', {
    id: 'hostDetailsDialog-' + host.serverUid,
    class: 'mdl-dialog'
  }).appendTo(hostDetailsDialogOverlay);

  // Add a dialog title named Host Details
  $('<h3>', {
    id: 'hostDetailsDialogTitle-' + host.serverUid,
    class: 'mdl-dialog__title',
    'data-i18n': 'Host Details',
    text: t('Host Details')
  }).appendTo(hostDetailsDialog);

  // Create a content section inside the dialog
  var hostDetailsDialogContent = $('<div>', {
    class: 'mdl-dialog__content'
  }).appendTo(hostDetailsDialog);

  // The external port identifies the transport currently used for this host.
  // Show a lock only when it matches the host's HTTPS port.
  var isHttpsPortInUse = host.externalPort != null && host.httpsPort != null &&
    Number(host.externalPort) === Number(host.httpsPort);
  var httpsLockIcon = isHttpsPortInUse
    ? '<i class="material-symbols-outlined host-details-https-icon" aria-hidden="true">lock</i>'
    : '';
  var activeAddress = escapeHTML(host.address);
  var localAddress = escapeHTML(host.localAddress);

  // Color the two connection-state values without changing their translated labels.
  var stateValue = host.online ? t('ONLINE') : t('OFFLINE');
  var pairStateValue = host.paired ? t('PAIRED') : t('UNPAIRED');
  var stateClass = host.online ? 'host-details-value--positive' : 'host-details-value--negative';
  var pairStateClass = host.paired ? 'host-details-value--positive' : 'host-details-value--negative';

  // Build the details using only app lists already known for this host.
  var hostDetailsLines = [
    t('Name: %1$s', escapeHTML(host.hostname)),
    t('State: %1$s', '<span class="host-details-value ' + stateClass + '">' + escapeHTML(stateValue) + '</span>'),
    t('Active Address: %1$s', activeAddress ? httpsLockIcon + activeAddress : t('NULL')),
    t('UUID: %1$s', escapeHTML(host.serverUid) ? escapeHTML(host.serverUid) : t('NULL')),
    t('Local Address: %1$s', localAddress ? httpsLockIcon + localAddress : t('NULL')),
    t('MAC Address: %1$s', escapeHTML(host.macAddress) ? escapeHTML(host.macAddress) : t('NULL')),
    t('Pair State: %1$s', '<span class="host-details-value ' + pairStateClass + '">' + escapeHTML(pairStateValue) + '</span>')
  ];
  var currentGameId = Number(host.currentGame);
  if (Number.isFinite(currentGameId) && currentGameId !== 0) {
    var knownApps = Array.isArray(host._memCachedApplist) ? host._memCachedApplist.slice() : [];
    var previewHost = _previewApps && _previewApps[host.serverUid];
    if (previewHost && Array.isArray(previewHost.apps)) {
      knownApps = knownApps.concat(previewHost.apps);
    }
    var runningApp = knownApps.find(function(app) {
      return app && Number(app.id) === currentGameId && typeof app.title === 'string' && app.title.length > 0;
    });
    var runningAppLabel = runningApp ? runningApp.title : String(host.currentGame);
    hostDetailsLines.push(t('Running application: %1$s', escapeHTML(runningAppLabel)));
  }
  hostDetailsLines.push(
    t('HTTP Port: %1$s', escapeHTML(host.httpPort) ? escapeHTML(host.httpPort) : t('NULL')),
    t('HTTPS Port: %1$s', escapeHTML(host.httpsPort) ? escapeHTML(host.httpsPort) : t('NULL'))
  );

  // Add a paragraph with multiple lines of text
  $('<p>', {
    id: 'hostDetailsDialogText-' + host.serverUid,
    class: 'host-details-text',
    html: hostDetailsLines.join('<br>')
  }).appendTo(hostDetailsDialogContent);

  // Create the actions section inside the dialog
  var hostDetailsDialogActions = $('<div>', {
    class: 'mdl-dialog__actions'
  }).appendTo(hostDetailsDialog);

  // Create and set up the Close button
  var closeHostDetailsDialog = $('<button>', {
    type: 'button',
    id: 'closeHostDetails',
    class: 'mdl-button mdl-js-button mdl-button--raised mdl-button--colored mdl-js-ripple-effect',
    'data-i18n': 'Close menu',
    text: t('Close menu')
  });

  // Close the dialog if the Close button is pressed
  closeHostDetailsDialog.off('click');
  closeHostDetailsDialog.click(function() {
    console.log('%c[index.js, hostDetailsDialog]', 'color: green;', 'Closing app dialog and returning.');
    $(hostDetailsDialogOverlay).css('display', 'none');
    closeUiDialog(hostDetailsDialog[0]);
    hostDetailsDialogOverlay.remove();
    isDialogOpen = false;
    Navigation.pop();
  }).appendTo(hostDetailsDialogActions);

  // If the dialog element doesn't support the showModal method, register it with dialogPolyfill
  if (!hostDetailsDialog[0].showModal) {
    dialogPolyfill.registerDialog(hostDetailsDialog[0]);
  }

  // Show the dialog and push the view
  fadeInUiElement(hostDetailsDialogOverlay, 'flex');
  showUiDialog(hostDetailsDialog[0]);
  isDialogOpen = true;
  Navigation.push(Views.HostDetailsDialog);
  setTimeout(() => Navigation.switch(), 5);
}

// Show the Moonlight Support dialog
function appSupportDialog() {
  // Find the existing overlay and dialog elements
  var appSupportDialogOverlay = document.querySelector('#appSupportDialogOverlay');
  var appSupportDialog = document.querySelector('#appSupportDialog');

  // Show the dialog and push the view
  fadeInUiElement(appSupportDialogOverlay, 'flex');
  showUiDialog(appSupportDialog);
  isDialogOpen = true;
  Navigation.push(Views.MoonlightSupportDialog);

  // Close the dialog if the Close button is pressed
  $('#closeAppSupport').off('click');
  $('#closeAppSupport').on('click', function() {
    console.log('%c[index.js, appSupportDialog]', 'color: green;', 'Closing app dialog and returning.');
    fadeOutUiElement(appSupportDialogOverlay);
    closeUiDialog(appSupportDialog);
    isDialogOpen = false;
    Navigation.pop();
    Navigation.switch();
  });
}

// Handle layout elements when displaying the Settings view
function showSettingsMode() {
  $('#main-ui-layer').removeClass('waves-active');
  console.log('%c[index.js, showSettingsMode]', 'color: green;', 'Entering "Show Settings" mode.');
  $('#main-content').addClass('settings-view-active');

  hideStreamDiagnosticsLayer();
  $('#header-title').html(t('Settings'));
  updateConfigSummaryBar();
  $('#header-logo').show();
  $('#main-header').show();
  $('.mdl-layout__content').show();
  $('#goBackBtn').show();
  $('#restoreDefaultsBtn').show();
  $('#main-content').children().not('#listener, #wasmSpinner').show();
  // The carousel viewport owns the Hosts arrows and must be hidden as a whole
  // when entering Settings; hiding only the nested grid leaves its indicators visible.
  $('#hosts-carousel-viewport')
    .removeClass('host-grid-overflow-left host-grid-overflow-right')
    .hide();
  $('#host-grid').hide();
  $('#game-grid').hide();
  $('.nav-menu-parent').hide();
  $('#updateAppBtn').hide();
  $('#settingsBtn').hide();
  $('#refreshHostsBtn').hide();
  $('#supportBtn').hide();
  updateGamepadTestButtonVisibility();
  $('#main-content').removeClass('fullscreen');
  $('#listener').removeClass('fullscreen');

  showUiLayer('main-ui-layer');
  Navigation.start();
  // Register showSettingsMode to re-run every time the language changes
  if (window.i18n && typeof window.i18n.onRefresh === 'function') {
    window.i18n.onRefresh(showSettingsMode);
  }
}

// Show the Settings list
function showSettings() {
  // Remove the background layer entirely while Settings is displayed.
  $('#background-layer').hide();

  // Stop every ambient background before the Settings loading/transition screen is shown.
  updateAmbientBackgroundActivation(false);

  // Restore the last visited category while keeping focus in the left navigation.
  const categories = Array.from(document.querySelectorAll('.settings-category'));
  const rememberedIndex = categories.findIndex(item => item.dataset.category === lastSettingsCategory);
  Views.Settings.view.index = rememberedIndex >= 0 ? rememberedIndex : 0;
  showSettingsOverview(lastSettingsCategory);
  const settingsPane = document.getElementById('settings-right-pane');
  if (settingsPane) {
    settingsPane.scrollTop = 0;
  }

  // Hide the configuration summary immediately during the transition to Settings.
  configSummaryTemporarilyHidden = true;
  updateConfigSummaryBar();

  // Stop navigation before showing the loading screen
  Navigation.stop();

  // Hide the main header and content before showing a loading screen
  $('#main-header').children().hide();
  $('#main-header').css({'backgroundColor': 'transparent', 'boxShadow': 'none'});
  $('#host-grid, #game-grid').hide();
  updateGamepadTestButtonVisibility();

  // Show a spinner while the setting list loads
  $('#wasmSpinner').css('display', 'inline-block');
  $('#wasmSpinnerLogo').hide();
  $('#wasmSpinnerMessage').text(t('Loading Settings...'));

  setTimeout(() => {
    // The loading spinner has now been visible for 500 ms. Query panel and HDR
    // capabilities while it remains on screen, then apply them before showing Settings.
    refreshPanelResolutionCapabilities();
    refreshHdrCapability();
    updateVideoResolutionAvailability();
    updateHdrControlState();

    // Hide the spinner after successfully retrieving the setting list
    $('#wasmSpinner').hide();

    // Show the main header after the loading screen is complete
    $('#main-header').children().show();
    $('#main-header').css({'backgroundColor': 'var(--theme-surface-deep)', 'boxShadow': '0 0 4px 0 rgba(0, 0, 0, 1)'});

    // Show the settings list section
    $('#settings-list').removeClass('hide-container');
    $('#settings-list').css('display', 'flex');
    $('#settings-list').show();

    // The settings list now controls the summary bar's visibility normally.
    configSummaryTemporarilyHidden = false;
    updateConfigSummaryBar();

    // Navigate to the Settings view
    Navigation.push(Views.Settings);
    showSettingsMode();
  }, 500);
}

// The last category remains visible while the left navigation has focus.
let lastSettingsCategory = 'basicSettings';

// Reset the current settings view by clearing the selection and hiding the right pane.
function resetSettingsView() {
  document.querySelectorAll('.settings-options').forEach(function(settingsOption) {
    settingsOption.style.display = 'none';
  });

  document.querySelectorAll('.settings-category').forEach(function(settingsCategory) {
    settingsCategory.classList.remove('selected');
  });
}

// Return to the category overview without discarding the last visited category.
function showSettingsOverview(category) {
  const targetCategory = category || lastSettingsCategory;
  resetSettingsView();

  const targetPaneOptions = document.getElementById(targetCategory);
  if (targetPaneOptions) {
    targetPaneOptions.style.display = 'block';
  }

  const settingsPane = document.getElementById('settings-right-pane');
  if (settingsPane) {
    settingsPane.classList.add('settings-pane-dimmed');
    settingsPane.classList.remove('has-effective-scroll');
  }
}

// Navigate to the provided settings view by pushing the target view and set the focus to the setting
function navigateSettingsView(view) {
  // Every settings section starts at its first option and at the top of the pane.
  if (view && view.view && typeof view.view.reset === 'function') {
    view.view.reset();
  }
  const settingsPane = document.getElementById('settings-right-pane');
  if (settingsPane) {
    settingsPane.scrollTop = 0;
  }

  Navigation.pop();
  Navigation.push(view);
  setTimeout(() => Navigation.switch(), 250);
}

// Handle category selection, display appropriate options, and navigate to the provided settings pane
function handleSettingsView(category) {
  // Remember the selected category and restore full opacity for option navigation.
  lastSettingsCategory = category;
  const settingsPane = document.getElementById('settings-right-pane');
  if (settingsPane) {
    settingsPane.classList.remove('settings-pane-dimmed');
  }

  // Reset the current settings view before navigating to the next settings view.
  resetSettingsView();

  // Show appropriate settings options in the target pane based on the selected settings category
  const targetPaneOptions = document.getElementById(category);
  const selectedCategory = document.querySelector(`.settings-category[data-category="${category}"]`);

  // Show the target pane options if the target pane exists
  if (targetPaneOptions) {
    // Show the pane view
    targetPaneOptions.style.display = 'block';

    // Determine whether the right pane has real content overflow before adding
    // the extra bottom space; the safety padding itself must not trigger the test.
    const settingsPane = document.getElementById('settings-right-pane');
    if (settingsPane) {
      const currentPaddingBottom = parseFloat(window.getComputedStyle(settingsPane).paddingBottom) || 0;
      const contentOverflows = settingsPane.scrollHeight - currentPaddingBottom > settingsPane.clientHeight + 2;
      settingsPane.classList.toggle('has-effective-scroll', contentOverflows);
    }
  } else {
    // Otherwise, exit early
    return;
  }

  // Add the 'selected' class to the clicked settings category
  if (selectedCategory) {
    // Mark the category as selected
    selectedCategory.classList.add('selected');
  } else {
    // Otherwise, exit early
    return;
  }

  // Navigate to the corresponding settings view
  switch (category) {
    case 'basicSettings': // Navigate to the BasicSettings view
      navigateSettingsView(Views.BasicSettings);
      break;
    case 'interfaceSettings': // Navigate to the InterfaceSettings view
      navigateSettingsView(Views.InterfaceSettings);
      break;
    case 'hostSettings': // Navigate to the HostSettings view
      navigateSettingsView(Views.HostSettings);
      break;
    case 'inputSettings': // Navigate to the InputSettings view
      navigateSettingsView(Views.InputSettings);
      break;
    case 'audioSettings': // Navigate to the AudioSettings view
      navigateSettingsView(Views.AudioSettings);
      break;
    case 'videoSettings': // Navigate to the VideoSettings view
      navigateSettingsView(Views.VideoSettings);
      break;
    case 'advancedSettings': // Navigate to the AdvancedSettings view
      navigateSettingsView(Views.AdvancedSettings);
      break;
    case 'aboutSettings': // Navigate to the AboutSettings view
      navigateSettingsView(Views.AboutSettings);
      break;
    default:
      break;
  }
}

// Show the Navigation Guide dialog
function navigationGuideDialog() {
  // Find the existing overlay and dialog elements
  var navGuideDialogOverlay = document.querySelector('#navGuideDialogOverlay');
  var navGuideDialog = document.querySelector('#navGuideDialog');
  var navGuideDialogContent = document.getElementById('navGuideDialogContent');

  // Start the guide at the top whenever the dialog is opened.
  document.getElementById('navGuideDialogContent').scrollTop = 0;

  // Show the dialog and push the view
  fadeInUiElement(navGuideDialogOverlay, 'flex');
  showUiDialog(navGuideDialog);
  isDialogOpen = true;
  Navigation.push(Views.NavigationGuideDialog);

  // Reset after the dialog is visible and after navigation has applied focus.
  requestAnimationFrame(() => {
    navGuideDialogContent.scrollTop = 0;
    window.setTimeout(() => { navGuideDialogContent.scrollTop = 0; }, 150);
  });

  // Close the dialog if the Close button is pressed
  $('#closeNavGuide').off('click');
  $('#closeNavGuide').on('click', function() {
    console.log('%c[index.js, navigationGuideDialog]', 'color: green;', 'Closing app dialog and returning.');
    fadeOutUiElement(navGuideDialogOverlay);
    closeUiDialog(navGuideDialog);
    isDialogOpen = false;
    Navigation.pop();
    Navigation.switch();
  });
}

// Fetch the latest version and release notes from GitHub API
function fetchLatestRelease() {
  // GitHub API endpoint to get the latest released version
  const apiUrl = `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/releases/latest`;

  // Fetch the latest release data from the GitHub API
  return fetch(apiUrl).then(response => {
    if (!response.ok) {
      throw new Error('Network response failed: ' + response.statusText);
    }
    // Parse JSON response
    return response.json();
  }).then(data => {
    // Get the latest version and release notes from the released update
    let latestVersion = data.tag_name.startsWith('v') ? data.tag_name.slice(1) : data.tag_name;
    const releaseNotes = extractReleaseNotes(data.body) || t('• No relevant changes found.');
    return { latestVersion, releaseNotes };
  });
}

// Compare the current version with the latest version to determine if an update is available
function checkVersionUpdate(currentVersion, latestVersion) {
  // Return false if either version is missing or invalid
  if (!currentVersion || !latestVersion) {
    return false;
  }

  const currentVerParts = currentVersion.split('.').map(Number);
  const latestVerParts = latestVersion.split('.').map(Number);

  // Compare each part of the version numbers
  for (let i = 0; i < latestVerParts.length; i++) {
    if (latestVerParts[i] > currentVerParts[i]) {
      // If latest version has a higher number in any part, an update is available
      return true;
    } else if (latestVerParts[i] < currentVerParts[i]) {
      // If the current version has a higher number, no update is needed
      return false;
    }
  }
  // If all parts are equal, no update is available
  return false;
}

// Render the small Markdown subset used by GitHub release highlights without trusting remote HTML.
function appendReleaseNoteInlineMarkdown(parent, text) {
  const tokenPattern = /(\[([^\]]+)\]\((https:\/\/[^\s)]+)\)|\*\*(.+?)\*\*|\*(.+?)\*)/g;
  let lastIndex = 0;
  let match;

  while ((match = tokenPattern.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parent.appendChild(document.createTextNode(text.slice(lastIndex, match.index)));
    }

    if (match[2] && /^https:\/\/[^\s]+$/i.test(match[3])) {
      const link = document.createElement('a');
      link.textContent = match[2];
      link.href = match[3];
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      parent.appendChild(link);
    } else if (match[4] !== undefined) {
      const strong = document.createElement('strong');
      strong.textContent = match[4];
      parent.appendChild(strong);
    } else if (match[5] !== undefined) {
      const emphasis = document.createElement('em');
      emphasis.textContent = match[5];
      parent.appendChild(emphasis);
    } else {
      parent.appendChild(document.createTextNode(match[0]));
    }

    lastIndex = tokenPattern.lastIndex;
  }

  if (lastIndex < text.length) {
    parent.appendChild(document.createTextNode(text.slice(lastIndex)));
  }
}

function renderReleaseNotesMarkdown(markdown, container) {
  const lines = String(markdown || '').replace(/\r\n?/g, '\n').split('\n');
  let paragraphLines = [];
  let list = null;

  function flushParagraph() {
    if (!paragraphLines.length) return;
    const paragraph = document.createElement('p');
    paragraph.className = 'update-release-notes-paragraph';
    appendReleaseNoteInlineMarkdown(paragraph, paragraphLines.join(' '));
    container.appendChild(paragraph);
    paragraphLines = [];
  }

  lines.forEach(function(line) {
    const bullet = line.match(/^\s*[-*]\s+(.+)$/);
    if (bullet) {
      flushParagraph();
      if (!list) {
        list = document.createElement('ul');
        list.className = 'update-release-notes-list';
        container.appendChild(list);
      }
      const item = document.createElement('li');
      appendReleaseNoteInlineMarkdown(item, bullet[1].trim());
      list.appendChild(item);
      return;
    }

    list = null;
    if (!line.trim()) {
      flushParagraph();
      return;
    }
    paragraphLines.push(line.trim());
  });

  flushParagraph();
}

// Extract only the release notes section from the released update.
function extractReleaseNotes(releaseNotes) {
  // Support both upstream "What's Changed" notes and this project's "Highlights" section.
  const match = String(releaseNotes || '').match(/## (?:What's Changed:?|Highlights)\r?\n+([\s\S]+?)(?=\r?\n+## |\r?\n+\*\*Full Changelog\*\*|$)/);
  if (!match) return null;

  return match[1].split('\n').map(function(line) {
    let cleaned = line.trim();
    cleaned = cleaned.replace(/\s+by\s+@[^]+$/i, '');
    if (cleaned && !cleaned.endsWith('.')) cleaned += '.';
    return cleaned;
  }).filter(Boolean).join('\n');
}

// Format the update timestamp into a readable string as "dd/mm/yyyy hh:mm"
function formatUpdateTimestamp(ms) {
  var date = new Date(ms);
  var day = date.getDate().toString().padStart(2, '0');
  var month = (date.getMonth() + 1).toString().padStart(2, '0');
  var year = date.getFullYear();
  var hour = date.getHours().toString().padStart(2, '0');
  var minute = date.getMinutes().toString().padStart(2, '0');
  return `${day}/${month}/${year} ${hour}:${minute}`;
}

// Show the Update App button when a new update is found
function updateAppButton(latestVersion) {
  // Update the existing button if a newer release version was found.
  if ($('#updateAppBtn').length > 0) {
    $('#updateAppBtnText')
      .attr('data-param', latestVersion)
      .text(t('New update v%1$s', latestVersion));
    $('#updateAppBtn').show();
    console.log('%c[index.js, updateAppButton]', 'color: green;', 'Updated the existing Update App button.');
    return;
  }

  // Create the button dynamically
  var updateAppBtn = $('<button>', {
    type: 'button',
    id: 'updateAppBtn',
    class: 'mdl-button mdl-js-button mdl-button--raised mdl-button--colored mdl-js-ripple-effect',
    'aria-label': 'Update App'
  });
  // Create the badge icon dynamically
  var updateAppBtnBadge = $('<div>', {
    class: 'navigation-button-icons material-icons mdl-badge mdl-badge--overlap',
    'data-badge': '1',
    text: 'update'
  });
  // Create the button text dynamically
  var updateAppBtnText = $('<span>', {
    id: 'updateAppBtnText',
    'data-i18n': 'New update v%1$s',
    'data-param': latestVersion,
    text: t('New update v%1$s', latestVersion)
  });
  // Create the button tooltip dynamically
  var updateAppBtnTooltip = $('<div>', {
    id: 'updateAppBtnTooltip',
    class: 'mdl-tooltip',
    'for': 'updateAppBtn',
    'data-i18n': 'Check what\'s new',
    text: t('Check what\'s new')
  });
  // Create the layout spacer dynamically
  var extraLayoutSpacer = $('<div>', {
    id: 'updateAppBtnSpacer',
    class: 'mdl-layout-spacer'
  });
  // Append elements inside the button
  updateAppBtn.append(updateAppBtnBadge, updateAppBtnText);
  // Keep the button in the UI layer and its tooltip in the popup layer.
  $('.mdl-layout-spacer').after(updateAppBtn, extraLayoutSpacer);
  $('#popup-layer').append(updateAppBtnTooltip);
  // Upgrade newly added elements for MDL styling
  componentHandler.upgradeElement(updateAppBtn[0]);
  componentHandler.upgradeElement(updateAppBtnTooltip[0]);
  componentHandler.upgradeDom();
  // Smoothly fade-in the button after inserting
  setTimeout(() => {
    updateAppBtn.css({
      opacity: 1,
      transform: 'translateY(0)'
    });
  }, 1200);
  // Attach the click event listener to the Update App button
  updateAppBtn.off('click');
  updateAppBtn.on('click', function() {
    console.log('%c[index.js, updateAppButton]', 'color: green;', 'Checking for new update release notes...');
    // Fetch the latest release data from the GitHub API
    fetchLatestRelease().then(({ latestVersion, releaseNotes }) => {
      setTimeout(() => {
        // Check if a new version update is available
        if (checkVersionUpdate(appInfo.version, latestVersion)) {
          // Show the Update Moonlight dialog with new version and release notes to inform user to update the app
          updateAppDialog(latestVersion, releaseNotes);
        }
      }, 500);
    }).catch(error => {
      console.error('%c[index.js, updateAppButton]', 'color: green;', 'Error: Failed to fetch the release data!', error);
      snackbarLogLong('Unable to check update release notes at this time. Please try again later!');
    });
  });
}

// Show the Update Moonlight dialog
function updateAppDialog(latestVersion, releaseNotes) {
  var updateAppDialogOverlay = $('#updateAppDialogOverlay');
  var updateAppDialog = $('#updateAppDialog');
  const content = document.getElementById('updateAppDialogText');
  content.textContent = '';

  const intro = document.createElement('p');
  intro.className = 'update-release-notes-intro';
  const introText = t('Version %1$s is now available! Update manually to enjoy new features and improvements.<br><br>', latestVersion)
    .replace(/<br\s*\/?\s*>/gi, '\n');
  introText.split('\n').forEach(function(part, index) {
    if (index > 0) intro.appendChild(document.createElement('br'));
    if (part) intro.appendChild(document.createTextNode(part));
  });
  content.appendChild(intro);

  const heading = document.createElement('p');
  heading.className = 'update-release-notes-heading';
  const headingStrong = document.createElement('strong');
  headingStrong.textContent = "What's Changed:";
  heading.appendChild(headingStrong);
  content.appendChild(heading);
  renderReleaseNotesMarkdown(releaseNotes, content);

  $('#closeUpdateApp').off('click').on('click', function() {
    console.log('%c[index.js, updateAppDialog]', 'color: green;', 'Closing app dialog and returning.');
    updateAppDialogOverlay.css('display', 'none');
    closeUiDialog(updateAppDialog[0]);
    isDialogOpen = false;
    Navigation.pop();
    Navigation.switch();
  });

  if (!updateAppDialog[0].showModal) {
    dialogPolyfill.registerDialog(updateAppDialog[0]);
  }

  document.getElementById('updateAppDialogContent').scrollTop = 0;
  fadeInUiElement(updateAppDialogOverlay, 'flex');
  showUiDialog(updateAppDialog[0]);
  isDialogOpen = true;
  Navigation.push(Views.UpdateMoonlightDialog);

  const updateDialogContent = document.getElementById('updateAppDialogContent');
  requestAnimationFrame(() => {
    updateDialogContent.scrollTop = 0;
    window.setTimeout(() => { updateDialogContent.scrollTop = 0; }, 150);
  });
}

function saveAutomaticUpdateChecks() {
  setTimeout(() => {
    const enabled = $('#automaticUpdateChecksSwitch').parent().hasClass('is-checked');
    console.log('%c[index.js, saveAutomaticUpdateChecks]', 'color: green;', 'Saving automatic update checks state: ' + enabled);
    storeData('automaticUpdateChecks', enabled, null);
  }, 100);
}

// Check for updates when the Check for Updates button is pressed
// Restore the update badge from the last successfully fetched release version.
// This runs on every normal startup, regardless of the automatic-check setting or interval.
function restoreUpdateBadgeFromCache() {
  getData(UPDATE_VERSION, function(vResult) {
    var cachedVersion = vResult[UPDATE_VERSION];
    if (cachedVersion !== undefined && cachedVersion !== null &&
        checkVersionUpdate(appInfo.version, cachedVersion)) {
      updateAppButton(cachedVersion);
    } else {
      // A cached release that is no newer than this installation must not leave a stale badge.
      $('#updateAppBtn, #updateAppBtnTooltip, #updateAppBtnSpacer').remove();
    }
  });
}

// Check for updates when the Check for Updates button is pressed
function checkForAppUpdates() {
  console.log('%c[index.js, checkForAppUpdates]', 'color: green;', 'Checking for new application updates...');
  snackbarLogPersistent('Checking for available Moonlight updates...');
  // Fetch the latest release data from the GitHub API
  fetchLatestRelease().then(({ latestVersion, releaseNotes }) => {
    // Persist the successfully fetched release version so the update badge survives app restarts.
    storeData(UPDATE_VERSION, latestVersion);

    setTimeout(() => {
      // Check if a new version update is available
      if (checkVersionUpdate(appInfo.version, latestVersion)) {
        // The update dialog is the result of this check, so remove its persistent progress snackbar.
        dismissPersistentSnackbar();
        // Show the Update Moonlight dialog with new version and release notes to inform user to update the app
        updateAppDialog(latestVersion, releaseNotes);
        // Create or refresh the Update App button so it remains available after the dialog closes
        updateAppButton(latestVersion);
      } else {
        // A successful check confirms that the installed app is current; no update badge is needed.
        $('#updateAppBtn, #updateAppBtnTooltip, #updateAppBtnSpacer').remove();
        snackbarLogLong('Your app is already up to date! You\'re on the latest version.');
      }
    }, 1500);
  }).catch(error => {
    console.error('%c[index.js, checkForAppUpdates]', 'color: green;', 'Error: Failed to fetch the release data!', error);
    snackbarLogLong('Unable to check for updates right now. Please try again later!');
  });
}

// Automatically perform a scheduled app update check at startup if the interval condition is met and notify the user
function checkForAppUpdatesAtStartup() {
  if (isInGame) {
    startupUpdateCheckPending = true;
    return;
  }
  startupUpdateCheckPending = false;

  getData('automaticUpdateChecks', function(settings) {
    const storedValue = settings.automaticUpdateChecks;
    const enabled = storedValue == null || storedValue === true ||
      storedValue === 'true' || storedValue === 1;
    if (!enabled) {
      console.log('%c[index.js, checkForAppUpdatesAtStartup]', 'color: green;', 'Automatic update checks are disabled; skipping startup check.');
      return;
    }

    // Fetch the current timestamp and stored version info
    getData(UPDATE_TIMESTAMP, function(tResult) {
      if (isInGame) {
        startupUpdateCheckPending = true;
        return;
      }
      var lastChecked = tResult[UPDATE_TIMESTAMP];
      var currentTime = Date.now();
      // Log the last auto-check timestamp if it exists
      if (lastChecked) {
        console.log('%c[index.js, checkForAppUpdatesAtStartup]', 'color: green;', `Last auto-check performed: ${formatUpdateTimestamp(lastChecked)}`);
      }
      // Check if enough time has passed since the last update check
      if (!lastChecked || currentTime - lastChecked > UPDATE_INTERVAL) {
        console.log('%c[index.js, checkForAppUpdatesAtStartup]', 'color: green;', 'Performing auto-check for new application updates...');
        // Fetch the latest release data from the GitHub API
        fetchLatestRelease().then(({ latestVersion }) => {
          // Persist the result and timestamp only after the release request succeeds.
          storeData(UPDATE_VERSION, latestVersion);
          var successfulCheckTime = Date.now();
          storeData(UPDATE_TIMESTAMP, successfulCheckTime);
          console.log('%c[index.js, checkForAppUpdatesAtStartup]', 'color: green;', `Successful auto-check timestamp stored: ${formatUpdateTimestamp(successfulCheckTime)}`);

          setTimeout(() => {
            // Check if a new version update is available
            if (checkVersionUpdate(appInfo.version, latestVersion)) {
              // Show snackbar message to inform user to update the app
              snackbarLogLong('Version %1$s is now available! Check out the latest features & improvements.', latestVersion);
              // Create and display the Update App button with tooltip and additional layout spacer
              updateAppButton(latestVersion);
            } else {
              // The installed app is current; remove any stale update button from this session.
              $('#updateAppBtn, #updateAppBtnTooltip, #updateAppBtnSpacer').remove();
            }
          }, 100);
        }).catch(error => {
          // Do not update UPDATE_TIMESTAMP on failure; the next app launch can retry immediately.
          console.error('%c[index.js, checkForAppUpdatesAtStartup]', 'color: green;', 'Error: Failed to fetch the release data!', error);
          snackbarLogLong('Cannot automatically check for updates at this time!');
        });
      } else {
        var timeLeft = UPDATE_INTERVAL - (currentTime - lastChecked);
        var hoursLeft = Math.floor(timeLeft / (1000 * 60 * 60));
        var minutesLeft = Math.floor((timeLeft % (1000 * 60 * 60)) / (1000 * 60));
        console.log(
          '%c[index.js, checkForAppUpdatesAtStartup]', 'color: green;', 
          'Auto-update check skipped as the last one was within the past 24 hours. ' + 
          `Next auto-check will occur in ${hoursLeft} hour${hoursLeft !== 1 ? 's' : ''} and ${minutesLeft} minute${minutesLeft !== 1 ? 's' : ''}.`
        );
        // Still show the Update App button if a newer version was previously cached
        getData(UPDATE_VERSION, function(vResult) {
          var cachedVersion = vResult[UPDATE_VERSION];
          // Check if the cached version is newer than the current app version
          if (cachedVersion !== undefined && checkVersionUpdate(appInfo.version, cachedVersion)) {
            setTimeout(() => {
              // Show snackbar message with cached version to inform user to update the app
              snackbarLogLong('Version %1$s is now available! Check out the latest features & improvements.', cachedVersion);
              // Create and display the cached Update App button with tooltip and additional layout spacer
              updateAppButton(cachedVersion);
            }, 100);
          }
        });
      }
    });
  });
}

// Show a confirmation with the Restore Defaults dialog before restoring the default settings
function restoreDefaultsDialog() {
  // Find the existing overlay and dialog elements
  var restoreDefaultsDialogOverlay = document.querySelector('#restoreDefaultsDialogOverlay');
  var restoreDefaultsDialog = document.querySelector('#restoreDefaultsDialog');

  // Show the dialog and push the view
  fadeInUiElement(restoreDefaultsDialogOverlay, 'flex');
  showUiDialog(restoreDefaultsDialog);
  isDialogOpen = true;
  Navigation.push(Views.RestoreDefaultsDialog);

  // Cancel the operation if the Cancel button is pressed
  $('#cancelRestoreDefaults').off('click');
  $('#cancelRestoreDefaults').on('click', function() {
    console.log('%c[index.js, restoreDefaultsDialog]', 'color: green;', 'Closing app dialog and returning.');
    fadeOutUiElement(restoreDefaultsDialogOverlay);
    closeUiDialog(restoreDefaultsDialog);
    isDialogOpen = false;
    Navigation.pop();
    Navigation.switch();
  });

  // Restore all default settings if the Continue button is pressed
  $('#continueRestoreDefaults').off('click');
  $('#continueRestoreDefaults').on('click', function() {
    console.log('%c[index.js, restoreDefaultsDialog]', 'color: green;', 'Restoring default settings, closing app dialog, and returning.');
    // Reset any settings to their default state and save the updated values
    restoreDefaultsSettingsValues();
    // If the settings have been reset to default, show snackbar message
    snackbarLog('Settings have been restored to their default values.');
    fadeOutUiElement(restoreDefaultsDialogOverlay);
    closeUiDialog(restoreDefaultsDialog);
    isDialogOpen = false;
    Navigation.pop();
    Navigation.switch();
    // Show the required Restart Moonlight dialog and push the view
    setTimeout(() => requiredRestartAppDialog(), 2000);
  });
}

// Show the Warning dialog
function warningDialog(title, message, onClose, plainText, buttonLabel, streamErrorDetails) {
  // Find the existing overlay and dialog elements
  var warningDialogOverlay = document.querySelector('#warningDialogOverlay');
  var warningDialog = document.querySelector('#warningDialog');
  var titleElement = document.getElementById('warningDialogTitle');
  var textElement = document.getElementById('warningDialogText');

  // Stream errors use a dedicated title treatment and keep the API's original
  // diagnostic text separate from the localized explanation.
  if (streamErrorDetails) {
    titleElement.textContent = '';
    titleElement.style.display = 'flex';
    titleElement.style.alignItems = 'center';
    var errorIcon = document.createElement('span');
    errorIcon.className = 'material-symbols-outlined';
    errorIcon.setAttribute('aria-hidden', 'true');
    errorIcon.textContent = 'error';
    errorIcon.style.fontSize = '42px';
    errorIcon.style.marginRight = '10px';
    titleElement.appendChild(errorIcon);
    var errorTitle = document.createElement('span');
    // Keep the title text at the dialog's original heading size; only the icon grows.
    errorTitle.style.fontSize = '2.8rem';
    var errorCode = streamErrorDetails.code;
    errorTitle.textContent = t('Error') +
      (typeof errorCode === 'number' && Number.isFinite(errorCode) && errorCode !== 0
        ? ' ' + String(errorCode) : '');
    titleElement.appendChild(errorTitle);

    textElement.textContent = '';
    textElement.style.whiteSpace = 'pre-wrap';
    var primaryMessage = document.createElement('div');
    primaryMessage.textContent = t(message);
    textElement.appendChild(primaryMessage);

    var apiMessage = streamErrorDetails.apiMessage;
    if (typeof apiMessage === 'string' && apiMessage.length > 0) {
      var technicalMessage = document.createElement('div');
      technicalMessage.className = 'stream-error-api-message';
      technicalMessage.textContent = apiMessage;
      technicalMessage.style.fontSize = '0.72em';
      technicalMessage.style.lineHeight = '1.35';
      technicalMessage.style.marginTop = '14px';
      technicalMessage.style.opacity = '0.78';
      technicalMessage.style.overflowWrap = 'anywhere';
      textElement.appendChild(technicalMessage);
    }
  } else {
    titleElement.style.display = '';
    titleElement.style.alignItems = '';
    titleElement.innerHTML = t(title);
    if (plainText) {
      textElement.textContent = t(message);
      textElement.style.whiteSpace = 'pre-wrap';
    } else {
      textElement.innerHTML = t(message);
      textElement.style.whiteSpace = '';
    }
  }

  // Use an explicit acknowledgement label for connection errors; restore the
  // standard Close label after dismissal so other warning dialogs remain unchanged.
  var acknowledgementLabel = buttonLabel || 'Close';
  $('#closeWarning').attr('data-i18n', acknowledgementLabel).text(t(acknowledgementLabel));

  // Configure the standard single-button state before entering the navigation view,
  // so WarningDialog.enter() selects and focuses the correct button from the outset.
  $('#continueWarning').hide();
  warningDialog.classList.add('single-button');

  // Show the dialog and push the view. Always restore remote/gamepad navigation
  // focus, regardless of the error type or whether diagnostic details are present.
  fadeInUiElement(warningDialogOverlay, 'flex');
  showUiDialog(warningDialog);
  isDialogOpen = true;
  Navigation.push(Views.WarningDialog, undefined, true);

  // Cancel the operation if the Close button is pressed
  $('#closeWarning').off('click');
  $('#closeWarning').on('click', function() {
    console.log('%c[index.js, warningDialog]', 'color: green;', 'Closing app dialog and returning.');
    fadeOutUiElement(warningDialogOverlay);
    closeUiDialog(warningDialog, function() {
      // Keep the single-button width throughout the dialog fade-out.
      warningDialog.classList.remove('single-button');
    });
    isDialogOpen = false;
    $('#closeWarning').attr('data-i18n', 'Close').text(t('Close'));
    Navigation.pop();
    Navigation.switch();
    if (typeof onClose === 'function') onClose();
  });
}

// Show a WoL warning dialog for randomized (locally administered) MAC addresses
function wakeOnLanWarningDialog(host) {
  var warningDialogOverlay = document.querySelector('#warningDialogOverlay');
  var warningDialog = document.querySelector('#warningDialog');

  // Set the title and message
  document.getElementById('warningDialogTitle').innerHTML = t('Wake-on-LAN Warning');
  document.getElementById('warningDialogText').innerHTML = t(
    'The MAC address of %1$s (%2$s) appears to be randomly generated.', escapeHTML(host.hostname), escapeHTML(host.macAddress)) + '<br><br>' +
    t('The Operating System may be using a random MAC address instead of the physical network card address.') + ' ' +
    t('Wake-on-LAN may be unable to wake up the machine since the MAC address does not match the one from the network card.');

  // Show the dialog and push the view
  fadeInUiElement(warningDialogOverlay, 'flex');
  showUiDialog(warningDialog);
  isDialogOpen = true;
  Navigation.push(Views.WarningDialog);

  // Dynamically swap buttons: show "Continue" and change "Close" to act as Cancel
  $('#continueWarning').show();
  // Remove single-button class since both buttons are now visible
  warningDialog.classList.remove('single-button');

  // Cancel — close dialog without sending WoL (using Close button)
  $('#closeWarning').off('click');
  $('#closeWarning').on('click', function() {
    console.log('%c[index.js, wakeOnLanWarningDialog]', 'color: green;', 'Closing WoL warning dialog and returning.');
    fadeOutUiElement(warningDialogOverlay);
    closeUiDialog(warningDialog);
    isDialogOpen = false;
    // Restore the default state for future non-WoL warnings
    $('#continueWarning').hide();
    Navigation.pop();
    Navigation.switch();
  });

  // Continue — send WoL despite randomized MAC
  $('#continueWarning').off('click');
  $('#continueWarning').on('click', function() {
    console.log('%c[index.js, wakeOnLanWarningDialog]', 'color: green;', 'User accepted WoL warning. Sending WoL to ' + host.hostname);
    fadeOutUiElement(warningDialogOverlay);
    closeUiDialog(warningDialog);
    isDialogOpen = false;
    // Restore the default state for future non-WoL warnings
    $('#continueWarning').hide();
    Navigation.pop();
    Navigation.switch();
    // Proceed with sending the WoL packet
    setTimeout(() => autoWolDialog(host, function() {}, function() {}), 100);
  });
}

// Restart the application only after the independent Ambilight service has exited.
function restartApplication() {
  var reload = function() { window.location.reload(true); };
  if (window.moonlightAmbilight && typeof window.moonlightAmbilight.shutdown === 'function') {
    window.moonlightAmbilight.shutdown().then(reload, function(error) {
      console.warn('[ambilight] Could not shut down service before restart:', error);
      reload();
    });
  } else {
    reload();
  }
}

// Show the Restart Moonlight dialog
function restartAppDialog() {
  // Find the existing overlay and dialog elements
  var restartAppDialogOverlay = document.querySelector('#restartAppDialogOverlay');
  var restartAppDialog = document.querySelector('#restartAppDialog');

  // Change the dialog text element to confirm whether the user wants to restart the application
  document.getElementById('restartAppDialogText').innerHTML = t('Are you sure you want to restart Moonlight?');

  // Show the dialog and push the view
  fadeInUiElement(restartAppDialogOverlay, 'flex');
  showUiDialog(restartAppDialog);
  isDialogOpen = true;
  Navigation.push(Views.RestartMoonlightDialog);

  // Cancel the operation if the Cancel button is pressed
  $('#cancelRestartApp').off('click');
  $('#cancelRestartApp').on('click', function() {
    console.log('%c[index.js, restartAppDialog]', 'color: green;', 'Closing app dialog and returning.');
    fadeOutUiElement(restartAppDialogOverlay);
    closeUiDialog(restartAppDialog);
    isDialogOpen = false;
    Navigation.pop();
    Navigation.switch();
  });

  // Restart the application if the Restart button is pressed
  $('#continueRestartApp').off('click');
  $('#continueRestartApp').on('click', function() {
    console.log('%c[index.js, restartAppDialog]', 'color: green;', 'Closing app dialog, restarting application, and returning.');
    fadeOutUiElement(restartAppDialogOverlay);
    closeUiDialog(restartAppDialog);
    isDialogOpen = false;
    Navigation.pop();
    restartApplication();
  });
}

// Show the required Restart Moonlight dialog
function requiredRestartAppDialog() {
  // Find the existing overlay and dialog elements
  var restartAppDialogOverlay = document.querySelector('#restartAppDialogOverlay');
  var restartAppDialog = document.querySelector('#restartAppDialog');

  // Change the dialog text element to inform the user that a restart is required
  document.getElementById('restartAppDialogText').innerHTML = t('In order for your changes to take effect, a restart of the application is required.<br><br>Would you like to proceed with the restart?');

  // Show the dialog and push the view
  fadeInUiElement(restartAppDialogOverlay, 'flex');
  showUiDialog(restartAppDialog);
  isDialogOpen = true;
  Navigation.push(Views.RestartMoonlightDialog);

  // Cancel the operation if the Cancel button is pressed
  $('#cancelRestartApp').off('click');
  $('#cancelRestartApp').on('click', function() {
    console.log('%c[index.js, restartAppDialog]', 'color: green;', 'Closing app dialog and returning.');
    fadeOutUiElement(restartAppDialogOverlay);
    closeUiDialog(restartAppDialog);
    isDialogOpen = false;
    Navigation.pop();
    Navigation.switch();
  });

  // Restart the application if the Restart button is pressed
  $('#continueRestartApp').off('click');
  $('#continueRestartApp').on('click', function() {
    console.log('%c[index.js, restartAppDialog]', 'color: green;', 'Closing app dialog, restarting application, and returning.');
    fadeOutUiElement(restartAppDialogOverlay);
    closeUiDialog(restartAppDialog);
    isDialogOpen = false;
    Navigation.pop();
    restartApplication();
  });
}

// Stop the independent Ambilight service before returning to Smart Hub.
function exitApplication() {
  var application = tizen.application.getCurrentApplication();
  var exit = function() {
    try { application.exit(); }
    catch (error) {
      console.error('%c[index.js, exitApplication]', 'color: red;', 'Could not exit Moonlight:', error);
    }
  };

  if (!window.moonlightAmbilight || typeof window.moonlightAmbilight.shutdown !== 'function') {
    exit();
    return;
  }

  var exitTimeout = window.setTimeout(exit, 2500);
  window.moonlightAmbilight.shutdown().then(function() {
    window.clearTimeout(exitTimeout);
    exit();
  }).catch(function(error) {
    console.warn('[ambilight] Could not shut down service before exit:', error);
    window.clearTimeout(exitTimeout);
    exit();
  });
}

// Show the Exit Moonlight dialog
function exitAppDialog() {
  // Find the existing overlay and dialog elements
  var exitAppOverlay = document.querySelector('#exitAppDialogOverlay');
  var exitAppDialog = document.querySelector('#exitAppDialog');

  // Show the dialog and push the view
  fadeInUiElement(exitAppOverlay, 'flex');
  showUiDialog(exitAppDialog);
  isDialogOpen = true;
  Navigation.push(Views.ExitMoonlightDialog);

  // Cancel the operation if the Cancel button is pressed
  $('#cancelExitApp').off('click');
  $('#cancelExitApp').on('click', function() {
    console.log('%c[index.js, exitAppDialog]', 'color: green;', 'Closing app dialog and returning');
    fadeOutUiElement(exitAppOverlay);
    closeUiDialog(exitAppDialog);
    isDialogOpen = false;
    Navigation.pop();
    Navigation.change(Views.Hosts);
  });

  // Exit the application if the Exit button is pressed
  $('#continueExitApp').off('click');
  $('#continueExitApp').on('click', function() {
    console.log('%c[index.js, exitAppDialog]', 'color: green;', 'Closing app dialog, exiting application, and returning to Smart Hub.');
    fadeOutUiElement(exitAppOverlay);
    closeUiDialog(exitAppDialog);
    isDialogOpen = false;
    Navigation.pop();
    exitApplication();
  });
}

// Puts the CSS style for current app on the app that's currently running
// and puts the CSS style for non-current app on the apps that aren't running
// this requires a hot-off-the-host `api`, and the appId we're going to stylize
// the function was made like this so that we can remove duplicated code, but
// not do N*N stylization of the box art, or make the code not flow very well
function stylizeBoxArts(freshApi, appsList) {
  // Check each app in the list and apply CSS styling based on whether it's currently running or not
  appsList.forEach(function(app) {
    var appBox = document.querySelector('#game-container-' + app.id);
    if (!appBox) {
      console.warn('%c[index.js, stylizeBoxArts]', 'color: green;', 'Warning: No box art found for appId: ' + app.id);
      return;
    }
    // If the game is currently running, then apply CSS stylization
    if (freshApi.currentGame === app.id) {
      appBox.classList.add('current-game-active');
      appBox.title = app.title + t(' (Running)');
    } else {
      appBox.classList.remove('current-game-active');
      appBox.title = app.title;
    }
  });
}

// Sort the app titles
function sortTitles(list, sortOrder) {
  return list.sort((a, b) => {
    // Ascending order (A - Z)
    if (sortOrder === 'ASC') {
      return a.title.localeCompare(b.title, undefined, { numeric: true, sensitivity: 'base' });
    }

    // Descending order (Z - A)
    if (sortOrder === 'DESC') {
      return b.title.localeCompare(a.title, undefined, { numeric: true, sensitivity: 'base' });
    }

    return 0;
  });
}

function sortAppsForHost(host, appList) {
  var list = Array.isArray(appList) ? appList.slice() : [];
  var titleSwitch = document.getElementById('sortAppsListSwitch');
  var titleSortOrder = titleSwitch && titleSwitch.checked ? 'DESC' : 'ASC';
  var usageSwitch = document.getElementById('sortAppsByUsageSwitch');
  if (usageSwitch && usageSwitch.checked) {
    var cachedHost = host && host.serverUid && _previewApps[host.serverUid];
    var counts = Object.create(null);
    if (cachedHost && Array.isArray(cachedHost.apps)) {
      cachedHost.apps.forEach(function(app) {
        if (!app) return;
        var count = Number(app.runCount);
        counts[String(app.id)] = Number.isFinite(count) && count > 0 ? count : 0;
      });
    }
    return list.sort(function(a, b) {
      var difference = (counts[String(b.id)] || 0) - (counts[String(a.id)] || 0);
      if (difference) return difference;

      // When usage counts match, retain the user's selected title sort direction.
      var titleA = String(a.title || '');
      var titleB = String(b.title || '');
      if (titleSortOrder === 'DESC') {
        return titleB.localeCompare(titleA, undefined, { numeric: true, sensitivity: 'base' });
      }
      return titleA.localeCompare(titleB, undefined, { numeric: true, sensitivity: 'base' });
    });
  }
  return sortTitles(list, titleSortOrder);
}

// Handle layout elements when displaying the Apps view
function showAppsMode(keepInteractionLocked, afterShown, deferPostTransitionActions) {
  if (!deferPostTransitionActions) updateAmbientBackgroundActivation(true);
  console.log('%c[index.js, showAppsMode]', 'color: green;', 'Entering "Show Apps" mode.');
  $('#main-content').removeClass('settings-view-active');

  hideStreamDiagnosticsLayer();
  var appsTitle = api && api.hostname
    ? t('Apps in %1$s', api.hostname)
    : t('Apps');
  $('#header-title').text(appsTitle);
  $('#header-logo').show();
  $('#main-header').show();
  $('.mdl-layout__content').show();
  $('#goBackBtn').show();
  $('#main-content').children().not('#listener, #wasmSpinner').show();
  $('#hosts-carousel-viewport').hide();
  $('#host-grid').hide();
  $('#settings-list').hide();
  // Keep an already-visible, locked Apps grid in place during an in-place refresh.
  // Only use the full fade transition when entering Apps from another view.
  var preserveVisibleAppGrid = appListInteractionLocked && $('#game-grid').children('.game-container').length > 0;
  var finishAppsGridReveal = function() {
    if (!deferPostTransitionActions) clearViewLoadingSnackbarTimer();
    if (appListInteractionLocked) {
      if (!keepInteractionLocked) unlockAppListInteraction();
    } else {
      Navigation.switch();
    }
  };
  if (preserveVisibleAppGrid) {
    finishAppsGridReveal();
  } else {
    $('#game-grid').stop(true, true).hide().fadeIn(UI_FADE_DURATION_MS, finishAppsGridReveal);
  }
  $('.nav-menu-parent').hide();
  $('#updateAppBtn').hide();
  $('#settingsBtn').hide();
  $('#refreshHostsBtn').hide();
  $('#supportBtn').hide();
  $('#restoreDefaultsBtn').hide();
  updateGamepadTestButtonVisibility();
  $('#main-content').removeClass('fullscreen');
  $('#listener').removeClass('fullscreen');
  $('body').css({ background: '', backgroundColor: '' });

  showUiLayer('main-ui-layer', afterShown);
  if (!deferPostTransitionActions) {
    isInGame = false;
    if (typeof setNavigationSoundEnabled === 'function') setNavigationSoundEnabled(navigationSoundPreferenceEnabled);
  }
  if (!deferPostTransitionActions && startupUpdateCheckPending && startupUpdateCheckTimeout === null) {
    startupUpdateCheckTimeout = window.setTimeout(function() {
      startupUpdateCheckTimeout = null;
      checkForAppUpdatesAtStartup();
    }, 0);
  }
  if (!deferPostTransitionActions) {
    if (!appListInteractionLocked) Navigation.start();
  }
  if (!deferPostTransitionActions && typeof syncScreensaverTimer === 'function') syncScreensaverTimer();
}

// Complete the non-visual Apps-mode work only after the stream transition has disappeared.
function finishAppsModeAfterStreamTransition(skipNavigationAudioRestore) {
  isInGame = false;
  if (typeof syncScreensaverTimer === 'function') syncScreensaverTimer();
  if (!skipNavigationAudioRestore && typeof setNavigationSoundEnabled === 'function') {
    setNavigationSoundEnabled(navigationSoundPreferenceEnabled);
  }
  if (startupUpdateCheckPending && startupUpdateCheckTimeout === null) {
    startupUpdateCheckTimeout = window.setTimeout(function() {
      startupUpdateCheckTimeout = null;
      checkForAppUpdatesAtStartup();
    }, 0);
  }
  if (!appListInteractionLocked) Navigation.start();
  flushDeferredMainUiActions();
}

// Show the Apps grid
function showApps(host, options) {
  return new Promise((resolve, reject) => {
    var operationToken = options && options.operationToken;
    var isOperationCancelled = function() {
      return !!(operationToken && operationToken.cancelled);
    };
    if (operationToken) {
      operationToken.cancel = function() {
        if (operationToken.cancelled) return;
        operationToken.cancelled = true;
        var cancellationError = new Error('Application list operation was cancelled.');
        cancellationError.name = 'AbortError';
        reject(cancellationError);
      };
    }
    // Safety checking should happen before attempting to show the app list
    if (!host || !host.paired) {
      console.error('%c[index.js, showApps]', 'color: green;', 'Error: Unable to initialize the host properly! Host object: ', host);
      reject('Unable to initialize the host properly');
      return;
    } else {
      console.log('%c[index.js, showApps]', 'color: green;', 'Current host object: \n', host, '\n' + host.toString()); // Logging both object (for console) and toString-ed object (for text logs)
    }

    // Stop navigation while transitioning from Hosts to Apps.
    Navigation.stop();
    if (typeof window.abortSubnetScan === 'function') window.abortSubnetScan();

    // Normal navigation waits one second before showing feedback. Stream recovery
    // already displays a persistent snackbar from refreshHostAndReturnToApps().
    if (!(options && options.suppressLoadingSnackbar)) {
      if (options && options.showLoadingSnackbarImmediately) {
        if (!persistentSnackbarVisible) snackbarLogPersistent('Loading Apps...');
      } else {
        scheduleViewLoadingSnackbar('Loading Apps...');
      }
    }

    // Fade out the Hosts viewport so its cards and overflow indicators disappear together.
    $('#hosts-carousel-viewport').stop(true, true).fadeOut(UI_FADE_DURATION_MS);

    // Keep the current cards in place during a locked refresh (stream recovery / app close).
    // Normal host navigation still starts with a clean grid.
    if (!appListInteractionLocked) {
      $('#game-grid').empty();
      $('div.game-container').remove();
    }

    setTimeout(() => {
      if (isOperationCancelled()) return;
      var appListRequest = (options && options.forceRefreshAppList)
        ? host.getAppListWithCacheFlush()
        : host.getAppList();
      appListRequest.then(function(appList) {
        if (isOperationCancelled()) return;
        // Show the game grid section
        $('#game-grid').show();

        if (appList.length == 0) {
          // Persist even an empty successful result so stale application names are discarded.
          cacheHostAppList(host, appList);
          updatePreviewData();
          console.warn('%c[index.js, showApps]', 'Warning: Your app list is empty. Please add some apps to your list!');
          var emptyAppListImg = new Image();
          emptyAppListImg.src = 'static/res/applist_empty.svg';
          $('#game-grid').html(emptyAppListImg);
          if (!(options && options.suppressEmptyListSnackbar)) {
            snackbarLogLong('Your list is currently empty. Please add your favorite apps to the list.');
          }
          clearViewLoadingSnackbarTimer();
          // Navigate to the Apps view
          showAppsMode(!!(options && options.keepInteractionLocked));
          // Stream recovery excludes this host from the global polling restart.
          // With no apps there are no box-art downloads to trigger the usual resume.
          beginBackgroundPollingOfHost(host);
          resolve();
          return;
        }

        // Apply the selected app ordering before caching and rendering the list.
        const sortedAppList = sortAppsForHost(host, appList);

        if (appListInteractionLocked) {
          // Reconcile by app ID instead of tearing down the entire visible list.
          const grid = document.getElementById('game-grid');
          const desiredIds = new Set(sortedAppList.map(function(app) {
            return 'game-container-' + app.id;
          }));
          Array.from(grid.querySelectorAll('.game-container')).forEach(function(card) {
            if (!desiredIds.has(card.id)) card.remove();
          });
          sortedAppList.forEach(function(app) {
            const card = document.getElementById('game-container-' + app.id);
            if (!card) return;
            const title = card.querySelector('.game-text');
            if (title && title.textContent !== app.title) {
              title.textContent = app.title;
              title.classList.toggle('disable-animation', app.title.length <= 20);
            }
          });
        }

        // Keep the host's app ID/title mapping available independently of Smart Hub support.
        cacheHostAppList(host, sortedAppList);

        // Pause background polling during box art downloads to prevent
        // the polling /serverinfo request from being queued behind 40+
        // concurrent image downloads, which would cause a 5-second timeout
        // and trigger cancelRequest, killing all in-flight downloads.
        endBackgroundPollingOfHost(host);

        var boxArtPromises = [];
        
        // Reset preview promises for this showApps invocation
        window.previewPromises = [];

        sortedAppList.forEach(function(app) {
          // Existing cards keep their DOM and artwork during an in-place refresh.
          if (appListInteractionLocked && document.getElementById('game-container-' + app.id)) return;

          // Double clicking the button will cause multiple box arts to appear.
          // To mitigate this, we ensure that we don't add a duplicate box art.
          // This isn't perfect: there's lots of RTTs before the logic prevents anything.
          if ($('#game-container-' + app.id).length === 0) {
            // Create the game container with the appropriate attributes for the game card
            var gameContainer = $('<div>', {
              id: 'game-container-' + app.id,
              class: 'game-container mdl-card mdl-shadow--4dp',
              role: 'link',
              tabindex: 0,
              'aria-label': app.title
            });

            // Create the game cell to serve as a holder for the game box
            var gameCell = $('<div>', {
              id: 'game-' + app.id,
              class: 'mdl-card__title mdl-card--expand'
            });

            // Create the game title wrapper to hold the game title text
            var gameTitle = $('<div>', {
              class: 'game-title mdl-card__title-text'
            });

            // Create the game text placeholder that will contain the game name
            var gameText = $('<span>', {
              class: 'game-text',
              text: app.title
            });

            // Append the game text to the game title wrapper
            gameTitle.append(gameText);

            // Handle animation state based on game title text length
            if (app.title.length <= 20) {
              // For game title text of 20 characters or less, disable scrolling text animation
              gameText.addClass('disable-animation');
            } else {
              // For game title text longer than 20 characters, enable scrolling text animation
              gameText.removeClass('disable-animation');
            }

            // Append the game title to the game cell
            gameCell.append(gameTitle);

            // Append the game cell to the game container
            gameContainer.append(gameCell);

            // Attach the click event listener to the game container
            gameContainer.off('click');
            gameContainer.on('click', function() {
              // Prevent further clicks
              if (isClickPrevented) {
                return;
              }
              // Block subsequent clicks immediately
              isClickPrevented = true;
              // A click on the currently running app offers Resume or Stop instead of
              // immediately reconnecting to the existing stream.
              if (host.currentGame == app.id) {
                showRunningAppDialog(host, app.id, app.title);
              } else {
                startGame(host, app.id);
              }
              // Reset the click flag after 2 second delay
              setTimeout(() => isClickPrevented = false, 2000);
            });

            // Append the game container to the game grid
            $('#game-grid').append(gameContainer);
          }
          // Load box art
          var boxArtPlaceholderImg = new Image();
          var appEntry = (_isSmartHubSupported && _previewApps[host.serverUid]) ? _previewApps[host.serverUid].apps.find(function(a) {
            return a.id === app.id; 
          }) : null;
          var boxArtPromise = new Promise(function(resolveBoxArt) {
            host.getBoxArt(app.id, _isSmartHubSupported).then(function(resolvedPromise) {
              boxArtPlaceholderImg.src = resolvedPromise;
              // The resolvedPromise is now the absolute file URI (or data URL if it failed to save).
              if (_isSmartHubSupported && _previewApps[host.serverUid] && appEntry) {
                // Resolve real TV IP because Smart Hub might block 127.0.0.1
                var tvIp = '127.0.0.1';
                try {
                  if (typeof webapis !== 'undefined' && webapis.network) {
                    tvIp = webapis.network.getIp();
                  }
                } catch(e) {
                  console.log('%c[index.js, showApps]', 'color: green;', 'Failed to get TV IP: ', e);
                }

                // Use deterministic filename so the local HTTP server route stays stable
                var filename = 'preview-' + app.id + '.jpg';
                var cacheBuster = '?v=' + Date.now();

                // Determine local path from resolvedPromise if it's a file URI
                if (resolvedPromise.startsWith('file://')) {
                  var localPngPath = resolvedPromise.replace('file://', '');
                  appEntry.txtPath = localPngPath;
                  appEntry.imageUri = 'http://' + tvIp + ':8888/' + filename + cacheBuster;
                  resolveBoxArt();
                } else {
                  try {
                    var documentsPath = tizen.filesystem.toURI('documents').replace('file://', '');
                    appEntry.txtPath = documentsPath + '/' + filename;
                    appEntry.imageUri = 'http://' + tvIp + ':8888/' + filename + cacheBuster;
                  } catch(err) {
                    appEntry.txtPath = '/opt/usr/home/owner/content/Documents/' + filename;
                    appEntry.imageUri = 'http://' + tvIp + ':8888/' + filename + cacheBuster;
                  }
                  resolveBoxArt();
                }

                // Early return to prevent the fallback synchronous resolveBoxArt from firing
                return;
              }
              resolveBoxArt();
            }, function(failedPromise) {
              console.error('%c[index.js, showApps]', 'color: green;', 'Error: Failed to retrieve box art for app ID: ' + app.id + '. Returned value was: ' + failedPromise + '. Host object: ', host, '\n' + host.toString()); // Logging both object (for console) and toString-ed object (for text logs)
              boxArtPlaceholderImg.src = 'static/res/placeholder_error.svg';
              resolveBoxArt();
            });
          });

          boxArtPlaceholderImg.onload = e => boxArtPlaceholderImg.classList.add('fade-in');
          $(gameContainer).append(boxArtPlaceholderImg);
          boxArtPromises.push(boxArtPromise);
        });

        if (appListInteractionLocked) {
          // Reorder only where necessary, retaining DOM nodes and loaded artwork for unchanged apps.
          const grid = document.getElementById('game-grid');
          sortedAppList.forEach(function(app, index) {
            const card = document.getElementById('game-container-' + app.id);
            const currentAtIndex = grid.children[index] || null;
            if (card && card !== currentAtIndex) grid.insertBefore(card, currentAtIndex);
          });
        }

        // Check all game containers for the current running app and apply CSS styling accordingly
        stylizeBoxArts(host, sortedAppList);

        var settledPromises = boxArtPromises.map(function(p) {
          return p.catch(function(e) {
            console.error('%c[index.js, showApps]', 'color: green;', 'Error: Box art promise rejected with error: ', e);
            return e;
          });
        });

        var appToSelect = (host.currentGame != 0) ? host.currentGame : localStorage.getItem('lastOpenedApp_' + host.serverUid);
        if (appToSelect && window.Views && Views.Apps && Views.Apps.view) {
          var children = Views.Apps.view.func();
          for (var i = 0; i < children.length; i++) {
            if (children[i].id === 'game-container-' + appToSelect) {
              Views.Apps.view.index = i;
              break;
            }
          }
        }

        // Navigate to the Apps view without starting diagnostic audio playback.
        showAppsMode(!!(options && options.keepInteractionLocked));
        clearViewLoadingSnackbarTimer();
        if (!(options && options.suppressLoadingSnackbar)) dismissPersistentSnackbar();
        resolve();

        Promise.all(settledPromises).then(function() {
          if (isOperationCancelled()) return;
          // Resume background polling now that all box art downloads are complete
          beginBackgroundPollingOfHost(host);

          // Wait for all Smart Hub Preview JPEGs to finish encoding and saving to disk
          // before sending the updated data to the background service.
          var previewsDone = window.previewPromises || [];
          Promise.all(previewsDone).then(function() {
            if (isOperationCancelled()) return;
            savePreviewApps();
            updatePreviewData();
          });
        });
      }, function(failedAppList) {
        if (isOperationCancelled()) return;
        clearViewLoadingSnackbarTimer();
        console.error('%c[index.js, showApps]', 'color: green;', 'Error: Failed to get app list from ' + host.hostname + '. Host object: ', host, '\n' + host.toString()); // Logging both object (for console) and toString-ed object (for text logs)
        var errorAppListImg = new Image();
        errorAppListImg.src = 'static/res/applist_error.svg';
        $('#game-grid').html(errorAppListImg);
        if (!(options && options.suppressLoadingSnackbar)) {
          snackbarLogLong('Unable to retrieve your list of apps at this time. Please refresh the list of apps or try again later!');
        }

        // During stream recovery, do not expose an error Apps screen or unlock the stale
        // grid. Let the caller's recovery handler return to Hosts in one consistent step.
        if (!appListInteractionLocked) {
          showAppsMode(!!(options && options.keepInteractionLocked));
        }
        reject(failedAppList);
      });
    }, 500);
  });
}

// Offer a direct choice when the selected app is already running on this host.
function showRunningAppDialog(host, appId, appTitle) {
  if (window._streamTerminationRecoveryInProgress || isDialogOpen) return;

  var overlay = document.getElementById('runningAppDialogOverlay');
  var dialog = document.getElementById('runningAppDialog');
  var message = document.getElementById('runningAppDialogText');
  message.textContent = t('%1$s is already running on the host.', appTitle);

  fadeInUiElement(overlay, 'flex');
  showUiDialog(dialog);
  isDialogOpen = true;
  Navigation.push(Views.RunningAppDialog);

  function closeDialog(restoreFocus) {
    fadeOutUiElement(overlay);
    closeUiDialog(dialog);
    isDialogOpen = false;
    Navigation.pop();
    if (window.cancelRunningAppDialog === cancelRunningAppDialog) {
      delete window.cancelRunningAppDialog;
    }
    if (restoreFocus) Navigation.switch();
  }

  // Back/Escape cancels this choice without resuming or stopping the remote app.
  function cancelRunningAppDialog() {
    closeDialog(true);
  }
  window.cancelRunningAppDialog = cancelRunningAppDialog;

  $('#resumeRunningApp').off('click').on('click', function() {
    closeDialog(false);
    startGame(host, appId);
  });

  $('#stopRemoteApp').off('click').on('click', function() {
    closeDialog(false);
    // Match the existing Quit Running App action, without asking for confirmation twice.
    stopGame(api, function() {
      setTimeout(function() { Navigation.switch(); }, 3000);
    });
  });
}

// Show a confirmation with the Quit App dialog before stopping the running app
function quitAppDialog() {
  // Stream termination recovery owns the Apps UI until the refreshed list is ready.
  if (window._streamTerminationRecoveryInProgress) return;

  if (api.currentGame === 0) {
    // If no app is running, show snackbar message
    snackbarLog('No app is currently running.');
    return;
  } else {
    withOperationTimeout(api.getAppById(api.currentGame), 10000, 'Running application lookup for quit confirmation').then(function(currentGame) {
      // Find the existing overlay and dialog elements
      var quitAppOverlay = document.querySelector('#quitAppDialogOverlay');
      var quitAppDialog = document.querySelector('#quitAppDialog');

      // Change the dialog text element to include the game title
      document.getElementById('quitAppDialogText').innerHTML = t('Are you sure you want to quit %1$s? All unsaved data will be lost.', escapeHTML(currentGame.title));
      
      // Show the dialog and push the view
      fadeInUiElement(quitAppOverlay, 'flex');
      showUiDialog(quitAppDialog);
      isDialogOpen = true;
      Navigation.push(Views.QuitAppDialog);

      // Cancel the operation if the Cancel button is pressed
      $('#cancelQuitApp').off('click');
      $('#cancelQuitApp').on('click', function() {
        console.log('%c[index.js, quitAppDialog]', 'color: green;', 'Closing app dialog and returning.');
        fadeOutUiElement(quitAppOverlay);
        closeUiDialog(quitAppDialog);
        isDialogOpen = false;
        Navigation.pop();
        Navigation.switch();
      });

      // Quit the running app if the Continue button is pressed
      $('#continueQuitApp').off('click');
      $('#continueQuitApp').on('click', function() {
        console.log('%c[index.js, quitAppDialog]', 'color: green;', 'Quitting game, closing app dialog, and returning.');
        fadeOutUiElement(quitAppOverlay);
        closeUiDialog(quitAppDialog);
        isDialogOpen = false;
        Navigation.pop();
        stopGame(api, function() {
          // After stopping the game, set focus back to the 'Quit Running App' button
          setTimeout(() => Navigation.switch(), 3000);
        });
      });
    }).catch(function(error) {
      console.error('%c[index.js, quitAppDialog]', 'color: red;', 'Could not retrieve the currently running application:', error);
      snackbarLogLong('Could not retrieve the currently running application.');
    });
  }
}

// Render the transition starfield directly on a canvas. No video decoder or
// continuously running animation is kept alive while the transition is hidden.
var streamTransitionCanvas = null;
var streamTransitionContext = null;
var streamTransitionStars = [];
var streamTransitionAnimationFrame = null;
var streamTransitionVisible = false;
var streamTransitionBackgroundEnabled = true;
const AMBIENT_BACKGROUND_PRESETS = {
  'waves': 'waves-active',
  'bubbles': 'bubbles-active',
  'symbols': 'symbols-active',
  'none': null
};
var ambientBackgroundPreset = 'waves';
var ambientBackgroundPreferenceLoaded = false;
var streamTransitionHiding = false;
var streamTransitionAfterHiddenCallbacks = [];
var streamTransitionFirstFrameCallback = null;
var streamTransitionRevealTimeout = null;
var streamTransitionTeardownTimeout = null;
var streamTransitionHideLayerTimeout = null;
var streamTransitionStatusTimeout = null;
var STREAM_TRANSITION_STAR_COUNT = 2000;
var STREAM_TRANSITION_MAX_DEPTH = 1500;
var STREAM_TRANSITION_SPEED = 5;

function createStreamTransitionBackground() {
  return document.getElementById('stream-transition-frame');
}

function resetStreamTransitionStar(star, randomDepth) {
  var width = streamTransitionCanvas.width;
  var angle = Math.random() * Math.PI * 2;
  var distance = Math.sqrt(Math.random()) * (width / 2);
  star.x = Math.cos(angle) * distance;
  star.y = Math.sin(angle) * distance;
  star.z = randomDepth ? Math.random() * STREAM_TRANSITION_MAX_DEPTH : STREAM_TRANSITION_MAX_DEPTH;
  star.size = (1 - distance / (width / 2)) * 0.1 + 0.5;
}

function initializeStreamTransitionStars() {
  streamTransitionStars = [];
  if (!streamTransitionCanvas || streamTransitionCanvas.width <= 0) return;

  for (var i = 0; i < STREAM_TRANSITION_STAR_COUNT; i++) {
    var star = {};
    resetStreamTransitionStar(star, true);
    streamTransitionStars.push(star);
  }
}

function resizeStreamTransitionBackground() {
  if (!streamTransitionVisible || !streamTransitionCanvas) return;

  streamTransitionCanvas.width = Math.max(1, window.innerWidth);
  streamTransitionCanvas.height = Math.max(1, window.innerHeight);
  initializeStreamTransitionStars();
}

function animateStreamTransitionBackground() {
  if (!streamTransitionVisible || !streamTransitionCanvas || !streamTransitionContext) {
    streamTransitionAnimationFrame = null;
    return;
  }

  var canvas = streamTransitionCanvas;
  var ctx = streamTransitionContext;
  var width = canvas.width;
  var height = canvas.height;

  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, width, height);
  ctx.beginPath();

  for (var i = 0; i < streamTransitionStars.length; i++) {
    var star = streamTransitionStars[i];
    star.z -= STREAM_TRANSITION_SPEED * (2 - star.z / STREAM_TRANSITION_MAX_DEPTH);
    if (star.z <= 1) resetStreamTransitionStar(star, false);

    var x = ((star.x / star.z) * width) / 2 + width / 2;
    var y = ((star.y / star.z) * height) / 2 + height / 2;
    var radius = (1 - star.z / STREAM_TRANSITION_MAX_DEPTH) * star.size * 3;

    if (radius > 0.1 && x > -radius && x < width + radius && y > -radius && y < height + radius) {
      // Append all stars to one path to minimize canvas draw calls on TV hardware.
      ctx.moveTo(x + radius, y);
      ctx.arc(x, y, radius, 0, Math.PI * 2);
    }
  }

  ctx.fillStyle = '#fff';
  ctx.fill();

  if (streamTransitionFirstFrameCallback) {
    var callback = streamTransitionFirstFrameCallback;
    streamTransitionFirstFrameCallback = null;
    try {
      callback();
    } catch (error) {
      console.warn('%c[index.js, animateStreamTransitionBackground]', 'color: green;', 'Transition visibility callback failed:', error);
    }
  }

  streamTransitionAnimationFrame = window.requestAnimationFrame(animateStreamTransitionBackground);
}

var streamEncryptionStatusPollTimeout = null;
var streamEncryptionStatusPollingActive = false;
var streamEncryptionStatusVisibleAt = null;
// Cached once per stream negotiation and reused by every UI surface.
var currentStreamEncryptionStatus = null;
const STREAM_ENCRYPTION_STATUS_MIN_VISIBLE_MS = 3000;
// hideStreamTransitionBackground() spends this long fading status and then the transition layer.
const STREAM_TRANSITION_HIDE_ANIMATION_MS = UI_FADE_DURATION_MS + STREAM_TRANSITION_ELEMENT_OFFSET_MS + 500;

// The video-ready path uses two delayed steps before hiding the startup transition.
// Keep both handles so a later termination can cancel that stale hide before showing
// the closing transition. This coordinates UI animation only; it does not monitor or
// determine stream/session state.
var streamVideoReadyHideStartTimeout = null;
var streamVideoReadyHideTimeout = null;
var streamVideoReadyHideGeneration = 0;

function cancelStreamVideoReadyTransitionHide() {
  streamVideoReadyHideGeneration++;
  if (streamVideoReadyHideStartTimeout !== null) {
    window.clearTimeout(streamVideoReadyHideStartTimeout);
    streamVideoReadyHideStartTimeout = null;
  }
  if (streamVideoReadyHideTimeout !== null) {
    window.clearTimeout(streamVideoReadyHideTimeout);
    streamVideoReadyHideTimeout = null;
  }
}

function scheduleStreamTransitionHideAfterVideoReady() {
  cancelStreamVideoReadyTransitionHide();
  var generation = streamVideoReadyHideGeneration;
  streamVideoReadyHideStartTimeout = window.setTimeout(function() {
    streamVideoReadyHideStartTimeout = null;
    if (generation !== streamVideoReadyHideGeneration) return;
    if (typeof hideStreamTransitionBackground !== 'function') return;

    var elapsed = streamEncryptionStatusVisibleAt === null
      ? STREAM_ENCRYPTION_STATUS_MIN_VISIBLE_MS
      : Date.now() - streamEncryptionStatusVisibleAt;
    var waitForEncryptionStatus = Math.max(0,
      STREAM_ENCRYPTION_STATUS_MIN_VISIBLE_MS - elapsed - STREAM_TRANSITION_HIDE_ANIMATION_MS);
    streamVideoReadyHideTimeout = window.setTimeout(function() {
      streamVideoReadyHideTimeout = null;
      if (generation !== streamVideoReadyHideGeneration) return;
      hideStreamTransitionBackground(function() {
        if (typeof onPerformanceStatsStreamTransitionHidden === 'function') {
          onPerformanceStatsStreamTransitionHidden();
        }
      });
    }, waitForEncryptionStatus);
  }, 200);
}

function resetStreamEncryptionStatus() {
  streamEncryptionStatusVisibleAt = null;
  currentStreamEncryptionStatus = null;
  stopStreamEncryptionStatusPolling();
  ['streamEncryptionStatus', 'performanceStatsEncryptionStatus'].forEach(function(id) {
    var statusElement = document.getElementById(id);
    if (statusElement) statusElement.style.display = 'none';
  });
  ['streamEncryptionIcon', 'performanceStatsEncryptionIcon'].forEach(function(id) {
    var iconElement = document.getElementById(id);
    if (iconElement) iconElement.innerHTML = '';
  });
  ['streamEncryptionMessage', 'performanceStatsEncryptionMessage'].forEach(function(id) {
    var messageElement = document.getElementById(id);
    if (messageElement) messageElement.textContent = '';
  });
}

function stopStreamEncryptionStatusPolling() {
  streamEncryptionStatusPollingActive = false;
  if (streamEncryptionStatusPollTimeout !== null) {
    window.clearTimeout(streamEncryptionStatusPollTimeout);
    streamEncryptionStatusPollTimeout = null;
  }
}

function renderStreamEncryptionStatus(status, targetIds) {
  var statusTargets = [
    {
      status: document.getElementById('streamEncryptionStatus'),
      icon: document.getElementById('streamEncryptionIcon'),
      message: document.getElementById('streamEncryptionMessage'),
      className: 'stream-encryption-status'
    },
    {
      status: document.getElementById('performanceStatsEncryptionStatus'),
      icon: document.getElementById('performanceStatsEncryptionIcon'),
      message: document.getElementById('performanceStatsEncryptionMessage'),
      className: 'stream-encryption-status performance-stats-encryption-status'
    }
  ].filter(function(target) {
    return target.status && target.icon && target.message &&
      (!targetIds || targetIds.indexOf(target.status.id) !== -1);
  });
  if (!statusTargets.length) return;

  // Classify connection security using only the media streams. Control-channel
  // encryption is negotiated independently and does not reflect the host's
  // LAN/WAN media-encryption setting.
  var videoEncrypted = (status & 0x01) !== 0;
  var audioEncrypted = (status & 0x02) !== 0;
  var allEncrypted = videoEncrypted && audioEncrypted;
  var statusClass, iconName, message;

  if (allEncrypted) {
    iconName = 'lock';
    statusClass = 'encrypted';
    message = t('Using a secure connection');
  } else if (videoEncrypted || audioEncrypted) {
    iconName = 'privacy_tip';
    statusClass = 'partially-encrypted';
    var unencryptedMask = (!videoEncrypted ? 1 : 0) | (!audioEncrypted ? 2 : 0);
    var warningKeys = {
      1: 'Partial encryption warning: video',
      2: 'Partial encryption warning: audio',
      3: 'Partial encryption warning: video and audio'
    };
    message = t(warningKeys[unencryptedMask]);
  } else {
    iconName = 'lock_open';
    statusClass = 'unencrypted';
    message = t('Using an unencrypted connection');
  }

  statusTargets.forEach(function(target) {
    target.status.className = target.className + ' ' + statusClass;
    target.icon.textContent = iconName;
    target.message.textContent = message;

    if (target.status.id === 'performanceStatsEncryptionStatus') {
      target.status.style.display = 'flex';
      return;
    }

    // The transition status must remain hidden until the transition controller reveals it.
    // If the encryption result arrives late, reveal it only after the initial status delay,
    // and never allow polling to bring it back during the fade-out.
    var transitionLayer = document.getElementById('stream-transition-layer');
    if (!transitionLayer || getComputedStyle(transitionLayer).display === 'none' ||
        streamTransitionHiding || streamTransitionStatusTimeout !== null) {
      return;
    }

    streamEncryptionStatusVisibleAt = Date.now();
    fadeInUiElement(target.status, 'flex');
  });
}
function pollStreamEncryptionStatus() {
  streamEncryptionStatusPollTimeout = null;
  if (!streamEncryptionStatusPollingActive) return;
  if (typeof Module !== 'undefined' && typeof Module.getEncryptionStatus === 'function') {
    var status = Module.getEncryptionStatus();
    if (typeof status === 'number' && status >= 0) {
      currentStreamEncryptionStatus = status;
      renderStreamEncryptionStatus(currentStreamEncryptionStatus);
      stopStreamEncryptionStatusPolling();
      return;
    }
  }

  // The C core publishes the status after constructing the RTSP stream configuration.
  streamEncryptionStatusPollTimeout = window.setTimeout(pollStreamEncryptionStatus, 100);
}

function startStreamEncryptionStatusPolling() {
  stopStreamEncryptionStatusPolling();
  streamEncryptionStatusPollingActive = true;
  pollStreamEncryptionStatus();
}

function showStreamTransitionBackground(onVisible) {
  // A new transition supersedes any delayed hide requested by the previous stream's
  // video-ready callback. In particular, termination must retain the closing layer.
  cancelStreamVideoReadyTransitionHide();

  // The stream menu must never remain visible above a startup or shutdown transition.
  if ($('#streamMenuDialogOverlay').length > 0) closeStreamMenuDialog(false);

  if (streamTransitionRevealTimeout !== null) { window.clearTimeout(streamTransitionRevealTimeout); streamTransitionRevealTimeout = null; }
  if (streamTransitionStatusTimeout !== null) { window.clearTimeout(streamTransitionStatusTimeout); streamTransitionStatusTimeout = null; }
  if (streamTransitionHideLayerTimeout !== null) { window.clearTimeout(streamTransitionHideLayerTimeout); streamTransitionHideLayerTimeout = null; }
  if (streamTransitionTeardownTimeout !== null) { window.clearTimeout(streamTransitionTeardownTimeout); streamTransitionTeardownTimeout = null; }
  // A new transition supersedes any pending hide from a previous stream lifecycle.
  streamTransitionHiding = false;

  var revealTransitionContent = function() {
    streamTransitionRevealTimeout = null;
    if (!streamTransitionVisible || streamTransitionHiding) return;

    // Keep the normal Web UI behind the transition while its background fades in.
    showUiLayer('stream-transition-layer');

    // Wait for the background fade to finish, then reveal the progress UI. The
    // connection work must not begin until that second fade has also completed.
    streamTransitionStatusTimeout = window.setTimeout(function() {
      streamTransitionStatusTimeout = null;
      if (!streamTransitionVisible || streamTransitionHiding) return;

      fadeInUiElement('loadingSpinner', 'inline-block', function() {
        if (typeof onVisible !== 'function') return;
        window.setTimeout(function() {
          if (streamTransitionVisible && !streamTransitionHiding) onVisible();
        }, 400);
      });

      var encryptionStatus = document.getElementById('streamEncryptionStatus');
      var encryptionMessage = document.getElementById('streamEncryptionMessage');
      if (encryptionStatus && encryptionMessage && encryptionMessage.textContent) {
        streamEncryptionStatusVisibleAt = Date.now();
        fadeInUiElement(encryptionStatus, 'flex');
      }
    }, UI_FADE_DURATION_MS + STREAM_TRANSITION_ELEMENT_OFFSET_MS);
  };

  var canvas = createStreamTransitionBackground();
  if (!canvas) { streamTransitionVisible = true; revealTransitionContent(); return; }
  if (streamTransitionVisible) { revealTransitionContent(); return; }

  streamTransitionCanvas = canvas;
  streamTransitionCanvas.width = Math.max(1, window.innerWidth);
  streamTransitionCanvas.height = Math.max(1, window.innerHeight);
  streamTransitionContext = streamTransitionCanvas.getContext('2d');
  streamTransitionVisible = true;

  // The opt-out keeps the transition layer but leaves its CSS background solid black.
  if (!streamTransitionBackgroundEnabled) {
    if (streamTransitionContext) {
      streamTransitionContext.clearRect(0, 0, streamTransitionCanvas.width, streamTransitionCanvas.height);
    }
    streamTransitionRevealTimeout = window.setTimeout(revealTransitionContent, 16);
    return;
  }

  // Let the first starfield frame render while the layer is still hidden. Reveal on a
  // later task so canvas initialization and the first 2,000-star draw are not exposed
  // as a visible hitch when the transition starts.
  streamTransitionFirstFrameCallback = function() {
    if (streamTransitionRevealTimeout !== null) window.clearTimeout(streamTransitionRevealTimeout);
    streamTransitionRevealTimeout = window.setTimeout(revealTransitionContent, 16);
  };

  if (!streamTransitionContext) {
    streamTransitionFirstFrameCallback = null;
    revealTransitionContent();
    return;
  }
  initializeStreamTransitionStars();
  // Draw synchronously before revealing the layer so the first visible frame is not blank.
  animateStreamTransitionBackground();
}

function hideStreamTransitionBackground(afterHidden) {
  if (typeof afterHidden === 'function') streamTransitionAfterHiddenCallbacks.push(afterHidden);
  if (streamTransitionRevealTimeout !== null) { window.clearTimeout(streamTransitionRevealTimeout); streamTransitionRevealTimeout = null; }
  // Repeated readiness/termination notifications must not keep restarting the hide delay.
  // Callers still get notified when the already-running fadeout completes.
  if (streamTransitionHiding) return;
  streamTransitionHiding = true;
  if (streamTransitionStatusTimeout !== null) { window.clearTimeout(streamTransitionStatusTimeout); streamTransitionStatusTimeout = null; }
  if (streamTransitionHideLayerTimeout !== null) { window.clearTimeout(streamTransitionHideLayerTimeout); streamTransitionHideLayerTimeout = null; }
  if (streamTransitionTeardownTimeout !== null) { window.clearTimeout(streamTransitionTeardownTimeout); streamTransitionTeardownTimeout = null; }

  // Fade out both status messages together; the starfield continues for another 100 ms afterwards.
  fadeOutUiElement('loadingSpinner');
  fadeOutUiElement('streamEncryptionStatus');
  streamTransitionHideLayerTimeout = window.setTimeout(function() {
    streamTransitionHideLayerTimeout = null;
    hideUiLayer('stream-transition-layer', function() {
      // The layer is now display:none: stop the animation immediately and release its resources.
      streamTransitionVisible = false;
      if (streamTransitionAnimationFrame !== null) {
        window.cancelAnimationFrame(streamTransitionAnimationFrame);
        streamTransitionAnimationFrame = null;
      }
      streamTransitionFirstFrameCallback = null;
      streamTransitionStars = [];
      streamTransitionContext = null;
      streamTransitionCanvas = null;
      streamTransitionTeardownTimeout = null;
      var completedCallbacks = streamTransitionAfterHiddenCallbacks.splice(0);
      completedCallbacks.forEach(function(callback) {
        try { callback(); }
        catch (error) { console.error('%c[index.js, hideStreamTransitionBackground]', 'color: red;', 'Post-transition callback failed:', error); }
      });
    }, 500);
  }, UI_FADE_DURATION_MS + STREAM_TRANSITION_ELEMENT_OFFSET_MS);
}

// Finalize the normal stream layout when the browser confirms that remote video is playing.
function handleNormalStreamVideoReady() {
  if (window._directSmartHubLaunch || !isInGame || window._normalStreamVideoReady) return;

  clearStreamStartupWatchdog();
  window._normalStreamVideoReady = true;
  $('body, .mdl-layout__container, .mdl-layout, .mdl-layout__content, main, #main-content, #listener').css({
    background: 'transparent',
    backgroundColor: 'transparent'
  });
  if (!window.isNativeStreamingEngineActive()) {
    $('#wasm_module').css({
      display: '',
      background: 'transparent',
      backgroundColor: 'transparent'
    });
  }
  $('#listener').addClass('fullscreen');

  // Schedule the startup transition hide through a cancellable lifecycle operation.
  // A stream may terminate before these delays expire; in that case the closing
  // transition must supersede this pending video-ready hide.
  scheduleStreamTransitionHideAfterVideoReady();
}

// Finalize a direct Smart Hub stream without relying on the normal UI readiness path.
function handleDirectSmartHubVideoReady() {
  if (!window._directSmartHubLaunch || !isInGame || window._directSmartHubVideoReady) return;
  clearStreamStartupWatchdog();
  window._directSmartHubVideoReady = true;

  var body = document.body;
  if (body) body.style.backgroundColor = 'transparent';
  var video = document.getElementById('wasm_module');
  if (video && !window.isNativeStreamingEngineActive()) {
    video.style.display = '';
    video.style.background = 'transparent';
    video.style.backgroundColor = 'transparent';
  }
  var listener = document.getElementById('listener');
  if (listener) listener.classList.add('fullscreen');

  // Schedule the startup transition hide through a cancellable lifecycle operation.
  // A stream may terminate before these delays expire; in that case the closing
  // transition must supersede this pending video-ready hide.
  scheduleStreamTransitionHideAfterVideoReady();
}

// Handle layout elements when displaying the Stream view
function logStreamModeClosing() {
  console.log('%c[index.js, showStreamMode]', 'color: green;', 'Closing "Show Stream" mode and returning to the main interface...');
}

function showStreamMode(streamWidth, streamHeight, startupGeneration) {
  console.log('%c[index.js, showStreamMode]', 'color: green;', 'Entering "Show Stream" mode.');
  return new Promise(function(resolve) {
    var isDirectLaunch = !!window._directSmartHubLaunch;
    var enterFullscreenStreamLayout = function() {
      if (typeof startupGeneration === 'number' && !isStreamStartupCurrent(startupGeneration)) {
        resolve();
        return;
      }
      if (!isDirectLaunch) {
        // Normal launches also stop the ambient backgrounds and UI animations.
        updateAmbientBackgroundActivation(false);
        $('#main-ui-layer').find('*').stop(true, false);
        $('#main-content').addClass('fullscreen');
        handleOnScreenOverlays();
        Navigation.stop();
      } else {
        // Only stream overlays are configured here; no settings controls or UI systems
        // are initialized for the direct Smart Hub route.
        var warningOverlay = document.getElementById('connection-warnings');
        var statsOverlay = document.getElementById('performance-stats');
        if (warningOverlay) warningOverlay.style.display = _directSmartHubStreamSettings.disableWarnings ? 'none' : 'inline-block';
        if (statsOverlay) {
          // The statistics handler reveals this overlay after the startup transition is fully hidden.
          statsOverlay.style.display = 'none';
          ['top-left', 'top-right', 'bottom-left', 'bottom-right'].forEach(function(corner) {
            statsOverlay.classList.remove('performance-stats-position-' + corner);
          });
          var statsPosition = _directSmartHubStreamSettings.performanceStatsPosition;
          if (['top-left', 'top-right', 'bottom-left', 'bottom-right'].indexOf(statsPosition) === -1) statsPosition = 'top-left';
          statsOverlay.classList.add('performance-stats-position-' + statsPosition);
        }
      }

      hideUiLayerImmediately('main-ui-layer');
      $('#listener').addClass('fullscreen');
      // Stop all background host polling as the stream enters fullscreen.
      // In-flight callbacks also observe isInGame and cannot schedule another poll.
      stopPollingHosts();
      isInGame = true;
      startAmbilightForStream();
      if (typeof getSelectedStreamingEngine !== 'function' ||
          getSelectedStreamingEngine() !== 'ESPLUSPLAYER') {
        fullscreenWasmModule(streamWidth, streamHeight);
      }
      showUiLayer('stream-diagnostics-layer');
      resolve();
    };

    // Both entry paths use the same transition layer, progress messages and encryption indicator.
    window._normalStreamVideoReady = false;
    if (isDirectLaunch) window._directSmartHubVideoReady = false;
    resetStreamEncryptionStatus();
    if (typeof Module !== 'undefined' && typeof Module.resetEncryptionStatus === 'function') {
      Module.resetEncryptionStatus();
    }
    showStreamTransitionBackground(function() {
      startStreamEncryptionStatusPolling();
      enterFullscreenStreamLayout();
    });
  });
}

// Maximize the size of the Wasm module by scaling and resizing appropriately
function fullscreenWasmModule(configuredWidth, configuredHeight) {
  var streamWidth = configuredWidth || $('#selectResolution').data('value').split(':')[0];
  var streamHeight = configuredHeight || $('#selectResolution').data('value').split(':')[1];
  var screenWidth = window.innerWidth;
  var screenHeight = window.innerHeight;

  var xRatio = screenWidth / streamWidth;
  var yRatio = screenHeight / streamHeight;

  var zoom = Math.min(xRatio, yRatio);

  var module = $('#wasm_module')[0];
  module.width = zoom * streamWidth;
  module.height = zoom * streamHeight;
  module.style.marginTop = ((screenHeight - module.height) / 2) + 'px';
}

// Handle on-screen overlays when the streaming session starts
function handleOnScreenOverlays() {
  // Find the existing toggle switch elements
  const disableWarningsSwitch = document.getElementById('disableWarningsSwitch');
  const performanceStatsSwitch = document.getElementById('performanceStatsSwitch');

  // Check if the disable warnings switch is checked, then hide or show the connection warning messages
  disableWarningsSwitch.checked ? fadeOutUiElement('connection-warnings') : fadeInUiElement('connection-warnings', 'inline-block');

  // Keep statistics hidden until the startup transition has fully disappeared.
  // The first populated StatMsg reveals them after the required post-transition delay.
  fadeOutUiElement('performance-stats');
}

// Start the given appID. If another app is running, offer to quit it. Otherwise, if the given app is already running, just resume it.
function startGame(host, appID) {
  streamStartupGeneration++;
  var startupGeneration = streamStartupGeneration;
  streamStartupFailureHandled = false;
  window._streamStartupFailureHandled = false;
  clearStreamStartupWatchdog();
  if (!host || !host.paired) {
    console.error('%c[index.js, startGame]', 'color: green;', 'Error: Attempted to start a game, but the host was not initialized properly! Host object: ', host);
    if (_directSmartHubLaunch) directSmartHubLaunchFailure(t('The selected host is no longer available on Moonlight.'));
    return;
  }
  localStorage.setItem('lastOpenedApp_' + host.serverUid, appID);

  if (_directSmartHubLaunch) {
    // Reveal the shared transition immediately, while the one required server-info
    // request is in progress. This replaces the former standalone Smart Hub status text.
    var directSettings = _directSmartHubStreamSettings;
    if (!directSettings) {
      directSmartHubLaunchFailure(t('Moonlight could not load its saved streaming settings.'));
      return;
    }
    var directAppName = _directSmartHubLaunch.appName || String(appID);
    $('#loadingSpinnerTitle').text(t('Starting %1$s...', directAppName));
    $('#loadingSpinnerMessage').text(t('Switching to streaming mode...'));
    window._directSmartHubTransitionPromise = showStreamMode(
      directSettings.streamWidth, directSettings.streamHeight, startupGeneration
    );
  }

  // Start the audio scheduler of the Web Audio backend while we are still running inside the
  // handler of the key press that started the stream, because the audio context of a device
  // with an autoplay policy can only be created from a user gesture
  if (!_directSmartHubLaunch && isWebAudioBackendSelected()) {
    startAudioScheduler();
  }

  // Refresh the server info, because the user might have quit the game
  withOperationTimeout(host.refreshServerInfo(), STREAM_OPERATION_TIMEOUTS.hostRefresh, 'Host information refresh').then(function(ret) {
    if (!isStreamStartupCurrent(startupGeneration)) return;
    if (_directSmartHubLaunch) host.online = true;
    withOperationTimeout((_directSmartHubLaunch ? Promise.resolve({
      id: appID,
      title: _directSmartHubLaunch.appName || String(appID)
    }) : host.getAppById(appID)), STREAM_OPERATION_TIMEOUTS.appLookup, 'Application lookup').then(async function(appToStart) {
      if (!isStreamStartupCurrent(startupGeneration)) return;
      if (!_directSmartHubLaunch && host.currentGame != 0 && host.currentGame != appID) {
        withOperationTimeout(host.getAppById(host.currentGame), STREAM_OPERATION_TIMEOUTS.appLookup, 'Currently running application lookup').then(function(currentApp) {
          if (!isStreamStartupCurrent(startupGeneration)) return;
          // Find the existing overlay and dialog elements
          var quitAppOverlay = document.querySelector('#quitAppDialogOverlay');
          var quitAppDialog = document.querySelector('#quitAppDialog');

          // Change the dialog text element to include the game title
          document.getElementById('quitAppDialogText').innerHTML = t('%1$s is already running. Would you like to quit it and start %2$s?', escapeHTML(currentApp.title), escapeHTML(appToStart.title));

          // Show the dialog and push the view
          fadeInUiElement(quitAppOverlay, 'flex');
          showUiDialog(quitAppDialog);
          isDialogOpen = true;
          Navigation.push(Views.QuitAppDialog);

          // Cancel the operation if the Cancel button is pressed
          $('#cancelQuitApp').off('click');
          $('#cancelQuitApp').on('click', function() {
            console.log('%c[index.js, startGame]', 'color: green;', 'Closing app dialog and returning.');
            fadeOutUiElement(quitAppOverlay);
            closeUiDialog(quitAppDialog);
            isDialogOpen = false;
            Navigation.pop();
          });

          // Quit the running app if the Continue button is pressed
          $('#continueQuitApp').off('click');
          $('#continueQuitApp').on('click', function() {
            console.log('%c[index.js, startGame]', 'color: green;', 'Quitting game, closing app dialog, and returning.');
            stopGame(host, function() {
              setTimeout(() => {
                // Scroll to the current game row
                Navigation.switch();
                // Switch to Apps view
                Navigation.change(Views.Apps);
              }, 1500);
              // Please, don't infinite loop with recursion
              setTimeout(() => startGame(host, appID), 3000);
            });
            fadeOutUiElement(quitAppOverlay);
            closeUiDialog(quitAppDialog);
            isDialogOpen = false;
            Navigation.pop();
          });

          return;
        }, function(failedCurrentApp) {
          if (!isStreamStartupCurrent(startupGeneration)) return;
          console.error('%c[index.js, startGame]', 'color: green;', 'Error: Failed to get the current running app from ' + host.hostname + '\n Returned error was: ' + failedCurrentApp + '!', '\n Host object: ' + '\n', host, '\n' + host.toString()); // Logging both object (for console) and toString-ed object (for text logs)
          streamStartupTimeoutFailure('connection', t('Could not retrieve information about the currently running application.'));
          return;
        });
        return;
      }

      // Normal launches read the live controls. Smart Hub launches use the
      // stream-only snapshot loaded directly from IndexedDB, without touching UI controls.
      var streamWidth, streamHeight, frameRate, bitrate, rikey, rikeyid, gamepadMask;
      var framePacing, optimizeGames, rumbleFeedback, mouseEmulation, selectHoldStreamMenu;
      var flipABfaceButtons, flipXYfaceButtons, opticalOutputEnabled;
      var audioBackend, audioConfig, audioSync, audioJitter, playHostAudio, decryptHostAudio;
      var videoCodec, h264Level, hdrMode, fullRange, gameMode, disableWarnings, performanceStats;
      var dolbyChannelLayout, dolbyDecodingMode;

      if (_directSmartHubLaunch) {
        var directSettings = _directSmartHubStreamSettings;
        if (!directSettings) {
          directSmartHubLaunchFailure('Moonlight could not load its saved streaming settings.');
          return;
        }
        streamWidth = directSettings.streamWidth;
        streamHeight = directSettings.streamHeight;
        frameRate = directSettings.frameRate;
        bitrate = directSettings.bitrate;
        framePacing = directSettings.framePacing;
        optimizeGames = directSettings.optimizeGames;
        rumbleFeedback = directSettings.rumbleFeedback;
        mouseEmulation = directSettings.mouseEmulation;
        selectHoldStreamMenu = directSettings.selectHoldStreamMenu;
        flipABfaceButtons = directSettings.flipABfaceButtons;
        flipXYfaceButtons = directSettings.flipXYfaceButtons;
        opticalOutputEnabled = directSettings.opticalOutputEnabled;
        audioBackend = directSettings.audioBackend;
        audioConfig = directSettings.audioConfig;
        audioSync = directSettings.audioSync;
        audioJitter = directSettings.audioJitter;
        playHostAudio = directSettings.playHostAudio;
        decryptHostAudio = directSettings.decryptHostAudio;
        videoCodec = directSettings.videoCodec;
        h264Level = directSettings.h264Level;
        hdrMode = directSettings.hdrMode;
        fullRange = directSettings.fullRange;
        gameMode = directSettings.gameMode;
        disableWarnings = directSettings.disableWarnings;
        performanceStats = directSettings.performanceStats;
        dolbyChannelLayout = directSettings.dolbyChannelLayout;
        dolbyDecodingMode = directSettings.dolbyDecodingMode;
      } else {
        streamWidth = $('#selectResolution').data('value').split(':')[0];
        streamHeight = $('#selectResolution').data('value').split(':')[1];
        frameRate = $('#selectFramerate').data('value').toString();
        bitrate = parseFloat($('#bitrateSlider').val()) * 1000;
        framePacing = $('#framePacingSwitch').parent().hasClass('is-checked') ? 1 : 0;
        optimizeGames = $('#optimizeGamesSwitch').parent().hasClass('is-checked') ? 1 : 0;
        rumbleFeedback = $('#rumbleFeedbackSwitch').parent().hasClass('is-checked') ? 1 : 0;
        mouseEmulation = $('#mouseEmulationSwitch').parent().hasClass('is-checked') ? 1 : 0;
        selectHoldStreamMenu = $('#selectHoldStreamMenuSwitch').parent().hasClass('is-checked') ? 1 : 0;
        flipABfaceButtons = $('#flipABfaceButtonsSwitch').parent().hasClass('is-checked') ? 1 : 0;
        flipXYfaceButtons = $('#flipXYfaceButtonsSwitch').parent().hasClass('is-checked') ? 1 : 0;
        opticalOutputEnabled = $('#ac3AudioModeSwitch').parent().hasClass('is-checked');
        // The selector already reflects the engine/DD policy. Do not force EMSS
        // here: ESPlusPlayer must remain ESPlusPlayer, and Disabled is valid with Dolby enabled.
        audioBackend = $('#selectAudioBackend').data('value').toString();
        audioConfig = $('#selectAudio').data('value').toString();
        audioSync = $('#audioSyncSwitch').parent().hasClass('is-checked') ? 1 : 0;
        audioJitter = parseInt($('#jitterSlider').val());
        playHostAudio = $('#playHostAudioSwitch').parent().hasClass('is-checked') ? 1 : 0;
        decryptHostAudio = $('#decryptHostAudioSwitch').parent().hasClass('is-checked') ? 1 : 0;
        videoCodec = $('#selectCodec').data('value').toString();
        h264Level = $('#selectH264Level').data('value') || 'Auto';
        hdrMode = $('#hdrModeSwitch').parent().hasClass('is-checked') ? 1 : 0;
        fullRange = $('#fullRangeSwitch').parent().hasClass('is-checked') ? 1 : 0;
        gameMode = $('#gameModeSwitch').parent().hasClass('is-checked') ? 1 : 0;
        disableWarnings = $('#disableWarningsSwitch').parent().hasClass('is-checked') ? 1 : 0;
        performanceStats = $('#performanceStatsSwitch').parent().hasClass('is-checked') ? 1 : 0;
        dolbyChannelLayout = $('#selectDolbyChannelLayout').data('value') || 'Back';
        dolbyDecodingMode = $('#selectDolbyDecodingMode').data('value') || 'Hardware';
      }

      // Keep H.264 level identifiers transport-safe and compatible with older saved preferences.
      h264Level = normalizeH264LevelId(h264Level);

      rikey = generateRemoteInputKey();
      rikeyid = generateRemoteInputKeyId();
      gamepadMask = getConnectedGamepadMask();

      console.log('%c[index.js, startGame]', 'color: green;', 'startRequest:' + 
      '\n Host address: ' + host.address + ':' + host.httpPort + 
      '\n Video resolution: ' + streamWidth + 'x' + streamHeight + 
      '\n Video frame rate: ' + frameRate + ' FPS' + 
      '\n Video bitrate: ' + bitrate + ' Kbps' + 
      '\n Video frame pacing: ' + framePacing + 
      '\n Optimize game settings: ' + optimizeGames + 
      '\n Rumble feedback: ' + rumbleFeedback + 
      '\n Mouse emulation: ' + mouseEmulation + 
      '\n Select hold stream menu: ' + selectHoldStreamMenu +
      '\n Flip A/B face buttons: ' + flipABfaceButtons + 
      '\n Flip X/Y face buttons: ' + flipXYfaceButtons + 
      '\n Audio backend: ' + audioBackend + 
      '\n Audio configuration: ' + audioConfig + 
      '\n Audio synchronization: ' + audioSync + 
      '\n Audio jitter buffer: ' + audioJitter + ' ms' +
      '\n Play host audio: ' + playHostAudio + 
      '\n Decrypt host audio: ' + decryptHostAudio + 
      '\n Video codec: ' + videoCodec + 
      '\n H.264 level: ' + h264Level + 
      '\n Video HDR mode: ' + hdrMode + 
      '\n Full color range: ' + fullRange + 
      '\n Game Mode: ' + gameMode + 
      '\n Disable connection warnings: ' + disableWarnings + 
      '\n Performance statistics: ' + performanceStats);

      // Hide on-screen overlays until the streaming session begins
      if ((!_directSmartHubLaunch || performanceStats) &&
          typeof beginPerformanceStatsStream === 'function') {
        beginPerformanceStatsStream();
      }
      $('#connection-warnings, #performance-stats').css('background', 'transparent').text('');

      // Keep the active session labels available to JavaScript termination handling.
      window._activeStreamAppName = appToStart.title || String(appID);
      window._activeStreamHostName = host.hostname || '';
      window._manualStreamStopRequested = false;

      // Show the transition first. Only after it is fully visible may the local UI
      // audio engine be closed; host launch/resume requests must wait for that shutdown.
      var streamTitleMessage = host.currentGame == appID ? 'Resuming %1$s...' : 'Starting %1$s...';
      $('#loadingSpinnerTitle').text(t(streamTitleMessage, appToStart.title));
      $('#loadingSpinnerMessage').text(t('Switching to streaming mode...'));
      try {
        if (_directSmartHubLaunch) {
          await withOperationTimeout(
            window._directSmartHubTransitionPromise || showStreamMode(streamWidth, streamHeight),
            5000,
            'Transition screen preparation'
          );
          if (!isStreamStartupCurrent(startupGeneration)) return;
          window._directSmartHubTransitionPromise = null;
        } else {
          await withOperationTimeout(
            showStreamMode(streamWidth, streamHeight, startupGeneration),
            5000,
            'Transition screen preparation'
          );
          if (!isStreamStartupCurrent(startupGeneration)) return;
        }
      } catch (transitionError) {
        if (!isStreamStartupCurrent(startupGeneration)) return;
        console.error('%c[index.js, startGame]', 'color: red;', 'Could not prepare the stream transition screen:', transitionError);
        streamStartupTimeoutFailure('connection', t('Could not prepare the streaming screen.'));
        return;
      }
      if (!_directSmartHubLaunch) {
        $('#loadingSpinnerMessage').text(t('Closing local audio engine...'));
        try {
          if (typeof setNavigationSoundEnabled === 'function') {
            await withOperationTimeout(setNavigationSoundEnabled(false), STREAM_OPERATION_TIMEOUTS.audioShutdown, 'Local audio shutdown');
            if (!isStreamStartupCurrent(startupGeneration)) return;
          }
        } catch (audioShutdownError) {
          if (!isStreamStartupCurrent(startupGeneration)) return;
          console.error('%c[index.js, startGame]', 'color: red;', 'Could not close the local UI audio engine; aborting stream startup:', audioShutdownError);
          streamStartupTimeoutFailure('connection', t('Could not prepare the local audio engine for streaming.'));
          return;
        }
      }
      $('#loadingSpinnerTitle').text(t(streamTitleMessage, appToStart.title));

      // Check if user wants to resume the already-running app
      if (host.currentGame == appID) {
        // If the app is already running, we can just resume it
        $('#loadingSpinnerMessage').text(t('Requesting stream from host...'));
        return withOperationTimeout(host.resumeApp(
          streamWidth + 'x' + streamHeight + 'x' + frameRate, // Resolution and frame rate
          optimizeGames, // Optimize game settings (SOPS)
          rikey, rikeyid, // Remote input key and key ID
          hdrMode, // Auto HDR video streaming
          playHostAudio, // Play audio on host and client device
          0x030002, // Surround channel mask << 16 | Surround channel count
          gamepadMask // Connect gamepad mask
        ), STREAM_OPERATION_TIMEOUTS.hostLaunch, 'Host app resume').then(function(launchResult) {
          if (!isStreamStartupCurrent(startupGeneration)) return;
          $xml = $($.parseXML(launchResult.toString()));
          $root = $xml.find('root');
          var status_code = $root.attr('status_code');
          var status_message = $root.attr('status_message');
          if (status_code != 200) {
            var apiStatusMessage = status_message;
            if (_directSmartHubLaunch) {
              directSmartHubLaunchFailure(t('Failed to resume %1$s', appToStart.title));
              return;
            }
            streamStartupApiFailure(
              host,
              t('Failed to resume %1$s', appToStart.title),
              status_code,
              apiStatusMessage
            );
            return;
          }
          // Keep the lightweight canvas running until the first native stream frame is visible.
          // Start stream request
          armStreamStartupWatchdog('connection', STREAM_OPERATION_TIMEOUTS.streamConnection);
          sendMessage('startRequest', [
            host.address, host.httpPort, streamWidth, streamHeight, frameRate, bitrate.toString(), rikey, rikeyid.toString(),
            host.appVersion, host.gfeVersion, $root.find('sessionUrl0').text().trim(), host.serverCodecModeSupport,
            framePacing, optimizeGames, rumbleFeedback, mouseEmulation, flipABfaceButtons, flipXYfaceButtons,
            audioBackend, audioConfig, opticalOutputEnabled, audioSync, audioJitter, playHostAudio, decryptHostAudio, videoCodec, hdrMode, fullRange,
            gameMode, disableWarnings, performanceStats,
            dolbyChannelLayout,
            dolbyDecodingMode,
            h264Level,
            selectHoldStreamMenu
          ]);
        }, function(failedResumeApp) {
          console.error('%c[index.js, startGame]', 'color: green;', 'Error: Failed to resume app with id: ' + appID + '\n Returned error was: ' + failedResumeApp + '!');
          if (failedResumeApp && failedResumeApp.name === 'TimeoutError') {
            streamStartupTimeoutFailure('connection', t('The host did not respond to the resume request in time.'));
            return;
          }
          var resumeApiMessage = typeof failedResumeApp === 'string'
            ? failedResumeApp
            : (failedResumeApp && typeof failedResumeApp.message === 'string' ? failedResumeApp.message : '');
          streamStartupApiFailure(
            host,
            t('Failed to resume %1$s', appToStart.title),
            failedResumeApp && failedResumeApp.code,
            resumeApiMessage
          );
          return;
        });
      }

      // Count new launches, including requests that later fail. Resuming an
      // already-running app does not count as a new application launch.
      incrementAppRunCount(host, appID, appToStart.title);

      // If the user wants to launch the app, then we start launching it
      $('#loadingSpinnerMessage').text(t('Requesting stream from host...'));
      withOperationTimeout(host.launchApp(
        appID, // App ID
        streamWidth + 'x' + streamHeight + 'x' + frameRate, // Resolution and frame rate
        optimizeGames, // Optimize game settings (SOPS)
        rikey, rikeyid, // Remote input key and key ID
        hdrMode, // Auto HDR video streaming
        playHostAudio, // Play audio on host and client device
        0x030002, // Surround channel mask << 16 | Surround channel count
        gamepadMask // Connect gamepad mask
      ), STREAM_OPERATION_TIMEOUTS.hostLaunch, 'Host app launch').then(function(launchResult) {
        if (!isStreamStartupCurrent(startupGeneration)) return;
        $xml = $($.parseXML(launchResult.toString()));
        $root = $xml.find('root');
        var status_code = $root.attr('status_code');
        var status_message = $root.attr('status_message');
        if (status_code != 200) {
          var apiStatusCode = status_code;
          var apiStatusMessage = status_message;
          if (_directSmartHubLaunch) {
            directSmartHubLaunchFailure(t('Failed to launch %1$s', appToStart.title));
            return;
          }
          var launchErrorMessage = t('Failed to launch %1$s', appToStart.title);
          if (status_code == 4294967295 && status_message == 'Invalid') {
            // GFE uses this sentinel without a useful status message for audio capture failures.
            status_code = 418;
            launchErrorMessage = t('Audio capture device is missing. Please reinstall the audio drivers.');
          }
          streamStartupApiFailure(host, launchErrorMessage, apiStatusCode, apiStatusMessage);
          return;
        }
        // Keep the lightweight canvas running until the first native stream frame is visible.
        // Start stream request
        armStreamStartupWatchdog('connection', STREAM_OPERATION_TIMEOUTS.streamConnection);
        sendMessage('startRequest', [
          host.address, host.httpPort, streamWidth, streamHeight, frameRate, bitrate.toString(), rikey, rikeyid.toString(),
          host.appVersion, host.gfeVersion, $root.find('sessionUrl0').text().trim(), host.serverCodecModeSupport,
          framePacing, optimizeGames, rumbleFeedback, mouseEmulation, flipABfaceButtons, flipXYfaceButtons,
          audioBackend, audioConfig, opticalOutputEnabled, audioSync, audioJitter, playHostAudio, decryptHostAudio, videoCodec, hdrMode, fullRange,
          gameMode, disableWarnings, performanceStats,
          dolbyChannelLayout,
          dolbyDecodingMode,
          h264Level,
          selectHoldStreamMenu
        ]);
      }, function(failedLaunchApp) {
        console.error('%c[index.js, startGame]', 'color: green;', 'Error: Failed to launch app with id: ' + appID + '\n Returned error was: ' + failedLaunchApp + '!');
        if (failedLaunchApp && failedLaunchApp.name === 'TimeoutError') {
          streamStartupTimeoutFailure('connection', t('The host did not respond to the launch request in time.'));
          return;
        }
        var launchApiMessage = typeof failedLaunchApp === 'string'
          ? failedLaunchApp
          : (failedLaunchApp && typeof failedLaunchApp.message === 'string' ? failedLaunchApp.message : '');
        streamStartupApiFailure(
          host,
          t('Failed to launch %1$s', appToStart.title),
          failedLaunchApp && failedLaunchApp.code,
          launchApiMessage
        );
        return;
      });
    }).catch(function(failedAppLookup) {
      if (!isStreamStartupCurrent(startupGeneration)) return;
      console.error('%c[index.js, startGame]', 'color: green;', 'Error: Failed to retrieve app ' + appID + ': ' + failedAppLookup);
      streamStartupTimeoutFailure('connection', t('The host did not return the requested application.'));
    });
  }, function(failedRefreshInfo) {
    if (!isStreamStartupCurrent(startupGeneration)) return;
    console.error('%c[index.js, startGame]', 'color: green;', 'Error: Failed to refresh server info before launching app:', failedRefreshInfo);
    streamStartupTimeoutFailure('connection', t('Could not connect to %1$s. Make sure the GameStream server is running on the remote host.', host.hostname || t('the host')));
  });
}

// Stop the running app title, report the result, and then refresh the Apps grid.
function stopGame(host, callbackFunction) {
  // Prevent a manual quit operation from racing the post-stream recovery sequence.
  if (window._streamTerminationRecoveryInProgress) return;

  isInGame = false;

  if (!host.paired) {
    return;
  }

  // Keep the Apps grid dimmed and non-interactive until the result has been reported
  // and the refreshed list has finished rendering.
  lockAppListInteraction();
  snackbarLogPersistent('Closing application...');

  var operationFinished = false;
  function finishQuitOperation(message, appTitle, success) {
    if (operationFinished) return;
    operationFinished = true;

    // Replace the progress snackbar with the final result before starting any refresh.
    // Keep this result visible while the app list is reloaded silently.
    if (appTitle) snackbarLog(message, appTitle);
    else snackbarLog(message);

    Promise.resolve().then(function() {
      return withOperationTimeout(host.refreshServerInfo(), 15000, 'Host refresh after app shutdown');
    }).catch(function(failedRefreshInfo) {
      console.error('%c[index.js, stopGame]', 'color: green;', 'Error: Failed to refresh server info after closing the app:', failedRefreshInfo);
    }).then(function() {
      var appListOperation = { cancelled: false };
      return withOperationTimeout(showApps(host, {
        suppressLoadingSnackbar: true,
        suppressEmptyListSnackbar: true,
        keepInteractionLocked: true,
        operationToken: appListOperation
      }), 10000, 'Application list refresh after app shutdown', function() {
        appListOperation.cancel();
      });
    }).catch(function(error) {
      console.error('%c[index.js, stopGame]', 'color: green;', 'Failed to refresh the Apps list after the close operation:', error);
    }).then(function() {
      unlockAppListInteraction();
      if (success && typeof callbackFunction === 'function') callbackFunction();
    });
  }

  withOperationTimeout(host.refreshServerInfo(), 15000, 'Host refresh before app shutdown').then(function() {
    return withOperationTimeout(host.getAppById(host.currentGame), 10000, 'Running application lookup');
  }).then(function(runningApp) {
    if (!runningApp) {
      finishQuitOperation('No app is currently running.');
      return;
    }

    var appTitle = runningApp.title;
    withOperationTimeout(host.quitApp(), 10000, 'Host app shutdown').then(function() {
      finishQuitOperation('Successfully quit %1$s', appTitle, true);
    }, function(failedQuitApp) {
      console.error('%c[index.js, stopGame]', 'color: green;', 'Error: Failed to quit app! Returned error was: ' + failedQuitApp + '!');
      finishQuitOperation('Failed to quit %1$s', appTitle);
    });
  }).catch(function(error) {
    console.error('%c[index.js, stopGame]', 'color: green;', 'Unable to complete the close-app request:', error);
    finishQuitOperation('Unable to close the application.');
  });
}

// Route keyboard events through the selected streaming engine.
function sendKeyboardEventToHost(keyCode, keyAction, modifiers) {
  if (window._activeStreamingEngine === 'ESPLUSPLAYER') {
    var transport = window.ESPlusPlayerTransport;
    if (!transport || typeof transport.sendKey !== 'function') {
      console.error('[stream menu] ESPlusPlayer keyboard transport is unavailable');
      return false;
    }

    // ESPlusPlayerTransport.sendKey() accepts the unprefixed virtual-key code.
    return transport.sendKey(keyCode, keyAction, modifiers);
  }

  // Keep the existing EMSS/WASM key representation unchanged.
  return Module.sendKeyboardEvent(0x80 << 8 | keyCode, keyAction, modifiers);
}

// Send the Escape key using the keyboard event to the host.
function sendEscapeKeyToHost() {
  sendKeyboardEventToHost(0x1B, 0x03, 0); // Key down
  sendKeyboardEventToHost(0x1B, 0x04, 0); // Key up
}

// Send a key combination to the host, pressing the keys in order and releasing them in reverse order.
function sendKeyCombinationToHost(keyCodes) {
  // Modifier flags of the modifier keys: Left Shift, Left Ctrl, Left Alt and Left Windows.
  const modifierFlags = { 0xA0: 0x01, 0xA2: 0x02, 0xA4: 0x04, 0x5B: 0x08 };
  var modifiers = 0;
  keyCodes.forEach(function(keyCode) {
    modifiers |= modifierFlags[keyCode] || 0;
    sendKeyboardEventToHost(keyCode, 0x03, modifiers); // Key down
  });
  keyCodes.slice().reverse().forEach(function(keyCode) {
    modifiers &= ~(modifierFlags[keyCode] || 0);
    sendKeyboardEventToHost(keyCode, 0x04, modifiers); // Key up
  });
}

// Create a Stream Menu option that sends a key combination to the host
function sendKeysMenuOption(id, keysLabel, keyCodes) {
  return {
    id: id,
    text: keysLabel,
    action: function() {
      sendKeyCombinationToHost(keyCodes);
    }
  };
}

// Define the options of the Stream Menu in display order, add, remove or reorder entries here to change the menu
function getStreamMenuOptions() {
  return [
    { group: 'keys', icon: 'keyboard', option: sendKeysMenuOption('streamMenuSendWin', 'WIN', [0x5B]) },
    { group: 'keys', icon: 'keyboard', option: sendKeysMenuOption('streamMenuSendAltTab', 'ALT + TAB', [0xA4, 0x09]) },
    { group: 'keys', icon: 'keyboard', option: sendKeysMenuOption('streamMenuSendAltF4', 'ALT + F4', [0xA4, 0x73]) },
    { group: 'keys', icon: 'keyboard', option: sendKeysMenuOption('streamMenuSendF11', 'F11', [0x7A]) },
    { group: 'keys', icon: 'keyboard', option: sendKeysMenuOption('streamMenuSendEsc', 'ESC', [0x1B]) },
    { group: 'keys', icon: 'keyboard', option: sendKeysMenuOption('streamMenuSendAltEnter', 'ALT + ENTER', [0xA4, 0x0D]) },
    { group: 'keys', icon: 'keyboard', option: sendKeysMenuOption('streamMenuSendCtrlShiftEsc', 'CTRL + SHIFT + ESC', [0xA2, 0xA0, 0x1B]) },
    { group: 'keys', icon: 'keyboard', option: sendKeysMenuOption('streamMenuSendWinD', 'WIN + D', [0x5B, 0x44]) },
    {
      group: 'stats',
      icon: 'query_stats',
      option: {
        id: 'streamMenuToggleStats',
        text: t(isPerformanceStatsOverlayVisible() ? 'Hide performance stats' : 'Show performance stats'),
        action: function() {
          if (window._activeStreamingEngine === 'ESPLUSPLAYER') {
            if (window.ESPlusPlayerTransport &&
                typeof window.ESPlusPlayerTransport.toggleStats === 'function') {
              window.ESPlusPlayerTransport.toggleStats().catch(function(error) {
                console.warn('[stream menu] Could not toggle native performance statistics:', error);
              });
            }
          } else {
            Module.toggleStats();
          }
        }
      }
    },
    {
      group: 'disconnect',
      icon: 'power_settings_new',
      option: {
        id: 'streamMenuDisconnect',
        text: t('Disconnect'),
        action: function() {
          requestManualStreamStop();
        }
      }
    },
  ];
}

function requestManualStreamStop() {
  // Both engines use the same visual closing transition. Only the final stop
  // command differs: WMP must stop through its native Common C session owner.
  var isWmpStream = window.getStreamingEngineState().active === 'ESPLUSPLAYER' &&
    window.ESPlusPlayerTransport &&
    typeof window.ESPlusPlayerTransport.stopStream === 'function';
  if (isWmpStream && window._manualStreamStopRequested) return;
  if (isWmpStream) window._manualStreamStopRequested = true;

  showStreamTransitionBackground(function() {
    // Preserve the existing EMSS stop ordering; its flag is set only after
    // the transition has been revealed.
    if (isWmpStream) {
      window.ESPlusPlayerTransport.stopStream().catch(function(error) {
        console.error('%c[index.js, requestManualStreamStop]', 'color: red;', 'WMP session stop request failed:', error);
      });
      return;
    }
    window._manualStreamStopRequested = true;
    Module.stopStream();
  });
}

function streamMenuDialog() {
  var streamMenuDialogOverlay = $('<div>', {
    id: 'streamMenuDialogOverlay',
    class: 'dialog-overlay'
  }).appendTo('#popup-layer');
  var streamMenuDialog = $('<dialog>', {
    id: 'streamMenuDialog',
    class: 'mdl-dialog'
  }).appendTo(streamMenuDialogOverlay);
  $('<h3>', {
    id: 'streamMenuDialogTitle',
    class: 'mdl-dialog__title',
    'data-i18n': 'Stream Menu',
    text: t('Stream Menu')
  }).appendTo(streamMenuDialog);
  var streamMenuDialogContent = $('<div>', {
    class: 'mdl-dialog__content'
  }).appendTo(streamMenuDialog);

  var streamMenuGroups = {};
  getStreamMenuOptions().forEach(function(groupedOption) {
    var group = streamMenuGroups[groupedOption.group];
    if (!group) {
      group = $('<div>', {
        class: 'stream-menu-group stream-menu-group--' + groupedOption.group
      }).appendTo(streamMenuDialogContent);
      if (groupedOption.group === 'keys') {
        $('<div>', {
          class: 'stream-menu-group__title',
          text: t('Send keystrokes')
        }).appendTo(group);
      }
      streamMenuGroups[groupedOption.group] = group;
    }

    var menuOption = groupedOption.option;
    var streamMenuDialogOption = $('<button>', {
      type: 'button',
      id: menuOption.id,
      class: 'mdl-button mdl-js-button mdl-button--raised mdl-button--colored mdl-js-ripple-effect stream-menu-option stream-menu-option--' + groupedOption.group
    });
    $('<span>', {
      class: 'stream-menu-option__icon',
      'aria-hidden': 'true',
      text: groupedOption.icon
    }).appendTo(streamMenuDialogOption);
    $('<span>', {
      class: 'stream-menu-option__label',
      text: menuOption.text
    }).appendTo(streamMenuDialogOption);
    streamMenuDialogOption.click(function() {
      if (menuOption.id === 'streamMenuDisconnect') {
        // Let the menu finish fading out before the stream termination starts its transition.
        closeStreamMenuDialog(false, menuOption.action);
      } else {
        closeStreamMenuDialog(true);
        menuOption.action();
      }
    });
    streamMenuDialogOption.appendTo(group);
  });

  var streamMenuDialogActions = $('<div>', {
    class: 'mdl-dialog__actions'
  }).appendTo(streamMenuDialog);
  $('<button>', {
    type: 'button',
    id: 'closeStreamMenu',
    class: 'mdl-button mdl-js-button mdl-button--raised mdl-button--colored mdl-js-ripple-effect',
    'data-i18n': 'Close',
    text: t('Close')
  }).click(function() {
    closeStreamMenuDialog(true);
  }).appendTo(streamMenuDialogActions);

  if (!streamMenuDialog[0].showModal) {
    dialogPolyfill.registerDialog(streamMenuDialog[0]);
  }
  if (document.pointerLockElement) {
    document.exitPointerLock();
  }
  window.addEventListener('mousemove', stopMouseMovePropagation, true);
  Module._setStreamMenuInputBlocked(1);
  fadeInUiElement(streamMenuDialogOverlay[0], 'flex');
  showUiDialog(streamMenuDialog[0]);
  isDialogOpen = true;
  Views.StreamMenuDialog.view.index = 0;
  Navigation.start();
  Navigation.push(Views.StreamMenuDialog);
  setTimeout(() => Navigation.switch(), 5);
}

function closeStreamMenuDialog(returnToStream, onClosed) {
  var streamMenuDialogOverlay = $('#streamMenuDialogOverlay');
  if (streamMenuDialogOverlay.length === 0 || streamMenuDialogOverlay[0]._closingUiDialog) {
    return;
  }
  var overlayElement = streamMenuDialogOverlay[0];
  var dialogElement = $('#streamMenuDialog')[0];
  var overlayFadeOutComplete = false;
  var dialogFadeOutComplete = false;
  var closedCallbackCalled = false;
  overlayElement._closingUiDialog = true;
  Navigation.pop();
  Navigation.stop();
  window.removeEventListener('mousemove', stopMouseMovePropagation, true);
  isDialogOpen = false;

  // Hide the statistics overlay alongside the menu; the 200ms pause is only for the closing transition.
  if (typeof onClosed === 'function') {
    hideStreamDiagnosticsLayer();
  }

  function finishClosing() {
    if (!overlayFadeOutComplete || !dialogFadeOutComplete || closedCallbackCalled) return;
    closedCallbackCalled = true;
    streamMenuDialogOverlay.remove();
    Module._setStreamMenuInputBlocked(0);
    if (returnToStream) {
      var videoElement = document.getElementById('wasm_module');
      videoElement.focus();
      if (document.pointerLockElement !== videoElement) {
        videoElement.dispatchEvent(new MouseEvent('mousedown', {
          bubbles: true, cancelable: true, view: window, clientX: 0, clientY: 0
        }));
      }
    }
    if (typeof onClosed === 'function') {
      // Leave a little extra breathing room after both menu layers have faded out.
      setTimeout(onClosed, 200);
    }
  }

  fadeOutUiElement(overlayElement, function() {
    overlayFadeOutComplete = true;
    finishClosing();
  });
  closeUiDialog(dialogElement, function() {
    dialogFadeOutComplete = true;
    finishClosing();
  });
}

function stopMouseMovePropagation(e) {
  e.stopPropagation();
}

function directSmartHubVideoReady(videoElement) {
  if (!videoElement || videoElement.readyState < 2 ||
      videoElement.videoWidth <= 0 || videoElement.videoHeight <= 0) {
    return false;
  }

  var transitionLayer = document.getElementById('stream-transition-layer');
  if (transitionLayer && window.getComputedStyle(transitionLayer).display !== 'none') {
    return false;
  }

  return true;
}

function openStreamMenuFromGamepad() {
  // Never let a duplicate controller event toggle an already-open menu closed.
  if (isDialogOpen || $('#streamMenuDialogOverlay').length > 0) return;
  // Reuse the same stream-state and video-readiness checks as the remote-control shortcut.
  if (typeof toggleStreamMenuDialog === 'function') toggleStreamMenuDialog();
}

function toggleStreamMenuDialog() {
  var videoElement = document.getElementById('wasm_module');
  var streamMenuDialogOverlay = $('#streamMenuDialogOverlay');
  var transitionLayer = document.getElementById('stream-transition-layer');
  var transitionActive = streamTransitionVisible ||
    (transitionLayer && window.getComputedStyle(transitionLayer).display !== 'none');
  var engineState = window.getStreamingEngineState();
  var isWmpStream = engineState.active === 'ESPLUSPLAYER' && engineState.confirmed === true;
  // Native readiness comes from the native player's displayVideo notification.
  var videoReady = isWmpStream
    ? engineState.videoReady
    : (videoElement && videoElement.style.display !== 'none' &&
      videoElement.readyState >= 2 && videoElement.videoWidth > 0 && videoElement.videoHeight > 0);
  var streamReady = isWmpStream
    ? engineState.videoReady
    : (window._normalStreamVideoReady || window._directSmartHubVideoReady);

  if (streamMenuDialogOverlay.length > 0) {
    // During teardown, close without returning focus to a video covered by the transition.
    closeStreamMenuDialog(isInGame && !transitionActive && streamReady && videoReady);
  } else if ((isWmpStream || isInGame) &&
      !transitionActive && streamReady && videoReady && !isDialogOpen) {
    // A confirmed native session plus native video readiness is authoritative
    // for WMP; do not additionally depend on the HTML/EMSS game-state flag.
    streamMenuDialog();
  }
}

let indexedDB = null;
const dbVersion = 1.0;
let db = null;
const dbName = 'GameStreamingDB';
const storeName = 'GameStreamingStore';
// IndexedDB values may contain pairing certificates and private keys.

// Based on example from https://hacks.mozilla.org/2012/02/storing-images-and-files-in-indexeddb/
function createObjectStore(dataBase) {
  if (!dataBase.objectStoreNames.contains(storeName)) {
    dataBase.createObjectStore(storeName);
  }
}

function openIndexDB(callback) {
  if (db) {
    // Database already opened
    callback();
    return;
  }

  console.log('%c[index.js, openIndexDB]', 'color: green;', 'Opening IndexedDB...');
  if (!_directSmartHubLaunch) {
    if (navigator.storage && navigator.storage.persist) {
      navigator.storage.persisted().then(persistent => {
        if (persistent) {
          console.log('%c[index.js, openIndexDB]', 'color: green;', 'Storage will not be cleared except by explicit user action.');
        } else {
          console.log('%c[index.js, openIndexDB]', 'color: green;', 'Storage may be cleared by the UA under storage pressure.');
        }
      });
    } else {
      console.warn('%c[index.js, openIndexDB]', 'color: green;', 'Warning: Persistent storage is not available!');
    }
  }

  if (!indexedDB) {
    indexedDB = self.indexedDB || self.webkitIndexedDB || self.mozIndexedDB || self.OIndexedDB || self.msIndexedDB;
  }

  // Create/open database
  const request = indexedDB.open(dbName, dbVersion);

  request.onerror = function(e) {
    console.error('%c[index.js, openIndexDB]', 'color: green;', 'Error: Cannot create or access the IndexedDB database: ', e);
    if (_directSmartHubLaunch) directSmartHubLaunchFailure(t('Moonlight could not load its saved configuration.'));
  };

  request.onsuccess = function(e) {
    console.log('%c[index.js, openIndexDB]', 'color: green;', 'Successfully created or accessed the IndexedDB database: ', e);
    db = request.result;

    db.onerror = function(e) {
      console.error('%c[index.js, openIndexDB]', 'color: green;', 'Error: Failed to create or access the IndexedDB database: ', e);
    };

    // Interim solution to create an objectStore
    if (db.setVersion && db.version != dbVersion) {
      const setVersion = db.setVersion(dbVersion);
      setVersion.onsuccess = function() {
        createObjectStore(db);
        callback();
      };
    } else {
      callback();
    }
  };

  request.onupgradeneeded = function(e) {
    createObjectStore(e.target.result);
  };
}

function callCb(key, value, callbackFunction) {
  let obj = {};
  obj[key] = value;
  callbackFunction(obj);
}

function getData(key, callbackFunction) {
  let cb = function() {
    try {
      // Open a transaction to the database
      const transaction = db.transaction(storeName, 'readonly');
      const readRequest = transaction.objectStore(storeName).get(key);

      // Retrieve the data that was stored
      readRequest.onsuccess = function(e) {
        if (DEBUG_MODE) {
          var databaseValue = key === 'cert' && !LOG_SHOW_PRIVATE_DATA
            ? '--- HIDDEN ---'
            : readRequest.result;
          console.log('%c[index.js, getData]', 'color: green;', 'Reading data from DB key: ' + key + ' with value: ', databaseValue);
        }
        let value = null;
        if (readRequest.result) {
          value = JSON.parse(readRequest.result);
        }
        callCb(key, value, callbackFunction);
      };

      transaction.onerror = function(e) {
        console.error('%c[index.js, getData]', 'color: green;', 'Error: Unable to read data at the: ' + key + ' from IndexedDB: ' + e);
        callCb(key, value, callbackFunction);
      };
    } catch (err) {
      console.error('%c[index.js, getData]', 'color: green;', 'Error: Something went wrong while reading data at the key: ' + key + ' from IndexedDB: ' + err);
      callCb(key, value, callbackFunction);
    }
  };

  if (db) {
    cb();
  } else {
    openIndexDB(cb);
  }
}

function storeData(key, data, callbackFunction) {
  let cb = function() {
    try {
      // Open a transaction to the database
      const transaction = db.transaction(storeName, 'readwrite');
      // Put the text into the database
      const put = transaction.objectStore(storeName).put(JSON.stringify(data), key);

      transaction.oncomplete = function(e) {
        if (DEBUG_MODE) {
          var databaseValue = key === 'cert' && !LOG_SHOW_PRIVATE_DATA
            ? '--- HIDDEN ---'
            : data;
          console.log('%c[index.js, storeData]', 'color: green;', 'Storing data at key: ' + key + ' with data: ', databaseValue);
        }
        if (callbackFunction) {
          callbackFunction();
        }
      };

      transaction.onerror = function(e) {
        console.error('%c[index.js, storeData]', 'color: green;', 'Error: Unable to store data in IndexedDB: ' + e);
      };
    } catch (err) {
      console.error('%c[index.js, storeData]', 'color: green;', 'Error: Something went wrong while storing data at the key: ' + key + ' from IndexedDB: ' + err);
    }
  };

  if (db) {
    cb();
  } else {
    openIndexDB(cb);
  }
}

// Storing data takes the data as an object, and shoves it into JSON to store.
// Unfortunately, objects with function instances (classes) are stripped of their function instances
// when converted to a raw object, so we cannot forget to revive the object after we load it.
function saveHosts() {
  storeData('hosts', hosts, null);
}

function savePreviewApps() {
  // This cache is shared by Smart Hub Preview and the main UI, so persist it
  // even when Smart Hub Preview is unavailable on the current device.
  console.log('%c[index.js, savePreviewApps]', 'color: green;', 'Saving cached app lists.');
  storeData('previewApps', _previewApps, null);
}

// Update the persistent per-host app list while preserving Smart Hub Preview
// image metadata for applications that remain in the host's current app list.
function incrementAppRunCount(host, appId, appTitle) {
  if (!host || !host.serverUid || appId == null) {
    return;
  }

  var hostCache = _previewApps[host.serverUid];
  if (!hostCache || !Array.isArray(hostCache.apps)) {
    hostCache = {
      hostname: host.hostname,
      address: host.address,
      apps: []
    };
    _previewApps[host.serverUid] = hostCache;
  }

  var cachedApp = hostCache.apps.find(function(app) {
    return app && Number(app.id) === Number(appId);
  });
  if (!cachedApp) {
    cachedApp = {
      id: appId,
      title: appTitle || String(appId),
      runCount: 0
    };
    hostCache.apps.push(cachedApp);
  }

  var currentCount = Number(cachedApp.runCount);
  cachedApp.runCount = (Number.isFinite(currentCount) && currentCount > 0 ? currentCount : 0) + 1;
  var usageSwitch = document.getElementById('sortAppsByUsageSwitch');
  if (usageSwitch && usageSwitch.checked) hostCache.apps = sortAppsForHost(host, hostCache.apps);
  savePreviewApps();
  if (usageSwitch && usageSwitch.checked) updatePreviewData();
}

// Update the persistent per-host app list while preserving Smart Hub Preview
// image metadata and usage statistics for applications that remain in the host's current app list.
function cacheHostAppList(host, appList) {
  if (!host || !host.serverUid || !Array.isArray(appList)) {
    return;
  }

  var oldApps = (_previewApps[host.serverUid] && _previewApps[host.serverUid].apps) || [];
  _previewApps[host.serverUid] = {
    hostname: host.hostname,
    address: host.address,
    apps: appList.map(function(app) {
      var oldApp = oldApps.find(function(cachedApp) {
        return Number(cachedApp.id) === Number(app.id);
      });
      var newApp = {
        id: app.id,
        title: app.title,
        runCount: oldApp && Number.isFinite(Number(oldApp.runCount)) ? Math.max(0, Number(oldApp.runCount)) : 0
      };
      if (oldApp) {
        if (oldApp.imageUri) newApp.imageUri = oldApp.imageUri;
        if (oldApp.txtPath) newApp.txtPath = oldApp.txtPath;
      }
      return newApp;
    })
  };

  savePreviewApps();
}

function saveStreamingEngine() {
  var chosenEngine = $(this).data('value');
  if (chosenEngine !== 'EMSS' && chosenEngine !== 'ESPLUSPLAYER') return;
  var currentEngine = String($('#selectStreamingEngine').data('value') || 'EMSS');
  if (chosenEngine === currentEngine) return;

  var currentBackend = String($('#selectAudioBackend').data('value') || 'EMSS');
  if (chosenEngine === 'ESPLUSPLAYER') {
    // Preserve the effective EMSS choice for the next time EMSS is selected.
    audioBackendBeforeESPlusPlayerPreference = currentBackend === 'Disabled' ? 'Disabled' : currentBackend;
    storeData('audioBackendBeforeWmp', audioBackendBeforeESPlusPlayerPreference, null);
    currentBackend = currentBackend === 'Disabled' ? 'Disabled' : 'ESPLUSPLAYER';
    setAudioSelectorValue('#selectAudioBackend', '.audioBackendMenu', currentBackend);
    storeData('audioBackend', currentBackend, null);
    $('#selectStreamingEngine').text($(this).text()).attr('data-value', chosenEngine).data('value', chosenEngine);
    storeData('streamingEngine', chosenEngine, null);
    applyAudioBackendPolicy('enter-esplusplayer');
  } else {
    $('#selectStreamingEngine').text($(this).text()).attr('data-value', chosenEngine).data('value', chosenEngine);
    storeData('streamingEngine', chosenEngine, null);
    applyAudioBackendPolicy('leave-esplusplayer');
  }
}

function saveResolution() {
  var chosenResolution = $(this).data('value');
  $('#selectResolution').text($(this).text()).attr('data-value', chosenResolution).data('value', chosenResolution);
  console.log('%c[index.js, saveResolution]', 'color: green;', 'Saving resolution value: ' + chosenResolution);
  storeData('resolution', chosenResolution, null);

  updateH264FramerateConstraint();

  // Update the bitrate value based on the selected resolution
  $('#optimizeBitrateSwitch').prop('checked') ? optimizeBitratePresets() : standardBitratePresets();
  // Trigger warning check after changing video resolution
  warnResolutionFramerate();
}

function saveFramerate() {
  var chosenFramerate = $(this).data('value');
  $('#selectFramerate').text($(this).text()).attr('data-value', chosenFramerate).data('value', chosenFramerate);
  console.log('%c[index.js, saveFramerate]', 'color: green;', 'Saving framerate value: ' + chosenFramerate);
  storeData('frameRate', chosenFramerate, null);

  // Update the bitrate value based on the selected frame rate
  $('#optimizeBitrateSwitch').prop('checked') ? optimizeBitratePresets() : standardBitratePresets();
  // Trigger warning check after changing video frame rate
  warnResolutionFramerate();
}

// ESPlusPlayer cannot sustain H.264 above 1080p at 60 FPS.
function updateH264FramerateConstraint() {
  var resolution = ($('#selectResolution').data('value') || '1280:720').split(':');
  var height = parseInt(resolution[1], 10) || 0;
  var isH264 = $('#selectCodec').data('value') === 'H264';
  var mustForce30Fps = isH264 && height > 1080;
  var framerateButton = $('#selectFramerate');

  if (mustForce30Fps && framerateButton.data('value') !== '30') {
    var thirtyFpsOption = $('.videoFramerateMenu li[data-value="30"]').first();
    if (thirtyFpsOption.length) {
      framerateButton.text(thirtyFpsOption.text());
    } else {
      framerateButton.text('30 FPS');
    }
    framerateButton.attr('data-value', '30').data('value', '30');
    storeData('frameRate', '30', null);
    $('#optimizeBitrateSwitch').prop('checked') ? optimizeBitratePresets() : standardBitratePresets();
  }

  framerateButton.prop('disabled', mustForce30Fps)
    .attr('aria-disabled', mustForce30Fps ? 'true' : 'false')
    .toggleClass('is-disabled', mustForce30Fps);

  if (mustForce30Fps) {
    closePopupMenu('selectFramerate');
  }
}

function warnResolutionFramerate() {
  var chosenResolutionWidth = $('#selectResolution').data('value').split(':')[0];
  var chosenResolutionHeight = $('#selectResolution').data('value').split(':')[1];
  var chosenFramerate = $('#selectFramerate').data('value');

  // Video resolution and frame rate warning
  if (!resFpsWarning && chosenResolutionWidth > '1920' && chosenResolutionHeight > '1080' && chosenFramerate > '60') {
    // Warn only if video resolution is greater than 1080p and frame rate is greater than 60 FPS
    snackbarLogLong('Warning: This resolution and frame rate may not perform well on lower-end devices or slower connections!');
    // Set flag for video resolution and frame rate warning
    resFpsWarning = true;
  } else if (resFpsWarning && (chosenResolutionWidth <= '1920' || chosenResolutionHeight <= '1080' || chosenFramerate <= '60')) {
    // Reset the flag for video resolution and frame rate warning if the condition goes back to normal (1080p and 60 FPS)
    resFpsWarning = false;
  }
}

function saveBitrate() {
  var chosenBitrate = $('#bitrateSlider').val();
  $('#selectBitrate').text(chosenBitrate + ' Mbps');
  console.log('%c[index.js, saveBitrate]', 'color: green;', 'Saving bitrate value: ' + chosenBitrate);
  storeData('bitrate', chosenBitrate, null);

  // Trigger warning check after changing video bitrate
  warnBitrate();
}

function warnBitrate() {
  var chosenBitrate = $('#bitrateSlider').val();

  // Video bitrate warning
  if (!bitrateWarning && chosenBitrate > 100) {
    // Warn only if video bitrate is greater than 100 Mbps
    snackbarLogLong('Warning: Higher bitrate may cause playback interruptions and performance issues, please try with caution!');
    // Set flag for video bitrate warning
    bitrateWarning = true;
  } else if (bitrateWarning && chosenBitrate <= 100) {
    // Reset the flag for video bitrate warning if the condition goes back to normal (100 Mbps)
    bitrateWarning = false;
  }
}

function standardBitratePresets() {
  console.log('%c[index.js, standardBitratePresets]', 'color: green;', 'Applying standard bitrate presets...');
  var res = $('#selectResolution').data('value');
  var frameRate = $('#selectFramerate').data('value').toString();

  // Set the bitrate based on the selected resolution and frame rate
  if (res === '854:480') { // 480p
    if (frameRate === '30') { // 30 FPS
      $('#bitrateSlider')[0].MaterialSlider.change('2');
    } else if (frameRate === '60') { // 60 FPS
      $('#bitrateSlider')[0].MaterialSlider.change('4');
    } else if (frameRate === '90') { // 90 FPS
      $('#bitrateSlider')[0].MaterialSlider.change('5');
    } else if (frameRate === '120') { // 120 FPS
      $('#bitrateSlider')[0].MaterialSlider.change('6');
    } else if (frameRate === '144') { // 144 FPS
      $('#bitrateSlider')[0].MaterialSlider.change('8');
    }
  } else if (res === '1280:720') { // 720p
    if (frameRate === '30') { // 30 FPS
      $('#bitrateSlider')[0].MaterialSlider.change('5');
    } else if (frameRate === '60') { // 60 FPS
      $('#bitrateSlider')[0].MaterialSlider.change('10');
    } else if (frameRate === '90') { // 90 FPS
      $('#bitrateSlider')[0].MaterialSlider.change('12');
    } else if (frameRate === '120') { // 120 FPS
      $('#bitrateSlider')[0].MaterialSlider.change('15');
    } else if (frameRate === '144') { // 144 FPS
      $('#bitrateSlider')[0].MaterialSlider.change('18');
    }
  } else if (res === '1920:1080') { // 1080p
    if (frameRate === '30') { // 30 FPS
      $('#bitrateSlider')[0].MaterialSlider.change('10');
    } else if (frameRate === '60') { // 60 FPS
      $('#bitrateSlider')[0].MaterialSlider.change('20');
    } else if (frameRate === '90') { // 90 FPS
      $('#bitrateSlider')[0].MaterialSlider.change('25');
    } else if (frameRate === '120') { // 120 FPS
      $('#bitrateSlider')[0].MaterialSlider.change('30');
    } else if (frameRate === '144') { // 144 FPS
      $('#bitrateSlider')[0].MaterialSlider.change('35');
    }
  } else if (res === '2560:1440') { // 1440p
    if (frameRate === '30') { // 30 FPS
      $('#bitrateSlider')[0].MaterialSlider.change('20');
    } else if (frameRate === '60') { // 60 FPS
      $('#bitrateSlider')[0].MaterialSlider.change('40');
    } else if (frameRate === '90') { // 90 FPS
      $('#bitrateSlider')[0].MaterialSlider.change('50');
    } else if (frameRate === '120') { // 120 FPS
      $('#bitrateSlider')[0].MaterialSlider.change('60');
    } else if (frameRate === '144') { // 144 FPS
      $('#bitrateSlider')[0].MaterialSlider.change('70');
    }
  } else if (res === '3840:2160') { // 2160p
    if (frameRate === '30') { // 30 FPS
      $('#bitrateSlider')[0].MaterialSlider.change('40');
    } else if (frameRate === '60') { // 60 FPS
      $('#bitrateSlider')[0].MaterialSlider.change('80');
    } else if (frameRate === '90') { // 90 FPS
      $('#bitrateSlider')[0].MaterialSlider.change('100');
    } else if (frameRate === '120') { // 120 FPS
      $('#bitrateSlider')[0].MaterialSlider.change('120');
    } else if (frameRate === '144') { // 144 FPS
      $('#bitrateSlider')[0].MaterialSlider.change('140');
    }
  } else {
    // Unrecognized option! In case someone screws with the JS to add custom resolutions.
    $('#bitrateSlider')[0].MaterialSlider.change('10');
  }

  // Update the bitrate value
  saveBitrate();
}

function optimizeBitratePresets() {
  console.log('%c[index.js, optimizeBitratePresets]', 'color: green;', 'Applying optimize bitrate presets...');
  var width = parseInt($('#selectResolution').data('value').split(':')[0]);
  var height = parseInt($('#selectResolution').data('value').split(':')[1]);
  var frameRate = $('#selectFramerate').data('value').toString();
  var videoCodec = $('#selectCodec').data('value').toString();
  var hdrMode = $('#hdrModeSwitch').parent().hasClass('is-checked') ? 1 : 0;

  // Multiplier to adjust bitrate based on codec efficiency
  // Sweet-spot formula reference: https://www.reddit.com/r/MoonlightStreaming/comments/1gg2cdy/sweet_spot_bitrate/
  var codecMultiplier = {
    "H264": 1.0,
    "HEVC": 0.6,
    "AV1": 0.4
  }[videoCodec];

  // Bitrate factor depends on HDR state
  var bitrateFactor = hdrMode ? 6630.5 : 8309;

  // Calculate optimized bitrate based on resolution, framerate, codec efficiency, and HDR state
  var baseBitrate = width * height * frameRate / bitrateFactor;
  var finalBitrate = Math.round(baseBitrate * codecMultiplier);

  // Apply the default bitrate value in case of invalid calculation
  if (finalBitrate <= 0) {
    finalBitrate = 10;
  }

  // Set the bitrate slider value based on the calculated optimized bitrate
  $('#bitrateSlider')[0].MaterialSlider.change(finalBitrate / 1000);

  // Update the bitrate value
  saveBitrate();
}

function saveFramePacing() {
  setTimeout(() => {
    const chosenFramePacing = $('#framePacingSwitch').parent().hasClass('is-checked');
    console.log('%c[index.js, saveFramePacing]', 'color: green;', 'Saving frame pacing state: ' + chosenFramePacing);
    storeData('framePacing', chosenFramePacing, null);
  }, 100);
}

function saveLanguagePreference() {
  var chosenLanguage = $(this).data('value') || 'auto';
  $('#selectLanguage').text($(this).text()).attr('data-value', chosenLanguage).data('value', chosenLanguage);
  console.log('%c[index.js, saveLanguagePreference]', 'color: green;', 'Saving language preference value: ' + chosenLanguage);
  if (window.i18n && typeof window.i18n.applyLanguagePreference === 'function') {
    window.i18n.applyLanguagePreference(chosenLanguage).catch((error) => {
      console.warn('%c[index.js, saveLanguagePreference]', 'color: green;', 'Warning: failed to apply language: ' + error);
    });
  }
}

function saveIpAddressFieldMode() {
  setTimeout(() => {
    const chosenIpAddressFieldMode = $('#ipAddressFieldModeSwitch').parent().hasClass('is-checked');
    console.log('%c[index.js, saveIpAddressFieldMode]', 'color: green;', 'Saving IP address field mode state: ' + chosenIpAddressFieldMode);
    storeData('ipAddressFieldMode', chosenIpAddressFieldMode, null);
    updateAmbilightWledIpInputMode();
  }, 100);
}

const COLOR_THEME_DEFAULT = 'original';
const COLOR_THEME_IDS = ['original', 'black-orange', 'graphite-red', 'forest', 'midnight-violet'];
let activeColorTheme = COLOR_THEME_DEFAULT;
let focusedColorTheme = COLOR_THEME_DEFAULT;

function normalizeColorTheme(theme) {
  return COLOR_THEME_IDS.includes(theme) ? theme : COLOR_THEME_DEFAULT;
}

function syncColorThemeCards() {
  document.querySelectorAll('#themeSelector .theme-card').forEach((card) => {
    const theme = card.getAttribute('data-theme');
    card.classList.toggle('is-selected', theme === activeColorTheme);
    card.classList.toggle('is-focused-theme', theme === focusedColorTheme);
    card.setAttribute('aria-pressed', theme === activeColorTheme ? 'true' : 'false');
    const label = card.querySelector('span[data-i18n]');
    if (label) card.setAttribute('aria-label', label.textContent.trim());
  });
}

function setFocusedColorTheme(theme) {
  focusedColorTheme = normalizeColorTheme(theme);
  syncColorThemeCards();
}

function moveColorThemeFocus(direction) {
  const currentIndex = COLOR_THEME_IDS.indexOf(focusedColorTheme);
  const nextIndex = (currentIndex + direction + COLOR_THEME_IDS.length) % COLOR_THEME_IDS.length;
  setFocusedColorTheme(COLOR_THEME_IDS[nextIndex]);
}

function applyColorTheme(theme) {
  activeColorTheme = normalizeColorTheme(theme);
  focusedColorTheme = activeColorTheme;
  document.body.setAttribute('data-color-theme', activeColorTheme);
  syncColorThemeCards();
}

function saveColorTheme(theme) {
  const selectedTheme = normalizeColorTheme(theme);
  applyColorTheme(selectedTheme);
  storeData('colorTheme', selectedTheme, null);
}

function initializeColorThemeSelector() {
  const selector = document.getElementById('themeSelector');
  if (!selector) return;

  selector.addEventListener('focus', function() {
    setFocusedColorTheme(activeColorTheme);
  });

  selector.addEventListener('click', function(event) {
    const card = event.target.closest ? event.target.closest('.theme-card') : null;
    if (card && selector.contains(card)) {
      saveColorTheme(card.getAttribute('data-theme'));
    } else {
      saveColorTheme(focusedColorTheme);
    }
  });

}

function getDefaultAmbilightWledIp() {
  var localIp = '';
  try {
    if (typeof webapis !== 'undefined' && webapis.network &&
        typeof webapis.network.getIp === 'function') {
      localIp = webapis.network.getIp();
    }
  } catch (error) {
    console.warn('[ambilight] Could not detect the TV IPv4 address:', error);
  }

  var octets = String(localIp || '').split('.');
  var validIPv4 = octets.length === 4 && octets.every(function(octet) {
    return /^\d{1,3}$/.test(octet) && Number(octet) >= 0 && Number(octet) <= 255;
  });
  if (validIPv4 && octets[0] !== '0' && octets[0] !== '127' &&
      !(octets[0] === '169' && octets[1] === '254')) {
    octets[3] = Number(octets[3]) === 100 ? '101' : '100';
    return octets.join('.');
  }
  return '192.168.0.100';
}

function setAmbilightWledIpValue(ip) {
  var value = String(ip || getDefaultAmbilightWledIp()).trim();
  var octets = value.split('.');
  var validIPv4 = octets.length === 4 && octets.every(function(octet) {
    return /^\d{1,3}$/.test(octet) && Number(octet) >= 0 && Number(octet) <= 255;
  });
  if (!validIPv4) {
    value = getDefaultAmbilightWledIp();
    octets = value.split('.');
  }

  var textInput = document.getElementById('ambilightWledIpTextInput');
  if (textInput) {
    textInput.value = value;
    if (textInput.parentElement) {
      textInput.parentElement.classList.toggle('is-dirty', !!value);
    }
  }
  octets.forEach(function(octet, index) {
    var field = document.getElementById('ambilightWledIpField' + (index + 1));
    if (field) field.value = String(Number(octet));
  });
  return value;
}

function initAmbilightWledIpFields() {
  var defaultOctets = getDefaultAmbilightWledIp().split('.').map(Number);
  defaultOctets.forEach(function(value, index) {
    var field = document.getElementById('ambilightWledIpField' + (index + 1));
    if (field) populateSelectFields(field, 0, 255, value);
  });
  setAmbilightWledIpValue(defaultOctets.join('.'));
  updateAmbilightWledIpInputMode();
}

function getAmbilightWledIpValue() {
  if ($('#ipAddressFieldModeSwitch').prop('checked')) {
    return [1, 2, 3, 4].map(function(index) {
      return $('#ambilightWledIpField' + index).val();
    }).join('.');
  }
  return String($('#ambilightWledIpTextInput').val() || '').trim();
}

function updateAmbilightWledIpInputMode() {
  var useIPv4Fields = $('#ipAddressFieldModeSwitch').prop('checked') === true;
  var inputField = document.getElementById('ambilightWledIpInputField');
  var selectFields = document.getElementById('ambilightWledIpSelectFields');
  if (inputField) inputField.style.display = useIPv4Fields ? 'none' : 'block';
  if (selectFields) selectFields.style.display = useIPv4Fields ? 'block' : 'none';
}

function updateAmbilightSettingsVisibility() {
  var toggle = document.getElementById('ambilightSwitch');
  var ipContainer = document.getElementById('ambilightWledIpContainer');
  if (ipContainer) {
    ipContainer.style.display = toggle && toggle.checked ? 'block' : 'none';
  }
  updateAmbilightWledIpInputMode();
}

function updateAmbilightDescription() {
  var description = document.getElementById('ambilightDescription');
  if (!description) return;

  if (ambilightSupportState === 'checking') {
    description.textContent = t('Checking Ambilight support...');
  } else if (ambilightSupportState === 'supported') {
    description.textContent = t('Capture the Moonlight video plane and send live colors to your WLED device.');
  } else {
    description.textContent = '';
  }
}

function updateAmbilightAvailability(supported) {
  ambilightSupportState = supported ? 'supported' : 'unsupported';

  var toggle = document.getElementById('ambilightSwitch');
  var switchLabel = document.getElementById('ambilightBtn');
  var switchText = switchLabel && switchLabel.querySelector('.mdl-switch__label');

  updateAmbilightDescription();

  if (switchText && supported) {
    switchText.textContent = t('Enable Ambilight');
  }

  if (toggle) {
    if (!supported) {
      toggle.checked = false;
      if (switchLabel && switchLabel.MaterialSwitch) {
        switchLabel.MaterialSwitch.off();
        switchLabel.MaterialSwitch.disable();
      }
    } else if (switchLabel && switchLabel.MaterialSwitch) {
      switchLabel.MaterialSwitch.enable();
    }
    toggle.disabled = !supported;
    syncDisabledSwitchAppearance(toggle);
  }

  loadAmbilightPreferences();
}

function initializeAmbilightSupport() {
  if (ambilightInitializationPromise) return ambilightInitializationPromise;

  if (!window.moonlightAmbilight ||
      typeof window.moonlightAmbilight.initialize !== 'function') {
    updateAmbilightAvailability(false);
    ambilightInitializationPromise = Promise.resolve(false);
    return ambilightInitializationPromise;
  }

  ambilightInitializationPromise = window.moonlightAmbilight.initialize().then(function(supported) {
    updateAmbilightAvailability(supported === true);
    return supported === true;
  }).catch(function(error) {
    console.warn('[ambilight] Service/capture capability check failed:', error);
    updateAmbilightAvailability(false);
    return false;
  });

  return ambilightInitializationPromise;
}

function loadAmbilightPreferences() {
  getData('ambilightEnabled', function(data) {
    var enabled = ambilightSupportState === 'supported' &&
      !!(data && data.ambilightEnabled === true);
    var toggle = document.getElementById('ambilightSwitch');
    if (toggle) {
      toggle.checked = enabled;
      var label = document.getElementById('ambilightBtn');
      if (label && label.MaterialSwitch) {
        enabled ? label.MaterialSwitch.on() : label.MaterialSwitch.off();
        if (ambilightSupportState === 'supported') {
          label.MaterialSwitch.enable();
        } else {
          label.MaterialSwitch.disable();
        }
      }
      toggle.disabled = ambilightSupportState !== 'supported';
    }
    updateAmbilightSettingsVisibility();
  });

  getData('ambilightWledIp', function(data) {
    var hasSavedIp = data && typeof data.ambilightWledIp === 'string' &&
      data.ambilightWledIp.trim().length > 0;
    var savedIp = hasSavedIp ? data.ambilightWledIp : getDefaultAmbilightWledIp();
    setAmbilightWledIpValue(savedIp);
    if (!hasSavedIp) storeData('ambilightWledIp', savedIp, null);
    updateAmbilightWledIpInputMode();
  });
}

function saveAmbilightPreference() {
  window.setTimeout(function() {
    if (ambilightSupportState !== 'supported') {
      // Preview mode only reveals the remaining controls. It must not persist
      // an enabled preference or contact the optional native service.
      updateAmbilightSettingsVisibility();
      return;
    }

    var enabled = $('#ambilightSwitch').prop('checked') === true;
    storeData('ambilightEnabled', enabled, null);
    updateAmbilightSettingsVisibility();

    if (enabled) {
      if (isInGame) startAmbilightForStream();
    } else if (window.moonlightAmbilight) {
      window.moonlightAmbilight.stop().catch(function(error) {
        console.warn('[ambilight] Could not stop capture:', error);
      });
    }
  }, 100);
}

function saveAmbilightWledIp() {
  var ip = getAmbilightWledIpValue();
  storeData('ambilightWledIp', ip, null);

  if (ambilightSupportState === 'supported' &&
      $('#ambilightSwitch').prop('checked') === true && isInGame) {
    startAmbilightForStream();
  }
}

function startAmbilightForStream() {
  if (!window.moonlightAmbilight) return;

  return initializeAmbilightSupport().then(function(supported) {
    if (!supported) return null;
    getData('ambilightEnabled', function(enabledData) {
      if (!enabledData || enabledData.ambilightEnabled !== true) return;
      getData('ambilightWledIp', function(ipData) {
        var ip = ipData && ipData.ambilightWledIp;
        if (!ip) {
          console.warn('[ambilight] Enabled but no WLED IP address is configured.');
          return;
        }
        window.moonlightAmbilight.start(ip, 21324, 73).catch(function(error) {
          console.warn('[ambilight] Could not start capture:', error);
          if (window.moonlightAmbilight && !window.moonlightAmbilight.isSupported()) {
            updateAmbilightAvailability(false);
          }
        });
      });
    });
  });
}

function saveNavigationSoundPreference() {
  setTimeout(function() {
    const enabled = $('#navigationSoundSwitch').parent().hasClass('is-checked');
    navigationSoundPreferenceEnabled = enabled;
    console.log('%c[index.js, saveNavigationSoundPreference]', 'color: green;', 'Saving navigation sounds preference: ' + enabled);
    storeData('navigationSoundEnabled', enabled, null);
    if (typeof setNavigationSoundEnabled === 'function') {
      Promise.resolve(setNavigationSoundEnabled(enabled)).catch(function(error) {
        console.error('%c[index.js, saveNavigationSoundPreference]', 'color: red;', 'Could not apply navigation sounds preference:', error);
      });
    }
  }, 100);
}

function normalizeConfigSummaryPosition(value) {
  if (value === 'top' || value === 'bottom' || value === 'hidden') return value;
  // Migrate the boolean preference used by previous versions.
  if (value === false || value === 'false' || value === 0) return 'hidden';
  return 'bottom';
}

function applyConfigSummaryPosition(value) {
  var position = normalizeConfigSummaryPosition(value);
  var button = document.getElementById('selectConfigSummaryPosition');
  if (button) {
    var option = document.querySelector('.configSummaryPositionMenu li[data-value="' + position + '"]');
    if (option) button.textContent = option.textContent;
    button.setAttribute('data-value', position);
    $(button).data('value', position);
  }
  return position;
}

function saveConfigSummaryPosition() {
  var position = normalizeConfigSummaryPosition($(this).data('value'));
  var button = document.getElementById('selectConfigSummaryPosition');
  if (button) {
    button.textContent = this.textContent;
    button.setAttribute('data-value', position);
    $(button).data('value', position);
  }
  console.log('%c[index.js, saveConfigSummaryPosition]', 'color: green;', 'Saving configuration summary bar position: ' + position);
  storeData('showConfigSummaryBar', position, null);
  configSummaryPreferenceLoaded = true;
  updateConfigSummaryBar();
}

// Ambient interface background presets are keyed by stable values so additional
// animations can be registered without changing the persistence mechanism.
var AMBIENT_GAMEPAD_COUNT = 12;
var ambientWaveTemplate = null;
var ambientBubbleContainer = null;
var ambientBubbleElements = [];
var ambientBubbleAnimationInitialized = false;
var AMBIENT_SYMBOL_COUNT = 20;
var AMBIENT_SYMBOLS = ['joystick', 'missing_controller', 'connected_tv'];
var ambientSymbolsContainer = null;
var ambientSymbolElements = [];
var ambientSymbolsInitialized = false;

function randomAmbientBubbleValue(min, max) {
  return min + Math.random() * (max - min);
}

function initializeBubbleAnimation() {
  if (ambientBubbleAnimationInitialized) return;
  ambientBubbleContainer = document.getElementById('ambient-bubbles');
  if (!ambientBubbleContainer) return;

  var fragment = document.createDocumentFragment();
  var sizes = [];
  for (var i = 0; i < AMBIENT_GAMEPAD_COUNT; i++) {
    sizes.push(1 + (i / Math.max(1, AMBIENT_GAMEPAD_COUNT - 1)) * 14);
  }
  // Shuffle the evenly spaced sizes so their positions are not ordered.
  for (var j = sizes.length - 1; j > 0; j--) {
    var swapIndex = Math.floor(Math.random() * (j + 1));
    var temp = sizes[j];
    sizes[j] = sizes[swapIndex];
    sizes[swapIndex] = temp;
  }

  for (var i = 0; i < AMBIENT_GAMEPAD_COUNT; i++) {
    var element = document.createElement('span');
    var size = sizes[i];
    // Smaller icons rise faster; larger icons rise more slowly.
    var duration = 4 + ((size - 1) / 14) * 8;
    element.className = 'ambient-gamepad';
    element.textContent = 'stadia_controller';
    element.style.setProperty('--gamepad-left', randomAmbientBubbleValue(-5, 100) + '%');
    element.style.setProperty('--gamepad-size', size * Math.max(1, window.innerWidth || 1) / 100 + 'px');
    element.style.setProperty('--gamepad-duration', duration + 's');
    element.style.setProperty('--gamepad-delay', -randomAmbientBubbleValue(0, duration) + 's');
    element.style.setProperty('--gamepad-opacity', randomAmbientBubbleValue(0.2, 0.7));
    element.style.setProperty('--gamepad-blur', randomAmbientBubbleValue(0, 3) + 'px');
    element.style.setProperty('--gamepad-rotation', randomAmbientBubbleValue(0, 360) + 'deg');
    element.style.setProperty('--gamepad-rotation-direction', Math.random() < 0.5 ? '-180deg' : '180deg');
    fragment.appendChild(element);
    ambientBubbleElements.push(element);
  }
  ambientBubbleContainer.appendChild(fragment);
  ambientBubbleAnimationInitialized = true;
}

function startAmbientBubbleAnimation() {
  initializeBubbleAnimation();
  if (!ambientBubbleContainer) return;
  ambientBubbleContainer.classList.add('ambient-gamepads-active');
}

function stopAmbientBubbleAnimation() {
  if (ambientBubbleContainer) ambientBubbleContainer.classList.remove('ambient-gamepads-active');
}

function randomAmbientSymbolCell(excludedCells) {
  var available = [];
  for (var i = 0; i < AMBIENT_SYMBOL_COUNT; i++) {
    if (excludedCells.indexOf(i) === -1) available.push(i);
  }
  return available.length
    ? available[Math.floor(Math.random() * available.length)]
    : Math.floor(Math.random() * AMBIENT_SYMBOL_COUNT);
}

function configureAmbientSymbol(element, cell, stagger) {
  var column = cell % 5;
  var row = Math.floor(cell / 5);
  var jitterX = randomAmbientBubbleValue(-5, 5);
  var jitterY = randomAmbientBubbleValue(-5, 5);
  var duration = randomAmbientBubbleValue(4, 7);

  element.dataset.cell = String(cell);
  element.textContent = AMBIENT_SYMBOLS[Math.floor(Math.random() * AMBIENT_SYMBOLS.length)];
  element.style.setProperty('--symbol-left', ((column + 0.5) * 20 + jitterX) + '%');
  element.style.setProperty('--symbol-top', ((row + 0.5) * 25 + jitterY) + '%');
  element.style.setProperty('--symbol-size', randomAmbientBubbleValue(2.5, 13) * Math.max(1, window.innerWidth || 1) / 100 + 'px');
  element.style.setProperty('--symbol-duration', duration + 's');
  element.style.setProperty('--symbol-delay', stagger ? -randomAmbientBubbleValue(0, duration * 0.85) + 's' : '0s');
}

function recycleAmbientSymbol(element) {
  if (!ambientSymbolsContainer || !ambientSymbolsContainer.classList.contains('ambient-symbols-active')) return;

  var occupiedCells = ambientSymbolElements
    .filter(function(other) { return other !== element; })
    .map(function(other) { return parseInt(other.dataset.cell, 10); });
  configureAmbientSymbol(element, randomAmbientSymbolCell(occupiedCells), false);
  element.classList.remove('ambient-symbol-animating');
  void element.offsetWidth;
  element.classList.add('ambient-symbol-animating');
}

function initializeAmbientSymbols() {
  if (ambientSymbolsInitialized) return;
  ambientSymbolsContainer = document.getElementById('ambient-symbols');
  if (!ambientSymbolsContainer) return;

  var cells = [];
  for (var i = 0; i < AMBIENT_SYMBOL_COUNT; i++) cells.push(i);
  for (var j = cells.length - 1; j > 0; j--) {
    var swapIndex = Math.floor(Math.random() * (j + 1));
    var temp = cells[j];
    cells[j] = cells[swapIndex];
    cells[swapIndex] = temp;
  }

  var fragment = document.createDocumentFragment();
  for (var k = 0; k < AMBIENT_SYMBOL_COUNT; k++) {
    var element = document.createElement('span');
    element.className = 'ambient-symbol';
    configureAmbientSymbol(element, cells[k], true);
    element.addEventListener('animationend', function() {
      recycleAmbientSymbol(this);
    });
    fragment.appendChild(element);
    ambientSymbolElements.push(element);
  }
  ambientSymbolsContainer.appendChild(fragment);
  ambientSymbolsInitialized = true;
}

function startAmbientSymbolsAnimation() {
  initializeAmbientSymbols();
  if (!ambientSymbolsContainer) return;
  ambientSymbolsContainer.classList.add('ambient-symbols-active');
  ambientSymbolElements.forEach(function(element) {
    if (!element.classList.contains('ambient-symbol-animating')) {
      element.classList.add('ambient-symbol-animating');
    }
  });
}

function stopAmbientSymbolsAnimation() {
  if (ambientSymbolsContainer) ambientSymbolsContainer.classList.remove('ambient-symbols-active');
}

function destroyAmbientBackground(preset) {
  if (preset === 'waves') {
    var waveSvg = document.getElementById('ambient-wave-svg');
    if (waveSvg) {
      if (!ambientWaveTemplate) ambientWaveTemplate = waveSvg.cloneNode(true);
      if (waveSvg.parentNode) waveSvg.parentNode.removeChild(waveSvg);
    }
    return;
  }

  if (preset === 'bubbles') {
    stopAmbientBubbleAnimation();
    if (ambientBubbleContainer) {
      while (ambientBubbleContainer.firstChild) {
        ambientBubbleContainer.removeChild(ambientBubbleContainer.firstChild);
      }
    }
    ambientBubbleElements.length = 0;
    ambientBubbleAnimationInitialized = false;
    return;
  }

  if (preset === 'symbols') {
    stopAmbientSymbolsAnimation();
    if (ambientSymbolsContainer) {
      while (ambientSymbolsContainer.firstChild) {
        ambientSymbolsContainer.removeChild(ambientSymbolsContainer.firstChild);
      }
    }
    ambientSymbolElements.length = 0;
    ambientSymbolsInitialized = false;
  }
}

function restoreAmbientWaveBackground() {
  var waveWrapper = document.getElementById('ambient-trails');
  if (!waveWrapper || document.getElementById('ambient-wave-svg') || !ambientWaveTemplate) return;
  waveWrapper.appendChild(ambientWaveTemplate.cloneNode(true));
}

function updateAmbientBackgroundActivation(activate) {
  var mainUi = document.getElementById('main-ui-layer');
  if (!mainUi) return;

  // Hide ambient backgrounds immediately while entering Settings; restore them on content views.
  mainUi.classList.toggle('ambient-background-hidden', !activate);
  mainUi.setAttribute('data-ambient-background', ambientBackgroundPreset);
  Object.keys(AMBIENT_BACKGROUND_PRESETS).forEach(function(preset) {
    var presetClass = AMBIENT_BACKGROUND_PRESETS[preset];
    if (presetClass) mainUi.classList.remove(presetClass);
  });

  var activeClass = AMBIENT_BACKGROUND_PRESETS[ambientBackgroundPreset];
  if (activate && ambientBackgroundPreferenceLoaded && activeClass) {
    mainUi.classList.add(activeClass);
  }

  if (activate && ambientBackgroundPreferenceLoaded && ambientBackgroundPreset === 'waves') {
    restoreAmbientWaveBackground();
  }

  if (activate && ambientBackgroundPreferenceLoaded && ambientBackgroundPreset === 'bubbles') {
    startAmbientBubbleAnimation();
  } else {
    stopAmbientBubbleAnimation();
  }

  if (activate && ambientBackgroundPreferenceLoaded && ambientBackgroundPreset === 'symbols') {
    startAmbientSymbolsAnimation();
  } else {
    stopAmbientSymbolsAnimation();
  }
}

function applyAmbientBackgroundPreset(preset, persist) {
  var previousPreset = ambientBackgroundPreset;
  ambientBackgroundPreset = Object.prototype.hasOwnProperty.call(AMBIENT_BACKGROUND_PRESETS, preset)
    ? preset : 'waves';
  if (previousPreset !== ambientBackgroundPreset) {
    destroyAmbientBackground(previousPreset);
  }

  var selector = document.getElementById('selectAmbientBackground');
  if (selector) {
    var selectedOption = document.querySelector('.ambientBackgroundMenu .mdl-menu__item[data-value="' + ambientBackgroundPreset + '"]');
    var selectedLabel = selectedOption ? selectedOption.textContent.trim() : ambientBackgroundPreset;
    var presetLabelKey = ambientBackgroundPreset === 'none' ? 'None' :
      (ambientBackgroundPreset === 'bubbles' ? 'Bubbles' :
        (ambientBackgroundPreset === 'symbols' ? 'Symbols' : 'Waves'));
    selector.textContent = window.i18n && typeof window.i18n.t === 'function'
      ? window.i18n.t(presetLabelKey)
      : selectedLabel;
    selector.setAttribute('data-value', ambientBackgroundPreset);
    if (window.jQuery) $(selector).data('value', ambientBackgroundPreset);
  }

  var mainUi = document.getElementById('main-ui-layer');
  if (mainUi) mainUi.setAttribute('data-ambient-background', ambientBackgroundPreset);

  // Preserve the current screen's activation state while applying a new preset.
  var mainContent = document.getElementById('main-content');
  var contentScreenActive = mainUi &&
    !mainUi.classList.contains('ui-inactive') &&
    mainContent && !mainContent.classList.contains('settings-view-active');
  updateAmbientBackgroundActivation(!!contentScreenActive);

  if (persist) {
    storeData('ambientBackgroundPreset', ambientBackgroundPreset, null);
  }
}

function loadAmbientBackgroundPreference() {
  getData('ambientBackgroundPreset', function(previousValue) {
    var storedValue = previousValue && previousValue.ambientBackgroundPreset;
    ambientBackgroundPreferenceLoaded = true;
    applyAmbientBackgroundPreset(
      typeof storedValue === 'string' ? storedValue : 'waves',
      false
    );

    // Startup may have reached the Hosts view while the saved preference was loading.
    var mainUi = document.getElementById('main-ui-layer');
    if (mainUi && !mainUi.classList.contains('ui-inactive') &&
        !document.getElementById('settings-list').offsetParent) {
      updateAmbientBackgroundActivation(true);
    }
  });
}

function saveAmbientBackgroundPreset() {
  var chosenPreset = $(this).data('value');
  if (!chosenPreset) return;
  applyAmbientBackgroundPreset(chosenPreset, true);
}

function saveStreamTransitionBackground() {
  setTimeout(() => {
    streamTransitionBackgroundEnabled = $('#streamTransitionBackgroundSwitch').parent().hasClass('is-checked');
    console.log('%c[index.js, saveStreamTransitionBackground]', 'color: green;', 'Saving animated stream transition background: ' + streamTransitionBackgroundEnabled);
    storeData('streamTransitionBackground', streamTransitionBackgroundEnabled, null);
  }, 100);
}

function saveScreensaverPreference() {
  setTimeout(function() {
    screensaverPreferenceEnabled = $('#screensaverSwitch').parent().hasClass('is-checked');
    console.log('%c[index.js, saveScreensaverPreference]', 'color: green;', 'Saving screensaver preference: ' + screensaverPreferenceEnabled);
    storeData('screensaverEnabled', screensaverPreferenceEnabled, null);
    if (typeof setScreensaverEnabled === 'function') setScreensaverEnabled(screensaverPreferenceEnabled);
  }, 100);
}

function saveDiscoverNewHostsAtStartup() {
  setTimeout(() => {
    const enabled = $('#discoverNewHostsAtStartupSwitch').parent().hasClass('is-checked');
    console.log('%c[index.js, saveDiscoverNewHostsAtStartup]', 'color: green;', 'Saving startup host discovery state: ' + enabled);
    storeData('discoverNewHostsAtStartup', enabled, null);
  }, 100);
}

function saveSortAppsList() {
  setTimeout(() => {
    const chosenSortAppsList = $('#sortAppsListSwitch').parent().hasClass('is-checked');
    console.log('%c[index.js, saveSortAppsList]', 'color: green;', 'Saving sort apps list state: ' + chosenSortAppsList);
    storeData('sortAppsList', chosenSortAppsList, null);
    
    // Instantly update the Smart Hub Preview to reflect the new sort order
    let updated = false;
    Object.keys(_previewApps).forEach(function(serverUid) {
      if (_previewApps[serverUid] && _previewApps[serverUid].apps) {
        _previewApps[serverUid].apps = sortAppsForHost({ serverUid: serverUid }, _previewApps[serverUid].apps);
        updated = true;
      }
    });
    if (updated) {
      savePreviewApps();
      updatePreviewData();
    }
  }, 100);
}

function saveSortAppsByUsage() {
  setTimeout(() => {
    const enabled = $('#sortAppsByUsageSwitch').parent().hasClass('is-checked');
    storeData('sortAppsByUsage', enabled, null);
    let updated = false;
    Object.keys(_previewApps).forEach(function(serverUid) {
      if (_previewApps[serverUid] && Array.isArray(_previewApps[serverUid].apps)) {
        _previewApps[serverUid].apps = sortAppsForHost({ serverUid: serverUid }, _previewApps[serverUid].apps);
        updated = true;
      }
    });
    if (updated) {
      savePreviewApps();
      updatePreviewData();
    }
  }, 100);
}

function saveOptimizeGames() {
  setTimeout(() => {
    const chosenOptimizeGames = $('#optimizeGamesSwitch').parent().hasClass('is-checked');
    console.log('%c[index.js, saveOptimizeGames]', 'color: green;', 'Saving optimize games state: ' + chosenOptimizeGames);
    storeData('optimizeGames', chosenOptimizeGames, null);
  }, 100);
}

function saveQuitAppAfterDisconnect() {
  setTimeout(() => {
    const enabled = $('#quitAppAfterDisconnectSwitch').parent().hasClass('is-checked');
    console.log('%c[index.js, saveQuitAppAfterDisconnect]', 'color: green;', 'Saving quit host app on disconnect: ' + enabled);
    storeData('quitAppAfterDisconnect', enabled, null);
  }, 100);
}

function saveRumbleFeedback() {
  setTimeout(() => {
    const chosenRumbleFeedback = $('#rumbleFeedbackSwitch').parent().hasClass('is-checked');
    console.log('%c[index.js, saveRumbleFeedback]', 'color: green;', 'Saving rumble feedback state: ' + chosenRumbleFeedback);
    storeData('rumbleFeedback', chosenRumbleFeedback, null);
  }, 100);
}

function saveMouseEmulation() {
  setTimeout(() => {
    const chosenMouseEmulation = $('#mouseEmulationSwitch').parent().hasClass('is-checked');
    console.log('%c[index.js, saveMouseEmulation]', 'color: green;', 'Saving mouse emulation state: ' + chosenMouseEmulation);
    storeData('mouseEmulation', chosenMouseEmulation, null);
  }, 100);
}

function saveSelectHoldStreamMenu() {
  setTimeout(() => {
    const enabled = $('#selectHoldStreamMenuSwitch').parent().hasClass('is-checked');
    console.log('%c[index.js, saveSelectHoldStreamMenu]', 'color: green;', 'Saving Select hold stream menu state: ' + enabled);
    storeData('selectHoldStreamMenu', enabled, null);
  }, 100);
}

function saveFlipABfaceButtons() {
  setTimeout(() => {
    const chosenFlipABfaceButtons = $('#flipABfaceButtonsSwitch').parent().hasClass('is-checked');
    console.log('%c[index.js, saveFlipABfaceButtons]', 'color: green;', 'Saving flip A/B face buttons state: ' + chosenFlipABfaceButtons);
    storeData('flipABfaceButtons', chosenFlipABfaceButtons, null);
  }, 100);
}

function saveFlipXYfaceButtons() {
  setTimeout(() => {
    const chosenFlipXYfaceButtons = $('#flipXYfaceButtonsSwitch').parent().hasClass('is-checked');
    console.log('%c[index.js, saveFlipXYfaceButtons]', 'color: green;', 'Saving flip X/Y face buttons state: ' + chosenFlipXYfaceButtons);
    storeData('flipXYfaceButtons', chosenFlipXYfaceButtons, null);
  }, 100);
}

function saveAudioBackend() {
  var chosenAudioBackend = String($(this).data('value') || '');
  var engine = String($('#selectStreamingEngine').data('value') || 'EMSS');
  var dolbyEnabled = $('#ac3AudioModeSwitch').parent().hasClass('is-checked');
  var allowed = engine === 'ESPLUSPLAYER'
    ? ['ESPLUSPLAYER', 'Disabled']
    : (dolbyEnabled ? ['EMSS', 'Disabled'] : ['EMSS', 'WebAudio', 'Disabled']);
  if (allowed.indexOf(chosenAudioBackend) === -1) return;

  // An explicit choice made while Dolby is active replaces the backend that
  // was automatically saved before enabling Dolby.
  if (engine === 'EMSS' && dolbyEnabled) {
    audioBackendBeforeAc3Preference = null;
    storeData('audioBackendBeforeAc3', null, null);
  }
  setAudioSelectorValue('#selectAudioBackend', '.audioBackendMenu', chosenAudioBackend);
  console.log('%c[index.js, saveAudioBackend]', 'color: green;', 'Saving audioBackend value: ' + chosenAudioBackend);
  storeData('audioBackend', chosenAudioBackend, null);
  updateAudioBackendSettings();
  updateDolbyAudioAdvancedSettings();
}

function setAudioButtonEnabled(selector, enabled) {
  $(selector).prop('disabled', !enabled)
    .toggleClass('mdl-button--disabled', !enabled)
    .attr('aria-disabled', enabled ? 'false' : 'true')
    .attr('tabindex', enabled ? '0' : '-1');
}

function setAudioSwitchEnabled(labelSelector, inputSelector, enabled) {
  var label = $(labelSelector)[0];
  var input = $(inputSelector)[0];
  var component = label && label.MaterialSwitch;
  if (component) {
    if (enabled && typeof component.enable === 'function') component.enable();
    else if (!enabled && typeof component.disable === 'function') component.disable();
  } else if (input) {
    input.disabled = !enabled;
  }
  if (input) input.setAttribute('aria-disabled', enabled ? 'false' : 'true');
}

function setAudioSliderEnabled(selector, enabled) {
  var slider = $(selector)[0];
  if (slider && slider.MaterialSlider) {
    if (enabled && typeof slider.MaterialSlider.enable === 'function') slider.MaterialSlider.enable();
    else if (!enabled && typeof slider.MaterialSlider.disable === 'function') slider.MaterialSlider.disable();
  } else if (slider) {
    slider.disabled = !enabled;
  }
  if (slider) slider.setAttribute('aria-disabled', enabled ? 'false' : 'true');
}

// Keep backend-specific tuning visible only where it applies. Controls that
// become meaningless with Disabled remain visible but are visibly unavailable.
function updateAudioBackendSettings() {
  var audioEnabled = !isAudioOutputDisabled();
  var backend = String($('#selectAudioBackend').data('value') || 'EMSS');

  $('#audioConfigOption').show();
  $('#decryptHostAudioOption').show();

  if (backend === 'WebAudio') {
    $('#audioSyncOption').hide();
    $('#audioJitterOption').show();
  } else if (backend === 'ESPLUSPLAYER') {
    $('#audioSyncOption').hide();
    $('#audioJitterOption').hide();
  } else {
    $('#audioJitterOption').hide();
    $('#audioSyncOption').show();
  }

  // Audio on the host is independent of the TV audio route and stays usable.
  setAudioButtonEnabled('#selectAudio', audioEnabled);
  setAudioSwitchEnabled('#ac3AudioModeBtn', '#ac3AudioModeSwitch', audioEnabled);
  setAudioSwitchEnabled('#audioSyncBtn', '#audioSyncSwitch', audioEnabled && backend === 'EMSS');
  setAudioSliderEnabled('#jitterSlider', audioEnabled && backend === 'WebAudio');
  setAudioButtonEnabled('#selectAudioJitter', audioEnabled && backend === 'WebAudio');
  setAudioSwitchEnabled('#decryptHostAudioBtn', '#decryptHostAudioSwitch', audioEnabled);

  updateDolbyAudioAdvancedSettings();
}

// Check whether the Web Audio backend is the currently selected audio backend
function isWebAudioBackendSelected() {
  return $('#selectAudioBackend').data('value') === 'WebAudio';
}

// Check whether the audio output is disabled in the audio backend setting
function isAudioOutputDisabled() {
  return $('#selectAudioBackend').data('value') === 'Disabled';
}

function saveAudioConfiguration() {
  var chosenAudioConfig = $(this).data('value');
  if ($('#ac3AudioModeSwitch').parent().hasClass('is-checked') && chosenAudioConfig === '71Surround') {
    chosenAudioConfig = '51Surround';
  }
  setAudioSelectorValue('#selectAudio', '.audioConfigMenu', chosenAudioConfig);
  console.log('%c[index.js, saveAudioConfiguration]', 'color: green;', 'Saving audioConfig value: ' + chosenAudioConfig);
  storeData('audioConfig', chosenAudioConfig, null);
  updateDolbyAudioAdvancedSettings();
}

// Update a backend/layout selector by its stable value, using the localized menu label.
function setAudioSelectorValue(buttonSelector, menuSelector, value) {
  const item = $(menuSelector + ' li').filter(function() {
    return String($(this).data('value')) === value;
  }).first();
  const label = item.length ? item.text() : value;
  $(buttonSelector).text(label).attr('data-value', value).data('value', value);
}

// Optical passthrough requires EMSS, but the channel layout remains the user's choice.
// Keep existing IDs and stored keys for preference compatibility.
function setDolbySelectorValue(buttonSelector, menuSelector, value) {
  const item = $(menuSelector + ' li').filter(function() {
    return String($(this).data('value')) === value;
  }).first();
  if (!item.length) return;
  $(buttonSelector).text(item.text()).attr('data-value', value).data('value', value);
}

function updateDolbyAudioAdvancedSettings() {
  const audioEnabled = !isAudioOutputDisabled();
  const engine = String($('#selectStreamingEngine').data('value') || 'EMSS');
  const dolbyEnabled = audioEnabled && $('#ac3AudioModeSwitch').parent().hasClass('is-checked');
  // These controls configure the EMSS Dolby track. ESPlusPlayer does not
  // currently consume either setting, so never expose them for that engine.
  const emssDolbyEnabled = engine === 'EMSS' && dolbyEnabled;
  const is51Selected = $('#selectAudio').data('value') === '51Surround';
  const layoutEnabled = emssDolbyEnabled && is51Selected;

  $('#dolbyChannelLayoutOption').toggle(emssDolbyEnabled);
  $('#selectDolbyChannelLayout')
    .prop('disabled', !layoutEnabled)
    .toggleClass('mdl-button--disabled', !layoutEnabled)
    .attr('aria-disabled', layoutEnabled ? 'false' : 'true')
    .attr('tabindex', layoutEnabled ? '0' : '-1');

  const decodingModeVisible = emssDolbyEnabled &&
    dolbyDecodingModeSupportChecked && dolbyDecodingModeSupported;
  $('#dolbyDecodingModeOption').toggle(decodingModeVisible);
  setAudioButtonEnabled('#selectDolbyDecodingMode', decodingModeVisible);
}

function initializeDolbyDecodingModeSupport(attempt) {
  attempt = attempt || 0;
  if (typeof Module !== 'undefined' && typeof Module.hasDecodingModeSupport === 'function') {
    try {
      dolbyDecodingModeSupported = Module.hasDecodingModeSupport() === true;
      dolbyDecodingModeSupportChecked = true;
    } catch (error) {
      dolbyDecodingModeSupported = false;
      dolbyDecodingModeSupportChecked = true;
      console.warn('Could not query EMSS decoding-mode support:', error);
    }
    updateDolbyAudioAdvancedSettings();
    return;
  }
  if (attempt < 50) {
    window.setTimeout(function() { initializeDolbyDecodingModeSupport(attempt + 1); }, 100);
  } else {
    dolbyDecodingModeSupported = false;
    dolbyDecodingModeSupportChecked = true;
    updateDolbyAudioAdvancedSettings();
  }
}

function saveDolbyChannelLayout() {
  const value = String($(this).data('value') || 'Back');
  setDolbySelectorValue('#selectDolbyChannelLayout', '.dolbyChannelLayoutMenu', value);
  storeData('dolbyChannelLayout', value, null);
  updateDolbyAudioAdvancedSettings();
}

function saveDolbyDecodingMode() {
  const value = String($(this).data('value') || 'Hardware');
  setDolbySelectorValue('#selectDolbyDecodingMode', '.dolbyDecodingModeMenu', value);
  storeData('dolbyDecodingMode', value, null);
}

function setAudioBackendMenuAvailability(engine, dolbyEnabled) {
  var allowed = engine === 'ESPLUSPLAYER'
    ? ['ESPLUSPLAYER', 'Disabled']
    : (dolbyEnabled ? ['EMSS', 'Disabled'] : ['EMSS', 'WebAudio', 'Disabled']);

  $('.audioBackendMenu li').each(function() {
    var visible = allowed.indexOf(String($(this).data('value'))) !== -1;
    $(this).toggle(visible);
    this.setAttribute('aria-hidden', visible ? 'false' : 'true');
  });

  // Every mode has at least two valid choices; keep the selector interactive.
  $('#selectAudioBackend').prop('disabled', false)
    .removeClass('mdl-button--disabled')
    .attr('aria-disabled', 'false')
    .attr('tabindex', '0');
}

function applyAudioBackendPolicy(reason) {
  var engine = String($('#selectStreamingEngine').data('value') || 'EMSS');
  var dolbyEnabled = $('#ac3AudioModeSwitch').parent().hasClass('is-checked');
  var backend = String($('#selectAudioBackend').data('value') || 'EMSS');

  if (engine === 'ESPLUSPLAYER') {
    // ESPlusPlayer owns both media tracks. DD must never redirect audio to EMSS.
    if (reason === 'startup' && audioBackendBeforeESPlusPlayerPreference == null) {
      audioBackendBeforeESPlusPlayerPreference = backend === 'ESPLUSPLAYER' ? 'EMSS' : backend;
      storeData('audioBackendBeforeWmp', audioBackendBeforeESPlusPlayerPreference, null);
    }
    if (backend !== 'ESPLUSPLAYER' && backend !== 'Disabled') backend = 'ESPLUSPLAYER';
  } else {
    if (reason === 'leave-esplusplayer' || (reason === 'startup' && audioBackendBeforeESPlusPlayerPreference != null)) {
      backend = audioBackendBeforeESPlusPlayerPreference || 'EMSS';
      audioBackendBeforeESPlusPlayerPreference = null;
      storeData('audioBackendBeforeWmp', null, null);
    }

    if (dolbyEnabled) {
      if (backend === 'WebAudio') {
        if (audioBackendBeforeAc3Preference == null) {
          audioBackendBeforeAc3Preference = 'WebAudio';
          storeData('audioBackendBeforeAc3', 'WebAudio', null);
        }
        backend = 'EMSS';
      } else if (backend === 'ESPLUSPLAYER') {
        backend = 'EMSS';
      }
    } else if (audioBackendBeforeAc3Preference != null &&
               (reason === 'disable-dolby' || reason === 'startup' || reason === 'leave-esplusplayer')) {
      backend = audioBackendBeforeAc3Preference;
      audioBackendBeforeAc3Preference = null;
      storeData('audioBackendBeforeAc3', null, null);
    }
  }

  var allowed = engine === 'ESPLUSPLAYER'
    ? ['ESPLUSPLAYER', 'Disabled']
    : (dolbyEnabled ? ['EMSS', 'Disabled'] : ['EMSS', 'WebAudio', 'Disabled']);
  if (allowed.indexOf(backend) === -1) backend = engine === 'ESPLUSPLAYER' ? 'ESPLUSPLAYER' : 'EMSS';

  setAudioSelectorValue('#selectAudioBackend', '.audioBackendMenu', backend);
  storeData('audioBackend', backend, null);
  setAudioBackendMenuAvailability(engine, dolbyEnabled);
  updateAudioBackendSettings();
}

function completeAudioBackendPolicyLoad() {
  var state = audioBackendPolicyLoadState;
  if (!state.streamingEngine || !state.audioBackend || !state.ac3AudioMode ||
      !state.beforeESPlusPlayer || !state.beforeAc3) return;
  updateAc3AudioModeUI($('#ac3AudioModeSwitch').parent().hasClass('is-checked'), 'startup');
}

function updateAc3AudioModeUI(enabled, reason) {
  if (enabled) {
    $('.audioConfigMenu li[data-optical-incompatible="true"]').hide();
    if ($('#selectAudio').data('value') === '71Surround') {
      setAudioSelectorValue('#selectAudio', '.audioConfigMenu', '51Surround');
      storeData('audioConfig', '51Surround', null);
    }
  } else {
    $('.audioConfigMenu li[data-optical-incompatible="true"]').show();
  }

  applyAudioBackendPolicy(reason || 'refresh');
  updateAudioBackendSettings();
}

function saveAc3AudioMode() {
  setTimeout(function() {
    var chosenAc3Mode = $('#ac3AudioModeSwitch').parent().hasClass('is-checked');
    var engine = String($('#selectStreamingEngine').data('value') || 'EMSS');
    console.log('%c[index.js, saveAc3AudioMode]', 'color: green;', 'Saving AC-3 audio mode state: ' + chosenAc3Mode);
    storeData('ac3AudioMode', chosenAc3Mode, null);

    // DD controls format negotiation, not the playback engine. ESPlusPlayer remains
    // the sole audio/video backend regardless of the DD switch.
    if (engine !== 'ESPLUSPLAYER' && chosenAc3Mode &&
        $('#selectAudioBackend').data('value') === 'WebAudio') {
      audioBackendBeforeAc3Preference = 'WebAudio';
      storeData('audioBackendBeforeAc3', 'WebAudio', null);
    }
    updateAc3AudioModeUI(chosenAc3Mode, chosenAc3Mode ? 'enable-dolby' : 'disable-dolby');
  }, 100);
}

function saveAudioSync() {
  setTimeout(() => {
    const chosenAudioSync = $('#audioSyncSwitch').parent().hasClass('is-checked');
    console.log('%c[index.js, saveAudioSync]', 'color: green;', 'Saving audio sync state: ' + chosenAudioSync);
    storeData('audioSync', chosenAudioSync, null);
  }, 100);
}

function saveAudioJitter() {
  var chosenAudioJitter = $('#jitterSlider').val();
  $('#selectAudioJitter').text(chosenAudioJitter + ' ms');
  console.log('%c[index.js, saveAudioJitter]', 'color: green;', 'Saving audio jitter buffer: ' + chosenAudioJitter);
  storeData('audioJitter', chosenAudioJitter, null);
}

function savePlayHostAudio() {
  setTimeout(() => {
    const chosenPlayHostAudio = $('#playHostAudioSwitch').parent().hasClass('is-checked');
    console.log('%c[index.js, savePlayHostAudio]', 'color: green;', 'Saving play host audio state: ' + chosenPlayHostAudio);
    storeData('playHostAudio', chosenPlayHostAudio, null);
  }, 100);
}

function saveDecryptHostAudio() {
  setTimeout(() => {
    const chosenDecryptHostAudio = $('#decryptHostAudioSwitch').parent().hasClass('is-checked');
    console.log('%c[index.js, saveDecryptHostAudio]', 'color: green;', 'Saving decrypt host audio state: ' + chosenDecryptHostAudio);
    storeData('decryptHostAudio', chosenDecryptHostAudio, null);

    // Warning when enabling decrypt host audio for non-Wolf/Punktfunk-style hosts
    if (chosenDecryptHostAudio) {
      // Show a warning message when enabling decrypt host audio
      snackbarLogLong('Warning: Enable this only for Wolf or Punktfunk-style hosts, and leave it disabled for Sunshine or GameStream hosts to avoid audio streaming issues!');
    }
  }, 100);
}

function saveVideoCodec() {
  var chosenVideoCodec = $(this).data('value');

  updateVideoCodec(this, chosenVideoCodec);
  updateHdrControlState();
  updateH264LevelControlState();
}

function normalizeH264LevelId(value) {
  const level = value == null ? 'Auto' : String(value).trim();
  return level === 'Auto' ? 'Auto' : level.replace(/\./g, '_');
}

function saveH264Level() {
  var chosenLevel = normalizeH264LevelId($(this).data('value'));
  $('#selectH264Level').text($(this).text())
    .attr('data-value', chosenLevel).data('value', chosenLevel);
  console.log('%c[index.js, saveH264Level]', 'color: green;', 'Saving H.264 level override: ' + chosenLevel);
  storeData('h264Level', chosenLevel, null);
}

function updateH264LevelControlState() {
  const button = document.getElementById('selectH264Level');
  if (!button) return;

  const enabled = $('#selectCodec').data('value') === 'H264';
  button.disabled = !enabled;
  button.setAttribute('aria-disabled', String(!enabled));
  button.classList.toggle('is-disabled', !enabled);
}

function updateHdrControlState() {
  const hdrInput = document.getElementById('hdrModeSwitch');
  const hdrSwitch = document.getElementById('hdrModeBtn');
  const isH264 = $('#selectCodec').data('value') === 'H264';
  const isUnavailable = isH264 || isHdrCapable === false;

  if (!hdrInput || !hdrSwitch) return;

  // HDR requires a compatible codec. Disable it for the TV only when lack of HDR is confirmed.
  if (isUnavailable && hdrInput.checked) {
    if (hdrSwitch.MaterialSwitch) {
      hdrSwitch.MaterialSwitch.off();
    } else {
      hdrInput.checked = false;
    }
    updateHdrMode();
  }

  // Update both the native input and MDL's own disabled state. Changing only
  // input.disabled leaves MDL's is-disabled class behind on some builds.
  hdrInput.disabled = isUnavailable;
  if (hdrSwitch.MaterialSwitch) {
    if (isUnavailable) {
      hdrSwitch.MaterialSwitch.disable();
    } else {
      hdrSwitch.MaterialSwitch.enable();
    }
  }
  syncDisabledSwitchAppearance(hdrInput);
}

function updateVideoCodec(chosenCodecId, chosenCodecValue) {
  $('#selectCodec').text($(chosenCodecId).text()).attr('data-value', chosenCodecValue).data('value', chosenCodecValue);
  console.log('%c[index.js, updateVideoCodec]', 'color: green;', 'Saving video codec value: ' + chosenCodecValue);
  storeData('videoCodec', chosenCodecValue, null);

  updateH264FramerateConstraint();

  // Update the bitrate value based on the selected codec
  if ($('#optimizeBitrateSwitch').prop('checked')) {
    optimizeBitratePresets();
  }
  // Trigger warning check after changing video codec
  warnVideoCodec();
}

function warnVideoCodec() {
  var chosenVideoCodec = $('#selectCodec').data('value');

  // Video codec warning
  if (!codecWarning && (chosenVideoCodec === 'AV1')) {
    // Warn only if video codec is selected to AV1
    snackbarLogLong('Warning: Selected codec may not be supported by your host PC and may significantly slow down performance!');
    // Set flag for video codec warning
    codecWarning = true;
  } else if (codecWarning && (chosenVideoCodec === 'HEVC' || chosenVideoCodec === 'H264')) {
    // Reset the flag for video codec warning if the condition goes back to normal (HEVC or H.264)
    codecWarning = false;
  }
}

function saveHdrMode() {
  setTimeout(() => {
    var selectedVideoCodec = $('#selectCodec').data('value');
    const chosenH264Codec = $('#h264').data('value');
    const chosenHevcCodec = $('#hevc').data('value');
    const chosenAv1Codec = $('#av1').data('value');

    // Handle HDR mode switch based on the selected codec
    if (selectedVideoCodec === chosenH264Codec) { // H.264
      // H.264 does not support HDR profile, so stay on H.264 codec
      snackbarLog('H.264 codec does not support the HDR profile.');
      // Turn off the HDR mode switch and save the state
      document.querySelector('#hdrModeBtn').MaterialSwitch.off();
      updateHdrMode();
    } else if (selectedVideoCodec === chosenHevcCodec) { // HEVC
      // Select the HDR profile of the HEVC codec (HEVC Main10)
      // Toggle the HDR mode switch and save the state
      updateHdrMode();
    } else if (selectedVideoCodec === chosenAv1Codec) { // AV1
      // Select the HDR profile of the AV1 codec (AV1 Main10)
      // Toggle the HDR mode switch and save the state
      updateHdrMode();
    } else { // Undefined
      // Unknown codec format does not support HDR profile
      snackbarLog('Selected codec does not support the HDR profile.');
      // Turn off the HDR mode switch and save the state
      document.querySelector('#hdrModeBtn').MaterialSwitch.off();
      updateHdrMode();
    }
  }, 100);
}

function updateHdrMode() {
  setTimeout(() => {
    const chosenHdrMode = $('#hdrModeSwitch').parent().hasClass('is-checked');
    console.log('%c[index.js, updateHdrMode]', 'color: green;', 'Saving HDR mode state: ' + chosenHdrMode);
    storeData('hdrMode', chosenHdrMode, null);

    // Update the bitrate value based on the selected HDR state
    if ($('#optimizeBitrateSwitch').prop('checked')) {
      optimizeBitratePresets();
    }
  }, 100);
}

function saveFullRange() {
  setTimeout(() => {
    const chosenFullRange = $('#fullRangeSwitch').parent().hasClass('is-checked');
    console.log('%c[index.js, saveFullRange]', 'color: green;', 'Saving full range state: ' + chosenFullRange);
    storeData('fullRange', chosenFullRange, null);
  }, 100);
}

function saveGameMode() {
  setTimeout(() => {
    const chosenGameMode = $('#gameModeSwitch').parent().hasClass('is-checked');
    console.log('%c[index.js, saveGameMode]', 'color: green;', 'Saving game mode state: ' + chosenGameMode);
    storeData('gameMode', chosenGameMode, null);

    // Check if the Tizen version is 9.0 or higher and the Game Mode is turned on
    if (parseFloat(platformVer) >= 9.0 && chosenGameMode) {
      // Show a warning dialog when turning on Game Mode on Tizen 9.0 or higher
      setTimeout(() => {
        warningDialog(t('Compatibility Warning'),
          t('Game Mode (Ultra Low Latency) is not compatible with Tizen %1$s due to platform changes introduced by Samsung.', platformVer) + 
          t('Enabling this option may result in video freezing on the first rendered frame, black screen, unstable performance, and other streaming issues.<br><br>') + 
          t('For more information about this incompatibility and possible workarounds, please refer to the <b>Known Issues &amp; Limitations</b> documentation in this project.')
        );
      }, 250);
    } else if (parseFloat(platformVer) < 9.0 && !chosenGameMode) { // Check if the Tizen version is lower than 9.0 and the Game Mode is turned off
      // Show a warning message when turning off Game Mode on compatible Tizen versions
      snackbarLogLong('Warning: Disabling game mode may increase latency and affect your game streaming performance!');
    }
  }, 100);
}

function saveUnlockAllFps() {
  setTimeout(() => {
    const chosenUnlockAllFps = $('#unlockAllFpsSwitch').parent().hasClass('is-checked');
    console.log('%c[index.js, saveUnlockAllFps]', 'color: green;', 'Saving unlock all FPS state: ' + chosenUnlockAllFps);
    storeData('unlockAllFps', chosenUnlockAllFps, null);

    // Warning when enabling higher FPS options
    if (chosenUnlockAllFps) {
      // Show a warning message when enabling higher FPS options
      snackbarLogLong('Warning: Higher frame rates may not be fully supported by your TV and do not guarantee a smoother experience. Performance issues may occur due to platform limitations!');
    }
  }, 100);
}

function handleUnlockAllFps() {
  var currentFps = $('#selectFramerate').data('value');
  const addFramerate = $('.videoFramerateMenu').find('li[data-value="60"]');

  // Check if the Unlock all FPS switch is checked
  if ($('#unlockAllFpsSwitch').prop('checked')) {
    console.log('%c[index.js, handleUnlockAllFps]', 'color: green;', 'Adding higher framerate options: 90, 120, 144 FPS');
    // Check if any of the higher FPS options are absent to avoid duplicates
    if (!$('.videoFramerateMenu').find('li[data-value="90"], li[data-value="120"], li[data-value="144"]').length) {
      // Insert all higher FPS options in correct order (90, 120, 144)
      addFramerate.after(`
        <li class="mdl-menu__item" data-value="90" data-i18n="90 FPS">90 FPS</li>
        <li class="mdl-menu__item" data-value="120" data-i18n="120 FPS">120 FPS</li>
        <li class="mdl-menu__item" data-value="144" data-i18n="144 FPS">144 FPS</li>
      `);
      // Attach click listeners only to the newly added FPS options
      $('.videoFramerateMenu li[data-value="90"], li[data-value="120"], li[data-value="144"]').on('click', saveFramerate);
    }
  } else {
    console.log('%c[index.js, handleUnlockAllFps]', 'color: green;', 'Removing higher framerate options: 90, 120, 144 FPS');
    // If unchecked, remove the higher FPS options from the selection menu
    $('.videoFramerateMenu li[data-value="90"], li[data-value="120"], li[data-value="144"]').remove();
    // After removal, if a higher FPS option remains selected, then reset it to the default option
    if (['90', '120', '144'].includes(String(currentFps))) {
      $('#selectFramerate').text('60 FPS').attr('data-value', '60').data('value', '60');
      console.log('%c[index.js, handleUnlockAllFps]', 'color: green;', 'Resetting framerate value to 60 FPS');
      storeData('frameRate', '60', null);
      // Update the bitrate value based on the selected frame rate
      $('#optimizeBitrateSwitch').prop('checked') ? optimizeBitratePresets() : standardBitratePresets();
    }
  }
}

function saveOptimizeBitrate() {
  setTimeout(() => {
    const chosenOptimizeBitrate = $('#optimizeBitrateSwitch').parent().hasClass('is-checked');
    console.log('%c[index.js, saveOptimizeBitrate]', 'color: green;', 'Saving optimize bitrate state: ' + chosenOptimizeBitrate);
    storeData('optimizeBitrate', chosenOptimizeBitrate, null);

    // Update the bitrate value based on the selected preset mode
    chosenOptimizeBitrate ? optimizeBitratePresets() : standardBitratePresets();
  }, 100);
}

function saveDisableWarnings() {
  setTimeout(() => {
    const chosenDisableWarnings = $('#disableWarningsSwitch').parent().hasClass('is-checked');
    console.log('%c[index.js, saveDisableWarnings]', 'color: green;', 'Saving disable warnings state: ' + chosenDisableWarnings);
    storeData('disableWarnings', chosenDisableWarnings, null);
  }, 100);
}

const PERFORMANCE_STATS_POSITION_LABEL_KEYS = {
  'top-left': 'Top left',
  'top-right': 'Top right',
  'bottom-left': 'Bottom left',
  'bottom-right': 'Bottom right'
};

function setPerformanceStatsPosition(position, persist) {
  if (!Object.prototype.hasOwnProperty.call(PERFORMANCE_STATS_POSITION_LABEL_KEYS, position)) {
    position = 'top-left';
  }

  var labelKey = PERFORMANCE_STATS_POSITION_LABEL_KEYS[position];
  $('#selectPerformanceStatsPosition')
    .text(t(labelKey))
    .attr('data-i18n', labelKey)
    .attr('data-value', position)
    .data('value', position);

  var overlay = document.getElementById('performance-stats');
  if (overlay) {
    ['top-left', 'top-right', 'bottom-left', 'bottom-right'].forEach(function(corner) {
      overlay.classList.remove('performance-stats-position-' + corner);
    });
    overlay.classList.add('performance-stats-position-' + position);
  }

  if (persist) {
    storeData('performanceStatsPosition', position, null);
  }
  return position;
}

function savePerformanceStatsPosition() {
  setPerformanceStatsPosition($(this).data('value'), true);
}

function updatePerformanceStatsPositionAvailability(enabled) {
  var button = document.getElementById('selectPerformanceStatsPosition');
  if (!button) return;

  button.disabled = !enabled;
  button.setAttribute('aria-disabled', enabled ? 'false' : 'true');
  button.classList.toggle('is-disabled', !enabled);

}

function savePerformanceStats() {
  setTimeout(() => {
    const chosenPerformanceStats = $('#performanceStatsSwitch').parent().hasClass('is-checked');
    console.log('%c[index.js, savePerformanceStats]', 'color: green;', 'Saving performance stats state: ' + chosenPerformanceStats);
    storeData('performanceStats', chosenPerformanceStats, null);
    updatePerformanceStatsPositionAvailability(chosenPerformanceStats);
    if (!chosenPerformanceStats && Views.SelectPerformanceStatsPositionMenu.isActive()) {
      closePopupMenu('selectPerformanceStatsPosition');
      closeActiveVisibleMenu();
    }
  }, 100);
}

// Reset all settings to their default state and save the value data
function restoreDefaultsSettingsValues() {
  $('#selectStreamingEngine').text('EMSS').attr('data-value', 'EMSS').data('value', 'EMSS');
  storeData('streamingEngine', 'EMSS', null);

  const defaultResolution = '1280:720';
  $('#selectResolution').text('1280 x 720 (720p)').attr('data-value', defaultResolution).data('value', defaultResolution);
  storeData('resolution', defaultResolution, null);

  const defaultFramerate = '60';
  $('#selectFramerate').text('60 FPS').attr('data-value', defaultFramerate).data('value', defaultFramerate);
  storeData('frameRate', defaultFramerate, null);

  const defaultBitrate = '10';
  $('#selectBitrate').text(defaultBitrate + ' Mbps');
  $('#bitrateSlider')[0].MaterialSlider.change(defaultBitrate);
  storeData('bitrate', defaultBitrate, null);

  const defaultFramePacing = true;
  document.querySelector('#framePacingBtn').MaterialSwitch.on();
  storeData('framePacing', defaultFramePacing, null);

  const defaultIpAddressFieldMode = true;
  document.querySelector('#ipAddressFieldModeBtn').MaterialSwitch.on();
  storeData('ipAddressFieldMode', defaultIpAddressFieldMode, null);

  const defaultNavigationSoundEnabled = true;
  navigationSoundPreferenceEnabled = defaultNavigationSoundEnabled;
  document.querySelector('#navigationSoundBtn').MaterialSwitch.on();
  storeData('navigationSoundEnabled', defaultNavigationSoundEnabled, null);
  if (typeof setNavigationSoundEnabled === 'function') {
    Promise.resolve(setNavigationSoundEnabled(defaultNavigationSoundEnabled)).catch(function(error) {
      console.error('%c[index.js, restoreDefaultsSettingsValues]', 'color: red;', 'Could not restore navigation sounds:', error);
    });
  }

  const defaultShowConfigSummaryBar = 'bottom';
  applyConfigSummaryPosition(defaultShowConfigSummaryBar);
  storeData('showConfigSummaryBar', defaultShowConfigSummaryBar, null);
  configSummaryPreferenceLoaded = true;
  updateConfigSummaryBar();

  const defaultSelectHoldStreamMenu = true;
  document.querySelector('#selectHoldStreamMenuBtn').MaterialSwitch.on();
  storeData('selectHoldStreamMenu', defaultSelectHoldStreamMenu, null);

  const defaultStreamTransitionBackground = true;
  streamTransitionBackgroundEnabled = defaultStreamTransitionBackground;
  document.querySelector('#streamTransitionBackgroundBtn').MaterialSwitch.on();
  storeData('streamTransitionBackground', defaultStreamTransitionBackground, null);

  const defaultScreensaverEnabled = true;
  screensaverPreferenceEnabled = defaultScreensaverEnabled;
  document.querySelector('#screensaverBtn').MaterialSwitch.on();
  storeData('screensaverEnabled', defaultScreensaverEnabled, null);
  if (typeof setScreensaverEnabled === 'function') setScreensaverEnabled(defaultScreensaverEnabled);

  // Restore the default application color theme.
  applyColorTheme(COLOR_THEME_DEFAULT);
  storeData('colorTheme', COLOR_THEME_DEFAULT, null);

  const defaultDiscoverNewHostsAtStartup = true;
  document.querySelector('#discoverNewHostsAtStartupBtn').MaterialSwitch.on();
  storeData('discoverNewHostsAtStartup', defaultDiscoverNewHostsAtStartup, null);

  const defaultSortAppsList = false;
  document.querySelector('#sortAppsListBtn').MaterialSwitch.off();
  storeData('sortAppsList', defaultSortAppsList, null);

  const defaultSortAppsByUsage = false;
  document.querySelector('#sortAppsByUsageBtn').MaterialSwitch.off();
  storeData('sortAppsByUsage', defaultSortAppsByUsage, null);

  const defaultOptimizeGames = false;
  document.querySelector('#optimizeGamesBtn').MaterialSwitch.off();
  storeData('optimizeGames', defaultOptimizeGames, null);

  const defaultQuitAppAfterDisconnect = false;
  document.querySelector('#quitAppAfterDisconnectBtn').MaterialSwitch.off();
  storeData('quitAppAfterDisconnect', defaultQuitAppAfterDisconnect, null);

  const defaultRumbleFeedback = false;
  document.querySelector('#rumbleFeedbackBtn').MaterialSwitch.off();
  storeData('rumbleFeedback', defaultRumbleFeedback, null);

  const defaultMouseEmulation = false;
  document.querySelector('#mouseEmulationBtn').MaterialSwitch.off();
  storeData('mouseEmulation', defaultMouseEmulation, null);

  const defaultFlipABfaceButtons = false;
  document.querySelector('#flipABfaceButtonsBtn').MaterialSwitch.off();
  storeData('flipABfaceButtons', defaultFlipABfaceButtons, null);

  const defaultFlipXYfaceButtons = false;
  document.querySelector('#flipXYfaceButtonsBtn').MaterialSwitch.off();
  storeData('flipXYfaceButtons', defaultFlipXYfaceButtons, null);

  const defaultAc3AudioMode = false;
  document.querySelector('#ac3AudioModeBtn').MaterialSwitch.off();
  storeData('ac3AudioMode', defaultAc3AudioMode, null);
  audioBackendBeforeESPlusPlayerPreference = null;
  audioBackendBeforeAc3Preference = null;
  storeData('audioBackendBeforeWmp', null, null);
  storeData('audioBackendBeforeAc3', null, null);

  const defaultAudioBackend = 'EMSS';
  $('#selectAudioBackend').text('EMSS').attr('data-value', defaultAudioBackend).data('value', defaultAudioBackend);
  storeData('audioBackend', defaultAudioBackend, null);
  updateAc3AudioModeUI(false, 'startup');

  const defaultAudioConfig = 'Stereo';
  $('#selectAudio').text('Stereo').attr('data-value', defaultAudioConfig).data('value', defaultAudioConfig);
  storeData('audioConfig', defaultAudioConfig, null);

  const defaultAudioSync = false;
  document.querySelector('#audioSyncBtn').MaterialSwitch.off();
  storeData('audioSync', defaultAudioSync, null);

  const defaultAudioJitter = '100';
  $('#selectAudioJitter').text(defaultAudioJitter + ' ms');
  $('#jitterSlider')[0].MaterialSlider.change(defaultAudioJitter);
  storeData('audioJitter', defaultAudioJitter, null);

  const defaultPlayHostAudio = false;
  document.querySelector('#playHostAudioBtn').MaterialSwitch.off();
  storeData('playHostAudio', defaultPlayHostAudio, null);

  const defaultDecryptHostAudio = false;
  document.querySelector('#decryptHostAudioBtn').MaterialSwitch.off();
  storeData('decryptHostAudio', defaultDecryptHostAudio, null);

  const defaultVideoCodec = 'H264';
  $('#selectCodec').text('H.264').attr('data-value', defaultVideoCodec).data('value', defaultVideoCodec);
  storeData('videoCodec', defaultVideoCodec, null);

  const defaultHdrMode = false;
  document.querySelector('#hdrModeBtn').MaterialSwitch.off();
  storeData('hdrMode', defaultHdrMode, null);

  const defaultFullRange = false;
  document.querySelector('#fullRangeBtn').MaterialSwitch.off();
  storeData('fullRange', defaultFullRange, null);

  // Reset default Game Mode based on Tizen platform version
  if (parseFloat(platformVer) >= 9.0) {
    // Turn off for Tizen 9.0 and newer to avoid compatibility issues
    const incompatibleGameMode = false;
    document.querySelector('#gameModeBtn').MaterialSwitch.off();
    storeData('gameMode', incompatibleGameMode, null);
  } else if (parseFloat(platformVer) === 5.5) {
    // Keep turned off and disabled for Tizen 5.5 due to lack of support
  } else {
    // Turn on for compatible Tizen versions (e.g., 6.0, 6.5, 7.0, 8.0)
    const defaultGameMode = true;
    document.querySelector('#gameModeBtn').MaterialSwitch.on();
    storeData('gameMode', defaultGameMode, null);
  }

  const defaultUnlockAllFps = false;
  document.querySelector('#unlockAllFpsBtn').MaterialSwitch.off();
  storeData('unlockAllFps', defaultUnlockAllFps, null);

  const defaultOptimizeBitrate = false;
  document.querySelector('#optimizeBitrateBtn').MaterialSwitch.off();
  storeData('optimizeBitrate', defaultOptimizeBitrate, null);

  const defaultDisableWarnings = false;
  document.querySelector('#disableWarningsBtn').MaterialSwitch.off();
  storeData('disableWarnings', defaultDisableWarnings, null);

  const defaultPerformanceStats = false;
  document.querySelector('#performanceStatsBtn').MaterialSwitch.off();
  storeData('performanceStats', defaultPerformanceStats, null);
  updatePerformanceStatsPositionAvailability(false);

  setPerformanceStatsPosition('top-left', true);

  const defaultAutomaticUpdateChecks = true;
  document.querySelector('#automaticUpdateChecksBtn').MaterialSwitch.on();
  storeData('automaticUpdateChecks', defaultAutomaticUpdateChecks, null);
}

function initSamsungKeys() {
  console.log('%c[index.js, initSamsungKeys]', 'color: green;', 'Initializing TV keys...');

  // For explanation on ordering, see: https://developer.samsung.com/smarttv/develop/guides/user-interaction/keyboardime.html
  var handler = {
    initRemoteController: true,
    buttonsToRegister: [
      'ColorF0Red',      // F1
      'ColorF1Green',    // F2
      'ColorF2Yellow',   // F3
      'ColorF3Blue',     // F4
      //'SmartHub',      // F5
      'Source',          // F6
      'ChannelList',     // F7
      //'VolumeMute',    // F8
      //'VolumeDown',    // F9
      //'VolumeUp',      // F10
      'ChannelDown',     // F11
      'ChannelUp',       // F12
      'Guide',
      'MediaPlayPause',
      'MediaPause',
      'MediaPlay',
    ],
    onKeydownListener: remoteControllerHandler
  };

  console.log('%c[index.js, initSamsungKeys]', 'color: green;', 'Initializing TV platform...');
  platformOnLoad(handler);
}

function directStreamRemoteControllerHandler(e) {
  var keyCode = e.keyCode;
  if (typeof tvKey === 'undefined') return;

  switch (keyCode) {
    case tvKey.KEY_PLAY_PAUSE:
    case tvKey.KEY_PAUSE:
    case tvKey.KEY_PLAY:
      if (isInGame) {
        e.preventDefault();
        toggleStreamMenuDialog();
      }
      break;
  }
}

function initDirectSamsungKeys() {
  console.log('%c[index.js, initDirectSamsungKeys]', 'color: green;', 'Registering only the TV keys required during direct streaming...');
  platformOnLoad({
    initRemoteController: true,
    focusId: 'wasm_module',
    buttonsToRegister: [
      'Guide',
      'MediaPlayPause',
      'MediaPause',
      'MediaPlay'
    ],
    onKeydownListener: remoteControllerHandler
  });
}

function initSpecialKeys() {
  console.log('%c[index.js, initSpecialKeys]', 'color: green;', 'Initializing special TV input keys...');

  // Capture Back and media keys before the streaming session and suppress the TV's default action.
  ['keydown', 'keyup'].forEach(function(eventType) {
    window.addEventListener(eventType, function(e) {
      if (!isInGame) return;

      var keyName = String(e.key || e.code || '').toLowerCase();
      var eventKeyCode = e.keyCode || e.which;
      var isBackKey = keyName === 'xf86back' ||
        (typeof tvKey !== 'undefined' &&
          (eventKeyCode === tvKey.KEY_RETURN || eventKeyCode === tvKey.KEY_BACK));

      // Media keys are handled by remoteControllerHandler on document, where
      // Tizen delivers the registered MediaPlayPause/MediaPause/MediaPlay events.
      if (!isBackKey) return;

      e.preventDefault();
      e.stopPropagation();
      if (e.type === 'keydown' && !e.repeat) {
        toggleStreamMenuDialog();
      }
    }, true);
  });
}

function loadSystemInfo() {
  console.log('%c[index.js, loadSystemInfo]', 'color: green;', 'Loading system information...');
  const systemInfoPlaceholder = document.getElementById('systemInfoBtn');
  const isForceGMVariant = checkForceGMVariant(); // Check if the currently installed app is the ForceGM variant
  const buildVer = getBuildVersion(appInfo.version);

  // Get the system information from the TV
  if (systemInfoPlaceholder) {
    console.log('%c[index.js, loadSystemInfo]', 'color: green;', 'Platform Version: Tizen ' + (platformVer ? platformVer : 'Unknown'));
    console.log('%c[index.js, loadSystemInfo]', 'color: green;', 'TV Model Series: ' + (modelSeries ? modelSeries : 'Unknown'));
    console.log('%c[index.js, loadSystemInfo]', 'color: green;', 'TV Model Name: ' + (modelName ? modelName : 'Unknown'));
    console.log('%c[index.js, loadSystemInfo]', 'color: green;', 'TV Model Group: ' + (modelGroup ? modelGroup : 'Unknown'));
    console.log('%c[index.js, loadSystemInfo]', 'color: green;', '4K Panel: ' + (!panelCapabilitiesChecked ? 'Not checked' : (is4kPanel === null ? 'Unknown' : (is4kPanel ? 'Yes' : 'No'))));
    console.log('%c[index.js, loadSystemInfo]', 'color: green;', 'HDR Capable: ' + (isHdrCapable === null ? 'Not checked' : (isHdrCapable ? 'Yes' : 'No')));
    // Insert the system information as text, then render the experimental marker
    // with the same shared badge class used by other experimental settings.
    systemInfoPlaceholder.textContent =
      t('App Version: %1$s v%2$s', appInfo.name + (isForceGMVariant ? '-ForceGM' : ''), buildVer) + '\n' +
      t('Platform Version: Tizen %1$s', platformVer ? platformVer : t('Unknown')) + '\n' +
      t('TV Model Series: %1$s', modelSeries ? modelSeries : t('Unknown')) + '\n' +
      t('TV Model Name: %1$s', modelName ? modelName : t('Unknown')) + '\n' +
      t('TV Model Group: %1$s', modelGroup ? modelGroup : t('Unknown'));

    if (!OFFICIAL_RELEASE && systemInfoPlaceholder.firstChild) {
      const versionTextNode = systemInfoPlaceholder.firstChild;
      const badgeIndex = versionTextNode.nodeValue.indexOf('EXPERIMENTAL');
      if (badgeIndex !== -1) {
        const beforeBadge = versionTextNode.nodeValue.slice(0, badgeIndex);
        const afterBadge = versionTextNode.nodeValue.slice(badgeIndex + 'EXPERIMENTAL'.length);
        const badge = document.createElement('span');
        badge.className = 'badge badge-experimental';
        badge.textContent = 'EXPERIMENTAL';
        const badgeFragment = document.createDocumentFragment();
        badgeFragment.appendChild(document.createTextNode(beforeBadge));
        badgeFragment.appendChild(badge);
        badgeFragment.appendChild(document.createTextNode(afterBadge));
        systemInfoPlaceholder.replaceChild(badgeFragment, versionTextNode);
      }
    }
  } else {
    console.error('%c[index.js, loadSystemInfo]', 'color: green;', 'Error: Failed to load system information!');
    systemInfoPlaceholder.innerText = t('Failed to load system information!');
  }
}

function readStoredPreferences(keys) {
  return new Promise(function(resolve, reject) {
    try {
      var transaction = db.transaction(storeName, 'readonly');
      var objectStore = transaction.objectStore(storeName);
      var values = {};
      var remaining = keys.length;

      if (remaining === 0) {
        resolve(values);
        return;
      }

      keys.forEach(function(key) {
        var request = objectStore.get(key);
        request.onsuccess = function() {
          try {
            var storedValue = request.result !== undefined && request.result !== null
              ? JSON.parse(request.result) : null;
            values[key] = storedValue !== null && typeof storedValue === 'object' &&
              Object.prototype.hasOwnProperty.call(storedValue, key)
                ? storedValue[key] : storedValue;
            remaining--;
            if (remaining === 0) resolve(values);
          } catch (error) {
            reject(error);
          }
        };
        request.onerror = function() {
          reject(request.error || new Error('Could not read setting: ' + key));
        };
      });

      transaction.onerror = function() {
        reject(transaction.error || new Error('Could not read streaming settings.'));
      };
    } catch (error) {
      reject(error);
    }
  });
}

// Smart Hub launches read only stream-related preferences. They are kept as plain
// data and never applied to the hidden Material Design controls or UI subsystems.
function loadDirectSmartHubStreamSettings() {
  var keys = [
    'resolution', 'frameRate', 'bitrate', 'framePacing', 'optimizeGames',
    'rumbleFeedback', 'mouseEmulation', 'flipABfaceButtons', 'flipXYfaceButtons',
    'audioBackend', 'audioConfig', 'ac3AudioMode', 'audioSync', 'audioJitter',
    'playHostAudio', 'decryptHostAudio', 'videoCodec', 'h264Level', 'hdrMode',
    'fullRange', 'gameMode', 'disableWarnings', 'performanceStats',
    'dolbyChannelLayout', 'dolbyDecodingMode', 'streamTransitionBackground', 'performanceStatsPosition', 'colorTheme', 'quitAppAfterDisconnect', 'streamingEngine'
  ];

  return withOperationTimeout(new Promise(function(resolve) {
    openIndexDB(resolve);
  }).then(function() {
    return readStoredPreferences(keys);
  }), 10000, 'Saved streaming preferences load').then(function(stored) {
    var resolution = stored.resolution || '1280:720';
    var width = parseInt(resolution.split(':')[0], 10);
    if (!isFinite(width) || width <= 0) resolution = '1280:720';

    var ac3Enabled = stored.ac3AudioMode === true || stored.ac3AudioMode === 'true' || stored.ac3AudioMode === 1;
    var streamingEngine = (stored.streamingEngine === 'ESPLUSPLAYER' || stored.streamingEngine === 'WMP') ? 'ESPLUSPLAYER' : 'EMSS';
    var storedAudioBackend = stored.audioBackend || 'EMSS';
    var audioBackend;
    if (streamingEngine === 'ESPLUSPLAYER') {
      audioBackend = storedAudioBackend === 'Disabled' ? 'Disabled' : 'ESPLUSPLAYER';
    } else if (ac3Enabled) {
      audioBackend = storedAudioBackend === 'Disabled' ? 'Disabled' : 'EMSS';
    } else {
      audioBackend = ['EMSS', 'WebAudio', 'Disabled'].indexOf(storedAudioBackend) !== -1
        ? storedAudioBackend : 'EMSS';
    }
    var audioConfig = stored.audioConfig || 'Stereo';
    if (ac3Enabled && audioConfig === '71Surround') audioConfig = '51Surround';

    var gameModeDefault = parseFloat(platformVer) >= 9.0 || parseFloat(platformVer) === 5.5 ? false : true;
    function boolValue(value, defaultValue) {
      if (value == null) return defaultValue;
      return value === true || value === 'true' || value === 1;
    }

    _directSmartHubStreamSettings = {
      resolution: resolution,
      streamWidth: resolution.split(':')[0],
      streamHeight: resolution.split(':')[1],
      frameRate: String(stored.frameRate || '60'),
      bitrate: (parseFloat(stored.bitrate != null ? stored.bitrate : 10) * 1000),
      framePacing: boolValue(stored.framePacing, true) ? 1 : 0,
      optimizeGames: boolValue(stored.optimizeGames, false) ? 1 : 0,
      rumbleFeedback: boolValue(stored.rumbleFeedback, false) ? 1 : 0,
      mouseEmulation: boolValue(stored.mouseEmulation, false) ? 1 : 0,
      selectHoldStreamMenu: boolValue(stored.selectHoldStreamMenu, true) ? 1 : 0,
      flipABfaceButtons: boolValue(stored.flipABfaceButtons, false) ? 1 : 0,
      flipXYfaceButtons: boolValue(stored.flipXYfaceButtons, false) ? 1 : 0,
      opticalOutputEnabled: ac3Enabled,
      audioBackend: audioBackend,
      audioConfig: audioConfig,
      audioSync: boolValue(stored.audioSync, false) ? 1 : 0,
      audioJitter: parseInt(stored.audioJitter != null ? stored.audioJitter : 100, 10),
      playHostAudio: boolValue(stored.playHostAudio, false) ? 1 : 0,
      decryptHostAudio: boolValue(stored.decryptHostAudio, false) ? 1 : 0,
      videoCodec: stored.videoCodec || 'H264',
      h264Level: normalizeH264LevelId(stored.h264Level),
      hdrMode: boolValue(stored.hdrMode, false) ? 1 : 0,
      fullRange: boolValue(stored.fullRange, false) ? 1 : 0,
      gameMode: boolValue(stored.gameMode, gameModeDefault) ? 1 : 0,
      disableWarnings: boolValue(stored.disableWarnings, false) ? 1 : 0,
      performanceStats: boolValue(stored.performanceStats, false) ? 1 : 0,
      performanceStatsPosition: stored.performanceStatsPosition || 'top-left',
      quitAppAfterDisconnect: boolValue(stored.quitAppAfterDisconnect, false),
      streamingEngine: streamingEngine,
      dolbyChannelLayout: stored.dolbyChannelLayout || 'Back',
      dolbyDecodingMode: stored.dolbyDecodingMode || 'Hardware'
    };

    streamTransitionBackgroundEnabled = boolValue(stored.streamTransitionBackground, true);

    // Apply only the saved theme token needed by the transition's CSS variables.
    // Do not run applyColorTheme(), which also initializes the hidden theme cards.
    activeColorTheme = normalizeColorTheme(stored.colorTheme);
    focusedColorTheme = activeColorTheme;
    document.body.setAttribute('data-color-theme', activeColorTheme);

    _directSmartHubSettingsReady = true;
    console.log('%c[index.js, loadDirectSmartHubStreamSettings]', 'color: green;', 'Loaded direct stream preferences from IndexedDB:', _directSmartHubStreamSettings);
    maybeStartDirectSmartHubLaunch();
  }).catch(function(error) {
    console.error('%c[index.js, loadDirectSmartHubStreamSettings]', 'color: red;', 'Could not load direct stream preferences:', error);
    directSmartHubLaunchFailure('Moonlight could not load its saved streaming settings.');
  });
}

function loadUserData() {
  console.log('%c[index.js, loadUserData]', 'color: green;', 'Loading stored user data...');
  openIndexDB(loadUserDataCb);
}

function loadUserDataCb() {
  getData('streamingEngine', function(previousValue) {
    var engine = previousValue && previousValue.streamingEngine;
    if (engine === 'WMP') engine = 'ESPLUSPLAYER';
    if (engine !== 'EMSS' && engine !== 'ESPLUSPLAYER') engine = 'EMSS';
    var option = $('.streamingEngineMenu li').filter(function() {
      return $(this).data('value') === engine;
    }).first();
    if (option.length) {
      $('#selectStreamingEngine').text(option.text())
        .attr('data-value', engine).data('value', engine);
    }
    audioBackendPolicyLoadState.streamingEngine = true;
    completeAudioBackendPolicyLoad();
  });

  console.log('%c[index.js, loadUserDataCb]', 'color: green;', 'Load stored automatic update check preference.');
  getData('discoverNewHostsAtStartup', function(previousValue) {
    const storedValue = previousValue.discoverNewHostsAtStartup;
    const noConfiguredHosts = isHostsLoaded && Object.keys(hosts).length === 0;
    const enabled = noConfiguredHosts || storedValue == null || storedValue === true ||
      storedValue === 'true' || storedValue === 1;
    if (noConfiguredHosts) storeData('discoverNewHostsAtStartup', true, null);
    if (enabled) document.querySelector('#discoverNewHostsAtStartupBtn').MaterialSwitch.on();
    else document.querySelector('#discoverNewHostsAtStartupBtn').MaterialSwitch.off();
  });

  getData('automaticUpdateChecks', function(previousValue) {
    const storedValue = previousValue.automaticUpdateChecks;
    const enabled = storedValue == null || storedValue === true ||
      storedValue === 'true' || storedValue === 1;
    if (enabled) {
      document.querySelector('#automaticUpdateChecksBtn').MaterialSwitch.on();
    } else {
      document.querySelector('#automaticUpdateChecksBtn').MaterialSwitch.off();
    }
  });

  console.log('%c[index.js, loadUserDataCb]', 'color: green;', 'Load stored resolution preferences.');
  getData('resolution', function(previousValue) {
    if (previousValue.resolution != null) {
      // Do not validate against panel capabilities here: they are queried only
      // when the user enters Settings, and startup must preserve this preference.
      $('.videoResolutionMenu li').each(function() {
        if ($(this).data('value') === previousValue.resolution) {
          // Update the video resolution field based on the given value
          $('#selectResolution').text($(this).text()).attr('data-value', previousValue.resolution).data('value', previousValue.resolution);
        }
      });
    }
    updateH264FramerateConstraint();
  });

  console.log('%c[index.js, loadUserDataCb]', 'color: green;', 'Load stored unlockAllFps preferences.');
  getData('unlockAllFps', function(previousValue) {
    if (previousValue.unlockAllFps == null) {
      document.querySelector('#unlockAllFpsBtn').MaterialSwitch.off(); // Set the default state
    } else if (previousValue.unlockAllFps == false) {
      document.querySelector('#unlockAllFpsBtn').MaterialSwitch.off();
    } else {
      document.querySelector('#unlockAllFpsBtn').MaterialSwitch.on();
    }
    // Handle the Unlocked FPS visibility based on switch state
    handleUnlockAllFps();
  });

  console.log('%c[index.js, loadUserDataCb]', 'color: green;', 'Load stored frameRate preferences.');
  getData('frameRate', function(previousValue) {
    if (previousValue.frameRate != null) {
      $('.videoFramerateMenu li').each(function() {
        if ($(this).data('value') === previousValue.frameRate) {
          // Update the video frame rate field based on the given value
          $('#selectFramerate').text($(this).text()).attr('data-value', previousValue.frameRate).data('value', previousValue.frameRate);
        }
      });
    }
    updateH264FramerateConstraint();
  });

  console.log('%c[index.js, loadUserDataCb]', 'color: green;', 'Load stored bitrate preferences.');
  getData('bitrate', function(previousValue) {
    $('#bitrateSlider')[0].MaterialSlider.change(previousValue.bitrate != null ? previousValue.bitrate : '10');
    // Update the video bitrate field based on the given value
    $('#selectBitrate').text($('#bitrateSlider').val() + ' Mbps');
  });

  console.log('%c[index.js, loadUserDataCb]', 'color: green;', 'Load stored framePacing preferences.');
  getData('framePacing', function(previousValue) {
    if (previousValue.framePacing == null) {
      document.querySelector('#framePacingBtn').MaterialSwitch.on(); // Set the default state
    } else if (previousValue.framePacing == false) {
      document.querySelector('#framePacingBtn').MaterialSwitch.off();
    } else {
      document.querySelector('#framePacingBtn').MaterialSwitch.on();
    }
  });

  console.log('%c[index.js, loadUserDataCb]', 'color: green;', 'Load stored ipAddressFieldMode preferences.');
  getData('ipAddressFieldMode', function(previousValue) {
    if (previousValue.ipAddressFieldMode == null) {
      document.querySelector('#ipAddressFieldModeBtn').MaterialSwitch.on(); // Set the default state
    } else if (previousValue.ipAddressFieldMode == false) {
      document.querySelector('#ipAddressFieldModeBtn').MaterialSwitch.off();
    } else {
      document.querySelector('#ipAddressFieldModeBtn').MaterialSwitch.on();
    }
    // Handle the IP address field visibility based on switch state
    handleIpAddressFieldMode();
  });

  console.log('%c[index.js, loadUserDataCb]', 'color: green;', 'Load navigation sounds preference.');
  getData('navigationSoundEnabled', function(previousValue) {
    const storedValue = previousValue && previousValue.navigationSoundEnabled;
    navigationSoundPreferenceEnabled = storedValue == null || storedValue === true ||
      storedValue === 'true' || storedValue === 1;
    if (navigationSoundPreferenceEnabled) {
      document.querySelector('#navigationSoundBtn').MaterialSwitch.on();
    } else {
      document.querySelector('#navigationSoundBtn').MaterialSwitch.off();
    }
    if (typeof setNavigationSoundEnabled === 'function') {
      Promise.resolve(setNavigationSoundEnabled(navigationSoundPreferenceEnabled)).catch(function(error) {
        console.error('%c[index.js, loadUserDataCb]', 'color: red;', 'Could not apply navigation sounds preference:', error);
      });
    }
  });

  console.log('%c[index.js, loadUserDataCb]', 'color: green;', 'Load configuration summary bar position preference.');
  getData('showConfigSummaryBar', function(previousValue) {
    const storedValue = previousValue && previousValue.showConfigSummaryBar;
    applyConfigSummaryPosition(storedValue == null ? 'bottom' : storedValue);
    configSummaryPreferenceLoaded = true;
    if (!_directSmartHubLaunch) {
      updateConfigSummaryBar();
      maybeRestoreUiAfterStartup();
    }
  });

  console.log('%c[index.js, loadUserDataCb]', 'color: green;', 'Load animated stream transition background preference.');
  getData('streamTransitionBackground', function(previousValue) {
    const storedValue = previousValue.streamTransitionBackground;
    streamTransitionBackgroundEnabled = storedValue == null || storedValue === true ||
      storedValue === 'true' || storedValue === 1;
    if (streamTransitionBackgroundEnabled) {
      document.querySelector('#streamTransitionBackgroundBtn').MaterialSwitch.on();
    } else {
      document.querySelector('#streamTransitionBackgroundBtn').MaterialSwitch.off();
    }
  });

  console.log('%c[index.js, loadUserDataCb]', 'color: green;', 'Load screensaver preference.');
  getData('screensaverEnabled', function(previousValue) {
    const storedValue = previousValue && previousValue.screensaverEnabled;
    screensaverPreferenceEnabled = storedValue == null || storedValue === true ||
      storedValue === 'true' || storedValue === 1;
    if (screensaverPreferenceEnabled) {
      document.querySelector('#screensaverBtn').MaterialSwitch.on();
    } else {
      document.querySelector('#screensaverBtn').MaterialSwitch.off();
    }
    if (typeof setScreensaverEnabled === 'function') setScreensaverEnabled(screensaverPreferenceEnabled);
    if (!_directSmartHubLaunch && typeof initializeScreensaver === 'function') initializeScreensaver();
  });

  console.log('%c[index.js, loadUserDataCb]', 'color: green;', 'Load stored sortAppsList preferences.');
  getData('sortAppsList', function(previousValue) {
    if (previousValue.sortAppsList == null) {
      document.querySelector('#sortAppsListBtn').MaterialSwitch.off(); // Set the default state
    } else if (previousValue.sortAppsList == false) {
      document.querySelector('#sortAppsListBtn').MaterialSwitch.off();
    } else {
      document.querySelector('#sortAppsListBtn').MaterialSwitch.on();
    }
  });

  getData('sortAppsByUsage', function(previousValue) {
    const enabled = previousValue.sortAppsByUsage === true || previousValue.sortAppsByUsage === 'true' || previousValue.sortAppsByUsage === 1;
    if (enabled) document.querySelector('#sortAppsByUsageBtn').MaterialSwitch.on();
    else document.querySelector('#sortAppsByUsageBtn').MaterialSwitch.off();
  });

  console.log('%c[index.js, loadUserDataCb]', 'color: green;', 'Load stored optimizeGames preferences.');
  getData('optimizeGames', function(previousValue) {
    if (previousValue.optimizeGames == null) {
      document.querySelector('#optimizeGamesBtn').MaterialSwitch.off(); // Set the default state
    } else if (previousValue.optimizeGames == false) {
      document.querySelector('#optimizeGamesBtn').MaterialSwitch.off();
    } else {
      document.querySelector('#optimizeGamesBtn').MaterialSwitch.on();
    }
  });

  console.log('%c[index.js, loadUserDataCb]', 'color: green;', 'Load stored quitAppAfterDisconnect preferences.');
  getData('quitAppAfterDisconnect', function(previousValue) {
    if (previousValue.quitAppAfterDisconnect === true ||
        previousValue.quitAppAfterDisconnect === 'true' ||
        previousValue.quitAppAfterDisconnect === 1) {
      document.querySelector('#quitAppAfterDisconnectBtn').MaterialSwitch.on();
    } else {
      document.querySelector('#quitAppAfterDisconnectBtn').MaterialSwitch.off();
    }
  });

  console.log('%c[index.js, loadUserDataCb]', 'color: green;', 'Load stored rumbleFeedback preferences.');
  getData('rumbleFeedback', function(previousValue) {
    if (previousValue.rumbleFeedback == null) {
      document.querySelector('#rumbleFeedbackBtn').MaterialSwitch.off(); // Set the default state
    } else if (previousValue.rumbleFeedback == false) {
      document.querySelector('#rumbleFeedbackBtn').MaterialSwitch.off();
    } else {
      document.querySelector('#rumbleFeedbackBtn').MaterialSwitch.on();
    }
  });

  console.log('%c[index.js, loadUserDataCb]', 'color: green;', 'Load stored mouseEmulation preferences.');
  getData('mouseEmulation', function(previousValue) {
    if (previousValue.mouseEmulation == null) {
      document.querySelector('#mouseEmulationBtn').MaterialSwitch.off(); // Set the default state
    } else if (previousValue.mouseEmulation == false) {
      document.querySelector('#mouseEmulationBtn').MaterialSwitch.off();
    } else {
      document.querySelector('#mouseEmulationBtn').MaterialSwitch.on();
    }
  });

  console.log('%c[index.js, loadUserDataCb]', 'color: green;', 'Load stored Select hold stream menu preferences.');
  getData('selectHoldStreamMenu', function(previousValue) {
    if (previousValue.selectHoldStreamMenu !== false) {
      document.querySelector('#selectHoldStreamMenuBtn').MaterialSwitch.on();
    } else {
      document.querySelector('#selectHoldStreamMenuBtn').MaterialSwitch.off();
    }
  });

  console.log('%c[index.js, loadUserDataCb]', 'color: green;', 'Load stored flipABfaceButtons preferences.');
  getData('flipABfaceButtons', function(previousValue) {
    if (previousValue.flipABfaceButtons == null) {
      document.querySelector('#flipABfaceButtonsBtn').MaterialSwitch.off(); // Set the default state
    } else if (previousValue.flipABfaceButtons == false) {
      document.querySelector('#flipABfaceButtonsBtn').MaterialSwitch.off();
    } else {
      document.querySelector('#flipABfaceButtonsBtn').MaterialSwitch.on();
    }
  });

  console.log('%c[index.js, loadUserDataCb]', 'color: green;', 'Load stored flipXYfaceButtons preferences.');
  getData('flipXYfaceButtons', function(previousValue) {
    if (previousValue.flipXYfaceButtons == null) {
      document.querySelector('#flipXYfaceButtonsBtn').MaterialSwitch.off(); // Set the default state
    } else if (previousValue.flipXYfaceButtons == false) {
      document.querySelector('#flipXYfaceButtonsBtn').MaterialSwitch.off();
    } else {
      document.querySelector('#flipXYfaceButtonsBtn').MaterialSwitch.on();
    }
  });

  console.log('%c[index.js, loadUserDataCb]', 'color: green;', 'Load stored audioBackend preferences.');
  getData('audioBackend', function(previousValue) {
    var storedBackend = previousValue && previousValue.audioBackend;
    if (['EMSS', 'WebAudio', 'Disabled', 'ESPLUSPLAYER', 'WMP'].indexOf(storedBackend) !== -1) {
      setAudioSelectorValue('#selectAudioBackend', '.audioBackendMenu', storedBackend === 'WMP' ? 'ESPLUSPLAYER' : storedBackend);
    }
    audioBackendPolicyLoadState.audioBackend = true;
    completeAudioBackendPolicyLoad();
  });

  getData('audioBackendBeforeWmp', function(previousValue) {
    var value = previousValue && previousValue.audioBackendBeforeWmp;
    audioBackendBeforeESPlusPlayerPreference = ['EMSS', 'WebAudio', 'Disabled'].indexOf(value) !== -1 ? value : null;
    audioBackendPolicyLoadState.beforeESPlusPlayer = true;
    completeAudioBackendPolicyLoad();
  });

  getData('audioBackendBeforeAc3', function(previousValue) {
    var value = previousValue && previousValue.audioBackendBeforeAc3;
    audioBackendBeforeAc3Preference = ['EMSS', 'WebAudio', 'Disabled'].indexOf(value) !== -1 ? value : null;
    audioBackendPolicyLoadState.beforeAc3 = true;
    completeAudioBackendPolicyLoad();
  });

  console.log('%c[index.js, loadUserDataCb]', 'color: green;', 'Load stored audioConfig preferences.');
  getData('audioConfig', function(previousValue) {
    if (previousValue.audioConfig != null) {
      $('.audioConfigMenu li').each(function() {
        if ($(this).data('value') === previousValue.audioConfig) {
          // Update the audio configuration field based on the given value
          $('#selectAudio').text($(this).text()).attr('data-value', previousValue.audioConfig).data('value', previousValue.audioConfig);
        }
      });
    }
    updateDolbyAudioAdvancedSettings();
  });
  getData('dolbyChannelLayout', function(previousValue) {
    if (previousValue.dolbyChannelLayout != null) setDolbySelectorValue('#selectDolbyChannelLayout', '.dolbyChannelLayoutMenu', previousValue.dolbyChannelLayout);
    updateDolbyAudioAdvancedSettings();
  });
  getData('dolbyDecodingMode', function(previousValue) {
    if (previousValue.dolbyDecodingMode != null) setDolbySelectorValue('#selectDolbyDecodingMode', '.dolbyDecodingModeMenu', previousValue.dolbyDecodingMode);
    updateDolbyAudioAdvancedSettings();
  });
  initializeDolbyDecodingModeSupport();

  console.log('%c[index.js, loadUserDataCb]', 'color: green;', 'Load stored AC-3 audio mode preference.');
  getData('ac3AudioMode', function(previousValue) {
    const enabled = previousValue.ac3AudioMode === true ||
      previousValue.ac3AudioMode === 'true' ||
      previousValue.ac3AudioMode === 1;
    if (enabled) {
      document.querySelector('#ac3AudioModeBtn').MaterialSwitch.on();
    } else {
      document.querySelector('#ac3AudioModeBtn').MaterialSwitch.off();
    }
    audioBackendPolicyLoadState.ac3AudioMode = true;
    completeAudioBackendPolicyLoad();
  });

  console.log('%c[index.js, loadUserDataCb]', 'color: green;', 'Load stored audioSync preferences.');
  getData('audioSync', function(previousValue) {
    if (previousValue.audioSync == null) {
      document.querySelector('#audioSyncBtn').MaterialSwitch.off(); // Set the default state
    } else if (previousValue.audioSync == false) {
      document.querySelector('#audioSyncBtn').MaterialSwitch.off();
    } else {
      document.querySelector('#audioSyncBtn').MaterialSwitch.on();
    }
  });

  console.log('%c[index.js, loadUserDataCb]', 'color: green;', 'Load stored audioJitter preferences.');
  getData('audioJitter', function(previousValue) {
    $('#jitterSlider')[0].MaterialSlider.change(previousValue.audioJitter != null ? previousValue.audioJitter : '100');
    // Update the audio jitter buffer field based on the given value
    $('#selectAudioJitter').text($('#jitterSlider').val() + ' ms');
  });

  console.log('%c[index.js, loadUserDataCb]', 'color: green;', 'Load stored playHostAudio preferences.');
  getData('playHostAudio', function(previousValue) {
    if (previousValue.playHostAudio == null) {
      document.querySelector('#playHostAudioBtn').MaterialSwitch.off(); // Set the default state
    } else if (previousValue.playHostAudio == false) {
      document.querySelector('#playHostAudioBtn').MaterialSwitch.off();
    } else {
      document.querySelector('#playHostAudioBtn').MaterialSwitch.on();
    }
  });

  console.log('%c[index.js, loadUserDataCb]', 'color: green;', 'Load stored decryptHostAudio preferences.');
  getData('decryptHostAudio', function(previousValue) {
    if (previousValue.decryptHostAudio == null) {
      document.querySelector('#decryptHostAudioBtn').MaterialSwitch.off(); // Set the default state
    } else if (previousValue.decryptHostAudio == false) {
      document.querySelector('#decryptHostAudioBtn').MaterialSwitch.off();
    } else {
      document.querySelector('#decryptHostAudioBtn').MaterialSwitch.on();
    }
  });

  console.log('%c[index.js, loadUserDataCb]', 'color: green;', 'Load stored videoCodec preferences.');
  getData('videoCodec', function(previousValue) {
    if (previousValue.videoCodec != null) {
      $('.videoCodecMenu li').each(function() {
        if ($(this).data('value') === previousValue.videoCodec) {
          // Update the video codec field based on the given value
          $('#selectCodec').text($(this).text()).attr('data-value', previousValue.videoCodec).data('value', previousValue.videoCodec);
        }
      });
    }
    updateH264LevelControlState();
    updateH264FramerateConstraint();
  });

  console.log('%c[index.js, loadUserDataCb]', 'color: green;', 'Load stored H.264 level preference.');
  getData('h264Level', function(previousValue) {
    const savedLevel = previousValue && previousValue.h264Level;
    const selectedLevel = normalizeH264LevelId(savedLevel);
    $('.h264LevelMenu li').each(function() {
      if ($(this).data('value') === selectedLevel) {
        $('#selectH264Level').text($(this).text())
          .attr('data-value', selectedLevel).data('value', selectedLevel);
      }
    });
    updateH264LevelControlState();
  });

  console.log('%c[index.js, loadUserDataCb]', 'color: green;', 'Load stored hdrMode preferences.');
  getData('hdrMode', function(previousValue) {
    if (previousValue.hdrMode == null) {
      document.querySelector('#hdrModeBtn').MaterialSwitch.off(); // Set the default state
    } else if (previousValue.hdrMode == false) {
      document.querySelector('#hdrModeBtn').MaterialSwitch.off();
    } else {
      document.querySelector('#hdrModeBtn').MaterialSwitch.on();
    }
  });

  console.log('%c[index.js, loadUserDataCb]', 'color: green;', 'Load stored fullRange preferences.');
  getData('fullRange', function(previousValue) {
    if (previousValue.fullRange == null) {
      document.querySelector('#fullRangeBtn').MaterialSwitch.off(); // Set the default state
    } else if (previousValue.fullRange == false) {
      document.querySelector('#fullRangeBtn').MaterialSwitch.off();
    } else {
      document.querySelector('#fullRangeBtn').MaterialSwitch.on();
    }
  });

  console.log('%c[index.js, loadUserDataCb]', 'color: green;', 'Load stored gameMode preferences.');
  getData('gameMode', function(previousValue) {
    if (previousValue.gameMode == null) {
      if (parseFloat(platformVer) >= 9.0) {
        document.querySelector('#gameModeBtn').MaterialSwitch.off(); // Turn off for Tizen 9.0 and newer to avoid compatibility issues
      } else if (parseFloat(platformVer) === 5.5) {
        document.querySelector('#gameModeBtn').MaterialSwitch.off(); // Turn off for Tizen 5.5 due to lack of support
        document.querySelector('#gameModeBtn').MaterialSwitch.disable(); // Disable the switch to prevent user interaction
      } else {
        document.querySelector('#gameModeBtn').MaterialSwitch.on(); // Turn on for compatible Tizen versions (e.g., 6.0, 6.5, 7.0, 8.0)
      }
    } else if (previousValue.gameMode == false) {
      document.querySelector('#gameModeBtn').MaterialSwitch.off();
    } else {
      document.querySelector('#gameModeBtn').MaterialSwitch.on();
    }
  });

  console.log('%c[index.js, loadUserDataCb]', 'color: green;', 'Load stored optimizeBitrate preferences.');
  getData('optimizeBitrate', function(previousValue) {
    if (previousValue.optimizeBitrate == null) {
      document.querySelector('#optimizeBitrateBtn').MaterialSwitch.off(); // Set the default state
    } else if (previousValue.optimizeBitrate == false) {
      document.querySelector('#optimizeBitrateBtn').MaterialSwitch.off();
    } else {
      document.querySelector('#optimizeBitrateBtn').MaterialSwitch.on();
    }
  });

  console.log('%c[index.js, loadUserDataCb]', 'color: green;', 'Load stored disableWarnings preferences.');
  getData('disableWarnings', function(previousValue) {
    if (previousValue.disableWarnings == null) {
      document.querySelector('#disableWarningsBtn').MaterialSwitch.off(); // Set the default state
    } else if (previousValue.disableWarnings == false) {
      document.querySelector('#disableWarningsBtn').MaterialSwitch.off();
    } else {
      document.querySelector('#disableWarningsBtn').MaterialSwitch.on();
    }
  });

  console.log('%c[index.js, loadUserDataCb]', 'color: green;', 'Load stored performance overlay position.');
  getData('performanceStatsPosition', function(positionValue) {
    setPerformanceStatsPosition(positionValue && positionValue.performanceStatsPosition, false);
  });

  console.log('%c[index.js, loadUserDataCb]', 'color: green;', 'Load stored performanceStats preferences.');
  getData('performanceStats', function(previousValue) {
    if (previousValue.performanceStats == null) {
      document.querySelector('#performanceStatsBtn').MaterialSwitch.off(); // Set the default state
    } else if (previousValue.performanceStats == false) {
      document.querySelector('#performanceStatsBtn').MaterialSwitch.off();
    } else {
      document.querySelector('#performanceStatsBtn').MaterialSwitch.on();
    }
    updatePerformanceStatsPositionAvailability($('#performanceStatsSwitch').parent().hasClass('is-checked'));

    _directSmartHubSettingsReady = true;
    maybeStartDirectSmartHubLaunch();
  });
}

function runInitialHostDiscovery(hasConfiguredHosts) {
  // An empty saved-host list must always trigger discovery, regardless of the preference.
  return new Promise(function(resolve) {
    getData('discoverNewHostsAtStartup', function(settings) {
      var storedValue = settings.discoverNewHostsAtStartup;
      var discoveryEnabled = storedValue == null || storedValue === true ||
        storedValue === 'true' || storedValue === 1;
      if (!hasConfiguredHosts) {
        discoveryEnabled = true;
        storeData('discoverNewHostsAtStartup', true, null);
        var discoverySwitch = document.getElementById('discoverNewHostsAtStartupBtn');
        if (discoverySwitch && discoverySwitch.MaterialSwitch) discoverySwitch.MaterialSwitch.on();
      }
      resolve(discoveryEnabled);
    });
  }).then(function(discoveryEnabled) {
    // Always check configured hosts first, independently of new-host discovery.
    var configuredHostCheck = Promise.resolve();
    if (hasConfiguredHosts) {
      configuredHostCheck = isInGame !== true
        ? snackbarLogPersistent('Checking configured hosts...').then(function() {
            return startPollingHosts();
          })
        : startPollingHosts();
    }
    return configuredHostCheck.catch(function(error) {
      console.error('%c[index.js, runInitialHostDiscovery]', 'color: green;', 'Initial configured-host checks failed:', error);
    }).then(function() {
      // The preference controls only the additional subnet scan.
      if (!discoveryEnabled) return;

      var knownHostIPs = [];
      for (var hostUID in hosts) {
        var address = hosts[hostUID].address;
        if (typeof address === 'string' &&
            /^(?:[0-9]{1,3}\.){3}[0-9]{1,3}$/.test(address)) {
          knownHostIPs.push(address);
        }
      }
      var discoverySnackbar = isInGame !== true
        ? snackbarLogPersistent('Scanning the local network to discover new hosts...')
        : Promise.resolve();
      return discoverySnackbar.then(function() {
        return ensureSubnetScannerLoaded().then(function() {
          return startSubnetScanner(knownHostIPs);
        });
      });
    }).catch(function(error) {
      console.warn('%c[index.js, runInitialHostDiscovery]', 'color: orange;', 'Initial subnet discovery failed:', error);
    }).finally(function() {
      return dismissPersistentSnackbar().then(function() {
        isSubnetScanFinished = true;
        finishInitialHostDiscovery();
      });
    });
  });
}
function loadHTTPCerts() {
  console.log('%c[index.js, loadHTTPCerts]', 'color: green;', 'Loading stored HTTP certificates...');
  openIndexDB(loadHTTPCertsCb);
}

function loadHTTPCertsCb() {
  console.log('%c[index.js, loadHTTPCertsCb]', 'color: green;', 'Load the HTTP certificate and unique ID if they are already available.');
  getData('cert', function(savedCert) {
    if (savedCert.cert != null) { // We have a saved cert
      pairingCert = savedCert.cert;
    }

    getData('uniqueid', function(savedUniqueid) {
      if (savedUniqueid && savedUniqueid.uniqueid != null) { // We have a saved uniqueid
        myUniqueid = savedUniqueid.uniqueid;
      } else {
        myUniqueid = uniqueid();
        storeData('uniqueid', myUniqueid, null);
      }

      if (!pairingCert) { // We couldn't load a cert. Let's attempt to generate a new one.
        console.warn('%c[index.js, loadHTTPCertsCb]', 'color: green;', 'Warning: Local certificate not found! Generating a new one...');
        sendMessage('makeCert', []).then(function(cert) {
          storeData('cert', cert, null);
          pairingCert = cert;
          console.info('%c[index.js, loadHTTPCertsCb]', 'color: green;', 'Generated new certificate: ', cert);
        }, function(failedCert) {
          console.error('%c[index.js, loadHTTPCertsCb]', 'color: green;', 'Error: Failed to generate a new certificate! Returned error was: \n', failedCert + '!');
          if (_directSmartHubLaunch) directSmartHubLaunchFailure(t('Moonlight could not initialize its streaming credentials.'));
        }).then(function(ret) {
          sendMessage('httpInit', [pairingCert.cert, pairingCert.privateKey, myUniqueid]).then(function(ret) {
            isStartupHttpReady = true;
            if (_directSmartHubLaunch) maybeStartDirectSmartHubLaunch();
            else maybeRestoreUiAfterStartup();
          }, function(failedInit) {
            console.error('%c[index.js, loadHTTPCertsCb]', 'color: green;', 'Error: Failed HTTP initialization! Returned error was: ', failedInit + '!');
            if (_directSmartHubLaunch) directSmartHubLaunchFailure(t('Moonlight could not initialize its streaming connection.'));
          });
        });
      } else {
        sendMessage('httpInit', [pairingCert.cert, pairingCert.privateKey, myUniqueid]).then(function(ret) {
          isStartupHttpReady = true;
          if (_directSmartHubLaunch) maybeStartDirectSmartHubLaunch();
          else maybeRestoreUiAfterStartup();
        }, function(failedInit) {
          console.error('%c[index.js, loadHTTPCertsCb]', 'color: green;', 'Error: Failed HTTP initialization! Returned error was: ', failedInit + '!');
            if (_directSmartHubLaunch) directSmartHubLaunchFailure('Moonlight could not initialize its streaming connection.');
        });
      }

      // load previously connected hosts, which have been killed into an object, and revive them back into a class
      getData('hosts', function(previousValue) {
        if (_directSmartHubLaunch) {
          var savedHosts = previousValue.hosts != null ? previousValue.hosts : {};
          var targetUID = _directSmartHubLaunch.serverUid;
          var savedHost = savedHosts[targetUID];
          if (!savedHost) {
            isHostsLoaded = true;
            directSmartHubLaunchFailure(t('The selected host is no longer available on Moonlight.'));
            return;
          }
          var directHost = new NvHTTP(savedHost.address, myUniqueid, savedHost.userEnteredAddress, savedHost.macAddress);
          Object.assign(directHost, savedHost);
          directHost._memCachedApplist = null;
          directHost.httpPort = savedHost.httpPort || ((savedHost.httpsPort || 47984) + 5);
          directHost.httpsPort = savedHost.httpsPort || (directHost.httpPort - 5);
          directHost.externalPort = savedHost.externalPort || directHost.httpPort;
          directHost.serverUid = savedHost.serverUid || targetUID;
          directHost.externalIP = savedHost.externalIP;
          directHost.hostname = savedHost.hostname;
          directHost.ppkstr = savedHost.ppkstr;
          directHost.autoWolEnabled = savedHost.autoWolEnabled || false;
          hosts = {};
          hosts[targetUID] = directHost;
          _directSmartHubHost = directHost;
          // The saved host name is available without an extra network request.
          updateDirectSmartHubStartingStatus(directHost.hostname);
          _directSmartHubHostReady = true;
          isHostsLoaded = true;
          maybeStartDirectSmartHubLaunch();
          return;
        }

        hosts = previousValue.hosts != null ? previousValue.hosts : {};
        var hasConfiguredHosts = Object.keys(hosts).length > 0;
        // Finish the startup message only after the saved-host list has been read and revived.
        var savedHostsSnackbarPromise = Promise.resolve(window.startupEngineSnackbarPromise)
          .then(function() {
            return dismissPersistentSnackbar();
          });
        if (hasConfiguredHosts && isInGame !== true) {
          // Show the configured-host message after the background startup message has left.
          savedHostsSnackbarPromise = savedHostsSnackbarPromise.then(function() {
            return snackbarLogPersistent('Loading configured hosts...');
          });
        }
        for (var hostUID in hosts) { // Revive saved hosts; render their cards after the loading snackbar enters.
          var revivedHost = new NvHTTP(hosts[hostUID].address, myUniqueid, hosts[hostUID].userEnteredAddress, hosts[hostUID].macAddress);
          Object.assign(revivedHost, hosts[hostUID]);
          // Connectivity and in-flight operation state is session-local; never restore it from storage.
          revivedHost.online = false;
          revivedHost._statusVerified = false;
          revivedHost._consecutivePollFailures = 0;
          revivedHost._pollCount = 0;
          revivedHost._pollCompletionCallbacks = [];
          revivedHost._pollInProgress = false;
          revivedHost._backgroundStatusRefreshCount = 0;
          revivedHost._backgroundStatusRefreshInProgress = false;
          revivedHost._backgroundAppListRefreshInProgress = false;
          revivedHost._memCachedApplist = null; // Prevent using the app list cache from a previous session
          revivedHost.httpPort = hosts[hostUID].httpPort || ((hosts[hostUID].httpsPort || 47984) + 5);
          revivedHost.httpsPort = hosts[hostUID].httpsPort || (revivedHost.httpPort - 5);
          revivedHost.externalPort = hosts[hostUID].externalPort || revivedHost.httpPort;
          revivedHost.serverUid = hosts[hostUID].serverUid;
          revivedHost.externalIP = hosts[hostUID].externalIP;
          revivedHost.hostname = hosts[hostUID].hostname;
          revivedHost.ppkstr = hosts[hostUID].ppkstr;
          revivedHost.autoWolEnabled = hosts[hostUID].autoWolEnabled || false;
          hosts[hostUID] = revivedHost;
        }
        isHostsLoaded = true;
        // Load stored preview app lists and update Smart Hub Preview tiles.
        // Using the persisted list avoids requiring live host connections at startup.
        getData('previewApps', function(storedPreview) {
          _previewApps = (storedPreview.previewApps != null) ? storedPreview.previewApps : {};
          updatePreviewData();
        });
        console.log('%c[index.js, loadHTTPCertsCb]', 'color: green;', 'Restored previously configured hosts from local storage.');

        // Restore saved hosts locally before checking them and discovering new hosts.
        // Wait for the loading snackbar to appear before revealing the saved cards.
        savedHostsSnackbarPromise.then(function() {
          isStartupHostsLoaded = true;
          // The loading snackbar has entered; now it is safe to reveal saved cards.
          for (var hostUID in hosts) addHostToGrid(hosts[hostUID]);
          selectFirstHostAfterAddHost();
          return dismissPersistentSnackbar().then(function() {
            maybeRestoreUiAfterStartup();
            return runInitialHostDiscovery(hasConfiguredHosts);
          });
        });
      });
    });
  });
}

// Navigates to a specific host once it has been loaded and becomes available.
// Polls the hosts object at 1-second intervals for up to 30 seconds.
function waitForHostAndNavigate(serverUid) {
  var attempts = 0;
  var interval = setInterval(function() {
    attempts++;
    var host = hosts[serverUid];
    
    if (host && (host.online || isSubnetScanFinished)) {
      clearInterval(interval);
      console.log('%c[index.js, waitForHostAndNavigate]', 'color: green;', 'Host found for deep link, navigating: ' + serverUid);
      hostChosen(host);
    } else if (!host && isHostsLoaded) {
      clearInterval(interval);
      console.warn('%c[index.js, waitForHostAndNavigate]', 'color: orange;', 'Host ' + serverUid + ' no longer exists in Moonlight.');
      snackbarLogLong('The selected host is no longer available on Moonlight.');
      if (typeof updatePreviewData === 'function') updatePreviewData();
    } else if (attempts > 30) {
      clearInterval(interval);
      console.warn('%c[index.js, waitForHostAndNavigate]', 'color: orange;', 'Warning: Timed out waiting for host ' + serverUid + ' to load.');
      if (host) hostChosen(host); // Fallback to trigger offline error or Auto WOL
    }
  }, 1000);
}

// Navigates to a specific app on a host from a Smart Hub Preview deep link.
// Waits for the host to load, then checks availability and whether the app still exists.
// - If the host is offline: removes it from preview and returns to the Moonlight home screen.
// - If the app no longer exists on the server: connects to the host and shows the current app list.
// - If the app exists: connects to the host and navigates directly to the app list.
function waitForHostAndNavigateToApp(serverUid, appId) {
  var attempts = 0;
  var interval = setInterval(function() {
    attempts++;
    var host = hosts[serverUid];

    if (host && (host.online || isSubnetScanFinished)) {
      clearInterval(interval);
      console.log('%c[index.js, waitForHostAndNavigateToApp]', 'color: green;', 'Host found for deep link, checking availability: ' + serverUid);

      // Check whether the host is online before trying to connect
      if (!host.online) {
        hostChosen(host, function() {
          // Success callback: The host is now online. Retry the deep link navigation.
          waitForHostAndNavigateToApp(serverUid, appId);
        });
        return;
      }

      // Host is online: check whether the requested app still exists
      host.getAppListWithCacheFlush().then(function(appList) {
        // Apply the selected app ordering before caching and rendering the list.
        const sortedAppList = sortAppsForHost(host, appList);

        // Keep the host's app ID/title mapping available independently of Smart Hub support.
        cacheHostAppList(host, sortedAppList);
        updatePreviewData();

        var appExists = appList.some(function(app) {
          return app.id === appId;
        });
        if (appExists) {
          // App still exists: connect, show the app list, and auto-launch the app
          console.log('%c[index.js, waitForHostAndNavigateToApp]', 'color: green;', 'App ' + appId + ' found, launching app from deep link.');
          hostChosen(host);
          // Wait for the app list to render, then scroll to the app and launch it automatically.
          // This ensures the app list is in the navigation stack so Back returns correctly:
          // streaming session → app list → Moonlight home screen.
          var gameStartAttempts = 0;
          var gameStartInterval = setInterval(function() {
            gameStartAttempts++;
            var gameContainer = document.getElementById('game-container-' + appId);
            if (gameContainer) {
              clearInterval(gameStartInterval);
              gameContainer.scrollIntoView({ behavior: 'smooth', block: 'center' });
              startGame(host, appId);
            } else if (gameStartAttempts > 30) {
              clearInterval(gameStartInterval);
              console.warn('%c[index.js, waitForHostAndNavigateToApp]', 'color: orange;', 'Warning: Timed out waiting for game container for app ' + appId + ' to appear.');
            }
          }, 200);
        } else {
          // App no longer exists: connect to host and show the current app list
          console.warn('%c[index.js, waitForHostAndNavigateToApp]', 'color: orange;', 'App ' + appId + ' not found on host, showing current app list.');
          snackbarLogLong('The selected app is no longer available on this host. Showing the current app list.');
          hostChosen(host);
        }
      }, function() {
        // Could not fetch app list (host may have gone offline during the check)
        hostChosen(host);
      });
    } else if (!host && isHostsLoaded) {
      clearInterval(interval);
      console.warn('%c[index.js, waitForHostAndNavigateToApp]', 'color: orange;', 'Host ' + serverUid + ' no longer exists in Moonlight.');
      snackbarLogLong('The selected host is no longer available on Moonlight.');
      if (typeof updatePreviewData === 'function') updatePreviewData();
    } else if (attempts > 30) { // 30s timeout
      clearInterval(interval);
      console.warn('%c[index.js, waitForHostAndNavigateToApp]', 'color: orange;', 'Warning: Timed out waiting for host ' + serverUid + ' to load.');
      if (host) hostChosen(host); // Fallback to trigger offline error or Auto WOL
    }
  }, 1000);
}

// Handles deep link navigation when the app is launched from a Smart Hub Preview tile.
// Reads the PAYLOAD from AppControl data and navigates to the appropriate host and app.
function handleDeepLink() {
  if (!_isSmartHubSupported) {
    return;
  }
  try {
    var reqAppControl = tizen.application.getCurrentApplication().getRequestedAppControl();
    if (!reqAppControl) {
      console.warn('%c[index.js, handleDeepLink]', 'color: green;', 'Warning: No requested app control found, skipping deep link handling!');
      return;
    }

    var appControlData = reqAppControl.appControl.data;
    console.log('%c[index.js, handleDeepLink]', 'color: green;', 'App control data: ' + JSON.stringify(appControlData));

    for (var i = 0; i < appControlData.length; i++) {
      if (appControlData[i].key === 'PAYLOAD') {
        var payload = JSON.parse(appControlData[i].value[0]);
        var actionData = JSON.parse(payload.values);
        console.log('%c[index.js, handleDeepLink]', 'color: green;', 'Deep link action data: ', actionData);

        if (actionData.serverUid && actionData.appId !== null && actionData.appId !== undefined) {
          // App-level deep link from a preview tile: navigate to the specific host and app
          waitForHostAndNavigateToApp(actionData.serverUid, actionData.appId);
        } else if (actionData.serverUid) {
          // Host-level deep link: navigate to the host's app list
          waitForHostAndNavigate(actionData.serverUid);
        }
        break;
      }
    }
  } catch (e) {
    console.error('%c[index.js, handleDeepLink]', 'color: green;', 'Error: No deep link or error processing it: ' + e.message);
  }
}

// Builds Smart Hub Preview tiles from the cached per-host app lists and sends the
// preview data to the background service, which calls webapis.preview.setPreviewData().
// The webapis.preview API is only accessible from within a Tizen background service.
// The preview is populated only from successfully connected hosts (stored in _previewApps).
function updatePreviewData() {
  try {
    var packageId = tizen.application.getCurrentApplication().appInfo.packageId;
    if (!_isSmartHubSupported) {
      console.log('%c[index.js, updatePreviewData]', 'color: green;', 'Smart Hub Preview is not supported on this device. Skipping!');
      return;
    }

    // Build one section per host that has a cached app list
    // Smart Hub supports a maximum of 40 tiles across all sections
    var sections = [];
    var totalTiles = 0;
    var SMART_HUB_MAX_TILES = 40;
    Object.keys(_previewApps).forEach(function(serverUid) {
      var entry = _previewApps[serverUid];
      if (!entry || !entry.apps || entry.apps.length === 0) {
        console.error('%c[index.js, updatePreviewData]', 'color: green;', 'Error: No apps found for host ' + serverUid);
        return;
      }

      // Stop adding sections once the Smart Hub tile limit is reached
      if (totalTiles >= SMART_HUB_MAX_TILES) {
        return;
      }

      // Only include as many apps as can fit within the remaining tile limit
      var remainingTiles = SMART_HUB_MAX_TILES - totalTiles;
      var apps = entry.apps.slice(0, remainingTiles);

      // Create a tile for each app in the host's app list, including the title, subtitle, and action data
      var tiles = apps.map(function(app, index) {
        // Each tile object accepts a `position` attribute. By explicitly setting
        // the global position, we override the native behavior and enforce our
        // custom sorting (A-Z or Z-A).
        var tile = {
          title: app.title,
          subtitle: entry.hostname,
          action_data: JSON.stringify({
            serverUid: serverUid, address: entry.address, appId: app.id, appName: app.title
          }),
          is_playable: true,
          position: totalTiles + index
        };
        if (app.imageUri) {
          tile.image_url = app.imageUri;
        }
        if (app.txtPath) {
          tile.txtPath = app.txtPath;
        }
        return tile;
      });

      // Update the total tile count after adding this host's tiles
      totalTiles += tiles.length;

      // Only add the section if it contains tiles
      if (tiles.length > 0) {
        sections.push({
          title: entry.hostname, tiles: tiles
        });
      }
    });

    if (sections.length === 0) {
      console.log('%c[index.js, updatePreviewData]', 'color: green;', 'No preview app data found, clearing Smart Hub Preview.');
    }

    var previewData = {
      sections: sections
    };
    var serviceId = packageId + '.service';

    console.log('%c[index.js, updatePreviewData]', 'color: green;', 'Launching Smart Hub service with preview data: ', previewData);

    // Set up local message port to receive responses from the service
    if (_smartHubLocalMessagePort && _smartHubMessagePortListener !== null) {
      try {
        _smartHubLocalMessagePort.removeMessagePortListener(_smartHubMessagePortListener);
      } catch (e) {
        // Ignore listener removal errors
        console.error('%c[index.js, updatePreviewData]', 'color: green;', 'Error removing previous Smart Hub message port listener: ' + e.message);
      }
    }
    _smartHubLocalMessagePort = tizen.messageport.requestLocalMessagePort(packageId);
    _smartHubMessagePortListener = _smartHubLocalMessagePort.addMessagePortListener(function(uiData) {
      console.log('%c[index.js, updatePreviewData]', 'color: green;', 'Received from Smart Hub service: ' + uiData[0].value);
      if (uiData[0].value === 'Service stopping...' || uiData[0].value === 'Service exiting...') {
        try {
          _smartHubLocalMessagePort.removeMessagePortListener(_smartHubMessagePortListener);
          _smartHubMessagePortListener = null;
        } catch (e) {
          // Ignore listener removal errors
          console.error('%c[index.js, updatePreviewData]', 'color: green;', 'Error removing Smart Hub message port listener: ' + e.message);
        }
      }
    });

    // Launch the background service with the preview data via AppControl
    tizen.application.launchAppControl(
      new tizen.ApplicationControl(
        'http://tizen.org/appcontrol/operation/pick', null, 'image/jpeg', null,
        [new tizen.ApplicationControlData('Preview', [JSON.stringify(previewData)])]
      ),
      serviceId, function() {
        console.log('%c[index.js, updatePreviewData]', 'color: green;', 'Preview data sent to service: ' + serviceId);
      }, function(err) {
        console.error('%c[index.js, updatePreviewData]', 'color: green;', 'Failed to launch Smart Hub service: ' + err.message);
      }
    );
  } catch (e) {
    console.error('%c[index.js, updatePreviewData]', 'color: green;', 'Error while updating Smart Hub preview data: ' + e.message);
  }
}

// The Smart Hub payload was parsed exactly once by the early script in index.html.


function updateDirectSmartHubStartingStatus() {
  if (!_directSmartHubLaunch) return;
  var appName = _directSmartHubLaunch.appName || String(_directSmartHubLaunch.appId);
  var title = document.getElementById('loadingSpinnerTitle');
  var message = document.getElementById('loadingSpinnerMessage');
  if (title) title.textContent = t('Starting %1$s...', appName);
  if (message) message.textContent = t('Switching to streaming mode...');
}

if (_directSmartHubLaunch) {
  // Show the app immediately, then add the host name when the saved host is restored.
  updateDirectSmartHubStartingStatus(null);
}

function directSmartHubLaunchFailure(message) {
  if (!_directSmartHubLaunch || _directSmartHubLaunchFailed) return;
  _directSmartHubLaunchFailed = true;
  streamStartupGeneration++;
  streamStartupFailureHandled = true;
  window._streamStartupFailureHandled = true;
  clearStreamStartupWatchdog();
  console.error('%c[index.js, directSmartHubLaunchFailure]', 'color: red;', message);
  var title = document.getElementById('loadingSpinnerTitle');
  var status = document.getElementById('loadingSpinnerMessage');
  if (title) title.textContent = t('Unable to start streaming');
  if (status) status.textContent = message || t('Unable to launch the selected app.');

  var exitAfterMessage = function() {
    window.setTimeout(function() {
      exitApplication();
    }, SMART_HUB_STARTUP_ERROR_MIN_VISIBLE_MS);
  };
  if (typeof showStreamTransitionBackground === 'function') showStreamTransitionBackground(exitAfterMessage);
  else {
    var layer = document.getElementById('stream-transition-layer');
    if (layer) layer.style.display = 'block';
    exitAfterMessage();
  }
}

function maybeStartDirectSmartHubLaunch() {
  if (!_directSmartHubLaunch || _directSmartHubLaunchStarted || _directSmartHubLaunchFailed ||
      !_directSmartHubHostReady || !_directSmartHubSettingsReady || !isStartupHttpReady) return;
  _directSmartHubLaunchStarted = true;
  var host = _directSmartHubHost;
  if (!host || !host.paired) {
    directSmartHubLaunchFailure(t('The selected host is no longer available on Moonlight.'));
    return;
  }
  console.log('%c[index.js, maybeStartDirectSmartHubLaunch]', 'color: green;', 'Checking selected host and launching app ' + _directSmartHubLaunch.appId + ' directly.');
  // startGame performs one host-specific server-info refresh before launching.
  // Do not run the background host-polling path for a direct Smart Hub request.
  api = host;
  localStorage.setItem('lastOpenedHost', host.serverUid);
  startGame(host, _directSmartHubLaunch.appId);
}

function probeSmartHubSupport() {
  return new Promise(function(resolve) {
    // Check localStorage cache first
    var cached = localStorage.getItem('smartHubSupported');
    if (cached === 'true') {
      _isSmartHubSupported = true;
      console.log('%c[index.js, probeSmartHubSupport]', 'color: green;', 'Smart Hub support (cached): true');
      resolve();
      return;
    }

    // A negative result may have been caused by a transient service or message-port
    // failure. Re-probe on every launch until support is positively confirmed.
    if (cached === 'false') {
      console.log('%c[index.js, probeSmartHubSupport]', 'color: green;', 'Ignoring cached negative Smart Hub result; probing again.');
    }

    // Probe the service whenever support has not been positively confirmed.
    var packageId = tizen.application.getCurrentApplication().appInfo.packageId;
    var serviceId = packageId + '.service';
    
    try {
      var probePort = tizen.messageport.requestLocalMessagePort(packageId);
      var probeListener = probePort.addMessagePortListener(function(data) {
        var key = data[0].key;
        if (key !== 'PROBE') {
          return;
        }
        
        var value = data[0].value;
        _isSmartHubSupported = (value === 'SMART_HUB_SUPPORTED');
        localStorage.setItem('smartHubSupported', String(_isSmartHubSupported));
        console.log('%c[index.js, probeSmartHubSupport]', 'color: green;', 'Smart Hub support (probed): ' + _isSmartHubSupported);
        try {
          probePort.removeMessagePortListener(probeListener);
        } catch(e) {
          console.error('%c[index.js, probeSmartHubSupport]', 'color: green;', 'Error removing Smart Hub probe listener: ' + e.message);
        }
        resolve();
      });

      // Launch service with Probe request
      tizen.application.launchAppControl(
        new tizen.ApplicationControl(
          'http://tizen.org/appcontrol/operation/pick', null, null, null,
          [new tizen.ApplicationControlData('Probe', ['check'])]
        ),
        serviceId, function() {
          console.log('%c[index.js, probeSmartHubSupport]', 'color: green;', 'Probe sent to service.');
        }, function(err) {
          // Service launch failed — assume not supported
          console.warn('%c[index.js, probeSmartHubSupport]', 'color: green;', 'Probe failed: ' + err.message);
          _isSmartHubSupported = false;
          localStorage.setItem('smartHubSupported', 'false');
          resolve();
        }
      );
    } catch (e) {
      console.warn('%c[index.js, probeSmartHubSupport]', 'color: green;', 'Error probing Smart Hub support: ' + e.message);
      _isSmartHubSupported = false;
      localStorage.setItem('smartHubSupported', 'false');
      resolve();
    }
  });
}

// Do not create the summary bar until the persisted preference has been loaded.
var navigationSoundPreferenceEnabled = true;
var screensaverPreferenceEnabled = true;
var configSummaryPreferenceLoaded = false;
var configSummaryTemporarilyHidden = false;

function createConfigSummaryBar() {
  var bar = document.createElement('div');
  bar.id = 'configSummaryBar';
  bar.setAttribute('aria-label', 'Current Moonlight configuration');

  var items = [
    { label: 'Engine:', id: 'summaryPlaybackEngine', icon: 'static/res/ic_summary_engine.svg' },
    { label: 'Resolution', id: 'summaryResolution', icon: 'static/res/ic_summary_resolution.svg' },
    { label: 'FPS', id: 'summaryFps', icon: 'static/res/ic_summary_fps.svg' },
    { label: 'Bitrate', id: 'summaryBitrate', icon: 'static/res/ic_summary_bitrate.svg' },
    { label: 'Optimal bitrate', id: 'summaryOptimalBitrate', toggle: true, icon: 'static/res/ic_summary_optimal_bitrate.svg' },
    { label: 'HDR', id: 'summaryHdr', toggle: true, icon: 'static/res/ic_summary_hdr.svg' },
    { label: 'Codec', id: 'summaryCodec', icon: 'static/res/ic_summary_codec.svg' },
    { label: 'Dolby', id: 'summaryDolby', toggle: true, icon: 'static/res/ic_dolby_double_d.svg' },
    { label: 'Audio', id: 'summaryAudio', icon: 'static/res/ic_summary_audio.svg' },
    { label: 'Game mode summary', id: 'summaryGameMode', toggle: true, icon: 'static/res/ic_summary_gamepad.svg' }
  ];

  items.forEach(function(entry) {
    var item = document.createElement('div');
    item.className = 'config-summary-item';
    item.setAttribute('data-summary-id', entry.id);

    if (entry.icon) {
      var icon = document.createElement('img');
      icon.className = 'config-summary-icon' + (entry.id === 'summaryDolby' ? ' config-summary-icon--dolby' : '');
      icon.src = entry.icon;
      icon.alt = '';
      icon.setAttribute('aria-hidden', 'true');
      icon.setAttribute('draggable', 'false');
      item.appendChild(icon);
    }

    var label = document.createElement('span');
    label.className = 'config-summary-label';
    label.setAttribute('data-i18n', entry.label);
    label.textContent = (typeof t === 'function' ? t(entry.label) : entry.label).replace(/:\s*$/, '');

    var value = document.createElement('span');
    value.id = entry.id;
    value.className = 'config-summary-value' + (entry.toggle ? ' config-summary-toggle' : '');
    value.textContent = '—';

    item.appendChild(label);
    item.appendChild(value);
    bar.appendChild(item);
  });

  var mainContent = document.getElementById('main-content');
  if (mainContent && mainContent.parentNode) {
    mainContent.parentNode.insertBefore(bar, mainContent);
  } else {
    return null;
  }
  return bar;
}

function updateConfigSummaryBar() {
  var positionButton = document.getElementById('selectConfigSummaryPosition');
  var summaryPosition = configSummaryPreferenceLoaded && positionButton
    ? normalizeConfigSummaryPosition(positionButton.getAttribute('data-value')) : 'hidden';
  var bar = document.getElementById('configSummaryBar');

  // Hidden removes the element entirely instead of retaining an invisible DOM subtree.
  if (summaryPosition === 'hidden') {
    if (bar && bar.parentNode) bar.parentNode.removeChild(bar);
    return;
  }

  if (!bar) bar = createConfigSummaryBar();
  if (!bar) return;

  bar.classList.toggle('config-summary-bottom', summaryPosition === 'bottom');

  // Keep the strip in normal layout flow, above or below the main content.
  var mainContent = document.getElementById('main-content');
  if (mainContent && mainContent.parentNode) {
    if (summaryPosition === 'bottom') {
      if (bar.parentNode !== mainContent.parentNode || bar.previousSibling !== mainContent) {
        mainContent.parentNode.insertBefore(bar, mainContent.nextSibling);
      }
    } else if (bar.parentNode !== mainContent.parentNode || bar.nextSibling !== mainContent) {
      mainContent.parentNode.insertBefore(bar, mainContent);
    }
  }

  // Keep the element in the DOM, but suppress it during UI transitions that must not show the summary bar.
  if (configSummaryTemporarilyHidden) {
    if (bar.style.display !== 'none') bar.style.display = 'none';
    return;
  }

  function isVisible(element) {
    return !!element && window.getComputedStyle(element).display !== 'none';
  }

  // Keep the strip visible while transitioning between Hosts and Apps.
  // The destination title is updated before its grid is shown, so relying only
  // on grid visibility causes the strip to disappear briefly during this gap.
  var onHostsScreen = isVisible(document.getElementById('host-grid'));
  var onAppsScreen = isVisible(document.getElementById('game-grid'));
  var headerTitle = document.getElementById('header-title');
  var titleText = headerTitle ? headerTitle.textContent.trim() : '';
  var onHostsOrAppsTransition = titleText === t('Hosts') || titleText === t('Apps');
  var onSettingsScreen = titleText === t('Settings') || isVisible(document.getElementById('settings-list'));
  // The whole main UI layer is hidden during streaming, so visibility does not
  // need to depend on isInGame here; this function only manages the strip within that layer.
  var desiredDisplay = !onSettingsScreen &&
    (onHostsScreen || onAppsScreen || onHostsOrAppsTransition) ? 'flex' : 'none';
  if (bar.style.display !== desiredDisplay) bar.style.display = desiredDisplay;

  function textFor(selector, fallback) {
    var element = document.querySelector(selector);
    if (!element) return fallback;
    var value = element.getAttribute('data-value');
    if (value == null || value === '') value = element.textContent;
    value = String(value || '').trim();
    return value || fallback;
  }

  function toggleFor(selector, summarySelector) {
    var input = document.querySelector(selector);
    var enabled = !!input && input.checked;
    var output = document.querySelector(summarySelector);
    if (!output) return;
    output.textContent = enabled ? 'on' : 'off';
    output.classList.toggle('is-on', enabled);
    output.classList.toggle('is-off', !enabled);
  }

  var resolution = textFor('#selectResolution', '1280:720')
    .replace(/[:×]/g, 'x')
    .replace(/\s+/g, '');
  var resolutionNames = {
    '854x480': 'SD',
    '1280x720': 'HD',
    '1920x1080': 'FHD',
    '2560x1440': '2K',
    '3840x2160': '4K',
    '7680x4320': '8K'
  };
  if (resolutionNames[resolution]) {
    resolution += ' (' + resolutionNames[resolution] + ')';
  }
  var fps = textFor('#selectFramerate', '60');
  fps = /fps/i.test(fps) ? fps : fps + ' FPS';
  var bitrate = textFor('#selectBitrate', '10 Mbps');
  if (!/mbps/i.test(bitrate)) bitrate += ' Mbps';
  var codec = textFor('#selectCodec', 'H264').replace(/^H\.264$/i, 'H264');
  if (/^H264$/i.test(codec)) {
    var h264Level = textFor('#selectH264Level', 'Auto');
    var displayH264Level = /^Auto$/i.test(h264Level) ? 'auto' : 'L' + h264Level.replace(/_/g, '.');
    codec = 'H264 (' + displayH264Level + ')';
  }
  var audioDisabled = isAudioOutputDisabled();
  var audioValue = textFor('#selectAudio', 'Stereo');
  var audio = audioDisabled ? 'off' :
    (audioValue === '51Surround' ? '5.1' :
      (audioValue === '71Surround' ? '7.1' :
        (/stereo/i.test(audioValue) ? 'Stereo' : audioValue)));
  var playbackEngine = String($('#selectStreamingEngine').data('value') || 'EMSS');
  playbackEngine = playbackEngine === 'ESPLUSPLAYER' ? t('Native engine') : 'EMSS';

  function setSummaryText(selector, value) {
    var output = document.querySelector(selector);
    if (output && output.textContent !== value) output.textContent = value;
  }

  setSummaryText('#summaryResolution', resolution);
  setSummaryText('#summaryFps', fps);
  setSummaryText('#summaryBitrate', bitrate);
  setSummaryText('#summaryCodec', codec);
  setSummaryText('#summaryPlaybackEngine', playbackEngine);
  setSummaryText('#summaryAudio', audio);
  var dolbySummaryItem = bar.querySelector('[data-summary-id="summaryDolby"]');
  if (dolbySummaryItem) dolbySummaryItem.style.display = audioDisabled ? 'none' : '';
  toggleFor('#optimizeBitrateSwitch', '#summaryOptimalBitrate');
  toggleFor('#hdrModeSwitch', '#summaryHdr');
  if (!audioDisabled) toggleFor('#ac3AudioModeSwitch', '#summaryDolby');
  toggleFor('#gameModeSwitch', '#summaryGameMode');
}

var configSummaryBarInitialized = false;

function initializeConfigSummaryBar() {
  updateConfigSummaryBar();
  if (configSummaryBarInitialized || typeof MutationObserver !== 'function' || !document.body) return;
  configSummaryBarInitialized = true;

  // Track setting changes and screen navigation without coupling the strip to each handler.
  var observer = new MutationObserver(function() {
    updateConfigSummaryBar();
  });
  observer.observe(document.body, {
    subtree: true,
    childList: true,
    characterData: true,
    attributes: true,
    attributeFilter: ['class', 'style', 'data-value', 'checked']
  });
  document.addEventListener('input', updateConfigSummaryBar, true);
  document.addEventListener('change', updateConfigSummaryBar, true);
}

function onWindowLoad() {
  // The normal route must not initialize the application while the launch
  // presentation is visible. The completion callback replays this handler.
  if (!_directSmartHubLaunch && window._normalLaunchSplashActive &&
      !window._normalLaunchSplashFinished) {
    window._normalLaunchWindowLoadPending = true;
    return;
  }

  var isForceGMVariant = checkForceGMVariant();
  var buildVer = getBuildVersion(appInfo.version);
  console.log('%c[index.js, onWindowLoad]', 'color: green;', 'App Version: ' + appInfo.name + (isForceGMVariant ? '-ForceGM' : '') + ' v' + buildVer);
  if (!_directSmartHubLaunch) {
    initSamsungKeys();
    initSpecialKeys();
  }

  // The HTML video element's playing event is a fallback for builds without displayVideo.
  var streamVideoElement = document.getElementById('wasm_module');
  if (streamVideoElement) {
    streamVideoElement.addEventListener('playing', function() {
      if (_directSmartHubLaunch) handleDirectSmartHubVideoReady();
      else handleNormalStreamVideoReady();
    });
  }

  if (_directSmartHubLaunch) {
    // Bound the entire direct-launch preparation, including certificate and saved-host restore.
    armStreamStartupWatchdog('initialization', 15000);
    // Register only stream-specific remote controls. Do not initialize home-screen navigation.
    initDirectSamsungKeys();
    initSpecialKeys();
    console.log('%c[index.js, onWindowLoad]', 'color: green;', 'Direct Smart Hub app launch detected: ' + JSON.stringify(_directSmartHubLaunch));
    hideUiLayerImmediately('main-ui-layer');
    var directLocalePromise = window._directSmartHubLocalePromise || Promise.resolve();
    withOperationTimeout(Promise.resolve(directLocalePromise).then(function() {
      return loadDirectSmartHubStreamSettings();
    }), 15000, 'Direct launch initialization').catch(function(error) {
      console.error('%c[index.js, onWindowLoad]', 'color: red;', 'Direct-stream initialization failed:', error);
      directSmartHubLaunchFailure(t('Moonlight could not initialize the streaming interface.'));
    });
    return;
  }

  isStartupWindowLoaded = true;
  maybeRestoreUiAfterStartup();

  // Normal startup restoration, including WebAssembly and stored-data loading,
  // is reached only after the HTML launch presentation has completed.
}

window.onload = onWindowLoad;

// Gamepad connected events
window.addEventListener('gamepadconnected', function(e) {
  if (_directSmartHubLaunch) return;
  const connectedGamepad = e.gamepad;
  const gamepadIndex = connectedGamepad.index;
  const gamepadName = typeof connectedGamepad.id === 'string' && connectedGamepad.id.trim()
    ? (connectedGamepad.id.trim().split('(')[0].trim() || gamepadIndex) : gamepadIndex;
  const rumbleFeedbackSwitch = document.getElementById('rumbleFeedbackSwitch');
  console.log('%c[index.js, gamepadconnected]', 'color: green;', 'Gamepad connected:\n' + JSON.stringify(connectedGamepad), connectedGamepad);
  snackbarLog('Gamepad %1$s has been connected.', gamepadName);
  // Check if the rumble feedback switch is checked
  if (rumbleFeedbackSwitch.checked) {
    // Check if the connected gamepad has a vibrationActuator associated with it
    if (connectedGamepad.vibrationActuator) {
      console.log('%c[index.js, gamepadconnected]', 'color: green;', 'Playing rumble on the connected gamepad ' + gamepadIndex + '...');
      connectedGamepad.vibrationActuator.playEffect('dual-rumble', {
        startDelay: 0,
        duration: 500,
        weakMagnitude: 0.5,
        strongMagnitude: 0.5,
      });
    } else {
      console.warn('%c[index.js, gamepadconnected]', 'color: green;', 'Warning: Connected gamepad ' + gamepadIndex + ' does not support the rumble feature!');
    }
  }
});

// Gamepad disconnected events
window.addEventListener('gamepaddisconnected', function(e) {
  if (_directSmartHubLaunch) return;
  const disconnectedGamepad = e.gamepad;
  const gamepadIndex = disconnectedGamepad.index;
  const gamepadName = typeof disconnectedGamepad.id === 'string' && disconnectedGamepad.id.trim()
    ? (disconnectedGamepad.id.trim().split('(')[0].trim() || gamepadIndex) : gamepadIndex;
  console.log('%c[index.js, gamepaddisconnected]', 'color: green;', 'Gamepad disconnected:\n' + JSON.stringify(disconnectedGamepad), disconnectedGamepad);
  snackbarLog('Gamepad %1$s has been disconnected.', gamepadName);
  console.warn('%c[index.js, gamepaddisconnected]', 'color: green;', 'Warning: Lost connection to gamepad ' + gamepadIndex + '. Please reconnect your gamepad!');
});
