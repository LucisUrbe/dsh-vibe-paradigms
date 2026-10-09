import type { Context, Fiber } from '@deepseek-ai/cordis';
import type { Agent } from '@deepseek-ai/dsh-agent';
import { modeForPreset } from './mode/spec.js';
import { recommendedPolicy } from './mode/policy.js';
import { applyPolicy } from './compat/policy-adapter.js';
import { assertRequired } from './compat/probe.js';
import { installToolPolicy } from './compat/tool-policy.js';

export const name = 'vibe-mode-policy';
export const inject = ['agents', 'agentPresets', 'permissionPresets'];

export async function apply(ctx: Context): Promise<void> {
  assertRequired(ctx, ['agentPresets', 'permissionPresets']);
  const policies = new Map<Agent, Fiber>();
  ctx.effect(() => async () => {
    await Promise.all([...policies.values()].map(fiber => fiber.dispose()));
    policies.clear();
  });
  const restrict = async (agent: Agent) => {
    await policies.get(agent)?.dispose(); policies.delete(agent);
    const fiber = installToolPolicy(agent);
    if (fiber) { policies.set(agent, fiber); await fiber; }
  };
  ctx.on('agent/disposed', ({ agent }) => { policies.delete(agent); });
  ctx.on('agent/created', async ({ agent, source }) => {
    await restrict(agent);
    if (source !== 'startup') return;
    const trigger = agent.session.header.isSeeded ? 'fork' : 'fresh';
    applyPolicy(ctx, agent, trigger);
  });
  // Desktop can select a preset on a persisted blank Session before it owns
  // a live Agent. Observe the committed selection rather than resetting every
  // resumed Agent's permission, which would overwrite manual choices.
  ctx.on('session/event', (session, event) => {
    if (event.type !== 'agent-preset/selected') return;
    const mode = modeForPreset(event.data.agentPreset);
    const policy = mode && recommendedPolicy(mode, 'selected');
    if (policy) ctx.permissionPresets.set(session, policy.permission);
  });
  ctx.on('agent-preset/selected', async sessionId => {
    const agent = ctx.agents.get(sessionId);
    if (agent) { await restrict(agent); applyPolicy(ctx, agent, 'selected'); }
  });
  // HMR attaches security policy to already live Agents without resetting
  // any Session permission or collaboration state.
  for (const agent of ctx.agents.list()) await restrict(agent);
}
