import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { EFFORT_RANK } from '../src/shared/decide.js';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const bundle = fs.readFileSync(path.join(root, 'lib', 'client.js'), 'utf8');

test('the built bundle is the Harness client-module envelope', () => {
  assert.match(bundle, /^window\.__ModuleLoader__\.load\(\{ id: "dsh-unlimited-effort", factory: \(require\) => \{/);
  assert.match(bundle, /var React = require\("react"\);/);
  assert.match(bundle, /return module\.exports; \} \}\);/);
});

test('the bundle carries the inlined rank table, so a rebuild cannot drift silently', () => {
  for (const [id, rank] of Object.entries(EFFORT_RANK)) {
    assert.ok(bundle.includes(id + ': ' + String(rank) + ','), id + ' rank ' + String(rank));
  }
});

test('the bundle keeps the placement contract', () => {
  assert.ok(bundle.includes('conversation.input.right'));
  assert.ok(bundle.includes('order: 1'));
  assert.ok(bundle.includes('#924FF7'));
});

test('the bundle talks to the host per Session', () => {
  assert.ok(bundle.includes('?sessionId='), 'the read path names the Session');
  assert.ok(bundle.includes('sessionId: sessionId'), 'the write body names the Session');
  assert.ok(bundle.includes('writeHostState(sessionId, false)'), 'dropping below the top tier switches off');
});

test('the switch is drawn as exact SVG geometry', () => {
  for (const needle of [
    'var TRACK_WIDTH = 50;',
    'var TRACK_HEIGHT = 20;',
    'var INSET = 2;',
    'var TRACK_RADIUS = TRACK_HEIGHT / 2;',
    'var KNOB_RADIUS = (TRACK_HEIGHT - INSET * 2) / 2;',
  ]) {
    assert.ok(bundle.includes(needle), needle);
  }
  // a rect whose rx is half its height, and a real circle for the knob
  assert.ok(bundle.includes("rx: String(TRACK_RADIUS)"), 'the track ends are semicircles by construction');
  assert.ok(bundle.includes("r: String(KNOB_RADIUS)"), 'the knob is an SVG circle');
  assert.ok(bundle.includes("viewBox: '0 0 ' + String(TRACK_WIDTH)"), 'one viewBox owns the geometry');
  assert.ok(!bundle.includes("borderRadius: '50%'"), 'no CSS circle can be reinterpreted as a squircle');
});

test('placement stays in normal flow', () => {
  assert.ok(bundle.includes('conversation.input.right'));
  assert.ok(bundle.includes('order: 1'));
  assert.ok(!bundle.includes('position: \'absolute\''), 'the button is never absolutely positioned');
});
