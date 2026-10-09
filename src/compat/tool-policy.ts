import type { Context } from '@deepseek-ai/cordis';
import type { Agent } from '@deepseek-ai/dsh-agent';
import { scopeParentOf } from '@deepseek-ai/dsh-scope';
import { assertRequired } from './probe.js';
import { modeForPreset } from '../mode/spec.js';
import { toolDenial } from '../mode/policy.js';

export function installToolPolicy(agent: Agent) {
  const presets = agent.ctx.get('agentPresets');
  const mode = modeForPreset(presets?.composedPreset(agent.ctx));
  if (!mode?.available || mode.allowedTools === 'upstream') return undefined;
  const allowlist = mode.allowedTools;
  return agent.ctx.inject(['tools'], (ctx: Context) => {
    assertRequired(ctx, ['toolsRestrict', 'toolsGuard', 'nativePresentation']);
    const mounted = new Set(ctx.tools.schemas(agent).map(tool => tool.name));
    const allow = allowlist.filter(name => mounted.has(name));
    if (mode.id === 'health' && !allow.includes('vibe_health')) throw new Error('Health tool is missing from the actual Agent scope.');
    if (mode.id === 'chat' && allow.length !== allowlist.length) throw new Error('Chat requires its complete tool suite in the actual Agent scope.');
    ctx.tools.presentAs('native');
    ctx.tools.restrict({ allow });
    const parent = scopeParentOf(agent);
    const definitions = new Map(allow.map(name => [name, ctx.tools.get(name, parent)]));
    ctx.tools.guard(exec => toolDenial(mode, exec.name) ??
      (ctx.tools.get(exec.name, agent) !== definitions.get(exec.name) ? 'The mode does not permit replacement tools from another scope.' : undefined));
  });
}
