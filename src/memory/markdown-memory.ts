import { constants } from 'node:fs';
import { mkdir, open, rename, unlink, lstat, realpath } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { setTimeout } from 'node:timers/promises';

const MAX_BYTES = 65536;
const EMPTY = '# User Memory\n\nExplicitly saved information. Edit entries as Markdown.\n\n## Memories\n\n';
export interface MemoryEntry { key: string; content: string }
interface Block extends MemoryEntry { start: number; end: number }
export interface MemorySnapshot { revision: string; markdown: string; entries: MemoryEntry[] }
function key(value: string): void {
  if (typeof value !== 'string' || !/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,79}$/.test(value)) throw new Error('Memory key must be 1 to 80 letters, digits, dots, underscores or hyphens.');
}
function blocks(markdown: string): Block[] {
  const headings = [...markdown.matchAll(/^#{1,3} .+$/gm)];
  const seen = new Set<string>(), result: Block[] = [];
  for (let i = 0; i < headings.length; i++) {
    const heading = headings[i]!;
    if (!heading[0].startsWith('### ')) continue;
    const name = heading[0].slice(4).trim(); key(name);
    if (seen.has(name)) throw new Error('Duplicate memory key; edit memory.md to resolve it.');
    seen.add(name);
    const start = heading.index!, end = headings[i + 1]?.index ?? markdown.length;
    const body = markdown.slice(start + heading[0].length, end).trim();
    const content = body.replace(/^- updated:.*\n?/m, '').replace(/^- content: ?/m, '').replace(/^  /gm, '').trim();
    result.push({ key: name, content, start, end });
  }
  return result;
}
export class MarkdownMemory {
  readonly directory: string;
  readonly file: string;
  constructor(home: string) {
    this.directory = join(resolve(home), 'vibe-paradigms', 'memory');
    this.file = join(this.directory, 'memory.md');
  }
  private async prepare(): Promise<void> {
    await mkdir(this.directory, { recursive: true, mode: 0o700 });
    // Resolve the trusted home once; managed descendants must not redirect.
    const parent = resolve(this.directory, '..');
    if ((await lstat(parent)).isSymbolicLink() || (await lstat(this.directory)).isSymbolicLink()) throw new Error('Managed memory directories must not be symbolic links.');
  }
  async read(signal?: AbortSignal): Promise<MemorySnapshot> {
    signal?.throwIfAborted(); await this.prepare();
    let markdown = EMPTY;
    try {
      const handle = await open(this.file, constants.O_RDONLY | constants.O_NOFOLLOW);
      try {
        const stat = await handle.stat();
        if (!stat.isFile() || stat.nlink !== 1 || stat.size > MAX_BYTES) throw new Error('Memory must be a regular private file of at most 64 KiB.');
        const buffer = Buffer.alloc(MAX_BYTES + 1);
        let length = 0;
        while (length < buffer.length) {
          const { bytesRead } = await handle.read(buffer, length, buffer.length - length, null);
          if (!bytesRead) break;
          length += bytesRead;
        }
        if (length > MAX_BYTES) throw new Error('Memory exceeds 64 KiB.');
        const bytes = buffer.subarray(0, length);
        markdown = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
      } finally { await handle.close(); }
    } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
    signal?.throwIfAborted();
    return { revision: createHash('sha256').update(markdown).digest('hex'), markdown, entries: blocks(markdown).map(({ key, content }) => ({ key, content })) };
  }
  async search(query: string, signal?: AbortSignal): Promise<MemorySnapshot> {
    if (typeof query !== 'string' || !query.trim() || query.length > 256) throw new Error('Search query must contain 1 to 256 characters.');
    const snapshot = await this.read(signal), needle = query.toLocaleLowerCase();
    return { ...snapshot, markdown: '', entries: snapshot.entries.filter(entry => `${entry.key}\n${entry.content}`.toLocaleLowerCase().includes(needle)) };
  }
  async change(action: 'upsert' | 'delete', name: string, content: string | undefined, expectedRevision: string, signal?: AbortSignal): Promise<MemorySnapshot> {
    key(name);
    if (typeof expectedRevision !== 'string' || !/^[a-f0-9]{64}$/.test(expectedRevision)) throw new Error('Read memory first and supply its expectedRevision.');
    if (action === 'upsert' && (typeof content !== 'string' || !content.trim() || Buffer.byteLength(content) > 8192 || content.includes('\0'))) throw new Error('Memory content must contain 1 to 8192 UTF-8 bytes.');
    signal?.throwIfAborted(); await this.prepare();
    const directory = await realpath(this.directory), lockPath = join(directory, 'memory.lock');
    const deadline = Date.now() + 5000;
    let lock;
    while (!lock) {
      signal?.throwIfAborted();
      try { lock = await open(lockPath, constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY | constants.O_NOFOLLOW, 0o600); }
      catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
        if (Date.now() >= deadline) throw new Error('Memory is locked; retry after the writer finishes. An abandoned lock requires operator inspection.');
        await setTimeout(25, undefined, { signal });
      }
    }
    const temp = join(directory, `.memory-${randomUUID()}.tmp`);
    try {
      const current = await this.read(signal);
      if (current.revision !== expectedRevision) throw new Error('Memory changed since it was read. Read again before writing.');
      const found = blocks(current.markdown).find(entry => entry.key === name);
      if (action === 'upsert' && current.entries.some(entry => entry.key !== name && entry.content === content!.trim())) throw new Error('This information already exists under another memory key. Update that entry instead.');
      if (action === 'delete' && !found || action === 'upsert' && found?.content === content!.trim()) return current;
      const replacement = action === 'delete' ? '' : `### ${name}\n- updated: ${new Date().toISOString()}\n- content: ${content!.trim().split('\n').join('\n  ')}\n\n`;
      const markdown = found ? current.markdown.slice(0, found.start) + replacement + current.markdown.slice(found.end) : current.markdown.trimEnd() + '\n\n' + replacement;
      if (Buffer.byteLength(markdown) > MAX_BYTES) throw new Error('Memory exceeds 64 KiB.');
      blocks(markdown);
      const file = await open(temp, 'wx', 0o600);
      try { await file.writeFile(markdown, 'utf8'); await file.sync(); } finally { await file.close(); }
      signal?.throwIfAborted();
      // Detect intervening manual edits as well as other plugin writers.
      if ((await this.read(signal)).revision !== current.revision) throw new Error('Memory changed during the update. Read again before writing.');
      await rename(temp, this.file);
      return await this.read();
    } finally {
      try { await unlink(temp).catch(error => { if (error.code !== 'ENOENT') throw error; }); }
      finally { try { await lock.close(); } finally { await unlink(lockPath); } }
    }
  }
}
