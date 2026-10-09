import type { Context } from '@deepseek-ai/cordis';
import type { Agent } from '@deepseek-ai/dsh-agent';
import type {} from '@deepseek-ai/dsh-agent-preset-registry';
import type {} from '@deepseek-ai/dsh-permission-presets';
import type {} from '@deepseek-ai/dsh-plan-mode';
import type {} from '@deepseek-ai/dsh-tools';
import type {} from '@deepseek-ai/dsh-web';
import type {} from '@deepseek-ai/dsh-workspace';

export const testedDshVersions = ['0.2.0-rc.2'] as const;

export function probe(ctx: Context, agent?: Agent) {
  // Public reflection is the supported way to probe optional services without
  // declaring them as required dependencies and stalling preset activation.
  const tools = ctx.get('tools'), presets = ctx.get('agentPresets');
  const plan = agent ? presets?.serviceFor(agent, 'planMode') : ctx.get('planMode');
  return {
    toolsRestrict: typeof tools?.restrict === 'function',
    toolsGuard: typeof tools?.guard === 'function',
    nativePresentation: typeof tools?.presentAs === 'function',
    agentPresets: typeof presets?.composedPreset === 'function' && typeof presets?.serviceFor === 'function',
    permissionPresets: typeof ctx.get('permissionPresets')?.set === 'function',
    planMode: typeof plan?.set === 'function' && typeof plan?.get === 'function',
    web: typeof ctx.get('web')?.registerSearchProvider === 'function',
    workspaceRegistry: typeof ctx.get('workspaceRegistry')?.list === 'function',
  };
}

export function assertRequired(ctx: Context, features: readonly (keyof ReturnType<typeof probe>)[], agent?: Agent): void {
  const result = probe(ctx, agent);
  const missing = features.filter(feature => !result[feature]);
  if (missing.length) throw new Error(`Five Modes compatibility check failed: ${missing.join(', ')}.`);
}
