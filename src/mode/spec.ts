export type ModeId = 'health' | 'chat' | 'ask' | 'spec' | 'agent' | 'claw';
export interface ModeSpec {
  readonly id: ModeId;
  readonly preset: string;
  readonly available: boolean;
  readonly permission: 'read-only' | 'workspace-write';
  readonly plan: boolean | 'user-controlled';
  readonly workspace: 'selected' | 'neutral' | 'claw';
  readonly memory: 'disabled' | 'read-write';
  readonly allowedTools: readonly string[] | 'upstream';
}

// This intermediate model is the source of truth, independent of Cordis YAML.
export const modes: readonly ModeSpec[] = Object.freeze([
  { id: 'health', preset: 'vibe-health', available: true, permission: 'read-only', plan: false, workspace: 'selected', memory: 'disabled', allowedTools: ['vibe_health'] },
  { id: 'chat', preset: 'vibe-chat', available: false, permission: 'read-only', plan: false, workspace: 'neutral', memory: 'read-write', allowedTools: ['web_search', 'web_fetch', 'safe_calculate', 'memory_read', 'memory_search', 'memory_upsert', 'memory_delete'] },
  { id: 'ask', preset: 'vibe-ask', available: false, permission: 'read-only', plan: false, workspace: 'selected', memory: 'disabled', allowedTools: ['read', 'grep', 'glob', 'read_image'] },
  { id: 'spec', preset: 'vibe-spec', available: false, permission: 'read-only', plan: true, workspace: 'selected', memory: 'disabled', allowedTools: ['read', 'grep', 'glob', 'read_image', 'exit_plan_mode'] },
  { id: 'agent', preset: 'standard', available: true, permission: 'workspace-write', plan: 'user-controlled', workspace: 'selected', memory: 'disabled', allowedTools: 'upstream' },
  { id: 'claw', preset: 'vibe-claw', available: false, permission: 'workspace-write', plan: false, workspace: 'claw', memory: 'disabled', allowedTools: ['web_search', 'web_fetch', 'browser', 'read', 'write', 'present'] },
].map(mode => Object.freeze({ ...mode, allowedTools: Array.isArray(mode.allowedTools) ? Object.freeze(mode.allowedTools) : mode.allowedTools })) as ModeSpec[]);

export function modeForPreset(preset: string | undefined): ModeSpec | undefined {
  return modes.find(mode => mode.preset === preset);
}
