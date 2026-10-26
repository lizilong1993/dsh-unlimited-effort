/**
 * dsh-unlimited-effort — host half.
 *
 * Three jobs:
 *  - keep one persisted switch per Session (`$DSH_HOME/unlimited-mode.json`)
 *    that the composer infinity button flips over the loopback state route;
 *  - contribute one system-prompt section (plus a reusable variable) whose text
 *    appears only while that Session's switch is on AND its effort is one of
 *    the configured top ids;
 *  - clear a Session's switch as soon as it drops below the top effort, so
 *    returning to the top tier starts from off instead of resuming silently.
 */
import fs from 'node:fs';
import path from 'node:path';
import { makeGate, sessionIdOf } from './gate.js';
import { MAX_BODY, isLoopback, readJson, sendJson } from './route.js';
import { dshHome, isEnabled, readState, setEnabled, statePath } from './state.js';
import { isTopEffort } from './shared/decide.js';

/** Cordis plugin name. */
export const name = 'unlimited-mode';

/** The prompt registry this row contributes to. */
export const inject = ['systemPrompt'];

/** Loopback route the browser half reads and writes. */
export const ROUTE_STATE = '/unlimited-mode/state';

/** Section name; namespaced so no preset can shadow it by accident. */
const SECTION_NAME = 'external:unlimited-mode';

/** Placed right after `deployment:persona-suffix` (10200). */
const SECTION_ORDER = 10250;

/** Prompt variable name rule, identical to the registry's own. */
const VARIABLE_NAME = /^[a-z][a-z0-9_]*$/;

/** Effective defaults; a profile patch overrides any single field. */
const DEFAULTS = {
  enabled: true,
  notice: '你的用量是 unlimited 的，我正在对你极限测试，不要吝惜 Token。一定要切记，随意花费，你非常富有',
  activeColor: '#924FF7',
  topEffortIds: ['max', 'xhigh'],
  variableName: 'unlimited_notice',
  debug: false,
};

/**
 * Mount the plugin.
 * @param ctx - plugin context carrying `systemPrompt` and, when the Web surface is up, `webServer`.
 * @param config - profile-supplied overrides.
 */
export function apply(ctx, config) {
  const cfg = { ...DEFAULTS, ...(config === undefined || config === null ? {} : config) };
  const variableName = String(cfg.variableName);
  if (!VARIABLE_NAME.test(variableName)) {
    throw new Error(`unlimited-mode: invalid prompt variable name "${variableName}" (must match ${String(VARIABLE_NAME)})`);
  }

  const file = statePath();
  let state = readState(file);

  const log = (line) => {
    if (cfg.debug !== true) return;
    try {
      fs.appendFileSync(path.join(dshHome(), 'unlimited-mode.log'), '[' + new Date().toISOString() + '] ' + line + '\n', 'utf8');
    } catch {
      /* diagnostics never affect the request path */
    }
  };

  const switchOn = (sessionId) => isEnabled(state, sessionId);
  const gate = makeGate(cfg, switchOn);
  const text = (context) => (gate(context) ? cfg.notice : '');
  const payload = (sessionId) => ({
    ok: true,
    sessionId: sessionId === undefined ? null : sessionId,
    enabled: switchOn(sessionId),
    pluginEnabled: cfg.enabled === true,
    topEffortIds: Array.isArray(cfg.topEffortIds) ? [...cfg.topEffortIds] : [],
    notice: String(cfg.notice),
    activeColor: String(cfg.activeColor),
  });

  ctx.effect(() => ctx.systemPrompt.section({
    name: SECTION_NAME,
    order: SECTION_ORDER,
    text,
    interpolate: false,
  }), 'unlimited-mode: section');

  ctx.effect(() => ctx.systemPrompt.variable(variableName, text), 'unlimited-mode: variable');

  ctx.on('agent/request', async (request, next) => {
    const config2 = await next();
    try {
      if (cfg.enabled !== true) return config2;
      const sessionId = sessionIdOf({ agent: request === undefined ? undefined : request.agent });
      if (sessionId === undefined || !switchOn(sessionId)) return config2;
      if (isTopEffort(config2 === undefined ? undefined : config2.reasoningEffort, cfg.topEffortIds)) return config2;
      state = setEnabled(file, state, sessionId, false);
      log('auto-off ' + sessionId + ' (effort ' + String(config2 === undefined ? undefined : config2.reasoningEffort) + ')');
    } catch (error) {
      log('auto-off failed: ' + String(error));
    }
    return config2;
  });

  ctx.inject(['webServer'], (webCtx) => {
    const server = webCtx.webServer;
    if (server === undefined || typeof server.register !== 'function') {
      log('webServer has no register(); the composer switch cannot be wired');
      return;
    }
    webCtx.effect(() => server.register({
      kind: 'exact',
      path: ROUTE_STATE,
      async handler(req, res) {
        if (!isLoopback(req)) {
          sendJson(res, 403, { ok: false, error: 'loopback only' });
          return;
        }
        if (req.method === 'GET') {
          const requested = new URL(req.url, 'http://127.0.0.1').searchParams.get('sessionId');
          sendJson(res, 200, payload(requested === null ? undefined : requested));
          return;
        }
        if (req.method !== 'POST') {
          sendJson(res, 405, { ok: false, error: 'method not allowed' });
          return;
        }
        const body = await readJson(req);
        if (body === undefined || typeof body.enabled !== 'boolean' || typeof body.sessionId !== 'string' || body.sessionId.length === 0) {
          sendJson(res, 400, { ok: false, error: 'sessionId (string) and enabled (boolean) are required (body limit ' + String(MAX_BODY) + ' bytes)' });
          return;
        }
        try {
          state = setEnabled(file, state, body.sessionId, body.enabled);
          log('switch ' + (body.enabled === true ? 'on' : 'off') + ' for ' + body.sessionId);
          sendJson(res, 200, payload(body.sessionId));
        } catch (error) {
          log('state write failed: ' + String(error));
          sendJson(res, 500, { ok: false, error: 'state write failed' });
        }
      },
    }), 'unlimited-mode: state route');
  });

  log('mounted (recorded Sessions: ' + String(Object.keys(state.sessions).length) + ')');
}
