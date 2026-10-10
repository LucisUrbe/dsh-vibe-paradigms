import test from 'node:test';
import assert from 'node:assert/strict';
import { Context } from '@deepseek-ai/cordis';
import { SystemPrompt } from '@deepseek-ai/dsh-system-prompt';
import { ToolRuntime } from '@deepseek-ai/dsh-tools';
import { createScope, scopeOf } from '@deepseek-ai/dsh-scope';
import * as fixture from './fixtures/preset-tools.mjs';
import * as policy from '../lib/index.js';

function registerTool(ctx, name, execute) {
  ctx.get('tools').register({ name, description: 'Test fixture', parameters: { type: 'object', properties: {} }, output: { schema: { type: 'string' }, render: (_args, value) => [{ type: 'text', text: value }] }, execute: async () => execute() });
}

async function setup() {
  const ctx = new Context(), permissionChanges = [];
  await ctx.plugin(SystemPrompt); await ctx.plugin(ToolRuntime);
  ctx.provide('agentPresets'); ctx.provide('permissionPresets'); ctx.provide('agents');
  ctx.set('agentPresets', { composedPreset: () => 'vibe-chat', serviceFor: () => undefined });
  ctx.set('permissionPresets', { set: (_session, value) => permissionChanges.push(value) });
  const preset = createScope(ctx, { id: 'preset-fixture' });
  const agent = { session: { id: 'fixture', header: { cwd: '/fixture' } } };
  const scoped = createScope(preset.ctx, agent, { parent: scopeOf(preset.ctx) }); agent.ctx = scoped.ctx;
  ctx.provide('vibeChatWorkspace', { path: '/fixture' });
  ctx.set('agents', { get: () => agent, list: () => [agent] });
  return { ctx, agent, scoped, preset, permissionChanges };
}

test('real Cordis tool execution isolates Chat, denies scope-owned injection, and cleans up on unload', async () => {
  const { ctx, agent, scoped, preset } = await setup();
  try {
    let executed = 0;
    registerTool(ctx, 'inherited_secret_reader', () => { executed++; return 'private'; });
    const fiber = await preset.ctx.plugin(fixture);
    const policyFiber = await ctx.plugin(policy);
    assert.deepEqual(ctx.tools.schemas(agent).map(tool => tool.name), fixture.toolNames);
    const exec = name => ctx.tools.execute({ callId: name, name, arguments: {}, agent, signal: new AbortController().signal });
    const good = await exec('safe_calculate');
    assert.equal(good.isError, false); assert.equal(good.value.message, 'fixture');
    assert.equal((await exec('inherited_secret_reader')).isError, true);
    registerTool(scoped.ctx, 'future_scope_tool', () => { executed++; return 'private'; });
    const denied = await exec('future_scope_tool');
    assert.equal(denied.isError, true); assert.match(denied.error.message, /does not permit/); assert.equal(executed, 0);
    assert.equal((await exec('run_code')).isError, true);
    assert.equal(ctx.tools.schemas().some(tool => tool.name === 'inherited_secret_reader'), true);
    await policyFiber.dispose(); await fiber.dispose();
    assert.equal(ctx.tools.get('safe_calculate', agent), undefined);
    assert.ok(ctx.tools.get('inherited_secret_reader', agent));
    await preset.ctx.plugin(fixture, { message: 'Reloaded' });
    await ctx.plugin(policy);
    const reloaded = await exec('safe_calculate');
    assert.equal(reloaded.value.message, 'Reloaded');
    assert.equal(ctx.tools.schemas(agent).filter(tool => tool.name === 'safe_calculate').length, 1);
  } finally { await ctx.fiber.dispose(); }
});

test('lifecycle initializes startup once and preserves resume, fork, clear, compact and manual permissions', async () => {
  const { ctx, agent, preset, permissionChanges } = await setup();
  try {
    await preset.ctx.plugin(fixture);
    const fiber = await ctx.plugin(policy);
    await ctx.serial('agent/created', { agent, source: 'startup' });
    assert.deepEqual(permissionChanges, ['read-only']);
    permissionChanges.push('manual-choice');
    for (const source of ['resume', 'clear', 'compact']) await ctx.serial('agent/created', { agent, source });
    agent.session.header.isSeeded = true;
    await ctx.serial('agent/created', { agent, source: 'startup' });
    assert.deepEqual(permissionChanges, ['read-only', 'manual-choice']);
    await ctx.serial('agent-preset/selected', 'fixture', 'vibe-chat');
    assert.deepEqual(permissionChanges, ['read-only', 'manual-choice', 'read-only']);
    await fiber.dispose();
    await ctx.serial('agent-preset/selected', 'fixture', 'vibe-chat');
    assert.equal(permissionChanges.length, 3);
  } finally { await ctx.fiber.dispose(); }
});

test('Desktop selection on a cold blank Session applies recommendation without a live Agent', async () => {
  const { ctx, agent, permissionChanges } = await setup();
  try {
    ctx.set('agents', { get: () => undefined, list: () => [] });
    await ctx.plugin(policy);
    ctx.emit('session/event', agent.session, { type: 'agent-preset/selected', data: { agentPreset: 'vibe-chat' } });
    assert.deepEqual(permissionChanges, ['read-only']);
    ctx.emit('session/event', agent.session, { type: 'permission/preset', data: { preset: 'workspace-write' } });
    assert.deepEqual(permissionChanges, ['read-only']);
  } finally { await ctx.fiber.dispose(); }
});
