/**
 * Wrap the browser half into the Harness client-module envelope.
 *
 * The client loader materialises a module from `window.__ModuleLoader__.load({ id, factory })`
 * and hands the factory a `require` that resolves shared modules (React). The
 * shared effort helpers are inlined here rather than imported, because the
 * browser half ships as one already-built file and must not need a bundler.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, '..');
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');

const shared = read('src/shared/decide.js').replace(/^export /gm, '');
const body = read('src/client/body.js');

const out = [
  'window.__ModuleLoader__.load({ id: "dsh-unlimited-effort", factory: (require) => {',
  'var module = { exports: {} }; var exports = module.exports;',
  'var React = require("react");',
  shared.trimEnd(),
  '',
  body.trimEnd(),
  '',
  'return module.exports; } });',
  '',
].join('\n');

fs.mkdirSync(path.join(root, 'lib'), { recursive: true });
fs.writeFileSync(path.join(root, 'lib/client.js'), out, 'utf8');
console.log('built lib/client.js (' + String(out.length) + ' bytes)');
