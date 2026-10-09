import type { Context } from '@deepseek-ai/cordis';
import type { Agent } from '@deepseek-ai/dsh-agent';
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
    ctx.tools.presentAs('native');
    ctx.tools.restrict({ allow });
    ctx.tools.guard(exec => toolDenial(mode, exec.name));
  });
}
