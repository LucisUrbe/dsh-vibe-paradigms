import { chatRuntime } from '../tests/fixtures/chat-runtime.mjs';
import { createScope } from '@deepseek-ai/dsh-scope';
import { probe, supportedDshRange } from '../lib/compat/probe.js';
import { missingExports } from '../lib/compat/index.js';
import { readFile } from 'node:fs/promises';
import { installToolPolicy } from '../lib/compat/tool-policy.js';
import { modeForPreset } from '../lib/mode/spec.js';
import assert from 'node:assert/strict';

const dshVersion = JSON.parse(await readFile(new URL('../node_modules/@deepseek-ai/dsh-agent/package.json', import.meta.url), 'utf8')).version;
assert.deepEqual(missingExports(), []);
const { ctx, definition, dispose } = await chatRuntime();
let scope;
try {
  const release = await ctx.agentPresets.register(definition);
  const roster = await ctx.agentPresets.list();
  assert.equal(roster.find(preset => preset.id === 'vibe-chat').broken, undefined);
  const agent = { session: { id: 'compat-fixture', header: { cwd: ctx.vibeChatWorkspace.path } } };
  scope = createScope(ctx, agent); agent.ctx = scope.ctx;
  await ctx.agentPresets.mount(agent.ctx, 'vibe-chat');
  await installToolPolicy(agent);
  const tools = ctx.tools.schemas(agent).map(tool => tool.name);
  assert.deepEqual(tools.toSorted(), [...modeForPreset('vibe-chat').allowedTools].sort());
  const result = await ctx.tools.execute({ callId: 'compat-chat', name: 'safe_calculate', arguments: { operation: 'expression', expression: '0.1+0.2' }, agent, signal: new AbortController().signal });
  assert.equal(result.isError, false); assert.equal(result.value.result, '0.3');
  await scope.dispose(); scope = undefined; await release();
  assert.deepEqual(await ctx.agentPresets.list(), []);
  console.log(JSON.stringify({ passed: true, dshVersion, supportedDshRange, scope: 'isolated exact-version Chat composition; permission, workspace persistence and Agent fixtures', capabilities: probe(ctx), presetTools: tools, lifecycle: ['register', 'mount', 'execute', 'dispose'], modelCalled: false }, null, 2));
} finally { await scope?.dispose(); await dispose(); }
