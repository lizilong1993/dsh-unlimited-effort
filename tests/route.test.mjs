import assert from 'node:assert/strict';
import { PassThrough } from 'node:stream';
import test from 'node:test';
import { MAX_BODY, isLoopback, readJson } from '../src/route.js';

test('isLoopback accepts every loopback spelling and nothing else', () => {
  for (const address of ['127.0.0.1', '::1', '::ffff:127.0.0.1']) {
    assert.equal(isLoopback({ socket: { remoteAddress: address } }), true, address);
  }
  for (const address of ['10.0.0.2', '::ffff:10.0.0.2', '', undefined]) {
    assert.equal(isLoopback({ socket: { remoteAddress: address } }), false, String(address));
  }
  assert.equal(isLoopback(undefined), false);
});

const bodyOf = (text) => {
  const stream = new PassThrough();
  stream.end(text);
  return stream;
};

test('readJson parses a small object', async () => {
  assert.deepEqual(await readJson(bodyOf('{"enabled":true}')), { enabled: true });
});

test('readJson rejects malformed JSON, arrays and oversized bodies', async () => {
  assert.equal(await readJson(bodyOf('nope')), undefined);
  assert.equal(await readJson(bodyOf('[1,2]')), undefined);
  assert.equal(await readJson(bodyOf(JSON.stringify({ padding: 'x'.repeat(MAX_BODY) }))), undefined);
});
