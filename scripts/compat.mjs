import { Context } from '@deepseek-ai/cordis';
import { Loader } from '@deepseek-ai/cordis-plugin-loader';
import { AgentPresetRegistry } from '@deepseek-ai/dsh-agent-preset-registry';
import { SessionProjectionRegistry } from '@deepseek-ai/dsh-session-projection';
import { SystemPrompt } from '@deepseek-ai/dsh-system-prompt';
import { ToolRuntime } from '@deepseek-ai/dsh-tools';
import { createScope } from '@deepseek-ai/dsh-scope';
import { probe, testedDshVersions } from '../lib/compat/probe.js';
import { installToolPolicy } from '../lib/compat/tool-policy.js';
import assert from 'node:assert/strict';

const ctx = new Context();
try {
  ctx.baseUrl = new URL('../', import.meta.url).href;
  await ctx.plugin(Loader, { baseUrl: ctx.baseUrl });
  await ctx.plugin(SessionProjectionRegistry);
  await ctx.plugin(SystemPrompt);
  await ctx.plugin(ToolRuntime);
  // The permission service requires a complete shell/approval composition.
  // This isolated probe substitutes only that service and the Agent handle;
  // real Desktop permission initialization is validated separately.
  ctx.provide('permissionPresets', { set() {}, current() { return 'read-only'; } });
  await ctx.plugin(AgentPresetRegistry, { default: 'vibe-health' });
  const release = await ctx.agentPresets.register({ id: 'vibe-health', plugins: [{ id: 'health', name: 'dsh-vibe-paradigms/health' }] });
  const roster = await ctx.agentPresets.list();
  assert.equal(roster.find(preset => preset.id === 'vibe-health').broken, undefined);
  const agent = { session: { id: 'compat-fixture', header: { cwd: process.cwd() } } };
  const scope = createScope(ctx, agent); agent.ctx = scope.ctx;
  await ctx.agentPresets.mount(agent.ctx, 'vibe-health');
  await installToolPolicy(agent);
  const tools = ctx.tools.schemas(agent).map(tool => tool.name);
  assert.deepEqual(tools, ['vibe_health']);
  const result = await ctx.tools.execute({ callId: 'compat-health', name: 'vibe_health', arguments: {}, agent, signal: new AbortController().signal });
  assert.equal(result.isError, false); assert.equal(result.value.status, 'ok');
  await scope.dispose(); await release();
  assert.equal((await ctx.agentPresets.list()).length, 0);
  console.log(JSON.stringify({ passed: true, testedDshVersions, scope: 'isolated exact-version public services; permission and Agent fixtures', capabilities: probe(ctx), presetTools: tools, lifecycle: ['register', 'mount', 'execute', 'dispose'], modelCalled: false }, null, 2));
} finally { await ctx.fiber.dispose(); }
