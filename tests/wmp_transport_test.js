'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const pendingMessages = [];
const debugEntries = [];
const infoEntries = [];
const manifest = fs.readFileSync(path.join(__dirname, '../wmp/dotnet-host/tizen-manifest.xml'), 'utf8');
const expectedServiceAppId = 'MoonLightS.WmpService';
assert.ok(manifest.includes('appid="' + expectedServiceAppId + '"'), 'ESPlusPlayer ServiceApp appid must match the transport');
let messageListener = null;
let listenerRemoved = false;
let launchedAppId = null;
let remotePortNotReadyAttempts = 0;
let remotePortRequests = 0;
let nextNativeResponse = null;

const localPort = {
  addMessagePortListener(callback) {
    messageListener = callback;
    return 7;
  },
  removeMessagePortListener(id) {
    assert.strictEqual(id, 7);
    listenerRemoved = true;
  }
};

const remotePort = {
  isTrusted: true,
  sendMessage(items, replyPort) {
    assert.strictEqual(replyPort, localPort);
    const request = {};
    items.forEach(item => { request[item.key] = item.value; });
    pendingMessages.push(request);
    const payload = request.command === 'ping'
      ? {pong: true, service: 'ready'}
      : request.command === 'start_session'
        ? {accepted: true}
        : request.command === 'stop_session'
          ? {stopped: true}
          : request.command === 'get_logs'
            ? {count: 2, hostCount: 0}
            : request.command === 'toggle_stats'
              ? {enabled: true}
              : {service: 'ready', libraryLoaded: true, esplus: 'symbols_detected', streamApi: 'set'};
    const nativeResponse = nextNativeResponse || {status: 'ok', payload};
    nextNativeResponse = null;
    Promise.resolve().then(() => {
      if (request.command === 'get_logs') {
        ['native stage RTSP complete', 'video submit #1 status=ok'].forEach(line => {
          messageListener([
            {key: 'protocol', value: request.protocol},
            {key: 'type', value: 'event'},
            {key: 'event', value: 'wmpNativeLog'},
            {key: 'detail', value: line}
          ]);
        });
      }
      messageListener([
        {key: 'protocol', value: request.protocol},
        {key: 'id', value: request.id},
        {key: 'type', value: 'response'},
        {key: 'status', value: nativeResponse.status},
        {key: 'payload', value: JSON.stringify(nativeResponse.payload)}
      ]);
      if (request.command === 'toggle_stats') {
        messageListener([
          {key: 'protocol', value: request.protocol},
          {key: 'type', value: 'event'},
          {key: 'event', value: 'StatMsg: '}
        ]);
      }
    });
  }
};

const handledEvents = [];
const windowEventListeners = Object.create(null);
const window = {
  DEBUG_MODE: true,
  getStreamingEngineState() {
    return {active: 'ESPLUSPLAYER', confirmed: true};
  },
  addEventListener(type, callback) {
    if (!windowEventListeners[type]) windowEventListeners[type] = [];
    windowEventListeners[type].push(callback);
  },
  removeEventListener(type, callback) {
    if (!windowEventListeners[type]) return;
    windowEventListeners[type] = windowEventListeners[type].filter(listener => listener !== callback);
  },
  dispatchEvent(event) {
    const listeners = windowEventListeners[event.type] || [];
    listeners.slice().forEach(listener => listener.call(window, event));
  },
  console: {
    debug(...args) { debugEntries.push(args); },
    info(...args) { infoEntries.push(args); }
  },
  handleMessage(message) {
    handledEvents.push(message);
  },
  setTimeout,
  clearTimeout,
  tizen: {
    messageport: {
      requestTrustedLocalMessagePort(name) {
        assert.strictEqual(name, 'MoonlightWmpReply');
        return localPort;
      },
      requestTrustedRemoteMessagePort(appId, portName) {
        assert.strictEqual(appId, expectedServiceAppId);
        assert.strictEqual(portName, 'MoonlightWmpControl');
        remotePortRequests++;
        if (remotePortNotReadyAttempts > 0) {
          remotePortNotReadyAttempts--;
          const error = new Error('The port of the target application is not found');
          error.name = 'NotFoundError';
          throw error;
        }
        return remotePort;
      }
    },
    application: {
      launch(appId, success) {
        launchedAppId = appId;
        success();
      }
    }
  }
};

const source = fs.readFileSync(
  path.join(__dirname, '../wasm/platform/wmp_transport.js'),
  'utf8'
);
vm.runInNewContext(source, {
  window,
  tizen: window.tizen,
  Promise,
  JSON,
  Object,
  Array,
  String,
  Error
});

(async function() {
  remotePortNotReadyAttempts = 3;
  const connection = await window.ESPlusPlayerTransport.connect();
  assert.strictEqual(remotePortRequests, 4, 'ESPlusPlayer transport must retry while the ServiceApp registers its port');
  assert.strictEqual(connection.trusted, true);
  assert.strictEqual(launchedAppId, expectedServiceAppId);

  const ping = await window.ESPlusPlayerTransport.ping();
  assert.strictEqual(ping.payload.pong, true);

  const status = await window.ESPlusPlayerTransport.getStatus();
  assert.strictEqual(status.payload.service, 'ready');
  assert.strictEqual(status.payload.libraryLoaded, true);
  assert.strictEqual(status.payload.esplus, 'symbols_detected');
  assert.strictEqual(status.payload.streamApi, 'set');

  // Gamepad analog samples must be coalesced across the MessagePort bridge,
  // while digital button transitions must bypass the analog-rate limiter.
  const gamepadStateMessages = () => pendingMessages.filter(message =>
    message.command === 'gamepad_state');
  window.dispatchEvent({
    type: 'esplusgamepadconnected',
    detail: {gamepadIndex: 0, id: 'Xbox Controller', buttonCount: 16}
  });
  const neutralButtons = Array(16).fill(0);
  window.dispatchEvent({
    type: 'esplusgamepadstate',
    detail: {gamepadIndex: 0, buttons: neutralButtons, axes: [0, 0, 0, 0]}
  });
  assert.strictEqual(gamepadStateMessages().length, 1, 'initial gamepad state must be sent immediately');

  [0.1, 0.2, 0.3].forEach(value => {
    window.dispatchEvent({
      type: 'esplusgamepadstate',
      detail: {gamepadIndex: 0, buttons: neutralButtons, axes: [value, 0, 0, 0]}
    });
  });
  assert.strictEqual(gamepadStateMessages().length, 1,
    'multiple analog samples in one 16 ms window must collapse into one MessagePort message');
  await new Promise(resolve => setTimeout(resolve, 25));
  assert.strictEqual(gamepadStateMessages().length, 2,
    'the latest analog state must be sent after the coalescing interval');
  assert.strictEqual(Number(gamepadStateMessages()[1].arg_lsX), Math.round(0.3 * 32767),
    'the coalesced message must contain the newest stick position');

  window.dispatchEvent({
    type: 'esplusgamepadstate',
    detail: {gamepadIndex: 0, buttons: neutralButtons, axes: [0.4, 0, 0, 0]}
  });
  window.dispatchEvent({
    type: 'esplusgamepadstate',
    detail: {gamepadIndex: 0, buttons: neutralButtons, axes: [0.3, 0, 0, 0]}
  });
  await new Promise(resolve => setTimeout(resolve, 25));
  assert.strictEqual(gamepadStateMessages().length, 2,
    'returning to the last transmitted stick position must cancel a stale pending sample');

  window.dispatchEvent({
    type: 'esplusgamepadstate',
    detail: {gamepadIndex: 0, buttons: neutralButtons, axes: [0.4, 0, 0, 0]}
  });
  const pressedButtons = neutralButtons.slice();
  pressedButtons[0] = 1;
  window.dispatchEvent({
    type: 'esplusgamepadstate',
    detail: {gamepadIndex: 0, buttons: pressedButtons, axes: [0.4, 0, 0, 0]}
  });
  assert.strictEqual(gamepadStateMessages().length, 3,
    'digital button transitions must be forwarded immediately, without waiting for the analog timer');
  await new Promise(resolve => setTimeout(resolve, 25));
  assert.strictEqual(gamepadStateMessages().length, 3,
    'an immediate button update must cancel the stale queued analog sample');

  const start = await window.ESPlusPlayerTransport.startStream({
    host: '192.168.0.10',
    w: 1920,
    h: 1080,
    fps: 60,
    bitrate: 20000,
    rikey: '00112233445566778899aabbccddeeff',
    rikeyid: 1234,
    appVer: '1.0',
    gfeVer: '3.0',
    rtspUrl: 'rtsp://host/session',
    codecMode: 1,
    audioEnabled: false,
    audioConfig: '51Surround',
    opticalOutputEnabled: true,
    videoCodec: 'H264',
    hdr: false,
    fullRange: false
  });
  assert.strictEqual(start.payload.accepted, true);
  const startMessage = pendingMessages[pendingMessages.length - 1];
  assert.strictEqual(startMessage.command, 'start_session');
  assert.strictEqual(startMessage.arg_host, '192.168.0.10');
  assert.strictEqual(startMessage.arg_rikey, '00112233445566778899aabbccddeeff');
  assert.strictEqual(startMessage.arg_videoCodec, 'H264');
  assert.strictEqual(startMessage.arg_audioEnabled, 'false');
  assert.strictEqual(startMessage.arg_opticalOutputEnabled, 'true');

  // When evdev owns a device class, the browser must not forward duplicate
  // events for that class through MessagePort.
  messageListener([
    {key: 'protocol', value: 'moonlight-wmp/1'},
    {key: 'type', value: 'event'},
    {key: 'event', value: 'wmpInputCapabilities: 4'}
  ]);
  const nativeGamepadMessageCount = gamepadStateMessages().length;
  window.dispatchEvent({
    type: 'esplusgamepadconnected',
    detail: {gamepadIndex: 0, id: 'Xbox Controller', buttonCount: 16}
  });
  window.dispatchEvent({
    type: 'esplusgamepadstate',
    detail: {gamepadIndex: 0, buttons: neutralButtons, axes: [0.5, 0, 0, 0]}
  });
  assert.strictEqual(gamepadStateMessages().length, nativeGamepadMessageCount,
    'evdev gamepad capture must suppress duplicate browser gamepad forwarding');

  // Native ParseStart diagnostics must reach the caller with the rejected field.
  nextNativeResponse = {
    status: 'error',
    payload: {error: 'invalid_start_arguments', field: 'opticalOutputEnabled'}
  };
  await assert.rejects(
    window.ESPlusPlayerTransport.startStream({host: '192.168.0.10'}),
    /invalid_start_arguments: opticalOutputEnabled/
  );
  const debugOutput = JSON.stringify(debugEntries);
  assert.ok(debugOutput.includes(expectedServiceAppId), 'Debug log must identify the launched ServiceApp');
  assert.ok(debugOutput.includes('trusted local reply MessagePort acquired'), 'Debug log must record local MessagePort setup');
  assert.ok(debugOutput.includes('native response received'), 'Debug log must record native responses');
  assert.ok(debugOutput.includes('1920x1080'), 'Debug log must include stream dimensions');
  assert.ok(!debugOutput.includes('00112233445566778899aabbccddeeff'), 'Debug log must not include the session key');
  assert.ok(!debugOutput.includes('rtsp://host/session'), 'Debug log must not include the RTSP URL');
  const stop = await window.ESPlusPlayerTransport.stopStream();
  assert.strictEqual(stop.payload.stopped, true);
  const logs = await window.ESPlusPlayerTransport.getLogs();
  assert.strictEqual(logs.payload.count, 2);
  assert.strictEqual(logs.payload.hostCount, 0);
  assert.ok(infoEntries.some(entry => entry[0] === '[esplusplayer/native]' &&
    entry[1] === 'native stage RTSP complete'),
    'Debug builds must print each native engine log line separately');
  const statsToggle = await window.ESPlusPlayerTransport.toggleStats();
  assert.strictEqual(statsToggle.payload.enabled, true);
  messageListener([
    {key: 'protocol', value: 'moonlight-wmp/1'},
    {key: 'type', value: 'event'},
    {key: 'event', value: 'wmpDiagnosticReady'}
  ]);
  for (let i = 0; i < 8; i++) await Promise.resolve();
  assert.ok(infoEntries.some(entry => String(entry[0]).indexOf('native diagnostic log') >= 0),
    'Debug builds must print the native diagnostic log after session teardown');
  assert.deepStrictEqual(
    pendingMessages
      .filter(message => message.command !== 'gamepad_arrival' && message.command !== 'gamepad_state')
      .map(message => message.command),
    ['ping', 'get_status', 'start_session', 'start_session', 'stop_session', 'get_logs', 'toggle_stats', 'get_logs']
  );

  messageListener([
    {key: 'protocol', value: 'moonlight-wmp/1'},
    {key: 'type', value: 'event'},
    {key: 'event', value: 'displayVideo'}
  ]);
  assert.deepStrictEqual(handledEvents, ['StatMsg: ', 'displayVideo']);

  messageListener([
    {key: 'protocol', value: 'moonlight-wmp/1'},
    {key: 'type', value: 'event'},
    {key: 'event', value: 'wmpPlayerError: 8193'},
    {key: 'detail', value: 'ESPlus player error 0x2001'}
  ]);
  assert.deepStrictEqual(handledEvents, [
    'StatMsg: ', 'displayVideo'
  ], 'fatal ESPlusPlayer player errors must not show a transient warning; stream termination owns the shared error dialog');
  assert.strictEqual(window.pendingStreamApiMessage, 'ESPlus player error 0x2001');

  messageListener([
    {key: 'protocol', value: 'moonlight-wmp/1'},
    {key: 'type', value: 'event'},
    {key: 'event', value: 'streamTerminated: -1'},
    {key: 'detail', value: 'ESPlusPlayer engine start failed (code -101)'}
  ]);
  assert.deepStrictEqual(handledEvents, ['StatMsg: ', 'displayVideo', 'streamTerminated: -1']);
  assert.strictEqual(window.pendingStreamApiMessage, 'ESPlusPlayer engine start failed (code -101)');

  window.ESPlusPlayerTransport.close();
  assert.strictEqual(listenerRemoved, true);
  const debugEntryCount = debugEntries.length;

  // Diagnostic output must be completely suppressed outside Debug builds.
  window.DEBUG_MODE = false;
  await window.ESPlusPlayerTransport.connect();
  await window.ESPlusPlayerTransport.ping();
  assert.strictEqual(debugEntries.length, debugEntryCount, 'ESPlusPlayer diagnostics must be Debug-only');
  window.ESPlusPlayerTransport.close();

  // A Tizen launch failure must retain the native error details in Debug logs.
  window.DEBUG_MODE = true;
  window.tizen.application.launch = function(appId, success, failure) {
    launchedAppId = appId;
    Promise.resolve().then(() => failure({
      name: 'NotFoundError',
      message: 'Application not found',
      code: 404,
      domain: 'TizenApplication'
    }));
  };
  const failureLogStart = debugEntries.length;
  await assert.rejects(
    window.ESPlusPlayerTransport.connect(),
    /could not launch native service: Application not found/
  );
  const launchFailureLog = JSON.stringify(debugEntries.slice(failureLogStart));
  assert.ok(launchFailureLog.includes('ESPlusPlayer ServiceApp launch failed'));
  assert.ok(launchFailureLog.includes('NotFoundError'));
  assert.ok(launchFailureLog.includes('Application not found'));
  assert.ok(launchFailureLog.includes(expectedServiceAppId));

  // A missing native port must fail after a bounded number of retries.
  window.tizen.application.launch = function(appId, success) {
    launchedAppId = appId;
    success();
  };
  remotePortNotReadyAttempts = 100;
  const retryStart = remotePortRequests;
  await assert.rejects(
    window.ESPlusPlayerTransport.connect(),
    /native control port is unavailable/
  );
  assert.strictEqual(
    remotePortRequests - retryStart,
    30,
    'ESPlusPlayer transport must stop retrying after the configured attempt limit'
  );

  console.log('ESPlusPlayer trusted MessagePort bridge tests passed.');
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
