import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { MAX_SESSIONS, emptyState, isEnabled, readState, setEnabled, statePath } from '../src/state.js';

const tempDir = () => fs.mkdtempSync(path.join(os.tmpdir(), 'unlimited-mode-'));

test('a missing file records nothing, so every Session is off', () => {
  const file = path.join(tempDir(), 'unlimited-mode.json');
  assert.deepEqual(readState(file), emptyState());
  assert.equal(isEnabled(readState(file), 's1'), false);
});

test('state is per Session: one Session cannot switch another on', () => {
  const dir = tempDir();
  const file = statePath(dir);
  let state = readState(file);
  state = setEnabled(file, state, 'session-a', true);
  assert.equal(isEnabled(state, 'session-a'), true);
  assert.equal(isEnabled(state, 'session-b'), false);
  assert.deepEqual(readState(file), state);
});

test('switching off removes the record rather than storing false', () => {
  const dir = tempDir();
  const file = statePath(dir);
  let state = setEnabled(file, readState(file), 'session-a', true);
  state = setEnabled(file, state, 'session-a', false);
  assert.deepEqual(state.sessions, {});
  assert.deepEqual(fs.readdirSync(dir), ['unlimited-mode.json'], 'no temporary file survives');
});

test('recording requires a Session id', () => {
  const file = path.join(tempDir(), 'unlimited-mode.json');
  assert.throws(() => setEnabled(file, emptyState(), '', true), /Session id is required/);
  assert.throws(() => setEnabled(file, emptyState(), undefined, true), /Session id is required/);
});

test('a corrupted or legacy file reads as nothing recorded', () => {
  const dir = tempDir();
  const file = path.join(dir, 'unlimited-mode.json');
  fs.writeFileSync(file, '{ not json', 'utf8');
  assert.deepEqual(readState(file), emptyState());
  fs.writeFileSync(file, JSON.stringify({ enabled: true }), 'utf8');
  assert.deepEqual(readState(file), emptyState(), 'the legacy global flag must not switch new Sessions on');
  fs.writeFileSync(file, JSON.stringify({ version: 2, sessions: { a: true, b: 'yes', '': true } }), 'utf8');
  assert.deepEqual(readState(file).sessions, { a: true });
});

test('the recorded Session map is bounded', () => {
  const dir = tempDir();
  const file = statePath(dir);
  let state = emptyState();
  for (let index = 0; index < MAX_SESSIONS + 5; index += 1) state = setEnabled(file, state, 's' + String(index), true);
  assert.equal(Object.keys(state.sessions).length, MAX_SESSIONS);
  assert.equal(isEnabled(state, 's0'), false, 'the oldest record is dropped');
  assert.equal(isEnabled(state, 's' + String(MAX_SESSIONS + 4)), true);
});
