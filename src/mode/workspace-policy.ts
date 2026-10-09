import type { ModeSpec } from './spec.js';

export interface WorkspaceEvidence {
  readonly selected: boolean;
  readonly managedKind?: 'neutral' | 'claw';
}

export function workspaceProblem(mode: ModeSpec, evidence: WorkspaceEvidence): string | undefined {
  if (!evidence.selected) return 'The mode requires an absolute selected workspace.';
  if (mode.workspace !== 'selected' && evidence.managedKind !== mode.workspace) {
    return 'The mode requires its own managed workspace.';
  }
  return undefined;
}
