import type { Context } from '@deepseek-ai/cordis';
import type { Agent } from '@deepseek-ai/dsh-agent';
import type {} from '@deepseek-ai/dsh-agent-preset-registry';
import type {} from '@deepseek-ai/dsh-permission-presets';
import type {} from '@deepseek-ai/dsh-plan-mode';
import type {} from '@deepseek-ai/dsh-tools';
import type {} from '@deepseek-ai/dsh-web';
import type {} from '@deepseek-ai/dsh-workspace';

export const testedDshVersions = ['0.2.0-rc.2', '0.2.1-rc.5'] as const;
// Every DSH 0.x release from the first tested one. A 1.0.0 prerelease already
// belongs to the major update, so the range ends before 1.0.0-0. Keep it equal
// to package.json engines.dsh, which the Host uses to admit the bundle.
export const supportedDshRange = '>=0.2.0-rc.2 <1.0.0-0';
export const issuesUrl = 'https://github.com/LucisUrbe/dsh-vibe-paradigms/issues';

// Host diagnostics have no locale, so they default to Simplified Chinese.
export function compatibilityError(missing: readonly string[]): Error {
  return new Error(`dsh-vibe-paradigms 与当前 DSH 版本不兼容，缺少：${missing.join(', ')}。兼容性修复将在 ${issuesUrl} 发布，请等待插件更新。`);
}

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
  if (missing.length) throw compatibilityError(missing);
}
