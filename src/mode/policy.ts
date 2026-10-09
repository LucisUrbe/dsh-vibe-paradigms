import type { ModeSpec } from './spec.js';

export type PolicyTrigger = 'fresh' | 'resume' | 'fork' | 'selected';
export interface ModePolicy {
  readonly permission: ModeSpec['permission'];
  readonly plan?: boolean;
}

export function recommendedPolicy(mode: ModeSpec, trigger: PolicyTrigger): ModePolicy | undefined {
  if (!mode.available || trigger === 'resume' || trigger === 'fork') return undefined;
  return { permission: mode.permission, ...(typeof mode.plan === 'boolean' ? { plan: mode.plan } : {}) };
}

export function toolDenial(mode: ModeSpec, name: string): string | undefined {
  if (mode.allowedTools === 'upstream') return undefined;
  return mode.allowedTools.includes(name) ? undefined : `${mode.preset} does not permit this tool.`;
}
