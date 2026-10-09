import { execFileSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const git = (...args) => execFileSync('git', args, { cwd: root, maxBuffer: 64 * 1024 * 1024 });
const findings = [];
const privateName = /(?:^|\/)(?:\.?credentials(?:[./]|$)|secrets(?:\/|$)|\.dsh(?:\/|$)|\.local(?:\/|$)|local-artifacts(?:\/|$)|compatibility\/private(?:\/|$)|\.env(?:\.(?!example$|sample$)[^/]+)?$)|\.(?:pem|key|p12|pfx|sqlite\w*|db|jsonl(?:\.\w+)?|bak|backup)$/i;
const rules = [
  ['provider-token', /(?:oc_sk_|pplx-|sk-)[A-Za-z0-9_-]{16,}/],
  ['github-token', /(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{30,})/],
  ['cloud-access-key', /\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/],
  ['private-key', /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/],
  ['credential-assignment', /(?:api[_-]?key|access[_-]?token|refresh[_-]?token|password|authorization)["']?\s*[:=]\s*["'](?:Bearer )?[A-Za-z0-9_+\/.=-]{20,}["']/i],
  ['personal-home-path', /(?:\/Users\/(?!<|\$)[^/\s"']+\/|[A-Z]:\\Users\\(?!<)[^\\\s"']+\\)/],
  ['credential-in-url', /https?:\/\/[^\s/:]+:[^\s/@]+@/],
];
// Compare local credentials without displaying them, including nonstandard key formats.
const known = existsSync(resolve(root, 'credentials.log'))
  ? readFileSync(resolve(root, 'credentials.log'), 'utf8').match(/(?:oc_sk_|pplx-|sk-)[A-Za-z0-9_-]+/g) ?? [] : [];

function scan(name, bytes, scope) {
  if (privateName.test(name)) findings.push({ scope, file: name, rule: 'private-artifact' });
  if (bytes.includes(0)) return;
  const content = bytes.toString('utf8');
  for (const [index, line] of content.split('\n').entries()) {
    for (const [rule, pattern] of rules) if (pattern.test(line)) findings.push({ scope, file: name, line: index + 1, rule });
    if (known.some(value => line.includes(value))) findings.push({ scope, file: name, line: index + 1, rule: 'known-local-credential' });
  }
}

const candidates = [...new Set(git('ls-files', '-z', '--cached', '--others', '--exclude-standard').toString().split('\0').filter(Boolean))];
for (const name of candidates) if (existsSync(resolve(root, name))) scan(name, readFileSync(resolve(root, name)), 'worktree');
let historyBlobs = 0;
if (process.argv.includes('--history')) {
  // These are the refs a normal GitHub push can publish. Codex local capture refs
  // can contain pre-redaction snapshots and must never be pushed with --mirror.
  const objects = git('rev-list', '--objects', '--branches', '--tags', '--remotes').toString().trim().split('\n');
  for (const object of objects) {
    const space = object.indexOf(' ');
    if (space < 0) continue;
    const oid = object.slice(0, space), name = object.slice(space + 1);
    if (git('cat-file', '-t', oid).toString().trim() !== 'blob') continue;
    scan(name, git('cat-file', 'blob', oid), 'history'); historyBlobs++;
  }
}
let packageFiles = 0;
if (process.argv.includes('--pack')) {
  const [manifest] = JSON.parse(execFileSync('npm', ['pack', '--dry-run', '--ignore-scripts', '--json'], {
    cwd: root, encoding: 'utf8', maxBuffer: 8 * 1024 * 1024,
    env: { ...process.env, npm_config_cache: resolve(root, '.npm') }, stdio: ['ignore', 'pipe', 'pipe'],
  }));
  for (const file of manifest.files) { scan(file.path, readFileSync(resolve(root, file.path)), 'npm-pack'); packageFiles++; }
}
console.log(JSON.stringify({ passed: findings.length === 0, worktreeFiles: candidates.length, historyBlobs, packageFiles, findings }, null, 2));
if (findings.length) process.exitCode = 1;
