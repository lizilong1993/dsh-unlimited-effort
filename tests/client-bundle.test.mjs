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

test('the capsule keeps the metrics measured from the reference art', () => {
  // 2.5:1 track, knob at 0.85 of the height, inset at 0.07 — see README.
  for (const needle of [
    'var TRACK_WIDTH = 50;',
    'var TRACK_HEIGHT = 20;',
    'var INSET = 2;',
    'var KNOB_SIZE = TRACK_HEIGHT - INSET * 2;',
    'var TRACK_RADIUS = TRACK_HEIGHT / 2;',
    'var GLYPH_SIZE = 13;',
  ]) {
    assert.ok(bundle.includes(needle), needle);
  }
  assert.ok(bundle.includes('borderRadius: String(TRACK_RADIUS)'), 'the end radius is half the height, so the ends are semicircles');
  assert.ok(bundle.includes("borderRadius: '50%'"), 'the knob is a circle, not a rounded square');
  assert.ok(bundle.includes("appearance: 'none'"), 'no UA button chrome can override the radius');
  assert.ok(bundle.includes("justifyContent: 'space-between'"), 'glyph and knob sit at opposite ends');
  assert.ok(bundle.includes("boxSizing: 'border-box'"), 'padding cannot grow the track');
});
