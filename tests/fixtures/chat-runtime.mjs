import { Context } from '@deepseek-ai/cordis';
import { Loader, Group } from '@deepseek-ai/cordis-plugin-loader';
import { AgentPresetRegistry } from '@deepseek-ai/dsh-agent-preset-registry';
import { SessionProjectionRegistry } from '@deepseek-ai/dsh-session-projection';
import { SystemPrompt } from '@deepseek-ai/dsh-system-prompt';
import { ToolRuntime } from '@deepseek-ai/dsh-tools';
import { createLaunchEnvironmentSnapshot } from '@deepseek-ai/dsh-launch-environment';
import { parse } from 'yaml';
import { readFile, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import * as workspace from '../../lib/workspace.js';

// Real Chat composition and public Host services; only permission, workspace
// persistence and the Agent handle are fixtures. No model or network calls.
export async function chatRuntime() {
  const home = await mkdtemp(join(tmpdir(), 'vibe-chat-')), ctx = new Context();
  const dispose = async () => { await ctx.fiber.dispose(); await rm(home, { recursive: true, force: true }); };
  try {
    ctx.baseUrl = new URL('../../', import.meta.url).href;
    await ctx.plugin(Loader, { baseUrl: ctx.baseUrl });
    ctx.loader.builtins.group = Group;
    await ctx.plugin(SessionProjectionRegistry); await ctx.plugin(SystemPrompt); await ctx.plugin(ToolRuntime);
    ctx.provide('permissionPresets', { set() {}, current() { return 'read-only'; } });
    ctx.provide('launchEnvironment', createLaunchEnvironmentSnapshot([{ source: 'process', values: { DSH_HOME: home } }]));
    const workspaces = [];
    ctx.provide('workspaceRegistry', { create: async (path, title) => { const entity = { path, title }; workspaces.push(entity); return entity; }, list: () => workspaces });
    await ctx.plugin(workspace);
    await ctx.plugin(AgentPresetRegistry, { default: 'vibe-chat' });
    const patch = parse(await readFile(new URL('../../generated/cordis.patch.yml', import.meta.url), 'utf8'));
    const definition = patch.flatMap(row => row.insert ?? []).find(row => row.id === 'vibe-preset-chat').config;
    return { home, ctx, workspaces, definition, dispose };
  } catch (error) { await dispose(); throw error; }
}
