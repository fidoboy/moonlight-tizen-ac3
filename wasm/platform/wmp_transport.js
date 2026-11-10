/*
 * Moonlight WMP native control channel.
 *
 * Control messages use trusted Tizen MessagePorts. This channel is for small
 * commands and status replies only; encoded audio/video packets must use a
 * separate data path.
 */
(function(global) {
  'use strict';

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

  function makeError(message) {
    return new Error('WMP transport: ' + message);
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
    if (message.protocol !== PROTOCOL) return;

    if (message.type === 'event') {
      if (message.detail) global.pendingStreamApiMessage = String(message.detail);
      if (typeof global.handleMessage === 'function' && message.event) {
        global.handleMessage(String(message.event));
      }
      return;
    }
    if (message.type !== 'response') return;

    var id = String(message.id || '');
    var request = pending[id];
    if (!request) return;

    delete pending[id];

    var response = {
      id: id,
      status: String(message.status || 'error'),
      payload: {}
    };

    try {
      response.payload = JSON.parse(String(message.payload || '{}'));
    } catch (error) {
      request.reject(makeError('native service returned invalid JSON'));
      return;
    }

    if (response.status === 'ok') {
      request.resolve(response);
    } else {
      var error = makeError(response.payload.error || 'native command failed');
      if (response.payload.code !== undefined) error.code = Number(response.payload.code);
      request.reject(error);
    }
  }

  function connect() {
    if (connectPromise) return connectPromise;

    connectPromise = new Promise(function(resolve, reject) {
      try {
        if (!global.tizen ||
            !tizen.messageport ||
            !tizen.application ||
            typeof tizen.application.launch !== 'function') {
          throw makeError('required Tizen APIs are unavailable');
        }

        localPort = tizen.messageport.requestTrustedLocalMessagePort(REPLY_PORT);
        listenerId = localPort.addMessagePortListener(handleMessage);

        tizen.application.launch(SERVICE_APP_ID, function() {
          try {
            remotePort = tizen.messageport.requestTrustedRemoteMessagePort(
              SERVICE_APP_ID, CONTROL_PORT
            );
            if (!remotePort || remotePort.isTrusted !== true) {
              close();
              throw makeError('native control port is not trusted');
            }
            resolve({
              serviceAppId: SERVICE_APP_ID,
              controlPort: CONTROL_PORT,
              trusted: !!remotePort.isTrusted
            });
          } catch (error) {
            close();
            reject(makeError('native control port is unavailable: ' + error.message));
          }
        }, function(error) {
          close();
          reject(makeError('could not launch native service: ' +
            (error && error.message ? error.message : String(error))));
        });
      } catch (error) {
        connectPromise = null;
        reject(error && error.message && error.message.indexOf('WMP transport:') === 0
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
      return Promise.reject(makeError('payload is not JSON serializable'));
    }

    if (serializedPayload.length > 2048) {
      return Promise.reject(makeError('control payload exceeds 2048 characters'));
    }

    return connect().then(function() {
      return new Promise(function(resolve, reject) {
        var id = String(++nextRequestId);
        pending[id] = {resolve: resolve, reject: reject};

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
          remotePort.sendMessage(items, localPort);
        } catch (error) {
          delete pending[id];
          reject(makeError('could not send command: ' + error.message));
        }
      });
    });
  }

  function close() {
    if (localPort && listenerId !== null) {
      try {
        localPort.removeMessagePortListener(listenerId);
      } catch (error) {}
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

  global.WmpTransport = {
    connect: connect,
    request: request,
    ping: function() { return request('ping'); },
    getStatus: function() { return request('get_status'); },
    probeEsplus: function() { return request('probe_esplus'); },
    startStream: function(parameters) { return request('start_session', parameters); },
    stopStream: function() { return request('stop_session'); },
    close: close
  };
})(window);
