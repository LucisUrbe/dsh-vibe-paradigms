import test from 'node:test';
import assert from 'node:assert/strict';
import { modes, modeForPreset } from '../lib/mode/spec.js';
import { recommendedPolicy, toolDenial } from '../lib/mode/policy.js';
import { applyPolicy } from '../lib/compat/policy-adapter.js';
import { assertRequired } from '../lib/compat/probe.js';
import { workspaceProblem } from '../lib/mode/workspace-policy.js';

test('restricted modes deny future tools; Standard inherits upstream tools', () => {
  for (const mode of modes.filter(mode => mode.id !== 'agent')) {
    for (const tool of ['bash', 'run_code', 'plugin_manager', 'future_tool']) assert.ok(toolDenial(mode, tool));
  }
  assert.equal(toolDenial(modeForPreset('standard'), 'future_tool'), undefined);
  assert.equal(toolDenial(modeForPreset('vibe-health'), 'vibe_health'), undefined);
});

test('resume and fork preserve permission and plan; inactive modes cannot apply policies', () => {
  for (const mode of modes) {
    assert.equal(recommendedPolicy(mode, 'resume'), undefined);
    assert.equal(recommendedPolicy(mode, 'fork'), undefined);
    if (!mode.available) assert.equal(recommendedPolicy(mode, 'fresh'), undefined);
  }
  assert.deepEqual(recommendedPolicy(modeForPreset('standard'), 'selected'), { permission: 'workspace-write' });
});

test('policy uses actual composition, Session permission target, and isolated plan service', () => {
  const calls = [], session = { header: { agentPreset: 'standard', cwd: '/fixture' } }, agent = { ctx: {}, session };
  const ctx = {
    agentPresets: { composedPreset: () => 'vibe-health', serviceFor: () => ({ set: (target, value) => calls.push(['plan', target, value]) }) },
    permissionPresets: { set: (target, value) => calls.push(['permission', target, value]) },
  };
  ctx.get = name => ctx[name];
  applyPolicy(ctx, agent, 'fresh');
  assert.deepEqual(calls, [['permission', session, 'read-only'], ['plan', agent, false]]);
  calls.length = 0;
  applyPolicy(ctx, agent, 'resume'); applyPolicy(ctx, agent, 'fork');
  assert.deepEqual(calls, []);
});

test('workspace selection and managed workspace requirements remain separate from permission', () => {
  assert.ok(workspaceProblem(modeForPreset('vibe-health'), { selected: false }));
  assert.equal(workspaceProblem(modeForPreset('vibe-health'), { selected: true }), undefined);
  assert.ok(workspaceProblem(modeForPreset('vibe-chat'), { selected: true }));
  assert.equal(workspaceProblem(modeForPreset('vibe-chat'), { selected: true, managedKind: 'neutral' }), undefined);
});

test('Chat selection outside managed storage applies restrictive permission without crashing the Host', () => {
  const calls = [], warnings = [], session = { header: { cwd: '/previous-storage/chat-workspace' } }, agent = { ctx: {}, session };
  const ctx = {
    agentPresets: { composedPreset: () => 'vibe-chat', serviceFor: () => undefined },
    vibeChatWorkspace: { path: '/managed/chat-workspace' },
    permissionPresets: { set: (target, value) => calls.push([target, value]) },
    logger: { warn: text => warnings.push(text) },
  };
  ctx.get = name => ctx[name];
  assert.doesNotThrow(() => applyPolicy(ctx, agent, 'selected'));
  assert.deepEqual(calls, [[session, 'read-only']]); assert.match(warnings[0], /Tools remain blocked/);
});

test('missing security seam fails explicitly', () => {
  assert.throws(() => assertRequired({ get: () => undefined }, ['toolsGuard', 'agentPresets']), /toolsGuard, agentPresets/);
});
