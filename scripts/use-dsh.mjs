import { execFileSync } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';

// Pin the development Host to one published DSH release (an exact version or a
// dist-tag such as `next`), so tests run against what that release ships. Only
// devDependencies change; the published peer and engines ranges stay as declared.
const requested = process.argv[2];
if (!requested) throw new Error('Usage: node scripts/use-dsh.mjs <dsh version or dist-tag>');
const manifestUrl = new URL('../package.json', import.meta.url);
const view = (spec, ...fields) => JSON.parse(execFileSync('pnpm', ['view', spec, ...fields, '--json'], { encoding: 'utf8' }) || 'null');
const version = view(`@deepseek-ai/dsh-agent@${requested}`, 'version');
if (typeof version !== 'string') throw new Error(`No single DSH release matches ${requested}.`);
// The HMR package peers on exactly the Cordis line its release was built with.
const hmr = view(`@deepseek-ai/dsh-hmr@${version}`, 'dependencies', 'peerDependencies');
const ranges = { ...hmr.dependencies, ...hmr.peerDependencies };
const exact = name => {
  const range = ranges[name];
  if (typeof range !== 'string') throw new Error(`dsh-hmr@${version} does not declare ${name}.`);
  const found = view(`${name}@${range}`, 'version');
  return Array.isArray(found) ? found.at(-1) : found;
};
const manifest = JSON.parse(await readFile(manifestUrl, 'utf8'));
for (const name of Object.keys(manifest.devDependencies)) {
  if (name.startsWith('@deepseek-ai/dsh-')) manifest.devDependencies[name] = version;
  else if (name.startsWith('@deepseek-ai/')) manifest.devDependencies[name] = exact(name);
}
await writeFile(manifestUrl, JSON.stringify(manifest, null, 2) + '\n');
execFileSync('pnpm', ['install', '--no-frozen-lockfile', '--config.confirm-modules-purge=false'], { stdio: 'inherit' });
console.log(JSON.stringify({ dshVersion: version, requested }));
