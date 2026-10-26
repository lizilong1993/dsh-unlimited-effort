/**
 * Persisted switch state, per Session.
 *
 * Enabling the switch in one Session must not silently enable it in another:
 * the state file therefore maps Session id -> enabled, and a Session with no
 * recorded choice is off. Writes go through a temporary file and a rename so a
 * crash never leaves a half-written state file behind.
 *
 * The file is bounded: dropping the oldest recorded Session keeps a long-lived
 * install from growing the map without limit.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

/** Current on-disk shape. */
export const STATE_VERSION = 2;

/** How many Session choices are remembered before the oldest is dropped. */
export const MAX_SESSIONS = 256;

/**
 * The Harness home directory.
 * @returns the absolute DSH home path.
 */
export function dshHome() {
  return process.env.DSH_HOME && process.env.DSH_HOME.length > 0
    ? process.env.DSH_HOME
    : path.join(os.homedir(), '.dsh');
}

/**
 * Where this plugin keeps its switch state.
 * @param home - Harness home override, for tests.
 * @returns the absolute state file path.
 */
export function statePath(home = dshHome()) {
  return path.join(home, 'unlimited-mode.json');
}

/** The state a Session sees when it has never been recorded. */
export function emptyState() {
  return { version: STATE_VERSION, sessions: {} };
}

/**
 * Read the switch state.
 * A missing, unreadable, malformed or legacy file is not an error: it reads as
 * "nothing recorded", so every Session is off. A broken file can therefore
 * never turn the mode on.
 * @param file - state file path.
 * @returns the normalised state.
 */
export function readState(file) {
  try {
    const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
    const raw = parsed !== null && typeof parsed === 'object' && parsed.sessions !== null && typeof parsed.sessions === 'object'
      ? parsed.sessions
      : {};
    const sessions = {};
    for (const [id, value] of Object.entries(raw)) {
      if (typeof id === 'string' && id.length > 0 && value === true) sessions[id] = true;
    }
    return { version: STATE_VERSION, sessions };
  } catch {
    return emptyState();
  }
}

/**
 * Whether one Session currently has the switch on.
 * @param state - normalised state.
 * @param sessionId - the Session identity.
 * @returns true only for a recorded true.
 */
export function isEnabled(state, sessionId) {
  if (typeof sessionId !== 'string' || sessionId.length === 0) return false;
  return state !== null && typeof state === 'object' && state.sessions !== null && typeof state.sessions === 'object'
    ? state.sessions[sessionId] === true
    : false;
}

/**
 * Record one Session's choice and persist it atomically.
 * @param file - state file path.
 * @param state - current normalised state.
 * @param sessionId - the Session identity.
 * @param enabled - the desired state for that Session.
 * @returns the normalised state that was written.
 */
export function setEnabled(file, state, sessionId, enabled) {
  if (typeof sessionId !== 'string' || sessionId.length === 0) {
    throw new Error('unlimited-mode: a Session id is required to record the switch');
  }
  const sessions = { ...state.sessions };
  if (enabled === true) sessions[sessionId] = true;
  else delete sessions[sessionId];
  while (Object.keys(sessions).length > MAX_SESSIONS) {
    const oldest = Object.keys(sessions)[0];
    if (oldest === undefined) break;
    delete sessions[oldest];
  }
  const value = { version: STATE_VERSION, sessions };
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = file + '.' + process.pid + '.' + Date.now() + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(value, null, 2) + '\n', 'utf8');
  fs.renameSync(tmp, file);
  return value;
}
