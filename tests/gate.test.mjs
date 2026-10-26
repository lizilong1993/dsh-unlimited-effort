import assert from 'node:assert/strict';
import test from 'node:test';
import { currentEffort, makeGate, sessionIdOf } from '../src/gate.js';

const cfg = { enabled: true, topEffortIds: ['max', 'xhigh'] };
const contextFor = (effort, sessionId = 'session-a') => ({
  agent: { id: sessionId, options: { reasoningEffort: effort } },
});

test('sessionIdOf reads agent.session.id first, then agent.id', () => {
  assert.equal(sessionIdOf({ agent: { id: 'a', session: { id: 'b' } } }), 'b');
  assert.equal(sessionIdOf({ agent: { id: 'a' } }), 'a');
  assert.equal(sessionIdOf({ agent: {} }), undefined);
  assert.equal(sessionIdOf(undefined), undefined);
});

test('the gate needs plugin on, this Session on and a top effort', () => {
  const on = makeGate(cfg, (sid) => sid === 'session-a');
  assert.equal(on(contextFor('max')), true);
  assert.equal(on(contextFor('xhigh')), true);
  assert.equal(on(contextFor('high')), false);
  assert.equal(on(contextFor('max', 'session-b')), false, 'another Session must not be switched on');
  assert.equal(makeGate(cfg, () => false)(contextFor('max')), false);
  assert.equal(makeGate({ ...cfg, enabled: false }, () => true)(contextFor('max')), false);
});

test('currentEffort prefers the live selection over the logged header', () => {
  const context = { agent: { options: { reasoningEffort: 'max' }, session: { requestHeader: () => ({ config: { reasoningEffort: 'low' } }) } } };
  assert.equal(currentEffort(context), 'max');
});

test('currentEffort falls back to the logged header', () => {
  const context = { agent: { session: { requestHeader: () => ({ config: { reasoningEffort: 'xhigh' } }) } } };
  assert.equal(currentEffort(context), 'xhigh');
});

test('the gate never throws, whatever the context looks like', () => {
  const on = makeGate(cfg, () => true);
  const hostile = { agent: { get options() { throw new Error('boom'); }, session: { requestHeader() { throw new Error('boom'); } } } };
  assert.equal(on(hostile), false);
  assert.equal(on(undefined), false);
  assert.equal(on({}), false);
  assert.equal(makeGate(cfg, () => { throw new Error('boom'); })(contextFor('max')), false);
});
