import type { Context } from '@deepseek-ai/cordis';
import { mkdir, lstat, realpath } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { launchEnvironmentOf } from '@deepseek-ai/dsh-launch-environment';
import type {} from '@deepseek-ai/dsh-workspace';

declare module '@deepseek-ai/cordis' {
  interface Context { vibeChatWorkspace: { path: string; home: string } }
}
export const name = 'vibe-chat-workspace';
export const inject = ['workspaceRegistry'];
export function harnessHome(ctx: Context): string {
  return resolve(launchEnvironmentOf(ctx).get('DSH_HOME')?.value || join(homedir(), '.dsh'));
}
export async function apply(ctx: Context): Promise<void> {
  const home = harnessHome(ctx), directory = join(home, 'vibe-paradigms', 'chat-workspace');
  await mkdir(directory, { recursive: true, mode: 0o700 });
  if ((await lstat(join(home, 'vibe-paradigms'))).isSymbolicLink() || (await lstat(directory)).isSymbolicLink()) throw new Error('Chat workspace must be a managed directory, not a symbolic link.');
  const path = await realpath(directory);
  const workspace = await ctx.workspaceRegistry.create(path, '聊天模式');
  // Migrate the old default title while preserving user-authored titles.
  if (workspace.title === 'Chat') await workspace.setTitle('聊天模式');
  ctx.provide('vibeChatWorkspace', { path, home });
}
