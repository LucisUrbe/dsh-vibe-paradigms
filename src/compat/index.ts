import type { Context } from '@deepseek-ai/cordis';
import * as credentials from '@deepseek-ai/dsh-credentials';
import * as launch from '@deepseek-ai/dsh-launch-environment';
import * as scope from '@deepseek-ai/dsh-scope';
import * as prompt from '@deepseek-ai/dsh-system-prompt';
import * as official from '@deepseek-ai/dsh-web-search-deepseek';
import type {} from '@deepseek-ai/dsh-settings';
import type {} from '../workspace.js';
import { compatibilityError, probe } from './probe.js';

export const name = 'vibe-compat';
// The same root services the bundle's other root rows wait for. A renamed
// service leaves this row pending, which the client alert reports as well.
export const inject = ['agents', 'agentPresets', 'permissionPresets', 'workspaceRegistry', 'settings', 'web'];

// Namespace imports keep a removed export observable instead of failing the
// module link, so the failure names what changed in the Host.
export function missingExports(): string[] {
  const checks: Record<string, unknown> = {
    'dsh-system-prompt.PERSONA_PREFIX_SECTION': typeof prompt.PERSONA_PREFIX_SECTION === 'string',
    'dsh-scope.scopeParentOf': typeof scope.scopeParentOf === 'function',
    'dsh-credentials.credentialRef': typeof credentials.credentialRef === 'function',
    'dsh-launch-environment.launchEnvironmentOf': typeof launch.launchEnvironmentOf === 'function',
    'dsh-web-search-deepseek.DeepSeekSearchProvider': typeof official.DeepSeekSearchProvider === 'function',
    'dsh-web-search-deepseek.DEEPSEEK_DEFAULT_BASE_URL': typeof official.DEEPSEEK_DEFAULT_BASE_URL === 'string',
  };
  return Object.keys(checks).filter(key => !checks[key]);
}

export function missingFeatures(ctx: Context): string[] {
  const result = probe(ctx);
  const features: Record<string, boolean> = {
    agentPresets: result.agentPresets,
    permissionPresets: result.permissionPresets,
    web: result.web,
    workspaceRegistry: result.workspaceRegistry && typeof ctx.get('workspaceRegistry')?.create === 'function',
    agents: typeof ctx.get('agents')?.list === 'function' && typeof ctx.get('agents')?.get === 'function',
    settings: typeof ctx.get('settings')?.describe === 'function' && typeof ctx.get('settings')?.configure === 'function',
  };
  // Tools and the system prompt are mounted per preset; judge them here only
  // when this realm also provides them.
  if (ctx.get('tools')) Object.assign(features, { toolsRestrict: result.toolsRestrict, toolsGuard: result.toolsGuard, nativePresentation: result.nativePresentation });
  const systemPrompt = ctx.get('systemPrompt');
  if (systemPrompt) features.systemPrompt = typeof systemPrompt.section === 'function' && typeof systemPrompt.suppressRuntimeContext === 'function';
  return [...Object.keys(features).filter(key => !features[key]), ...missingExports()];
}

// Fail this row at startup instead of at the first Chat session. Nothing
// depends on it; its failed phase is what the client alert reads.
export function apply(ctx: Context): void {
  const missing = missingFeatures(ctx);
  if (missing.length) throw compatibilityError(missing);
}
