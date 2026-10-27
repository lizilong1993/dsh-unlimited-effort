import assert from 'node:assert/strict';
import test from 'node:test';
import { EFFORT_RANK, effortIds, isTopEffort, shouldAutoOff, strongestEffort } from '../src/shared/decide.js';

test('EFFORT_RANK orders the known adapter levels', () => {
  assert.ok(EFFORT_RANK.max > EFFORT_RANK.xhigh);
  assert.ok(EFFORT_RANK.xhigh > EFFORT_RANK.high);
  assert.ok(EFFORT_RANK.high > EFFORT_RANK.low);
  assert.equal(EFFORT_RANK.off, 0);
});

test('effortIds keeps adapter order, accepts objects and strings, drops duplicates', () => {
  assert.deepEqual(effortIds({ efforts: [{ id: 'off' }, { id: 'max' }, 'max'] }), ['off', 'max']);
  assert.deepEqual(effortIds(undefined), []);
  assert.deepEqual(effortIds({}), []);
});

test('strongestEffort picks max over xhigh regardless of order', () => {
  assert.equal(strongestEffort({ efforts: [{ id: 'max' }, { id: 'high' }] }), 'max');
  assert.equal(strongestEffort({ efforts: [{ id: 'xhigh' }, { id: 'max' }] }), 'max');
  assert.equal(strongestEffort({ efforts: [{ id: 'low' }, { id: 'high' }] }), 'high');
});

test('strongestEffort falls back to the last advertised id when ranks are unknown', () => {
  assert.equal(strongestEffort({ efforts: [{ id: 'alpha' }, { id: 'beta' }] }), 'beta');
  assert.equal(strongestEffort({ efforts: [] }), undefined);
});

test('isTopEffort is strict about the configured set', () => {
  assert.equal(isTopEffort('max', ['max', 'xhigh']), true);
  assert.equal(isTopEffort('high', ['max', 'xhigh']), false);
  assert.equal(isTopEffort(undefined, ['max']), false);
  assert.equal(isTopEffort('max', []), false);
  assert.equal(isTopEffort('max', undefined), false);
});

test('a known effort below the top tier switches an active switch off', () => {
  const top = ['max', 'xhigh'];
  assert.equal(shouldAutoOff(true, 'high', top), true);
  assert.equal(shouldAutoOff(true, 'low', top), true);
  assert.equal(shouldAutoOff(true, 'max', top), false);
  assert.equal(shouldAutoOff(true, 'xhigh', top), false);
});

test('an unknown effort is not "below the top tier"', () => {
  assert.equal(shouldAutoOff(true, undefined, ['max']), false);
  assert.equal(shouldAutoOff(true, '', ['max']), false);
});

test('an already-off switch is never switched off again', () => {
  assert.equal(shouldAutoOff(false, 'high', ['max']), false);
  assert.equal(shouldAutoOff(undefined, 'high', ['max']), false);
});
