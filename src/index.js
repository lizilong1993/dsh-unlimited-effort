/**
 * dsh-unlimited-effort — host half.
 *
 * Two jobs:
 *  - keep one persisted switch (`$DSH_HOME/unlimited-mode.json`) that the
 *    composer infinity button flips over the loopback state route;
 *  - contribute one system-prompt section (and one reusable variable) whose
 *    text appears only while that switch is on AND the effort in force is one
 *    of the configured top ids.
 *
 * The section is registered once at mount and renders empty otherwise: an
 * empty section is dropped at render time, so switching the mode off needs no
 * registry churn. Prompt contributions must never throw — assembly is a
 * synchronous, fail-closed pass.
 */
import fs from 'node:fs';
import path from 'node:path';
import { makeGate } from './gate.js';
import { MAX_BODY, isLoopback, readJson, sendJson } from './route.js';
import { dshHome, readState, statePath, writeState } from './state.js';

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

  const gate = makeGate(cfg, () => state.enabled);
  const text = (context) => (gate(context) ? cfg.notice : '');

  ctx.effect(() => ctx.systemPrompt.section({
    name: SECTION_NAME,
    order: SECTION_ORDER,
    text,
    interpolate: false,
  }), 'unlimited-mode: section');

  ctx.effect(() => ctx.systemPrompt.variable(variableName, text), 'unlimited-mode: variable');

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
          sendJson(res, 200, {
            ok: true,
            enabled: state.enabled,
            pluginEnabled: cfg.enabled === true,
            topEffortIds: Array.isArray(cfg.topEffortIds) ? [...cfg.topEffortIds] : [],
            notice: String(cfg.notice),
            activeColor: String(cfg.activeColor),
          });
          return;
        }
        if (req.method !== 'POST') {
          sendJson(res, 405, { ok: false, error: 'method not allowed' });
          return;
        }
        const body = await readJson(req);
        if (body === undefined || typeof body.enabled !== 'boolean') {
          sendJson(res, 400, { ok: false, error: 'enabled must be a boolean (body limit ' + String(MAX_BODY) + ' bytes)' });
          return;
        }
        try {
          state = writeState(file, { enabled: body.enabled });
          log('switch ' + (state.enabled ? 'on' : 'off'));
          sendJson(res, 200, {
            ok: true,
            enabled: state.enabled,
            pluginEnabled: cfg.enabled === true,
            topEffortIds: Array.isArray(cfg.topEffortIds) ? [...cfg.topEffortIds] : [],
            notice: String(cfg.notice),
            activeColor: String(cfg.activeColor),
          });
        } catch (error) {
          log('state write failed: ' + String(error));
          sendJson(res, 500, { ok: false, enabled: state.enabled, error: 'state write failed' });
        }
      },
    }), 'unlimited-mode: state route');
  });

  log('mounted (switch ' + (state.enabled ? 'on' : 'off') + ', section order ' + String(SECTION_ORDER) + ')');
}
