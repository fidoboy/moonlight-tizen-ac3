/* eslint-disable */

function getSelectedStreamingEngine() {
  if (window._directSmartHubLaunch) {
    var directSettings = window._directSmartHubStreamSettings;
    return directSettings &&
      (directSettings.streamingEngine === 'WMP' || directSettings.streamingEngine === 'EMSS')
      ? directSettings.streamingEngine
      : null;
  }

  var engineButton = document.getElementById('selectStreamingEngine');
  var selectedEngine = engineButton && engineButton.getAttribute('data-value');
  return selectedEngine === 'WMP' || selectedEngine === 'EMSS'
    ? selectedEngine
    : null;
}

function startWmpSession(args) {
  if (!window.WmpTransport || typeof window.WmpTransport.startStream !== 'function') {
    pendingStreamApiMessage = 'WMP native transport is unavailable.';
    handleMessage('streamTerminated: -1');
    return;
  }

  var parameters = {
    host: args[0],
    w: args[2],
    h: args[3],
    fps: args[4],
    bitrate: args[5],
    rikey: args[6],
    rikeyid: args[7],
    appVer: args[8],
    gfeVer: args[9],
    rtspUrl: args[10],
    codecMode: args[11],
    debugMode: typeof DEBUG_MODE !== 'undefined' && DEBUG_MODE === true,
    audioEnabled: args[18] === 'WMP',
    audioConfig: args[19],
    opticalOutputEnabled: !!args[20],
    videoCodec: args[25],
    hdr: args[26],
    fullRange: args[27]
  };

  if (typeof DEBUG_MODE !== 'undefined' && DEBUG_MODE) {
    var diagnosticParameters = {};
    Object.keys(parameters).forEach(function(name) {
      // Keep the debug log useful without exposing addresses or session secrets.
      diagnosticParameters[name] = name === 'host' || name === 'rikey' || name === 'rtspUrl'
        ? '<redacted>'
        : parameters[name];
    });
    console.debug('[wmp] Moonlight is requesting native stream startup', {
      parameters: diagnosticParameters
    });
  }

  window.WmpTransport.startStream(parameters).catch(function(error) {
    pendingStreamApiMessage = error && error.message
      ? error.message
      : String(error);
    if (error && error.code !== undefined) {
      pendingStreamApiMessage += ' (code ' + error.code + ')';
    }
    if (typeof DEBUG_MODE !== 'undefined' && DEBUG_MODE) {
      console.debug('[wmp] Native stream startup request failed', {
        name: error && error.name || null,
        message: pendingStreamApiMessage,
        code: error && error.code !== undefined ? error.code : null,
        nativePayload: error && error.nativePayload || null
      });
    }
    handleMessage('streamTerminated: -1');
  });
}

const SyncFunctions = {
  // no parameters
  'makeCert': (...args) => Module.makeCert(...args),
  // cert, privateKey, myUniqueid
  'httpInit': (...args) => Module.httpInit(...args),
  /* host, httpPort, width, height, fps, bitrate, rikey, rikeyid, appversion, gfeversion, rtspurl, serverCodecModeSupport,
  framePacing, optimizeGames, rumbleFeedback, mouseEmulation, flipABfaceButtons, flipXYfaceButtons, audioBackend,
  audioConfig, opticalOutputEnabled, audioSync, audioJitter, playHostAudio, decryptHostAudio, videoCodec, hdrMode,
  fullRange, gameMode, disableWarnings, performanceStats, dolbyChannelLayout, dolbyDecodingMode, h264Level, selectHoldStreamMenu */
  'startRequest': (...args) => {
    // Use only the explicitly selected engine. An unknown/unavailable preference
    // must fail closed; it must never be interpreted as permission to use EMSS.
    const activeStreamingEngine = getSelectedStreamingEngine();
    window._activeStreamingEngine = activeStreamingEngine;
    window._activeStreamingEngineConfirmed = false;
    window._wmpActiveAudioCodec = null;
    if (!activeStreamingEngine) {
      pendingStreamApiMessage = 'Could not determine the selected streaming engine. Select EMSS or WMP and try again.';
      handleMessage('streamTerminated: -1');
      return {type: 'resolve', ret: null};
    }
    if (activeStreamingEngine === 'WMP') {
      startWmpSession(args);
      return {type: 'resolve', ret: null};
    }
    const dolbyChannelLayout = args[31] || 'Back';
    const dolbyDecodingMode = args[32] || 'Hardware';
    const rawH264Level = args[33];
    const h264Level = rawH264Level == null || rawH264Level === ''
      ? 'Auto'
      : String(rawH264Level).replace(/\./g, '_');
    const selectHoldStreamMenu = !!args[34];
    if (typeof Module.setDolbyAudioOptions === 'function') {
      Module.setDolbyAudioOptions(dolbyChannelLayout, dolbyDecodingMode);
    }
    return Module.startStream(...args.slice(0, 31), h264Level, selectHoldStreamMenu);
  },
  // no parameters
  'stopRequest': (...args) => {
    if (window.moonlightAmbilight) {
      window.moonlightAmbilight.stop().catch(function(error) {
        console.warn('[ambilight] Could not stop native service:', error);
      });
    }
    // Stop the engine captured when this session started, not a preference that
    // may have been changed while the stream was running.
    if (window._activeStreamingEngine === 'WMP') {
      if (window.WmpTransport && typeof window.WmpTransport.stopStream === 'function') {
        window.WmpTransport.stopStream().catch(function(error) {
          console.warn('[messages.js, stopRequest]', 'WMP stop request failed:', error);
        });
      } else {
        console.error('[messages.js, stopRequest] WMP was active but its transport is unavailable.');
      }
      return {type: 'resolve', ret: null};
    }
    return Module.stopStream(...args);
  },
  // no parameters
  'cancelRequest': (...args) => Module.cancelRequest(...args),
  // no parameters
  'toggleStats': (...args) => {
    if (window._activeStreamingEngine === 'WMP') {
      if (window.WmpTransport && typeof window.WmpTransport.toggleStats === 'function') {
        window.WmpTransport.toggleStats().catch(function(error) {
          console.warn('[messages.js, toggleStats] WMP statistics toggle failed:', error);
        });
      }
      return {type: 'resolve', ret: null};
    }
    return Module.toggleStats(...args);
  },
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
    .replace(/Decoding mode: (Automatic|Hardware|Software)/g, function(match, mode) {
      return t('Decoding mode:') + ' ' + (mode === 'Automatic' ? t('Automatic') : mode);
    })
    .replace(/Audio FEC: (\d+) recovered · (\d+) failed · (\d+) out-of-order/g, function(match, recovered, failed, outOfOrder) {
      return t('Audio FEC:') + ' ' + recovered + ' ' + t(Number(recovered) === 1 ? 'FEC recovered (singular)' : 'FEC recovered') +
        ' · ' + failed + ' ' + t(Number(failed) === 1 ? 'FEC failed (singular)' : 'FEC failed') +
        ' · ' + outOfOrder + ' ' + t('FEC out-of-order');
    })
    .replace(/Codec:/g, t('Codec:'))
    .replace(/Frame rates:/g, t('Frame rates:'))
    .replace(/\\bRecv\\b/g, t('Recv'))
    .replace(/\\bDec\\b/g, t('Dec'))
    .replace(/\\bRend\\b/g, t('Rend'))
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
var h264TrackRejectionClosingMessage = null;
var pendingStreamDialogMessage = null;
var pendingStreamApiMessage = null;
var pendingMediaPipelineErrorMessage = null;
var pendingMediaPipelineApiMessage = null;
var pendingVideoTrackCloseErrorMessage = null;
var pendingVideoTrackCloseApiMessage = null;
var pendingMediaPipelineStopRequested = false;

function logStreamTerminationRecovery(stage, details) {
  if (typeof DEBUG_MODE === 'undefined' || !DEBUG_MODE) return;
  console.debug('[stream/recovery]', stage, details || '');
}

function stopStreamAfterMediaPipelineError() {
  if (pendingMediaPipelineStopRequested || !isInGame ||
      window._streamStartupFailureHandled || window._manualStreamStopRequested) return;
  pendingMediaPipelineStopRequested = true;
  try {
    Promise.resolve(sendMessage('stopRequest', [])).catch(function(error) {
      console.warn('%c[messages.js, stopStreamAfterMediaPipelineError]', 'color: gray;', 'Could not stop the stream after a media pipeline error:', error);
    });
  } catch (error) {
    console.warn('%c[messages.js, stopStreamAfterMediaPipelineError]', 'color: gray;', 'Could not stop the stream after a media pipeline error:', error);
  }
}

// Rolling one-minute history for the performance statistics graph.
var performanceStatsGraphSamples = [];
var performanceStatsHostLatencyLatest = null;
var performanceStatsPendingFirstReveal = false;
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
  performanceStatsPendingFirstReveal = false;
}

// Reveal the overlay only after both its text and the first network graph sample are ready.
function revealPerformanceStatsOverlayWhenReady() {
  if (!performanceStatsPendingFirstReveal || performanceStatsStreamTerminated ||
      performanceStatsGraphSamples.length === 0) return;

  var overlay = document.getElementById('performance-stats');
  if (!overlay) return;

  var text = overlay.querySelector('.performance-stats-text');
  if (!text || !text.textContent.trim()) return;

  performanceStatsPendingFirstReveal = false;
  fadeInUiElement(overlay, 'inline-block');
}

// Avoid collecting samples or drawing canvases while the diagnostics overlay is hidden.
function isPerformanceStatsOverlayVisible() {
  var overlay = document.getElementById('performance-stats');
  var layer = document.getElementById('stream-diagnostics-layer');
  if (!overlay || !layer || !window.getComputedStyle) return false;

  var layerStyle = window.getComputedStyle(layer);
  if (layerStyle.display === 'none' || layerStyle.visibility === 'hidden') return false;

  var overlayStyle = window.getComputedStyle(overlay);
  return overlayStyle.display !== 'none' && overlayStyle.visibility !== 'hidden';
}

function ensurePerformanceStatsOverlayElements() {
  var container = document.getElementById('performance-stats');
  if (!container) return null;

  var textElement = container.querySelector('.performance-stats-text');
  var canvas = container.querySelector('#performance-stats-graph');
  var hostCanvas = container.querySelector('#performance-stats-host-graph');
  var encryptionStatus = container.querySelector('#performanceStatsEncryptionStatus');
  var engineStatus = container.querySelector('#performanceStatsEngineStatus');
  var audioStatus = container.querySelector('#performanceStatsAudioStatus');
  if (!textElement || !canvas || !hostCanvas || !encryptionStatus || !engineStatus || !audioStatus) {
    var previousText = textElement ? textElement.textContent : container.textContent;
    container.textContent = '';

    engineStatus = document.createElement('div');
    engineStatus.id = 'performanceStatsEngineStatus';
    engineStatus.className = 'performance-stats-row performance-stats-engine';

    var engineLabel = document.createElement('span');
    engineLabel.className = 'performance-stats-label';
    engineLabel.textContent = t('Streaming engine:');

    var engineValue = document.createElement('span');
    engineValue.className = 'performance-stats-value';
    engineValue.id = 'performanceStatsEngineValue';
    engineStatus.appendChild(engineLabel);
    engineStatus.appendChild(engineValue);

    audioStatus = document.createElement('div');
    audioStatus.id = 'performanceStatsAudioStatus';
    audioStatus.className = 'performance-stats-row performance-stats-audio';
    var audioLabel = document.createElement('span');
    audioLabel.className = 'performance-stats-label';
    audioLabel.textContent = t('Audio stream:');
    var audioValue = document.createElement('span');
    audioValue.className = 'performance-stats-value';
    audioValue.id = 'performanceStatsAudioValue';
    audioStatus.appendChild(audioLabel);
    audioStatus.appendChild(audioValue);

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

    encryptionStatus = document.createElement('div');
    encryptionStatus.id = 'performanceStatsEncryptionStatus';
    encryptionStatus.className = 'stream-encryption-status performance-stats-encryption-status';
    encryptionStatus.setAttribute('aria-live', 'polite');

    var encryptionIcon = document.createElement('i');
    encryptionIcon.id = 'performanceStatsEncryptionIcon';
    encryptionIcon.className = 'stream-encryption-icon material-icons';
    encryptionIcon.setAttribute('aria-hidden', 'true');
    encryptionIcon.textContent = 'lock';

    var encryptionMessage = document.createElement('span');
    encryptionMessage.id = 'performanceStatsEncryptionMessage';

    encryptionStatus.appendChild(encryptionIcon);
    encryptionStatus.appendChild(encryptionMessage);
    container.appendChild(engineStatus);
    container.appendChild(audioStatus);
    container.appendChild(textElement);
    container.appendChild(canvas);
    container.appendChild(hostCanvas);
    container.appendChild(encryptionStatus);
  }

  var engineValueElement = engineStatus.querySelector('#performanceStatsEngineValue');
  if (engineValueElement) {
    engineValueElement.textContent = window._activeStreamingEngineConfirmed
      ? (window._activeStreamingEngine === 'WMP' ? 'WMP' : 'EMSS')
      : '';
  }
  var audioValueElement = audioStatus.querySelector('#performanceStatsAudioValue');
  if (audioValueElement) {
    audioStatus.style.display = window._activeStreamingEngine === 'WMP' ? '' : 'none';
    audioValueElement.textContent = window._activeStreamingEngine === 'WMP'
      ? (window._wmpActiveAudioCodec || '—')
      : '';
  }

  // The stream-negotiation result is cached by the transition screen. Reuse it
  // here instead of querying the core again, since this overlay may be created later.
  if (typeof currentStreamEncryptionStatus === 'number' &&
      currentStreamEncryptionStatus >= 0 &&
      typeof renderStreamEncryptionStatus === 'function') {
    renderStreamEncryptionStatus(currentStreamEncryptionStatus, ['performanceStatsEncryptionStatus']);
  }

  return { container: container, text: textElement, canvas: canvas, hostCanvas: hostCanvas, encryptionStatus: encryptionStatus, engineStatus: engineStatus, audioStatus: audioStatus };
}

window.refreshPerformanceStatsEngineStatus = function() {
  var elements = ensurePerformanceStatsOverlayElements();
  if (!elements) return;
  var engineValue = elements.engineStatus.querySelector('#performanceStatsEngineValue');
  if (engineValue) engineValue.textContent = window._activeStreamingEngineConfirmed
    ? (window._activeStreamingEngine === 'WMP' ? 'WMP' : 'EMSS') : '';
  var audioValue = elements.audioStatus.querySelector('#performanceStatsAudioValue');
  if (audioValue) audioValue.textContent = window._wmpActiveAudioCodec || '—';
};

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
  if (!isPerformanceStatsOverlayVisible()) return;

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
  revealPerformanceStatsOverlayWhenReady();
}

function handlePerformanceStatsHostLatencyMessage(message) {
  if (!isPerformanceStatsOverlayVisible()) return;

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
    if (sourceLines[lineIndex] &&
        sourceLines[lineIndex].indexOf('Frames dropped by your network connection:') === 0) {
      var separator = document.createElement('div');
      separator.className = 'performance-stats-separator';
      separator.setAttribute('aria-hidden', 'true');
      textElement.appendChild(separator);
    }
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
    if (method === 'startRequest') {
      h264TrackRejectionClosingMessage = null;
      pendingStreamDialogMessage = null;
      pendingStreamApiMessage = null;
      pendingMediaPipelineErrorMessage = null;
      pendingMediaPipelineApiMessage = null;
      pendingVideoTrackCloseErrorMessage = null;
      pendingVideoTrackCloseApiMessage = null;
      pendingMediaPipelineStopRequested = false;
    }
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
                innerResolve();
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
              }
              innerResolve();
            },
            'reject': function(err) {
              if (!isFinished) {
                isFinished = true;
                if (timeoutId) clearTimeout(timeoutId);
                reject(err);
              }
              innerResolve();
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
  // Avoid console I/O for recurring statistics messages, especially when their overlay is hidden.
  if (msg.indexOf('StatMsg: ') !== 0 &&
      msg.indexOf('GraphMsg: ') !== 0 &&
      msg.indexOf('HostLatencyMsg: ') !== 0) {
    console.log('%c[messages.js, handleMessage]', 'color: gray;', 'Message data: ', msg);
  }
  // If it's a recognized event, notify the appropriate function
  if (msg.indexOf('streamTerminated: ') === 0) {
    window._activeStreamingEngineConfirmed = false;
    window._wmpActiveAudioCodec = null;
    if (typeof clearStreamStartupWatchdog === 'function') clearStreamStartupWatchdog();
    // Stop encryption-status polling for every termination path, including negotiation failures.
    stopStreamEncryptionStatusPolling();
    // Hide and lock the overlay before painting the direct-launch closing status.
    performanceStatsStreamTerminated = true;
    hideStreamDiagnosticsLayer(function() {
      resetPerformanceStatsGraph();
    });

    // Close the Stream Menu if it is open
    closeStreamMenuDialog(false);
    // Release the audio scheduler of the Web Audio backend, which is a no-op for the EMSS backend
    stopAudioScheduler();
    // Diagnostic overlays were hidden and locked at the start of stream termination.
    // Remove the video stream now
    $('#listener').removeClass('fullscreen');
    $('body').css('backgroundColor', '#282C38');
    var errorCode = parseInt(msg.replace('streamTerminated: ', ''));
    var streamH264TrackRejectionMessage = h264TrackRejectionClosingMessage;
    var streamDialogMessage = pendingStreamDialogMessage;
    var streamApiMessage = pendingStreamApiMessage;
    var streamMediaPipelineErrorMessage = pendingMediaPipelineErrorMessage;
    var streamMediaPipelineApiMessage = pendingMediaPipelineApiMessage;
    var streamVideoTrackCloseErrorMessage = pendingVideoTrackCloseErrorMessage;
    var streamVideoTrackCloseApiMessage = pendingVideoTrackCloseApiMessage;
    h264TrackRejectionClosingMessage = null;
    pendingStreamDialogMessage = null;
    pendingStreamApiMessage = null;
    pendingMediaPipelineErrorMessage = null;
    pendingMediaPipelineApiMessage = null;
    pendingVideoTrackCloseErrorMessage = null;
    pendingVideoTrackCloseApiMessage = null;

    if (typeof DEBUG_MODE !== 'undefined' && DEBUG_MODE) {
      console.debug('[stream] Stream termination diagnostics', {
        streamingEngine: window._activeStreamingEngine || null,
        errorCode: errorCode,
        manualStopRequested: window._manualStreamStopRequested === true,
        streamApiMessage: streamApiMessage,
        streamDialogMessage: streamDialogMessage,
        mediaPipelineApiMessage: streamMediaPipelineApiMessage,
        videoTrackCloseApiMessage: streamVideoTrackCloseApiMessage,
        h264TrackRejection: streamH264TrackRejectionMessage
      });
    }

    // A startup watchdog already owns the visible error and recovery/exit sequence.
    // Ignore the native stop acknowledgement to prevent a second UI transition.
    if (window._streamStartupFailureHandled) {
      isInGame = false;
      return;
    }

    // A direct Smart Hub launch is a single-purpose session: never return to Moonlight's home UI.
    // Preserve the optional "quit host app after disconnect" behavior for graceful disconnects,
    // but always exit this client regardless of whether the stream ended normally or with an error.
    if (window._directSmartHubLaunch) {
      // Reuse the shared transition layer for the closing status; never restore the home UI.
      resetStreamEncryptionStatus();
      var directHostName = window._activeStreamHostName || t('Host');
      var directAppName = window._activeStreamAppName || t('Apps');
      var directClosingMessage;
      switch (errorCode) {
        case 0:
          directClosingMessage = t('Streaming session with %1$s ended normally.', directHostName);
          break;
        case -100:
          directClosingMessage = t('No video packets were received.');
          break;
        case -101:
          directClosingMessage = t('Keyframes were lost.');
          break;
        case -102:
          directClosingMessage = t('The connection to %1$s ended unexpectedly.', directHostName);
          break;
        case -103:
          directClosingMessage = t('Protected (DRM) content on %1$s ended the session.', directHostName);
          break;
        case -104:
          directClosingMessage = t('An error occurred while processing the video stream from %1$s.', directHostName);
          break;
        case -200:
          directClosingMessage = t('The local device could not start the video stream.');
          break;
        case -201:
          directClosingMessage = t('The TV rejected the H.264 video configuration.');
          break;
        case -300:
          directClosingMessage = t('The TV media player reported an error.');
          break;
        default:
          directClosingMessage = t('Connection to %1$s lost.', directHostName);
          break;
      }
      var closingTitle = document.getElementById('loadingSpinnerTitle');
      var closingMessage = document.getElementById('loadingSpinnerMessage');
      if (closingTitle) closingTitle.textContent = t('Closing %1$s...', directAppName);
      if (closingMessage) closingMessage.textContent = directClosingMessage;
      var directStreamHasError = errorCode !== 0 || !!streamMediaPipelineErrorMessage ||
        !!streamDialogMessage || !!streamH264TrackRejectionMessage ||
        !!streamVideoTrackCloseErrorMessage;
      console.info('[stream]', 'Stream ended. Error code: ' + errorCode +
        (directStreamHasError ? ' — ' + directClosingMessage : ''));
      if (directStreamHasError) {
        // Smart Hub has no diagnostic dialog: keep every failure status concise.
        directClosingMessage = streamMediaPipelineErrorMessage
          ? t('The TV media player reported an error.')
          : (streamH264TrackRejectionMessage
            ? t('The TV rejected the H.264 video configuration.')
            : ((streamDialogMessage || streamVideoTrackCloseErrorMessage)
              ? t('Unable to launch the selected app.')
              : directClosingMessage));
      }
      var shouldQuitDirectHostApp = errorCode === 0 &&
        !streamMediaPipelineErrorMessage && !streamDialogMessage &&
        !streamH264TrackRejectionMessage && !streamVideoTrackCloseErrorMessage &&
        !!(window._directSmartHubStreamSettings &&
          window._directSmartHubStreamSettings.quitAppAfterDisconnect);
      var exitDirectLaunch = function() {
        try {
          // Reuse Moonlight's common exit path so the optional Ambilight service
          // receives shutdown before the Web application returns to Smart Hub.
          if (typeof exitApplication === 'function') exitApplication();
          else tizen.application.getCurrentApplication().exit();
        } catch (error) {
          console.error('%c[messages.js, handleMessage]', 'color: gray;', 'Could not exit after direct Smart Hub session ended:', error);
        }
      };
      var finishDirectLaunch = function() {
        // Keep the closing status visible long enough to be read before leaving Tizen.
        window.setTimeout(exitDirectLaunch, directStreamHasError ? 4500 : 3000);
      };

      var showDirectClosingTransition = function() {
        if (shouldQuitDirectHostApp && window.api && typeof window.api.quitApp === 'function') {
          withOperationTimeout(window.api.quitApp(), 10000, 'Host app shutdown').then(finishDirectLaunch, function(failedQuitApp) {
            console.error('%c[messages.js, handleMessage]', 'color: gray;', 'Failed to quit the host app after direct Smart Hub session:', failedQuitApp);
            finishDirectLaunch();
          });
        } else {
          finishDirectLaunch();
        }
      };

      if (typeof showStreamTransitionBackground === 'function') {
        showStreamTransitionBackground(showDirectClosingTransition);
      } else {
        var directTransitionLayer = document.getElementById('stream-transition-layer');
        if (directTransitionLayer) directTransitionLayer.style.display = 'block';
        showDirectClosingTransition();
      }
      return;
    }

    logStreamTerminationRecovery('termination received', {errorCode: errorCode, engine: window._activeStreamingEngine || null});

    // Standard Moonlight launches retain the Apps UI lock until recovery has completed.
    // This also prevents the manual Quit App action from racing the recovery request.
    window._streamTerminationRecoveryInProgress = true;
    var quitRunningAppButton = document.getElementById('quitRunningAppBtn');
    if (quitRunningAppButton) quitRunningAppButton.disabled = true;
    if (typeof lockAppListInteraction === 'function') {
      lockAppListInteraction();
    }
    // Keep the transition on screen long enough for the shutdown status to be read.
    // The status content itself appears after a short reveal delay, so allow 3.5 s
    // from the start of the transition before beginning its fade-out.
    var streamTerminationTransitionShownAt = Date.now();
    var streamTerminationMinimumVisibleMs = 3500;

    // Classify the closing transition using only state and error codes already exposed to JavaScript.
    var manualStreamStopRequested = window._manualStreamStopRequested === true;
    window._manualStreamStopRequested = false;
    var hasStreamError = !manualStreamStopRequested && (errorCode !== 0 ||
      !!streamMediaPipelineErrorMessage || !!streamDialogMessage ||
      !!streamH264TrackRejectionMessage || !!streamVideoTrackCloseErrorMessage);
    if (hasStreamError) streamTerminationMinimumVisibleMs = 0;
    var activeStreamAppName = window._activeStreamAppName || t('Apps');
    var activeStreamHostName = window._activeStreamHostName || (typeof api !== 'undefined' && api && api.hostname) || t('Host');
    var transitionStatusMessage;
    if (manualStreamStopRequested) {
      transitionStatusMessage = t('Stopping stream %1$s...', activeStreamAppName);
    } else {
      switch (errorCode) {
        case 0:
          transitionStatusMessage = t('Streaming session with %1$s ended normally.', activeStreamHostName);
          break;
        case -100:
          transitionStatusMessage = t('No video packets were received.');
          break;
        case -101:
          transitionStatusMessage = t('Keyframes were lost.');
          break;
        case -102:
          transitionStatusMessage = t('The connection to %1$s ended unexpectedly.', activeStreamHostName);
          break;
        case -103:
          transitionStatusMessage = t('Protected (DRM) content on %1$s ended the session.', activeStreamHostName);
          break;
        case -104:
          transitionStatusMessage = t('An error occurred while processing the video stream from %1$s.', activeStreamHostName);
          break;
        case -200:
          transitionStatusMessage = t('The local device could not start the video stream.');
          break;
        case -201:
          transitionStatusMessage = t('The TV rejected the H.264 video configuration.');
          break;
        case -300:
          transitionStatusMessage = t('The TV media player reported an error.');
          break;
        default:
          transitionStatusMessage = window._activeStreamingEngine === 'WMP'
            ? t('Unable to launch the selected app.')
            : t('Connection to %1$s lost.', activeStreamHostName);
          break;
      }
    }

    if (hasStreamError && errorCode === 0) {
      transitionStatusMessage = streamMediaPipelineErrorMessage
        ? t('The TV media player reported an error.')
        : (streamDialogMessage || streamH264TrackRejectionMessage ||
          streamVideoTrackCloseErrorMessage || t('Connection to %1$s lost.', activeStreamHostName));
    }

    var streamErrorDialogMessage = streamMediaPipelineErrorMessage ||
      streamDialogMessage || streamH264TrackRejectionMessage ||
      streamVideoTrackCloseErrorMessage ||
      (errorCode === -100
        ? t('The connection was interrupted because no video packets were received from the host during startup.')
        : (errorCode === -101
          ? t('The connection was interrupted because a keyframe was lost during reception. Video packets had arrived, but the client could not assemble a complete keyframe (IDR frame).')
          : transitionStatusMessage));
    var streamErrorApiMessage = streamMediaPipelineApiMessage ||
      streamApiMessage || streamVideoTrackCloseApiMessage || null;
    // Native WMP failures may attach the full ML-ERROR diagnostic record as the API
    // message. Keep it in DEBUG_MODE logs above, but never render that dump in the dialog.
    if (typeof streamErrorApiMessage === 'string' && /^ML-ERROR\b/.test(streamErrorApiMessage)) {
      streamErrorApiMessage = null;
    }
    console.info('[stream]', 'Stream ended. Error code: ' + errorCode +
      (hasStreamError ? ' — ' + streamErrorDialogMessage : ''));
    if (typeof logStreamModeClosing === 'function') logStreamModeClosing();

    // Set the message first, then show the complete transition layer. The local UI
    // audio engine is rebuilt only after this layer is fully visible.
    window._normalStreamVideoReady = false;
    $('#loadingSpinnerTitle').text(t('Closing %1$s...', activeStreamAppName));
    $('#loadingSpinnerMessage').text(transitionStatusMessage);
    var resolveLocalAudioRestoration;
    var localAudioRestoration = new Promise(function(resolve) {
      resolveLocalAudioRestoration = resolve;
    });
    var restoreLocalAudioAfterTransitionAppears = function() {
      logStreamTerminationRecovery('closing transition visible');
      if (window._directSmartHubLaunch) {
        resolveLocalAudioRestoration();
        return;
      }
      var restoration = typeof setNavigationSoundEnabled === 'function'
        ? withOperationTimeout(setNavigationSoundEnabled(navigationSoundPreferenceEnabled), 10000, 'Local audio restoration')
        : Promise.resolve();
      if (hasStreamError) {
        // Do not hold the user on the transition for local UI audio restoration after
        // a connection failure. The interface can return immediately while audio
        // restoration completes independently in the background.
        Promise.resolve(restoration).catch(function(audioRestoreError) {
          console.error('%c[messages.js, handleMessage]', 'color: red;', 'Could not restore the local UI audio engine:', audioRestoreError);
        });
        resolveLocalAudioRestoration();
        return;
      }
      $('#loadingSpinnerMessage').text(t('Restoring local audio engine...'));
      Promise.resolve(restoration).catch(function(audioRestoreError) {
        // A sound-effects failure must not strand the user in the closing transition.
        console.error('%c[messages.js, handleMessage]', 'color: red;', 'Could not restore the local UI audio engine:', audioRestoreError);
      }).then(function() {
        $('#loadingSpinnerMessage').text(transitionStatusMessage);
        resolveLocalAudioRestoration();
      });
    };
    if (typeof showStreamTransitionBackground === "function") {
      showStreamTransitionBackground(restoreLocalAudioAfterTransitionAppears);
    } else {
      var fallbackTransitionLayer = document.getElementById('stream-transition-layer');
      if (fallbackTransitionLayer) fallbackTransitionLayer.style.display = 'block';
      restoreLocalAudioAfterTransitionAppears();
    }
    // Mirror Moonlight for Windows: quit the host app after graceful/manual disconnect
    // only. An unexpected connection failure must not terminate the host application.
    var shouldQuitHostApp = errorCode === 0 && !hasStreamError &&
      $('#quitAppAfterDisconnectSwitch').parent().hasClass('is-checked');

    var returnToHostsAfterRecoveryFailure = function(failure) {
      console.error('%c[messages.js, handleMessage]', 'color: gray;', 'Could not restore the host app list after stream termination; returning to Hosts instead:', failure);

      // A failed app-list request must never leave the UI in fullscreen or with stream navigation active.
      if (typeof clearViewLoadingSnackbarTimer === "function") clearViewLoadingSnackbarTimer();
      if (window.isDialogOpen) {
        var openDialogs = document.querySelectorAll('dialog[open]');
        for (var dialogIndex = 0; dialogIndex < openDialogs.length; dialogIndex++) {
          try { closeUiDialog(openDialogs[dialogIndex]); } catch (error) {}
        }
        var quitAppOverlay = document.getElementById('quitAppDialogOverlay');
        if (quitAppOverlay) fadeOutUiElement(quitAppOverlay);
        window.isDialogOpen = false;
      }

      // Clear the recovery state and lock before restoring Hosts.
      window._streamTerminationRecoveryInProgress = false;
      var quitButtonAfterFailure = document.getElementById('quitRunningAppBtn');
      if (quitButtonAfterFailure) quitButtonAfterFailure.disabled = false;
      if (typeof unlockAppListInteraction === 'function') unlockAppListInteraction();
      // Complete stream teardown before restoring Hosts, then restart host polling there.
      if (typeof finishAppsModeAfterStreamTransition === 'function') {
        finishAppsModeAfterStreamTransition();
      }
      // Mark the stream as terminated, then explicitly resume host polling.
      isInGame = false;
      if (typeof startPollingHosts === 'function') {
        startPollingHosts();
      }
      // Restore the Hosts screen and keep the ambient background stopped.
      showHostsMode(true);
      $('#host-grid').stop(true, true).show();
      $('#game-grid').stop(true, true).hide();
      $('#settings-list').hide();
      $('#main-content').removeClass('fullscreen');
      $('#listener').removeClass('fullscreen');
      $('body').css('backgroundColor', '#282C38');
      Navigation.change(Views.Hosts);
      Navigation.start();
      Navigation.switch();

      // Reactivate the selected ambient background immediately before the transition
      // fades out, so it is already running when the Hosts UI is revealed.
      updateAmbientBackgroundActivation(true);
      if (typeof hideStreamTransitionBackground === "function") {
        hideStreamTransitionBackground();
      } else {
        var failedRecoveryLayer = document.getElementById('stream-transition-layer');
        if (failedRecoveryLayer) failedRecoveryLayer.style.display = 'none';
      }
      snackbarLogLong(t('Could not load apps from the host. Returning to the main list.'));
    };

    var refreshHostAndReturnToApps = function() {
      // The Apps grid remains locked during recovery. The caller has already waited
      // at least 200 ms after the closing transition disappeared, so feedback can now
      // appear without the normal 1-second delay.
      snackbarLogPersistent('Loading Apps...');
      // Refreshing server info is useful, but failure must not prevent recovery.
      Promise.resolve().then(function() {
        return withOperationTimeout(api.refreshServerInfo(), 15000, 'Host information refresh after streaming');
      }).catch(function(failedRefreshInfo) {
        console.error('%c[messages.js, handleMessage]', 'color: gray;', 'Error: Failed to refresh server info:', failedRefreshInfo);
      }).then(function() {
        // Re-fetch the host's app list and rebuild the Apps grid so both the available apps
        // and the current-game highlighting reflect the host's state after the stream.
        // showApps keeps the interaction lock in place until the refreshed list is rendered.
        var appListOperation = { cancelled: false };
        return withOperationTimeout(showApps(api, {
          forceRefreshAppList: true,
          showLoadingSnackbarImmediately: true,
          operationToken: appListOperation
        }), 10000, 'Application list recovery', function() {
          appListOperation.cancel();
        }).then(function() {
          Navigation.switch();
          if (!window.isDialogOpen) {
            Navigation.change(Views.Apps);
          }
          // Hide the complete transition layer, then stop the background animation 100 ms later.
          if (typeof hideStreamTransitionBackground === "function") {
            hideStreamTransitionBackground();
          } else {
            var returnedToAppsLayer = document.getElementById('stream-transition-layer');
            if (returnedToAppsLayer) returnedToAppsLayer.style.display = 'none';
          }
          // Only resume ordinary UI actions after the refreshed Apps list is rendered.
          if (typeof finishAppsModeAfterStreamTransition === 'function') {
            finishAppsModeAfterStreamTransition();
          }
          // Resume other hosts now. The selected host remains paused until showApps()
          // finishes its box art downloads and restarts that host's background polling.
          if (typeof startPollingHosts === 'function') {
            startPollingHosts(api);
          }
          window._streamTerminationRecoveryInProgress = false;
          var quitButtonAfterRecovery = document.getElementById('quitRunningAppBtn');
          if (quitButtonAfterRecovery) quitButtonAfterRecovery.disabled = false;
        });
      }).catch(function(failure) {
        returnToHostsAfterRecoveryFailure(failure);
      });
    };

    // Keep the Web UI hidden while the closing transition is shown. Reveal it only
    // shortly before the transition starts fading out, avoiding a flash of the page
    // background behind the animated starfield.
    var beginRecoveryAfterTransition = function() {
      logStreamTerminationRecovery('closing transition hidden; Apps UI shown');
      if (hasStreamError) {
        // The transition is now fully hidden and the Apps interface is visible.
        // Keep the error modal open until the user acknowledges it; refresh the
        // host's app list only after the dialog is dismissed.
        // Keep the Apps grid locked and dimmed while the error dialog is open.
        // The post-dialog showApps() refresh reuses the existing cards and unlocks
        // interaction only after the refreshed list has been rendered.
        if (typeof finishAppsModeAfterStreamTransition === 'function') {
          finishAppsModeAfterStreamTransition(true);
        }
        // Keep the other hosts polled while the error dialog is awaiting acknowledgement.
        // The selected host stays paused until its Apps recovery and box art downloads finish.
        if (typeof startPollingHosts === 'function') {
          startPollingHosts(api);
        }
        window._streamTerminationRecoveryInProgress = false;
        var errorQuitButton = document.getElementById('quitRunningAppBtn');
        if (errorQuitButton) errorQuitButton.disabled = false;
        logStreamTerminationRecovery('opening shared stream error dialog', {errorCode: errorCode, hasApiMessage: !!streamErrorApiMessage});
        warningDialog(t('Error'), streamErrorDialogMessage, function() {
          refreshHostAndReturnToApps();
        }, true, 'OK', {
          code: Number.isFinite(errorCode) && errorCode !== 0 ? errorCode : null,
          apiMessage: streamErrorApiMessage
        });
        return;
      }

      window.setTimeout(function() {
        // Resume ordinary UI state and flush deferred UI actions only after the full
        // transition fadeout and the additional 200 ms breathing room.
        if (shouldQuitHostApp && api && typeof api.quitApp === 'function') {
          console.log('%c[messages.js, handleMessage]', 'color: gray;', 'Attempting to quit the host app after graceful disconnection.');
          withOperationTimeout(api.quitApp(), 10000, 'Host app shutdown').then(function() {
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
      }, 200);
    };

    var hideTransitionAndBeginRecovery = function() {
      logStreamTerminationRecovery('Apps UI fade completed; hiding closing transition');
      // showAppsMode has completed its UI fade and all app-list recovery work.
      // Restart ambient animation now, immediately before the transition fades out.
      if (typeof updateAmbientBackgroundActivation === 'function') {
        updateAmbientBackgroundActivation(true);
      }
      if (typeof hideStreamTransitionBackground === 'function') {
        hideStreamTransitionBackground(beginRecoveryAfterTransition);
      } else {
        var returnedToAppsLayer = document.getElementById('stream-transition-layer');
        if (returnedToAppsLayer) returnedToAppsLayer.style.display = 'none';
        beginRecoveryAfterTransition();
      }
    };

    var showAppsUiBeforeTransitionCloses = function() {
      logStreamTerminationRecovery('restoring Apps UI');
      // showAppsMode completes the normal UI fade before invoking its callback.
      // Starting the transition fade there leaves only a brief overlap between layers.
      showAppsMode(true, hideTransitionAndBeginRecovery, true);
    };

    // Do not continue recovery or reveal the Apps UI until the local audio engine
    // has been recreated and click.mp3 has been decoded.
    localAudioRestoration.then(function() {
      logStreamTerminationRecovery('local audio restoration released');
      var remainingTransitionMs = streamTerminationMinimumVisibleMs -
        (Date.now() - streamTerminationTransitionShownAt);
      if (remainingTransitionMs > 0) {
        window.setTimeout(showAppsUiBeforeTransitionCloses, remainingTransitionMs);
      } else {
        showAppsUiBeforeTransitionCloses();
      }
    });

  } else if (msg === 'Connection Established') {
    window._activeStreamingEngineConfirmed = true;
    if (typeof window.refreshPerformanceStatsEngineStatus === 'function') window.refreshPerformanceStatsEngineStatus();
    // Ignore late native notifications after the startup sequence has already been aborted.
    if (window._streamStartupFailureHandled) return;
    if (typeof clearStreamStartupWatchdog === 'function') clearStreamStartupWatchdog();
    console.info('[stream]', 'Stream connection established.');
    // Stop the connection watchdog; do not impose a separate first-frame deadline.
    // This marks connection setup, not the availability of the first decoded video frame.
    // Prepare the screen for video stream, but keep the negotiation animation visible
    // until the first decoded host frame arrives.
    $('body').css('backgroundColor', 'transparent');
    $('#wasm_module').css('display', '');
    $('#wasm_module').focus();
  } else if (msg.indexOf('MediaPipelineErrorMsg: ') === 0) {
    // MediaSource may report a format error while it is being closed. Such a
    // callback is a teardown side effect, not a failure of the active stream.
    if (window._manualStreamStopRequested || window._streamTerminationRecoveryInProgress) {
      console.log('%c[messages.js, handleMessage]', 'color: gray;', 'Ignoring media pipeline error during stream teardown.');
      return;
    }
    var mediaErrorPayload = msg.replace('MediaPipelineErrorMsg: ', '');
    // Keep the localized explanation as the primary message and preserve the
    // API payload verbatim for the smaller diagnostic line in the error dialog.
    pendingMediaPipelineErrorMessage = t('The TV media player reported an error.');
    pendingMediaPipelineApiMessage = mediaErrorPayload;
    stopStreamAfterMediaPipelineError();
    if (window._directSmartHubLaunch) {
      $('#loadingSpinnerMessage').text(pendingMediaPipelineErrorMessage);
    } else if (!window._streamStartupFailureHandled) {
      $('#loadingSpinnerMessage').text(t('The TV media player reported an error.'));
    }
  } else if (msg.indexOf('VideoTrackCloseErrorMsg: ') === 0) {
    // Ignore track-close errors emitted as a consequence of an intentional stop.
    if (window._manualStreamStopRequested || window._streamTerminationRecoveryInProgress) {
      console.log('%c[messages.js, handleMessage]', 'color: gray;', 'Ignoring video track close error during stream teardown.');
      return;
    }
    var videoTrackCloseApiMessage = msg.replace('VideoTrackCloseErrorMsg: ', '');
    pendingVideoTrackCloseErrorMessage = t(videoTrackCloseApiMessage);
    pendingVideoTrackCloseApiMessage = videoTrackCloseApiMessage;
    stopStreamAfterMediaPipelineError();
    if (window._directSmartHubLaunch) {
      $('#loadingSpinnerMessage').text(pendingVideoTrackCloseErrorMessage);
    }
  } else if (msg.indexOf('H264TrackRejectedMsg: ') === 0) {
    if (window._streamStartupFailureHandled) return;
    var h264TrackDetails = msg.replace('H264TrackRejectedMsg: ', '').split(',');
    if (h264TrackDetails.length === 4 && h264TrackDetails.every(function(value) { return value.trim() !== ''; })) {
      var h264Level = h264TrackDetails[0].trim();
      var h264Width = h264TrackDetails[1].trim();
      var h264Height = h264TrackDetails[2].trim();
      var h264FrameRate = h264TrackDetails[3].trim();
      h264TrackRejectionClosingMessage = t('The TV does not support the selected H.264 configuration (Level %1$s, %2$s×%3$s at %4$s FPS). Try a different manual H.264 level, reduce the resolution or frame rate, or select HEVC/AV1 if your host supports it.', h264Level, h264Width, h264Height, h264FrameRate);
      $('#loadingSpinnerMessage').text(t('The TV rejected H.264 Level %1$s (%2$s×%3$s at %4$s FPS).', h264Level, h264Width, h264Height, h264FrameRate));
    } else {
      h264TrackRejectionClosingMessage = t('The TV rejected the H.264 video configuration.');
      $('#loadingSpinnerMessage').text(h264TrackRejectionClosingMessage);
    }
  } else if (msg.indexOf('ProgressMsg: ') === 0) {
    if (window._streamStartupFailureHandled) return;
    // Show progress message below the transition bar, keeping the app title fixed above it.
    $('#loadingSpinnerMessage').text(translateBackendMessage(msg.replace('ProgressMsg: ', '')));
  } else if (msg.indexOf('TransientMsg: ') === 0) {
    if (window._streamStartupFailureHandled) return;
    var transientMessage = translateBackendMessage(msg.replace('TransientMsg: ', ''));
    if (window._directSmartHubLaunch ||
        (isInGame && window._normalStreamVideoReady !== true && !window._streamStartupFailureHandled)) {
      $('#loadingSpinnerMessage').text(transientMessage);
    } else {
      snackbarLogLong(transientMessage);
    }
  } else if (msg.indexOf('DialogMsg: ') === 0) {
    if (window._streamStartupFailureHandled) return;
    var apiDialogMessage = msg.replace('DialogMsg: ', '');
    var dialogMessage = translateBackendMessage(apiDialogMessage);
    if (window._directSmartHubLaunch) {
      // Smart Hub launch has no full UI: retain only a concise status, never API diagnostics.
      directSmartHubLaunchFailure(t('Unable to launch the selected app.'));
    } else {
      pendingStreamDialogMessage = dialogMessage;
      pendingStreamApiMessage = apiDialogMessage;
      $('#loadingSpinnerTitle').text(t('Connection Error'));
      $('#loadingSpinnerMessage').text(t('Unable to launch the selected app.'));
    }
  } else if (typeof msg === 'string' && msg.trim() === 'displayVideo') {
    // A late first-frame notification must not revive a stream whose startup failed.
    if (window._streamStartupFailureHandled) return;
    if (typeof clearStreamStartupWatchdog === 'function') clearStreamStartupWatchdog();
    console.log('%c[messages.js, handleMessage]', 'color: gray;', 'Video-ready notification received.');
    // Prefer the browser's shared playback-ready handler. The video element's
    // "playing" event is also wired as a fallback for builds that omit this message.
    if (!window._directSmartHubLaunch) {
      if (typeof handleNormalStreamVideoReady === 'function') {
        handleNormalStreamVideoReady();
      } else {
        $('#listener').addClass('fullscreen');
        setTimeout(function() {
          if (typeof hideStreamTransitionBackground === 'function') hideStreamTransitionBackground();
        }, 100);
      }
    } else {
      if (typeof handleDirectSmartHubVideoReady === 'function') {
        handleDirectSmartHubVideoReady();
      } else {
        $('#listener').addClass('fullscreen');
      }
    }
  } else if (msg.indexOf('NoWarningMsg: ') === 0) {
    // Hide the connection warnings overlay
    fadeOutUiElement('connection-warnings', function() {
      $('#connection-warnings').css('background', 'transparent');
      $('#connection-warnings').text('');
    });
  } else if (msg.indexOf('WarningMsg: ') === 0) {
    // Show the connection warnings overlay
    $('#connection-warnings').css('background', 'rgba(0, 0, 0, 0.5)');
    $('#connection-warnings').text(translateBackendMessage(msg.replace('WarningMsg: ', '')));
    fadeInUiElement('connection-warnings', 'inline-block');
  } else if (msg.indexOf('NoStatMsg: ') === 0) {
    // Hide the overlay for this streaming session without changing the saved preference.
    resetPerformanceStatsGraph();
    fadeOutUiElement('performance-stats', function() {
      $('#performance-stats').css('background', 'transparent');
      $('#performance-stats').text('');
    });
  } else if (msg.indexOf('StatMsg: ') === 0) {
    if (performanceStatsStreamTerminated) return;

    var statsOverlay = document.getElementById('performance-stats');
    if (!statsOverlay) return;
    var overlayWasVisible = isPerformanceStatsOverlayVisible();

    // Keep the overlay transparent while the first statistics message is rendered.
    // fadeInUiElement schedules the opacity transition on the next animation frame,
    // so the first visible frame already contains the populated statistics.
    if (!overlayWasVisible) {
      statsOverlay.style.display = 'inline-block';
      statsOverlay.style.opacity = '0';
      performanceStatsPendingFirstReveal = true;
    }
    statsOverlay.style.background = 'rgba(0, 0, 0, 0.70)';

    var statsElements = ensurePerformanceStatsOverlayElements();
    if (statsElements) {
      var sourceStatsText = msg.replace('StatMsg: ', '');
      renderPerformanceStatsText(statsElements.text, translateBackendMessage(sourceStatsText), sourceStatsText);
      drawPerformanceStatsGraph();
      drawHostProcessingLatencyGraph();

      if (!overlayWasVisible) {
        // GraphMsg arrives separately; keep the overlay transparent until its first sample is drawn.
        revealPerformanceStatsOverlayWhenReady();
      }
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
  } else if (msg.indexOf('openStreamMenu') === 0) {
    // The native gamepad handler requests the existing UI menu; JS only presents it.
    if (typeof openStreamMenuFromGamepad === 'function') openStreamMenuFromGamepad();
  } else if (msg.indexOf('mouseEmulationOn') === 0) {
    // Show mouse emulation enable status as a notification
    snackbarLogLong('Mouse emulation is activated');
  } else if (msg.indexOf('mouseEmulationOff') === 0) {
    // Show mouse emulation disable status as notification
    snackbarLogLong('Mouse emulation is deactivated');
  }
}
