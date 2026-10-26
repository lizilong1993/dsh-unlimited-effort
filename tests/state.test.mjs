import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { readState, statePath, writeState } from '../src/state.js';

const tempDir = () => fs.mkdtempSync(path.join(os.tmpdir(), 'unlimited-mode-'));

test('a missing file means off', () => {
  const file = path.join(tempDir(), 'unlimited-mode.json');
  assert.deepEqual(readState(file), { enabled: false });
});

test('write then read round-trips and leaves no temporary file', () => {
  const dir = tempDir();
  const file = statePath(dir);
  assert.deepEqual(writeState(file, { enabled: true }), { enabled: true });
  assert.deepEqual(readState(file), { enabled: true });
  assert.deepEqual(fs.readdirSync(dir), ['unlimited-mode.json']);
  assert.deepEqual(writeState(file, { enabled: false }), { enabled: false });
  assert.deepEqual(readState(file), { enabled: false });
});

test('a corrupted file reads as off instead of throwing', () => {
  const file = path.join(tempDir(), 'unlimited-mode.json');
  fs.writeFileSync(file, '{ not json', 'utf8');
  assert.deepEqual(readState(file), { enabled: false });
});

test('only a literal true turns the mode on', () => {
  const file = path.join(tempDir(), 'unlimited-mode.json');
  fs.writeFileSync(file, JSON.stringify({ enabled: 'yes' }), 'utf8');
  assert.deepEqual(readState(file), { enabled: false });
});
