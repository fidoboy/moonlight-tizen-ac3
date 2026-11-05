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
      : {service: 'ready', esplus: 'available', streamApi: 'set'};
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

const window = {
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
  assert.strictEqual(status.payload.esplus, 'available');
  assert.strictEqual(status.payload.streamApi, 'set');

  assert.deepStrictEqual(pendingMessages.map(message => message.command), ['ping', 'get_status']);
  window.WmpTransport.close();
  assert.strictEqual(listenerRemoved, true);
  console.log('WMP trusted MessagePort bridge tests passed.');
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
