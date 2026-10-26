/**
 * The one predicate that decides whether the notice is injected: the plugin is
 * on, the current Session has the switch on, and the effort in force is one of
 * the configured top ids. Everything here is deliberately total — a prompt
 * contribution that throws would fail the whole assembly and take the Session
 * down with it.
 */
import { isTopEffort } from './shared/decide.js';

/**
 * The Session identity behind one assembly.
 * @param context - the prompt assembly context.
 * @returns the Session id, or undefined when the context carries none.
 */
export function sessionIdOf(context) {
  const agent = context === undefined || context === null ? undefined : context.agent;
  if (agent === undefined || agent === null) return undefined;
  const direct = agent.session !== undefined && agent.session !== null ? agent.session.id : undefined;
  if (typeof direct === 'string' && direct.length > 0) return direct;
  if (typeof agent.id === 'string' && agent.id.length > 0) return agent.id;
  return undefined;
}

/**
 * The reasoning effort in force for one assembly.
 * `agent.options` is the live per-Session selection (selectForNextRequest
 * updates it before the next request), so it wins over the last logged request
 * header, which lags one step behind.
 * @param context - the prompt assembly context.
 * @returns the effort id, or undefined when none is selected yet.
 */
export function currentEffort(context) {
  const agent = context === undefined || context === null ? undefined : context.agent;
  const live = agent && agent.options ? agent.options.reasoningEffort : undefined;
  if (typeof live === 'string' && live.length > 0) return live;
  try {
    const header = agent && agent.session && typeof agent.session.requestHeader === 'function'
      ? agent.session.requestHeader()
      : undefined;
    const logged = header && header.config ? header.config.reasoningEffort : undefined;
    if (typeof logged === 'string' && logged.length > 0) return logged;
  } catch {
    /* a Session without a logged header simply has no effort yet */
  }
  return undefined;
}

/**
 * Build the injection predicate.
 * @param cfg - effective plugin configuration.
 * @param readEnabled - reads one Session's persisted switch state.
 * @returns a total predicate over the assembly context.
 */
export function makeGate(cfg, readEnabled) {
  return (context) => {
    try {
      if (cfg.enabled !== true) return false;
      const sessionId = sessionIdOf(context);
      if (sessionId === undefined) return false;
      if (readEnabled(sessionId) !== true) return false;
      return isTopEffort(currentEffort(context), cfg.topEffortIds);
    } catch {
      return false;
    }
  };
}
