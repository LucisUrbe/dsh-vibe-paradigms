import type { Context } from '@deepseek-ai/cordis';
import type { Agent } from '@deepseek-ai/dsh-agent';
import { modeForPreset } from '../mode/spec.js';
import { recommendedPolicy, type PolicyTrigger } from '../mode/policy.js';
import { assertRequired } from './probe.js';
import { isAbsolute } from 'node:path';
import { workspaceProblem } from '../mode/workspace-policy.js';
import type {} from '../workspace.js';

export function applyPolicy(ctx: Context, agent: Agent, trigger: PolicyTrigger): void {
  const mode = modeForPreset(ctx.agentPresets.composedPreset(agent.ctx));
  if (!mode) return;
  const policy = recommendedPolicy(mode, trigger);
  if (!policy) return;
  const cwd = agent.session.header.cwd;
  const managed = ctx.get('vibeChatWorkspace');
  const problem = workspaceProblem(mode, { selected: typeof cwd === 'string' && isAbsolute(cwd), ...(mode.workspace === 'neutral' && cwd === managed?.path ? { managedKind: 'neutral' as const } : {}) });
  // Workspace selection is user input, including persisted pre-migration cwd.
  // Throwing from this lifecycle listener terminates the Desktop Host. Apply
  // the restricted permission; the preset's execution guard rejects every
  // tool at an invalid cwd without turning a recoverable choice into a crash.
  if (problem) ctx.logger?.warn(`${mode.preset}: ${problem} Tools remain blocked outside the managed workspace.`);
  assertRequired(ctx, ['permissionPresets']);
  // A preset without a plan service cannot accidentally enter plan mode.
  const plan = ctx.agentPresets.serviceFor(agent, 'planMode');
  if (policy.plan === true) assertRequired(ctx, ['planMode'], agent);
  ctx.permissionPresets.set(agent.session, policy.permission);
  if (policy.plan !== undefined && plan) plan.set(agent, policy.plan);
}
