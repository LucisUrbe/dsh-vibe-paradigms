import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import semver from 'semver';
import { supportedDshRange, testedDshVersions } from '../lib/compat/probe.js';
import * as compat from '../lib/compat/index.js';

const manifest = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
// The Host admits a bundle by engines.dsh with prereleases participating.
const admits = version => semver.satisfies(version, manifest.engines.dsh, { includePrerelease: true });

test('every DSH 0.x release from the first tested one is admitted; the 1.0.0 line is not', () => {
  assert.equal(manifest.engines.dsh, supportedDshRange);
  for (const [name, range] of Object.entries(manifest.peerDependencies)) {
    if (name.startsWith('@deepseek-ai/dsh-')) assert.equal(range, supportedDshRange, name);
  }
  for (const version of [...testedDshVersions, '0.2.2-alpha.2', '0.3.0', '0.10.4-rc.1', '0.99.99']) assert.ok(admits(version), version);
  for (const version of ['0.2.0-rc.1', '0.1.7', '1.0.0-0', '1.0.0-alpha.1', '1.0.0-rc.1', '1.0.0', '2.0.0']) assert.ok(!admits(version), version);
});

const services = () => ({
  agents: { list: () => [], get: () => undefined },
  agentPresets: { composedPreset() {}, serviceFor() {} },
  permissionPresets: { set() {} },
  web: { registerSearchProvider() {} },
  workspaceRegistry: { list: () => [], create: async () => ({}) },
  settings: { describe: () => [], configure() {} },
});
const contextOf = provided => ({ get: name => provided[name] });

test('startup self-check passes on the installed Host and names each missing seam in Chinese', () => {
  assert.deepEqual(compat.missingExports(), []);
  assert.doesNotThrow(() => compat.apply(contextOf(services())));
  const broken = services();
  delete broken.web; broken.settings = { describe: () => [] };
  broken.tools = { guard() {} };
  assert.throws(() => compat.apply(contextOf(broken)), error => {
    assert.match(error.message, /^dsh-vibe-paradigms 与当前 DSH 版本不兼容/);
    assert.match(error.message, /web, settings, toolsRestrict, nativePresentation/);
    assert.match(error.message, /github\.com\/LucisUrbe\/dsh-vibe-paradigms\/issues/);
    return true;
  });
});

// Load the browser module with minimal stand-ins for the client runtime.
async function loadClient(primitives = {}) {
  let definition;
  globalThis.window = { __ModuleLoader__: { load: value => { definition = value; } } };
  await import(new URL(`../lib/client.js?${Math.random()}`, import.meta.url).href);
  delete globalThis.window;
  const jsx = (type, props) => ({ type, props });
  return definition.factory(name => {
    if (name === 'react/jsx-runtime') return { jsx, jsxs: jsx };
    if (name === '@deepseek-ai/dsh-client-ui-primitives') return primitives;
    throw new Error(`unexpected module ${name}`);
  });
}
function clientContext(provided) {
  const slots = [], disposers = [];
  const ctx = {
    get: name => provided[name],
    inject: (deps, callback) => { if (deps.every(dep => dep in provided)) callback(ctx); },
    effect: callback => { const dispose = callback(); if (typeof dispose === 'function') disposers.push(dispose); },
    on() {},
    slots: { inject: (_name, register) => register(), register: (options, component) => { slots.push({ options, component }); } },
    ...provided,
  };
  return { ctx, slots, dispose: () => { for (const dispose of disposers) dispose(); } };
}
// Render function components into plain text, as React would show it.
function text(node) {
  if (node === null || node === undefined || typeof node === 'boolean') return '';
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(text).join('\n');
  if (typeof node.type === 'function') return text(node.type(node.props));
  const { title, description, footer, children } = node.props ?? {};
  return [title, description, text(children), text(footer)].filter(Boolean).join('\n');
}

test('client notice reports failed, stuck and broken components, defaults to Chinese and can be dismissed', async () => {
  const client = await loadClient();
  assert.deepEqual(client.inject, ['slots'], 'the notice must not wait for the services the settings card uses');
  const inventory = {
    entries: [
      { entryId: 'vibe-mode-policy', moduleName: 'dsh-vibe-paradigms', enabled: true, fiberPhase: 'active' },
      { entryId: 'vibe-compat', moduleName: 'dsh-vibe-paradigms/compat', enabled: true, fiberPhase: 'failed' },
      { entryId: 'vibe-chat-workspace', moduleName: 'dsh-vibe-paradigms/workspace', enabled: true, fiberPhase: 'pending' },
      { entryId: 'other', moduleName: '@deepseek-ai/dsh-web', enabled: true, fiberPhase: 'failed' },
    ],
    agentPresets: [{ id: 'vibe-chat', isDefault: false, broken: 'tools: missing', rows: [] }, { id: 'standard', isDefault: true, broken: 'not ours', rows: [] }],
  };
  // Card services are present but the primitives it renders with are not.
  const { ctx, slots, dispose } = clientContext({ remote: {}, 'remote.pluginInventory': {}, 'remote.credentials': {}, locale: { register() {} }, configForms: {}, modules: { manifest: { release: { version: '0.3.0' } } } });
  ctx.remote.pluginInventory = { list: async () => ({ ok: true, value: inventory }) };
  try {
    client.apply(ctx);
    const notice = slots.find(slot => slot.options.name === 'shell.overlay');
    assert.ok(notice, 'the notice mounts in the app-wide overlay');
    const injected = notice.options.inject();
    await new Promise(resolve => setImmediate(resolve));
    const snapshot = injected.hooks.compat.getSnapshot();
    // A pending row is reported only after the start-up grace period.
    assert.deepEqual(snapshot.problems.map(problem => [problem.component, problem.phase]), [['client-settings', 'failed'], ['vibe-compat', 'failed'], ['vibe-preset-chat', 'broken']]);
    const props = { useCompat: select => select(injected.hooks.compat.getSnapshot()), dismiss: injected.dismiss };
    const zh = text(notice.component({ ...props }));
    assert.match(zh, /dsh-vibe-paradigms 暂不兼容当前 DeepSeek Harness/);
    assert.match(zh, /兼容性修复将在 dsh-vibe-paradigms 仓库发布/);
    assert.match(zh, /当前 DSH 版本：0\.3\.0/);
    assert.match(zh, /兼容性自检 — 加载失败/);
    assert.match(zh, /聊天模式预设 — 无法创建会话: tools: missing/);
    // An active locale without this key still falls back to Chinese.
    assert.match(text(notice.component({ ...props, t: key => key })), /兼容性自检/);
    const en = { title: 'EN title', 'component.vibe-compat': 'Compatibility self-check', 'phase.failed': 'failed to load' };
    assert.match(text(notice.component({ ...props, t: key => en[key] ?? key })), /EN title[\s\S]*Compatibility self-check — failed to load/);
    injected.dismiss();
    assert.equal(notice.component({ ...props }), null);
  } finally { dispose(); }
});

test('client notice stays quiet while every own component is active', async () => {
  const client = await loadClient({ SettingsForm() {}, SettingsFormModel: class {}, SettingsSecretField() {} });
  const { ctx, slots, dispose } = clientContext({ remote: {}, 'remote.pluginInventory': {} });
  ctx.remote.pluginInventory = { list: async () => ({ ok: true, value: { entries: [{ entryId: 'vibe-compat', moduleName: 'dsh-vibe-paradigms/compat', enabled: true, fiberPhase: 'active' }], agentPresets: [{ id: 'vibe-chat', isDefault: false, rows: [] }] } }) };
  try {
    client.apply(ctx);
    const notice = slots.find(slot => slot.options.name === 'shell.overlay'), injected = notice.options.inject();
    await new Promise(resolve => setImmediate(resolve));
    assert.deepEqual(injected.hooks.compat.getSnapshot().problems, []);
    assert.equal(notice.component({ useCompat: select => select(injected.hooks.compat.getSnapshot()), dismiss: injected.dismiss }), null);
  } finally { dispose(); }
});
