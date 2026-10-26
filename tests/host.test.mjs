/**
 * Mount the real host half against a fake Cordis context. This is the closest
 * check to a live boot: it proves the section, the variable, the loopback route
 * and the auto-off waterfall are wired with the expected shapes, and that the
 * notice only appears under the documented conditions for the right Session.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

const home = fs.mkdtempSync(path.join(os.tmpdir(), 'unlimited-host-'));
process.env.DSH_HOME = home;

const { apply, ROUTE_STATE } = await import('../src/index.js');
const { isEnabled, readState, setEnabled, statePath } = await import('../src/state.js');

const stateFile = statePath(home);
const reset = () => fs.rmSync(stateFile, { force: true });
const record = (sessionId, enabled) => setEnabled(stateFile, readState(stateFile), sessionId, enabled);

/** A context that records every registration the plugin makes. */
function fakeContext() {
  const sections = [];
  const variables = [];
  const routes = [];
  const listeners = new Map();
  const ctx = {
    sections,
    variables,
    routes,
    listeners,
    effect(factory) {
      factory();
      return () => {};
    },
    on(name, handler) {
      if (!listeners.has(name)) listeners.set(name, []);
      listeners.get(name).push(handler);
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
  await route.handler({ url: ROUTE_STATE, ...request }, response);
  return { status, body: body.length > 0 ? JSON.parse(body) : undefined };
};

const post = (payload) => ({
  socket: { remoteAddress: '127.0.0.1' },
  method: 'POST',
  async *[Symbol.asyncIterator]() { yield Buffer.from(JSON.stringify(payload)); },
});

test('mount registers one section, one variable, one route and one request listener', () => {
  reset();
  const ctx = fakeContext();
  apply(ctx, {});
  assert.equal(ctx.sections.length, 1);
  assert.equal(ctx.sections[0].name, 'external:unlimited-mode');
  assert.equal(ctx.sections[0].order, 10250);
  assert.equal(ctx.sections[0].interpolate, false);
  assert.deepEqual(ctx.variables.map((v) => v.name), ['unlimited_notice']);
  assert.equal(ctx.routes[0].kind, 'exact');
  assert.equal(ctx.routes[0].path, ROUTE_STATE);
  assert.equal(ctx.listeners.get('agent/request').length, 1);
});

test('the notice appears only for a top effort in a Session that switched it on', () => {
  reset();
  record('session-a', true);
  const ctx = fakeContext();
  apply(ctx, {});
  const text = ctx.sections[0].text;
  const contextFor = (effort, sessionId) => ({ agent: { id: sessionId, options: { reasoningEffort: effort } } });

  assert.match(text(contextFor('max', 'session-a')), /unlimited/);
  assert.equal(text(contextFor('high', 'session-a')), '', 'below the top tier stays silent');
  assert.equal(text(contextFor('max', 'session-b')), '', 'another Session must not inherit the switch');
  assert.equal(text(undefined), '');
  assert.equal(ctx.variables[0].provider(contextFor('max', 'session-a')), text(contextFor('max', 'session-a')));
});

test('a custom topEffortIds set and notice are honoured', () => {
  reset();
  record('session-a', true);
  const ctx = fakeContext();
  apply(ctx, { topEffortIds: ['high'], notice: 'BUDGET IS UNLIMITED' });
  const text = ctx.sections[0].text;
  assert.equal(text({ agent: { id: 'session-a', options: { reasoningEffort: 'max' } } }), '');
  assert.equal(text({ agent: { id: 'session-a', options: { reasoningEffort: 'high' } } }), 'BUDGET IS UNLIMITED');
});

test('an invalid variable name fails loud at mount', () => {
  assert.throws(() => apply(fakeContext(), { variableName: 'Not Valid' }), /invalid prompt variable name/);
});

test('the state route is per Session and rejects requests without one', async () => {
  reset();
  const ctx = fakeContext();
  apply(ctx, {});
  const route = ctx.routes[0];

  const empty = await callRoute(route, { socket: { remoteAddress: '127.0.0.1' }, method: 'GET' });
  assert.equal(empty.status, 200);
  assert.equal(empty.body.sessionId, null);
  assert.equal(empty.body.enabled, false);

  const on = await callRoute(route, post({ sessionId: 'session-a', enabled: true }));
  assert.equal(on.status, 200);
  assert.equal(on.body.enabled, true);
  assert.equal(isEnabled(readState(stateFile), 'session-a'), true);
  assert.equal(isEnabled(readState(stateFile), 'session-b'), false);

  const readA = await callRoute(route, { socket: { remoteAddress: '127.0.0.1' }, method: 'GET', url: ROUTE_STATE + '?sessionId=session-a' });
  assert.equal(readA.body.enabled, true);
  const readB = await callRoute(route, { socket: { remoteAddress: '127.0.0.1' }, method: 'GET', url: ROUTE_STATE + '?sessionId=session-b' });
  assert.equal(readB.body.enabled, false);

  const missing = await callRoute(route, post({ enabled: true }));
  assert.equal(missing.status, 400);
  const remote = await callRoute(route, { socket: { remoteAddress: '10.1.2.3' }, method: 'GET' });
  assert.equal(remote.status, 403);
});

test('dropping below the top tier switches that Session off on the next request', async () => {
  reset();
  record('session-a', true);
  record('session-b', true);
  const ctx = fakeContext();
  apply(ctx, {});
  const request = ctx.listeners.get('agent/request')[0];

  const high = await request({ agent: { id: 'session-a' } }, () => Promise.resolve({ provider: 'p', model: 'm', reasoningEffort: 'high' }));
  assert.equal(high.reasoningEffort, 'high', 'the request config is returned untouched');
  assert.equal(isEnabled(readState(stateFile), 'session-a'), false, 'this Session is switched off');
  assert.equal(isEnabled(readState(stateFile), 'session-b'), true, 'other Sessions are untouched');

  record('session-a', true);
  await request({ agent: { id: 'session-a' } }, () => Promise.resolve({ provider: 'p', model: 'm', reasoningEffort: 'max' }));
  assert.equal(isEnabled(readState(stateFile), 'session-a'), true, 'a top effort keeps it on');
});

test('the auto-off listener never breaks a request', async () => {
  reset();
  record('session-a', true);
  const ctx = fakeContext();
  apply(ctx, {});
  const request = ctx.listeners.get('agent/request')[0];
  const returned = await request(undefined, () => Promise.resolve({ provider: 'p', model: 'm' }));
  assert.equal(returned.provider, 'p');
});
