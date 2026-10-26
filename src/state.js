/**
 * Persisted switch state. The switch is machine-local and global on purpose:
 * "click it once, every later session gets the notice" is the whole contract,
 * and a per-session copy would silently reset on the next Session.
 *
 * Writes go through a temporary file and a rename so a crash never leaves a
 * half-written state file behind.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

/** State in force when nothing was ever saved. */
export const STATE_DEFAULT = { enabled: false };

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

/**
 * Read the switch state. A missing, unreadable or malformed file is not an
 * error: it means "off", so a broken file can never turn the mode on.
 * @param file - state file path.
 * @returns the normalised state.
 */
export function readState(file) {
  try {
    const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
    return { enabled: parsed !== null && typeof parsed === 'object' && parsed.enabled === true };
  } catch {
    return { enabled: STATE_DEFAULT.enabled };
  }
}

/**
 * Write the switch state atomically.
 * @param file - state file path.
 * @param next - the state to persist; only `enabled` is stored.
 * @returns the normalised state that was written.
 */
export function writeState(file, next) {
  const value = { enabled: next !== null && typeof next === 'object' && next.enabled === true };
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = file + '.' + process.pid + '.' + Date.now() + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(value, null, 2) + '\n', 'utf8');
  fs.renameSync(tmp, file);
  return value;
}
