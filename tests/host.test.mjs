/**
 * Mount the real host half against a fake Cordis context. This is the closest
 * check to a live boot: it proves the section, the variable and the loopback
 * route are wired with the expected shapes, and that the notice only appears
 * under the documented conditions.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

const home = fs.mkdtempSync(path.join(os.tmpdir(), 'unlimited-host-'));
process.env.DSH_HOME = home;

const { apply, ROUTE_STATE } = await import('../src/index.js');
const { statePath, writeState } = await import('../src/state.js');

/** A context that records every registration the plugin makes. */
function fakeContext() {
  const sections = [];
  const variables = [];
  const routes = [];
  const effects = [];
  const ctx = {
    sections,
    variables,
    routes,
    effect(factory, label) {
      const disposer = factory();
      effects.push({ label, disposer });
      return () => {};
    },
    inject(services, run) {
      if (services.includes('webServer')) run({ webServer: { register: (route) => (routes.push(route), () => {}) }, effect: ctx.effect });
    },
    systemPrompt: {
      section: (entry) => (sections.push(entry), () => {}),
      variable: (name, provider) => (variables.push({ name, provider }), () => {}),
    },
    logger: { info() {}, warn() {} },
  };
  return ctx;
}

const callRoute = async (route, request) => {
  let status = 0;
  let body = '';
  const response = {
    setHeader() {},
    end(text) { body = text; },
    set statusCode(value) { status = value; },
    get statusCode() { return status; },
  };
  await route.handler(request, response);
  return { status, body: body.length > 0 ? JSON.parse(body) : undefined };
};

test('mount registers exactly one section, one variable and one state route', () => {
  writeState(statePath(home), { enabled: false });
  const ctx = fakeContext();
  apply(ctx, {});
  assert.equal(ctx.sections.length, 1);
  assert.equal(ctx.sections[0].name, 'external:unlimited-mode');
  assert.equal(ctx.sections[0].order, 10250);
  assert.equal(ctx.sections[0].interpolate, false);
  assert.equal(ctx.variables.length, 1);
  assert.equal(ctx.variables[0].name, 'unlimited_notice');
  assert.equal(ctx.routes.length, 1);
  assert.equal(ctx.routes[0].kind, 'exact');
  assert.equal(ctx.routes[0].path, ROUTE_STATE);
});

test('the notice appears only for a top effort with the switch on', () => {
  const file = statePath(home);
  writeState(file, { enabled: false });
  const ctx = fakeContext();
  apply(ctx, {});
  const text = ctx.sections[0].text;
  const max = { agent: { options: { reasoningEffort: 'max' } } };
  const high = { agent: { options: { reasoningEffort: 'high' } } };

  assert.equal(text(max), '', 'switch off must stay silent even at max');
  writeState(file, { enabled: true });
  // the section reads the switch through the same file the route writes
  const ctx2 = fakeContext();
  apply(ctx2, {});
  const text2 = ctx2.sections[0].text;
  assert.match(text2(max), /unlimited/);
  assert.equal(text2(high), '');
  assert.equal(text2(undefined), '');
  assert.equal(ctx2.variables[0].provider(max), text2(max));
});

test('a custom topEffortIds set and notice are honoured', () => {
  writeState(statePath(home), { enabled: true });
  const ctx = fakeContext();
  apply(ctx, { topEffortIds: ['high'], notice: 'BUDGET IS UNLIMITED' });
  const text = ctx.sections[0].text;
  assert.equal(text({ agent: { options: { reasoningEffort: 'max' } } }), '');
  assert.equal(text({ agent: { options: { reasoningEffort: 'high' } } }), 'BUDGET IS UNLIMITED');
});

test('an invalid variable name fails loud at mount', () => {
  const ctx = fakeContext();
  assert.throws(() => apply(ctx, { variableName: 'Not Valid' }), /invalid prompt variable name/);
});

test('the state route reads, writes and rejects non-loopback or bad bodies', async () => {
  writeState(statePath(home), { enabled: false });
  const ctx = fakeContext();
  apply(ctx, {});
  const route = ctx.routes[0];
  const loopback = { socket: { remoteAddress: '127.0.0.1' }, method: 'GET' };

  const read = await callRoute(route, { ...loopback });
  assert.equal(read.status, 200);
  assert.equal(read.body.ok, true);
  assert.equal(read.body.enabled, false);
  assert.deepEqual(read.body.topEffortIds, ['max', 'xhigh']);

  const write = await callRoute(route, {
    socket: { remoteAddress: '::1' },
    method: 'POST',
    async *[Symbol.asyncIterator]() { yield Buffer.from('{"enabled":true}'); },
  });
  assert.equal(write.status, 200);
  assert.equal(write.body.enabled, true);
  assert.deepEqual(JSON.parse(fs.readFileSync(statePath(home), 'utf8')), { enabled: true });

  const remote = await callRoute(route, { socket: { remoteAddress: '10.1.2.3' }, method: 'GET' });
  assert.equal(remote.status, 403);

  const bad = await callRoute(route, {
    socket: { remoteAddress: '127.0.0.1' },
    method: 'POST',
    async *[Symbol.asyncIterator]() { yield Buffer.from('{"enabled":"yes"}'); },
  });
  assert.equal(bad.status, 400);
  assert.deepEqual(JSON.parse(fs.readFileSync(statePath(home), 'utf8')), { enabled: true }, 'a rejected body must not change state');
});
