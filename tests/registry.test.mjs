import test from 'node:test';
import assert from 'node:assert/strict';
import { Context } from '@deepseek-ai/cordis';
import { Loader } from '@deepseek-ai/cordis-plugin-loader';
import { AgentPresetRegistry } from '@deepseek-ai/dsh-agent-preset-registry';
import { SessionProjectionRegistry } from '@deepseek-ai/dsh-session-projection';
import { SystemPrompt } from '@deepseek-ai/dsh-system-prompt';
import { ToolRuntime } from '@deepseek-ai/dsh-tools';
import { createScope } from '@deepseek-ai/dsh-scope';
import { toolNames } from './fixtures/preset-tools.mjs';
import { installToolPolicy } from '../lib/compat/tool-policy.js';

test('actual preset registry retains revisions and isolates Chat fixture tools', async () => {
  const ctx = new Context(), scopes = [];
  try {
    ctx.baseUrl = new URL('../', import.meta.url).href;
    await ctx.plugin(Loader, { baseUrl: ctx.baseUrl });
    await ctx.plugin(SessionProjectionRegistry); await ctx.plugin(SystemPrompt); await ctx.plugin(ToolRuntime);
    ctx.provide('permissionPresets', { set() {} });
    await ctx.plugin(AgentPresetRegistry, { default: 'vibe-chat' });
    const definition = message => ({ id: 'vibe-chat', plugins: [{ id: 'fixture', name: new URL('./fixtures/preset-tools.mjs', import.meta.url).href, config: { message } }] });
    const firstRelease = await ctx.agentPresets.register(definition('revision-one'));
    const makeAgent = async id => {
      const agent = { session: { id, header: {} } }, scope = createScope(ctx, agent);
      scopes.push(scope); agent.ctx = scope.ctx;
      await ctx.agentPresets.mount(agent.ctx, 'vibe-chat'); await installToolPolicy(agent);
      return agent;
    };
    const oldAgent = await makeAgent('fixture-one');
    assert.deepEqual(ctx.tools.schemas(oldAgent).map(tool => tool.name), toolNames);
    await firstRelease();
    const secondRelease = await ctx.agentPresets.register(definition('revision-two'));
    const newAgent = await makeAgent('fixture-two');
    const execute = agent => ctx.tools.execute({ callId: agent.session.id, name: 'safe_calculate', arguments: {}, agent, signal: new AbortController().signal });
    assert.equal((await execute(oldAgent)).value.message, 'revision-one');
    assert.equal((await execute(newAgent)).value.message, 'revision-two');
    await secondRelease();
    assert.equal((await execute(newAgent)).value.message, 'revision-two');
    assert.deepEqual(await ctx.agentPresets.list(), []);
  } finally { for (const scope of scopes) await scope.dispose(); await ctx.fiber.dispose(); }
});
