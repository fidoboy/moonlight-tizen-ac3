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
    .replace(/Audio FEC: (\d+) recovered · (\d+) failed · (\d+) out-of-order/g, function(match, recovered, failed, outOfOrder) {
      return t('Audio FEC:') + ' ' + recovered + ' ' + t(Number(recovered) === 1 ? 'FEC recovered (singular)' : 'FEC recovered') +
        ' · ' + failed + ' ' + t(Number(failed) === 1 ? 'FEC failed (singular)' : 'FEC failed') +
        ' · ' + outOfOrder + ' ' + t('FEC out-of-order');
    })
    .replace(/Codec:/g, t('Codec:'))
    .replace(/Incoming frame rate from network:/g, t('Incoming frame rate from network:'))
    .replace(/Decoding frame rate:/g, t('Decoding frame rate:'))
    .replace(/Rendering frame rate:/g, t('Rendering frame rate:'))
    .replace(/Incoming bitrate from network:/g, t('Incoming bitrate from network:'))
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

// Rolling one-minute history for the performance statistics graph.
var performanceStatsGraphSamples = [];
var performanceStatsHostLatencyLatest = null;
const PERFORMANCE_STATS_GRAPH_SECONDS = 60;
const PERFORMANCE_STATS_GRAPH_HEIGHT = 160;

const PERFORMANCE_STATS_HOST_GRAPH_SERIES = [
  { key: 'min', color: '#4fc3f7', label: 'Host latency minimum' },
  { key: 'max', color: '#ff7043', label: 'Host latency maximum' },
  { key: 'avg', color: '#c084fc', label: 'Host latency average' }
];

const PERFORMANCE_STATS_GRAPH_COLORS = {
  good: '#35c879',
  warning: '#f2cc45',
  elevated: '#ff9638',
  critical: '#ff4d4f',
  unavailable: '#858b96'
};

function resetPerformanceStatsGraph() {
  performanceStatsGraphSamples.length = 0;
  performanceStatsHostLatencyLatest = null;
}

function ensurePerformanceStatsOverlayElements() {
  var container = document.getElementById('performance-stats');
  if (!container) return null;

  var textElement = container.querySelector('.performance-stats-text');
  var canvas = container.querySelector('#performance-stats-graph');
  var hostCanvas = container.querySelector('#performance-stats-host-graph');
  if (!textElement || !canvas || !hostCanvas) {
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

    hostCanvas = document.createElement('canvas');
    hostCanvas.id = 'performance-stats-host-graph';
    hostCanvas.setAttribute('role', 'img');
    hostCanvas.setAttribute('aria-label', t('Host processing latency (ms)'));
    hostCanvas.style.display = 'block';
    hostCanvas.style.width = '100%';
    hostCanvas.style.height = PERFORMANCE_STATS_GRAPH_HEIGHT + 'px';
    hostCanvas.style.marginTop = '16px';

    container.appendChild(textElement);
    container.appendChild(canvas);
    container.appendChild(hostCanvas);
  }

  return { container: container, text: textElement, canvas: canvas, hostCanvas: hostCanvas };
}

function getPerformanceStatsGraphColor(sample) {
  if (sample.droppedFrames > 0 || sample.rtt >= 20 || sample.variance >= 50) {
    return PERFORMANCE_STATS_GRAPH_COLORS.critical;
  }
  if (sample.rtt >= 10 || sample.variance >= 25) {
    return PERFORMANCE_STATS_GRAPH_COLORS.elevated;
  }
  if (sample.rtt >= 5 || sample.variance >= 10) {
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

  var context = canvas.getContext('2d');
  if (!context) return;

  context.font = '12px sans-serif';
  var graphTitle = t('Network latency (RTT, ms)');

  // Numeric thresholds make the color scale legible without adding untranslated UI strings.
  var legend = [
    { color: PERFORMANCE_STATS_GRAPH_COLORS.good, label: '<5' },
    { color: PERFORMANCE_STATS_GRAPH_COLORS.warning, label: '5–9' },
    { color: PERFORMANCE_STATS_GRAPH_COLORS.elevated, label: '10–19' },
    { color: PERFORMANCE_STATS_GRAPH_COLORS.critical, label: '20+ !' }
  ];
  var fecLegend = [
    { color: PERFORMANCE_STATS_GRAPH_COLORS.warning, label: t('FEC recovery / out-of-order') },
    { color: PERFORMANCE_STATS_GRAPH_COLORS.critical, label: t('FEC recovery failed') }
  ];

  // Widen the overlay only when necessary to keep the complete one-line legend visible.
  var requiredLegendWidth = 4 + context.measureText(graphTitle).width + 14;
  legend.forEach(function(item) {
    requiredLegendWidth += 22 + context.measureText(item.label).width;
  });
  requiredLegendWidth += context.measureText('|').width + 20;
  fecLegend.forEach(function(item) {
    requiredLegendWidth += 22 + context.measureText(item.label).width;
  });
  requiredLegendWidth = Math.ceil(requiredLegendWidth + 4);
  if (requiredLegendWidth > width) {
    elements.container.style.width = requiredLegendWidth + 'px';
    width = requiredLegendWidth;
  }

  if (canvas.width !== width) canvas.width = width;
  if (canvas.height !== PERFORMANCE_STATS_GRAPH_HEIGHT) canvas.height = PERFORMANCE_STATS_GRAPH_HEIGHT;
  context = canvas.getContext('2d');
  if (!context) return;

  var height = PERFORMANCE_STATS_GRAPH_HEIGHT;
  context.clearRect(0, 0, width, height);
  context.textBaseline = 'middle';
  context.font = '12px sans-serif';
  context.fillStyle = 'rgba(255,255,255,0.95)';
  context.fillText(graphTitle, 4, 9);

  var legendX = 4 + context.measureText(graphTitle).width + 14;
  legend.forEach(function(item) {
    context.fillStyle = item.color;
    context.fillRect(legendX, 5, 8, 8);
    context.fillStyle = 'rgba(255,255,255,0.92)';
    context.fillText(item.label, legendX + 12, 9);
    legendX += 22 + context.measureText(item.label).width;
  });

  // FEC markers share the RTT legend row; RTT bars keep their existing latency colors.
  context.fillStyle = 'rgba(255,255,255,0.92)';
  context.fillText('|', legendX + 2, 9);
  legendX += context.measureText('|').width + 16;
  fecLegend.forEach(function(item) {
    context.beginPath();
    context.fillStyle = item.color;
    context.arc(legendX + 3, 9, 3, 0, Math.PI * 2);
    context.fill();
    context.fillStyle = 'rgba(255,255,255,0.92)';
    context.fillText(item.label, legendX + 10, 9);
    legendX += 22 + context.measureText(item.label).width;
  });

  var plotLeft = 34;
  var plotRight = width - 4;
  var plotTop = 35;
  var plotBottom = 138;
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

    // RTT bar colors remain dedicated to latency; FEC is shown in separate markers below.
    if (sample.audioFecRecovered > 0 || sample.audioFecFailed > 0 || sample.audioFecOutOfOrder > 0) {
      context.beginPath();
      context.fillStyle = sample.audioFecFailed > 0
        ? PERFORMANCE_STATS_GRAPH_COLORS.critical
        : PERFORMANCE_STATS_GRAPH_COLORS.warning;
      context.arc(plotLeft + (firstSlot + index + 0.5) * slotWidth, 149, 3, 0, Math.PI * 2);
      context.fill();
    }
  });
}

function handlePerformanceStatsGraphMessage(message) {
  var values = message.replace('GraphMsg: ', '').split(',').map(Number);
  if (values.length < 3 || !values.every(Number.isFinite)) return;

  performanceStatsGraphSamples.push({
    rtt: Math.max(0, values[0]),
    variance: Math.max(0, values[1]),
    droppedFrames: Math.max(0, values[2]),
    audioFecRecovered: Math.max(0, values[3] || 0),
    audioFecFailed: Math.max(0, values[4] || 0),
    audioFecOutOfOrder: Math.max(0, values[5] || 0),
    hostLatency: performanceStatsHostLatencyLatest
      ? {
        min: performanceStatsHostLatencyLatest.min,
        max: performanceStatsHostLatencyLatest.max,
        avg: performanceStatsHostLatencyLatest.avg
      }
      : null
  });
  if (performanceStatsGraphSamples.length > PERFORMANCE_STATS_GRAPH_SECONDS) {
    performanceStatsGraphSamples.shift();
  }
  drawPerformanceStatsGraph();
  drawHostProcessingLatencyGraph();
}

function handlePerformanceStatsHostLatencyMessage(message) {
  var values = message.replace('HostLatencyMsg: ', '').split(',').map(Number);
  if (values.length < 3 || !values.every(Number.isFinite)) return;

  performanceStatsHostLatencyLatest = {
    min: Math.max(0, values[0]),
    max: Math.max(0, values[1]),
    avg: Math.max(0, values[2])
  };
}

// Repeat the most recently reported values on regular graph ticks until another
// host sample arrives, producing continuous line series even for sparse updates.
function drawHostProcessingLatencyGraph() {
  var elements = ensurePerformanceStatsOverlayElements();
  if (!elements) return;

  var canvas = elements.hostCanvas;
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
  var graphTitle = t('Host processing latency (ms)');
  context.fillText(graphTitle, 4, 9);

  var legendX = 4 + context.measureText(graphTitle).width + 14;
  PERFORMANCE_STATS_HOST_GRAPH_SERIES.forEach(function(item) {
    var label = t(item.label);
    context.fillStyle = item.color;
    context.fillRect(legendX, 5, 8, 8);
    context.fillStyle = 'rgba(255,255,255,0.92)';
    context.fillText(label, legendX + 12, 9);
    legendX += 22 + context.measureText(label).width;
  });

  var maxLatencyValues = performanceStatsGraphSamples
    .map(function(sample) { return sample.hostLatency ? sample.hostLatency.max : null; })
    .filter(function(value) { return Number.isFinite(value); })
    .sort(function(a, b) { return a - b; });
  var percentileIndex = Math.max(0, Math.ceil(maxLatencyValues.length * 0.95) - 1);
  var percentileLatency = maxLatencyValues.length ? maxLatencyValues[percentileIndex] : 0;
  var scaleMaximum = Math.max(5, Math.ceil((percentileLatency * 1.2) / 5) * 5);

  var plotLeft = 34;
  var plotRight = width - 4;
  var plotTop = 35;
  var plotBottom = 149;
  var plotHeight = plotBottom - plotTop;
  var plotWidth = Math.max(1, plotRight - plotLeft);
  var midpointLatency = Math.round(scaleMaximum / 2);

  context.font = '10px sans-serif';
  context.fillStyle = 'rgba(255,255,255,0.85)';
  context.fillText(String(scaleMaximum), 2, plotTop);
  context.fillText(String(midpointLatency), 8, plotTop + plotHeight / 2);
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
  var firstSlot = PERFORMANCE_STATS_GRAPH_SECONDS - performanceStatsGraphSamples.length;

  PERFORMANCE_STATS_HOST_GRAPH_SERIES.forEach(function(series) {
    context.beginPath();
    context.strokeStyle = series.color;
    context.lineWidth = 2;
    var hasPreviousPoint = false;

    performanceStatsGraphSamples.forEach(function(sample, index) {
      if (!sample.hostLatency || !Number.isFinite(sample.hostLatency[series.key])) {
        hasPreviousPoint = false;
        return;
      }

      var value = Math.max(0, Math.min(scaleMaximum, sample.hostLatency[series.key]));
      var x = plotLeft + (firstSlot + index + 0.5) * slotWidth;
      var y = plotBottom - (value / scaleMaximum) * plotHeight;
      if (hasPreviousPoint) {
        context.lineTo(x, y);
      } else {
        context.moveTo(x, y);
      }
      hasPreviousPoint = true;
    });

    context.stroke();
  });
}


// Render statistics as two-column rows: labels on the left and values on the right.
function renderPerformanceStatsText(textElement, text, sourceText) {
  textElement.textContent = '';
  var sourceLines = String(sourceText || '').split('\n');
  String(text || '').split('\n').forEach(function(line, lineIndex) {
    if (!line) return;
    var row = document.createElement('div');
    if (sourceLines[lineIndex] && sourceLines[lineIndex].indexOf('Audio FEC:') === 0) {
      var fecMatch = sourceLines[lineIndex].match(/^Audio FEC: (\d+) recovered · (\d+) failed · (\d+) out-of-order$/);
      var recovered = fecMatch ? Number(fecMatch[1]) : 0;
      var failed = fecMatch ? Number(fecMatch[2]) : 0;
      var outOfOrder = fecMatch ? Number(fecMatch[3]) : 0;
      var severity = failed > 0 ? 'critical' : (recovered > 0 || outOfOrder > 0 ? 'warning' : 'normal');
      row.className = 'performance-stats-row performance-stats-audio-fec performance-stats-audio-fec--' + severity;
    }
    var separator = line.indexOf(':');
    if (separator > 0) {
      row.className = row.className || 'performance-stats-row';
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
    // Show the transition video first, then reveal its animated message after 100 ms.
    window._normalStreamVideoReady = false;
    if (typeof showStreamTransitionBackground === "function") showStreamTransitionBackground();
    $('#loadingSpinner').hide();
    $('#loadingSpinnerMessage').text(t('Stopping stream...'));
    setTimeout(function() {
      if (!window._directSmartHubLaunch) $('#loadingSpinner').css('display', 'inline-block');
    }, 100);
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

    var returnToHostsAfterRecoveryFailure = function(failure) {
      console.error('%c[messages.js, handleMessage]', 'color: gray;', 'Could not restore the host app list after stream termination; returning to Hosts instead:', failure);

      // A failed app-list request must never leave the UI in fullscreen or with stream navigation active.
      if (typeof hideStreamTransitionBackground === "function") hideStreamTransitionBackground();
      if (typeof clearViewLoadingSnackbarTimer === "function") clearViewLoadingSnackbarTimer();
      if (window.isDialogOpen) {
        var openDialogs = document.querySelectorAll('dialog[open]');
        for (var dialogIndex = 0; dialogIndex < openDialogs.length; dialogIndex++) {
          try { openDialogs[dialogIndex].close(); } catch (error) {}
        }
        var quitAppOverlay = document.getElementById('quitAppDialogOverlay');
        if (quitAppOverlay) quitAppOverlay.style.display = 'none';
        window.isDialogOpen = false;
      }

      // Restore the main Hosts screen directly; it does not depend on the failed host API.
      showHostsMode();
      $('#host-grid').stop(true, true).show();
      $('#game-grid').stop(true, true).hide();
      $('#settings-list').hide();
      $('#loadingSpinner').hide();
      $('#wasm_module').hide();
      $('#main-content').removeClass('fullscreen');
      $('#listener').removeClass('fullscreen');
      $('body').css('backgroundColor', '#282C38');
      isInGame = false;
      Navigation.change(Views.Hosts);
      Navigation.start();
      Navigation.switch();
      snackbarLogLong('Could not load apps from the host. Returning to Hosts.');
    };

    var refreshHostAndReturnToApps = function() {
      // Refreshing server info is useful, but failure must not prevent recovery.
      Promise.resolve().then(function() {
        return api.refreshServerInfo();
      }).catch(function(failedRefreshInfo) {
        console.error('%c[messages.js, handleMessage]', 'color: gray;', 'Error: Failed to refresh server info:', failedRefreshInfo);
      }).then(function() {
        return showApps(api);
      }).then(function() {
        Navigation.switch();
        if (!window.isDialogOpen) {
          Navigation.change(Views.Apps);
        }
        // Hide the message first; leave the background visible for another 100 ms.
        $('#loadingSpinner').hide();
        setTimeout(function() {
          if (typeof hideStreamTransitionBackground === "function") hideStreamTransitionBackground();
        }, 100);
      }).catch(function(failure) {
        returnToHostsAfterRecoveryFailure(failure);
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
    // This marks connection setup, not the availability of the first decoded video frame.
    // Keep the direct-launch connection status until this callback arrives.
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
    // The first decoded host frame is ready. Put the stream in its final layout and
    // remove opaque page backgrounds before uncovering it with the transition video.
    if (!window._directSmartHubLaunch) {
      window._normalStreamVideoReady = true;
      $('body, .mdl-layout, #main-content, #listener').css({
        background: 'transparent',
        backgroundColor: 'transparent'
      });
      $('#wasm_module').css({ display: '', background: 'transparent', backgroundColor: 'transparent' });
      $('#listener').addClass('fullscreen');
      $('#loadingSpinner').hide();

      // Keep the transition visible for one short beat after the host video is ready,
      // avoiding a black flash while the decoded frame reaches the display surface.
      setTimeout(function() {
        if (typeof hideStreamTransitionBackground === 'function') hideStreamTransitionBackground();
      }, 100);
    } else {
      $('#listener').addClass('fullscreen');
    }
    // Hide the lightweight direct-launch status when the video-ready notification arrives.
    if (window._directSmartHubLaunch) {
      // Use direct DOM access for compatibility with older Tizen WebKit engines.
      var directStatusElement = document.getElementById('directSmartHubStatus');
      if (directStatusElement) directStatusElement.style.display = 'none';
    }
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
    $('#performance-stats').css('background', 'rgba(0, 0, 0, 0.70)');
    var statsElements = ensurePerformanceStatsOverlayElements();
    if (statsElements) {
      var sourceStatsText = msg.replace('StatMsg: ', '');
      renderPerformanceStatsText(statsElements.text, translateBackendMessage(sourceStatsText), sourceStatsText);
      drawPerformanceStatsGraph();
      drawHostProcessingLatencyGraph();
    }
  } else if (msg.indexOf('HostLatencyMsg: ') === 0) {
    if (!performanceStatsStreamTerminated) handlePerformanceStatsHostLatencyMessage(msg);
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
