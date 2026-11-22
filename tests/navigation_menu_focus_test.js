'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const source = fs.readFileSync(
  path.join(__dirname, '../wasm/platform/navigation.js'),
  'utf8'
);

const closeStart = source.indexOf('function closeActiveVisibleMenu(menuId)');
assert.notStrictEqual(closeStart, -1, 'Shared popup dismissal must exist');
const closeEnd = source.indexOf('// Handle the state of the IP address', closeStart);
assert.notStrictEqual(closeEnd, -1, 'Popup dismissal must end before IP field handling');
const closeImplementation = source.slice(closeStart, closeEnd);

assert.match(
  closeImplementation,
  /if \(navigationMenuClosePending\) return false/,
  'Re-entrant popup dismissal must not pop the navigation stack twice'
);
assert.match(
  closeImplementation,
  /Navigation\.pop\(\)/,
  'A successfully dismissed popup must remove its navigation view'
);
assert.match(
  closeImplementation,
  /function closePopupMenu\(id\) \{\s*return closeActiveVisibleMenu\(id\);\s*\}/,
  'Closing a named popup must not click its trigger and invoke a second pop'
);
assert.doesNotMatch(
  closeImplementation,
  /clickElement\(id\)/,
  'Popup dismissal must not activate the trigger click handler'
);

const focusStart = source.indexOf('function focusElement(target)');
const focusEnd = source.indexOf('// Safely remove focus', focusStart);
assert.notStrictEqual(focusStart, -1, 'Central focus helper must exist');
const focusImplementation = source.slice(focusStart, focusEnd);
assert.ok(
  focusImplementation.indexOf('if (!element)') < focusImplementation.indexOf('blurElement(previousActiveElement)'),
  'An unresolved focus target must not clear the existing focus'
);
assert.match(
  focusImplementation,
  /if \(previousActiveElement !== element\) \{\s*blurElement\(previousActiveElement\);/,
  'Focusing the already active element must not blur it first'
);

assert.match(
  source,
  /const menu = document\.querySelector\('\.mouseEmulationStickMenu'\);\s*return menu \? menu\.children : \[\];/,
  'The mouse-stick menu view must tolerate a missing menu element'
);

console.log('Navigation popup dismissal and focus safety tests passed.');
