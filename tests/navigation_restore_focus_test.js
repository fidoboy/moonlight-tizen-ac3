'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const source = fs.readFileSync(
  path.join(__dirname, '../wasm/platform/navigation.js'),
  'utf8'
);
const pushStart = source.indexOf('function push(view, hostname, restoreNavigationFocus)');
assert.notStrictEqual(pushStart, -1, 'Navigation stack push implementation must exist');
const pushEnd = source.indexOf('\n    function change(view)', pushStart);
assert.notStrictEqual(pushEnd, -1, 'Navigation stack change implementation must follow push');
const pushImplementation = source.slice(pushStart, pushEnd);

assert.ok(
  /if \(restoreNavigationFocus\) \{\s*\/\*[\s\S]*?State\.start\(\);\s*hasFocus = true;/.test(pushImplementation),
  'Restoring modal navigation focus must also restart navigation input after streaming'
);

console.log('Navigation modal focus restoration tests passed.');
