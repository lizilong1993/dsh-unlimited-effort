/**
 * The one predicate that decides whether the notice is injected: the plugin is
 * on, the switch is on, and the effort in force is one of the configured top
 * ids. Everything here is deliberately total — a prompt contribution that
 * throws would fail the whole assembly and take the session down with it.
 */
import { isTopEffort } from './shared/decide.js';

/**
 * The reasoning effort in force for one assembly.
 * `agent.options` is the live per-session selection (selectForNextRequest
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
    /* a session without a logged header simply has no effort yet */
  }
  return undefined;
}

/**
 * Build the injection predicate.
 * @param cfg - effective plugin configuration.
 * @param readEnabled - reads the persisted switch state on every call.
 * @returns a total predicate over the assembly context.
 */
export function makeGate(cfg, readEnabled) {
  return (context) => {
    try {
      if (cfg.enabled !== true) return false;
      if (readEnabled() !== true) return false;
      return isTopEffort(currentEffort(context), cfg.topEffortIds);
    } catch {
      return false;
    }
  };
}
