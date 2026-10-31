import assert from 'node:assert/strict';
import { toolNames } from '../tests/fixtures/preset-tools.mjs';
import { mkdtemp, cp, symlink, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { Context } from '@deepseek-ai/cordis';
import { Loader } from '@deepseek-ai/cordis-plugin-loader';
import Timer from '@deepseek-ai/cordis-plugin-timer';
import Hmr from '@deepseek-ai/dsh-hmr';
import { AgentPresetRegistry } from '@deepseek-ai/dsh-agent-preset-registry';
import { SessionProjectionRegistry } from '@deepseek-ai/dsh-session-projection';
import { SystemPrompt } from '@deepseek-ai/dsh-system-prompt';
import { ToolRuntime } from '@deepseek-ai/dsh-tools';
import { createScope } from '@deepseek-ai/dsh-scope';

// Use real Loader, HMR, preset registry and tools. Agent and permission handles
// are fixtures; this check neither starts Desktop nor calls a model.
const temp = await mkdtemp(join(tmpdir(), 'dsh-vibe-hmr-'));
const ctx = new Context(), scopes = [], agents = new Map(), permissionChanges = [];
let watchDispose, timeout;
try {
  await cp(new URL('../lib/', import.meta.url), join(temp, 'lib'), { recursive: true });
  await cp(new URL('../tests/fixtures/preset-tools.mjs', import.meta.url), join(temp, 'preset-tools.mjs'));
  await writeFile(join(temp, 'package.json'), JSON.stringify({ type: 'module' }));
  // Allow the copied public bundle to resolve exactly the same Host peers.
  await symlink(fileURLToPath(new URL('../node_modules/', import.meta.url)), join(temp, 'node_modules'), 'dir');
  ctx.baseUrl = pathToFileURL(temp + '/').href;
  await ctx.plugin(Loader, { baseUrl: ctx.baseUrl }); await ctx.plugin(Timer);
  await ctx.plugin(SessionProjectionRegistry); await ctx.plugin(SystemPrompt); await ctx.plugin(ToolRuntime);
  ctx.provide('permissionPresets', { set: (_session, value) => permissionChanges.push(value), current: () => 'read-only' });
  ctx.provide('vibeChatWorkspace', { path: temp });
  ctx.provide('agents', { list: () => [...agents.values()], get: id => agents.get(id) });
  await ctx.plugin(AgentPresetRegistry, { default: 'vibe-chat' });
  await ctx.plugin(Hmr, { root: ['lib'], base: temp, debounce: 50, usePolling: true, interval: 100 });
  const presetConfig = message => ({ id: 'vibe-chat', plugins: [{ id: 'fixture', name: pathToFileURL(join(temp, 'preset-tools.mjs')).href, config: { message } }] });
  const presetId = await ctx.loader.create({ name: '@deepseek-ai/dsh-agent-preset', config: presetConfig('revision-one') });
  await ctx.loader.await();
  const make = async id => {
    const agent = { session: { id, header: { cwd: temp } } }, scope = createScope(ctx, agent);
    scopes.push(scope); agent.ctx = scope.ctx;
    await ctx.agentPresets.mount(agent.ctx, 'vibe-chat'); agents.set(id, agent);
    return agent;
  };
  const oldAgent = await make('old');
  const policyId = await ctx.loader.create({ name: pathToFileURL(join(temp, 'lib/index.js')).href });
  await ctx.loader.await();
  const execute = (agent, name = 'safe_calculate') => ctx.tools.execute({ callId: name, name, arguments: {}, agent, signal: new AbortController().signal });
  assert.deepEqual(ctx.tools.schemas(oldAgent).map(tool => tool.name), toolNames);

  // Change actual source, wait for the public watcher and assert that the new
  // apply body ran. A reload event with an empty map would not satisfy this.
  let newBodyRan = false;
  ctx.on('vibe/hmr-fixture', () => { newBodyRan = true; });
  const reloaded = new Promise((resolve, reject) => {
    ctx.on('hmr/reload', changes => { if (changes.size > 0) resolve(); });
    timeout = setTimeout(() => reject(new Error('Source HMR timed out')), 15_000);
  });
  const policyFile = join(temp, 'lib/index.js');
  const source = await readFile(policyFile, 'utf8');
  const marker = 'for (const agent of ctx.agents.list())';
  assert.ok(source.includes(marker));
  await writeFile(policyFile, source.replace(marker, "ctx.emit('vibe/hmr-fixture');\n    " + marker));
  await reloaded; clearTimeout(timeout);
  await ctx.get('hmr').runExclusive(() => ctx.loader.await());
  assert.ok(newBodyRan, 'new source must execute after HMR');
  assert.deepEqual(ctx.tools.schemas(oldAgent).map(tool => tool.name), toolNames);
  assert.equal((await execute(oldAgent, 'run_code')).isError, true);
  assert.deepEqual(permissionChanges, [], 'HMR must preserve manual Session permissions');

  // A real configuration watch replaces the declaring row. Existing Agents
  // retain their standing preset revision; new Agents mount the new revision.
  const configFile = join(temp, 'preset.json');
  await writeFile(configFile, JSON.stringify(presetConfig('revision-one')));
  watchDispose = await ctx.get('hmr').watchConfig(configFile, async () => {
    await ctx.loader.update(presetId, { config: JSON.parse(await readFile(configFile, 'utf8')) });
    await ctx.loader.await();
  });
  await ctx.get('hmr').runExclusive(() => ctx.loader.await());
  await writeFile(configFile, JSON.stringify(presetConfig('revision-two')));
  const deadline = Date.now() + 15_000;
  let newAgent;
  while (Date.now() < deadline) {
    await new Promise(resolve => setTimeout(resolve, 200));
    await ctx.get('hmr').runExclusive(() => ctx.loader.await());
    newAgent = await make('candidate-' + scopes.length);
    if ((await execute(newAgent)).value.message === 'revision-two') break;
    agents.delete(newAgent.session.id); await scopes.pop().dispose(); newAgent = undefined;
  }
  assert.ok(newAgent, 'configuration HMR must update the actual tool result');
  await ctx.serial('agent/created', { agent: newAgent, source: 'resume' });
  assert.deepEqual(ctx.tools.schemas(newAgent).map(tool => tool.name), toolNames);
  assert.equal((await execute(oldAgent)).value.message, 'revision-one');
  assert.equal((await execute(newAgent)).value.message, 'revision-two');
  assert.deepEqual(permissionChanges, []);
  await watchDispose(); watchDispose = undefined;
  await ctx.loader.remove(policyId); await ctx.loader.await();
  await ctx.loader.remove(presetId); await ctx.loader.await();
  for (const scope of scopes) await scope.dispose(); scopes.length = 0;
  assert.deepEqual(await ctx.agentPresets.list(), []);
  const dshVersion = JSON.parse(await readFile(new URL('../node_modules/@deepseek-ai/dsh-agent/package.json', import.meta.url), 'utf8')).version;
  console.log(JSON.stringify({ passed: true, dshVersion, scope: 'exact-version public HMR/Loader/services; Agent and permission fixtures', sourcePolicyReload: true, configurationPresetReload: true, existingRevisionRetained: true, toolPolicyPreserved: true, manualPermissionsPreserved: true, unloadCompleted: true, modelCalled: false }, null, 2));
} finally {
  clearTimeout(timeout); await watchDispose?.();
  for (const scope of scopes) await scope.dispose();
  await ctx.fiber.dispose(); await rm(temp, { recursive: true, force: true });
}
