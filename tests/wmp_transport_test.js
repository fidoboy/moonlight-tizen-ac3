'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const pendingMessages = [];
const debugEntries = [];
const infoEntries = [];
const errorEntries = [];
const manifest = fs.readFileSync(path.join(__dirname, '../wmp/dotnet-host/tizen-manifest.xml'), 'utf8');
const hostProtocol = fs.readFileSync(path.join(__dirname, '../wmp/dotnet-host/HostProtocol.cs'), 'utf8');
const engineAvoc = fs.readFileSync(path.join(__dirname, '../wmp/engine/mlclient/engine_avoc.c'), 'utf8');
const engineApi = fs.readFileSync(path.join(__dirname, '../wmp/engine/mlclient/engine_api.c'), 'utf8');
const supervisor = fs.readFileSync(path.join(__dirname, '../wmp/dotnet-host/WmpSupervisor.cs'), 'utf8');
assert.ok(/typedef int \(\*avoc_set_game_mode_fn\)\(int save_type, int on\)/.test(engineAvoc) && engineAvoc.includes('s_set_game_mode(save_type, on)'),
  'AVOC setter must use the confirmed two-argument C ABI');
assert.ok(/typedef int \(\*avoc_get_game_mode_fn\)\(int reserved, int save_type, int \*mode\)/.test(engineAvoc) &&
  engineAvoc.includes('s_get_game_mode(0, 1, &observed_mode)'),
  'trace-only AVOC getter must use its independently verified getter ABI');
assert.ok(/ml_avoc_set_game_mode_with_retry\(1, 0, max_retries\)[\s\S]*ml_avoc_set_game_mode_with_retry\(0, 0, max_retries\)/.test(engineAvoc),
  'native AVOC full-off must attempt source and global scopes independently');
assert.ok(engineApi.includes('ml_avoc_force_game_mode_off(3)'),
  'normal WMP teardown must use the AVOC full-off helper');
assert.ok(supervisor.includes('AvocSetGameMode(saveType, 0)'),
  'the independent supervisor must call AVOC with the confirmed two-argument ABI');
assert.ok(supervisor.includes('ForceGameModeFullOff("WMP startup watchdog termination")'),
  'the startup watchdog must restore AVOC before force-killing WMP');
assert.ok(supervisor.includes('ForceGameModeFullOff("unexpected WMP process termination")'),
  'unexpected WMP process death must trigger AVOC full-off in the supervisor');
assert.ok(supervisor.includes('cleanupThread.Join(2500)') && supervisor.includes('cleanup.Join(5000)'),
  'AVOC cleanup waits must be bounded so a stalled firmware call cannot block the WMP watchdog or supervisor exit');
assert.ok(/case "get_logs":[\s\S]{0,220}SendNewNativeDiagnosticLogs\(appId, remotePort, id\)/.test(hostProtocol),
  'legacy get_logs must use the same incremental cursor as get_new_logs');
assert.ok(!hostProtocol.includes('SendDiagnosticLogs('),
  'historical full-ring diagnostic replay must not exist');
assert.ok(hostProtocol.includes('lock (DiagnosticDispatchGate)'),
  'all diagnostic drains must serialize snapshot and event delivery to preserve order');
const expectedServiceAppId = 'MoonLightS.WmpService';
const expectedSupervisorAppId = 'MoonLightS.WmpSupervisor';
assert.ok(manifest.includes('appid="' + expectedServiceAppId + '"'), 'ESPlusPlayer ServiceApp appid must match the transport');
assert.ok(manifest.includes('appid="' + expectedSupervisorAppId + '"'), 'independent supervisor appid must be packaged');
let messageListener = null;
let listenerRemoved = false;
let launchedAppId = null;
const launchedAppIds = [];
let remotePortNotReadyAttempts = 0;
let remotePortRequests = 0;
let nextNativeResponse = null;
let runningServiceContexts = [];
let killedServiceContexts = [];
let launchedServiceCount = 0;
let statusChangeListener = null;
let statusListenerRemoved = false;

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
          : request.command === 'get_new_logs'
            ? {count: 2, hostCount: 0}
            : request.command === 'toggle_stats'
              ? {enabled: true}
              : {service: 'ready', engine: 'libmlengine', sessionState: 'idle', running: false,
             workerActive: false, playbackClockAvailable: true, libraryLoaded: true,
             esplus: 'symbols_detected', streamApi: 'set'};
    const nativeResponse = request.command === 'start_session' && nextNativeResponse
      ? nextNativeResponse
      : {status: 'ok', payload};
    if (request.command === 'start_session') nextNativeResponse = null;
    Promise.resolve().then(() => {
      if (request.command === 'get_new_logs') {
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
    info(...args) { infoEntries.push(args); },
    error(...args) { errorEntries.push(args); }
  },
  handleMessage(message) {
    handledEvents.push(message);
  },
  isGamepadMouseEmulationReady() { return true; },
  openStreamMenuFromGamepad() { handledEvents.push('openStreamMenuFromGamepad'); },
  setTimeout,
  clearTimeout,
  tizen: {
    messageport: {
      requestTrustedLocalMessagePort(name) {
        assert.strictEqual(name, 'MoonlightWmpReply');
        return localPort;
      },
      requestTrustedRemoteMessagePort(appId, portName) {
        if (appId === expectedSupervisorAppId) {
          assert.strictEqual(portName, 'MoonlightWmpSupervisorControl');
          return {isTrusted: true};
        }
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
      addAppStatusChangeListener(callback, appId) {
        assert.strictEqual(appId, expectedServiceAppId);
        statusChangeListener = callback;
        statusListenerRemoved = false;
        return 9;
      },
      removeAppStatusChangeListener(id) {
        assert.strictEqual(id, 9);
        statusListenerRemoved = true;
        statusChangeListener = null;
      },
      getAppsContext(success) {
        success(runningServiceContexts.slice());
      },
      kill(contextId, success) {
        killedServiceContexts.push(contextId);
        runningServiceContexts = runningServiceContexts.filter(context => context.id !== contextId);
        success();
      },
      launch(appId, success) {
        launchedAppId = appId;
        launchedAppIds.push(appId);
        if (appId === expectedSupervisorAppId) {
          runningServiceContexts.push({id: 'wmp-supervisor-context-' + launchedAppIds.length, appId});
          success();
          return;
        }
        launchedServiceCount++;
        runningServiceContexts.push({id: 'wmp-context-' + launchedServiceCount, appId});
        if (statusChangeListener) statusChangeListener(appId, true);
        success();
      }
    }
  }
};

const source = fs.readFileSync(
  path.join(__dirname, '../wasm/platform/wmp_transport.js'),
  'utf8'
);
assert.ok(source.includes("getLogs: function() { return request('get_new_logs'); }"),
  'public getLogs must never request a historical replay');
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
  runningServiceContexts = [{id: 'stale-wmp-context', appId: expectedServiceAppId}];
  remotePortNotReadyAttempts = 3;
  const connection = await window.ESPlusPlayerTransport.connect();
  assert.strictEqual(remotePortRequests, 4, 'ESPlusPlayer transport must retry while the ServiceApp registers its port');
  assert.strictEqual(connection.trusted, true);
  assert.strictEqual(launchedAppId, expectedServiceAppId);
  assert.deepStrictEqual(launchedAppIds.slice(0, 2),
    [expectedSupervisorAppId, expectedServiceAppId],
    'the independent supervisor must be started and its trusted port verified before WMP launch');
  assert.deepStrictEqual(killedServiceContexts, ['stale-wmp-context'],
    'every new connection must terminate a previous WMP service process before relaunching it');
  assert.strictEqual(runningServiceContexts.length, 2,
    'the previous WMP process and supervisor must be confirmed stopped before relaunch');

  const status = await window.ESPlusPlayerTransport.prepare();
  assert.strictEqual(status.service, 'ready');
  assert.strictEqual(status.engine, 'libmlengine');
  assert.strictEqual(status.sessionState, 'idle');
  assert.strictEqual(status.running, false);
  assert.strictEqual(status.workerActive, false);
  assert.strictEqual(status.playbackClockAvailable, true);
  assert.strictEqual(status.libraryLoaded, true);
  assert.strictEqual(status.esplus, 'symbols_detected');
  assert.strictEqual(status.streamApi, 'set');
  assert.deepStrictEqual(pendingMessages.slice(0, 2).map(message => message.command),
    ['ping', 'get_status'],
    'preflight must verify readiness and status without sending playback/session commands');

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

  const killedBeforeFirstStream = killedServiceContexts.length;
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
    disableWarnings: true,
    mouseEmulation: true,
    mouseEmulationStick: 'right',
    selectHoldStreamMenu: true,
    audioConfig: '51Surround',
    opticalOutputEnabled: true,
    videoCodec: 'H264',
    hdr: false,
    fullRange: false
  });
  assert.strictEqual(start.payload.accepted, true);
  assert.strictEqual(killedServiceContexts.length, killedBeforeFirstStream,
    'start_session must reuse the WMP service prepared before host negotiation, without restarting its process');
  const startMessage = pendingMessages[pendingMessages.length - 1];
  assert.strictEqual(startMessage.command, 'start_session');
  assert.strictEqual(startMessage.arg_host, '192.168.0.10');
  assert.strictEqual(startMessage.arg_rikey, '00112233445566778899aabbccddeeff');
  assert.strictEqual(startMessage.arg_videoCodec, 'H264');
  assert.strictEqual(startMessage.arg_audioEnabled, 'false');
  assert.strictEqual(startMessage.arg_disableWarnings, 'true',
    'the native service must receive the saved connection-warning preference');
  assert.strictEqual(startMessage.arg_debugMode, 'true',
    'Debug Mode must be forwarded to the native service for Common C diagnostic gating');
  assert.strictEqual(startMessage.arg_opticalOutputEnabled, 'true');
  assert.strictEqual(startMessage.arg_mouseEmulation, 'true',
    'the native transport must receive the mouse emulation preference');
  assert.strictEqual(startMessage.arg_mouseEmulationStick, undefined,
    'the selected mouse stick must remain a WebApp-side setting, not extend the native service protocol');
  assert.strictEqual(startMessage.arg_selectHoldStreamMenu, 'true',
    'the native transport must receive the Select long-press preference');

  const nativeNeutralButtons = Array(16).fill(0);

  // Undocumented combinations must pass through without opening UI or toggling stats.
  const menuEventsBeforeUnreservedCombos = handledEvents.filter(event => event === 'openStreamMenuFromGamepad').length;
  const statsRequestsBeforeUnreservedCombos = pendingMessages.filter(message => message.command === 'toggle_stats').length;
  const bothStickButtons = nativeNeutralButtons.slice();
  bothStickButtons[10] = 1;
  bothStickButtons[11] = 1;
  window.dispatchEvent({
    type: 'esplusgamepadstate',
    detail: {gamepadIndex: 0, buttons: bothStickButtons, axes: [0, 0, 0, 0]}
  });
  assert.strictEqual(
    handledEvents.filter(event => event === 'openStreamMenuFromGamepad').length,
    menuEventsBeforeUnreservedCombos,
    'pressing both stick buttons must not open the stream menu');
  const oldStatsCombo = nativeNeutralButtons.slice();
  oldStatsCombo[8] = 1;
  oldStatsCombo[4] = 1;
  oldStatsCombo[5] = 1;
  oldStatsCombo[2] = 1;
  window.dispatchEvent({
    type: 'esplusgamepadstate',
    detail: {gamepadIndex: 0, buttons: oldStatsCombo, axes: [0, 0, 0, 0]}
  });
  window.dispatchEvent({
    type: 'esplusgamepadstate',
    detail: {gamepadIndex: 0, buttons: nativeNeutralButtons, axes: [0, 0, 0, 0]}
  });
  assert.strictEqual(
    pendingMessages.filter(message => message.command === 'toggle_stats').length,
    statsRequestsBeforeUnreservedCombos,
    'the undocumented gamepad statistics combination must not be intercepted');

  // Native Select long-press must open the existing stream menu.
  window.dispatchEvent({
    type: 'esplusgamepadconnected',
    detail: {gamepadIndex: 0, id: 'Xbox Controller', buttonCount: 16}
  });
  window.dispatchEvent({
    type: 'esplusgamepadstate',
    detail: {gamepadIndex: 0, buttons: nativeNeutralButtons, axes: [0, 0, 0, 0]}
  });
  const selectHeld = nativeNeutralButtons.slice();
  selectHeld[8] = 1;
  window.dispatchEvent({
    type: 'esplusgamepadstate',
    detail: {gamepadIndex: 0, buttons: selectHeld, axes: [0, 0, 0, 0]}
  });
  await new Promise(resolve => setTimeout(resolve, 1050));
  assert.ok(handledEvents.includes('openStreamMenuFromGamepad'),
    'holding Select for one second must open the stream menu on ESPlusPlayer');

  // Native Start long-press must toggle mouse mode and route stick motion to mouse input.
  const selectReleased = nativeNeutralButtons.slice();
  window.dispatchEvent({
    type: 'esplusgamepadstate',
    detail: {gamepadIndex: 0, buttons: selectReleased, axes: [0, 0, 0, 0]}
  });
  const startHeld = nativeNeutralButtons.slice();
  startHeld[9] = 1;
  window.dispatchEvent({
    type: 'esplusgamepadstate',
    detail: {gamepadIndex: 0, buttons: startHeld, axes: [0, 0, 0, 0]}
  });
  await new Promise(resolve => setTimeout(resolve, 1050));
  assert.ok(handledEvents.includes('mouseEmulationOn'),
    'holding Start for one second must activate native mouse emulation');
  const mouseMoveCount = pendingMessages.filter(message => message.command === 'mouse_move').length;
  window.dispatchEvent({
    type: 'esplusgamepadstate',
    detail: {gamepadIndex: 0, buttons: startHeld, axes: [0.5, 0, 0, 0]}
  });
  assert.ok(pendingMessages.filter(message => message.command === 'mouse_move').length > mouseMoveCount,
    'the default right stick must use Tizen physical right-stick axes for native mouse movement');
  const mouseMoveCountAfterAxisChange = pendingMessages.filter(message => message.command === 'mouse_move').length;
  await new Promise(resolve => setTimeout(resolve, 40));
  assert.ok(pendingMessages.filter(message => message.command === 'mouse_move').length > mouseMoveCountAfterAxisChange,
    'holding the right stick must continue generating mouse movement without further Gamepad API change events');

  // A second Start long-press disables mouse mode.
  window.dispatchEvent({
    type: 'esplusgamepadstate',
    detail: {gamepadIndex: 0, buttons: nativeNeutralButtons, axes: [0, 0, 0, 0]}
  });
  window.dispatchEvent({
    type: 'esplusgamepadstate',
    detail: {gamepadIndex: 0, buttons: startHeld, axes: [0, 0, 0, 0]}
  });
  await new Promise(resolve => setTimeout(resolve, 1050));
  assert.ok(handledEvents.includes('mouseEmulationOff'),
    'holding Start again must deactivate native mouse emulation');


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

  const killedBeforeSecondStream = killedServiceContexts.length;
  // Native ParseStart diagnostics must reach the caller with the rejected field.
  nextNativeResponse = {
    status: 'error',
    payload: {error: 'invalid_start_arguments', field: 'opticalOutputEnabled'}
  };
  await assert.rejects(
    window.ESPlusPlayerTransport.startStream({host: '192.168.0.10'}),
    /invalid_start_arguments: opticalOutputEnabled/
  );
  assert.strictEqual(killedServiceContexts.length, killedBeforeSecondStream + 2,
    'a rejected start must terminate the active WMP service and supervisor exactly once');
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
  assert.ok(handledEvents.includes('StatMsg: '),
    'the statistics toggle event must reach the WebApp overlay handler');
  // toggleStats() legitimately emits an initial empty StatMsg. Keep that
  // assertion separate so the following sample-forwarding test measures only
  // the four events injected below.
  handledEvents.length = 0;
  const performanceSamples = [
    'StatMsg: sample',
    'GraphMsg: sample',
    'HostLatencyMsg: sample',
    'ProgressMsg: sample'
  ];
  performanceSamples.forEach(function(event) {
    messageListener([
      {key: 'protocol', value: 'moonlight-wmp/1'},
      {key: 'type', value: 'event'},
      {key: 'event', value: event}
    ]);
  });
  assert.deepStrictEqual(handledEvents, performanceSamples,
    'performance statistics samples must reach the WebApp overlay handlers');
  assert.ok(!debugEntries.some(function(entry) {
    return entry[1] === 'native event received' &&
      performanceSamples.indexOf(entry[2] && entry[2].event) !== -1;
  }), 'high-frequency statistics samples must not create transport diagnostic log entries');
  messageListener([
    {key: 'protocol', value: 'moonlight-wmp/1'},
    {key: 'type', value: 'event'},
    {key: 'event', value: 'wmpDiagnosticReady'}
  ]);
  for (let i = 0; i < 8; i++) await Promise.resolve();
  assert.ok(debugEntries.some(entry => entry[1] ===
    'native StartSessionV2 call returned; incremental diagnostics remain active'),
    'StartSessionV2 return must keep incremental diagnostics active without requesting a full snapshot');
  messageListener([
    {key: 'protocol', value: 'moonlight-wmp/1'},
    {key: 'type', value: 'event'},
    {key: 'event', value: 'wmpNativeDiag'},
    {key: 'detail', value: 'ml_log_cb video registration callback ENTER'}
  ]);
  assert.ok(infoEntries.some(entry => entry[0] === '[esplusplayer/diag]' &&
    entry[1] === 'ml_log_cb video registration callback ENTER'),
    'Independent native diagnostic markers must be forwarded to the debug log');
  const foregroundCommands = pendingMessages
    .filter(message => !['gamepad_arrival', 'gamepad_state', 'mouse_move', 'mouse_button', 'mouse_scroll', 'get_new_logs'].includes(message.command))
    .map(message => message.command);
  assert.deepStrictEqual(
    foregroundCommands,
    ['ping', 'get_status', 'ping', 'start_session', 'ping', 'start_session', 'stop_session', 'toggle_stats'],
    'foreground transport requests must retain their order independently of passive diagnostic polling'
  );
  assert.ok(pendingMessages.some(message => message.command === 'get_new_logs'),
    'incremental diagnostic retrieval must issue get_new_logs');

  messageListener([
    {key: 'protocol', value: 'moonlight-wmp/1'},
    {key: 'type', value: 'event'},
    {key: 'event', value: 'displayVideo'}
  ]);
  assert.deepStrictEqual(handledEvents, performanceSamples.concat(['displayVideo']));

  messageListener([
    {key: 'protocol', value: 'moonlight-wmp/1'},
    {key: 'type', value: 'event'},
    {key: 'event', value: 'wmpPlayerError: 8193'},
    {key: 'detail', value: 'ESPlus player error 0x2001'}
  ]);
  assert.deepStrictEqual(handledEvents, [
    ...performanceSamples, 'displayVideo'
  ], 'fatal ESPlusPlayer player errors must not show a transient warning; stream termination owns the shared error dialog');
  assert.strictEqual(window.pendingStreamApiMessage, 'ESPlus player error 0x2001');

  messageListener([
    {key: 'protocol', value: 'moonlight-wmp/1'},
    {key: 'type', value: 'event'},
    {key: 'event', value: 'streamTerminated: -1'},
    {key: 'detail', value: 'ESPlusPlayer engine start failed (code -101)'}
  ]);
  assert.deepStrictEqual(handledEvents, performanceSamples.concat(['displayVideo', 'streamTerminated: -1']));
  messageListener([
    {key: 'protocol', value: 'moonlight-wmp/1'},
    {key: 'type', value: 'event'},
    {key: 'event', value: 'WarningMsg: Slow connection to PC.\nReduce your bitrate!'}
  ]);
  messageListener([
    {key: 'protocol', value: 'moonlight-wmp/1'},
    {key: 'type', value: 'event'},
    {key: 'event', value: 'NoWarningMsg: Connection to PC has been improved.'}
  ]);
  assert.deepStrictEqual(handledEvents.slice(-2), [
    'WarningMsg: Slow connection to PC.\nReduce your bitrate!',
    'NoWarningMsg: Connection to PC has been improved.'
  ], 'native connection-quality events must reach the shared EMSS warning overlay handler');

  assert.strictEqual(window.pendingStreamApiMessage, 'ESPlusPlayer engine start failed (code -101)');
  if (statusChangeListener) statusChangeListener(expectedServiceAppId, false);
  assert.strictEqual(handledEvents.filter(event => event === 'streamTerminated: -1').length, 1,
    'the OS inactive notification after a native streamTerminated event must not create a duplicate UI failure');

  // An independent native supervisor notification must use the same shared
  // termination path, without relying on the WMP process or a JS watchdog.
  messageListener([
    {key: 'protocol', value: 'moonlight-wmp/1'},
    {key: 'type', value: 'event'},
    {key: 'event', value: 'wmpSupervisorTerminated'},
    {key: 'detail', value: 'source=ApplicationManager.ApplicationTerminated appId=' + expectedServiceAppId + ' pid=4321 expected=false'}
  ]);
  assert.strictEqual(handledEvents.filter(event => event === 'streamTerminated: -1').length, 1,
    'a supervisor notification after an already-received native terminal event must not duplicate recovery');

  window.ESPlusPlayerTransport.close();
  assert.strictEqual(listenerRemoved, true);
  assert.strictEqual(statusListenerRemoved, true, 'closing the transport must remove the Tizen app status listener');
  const debugEntryCount = debugEntries.length;

  // Diagnostic output must be completely suppressed outside Debug builds.
  window.DEBUG_MODE = false;
  await window.ESPlusPlayerTransport.connect();
  await window.ESPlusPlayerTransport.ping();
  assert.strictEqual(debugEntries.length, debugEntryCount, 'ESPlusPlayer diagnostics must be Debug-only');
  window.ESPlusPlayerTransport.close();

  // A process exit without a native streamTerminated event must be reported
  // through the shared Moonlight termination path, without a JS watchdog.
  window.DEBUG_MODE = true;
  await window.ESPlusPlayerTransport.startStream({host: '192.168.0.10'});
  assert.strictEqual(handledEvents.filter(event => event === 'streamTerminated: -1').length, 1);
  runningServiceContexts = [];
  statusChangeListener(expectedServiceAppId, false);
  await Promise.resolve();
  assert.strictEqual(handledEvents.filter(event => event === 'streamTerminated: -1').length, 2,
    'an unexpected OS-reported ServiceApp exit must notify the shared stream termination handler');
  assert.ok(errorEntries.some(entry => entry[0] === '[esplusplayer] Native service process exited unexpectedly'),
    'unexpected native service termination must be written to the application error log');
  assert.ok(window.pendingStreamApiMessage.includes('exited unexpectedly'),
    'the unexpected process exit reason must be retained for the stream error dialog');

  // Exercise the supervisor as the first source of an unexpected termination.
  await window.ESPlusPlayerTransport.startStream({host: '192.168.0.10'});
  const beforeSupervisorTermination = handledEvents.filter(event => event === 'streamTerminated: -1').length;
  messageListener([
    {key: 'protocol', value: 'moonlight-wmp/1'},
    {key: 'type', value: 'event'},
    {key: 'event', value: 'wmpSupervisorTerminated'},
    {key: 'detail', value: 'source=ApplicationManager.ApplicationTerminated appId=' + expectedServiceAppId + ' pid=9876 expected=false'}
  ]);
  assert.strictEqual(handledEvents.filter(event => event === 'streamTerminated: -1').length,
    beforeSupervisorTermination + 1,
    'an unexpected supervisor event after accepted start_session must trigger shared UI recovery');
  assert.ok(window.pendingStreamApiMessage.includes('pid=9876'),
    'the supervisor termination details must be retained for the stream error dialog');

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
    /could not launch independent WMP supervisor: Application not found/
  );
  const launchFailureLog = JSON.stringify(debugEntries.slice(failureLogStart));
  assert.ok(launchFailureLog.includes('launching independent WMP process supervisor'));
  assert.ok(launchFailureLog.includes('NotFoundError'));
  assert.ok(launchFailureLog.includes('Application not found'));
  assert.ok(launchFailureLog.includes(expectedSupervisorAppId));

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
  assert.strictEqual(runningServiceContexts.length, 0,
    'a failed launch handshake must terminate the half-started WMP process and supervisor');

  console.log('ESPlusPlayer trusted MessagePort bridge tests passed.');
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});assert.ok(/typedef int \\(\\*avoc_get_game_mode_fn\\)\\(int save_type, int \\*mode\\)/.test(engineAvoc) &&
  /s_get_game_mode\\(1, &observed_mode\\)/.test(engineAvoc),
  'trace-only AVOC getter must use the confirmed two-argument C ABI');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const pendingMessages = [];
const debugEntries = [];
const infoEntries = [];
const errorEntries = [];
const manifest = fs.readFileSync(path.join(__dirname, '../wmp/dotnet-host/tizen-manifest.xml'), 'utf8');
const hostProtocol = fs.readFileSync(path.join(__dirname, '../wmp/dotnet-host/HostProtocol.cs'), 'utf8');
const engineAvoc = fs.readFileSync(path.join(__dirname, '../wmp/engine/mlclient/engine_avoc.c'), 'utf8');
const engineApi = fs.readFileSync(path.join(__dirname, '../wmp/engine/mlclient/engine_api.c'), 'utf8');
const supervisor = fs.readFileSync(path.join(__dirname, '../wmp/dotnet-host/WmpSupervisor.cs'), 'utf8');
assert.ok(/typedef int \(\*avoc_set_game_mode_fn\)\(int save_type, int on\)/.test(engineAvoc) && engineAvoc.includes('s_set_game_mode(save_type, on)'),
  'AVOC setter must use the confirmed two-argument C ABI');
assert.ok(/typedef int \(\*avoc_get_game_mode_fn\)\(int reserved, int save_type, int \*mode\)/.test(engineAvoc) &&
  engineAvoc.includes('s_get_game_mode(0, 1, &observed_mode)'),
  'trace-only AVOC getter must use its independently verified getter ABI');
assert.ok(/ml_avoc_set_game_mode_with_retry\(1, 0, max_retries\)[\s\S]*ml_avoc_set_game_mode_with_retry\(0, 0, max_retries\)/.test(engineAvoc),
  'native AVOC full-off must attempt source and global scopes independently');
assert.ok(engineApi.includes('ml_avoc_force_game_mode_off(3)'),
  'normal WMP teardown must use the AVOC full-off helper');
assert.ok(supervisor.includes('AvocSetGameMode(saveType, 0)'),
  'the independent supervisor must call AVOC with the confirmed two-argument ABI');
assert.ok(supervisor.includes('ForceGameModeFullOff("WMP startup watchdog termination")'),
  'the startup watchdog must restore AVOC before force-killing WMP');
assert.ok(supervisor.includes('ForceGameModeFullOff("unexpected WMP process termination")'),
  'unexpected WMP process death must trigger AVOC full-off in the supervisor');
assert.ok(supervisor.includes('cleanupThread.Join(2500)') && supervisor.includes('cleanup.Join(5000)'),
  'AVOC cleanup waits must be bounded so a stalled firmware call cannot block the WMP watchdog or supervisor exit');
assert.ok(/case "get_logs":[\s\S]{0,220}SendNewNativeDiagnosticLogs\(appId, remotePort, id\)/.test(hostProtocol),
  'legacy get_logs must use the same incremental cursor as get_new_logs');
assert.ok(!hostProtocol.includes('SendDiagnosticLogs('),
  'historical full-ring diagnostic replay must not exist');
assert.ok(hostProtocol.includes('lock (DiagnosticDispatchGate)'),
  'all diagnostic drains must serialize snapshot and event delivery to preserve order');
const expectedServiceAppId = 'MoonLightS.WmpService';
const expectedSupervisorAppId = 'MoonLightS.WmpSupervisor';
assert.ok(manifest.includes('appid="' + expectedServiceAppId + '"'), 'ESPlusPlayer ServiceApp appid must match the transport');
assert.ok(manifest.includes('appid="' + expectedSupervisorAppId + '"'), 'independent supervisor appid must be packaged');
let messageListener = null;
let listenerRemoved = false;
let launchedAppId = null;
const launchedAppIds = [];
let remotePortNotReadyAttempts = 0;
let remotePortRequests = 0;
let nextNativeResponse = null;
let runningServiceContexts = [];
let killedServiceContexts = [];
let launchedServiceCount = 0;
let statusChangeListener = null;
let statusListenerRemoved = false;

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
          : request.command === 'get_new_logs'
            ? {count: 2, hostCount: 0}
            : request.command === 'toggle_stats'
              ? {enabled: true}
              : {service: 'ready', engine: 'libmlengine', sessionState: 'idle', running: false,
             workerActive: false, playbackClockAvailable: true, libraryLoaded: true,
             esplus: 'symbols_detected', streamApi: 'set'};
    const nativeResponse = request.command === 'start_session' && nextNativeResponse
      ? nextNativeResponse
      : {status: 'ok', payload};
    if (request.command === 'start_session') nextNativeResponse = null;
    Promise.resolve().then(() => {
      if (request.command === 'get_new_logs') {
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
    info(...args) { infoEntries.push(args); },
    error(...args) { errorEntries.push(args); }
  },
  handleMessage(message) {
    handledEvents.push(message);
  },
  isGamepadMouseEmulationReady() { return true; },
  openStreamMenuFromGamepad() { handledEvents.push('openStreamMenuFromGamepad'); },
  setTimeout,
  clearTimeout,
  tizen: {
    messageport: {
      requestTrustedLocalMessagePort(name) {
        assert.strictEqual(name, 'MoonlightWmpReply');
        return localPort;
      },
      requestTrustedRemoteMessagePort(appId, portName) {
        if (appId === expectedSupervisorAppId) {
          assert.strictEqual(portName, 'MoonlightWmpSupervisorControl');
          return {isTrusted: true};
        }
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
      addAppStatusChangeListener(callback, appId) {
        assert.strictEqual(appId, expectedServiceAppId);
        statusChangeListener = callback;
        statusListenerRemoved = false;
        return 9;
      },
      removeAppStatusChangeListener(id) {
        assert.strictEqual(id, 9);
        statusListenerRemoved = true;
        statusChangeListener = null;
      },
      getAppsContext(success) {
        success(runningServiceContexts.slice());
      },
      kill(contextId, success) {
        killedServiceContexts.push(contextId);
        runningServiceContexts = runningServiceContexts.filter(context => context.id !== contextId);
        success();
      },
      launch(appId, success) {
        launchedAppId = appId;
        launchedAppIds.push(appId);
        if (appId === expectedSupervisorAppId) {
          runningServiceContexts.push({id: 'wmp-supervisor-context-' + launchedAppIds.length, appId});
          success();
          return;
        }
        launchedServiceCount++;
        runningServiceContexts.push({id: 'wmp-context-' + launchedServiceCount, appId});
        if (statusChangeListener) statusChangeListener(appId, true);
        success();
      }
    }
  }
};

const source = fs.readFileSync(
  path.join(__dirname, '../wasm/platform/wmp_transport.js'),
  'utf8'
);
assert.ok(source.includes("getLogs: function() { return request('get_new_logs'); }"),
  'public getLogs must never request a historical replay');
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
  runningServiceContexts = [{id: 'stale-wmp-context', appId: expectedServiceAppId}];
  remotePortNotReadyAttempts = 3;
  const connection = await window.ESPlusPlayerTransport.connect();
  assert.strictEqual(remotePortRequests, 4, 'ESPlusPlayer transport must retry while the ServiceApp registers its port');
  assert.strictEqual(connection.trusted, true);
  assert.strictEqual(launchedAppId, expectedServiceAppId);
  assert.deepStrictEqual(launchedAppIds.slice(0, 2),
    [expectedSupervisorAppId, expectedServiceAppId],
    'the independent supervisor must be started and its trusted port verified before WMP launch');
  assert.deepStrictEqual(killedServiceContexts, ['stale-wmp-context'],
    'every new connection must terminate a previous WMP service process before relaunching it');
  assert.strictEqual(runningServiceContexts.length, 2,
    'the previous WMP process and supervisor must be confirmed stopped before relaunch');

  const status = await window.ESPlusPlayerTransport.prepare();
  assert.strictEqual(status.service, 'ready');
  assert.strictEqual(status.engine, 'libmlengine');
  assert.strictEqual(status.sessionState, 'idle');
  assert.strictEqual(status.running, false);
  assert.strictEqual(status.workerActive, false);
  assert.strictEqual(status.playbackClockAvailable, true);
  assert.strictEqual(status.libraryLoaded, true);
  assert.strictEqual(status.esplus, 'symbols_detected');
  assert.strictEqual(status.streamApi, 'set');
  assert.deepStrictEqual(pendingMessages.slice(0, 2).map(message => message.command),
    ['ping', 'get_status'],
    'preflight must verify readiness and status without sending playback/session commands');

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

  const killedBeforeFirstStream = killedServiceContexts.length;
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
    disableWarnings: true,
    mouseEmulation: true,
    mouseEmulationStick: 'right',
    selectHoldStreamMenu: true,
    audioConfig: '51Surround',
    opticalOutputEnabled: true,
    videoCodec: 'H264',
    hdr: false,
    fullRange: false
  });
  assert.strictEqual(start.payload.accepted, true);
  assert.strictEqual(killedServiceContexts.length, killedBeforeFirstStream,
    'start_session must reuse the WMP service prepared before host negotiation, without restarting its process');
  const startMessage = pendingMessages[pendingMessages.length - 1];
  assert.strictEqual(startMessage.command, 'start_session');
  assert.strictEqual(startMessage.arg_host, '192.168.0.10');
  assert.strictEqual(startMessage.arg_rikey, '00112233445566778899aabbccddeeff');
  assert.strictEqual(startMessage.arg_videoCodec, 'H264');
  assert.strictEqual(startMessage.arg_audioEnabled, 'false');
  assert.strictEqual(startMessage.arg_disableWarnings, 'true',
    'the native service must receive the saved connection-warning preference');
  assert.strictEqual(startMessage.arg_debugMode, 'true',
    'Debug Mode must be forwarded to the native service for Common C diagnostic gating');
  assert.strictEqual(startMessage.arg_opticalOutputEnabled, 'true');
  assert.strictEqual(startMessage.arg_mouseEmulation, 'true',
    'the native transport must receive the mouse emulation preference');
  assert.strictEqual(startMessage.arg_mouseEmulationStick, undefined,
    'the selected mouse stick must remain a WebApp-side setting, not extend the native service protocol');
  assert.strictEqual(startMessage.arg_selectHoldStreamMenu, 'true',
    'the native transport must receive the Select long-press preference');

  const nativeNeutralButtons = Array(16).fill(0);

  // Undocumented combinations must pass through without opening UI or toggling stats.
  const menuEventsBeforeUnreservedCombos = handledEvents.filter(event => event === 'openStreamMenuFromGamepad').length;
  const statsRequestsBeforeUnreservedCombos = pendingMessages.filter(message => message.command === 'toggle_stats').length;
  const bothStickButtons = nativeNeutralButtons.slice();
  bothStickButtons[10] = 1;
  bothStickButtons[11] = 1;
  window.dispatchEvent({
    type: 'esplusgamepadstate',
    detail: {gamepadIndex: 0, buttons: bothStickButtons, axes: [0, 0, 0, 0]}
  });
  assert.strictEqual(
    handledEvents.filter(event => event === 'openStreamMenuFromGamepad').length,
    menuEventsBeforeUnreservedCombos,
    'pressing both stick buttons must not open the stream menu');
  const oldStatsCombo = nativeNeutralButtons.slice();
  oldStatsCombo[8] = 1;
  oldStatsCombo[4] = 1;
  oldStatsCombo[5] = 1;
  oldStatsCombo[2] = 1;
  window.dispatchEvent({
    type: 'esplusgamepadstate',
    detail: {gamepadIndex: 0, buttons: oldStatsCombo, axes: [0, 0, 0, 0]}
  });
  window.dispatchEvent({
    type: 'esplusgamepadstate',
    detail: {gamepadIndex: 0, buttons: nativeNeutralButtons, axes: [0, 0, 0, 0]}
  });
  assert.strictEqual(
    pendingMessages.filter(message => message.command === 'toggle_stats').length,
    statsRequestsBeforeUnreservedCombos,
    'the undocumented gamepad statistics combination must not be intercepted');

  // Native Select long-press must open the existing stream menu.
  window.dispatchEvent({
    type: 'esplusgamepadconnected',
    detail: {gamepadIndex: 0, id: 'Xbox Controller', buttonCount: 16}
  });
  window.dispatchEvent({
    type: 'esplusgamepadstate',
    detail: {gamepadIndex: 0, buttons: nativeNeutralButtons, axes: [0, 0, 0, 0]}
  });
  const selectHeld = nativeNeutralButtons.slice();
  selectHeld[8] = 1;
  window.dispatchEvent({
    type: 'esplusgamepadstate',
    detail: {gamepadIndex: 0, buttons: selectHeld, axes: [0, 0, 0, 0]}
  });
  await new Promise(resolve => setTimeout(resolve, 1050));
  assert.ok(handledEvents.includes('openStreamMenuFromGamepad'),
    'holding Select for one second must open the stream menu on ESPlusPlayer');

  // Native Start long-press must toggle mouse mode and route stick motion to mouse input.
  const selectReleased = nativeNeutralButtons.slice();
  window.dispatchEvent({
    type: 'esplusgamepadstate',
    detail: {gamepadIndex: 0, buttons: selectReleased, axes: [0, 0, 0, 0]}
  });
  const startHeld = nativeNeutralButtons.slice();
  startHeld[9] = 1;
  window.dispatchEvent({
    type: 'esplusgamepadstate',
    detail: {gamepadIndex: 0, buttons: startHeld, axes: [0, 0, 0, 0]}
  });
  await new Promise(resolve => setTimeout(resolve, 1050));
  assert.ok(handledEvents.includes('mouseEmulationOn'),
    'holding Start for one second must activate native mouse emulation');
  const mouseMoveCount = pendingMessages.filter(message => message.command === 'mouse_move').length;
  window.dispatchEvent({
    type: 'esplusgamepadstate',
    detail: {gamepadIndex: 0, buttons: startHeld, axes: [0.5, 0, 0, 0]}
  });
  assert.ok(pendingMessages.filter(message => message.command === 'mouse_move').length > mouseMoveCount,
    'the default right stick must use Tizen physical right-stick axes for native mouse movement');
  const mouseMoveCountAfterAxisChange = pendingMessages.filter(message => message.command === 'mouse_move').length;
  await new Promise(resolve => setTimeout(resolve, 40));
  assert.ok(pendingMessages.filter(message => message.command === 'mouse_move').length > mouseMoveCountAfterAxisChange,
    'holding the right stick must continue generating mouse movement without further Gamepad API change events');

  // A second Start long-press disables mouse mode.
  window.dispatchEvent({
    type: 'esplusgamepadstate',
    detail: {gamepadIndex: 0, buttons: nativeNeutralButtons, axes: [0, 0, 0, 0]}
  });
  window.dispatchEvent({
    type: 'esplusgamepadstate',
    detail: {gamepadIndex: 0, buttons: startHeld, axes: [0, 0, 0, 0]}
  });
  await new Promise(resolve => setTimeout(resolve, 1050));
  assert.ok(handledEvents.includes('mouseEmulationOff'),
    'holding Start again must deactivate native mouse emulation');


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

  const killedBeforeSecondStream = killedServiceContexts.length;
  // Native ParseStart diagnostics must reach the caller with the rejected field.
  nextNativeResponse = {
    status: 'error',
    payload: {error: 'invalid_start_arguments', field: 'opticalOutputEnabled'}
  };
  await assert.rejects(
    window.ESPlusPlayerTransport.startStream({host: '192.168.0.10'}),
    /invalid_start_arguments: opticalOutputEnabled/
  );
  assert.strictEqual(killedServiceContexts.length, killedBeforeSecondStream + 2,
    'a rejected start must terminate the active WMP service and supervisor exactly once');
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
  assert.ok(handledEvents.includes('StatMsg: '),
    'the statistics toggle event must reach the WebApp overlay handler');
  // toggleStats() legitimately emits an initial empty StatMsg. Keep that
  // assertion separate so the following sample-forwarding test measures only
  // the four events injected below.
  handledEvents.length = 0;
  const performanceSamples = [
    'StatMsg: sample',
    'GraphMsg: sample',
    'HostLatencyMsg: sample',
    'ProgressMsg: sample'
  ];
  performanceSamples.forEach(function(event) {
    messageListener([
      {key: 'protocol', value: 'moonlight-wmp/1'},
      {key: 'type', value: 'event'},
      {key: 'event', value: event}
    ]);
  });
  assert.deepStrictEqual(handledEvents, performanceSamples,
    'performance statistics samples must reach the WebApp overlay handlers');
  assert.ok(!debugEntries.some(function(entry) {
    return entry[1] === 'native event received' &&
      performanceSamples.indexOf(entry[2] && entry[2].event) !== -1;
  }), 'high-frequency statistics samples must not create transport diagnostic log entries');
  messageListener([
    {key: 'protocol', value: 'moonlight-wmp/1'},
    {key: 'type', value: 'event'},
    {key: 'event', value: 'wmpDiagnosticReady'}
  ]);
  for (let i = 0; i < 8; i++) await Promise.resolve();
  assert.ok(debugEntries.some(entry => entry[1] ===
    'native StartSessionV2 call returned; incremental diagnostics remain active'),
    'StartSessionV2 return must keep incremental diagnostics active without requesting a full snapshot');
  messageListener([
    {key: 'protocol', value: 'moonlight-wmp/1'},
    {key: 'type', value: 'event'},
    {key: 'event', value: 'wmpNativeDiag'},
    {key: 'detail', value: 'ml_log_cb video registration callback ENTER'}
  ]);
  assert.ok(infoEntries.some(entry => entry[0] === '[esplusplayer/diag]' &&
    entry[1] === 'ml_log_cb video registration callback ENTER'),
    'Independent native diagnostic markers must be forwarded to the debug log');
  const foregroundCommands = pendingMessages
    .filter(message => !['gamepad_arrival', 'gamepad_state', 'mouse_move', 'mouse_button', 'mouse_scroll', 'get_new_logs'].includes(message.command))
    .map(message => message.command);
  assert.deepStrictEqual(
    foregroundCommands,
    ['ping', 'get_status', 'ping', 'start_session', 'ping', 'start_session', 'stop_session', 'toggle_stats'],
    'foreground transport requests must retain their order independently of passive diagnostic polling'
  );
  assert.ok(pendingMessages.some(message => message.command === 'get_new_logs'),
    'incremental diagnostic retrieval must issue get_new_logs');

  messageListener([
    {key: 'protocol', value: 'moonlight-wmp/1'},
    {key: 'type', value: 'event'},
    {key: 'event', value: 'displayVideo'}
  ]);
  assert.deepStrictEqual(handledEvents, performanceSamples.concat(['displayVideo']));

  messageListener([
    {key: 'protocol', value: 'moonlight-wmp/1'},
    {key: 'type', value: 'event'},
    {key: 'event', value: 'wmpPlayerError: 8193'},
    {key: 'detail', value: 'ESPlus player error 0x2001'}
  ]);
  assert.deepStrictEqual(handledEvents, [
    ...performanceSamples, 'displayVideo'
  ], 'fatal ESPlusPlayer player errors must not show a transient warning; stream termination owns the shared error dialog');
  assert.strictEqual(window.pendingStreamApiMessage, 'ESPlus player error 0x2001');

  messageListener([
    {key: 'protocol', value: 'moonlight-wmp/1'},
    {key: 'type', value: 'event'},
    {key: 'event', value: 'streamTerminated: -1'},
    {key: 'detail', value: 'ESPlusPlayer engine start failed (code -101)'}
  ]);
  assert.deepStrictEqual(handledEvents, performanceSamples.concat(['displayVideo', 'streamTerminated: -1']));
  messageListener([
    {key: 'protocol', value: 'moonlight-wmp/1'},
    {key: 'type', value: 'event'},
    {key: 'event', value: 'WarningMsg: Slow connection to PC.\nReduce your bitrate!'}
  ]);
  messageListener([
    {key: 'protocol', value: 'moonlight-wmp/1'},
    {key: 'type', value: 'event'},
    {key: 'event', value: 'NoWarningMsg: Connection to PC has been improved.'}
  ]);
  assert.deepStrictEqual(handledEvents.slice(-2), [
    'WarningMsg: Slow connection to PC.\nReduce your bitrate!',
    'NoWarningMsg: Connection to PC has been improved.'
  ], 'native connection-quality events must reach the shared EMSS warning overlay handler');

  assert.strictEqual(window.pendingStreamApiMessage, 'ESPlusPlayer engine start failed (code -101)');
  if (statusChangeListener) statusChangeListener(expectedServiceAppId, false);
  assert.strictEqual(handledEvents.filter(event => event === 'streamTerminated: -1').length, 1,
    'the OS inactive notification after a native streamTerminated event must not create a duplicate UI failure');

  // An independent native supervisor notification must use the same shared
  // termination path, without relying on the WMP process or a JS watchdog.
  messageListener([
    {key: 'protocol', value: 'moonlight-wmp/1'},
    {key: 'type', value: 'event'},
    {key: 'event', value: 'wmpSupervisorTerminated'},
    {key: 'detail', value: 'source=ApplicationManager.ApplicationTerminated appId=' + expectedServiceAppId + ' pid=4321 expected=false'}
  ]);
  assert.strictEqual(handledEvents.filter(event => event === 'streamTerminated: -1').length, 1,
    'a supervisor notification after an already-received native terminal event must not duplicate recovery');

  window.ESPlusPlayerTransport.close();
  assert.strictEqual(listenerRemoved, true);
  assert.strictEqual(statusListenerRemoved, true, 'closing the transport must remove the Tizen app status listener');
  const debugEntryCount = debugEntries.length;

  // Diagnostic output must be completely suppressed outside Debug builds.
  window.DEBUG_MODE = false;
  await window.ESPlusPlayerTransport.connect();
  await window.ESPlusPlayerTransport.ping();
  assert.strictEqual(debugEntries.length, debugEntryCount, 'ESPlusPlayer diagnostics must be Debug-only');
  window.ESPlusPlayerTransport.close();

  // A process exit without a native streamTerminated event must be reported
  // through the shared Moonlight termination path, without a JS watchdog.
  window.DEBUG_MODE = true;
  await window.ESPlusPlayerTransport.startStream({host: '192.168.0.10'});
  assert.strictEqual(handledEvents.filter(event => event === 'streamTerminated: -1').length, 1);
  runningServiceContexts = [];
  statusChangeListener(expectedServiceAppId, false);
  await Promise.resolve();
  assert.strictEqual(handledEvents.filter(event => event === 'streamTerminated: -1').length, 2,
    'an unexpected OS-reported ServiceApp exit must notify the shared stream termination handler');
  assert.ok(errorEntries.some(entry => entry[0] === '[esplusplayer] Native service process exited unexpectedly'),
    'unexpected native service termination must be written to the application error log');
  assert.ok(window.pendingStreamApiMessage.includes('exited unexpectedly'),
    'the unexpected process exit reason must be retained for the stream error dialog');

  // Exercise the supervisor as the first source of an unexpected termination.
  await window.ESPlusPlayerTransport.startStream({host: '192.168.0.10'});
  const beforeSupervisorTermination = handledEvents.filter(event => event === 'streamTerminated: -1').length;
  messageListener([
    {key: 'protocol', value: 'moonlight-wmp/1'},
    {key: 'type', value: 'event'},
    {key: 'event', value: 'wmpSupervisorTerminated'},
    {key: 'detail', value: 'source=ApplicationManager.ApplicationTerminated appId=' + expectedServiceAppId + ' pid=9876 expected=false'}
  ]);
  assert.strictEqual(handledEvents.filter(event => event === 'streamTerminated: -1').length,
    beforeSupervisorTermination + 1,
    'an unexpected supervisor event after accepted start_session must trigger shared UI recovery');
  assert.ok(window.pendingStreamApiMessage.includes('pid=9876'),
    'the supervisor termination details must be retained for the stream error dialog');

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
    /could not launch independent WMP supervisor: Application not found/
  );
  const launchFailureLog = JSON.stringify(debugEntries.slice(failureLogStart));
  assert.ok(launchFailureLog.includes('launching independent WMP process supervisor'));
  assert.ok(launchFailureLog.includes('NotFoundError'));
  assert.ok(launchFailureLog.includes('Application not found'));
  assert.ok(launchFailureLog.includes(expectedSupervisorAppId));

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
  assert.strictEqual(runningServiceContexts.length, 0,
    'a failed launch handshake must terminate the half-started WMP process and supervisor');

  console.log('ESPlusPlayer trusted MessagePort bridge tests passed.');
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
