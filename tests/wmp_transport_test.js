'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const pendingMessages = [];
const debugEntries = [];
const manifest = fs.readFileSync(path.join(__dirname, '../wmp/service/tizen-manifest.xml'), 'utf8');
const expectedServiceAppId = 'MoonLightS.WmpService';
assert.ok(manifest.includes('appid="' + expectedServiceAppId + '"'), 'WMP ServiceApp appid must match the transport');
let messageListener = null;
let listenerRemoved = false;
let launchedAppId = null;
let remotePortNotReadyAttempts = 0;
let remotePortRequests = 0;

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
          : {service: 'ready', libraryLoaded: true, esplus: 'symbols_detected', streamApi: 'set'};
    Promise.resolve().then(() => {
      messageListener([
        {key: 'protocol', value: request.protocol},
        {key: 'id', value: request.id},
        {key: 'type', value: 'response'},
        {key: 'status', value: 'ok'},
        {key: 'payload', value: JSON.stringify(payload)}
      ]);
    });
  }
};

const handledEvents = [];
const window = {
  DEBUG_MODE: true,
  console: { debug(...args) { debugEntries.push(args); } },
  handleMessage(message) {
    handledEvents.push(message);
  },
  setTimeout,
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
  const connection = await window.WmpTransport.connect();
  assert.strictEqual(remotePortRequests, 4, 'WMP transport must retry while the ServiceApp registers its port');
  assert.strictEqual(connection.trusted, true);
  assert.strictEqual(launchedAppId, expectedServiceAppId);

  const ping = await window.WmpTransport.ping();
  assert.strictEqual(ping.payload.pong, true);

  const status = await window.WmpTransport.getStatus();
  assert.strictEqual(status.payload.service, 'ready');
  assert.strictEqual(status.payload.libraryLoaded, true);
  assert.strictEqual(status.payload.esplus, 'symbols_detected');
  assert.strictEqual(status.payload.streamApi, 'set');

  const start = await window.WmpTransport.startStream({
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
    audioConfig: '51Surround',
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
  const debugOutput = JSON.stringify(debugEntries);
  assert.ok(debugOutput.includes(expectedServiceAppId), 'Debug log must identify the launched ServiceApp');
  assert.ok(debugOutput.includes('trusted local reply MessagePort acquired'), 'Debug log must record local MessagePort setup');
  assert.ok(debugOutput.includes('native response received'), 'Debug log must record native responses');
  assert.ok(debugOutput.includes('1920x1080'), 'Debug log must include stream dimensions');
  assert.ok(!debugOutput.includes('00112233445566778899aabbccddeeff'), 'Debug log must not include the session key');
  assert.ok(!debugOutput.includes('rtsp://host/session'), 'Debug log must not include the RTSP URL');
  const stop = await window.WmpTransport.stopStream();
  assert.strictEqual(stop.payload.stopped, true);
  assert.deepStrictEqual(
    pendingMessages.map(message => message.command),
    ['ping', 'get_status', 'start_session', 'stop_session']
  );

  messageListener([
    {key: 'protocol', value: 'moonlight-wmp/1'},
    {key: 'type', value: 'event'},
    {key: 'event', value: 'displayVideo'}
  ]);
  assert.deepStrictEqual(handledEvents, ['displayVideo']);

  messageListener([
    {key: 'protocol', value: 'moonlight-wmp/1'},
    {key: 'type', value: 'event'},
    {key: 'event', value: 'streamTerminated: -1'},
    {key: 'detail', value: 'WMP engine start failed (code -101)'}
  ]);
  assert.deepStrictEqual(handledEvents, ['displayVideo', 'streamTerminated: -1']);
  assert.strictEqual(window.pendingStreamApiMessage, 'WMP engine start failed (code -101)');

  window.WmpTransport.close();
  assert.strictEqual(listenerRemoved, true);
  const debugEntryCount = debugEntries.length;

  // Diagnostic output must be completely suppressed outside Debug builds.
  window.DEBUG_MODE = false;
  await window.WmpTransport.connect();
  await window.WmpTransport.ping();
  assert.strictEqual(debugEntries.length, debugEntryCount, 'WMP diagnostics must be Debug-only');
  window.WmpTransport.close();

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
    window.WmpTransport.connect(),
    /could not launch native service: Application not found/
  );
  const launchFailureLog = JSON.stringify(debugEntries.slice(failureLogStart));
  assert.ok(launchFailureLog.includes('WMP ServiceApp launch failed'));
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
    window.WmpTransport.connect(),
    /native control port is unavailable/
  );
  assert.strictEqual(
    remotePortRequests - retryStart,
    30,
    'WMP transport must stop retrying after the configured attempt limit'
  );

  console.log('WMP trusted MessagePort bridge tests passed.');
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
