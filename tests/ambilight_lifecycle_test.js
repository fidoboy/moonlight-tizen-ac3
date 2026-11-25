'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const source = fs.readFileSync(path.join(__dirname, '../wasm/platform/ambilight.js'), 'utf8');
const platformSource = fs.readFileSync(path.join(__dirname, '../wasm/platform/index.js'), 'utf8');
const messagesSource = fs.readFileSync(path.join(__dirname, '../wasm/platform/messages.js'), 'utf8');
const ppiSource = fs.readFileSync(path.join(__dirname, '../ambilight-service/PpiCapture.cs'), 'utf8');
const serviceSource = fs.readFileSync(path.join(__dirname, '../ambilight-service/Program.cs'), 'utf8');
const samplerSource = fs.readFileSync(path.join(__dirname, '../ambilight-service/PpiSampler.cs'), 'utf8');
const outputSource = fs.readFileSync(path.join(__dirname, '../ambilight-service/WledOutput.cs'), 'utf8');

// Startup-order regression checks: both engines publish readiness into one
// coordinator, and only that coordinator may launch the optional service.
assert.strictEqual(platformSource.split('moonlightAmbilight.start(').length - 1, 1,
  'there must be exactly one automatic Ambilight service start call');
assert(platformSource.includes('window._streamConnectionEstablished !== true') &&
  platformSource.includes('window._ambilightNegotiatedProfileReady !== true'),
  'the coordinator must wait for both connection and negotiated-profile readiness');
assert(platformSource.includes('if (ambilightStreamStartPromise) return ambilightStreamStartPromise;'),
  'concurrent readiness notifications must share one in-flight startup');
assert(platformSource.includes("preference.ambilightEnabled === true"),
  'the coordinator must require the persisted Ambilight enabled preference');
assert(platformSource.includes('var profile = window._ambilightColorProfile;') &&
  !platformSource.includes('var profile = window._ambilightColorProfile ||'),
  'the service must receive the negotiated profile, never a guessed fallback');
assert(platformSource.includes("readAmbilightStoredValue('ambilightCaptureBackend')") &&
  platformSource.includes("backendData.ambilightCaptureBackend === 'ppi'") &&
  platformSource.includes('profile, captureBackend'),
  'the stream coordinator must honor only an explicit persisted PPI backend selection');
assert(messagesSource.includes("msg.indexOf('AmbilightProfile: ') === 0") &&
  messagesSource.includes("msg === 'Connection Established'") &&
  messagesSource.includes('window.notifyAmbilightStreamReadinessChanged(false);'),
  'both engines must converge through the common readiness coordinator');
assert(messagesSource.includes('resetAmbilightStreamStartupState()'),
  'stream boundaries must reset the coordinator idempotency state');

// PPI remains an explicit diagnostic backend until hardware validation is complete.
assert(ppiSource.includes('libvideoenhance.so') &&
  ppiSource.includes('ppi_ve') && ppiSource.includes('cs_ve'),
  'PPI must resolve the supported Samsung export families');
assert(ppiSource.includes('Slots > MaxSlots') &&
  ppiSource.includes('slot >= Slots') &&
  ppiSource.includes('x >= MeasureWidth') && ppiSource.includes('y >= MeasureHeight'),
  'PPI must validate reported capabilities, slot indexes and measurement coordinates');
assert(ppiSource.includes('lock (Gate)') &&
  ppiSource.includes('Thread.Sleep(SettleMs)'),
  'PPI native reads must be serialized and respect the TV-reported settle interval');
assert(serviceSource.includes('command, "ppi-probe"') &&
  serviceSource.includes('PpiCapture.Read(0, x, y)'),
  'PPI initialization and one-shot reading must be explicitly diagnosable');
assert(samplerSource.includes('PpiCapture.ReadBatch(bx, by)') &&
  samplerSource.includes('new Thread(Run)') && samplerSource.includes('TrySnapshot'),
  'continuous PPI sampling must use a dedicated thread and non-blocking snapshots');
assert(outputSource.includes('BuildPpiFrame(byte[] spotsRgb, bool[] valid, int ledCount)') &&
  outputSource.includes('FindValid(valid, left, -1)') &&
  outputSource.includes('Blend(_previous[offset], red)'),
  'PPI spot RGB must interpolate around the perimeter and share temporal output smoothing');
assert(serviceSource.includes('captureBackend') &&
  serviceSource.includes('selected, PpiCapture.BackendName') &&
  serviceSource.includes('PpiCapture.Shutdown()'),
  'PPI must be selected explicitly and released during service shutdown');
assert(!serviceSource.includes('PpiCapture.Read(') ||
  serviceSource.indexOf('PpiCapture.Read(') > serviceSource.indexOf('command, "ppi-probe"'),
  'PPI reads must not be wired into the automatic video-plane capture loop');

function createEnvironment(platformVersion) {
  let running = [];
  let nextId = 0;
  const commands = [];
  const payloads = [];
  const killed = [];

  function ApplicationControl(operation, uri, mime, category, data) {
    this.operation = operation;
    this.data = data;
  }
  function ApplicationControlData(key, value) {
    this.key = key;
    this.value = value;
  }

  const tizen = {
    systeminfo: {
      getCapability() { return platformVersion; }
    },
    ApplicationControl,
    ApplicationControlData,
    application: {
      getAppsContext(success) { success(running.slice()); },
      kill(contextId, success) {
        killed.push(contextId);
        running = running.filter(context => context.id !== contextId);
        success();
      },
      launchAppControl(control, appId, success, failure, reply) {
        const values = {};
        control.data.forEach(item => { values[item.key] = item.value[0]; });
        const command = values.command;
        commands.push(command);
        payloads.push(values);
        let context = running.find(item => item.appId === appId);
        if (!context) {
          context = {id: 'ambilight-' + (++nextId), appId};
          running.push(context);
        }
        success();
        setTimeout(() => {
          let replyData;
          if (command === 'initialize' || command === 'start') {
            replyData = [
              {key: 'ok', value: ['true']},
              {key: 'supported', value: ['true']}
            ];
          } else {
            replyData = [{key: 'ok', value: ['true']}];
          }
          reply.onsuccess(replyData);
          if (command === 'initialize' || command === 'shutdown') {
            running = running.filter(item => item.id !== context.id);
          }
        }, 0);
      }
    }
  };
  const window = {tizen, setTimeout, clearTimeout, console};
  vm.runInNewContext(source, {window, tizen, Promise, console, isFinite});
  return {
    api: window.moonlightAmbilight,
    commands,
    payloads,
    killed,
    addStaleService() {
      running.push({id: 'stale-ambilight', appId: 'MoonLightS.MoonlightAmbilight'});
    },
    running() { return running.slice(); }
  };
}

(async function() {
  const env = createEnvironment('6.5');
  assert.strictEqual(await env.api.initialize(), true);
  assert.deepStrictEqual(env.commands, [],
    'the Tizen-version compatibility check must never launch the native service');
  assert.strictEqual(env.running().length, 0,
    'compatibility detection must not create a resident Ambilight process');

  await env.api.start('192.168.0.100', 21324, 73, {
    hdr: true,
    colorSpace: 2,
    fullRange: false,
    captureBackend: 'video_plane'
  });
  assert.deepStrictEqual(env.payloads[0], {
    command: 'start',
    wledIp: '192.168.0.100',
    wledPort: '21324',
    ledCount: '73',
    hdr: 'true',
    colorSpace: '2',
    fullRange: 'false',
    captureBackend: 'video_plane'
  }, 'the negotiated HDR profile and default capture backend must be forwarded to the service');
  assert.deepStrictEqual(env.killed, [],
    'starting this stream must not kill a service process it did not start');
  assert.deepStrictEqual(env.commands, ['start']);
  assert.strictEqual(env.running().length, 1);
  assert.strictEqual(env.api.isActive(), true);

  await env.api.start('192.168.0.100', 21324, 73, null, 'ppi');
  assert.strictEqual(env.payloads[1].captureBackend, 'ppi',
    'PPI must be selectable explicitly through the AppControl API');
  assert.strictEqual(env.killed.length, 0,
    'restarting Ambilight must not kill unrelated service processes');
  assert.strictEqual(env.commands.filter(command => command === 'start').length, 2);

  await env.api.shutdown();
  assert.strictEqual(env.running().length, 0,
    'stream shutdown must leave no Ambilight service process running');
  assert.strictEqual(env.api.isActive(), false);

  const tizen60 = createEnvironment('6.0');
  assert.strictEqual(await tizen60.api.initialize(), true,
    'Tizen 6.0 must pass the minimum platform version check');
  assert.deepStrictEqual(tizen60.commands, [], 'Tizen 6.0 version check must not launch the service');
  assert.strictEqual(tizen60.running().length, 0,
    'the Tizen 6.0 capability probe must leave no resident service process');

  const unsupported = createEnvironment('5.5');
  assert.strictEqual(await unsupported.api.initialize(), false);
  assert.deepStrictEqual(unsupported.commands, [],
    'platforms below Tizen 6.0 must not launch the optional service');

  const noService = createEnvironment('6.5');
  assert.strictEqual(await noService.api.initialize(), true);
  assert.deepStrictEqual(noService.commands, [],
    'compatibility detection must not inspect or launch the service');
  assert.strictEqual(await noService.api.shutdown(), false,
    'shutdown must be a no-op unless this app instance started the service');
  assert.deepStrictEqual(noService.killed, [],
    'shutdown must never kill a service that this app instance did not start');

  console.log('Ambilight service lifecycle tests passed.');
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
