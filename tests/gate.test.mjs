import assert from 'node:assert/strict';
import test from 'node:test';
import { currentEffort, makeGate } from '../src/gate.js';

const cfg = { enabled: true, topEffortIds: ['max', 'xhigh'] };
const contextWith = (effort) => ({ agent: { options: { reasoningEffort: effort } } });

test('the gate needs plugin on, switch on and a top effort', () => {
  const on = makeGate(cfg, () => true);
  assert.equal(on(contextWith('max')), true);
  assert.equal(on(contextWith('xhigh')), true);
  assert.equal(on(contextWith('high')), false);
  assert.equal(on(contextWith(undefined)), false);
  assert.equal(makeGate(cfg, () => false)(contextWith('max')), false);
  assert.equal(makeGate({ ...cfg, enabled: false }, () => true)(contextWith('max')), false);
});

test('currentEffort prefers the live selection over the logged header', () => {
  const context = {
    agent: {
      options: { reasoningEffort: 'max' },
      session: { requestHeader: () => ({ config: { reasoningEffort: 'low' } }) },
    },
  };
  assert.equal(currentEffort(context), 'max');
});

test('currentEffort falls back to the logged header', () => {
  const context = { agent: { session: { requestHeader: () => ({ config: { reasoningEffort: 'xhigh' } }) } } };
  assert.equal(currentEffort(context), 'xhigh');
});

test('the gate never throws, whatever the context looks like', () => {
  const on = makeGate(cfg, () => true);
  const hostile = {
    agent: {
      get options() { throw new Error('boom'); },
      session: { requestHeader() { throw new Error('boom'); } },
    },
  };
  assert.equal(on(hostile), false);
  assert.equal(on(undefined), false);
  assert.equal(on({}), false);
  assert.equal(makeGate(cfg, () => { throw new Error('boom'); })(contextWith('max')), false);
});
