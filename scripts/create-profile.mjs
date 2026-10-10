import { spawnSync } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse, stringify } from 'yaml';

const root = fileURLToPath(new URL('../', import.meta.url));
const profile = process.argv[2] ?? 'vibe-paradigms';
if (!/^[a-z][a-z0-9-]*$/.test(profile) || ['desktop', 'web', 'headless', 'tui'].includes(profile)) {
  throw new Error('Choose a non-reserved custom profile name.');
}
const home = resolve(process.env.DSH_HOME ?? resolve(root, 'docs/runtime/dsh'));
const env = { ...process.env, DSH_HOME: home };
function run(args, silent = false) {
  const result = spawnSync('dsh', args, { cwd: root, env, stdio: ['ignore', silent ? 'ignore' : 'inherit', 'inherit'] });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error('Installed Desktop CLI could not prepare the custom profile.');
}
// Inherit shipped composition, but only dump: Desktop remains the application.
const profileExists = existsSync(resolve(home, 'profiles', profile, 'package.json'));
run(['--profile', profile, ...profileExists ? [] : ['--from-default-profile', 'web'], '--dump-config'], true);
run(['plugin', '--profile', profile, 'add', `link:${root}`, 'dsh-opencode-go@0.1.21', '--ignore-scripts']);
const patchPath = resolve(home, 'profiles', profile, 'cordis.patch.yml');
const patch = parse(await readFile(patchPath, 'utf8')) ?? [];
const modelRows = parse(await readFile(new URL('../config/profile.patch.yml', import.meta.url), 'utf8'));
for (const row of modelRows) {
  const index = patch.findIndex(existing => existing.id === row.id);
  if (index < 0) patch.push(row); else patch[index] = row;
}
await writeFile(patchPath, stringify(patch));
run(['--profile', profile, '--dump-config'], true);
console.log(`Custom profile ${profile} is ready. No app or network listener was started; no credentials were copied.`);
