'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const pendingMessages = [];
let messageListener = null;
let listenerRemoved = false;
let launchedAppId = null;

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
  handleMessage(message) {
    handledEvents.push(message);
  },
  tizen: {
    messageport: {
      requestTrustedLocalMessagePort(name) {
        assert.strictEqual(name, 'MoonlightWmpReply');
        return localPort;
      },
      requestTrustedRemoteMessagePort(appId, portName) {
        assert.strictEqual(appId, 'MoonLightS.WmpService');
        assert.strictEqual(portName, 'MoonlightWmpControl');
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
  const connection = await window.WmpTransport.connect();
  assert.strictEqual(connection.trusted, true);
  assert.strictEqual(launchedAppId, 'MoonLightS.WmpService');

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
  console.log('WMP trusted MessagePort bridge tests passed.');
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
