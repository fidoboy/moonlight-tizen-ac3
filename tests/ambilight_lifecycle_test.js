'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const source = fs.readFileSync(path.join(__dirname, '../wasm/platform/ambilight.js'), 'utf8');

function createEnvironment(platformVersion) {
  let running = [];
  let nextId = 0;
  const commands = [];
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
  assert.deepStrictEqual(env.commands, ['initialize']);
  assert.strictEqual(env.running().length, 0,
    'the capability probe must leave no resident Ambilight process');

  env.addStaleService();
  await env.api.start('192.168.0.100', 21324, 73);
  assert.deepStrictEqual(env.killed, ['stale-ambilight'],
    'a stale service process must be killed before the new stream starts');
  assert.deepStrictEqual(env.commands, ['initialize', 'start']);
  assert.strictEqual(env.running().length, 1);
  assert.strictEqual(env.api.isActive(), true);

  await env.api.start('192.168.0.100', 21324, 73);
  assert.strictEqual(env.killed.length, 2,
    'restarting Ambilight during a stream must replace the existing process');
  assert.strictEqual(env.commands.filter(command => command === 'start').length, 2);

  await env.api.shutdown();
  assert.strictEqual(env.running().length, 0,
    'stream shutdown must leave no Ambilight service process running');
  assert.strictEqual(env.api.isActive(), false);

  const tizen60 = createEnvironment('6.0');
  assert.strictEqual(await tizen60.api.initialize(), true,
    'Tizen 6.0 must pass the minimum platform version check');
  assert.deepStrictEqual(tizen60.commands, ['initialize']);
  assert.strictEqual(tizen60.running().length, 0,
    'the Tizen 6.0 capability probe must leave no resident service process');

  const unsupported = createEnvironment('5.5');
  assert.strictEqual(await unsupported.api.initialize(), false);
  assert.deepStrictEqual(unsupported.commands, [],
    'platforms below Tizen 6.0 must not launch the optional service');

  console.log('Ambilight service lifecycle tests passed.');
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
