#!/usr/bin/env node
/**
 * Static self-check: is this plugin installed, activated, and internally
 * consistent? It reads the profile and the built bundle only — it never boots
 * the Host — so it answers "will the switch behave" without spending a turn.
 *
 * Exit 0: usable. Exit 1: something must be fixed.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const PACKAGE = 'dsh-unlimited-effort';
const PROFILE = process.env.DSH_PROFILE || 'desktop';
const HOME = process.env.DSH_HOME || path.join(os.homedir(), '.dsh');
const PROFILE_DIR = path.join(HOME, 'profiles', PROFILE);

let failures = 0;
const ok = (label, detail) => console.log('  [ok] ' + label + (detail ? ': ' + detail : ''));
const warn = (label, detail) => console.log('  [--] ' + label + (detail ? ': ' + detail : ''));
const bad = (label, detail) => {
  failures += 1;
  console.log('  [!!] ' + label + (detail ? ': ' + detail : ''));
};

console.log('dsh-unlimited-effort 自检');
console.log('profile: ' + PROFILE_DIR);
console.log('DSH_HOME = ' + HOME);

// 1. installed package
const installedDir = path.join(PROFILE_DIR, 'node_modules', PACKAGE);
const installed = fs.existsSync(installedDir);
installed ? ok('插件包已就位', installedDir) : bad('插件包缺失', 'dsh plugin --profile ' + PROFILE + ' add ' + PACKAGE);

// 2. bundle activation
let manifest;
try {
  manifest = JSON.parse(fs.readFileSync(path.join(PROFILE_DIR, 'package.json'), 'utf8'));
} catch (error) {
  bad('无法读取 profile 的 package.json', String(error));
}
const bundles = manifest && manifest.dsh && manifest.dsh.profile && Array.isArray(manifest.dsh.profile.bundles)
  ? manifest.dsh.profile.bundles
  : [];
bundles.includes(PACKAGE)
  ? ok('已列入 dsh.profile.bundles')
  : bad('未列入 dsh.profile.bundles', 'bundles 决定插件是否被加载');

// 3. declared halves
let pluginManifest;
try {
  pluginManifest = JSON.parse(fs.readFileSync(path.join(installedDir, 'package.json'), 'utf8'));
} catch (error) {
  pluginManifest = undefined;
}
const bundlePatch = pluginManifest && pluginManifest.dsh && pluginManifest.dsh.bundle ? pluginManifest.dsh.bundle.patch : undefined;
const clientMain = pluginManifest && pluginManifest.dsh && pluginManifest.dsh.client ? pluginManifest.dsh.client.main : undefined;
bundlePatch ? ok('dsh.bundle.patch 已声明', String(bundlePatch)) : bad('缺少 dsh.bundle.patch', '这样 dsh plugin add 装不上');
clientMain ? ok('dsh.client.main 已声明', String(clientMain)) : bad('缺少 dsh.client.main', '输入框按钮不会出现');

// 4. built client bundle invariants
const clientFile = path.join(installedDir, 'lib', 'client.js');
let clientSource = '';
try {
  clientSource = fs.readFileSync(clientFile, 'utf8');
} catch {
  clientSource = '';
}
if (clientSource.length === 0) {
  bad('lib/client.js 缺失', '跑 npm run build 后再发布');
} else {
  const checks = [
    ['客户端模块外壳', '__ModuleLoader__.load'],
    ['注册 slot', 'conversation.input.right'],
    ['flex 排序（决定落在模型选择器右侧）', 'order: 1'],
    ['模块 id', 'dsh-unlimited-effort'],
  ];
  for (const [label, needle] of checks) {
    clientSource.includes(needle) ? ok(label) : bad('客户端 bundle 缺少 ' + label, needle);
  }
}

// 5. persisted switch
const stateFile = path.join(HOME, 'unlimited-mode.json');
let state = { enabled: false };
try {
  state = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
  ok('开关状态文件可读', stateFile + ' -> enabled=' + String(state.enabled === true));
} catch {
  warn('尚无开关状态文件（默认关）', stateFile);
}

// 6. profile override (plain text scan: no YAML dependency)
const patchFile = path.join(PROFILE_DIR, 'cordis.patch.yml');
let overrideLines = [];
try {
  const lines = fs.readFileSync(patchFile, 'utf8').split(/\r?\n/);
  const at = lines.findIndex((line) => /-\s*id:\s*unlimited-mode\s*$/.test(line));
  if (at >= 0) overrideLines = lines.slice(at, at + 12);
} catch {
  /* no patch layer is fine */
}
if (overrideLines.length > 0) {
  warn('检测到 unlimited-mode 覆盖块', '');
  for (const line of overrideLines) console.log('       ' + line);
} else {
  ok('无覆盖块（使用插件默认配置）');
}

// 7. reminders the Host alone can answer
console.log('');
console.log('提醒：');
console.log('  - topEffortIds 默认 [max, xhigh]；若某个模型只声明了 low/high，按钮在该模型下不会出现。');
console.log('  - 变量名 unlimited_notice 与其它插件撞名会在启动时报 prompt variable is already registered。');
console.log('  - 运行时自检：GET /unlimited-mode/state 应返回 { ok: true, enabled, topEffortIds, notice }。');

console.log('');
if (failures === 0) {
  console.log('结论：可用。重启 DSH 后，选最高档即可在模型选择器右侧看到 ∞。');
  process.exit(0);
}
console.log('结论：有 ' + String(failures) + ' 项需要处理，见上方 [!!]。');
process.exit(1);
