import type { Context } from '@deepseek-ai/cordis';
import { assertRequired, probe, testedDshVersions } from './compat/probe.js';
import { modeForPreset } from './mode/spec.js';
import { toolDenial } from './mode/policy.js';

export const name = 'vibe-health';
export const inject = ['tools', 'agentPresets', 'permissionPresets'];
export interface Config { message?: string }

export function apply(ctx: Context, config: Config = {}): void {
  assertRequired(ctx, ['toolsRestrict', 'toolsGuard', 'nativePresentation', 'agentPresets', 'permissionPresets']);
  const mode = modeForPreset('vibe-health')!;
  ctx.tools.presentAs('native');
  // This is a standing preset scope. Visibility restrictions belong to the
  // actual Agent scope, where this tool is inherited rather than scope-owned.
  ctx.tools.guard(exec => toolDenial(mode, exec.name));
  ctx.tools.register({
    name: 'vibe_health',
    description: 'Check that the Vibe Paradigms health preset and public Harness services are available. Does not read files or access the network.',
    parameters: { type: 'object', properties: {}, additionalProperties: false },
    output: {
      schema: { type: 'object', properties: { status: { type: 'string' }, message: { type: 'string' }, preset: { type: 'string' }, testedDshVersions: { type: 'array', items: { type: 'string' } }, capabilities: { type: 'object', properties: Object.fromEntries(Object.keys(probe(ctx)).map(key => [key, { type: 'boolean' }])), additionalProperties: false } }, required: ['status', 'message', 'preset', 'testedDshVersions', 'capabilities'], additionalProperties: false },
      render: (_args, value) => [{ type: 'text', text: JSON.stringify(value) }],
    },
    async execute(_args, exec) {
      exec.signal.throwIfAborted();
      return { status: 'ok', message: config.message ?? 'Hello from Vibe Paradigms.', preset: 'vibe-health', testedDshVersions: [...testedDshVersions], capabilities: probe(ctx, exec.agent) };
    },
  });
}
