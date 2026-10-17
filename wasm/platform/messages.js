/* eslint-disable */

const SyncFunctions = {
  // no parameters
  'makeCert': (...args) => Module.makeCert(...args),
  // cert, privateKey, myUniqueid
  'httpInit': (...args) => Module.httpInit(...args),
  /* host, httpPort, width, height, fps, bitrate, rikey, rikeyid, appversion, gfeversion, rtspurl, serverCodecModeSupport,
  framePacing, optimizeGames, rumbleFeedback, mouseEmulation, flipABfaceButtons, flipXYfaceButtons, audioBackend,
  audioConfig, audioSync, audioJitter, playHostAudio, decryptHostAudio, videoCodec, hdrMode, fullRange, gameMode,
  disableWarnings, performanceStats */
  'startRequest': (...args) => Module.startStream(...args),
  // no parameters
  'stopRequest': (...args) => Module.stopStream(...args),
  // no parameters
  'cancelRequest': (...args) => Module.cancelRequest(...args),
  // no parameters
  'toggleStats': (...args) => Module.toggleStats(...args),
};

const AsyncFunctions = {
  // url, ppk, binaryResponse
  'openUrl': (id, url, ppk, binary) => Module.openUrl(id, url, ppk, binary),
  // no parameters
  'STUN': (...args) => Module.stun(...args),
  // serverMajorVersion, address, httpPort, randomNumber
  'pair': (...args) => Module.pair(...args),
  // macAddress
  'wakeOnLan': (...args) => Module.wakeOnLan(...args),
};

var callbacks = {}
var callbacks_ids = 1;

function escapeHTML(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function normalizeBackendMessageText(text) {
  return String(text || '')
    .replace(/\\n/g, '\n')
    .replace(/\r\n/g, '\n')
    .trim();
}

function replaceKnownStageLabels(text) {
  const stageLabels = [
    'none',
    'platform initialization',
    'name resolution',
    'audio stream initialization',
    'RTSP handshake',
    'control stream initialization',
    'video stream initialization',
    'input stream initialization',
    'control stream establishment',
    'video stream establishment',
    'audio stream establishment',
    'input stream establishment',
  ];

  const translatedStageLabels = [
    t('none'),
    t('platform initialization'),
    t('name resolution'),
    t('audio stream initialization'),
    t('RTSP handshake'),
    t('control stream initialization'),
    t('video stream initialization'),
    t('input stream initialization'),
    t('control stream establishment'),
    t('video stream establishment'),
    t('audio stream establishment'),
    t('input stream establishment'),
  ];

  let translated = text.replace(/\bStarting\b/g, t('Starting'));
  stageLabels.forEach((label, i) => {
    const escapedLabel = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    translated = translated.replace(new RegExp(escapedLabel, 'gi'), translatedStageLabels[i]);
  });

  return translated;
}

function replaceKnownStatsLabels(text) {
  return text
    .replace(/Video stream:/g, t('Video stream:'))
    .replace(/Audio stream:/g, t('Audio stream:'))
    .replace(/Codec:/g, t('Codec:'))
    .replace(/Incoming frame rate from network:/g, t('Incoming frame rate from network:'))
    .replace(/Decoding frame rate:/g, t('Decoding frame rate:'))
    .replace(/Rendering frame rate:/g, t('Rendering frame rate:'))
    .replace(/Incoming bitrate from network:/g, t('Incoming bitrate from network:'))
    .replace(/Host processing latency min\/max\/average:/g, t('Host processing latency min/max/average:'))
    .replace(/Frames dropped by your network connection:/g, t('Frames dropped by your network connection:'))
    .replace(/Average network latency:/g, t('Average network latency:'))
    .replace(/\bvariance:/g, t('variance:'))
    .replace(/\bN\/A\b/g, t('N/A'))
    .replace(/Average decoding time:/g, t('Average decoding time:'))
    .replace(/Average frame queue delay:/g, t('Average frame queue delay:'))
    .replace(/Average rendering time:/g, t('Average rendering time:'))
    .replace(/Slow connection to PC\.\nReduce your bitrate!/g, t('Slow connection to PC.\nReduce your bitrate!'));
}


// Ignore queued statistics messages after a stream has terminated.
var performanceStatsStreamTerminated = false;
var streamVideoReady = false;

// Rolling one-minute history for the performance statistics graph.
var performanceStatsGraphSamples = [];
const PERFORMANCE_STATS_GRAPH_SECONDS = 60;
const PERFORMANCE_STATS_GRAPH_HEIGHT = 160;

const PERFORMANCE_STATS_GRAPH_COLORS = {
  good: '#35c879',
  warning: '#f2cc45',
  elevated: '#ff9638',
  critical: '#ff4d4f',
  unavailable: '#858b96'
};

function resetPerformanceStatsGraph() {
  performanceStatsGraphSamples.length = 0;
}

function ensurePerformanceStatsOverlayElements() {
  var container = document.getElementById('performance-stats');
  if (!container) return null;

  var textElement = container.querySelector('.performance-stats-text');
  var canvas = container.querySelector('#performance-stats-graph');
  if (!textElement || !canvas) {
    var previousText = textElement ? textElement.textContent : container.textContent;
    container.textContent = '';

    textElement = document.createElement('div');
    textElement.className = 'performance-stats-text';
    textElement.textContent = previousText || '';

    canvas = document.createElement('canvas');
    canvas.id = 'performance-stats-graph';
    canvas.setAttribute('role', 'img');
    canvas.setAttribute('aria-label', t('Network latency (RTT, ms)'));
    canvas.style.display = 'block';
    canvas.style.width = '100%';
    canvas.style.height = PERFORMANCE_STATS_GRAPH_HEIGHT + 'px';
    canvas.style.marginTop = '16px';

    container.appendChild(textElement);
    container.appendChild(canvas);
  }

  return { container: container, text: textElement, canvas: canvas };
}

function getPerformanceStatsGraphColor(sample) {
  if (sample.droppedFrames > 0 || sample.rtt >= 100 || sample.variance >= 50) {
    return PERFORMANCE_STATS_GRAPH_COLORS.critical;
  }
  if (sample.rtt >= 60 || sample.variance >= 25) {
    return PERFORMANCE_STATS_GRAPH_COLORS.elevated;
  }
  if (sample.rtt >= 30 || sample.variance >= 10) {
    return PERFORMANCE_STATS_GRAPH_COLORS.warning;
  }
  if (sample.rtt <= 0) {
    return PERFORMANCE_STATS_GRAPH_COLORS.unavailable;
  }
  return PERFORMANCE_STATS_GRAPH_COLORS.good;
}

function drawPerformanceStatsGraph() {
  var elements = ensurePerformanceStatsOverlayElements();
  if (!elements) return;

  var canvas = elements.canvas;
  var containerStyle = window.getComputedStyle ? window.getComputedStyle(elements.container) : null;
  var horizontalPadding = containerStyle
    ? (parseFloat(containerStyle.paddingLeft) || 0) + (parseFloat(containerStyle.paddingRight) || 0)
    : 0;
  var availableWidth = Math.round(elements.container.clientWidth - horizontalPadding);
  var measuredWidth = Math.round(canvas.getBoundingClientRect().width || 0);
  var width = Math.max(300, availableWidth, measuredWidth);
  if (canvas.width !== width) canvas.width = width;
  if (canvas.height !== PERFORMANCE_STATS_GRAPH_HEIGHT) canvas.height = PERFORMANCE_STATS_GRAPH_HEIGHT;

  var context = canvas.getContext('2d');
  if (!context) return;

  var height = PERFORMANCE_STATS_GRAPH_HEIGHT;
  context.clearRect(0, 0, width, height);
  context.textBaseline = 'middle';
  context.font = '12px sans-serif';
  context.fillStyle = 'rgba(255,255,255,0.95)';
  var graphTitle = t('Network latency (RTT, ms)');
  context.fillText(graphTitle, 4, 9);

  // Numeric thresholds make the color scale legible without adding untranslated UI strings.
  var legend = [
    { color: PERFORMANCE_STATS_GRAPH_COLORS.good, label: '<30' },
    { color: PERFORMANCE_STATS_GRAPH_COLORS.warning, label: '30–59' },
    { color: PERFORMANCE_STATS_GRAPH_COLORS.elevated, label: '60–99' },
    { color: PERFORMANCE_STATS_GRAPH_COLORS.critical, label: '100+ !' }
  ];
  var legendX = 4 + context.measureText(graphTitle).width + 14;
  legend.forEach(function(item) {
    context.fillStyle = item.color;
    context.fillRect(legendX, 5, 8, 8);
    context.fillStyle = 'rgba(255,255,255,0.92)';
    context.fillText(item.label, legendX + 12, 9);
    legendX += 22 + context.measureText(item.label).width;
  });

  var plotLeft = 34;
  var plotRight = width - 4;
  var plotTop = 35;
  var plotBottom = 149;
  var plotHeight = plotBottom - plotTop;
  var plotWidth = Math.max(1, plotRight - plotLeft);

  // Adapt the vertical scale to the recent RTT history. The 95th percentile prevents
  // a single spike from flattening the rest of the graph, while the scale remains
  // high enough to show occasional peaks distinctly. Higher samples saturate at the top.
  var validRttValues = performanceStatsGraphSamples
    .map(function(sample) { return sample.rtt; })
    .filter(function(rtt) { return rtt > 0; })
    .sort(function(a, b) { return a - b; });
  var percentileIndex = Math.max(0, Math.ceil(validRttValues.length * 0.95) - 1);
  var percentileRtt = validRttValues.length ? validRttValues[percentileIndex] : 0;
  var scaleMaximum = Math.max(20, Math.ceil((percentileRtt * 1.2) / 10) * 10);
  var midpointRtt = Math.round(scaleMaximum / 2);

  context.font = '10px sans-serif';
  context.fillStyle = 'rgba(255,255,255,0.85)';
  context.fillText(String(scaleMaximum), 2, plotTop);
  context.fillText(String(midpointRtt), 8, plotTop + plotHeight / 2);
  context.fillText('0', 14, plotBottom);

  context.strokeStyle = 'rgba(255,255,255,0.20)';
  context.lineWidth = 1;
  [plotTop + 0.5, plotTop + plotHeight / 2 + 0.5, plotBottom + 0.5].forEach(function(y) {
    context.beginPath();
    context.moveTo(plotLeft, y);
    context.lineTo(plotRight, y);
    context.stroke();
  });

  var slotWidth = plotWidth / PERFORMANCE_STATS_GRAPH_SECONDS;
  var barWidth = Math.max(1, Math.floor(slotWidth * 0.72));
  var firstSlot = PERFORMANCE_STATS_GRAPH_SECONDS - performanceStatsGraphSamples.length;

  performanceStatsGraphSamples.forEach(function(sample, index) {
    var rtt = Math.max(0, Math.min(scaleMaximum, sample.rtt));
    var barHeight = sample.rtt > 0 ? Math.max(2, rtt / scaleMaximum * plotHeight) : 2;
    if (sample.droppedFrames > 0) barHeight = Math.max(4, barHeight);

    var x = plotLeft + (firstSlot + index) * slotWidth + (slotWidth - barWidth) / 2;
    context.fillStyle = getPerformanceStatsGraphColor(sample);
    context.fillRect(Math.round(x), Math.round(plotBottom - barHeight), barWidth, Math.ceil(barHeight));
  });
}

function handlePerformanceStatsGraphMessage(message) {
  var values = message.replace('GraphMsg: ', '').split(',').map(Number);
  if (values.length < 3 || !values.every(Number.isFinite)) return;

  performanceStatsGraphSamples.push({
    rtt: Math.max(0, values[0]),
    variance: Math.max(0, values[1]),
    droppedFrames: Math.max(0, values[2])
  });
  if (performanceStatsGraphSamples.length > PERFORMANCE_STATS_GRAPH_SECONDS) {
    performanceStatsGraphSamples.shift();
  }
  drawPerformanceStatsGraph();
}


// Render statistics as two-column rows: labels on the left and values on the right.
function renderPerformanceStatsText(textElement, text) {
  textElement.textContent = '';
  String(text || '').split('\n').forEach(function(line) {
    if (!line) return;
    var row = document.createElement('div');
    var separator = line.indexOf(':');
    if (separator > 0) {
      row.className = 'performance-stats-row';
      var label = document.createElement('span');
      label.className = 'performance-stats-label';
      label.textContent = line.slice(0, separator + 1);
      var value = document.createElement('span');
      value.className = 'performance-stats-value';
      value.textContent = line.slice(separator + 1).trim();
      row.appendChild(label);
      row.appendChild(value);
    } else {
      row.className = 'performance-stats-message';
      row.textContent = line;
    }
    textElement.appendChild(row);
  });
}

function beginPerformanceStatsStream() {
  performanceStatsStreamTerminated = false;
  resetPerformanceStatsGraph();
}

function replaceKnownWolErrorLabels(text) {
  const wolErrorLabels = [
    'Invalid MAC address format',
    'Invalid MAC address: default zero MAC address not allowed',
    'Failed to create socket',
    'Failed to enable broadcast',
    'Failed to send magic packet to MAC address',
    'Failed to send IPv6 magic packet to MAC address',
    'Unknown error'
  ];

  const translatedWolErrorLabels = [
    t('Invalid MAC address format'),
    t('Invalid MAC address: default zero MAC address not allowed'),
    t('Failed to create socket'),
    t('Failed to enable broadcast'),
    t('Failed to send magic packet to MAC address'),
    t('Failed to send IPv6 magic packet to MAC address'),
    t('Unknown error')
  ];

  let translated = text;
  wolErrorLabels.forEach((label, i) => {
    const escapedLabel = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    translated = translated.replace(new RegExp(escapedLabel, 'gi'), translatedWolErrorLabels[i]);
  });

  return translated;
}

function translateBackendMessage(text) {
  const normalized = normalizeBackendMessageText(text);

  let translated = t(normalized);
  translated = replaceKnownStageLabels(translated);
  translated = replaceKnownStatsLabels(translated);

  return translated;
}

/**
 * var sendMessage - Sends a message with arguments to the Wasm module
 *
 * @param  {String} method A named method
 * @param  {(String|Array)} params An array of options or a single string
 * @return {void}        The Wasm module calls back through the handleMessage method
 */
var _httpLock = Promise.resolve();
// The pairing request waiting in the JS queue, if any, so that canceling can keep it from starting
var _queuedPairing = null;

var sendMessage = function(method, params) {
  if (SyncFunctions[method]) {
    // Starting a request resets the cancel flag in C++, so a canceled pairing request
    // that is still waiting in the JS queue must not start afterwards
    if (method === 'cancelRequest' && _queuedPairing) {
      _queuedPairing.canceled = true;
    }
    return new Promise(function(resolve, reject) {
      const ret = SyncFunctions[method](...params);
      if (ret.type === "resolve") {
        resolve(ret.ret);
      } else {
        reject(ret.ret);
      }
    });
  } else if (method === 'openUrl') {
    // We MUST enforce the timeout in JavaScript because Emscripten's libcurl wrapper
    // completely ignores native timeouts (e.g., CURLOPT_CONNECTTIMEOUT) and relies on
    // the browser's native XHR timeout, which can take up to 1 minute.
    var timeout_ms = params[3] || 0;

    return new Promise(function(resolve, reject) {
      _httpLock = _httpLock.catch(function() {}).then(function() {
        return new Promise(function(innerResolve, innerReject) {
          var isFinished = false;
          var timeoutId = null;
          var url = params[0];

          if (timeout_ms > 0) {
            timeoutId = setTimeout(function() {
              if (!isFinished) {
                isFinished = true;
                console.warn('%c[messages.js, sendMessage]', 'color: gray;', 'Warning: HTTPS request timed out, canceling C++ HTTP request for URL:', url);
                SyncFunctions['cancelRequest']();
                reject(-1); // GS_FAILED
                innerResolve(); // Unlock the JS queue!
              }
            }, timeout_ms);
          }

          const id = callbacks_ids++;
          callbacks[id] = {
            'resolve': function(msg) {
              if (!isFinished) {
                isFinished = true;
                if (timeoutId) clearTimeout(timeoutId);
                resolve(msg);
                innerResolve(); // Unlock the JS queue
              }
            },
            'reject': function(err) {
              if (!isFinished) {
                isFinished = true;
                if (timeoutId) clearTimeout(timeoutId);
                reject(err);
                innerResolve(); // Unlock the JS queue
              }
            }
          };

          AsyncFunctions['openUrl'](id, ...params);
        });
      });
    });
  } else if (method === 'pair') {
    // Pairing runs on the same C++ HTTP thread as openUrl and waits until the PIN is entered on the host,
    // so it must wait in the same JS queue. Otherwise an openUrl request queued behind it would time out
    // and its cancelRequest would abort the pairing request instead.
    var pairing = { canceled: false };
    _queuedPairing = pairing;

    return new Promise(function(resolve, reject) {
      _httpLock = _httpLock.catch(function() {}).then(function() {
        if (_queuedPairing === pairing) {
          _queuedPairing = null;
        }
        // Don't start a pairing request that was canceled while it was waiting in the queue
        if (pairing.canceled) {
          reject(-1); // GS_FAILED
          return;
        }

        return new Promise(function(innerResolve, innerReject) {
          const id = callbacks_ids++;
          callbacks[id] = {
            'resolve': function(msg) {
              resolve(msg);
              innerResolve(); // Unlock the JS queue
            },
            'reject': function(err) {
              reject(err);
              innerResolve(); // Unlock the JS queue
            }
          };

          AsyncFunctions['pair'](id, ...params);
        });
      });
    });
  } else {
    return new Promise(function(resolve, reject) {
      const id = callbacks_ids++;
      callbacks[id] = {
        'resolve': resolve,
        'reject': reject
      };

      AsyncFunctions[method](id, ...params);
    });
  }
}

var handlePromiseMessage = function(callbackId, type, msg) {
  callbacks[callbackId][type](msg);
  delete callbacks[callbackId];
}

/**
 * handleMessage - Handles messages from the Wasm module
 *
 * @param  {Object} msg An object given by the Wasm module
 * @return {void}
 */
function handleMessage(msg) {
  console.log('%c[messages.js, handleMessage]', 'color: gray;', 'Message data: ', msg);
  // If it's a recognized event, notify the appropriate function
  if (msg.indexOf('streamTerminated: ') === 0) {
    streamVideoReady = false;
    // Hide and lock the overlay before painting the direct-launch closing status.
    performanceStatsStreamTerminated = true;
    resetPerformanceStatsGraph();
    $('#connection-warnings, #performance-stats').css('display', 'none');
    $('#performance-stats').text('');

    // Close the Stream Menu if it is open
    closeStreamMenuDialog(false);
    // Release the audio scheduler of the Web Audio backend, which is a no-op for the EMSS backend
    stopAudioScheduler();
    // Diagnostic overlays were hidden and locked at the start of stream termination.
    // Remove the video stream now
    $('#listener').removeClass('fullscreen');
    $('#loadingSpinner').css('display', 'none');
    $('body').css('backgroundColor', '#282C38');
    $('#wasm_module').css('display', 'none');
    var errorCode = parseInt(msg.replace('streamTerminated: ', ''));

    // A direct Smart Hub launch is a single-purpose session: never return to Moonlight's home UI.
    // Preserve the optional "quit host app after disconnect" behavior for graceful disconnects,
    // but always exit this client regardless of whether the stream ended normally or with an error.
    if (window._directSmartHubLaunch) {
      // Paint a minimal status message before exiting; do not restore the home UI.
      if (typeof window.setDirectSmartHubStatus === 'function') {
        var directLaunchHostName = window._directSmartHubLaunch && window._directSmartHubLaunch.hostName;
        if (!directLaunchHostName && window._directSmartHubHost) {
          directLaunchHostName = window._directSmartHubHost.hostname;
        }
        window.setDirectSmartHubStatus(directLaunchHostName
          ? 'Finalizando transmisión con ' + directLaunchHostName + '...'
          : 'Cerrando la transmisión...');
      }
      var shouldQuitDirectHostApp = errorCode === 0 &&
        $('#quitAppAfterDisconnectSwitch').parent().hasClass('is-checked');
      var exitDirectLaunch = function() {
        try {
          tizen.application.getCurrentApplication().exit();
        } catch (error) {
          console.error('%c[messages.js, handleMessage]', 'color: gray;', 'Could not exit after direct Smart Hub session ended:', error);
        }
      };
      var finishDirectLaunch = function() {
        // Give the browser one paint opportunity so the status is visible even when
        // no host-app quit request is needed.
        if (typeof window.requestAnimationFrame === 'function') {
          window.requestAnimationFrame(exitDirectLaunch);
        } else {
          window.setTimeout(exitDirectLaunch, 0);
        }
      };

      if (shouldQuitDirectHostApp && window.api && typeof window.api.quitApp === 'function') {
        window.api.quitApp().then(finishDirectLaunch, function(failedQuitApp) {
          console.error('%c[messages.js, handleMessage]', 'color: gray;', 'Failed to quit the host app after direct Smart Hub session:', failedQuitApp);
          finishDirectLaunch();
        });
      } else {
        finishDirectLaunch();
      }
      return;
    }

    // Standard Moonlight launches retain their existing termination messages and return-to-apps flow.
    switch (errorCode) {
      case 0: // ML_ERROR_GRACEFUL_TERMINATION
        break;
      case -100: // ML_ERROR_NO_VIDEO_TRAFFIC
        snackbarLogLong('No video received from host. Check the host PC\'s firewall and port forwarding rules.');
        break;
      case -101: // ML_ERROR_NO_VIDEO_FRAME
        snackbarLogLong('Your network connection isn\'t performing well. Reduce your video bitrate setting or try a faster connection.');
        break;
      case -102: // ML_ERROR_UNEXPECTED_EARLY_TERMINATION
        snackbarLogLong('Something went wrong on your host PC when starting the stream. Restart your host PC and try again.');
        break;
      case -103: // ML_ERROR_PROTECTED_CONTENT
        snackbarLogLong('An issue occurred on your host PC while starting the stream. Make sure you don\'t have any DRM-protected content open on your host PC.');
        break;
      case -104: // ML_ERROR_FRAME_CONVERSION
        snackbarLogLong('The host PC reported a fatal video encoding error. Try disabling HDR mode, changing the streaming resolution, or changing your host PC\'s display resolution.');
        break;
      case -200: // ERROR_VIDEO_SETUP_FAILED
        snackbarLogLong('The TV was unable to start the streaming with the selected video settings. Try reducing the resolution or frame rate and consider changing the codec.');
        break;
      default:
        snackbarLogLong('Connection terminated');
        break;
    }
    // Mirror Moonlight for Windows: quit the host app after graceful/manual disconnect
    // only. An unexpected connection failure must not terminate the host application.
    var shouldQuitHostApp = errorCode === 0 &&
      $('#quitAppAfterDisconnectSwitch').parent().hasClass('is-checked');

    var refreshHostAndReturnToApps = function() {
      api.refreshServerInfo().then(function(ret) {
        showApps(api).then(() => {
          Navigation.switch();
          if (!window.isDialogOpen) {
            Navigation.change(Views.Apps);
          }
        });
      }, function(failedRefreshInfo) {
        console.error('%c[messages.js, handleMessage]', 'color: gray;', 'Error: Failed to refresh server info! Returned error was: ' + failedRefreshInfo + '!');
        showApps(api).then(() => {
          Navigation.switch();
          if (!window.isDialogOpen) {
            Navigation.change(Views.Apps);
          }
        });
      });
    };

    if (shouldQuitHostApp && api && typeof api.quitApp === 'function') {
      console.log('%c[messages.js, handleMessage]', 'color: gray;', 'Attempting to quit the host app after graceful disconnection.');
      api.quitApp().then(function() {
        console.log('%c[messages.js, handleMessage]', 'color: gray;', 'Host app quit request completed.');
        refreshHostAndReturnToApps();
      }, function(failedQuitApp) {
        console.error('%c[messages.js, handleMessage]', 'color: gray;', 'Failed to quit the host app after disconnection:', failedQuitApp);
        snackbarLogLong('Could not automatically quit the host app.');
        refreshHostAndReturnToApps();
      });
    } else {
      refreshHostAndReturnToApps();
    }

  } else if (msg === 'Connection Established') {
    streamVideoReady = false;
    // The direct-launch status must not cover the video while the first frame is arriving.
    if (window._directSmartHubLaunch) {
      var directStatusOnConnect = document.getElementById('directSmartHubStatus');
      if (directStatusOnConnect) directStatusOnConnect.style.display = 'none';
    }
    // Prepare the screen for video stream
    $('#loadingSpinner').css('display', 'none');
    $('body').css('backgroundColor', 'transparent');
    $('#wasm_module').css('display', '');
    $('#wasm_module').focus();
  } else if (msg.indexOf('ProgressMsg: ') === 0) {
    // Show progress message under loading spinner
    $('#loadingSpinnerMessage').text(translateBackendMessage(msg.replace('ProgressMsg: ', '')));
  } else if (msg.indexOf('TransientMsg: ') === 0) {
    // Show transient message as notification
    snackbarLogLong(translateBackendMessage(msg.replace('TransientMsg: ', '')));
  } else if (msg.indexOf('DialogMsg: ') === 0) {
    // Show dialog message using the warning dialog
    warningDialog(t('Connection Error'), translateBackendMessage(msg.replace('DialogMsg: ', '')));
  } else if (msg === 'displayVideo') {
    streamVideoReady = true;
    // Hide the lightweight direct-launch status once the stream video is ready.
    if (window._directSmartHubLaunch) {
      // Use direct DOM access for compatibility with older Tizen WebKit engines.
      var directStatusElement = document.getElementById('directSmartHubStatus');
      if (directStatusElement) directStatusElement.style.display = 'none';
    }
    // Show the video stream now
    $('#listener').addClass('fullscreen');
  } else if (msg.indexOf('NoWarningMsg: ') === 0) {
    // Hide the connection warnings overlay
    $('#connection-warnings').css('background', 'transparent');
    $('#connection-warnings').text('');
  } else if (msg.indexOf('WarningMsg: ') === 0) {
    // Show the connection warnings overlay
    $('#connection-warnings').css('background', 'rgba(0, 0, 0, 0.5)');
    $('#connection-warnings').text(translateBackendMessage(msg.replace('WarningMsg: ', '')));
  } else if (msg.indexOf('NoStatMsg: ') === 0) {
    // Hide the overlay for this streaming session without changing the saved preference.
    resetPerformanceStatsGraph();
    $('#performance-stats').css('display', 'none');
    $('#performance-stats').css('background', 'transparent');
    $('#performance-stats').text('');
  } else if (msg.indexOf('StatMsg: ') === 0) {
    if (performanceStatsStreamTerminated) return;
    // Show the overlay for this streaming session without changing the saved preference.
    $('#performance-stats').css('display', 'inline-block');
    $('#performance-stats').css('background', 'rgba(0, 0, 0, 0.55)');
    var statsElements = ensurePerformanceStatsOverlayElements();
    if (statsElements) {
      renderPerformanceStatsText(statsElements.text, translateBackendMessage(msg.replace('StatMsg: ', '')));
      drawPerformanceStatsGraph();
    }
  } else if (msg.indexOf('GraphMsg: ') === 0) {
    if (!performanceStatsStreamTerminated) handlePerformanceStatsGraphMessage(msg);
  } else if (msg.indexOf('controllerRumble: ') === 0) {
    const eventData = msg.split(' ')[1].split(',');
    const gamepadIdx = parseInt(eventData[0]);
    const weakMagnitude = parseFloat(eventData[1]);
    const strongMagnitude = parseFloat(eventData[2]);
    const gamepads = navigator.getGamepads();
    const gamepad = gamepads[gamepadIdx];
    // Check if the gamepad exists and if it has a vibrationActuator associated with it
    if (gamepad && gamepad.vibrationActuator) {
      console.log('%c[messages.js, handleMessage]', 'color: gray;', 'Playing rumble on gamepad ' + gamepadIdx + ' with weak magnitude ' + weakMagnitude + ' and strong magnitude ' + strongMagnitude + '...');
      gamepad.vibrationActuator.playEffect('dual-rumble', {
        startDelay: 0,
        duration: 5000, // Moonlight should be sending another rumble event when stopping
        weakMagnitude: weakMagnitude,
        strongMagnitude: strongMagnitude,
      });
    } else {
      console.warn('%c[messages.js, handleMessage]', 'color: gray;', 'Warning: Gamepad ' + gamepadIdx + ' does not support the rumble feature!');
    }
  } else if (msg.indexOf('mouseEmulationOn') === 0) {
    // Show mouse emulation enable status as a notification
    snackbarLogLong('Mouse emulation is activated');
  } else if (msg.indexOf('mouseEmulationOff') === 0) {
    // Show mouse emulation disable status as notification
    snackbarLogLong('Mouse emulation is deactivated');
  }
}
