import { readFileSync } from "node:fs";
import assert from "node:assert/strict";

const html = readFileSync("docs/index.html", "utf8");
const script = readFileSync("docs/assets/language-switcher.js", "utf8");

assert.match(html, /id=["']language-picker["']/,
  "index.html must contain the language picker container");
assert.match(html, /<button[^>]*id=["']language-trigger["'][^>]*>/,
  "index.html must contain the language trigger button");
assert.match(html, /id=["']language-trigger["'][^>]*aria-controls=["']language-menu["']/,
  "the trigger must reference the language menu through aria-controls");
assert.match(html, /<div[^>]*id=["']language-menu["'][^>]*hidden[^>]*>/,
  "the language menu must exist and start hidden");
assert.match(html, /<script[^>]+src=["'][^"']*assets\/language-switcher\.js(?:\?[^"']*)?["']/,
  "index.html must load the language-switcher script");

assert.match(html, /\.language-menu\\[hidden\\]\\s*\\{\\s*display:\\s*none;/,
  "the hidden language menu must remain visually hidden");

assert.match(script, /function renderLanguagePicker\s*\(/,
  "the language picker renderer must exist");
assert.match(script, /document\.getElementById\(["']language-trigger["']\)/,
  "the renderer must bind to the trigger element");
assert.match(script, /document\.getElementById\(["']language-menu["']\)/,
  "the renderer must bind to the menu element");
assert.match(script, /trigger\.addEventListener\(["']click["']/,
  "the trigger must have a click handler");
assert.match(script, /if\s*\(menu\.hidden\)\s*openMenu\(/,
  "clicking the trigger must open a hidden menu");
assert.match(script, /menu\.hidden\s*=\s*false/,
  "the open handler must reveal the menu");
assert.match(script, /menu\.hidden\s*=\s*true/,
  "the close handler must hide the menu");
assert.match(script, /trigger\.setAttribute\(["']aria-expanded["']\s*,\s*["']true["']\)/,
  "opening the menu must update aria-expanded");
assert.match(script, /trigger\.setAttribute\(["']aria-expanded["']\s*,\s*["']false["']\)/,
  "closing the menu must update aria-expanded");

console.log("Language picker regression checks passed.");
