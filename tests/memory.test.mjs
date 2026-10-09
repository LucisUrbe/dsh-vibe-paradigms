import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile, readFile, symlink, mkdir, stat, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { MarkdownMemory } from '../lib/memory/markdown-memory.js';

test('Markdown memory persists across instances, preserves manual sections, avoids duplicates and uses private atomic writes', async () => {
  const home = await mkdtemp(join(tmpdir(), 'vibe-memory-'));
  try {
    const memory = new MarkdownMemory(home), initial = await memory.read();
    const saved = await memory.change('upsert', 'editor.preference', 'Use dark mode.\n### This is content, not a key.', initial.revision);
    assert.equal(saved.entries.length, 1);
    assert.equal((await stat(memory.file)).mode & 0o777, 0o600);
    assert.deepEqual((await new MarkdownMemory(home).read()).entries, saved.entries);
    assert.equal((await memory.change('upsert', 'editor.preference', saved.entries[0].content, saved.revision)).revision, saved.revision);
    await assert.rejects(memory.change('upsert', 'another.key', saved.entries[0].content, saved.revision), /already exists/);
    await writeFile(memory.file, saved.markdown + '\n## Human notes\n\nKeep this paragraph.\n', { mode: 0o600 });
    await assert.rejects(memory.change('delete', 'editor.preference', undefined, saved.revision), /changed/);
    const edited = await memory.read();
    const updated = await memory.change('upsert', 'editor.preference', 'Use light mode.', edited.revision);
    assert.match(updated.markdown, /Keep this paragraph/);
    assert.equal((await memory.search('LIGHT')).entries.length, 1);
    const deleted = await memory.change('delete', 'editor.preference', undefined, updated.revision);
    assert.equal(deleted.entries.length, 0); assert.match(deleted.markdown, /Keep this paragraph/);
    assert.deepEqual((await readdir(memory.directory)).filter(name => name !== 'memory.md'), []);
  } finally { await rm(home, { recursive: true, force: true }); }
});

test('concurrent writers cannot lose updates; path input, links, oversized and malformed memory fail closed', async () => {
  const home = await mkdtemp(join(tmpdir(), 'vibe-memory-'));
  try {
    const first = new MarkdownMemory(home), second = new MarkdownMemory(home), initial = await first.read();
    const results = await Promise.allSettled([
      first.change('upsert', 'one', 'First writer.', initial.revision),
      second.change('upsert', 'two', 'Second writer.', initial.revision),
    ]);
    assert.equal(results.filter(x => x.status === 'fulfilled').length, 1);
    assert.equal((await first.read()).entries.length, 1);
    await assert.rejects(first.change('upsert', '../escape', 'x', initial.revision));
    await assert.rejects(first.change('upsert', 'one', 'x'.repeat(9000), initial.revision));
    const external = join(home, 'external.md'); await writeFile(external, 'private');
    await rm(first.file); await symlink(external, first.file);
    await assert.rejects(first.read()); assert.equal(await readFile(external, 'utf8'), 'private');
    await rm(first.file); await writeFile(first.file, '# User Memory\n\n### duplicate\none\n\n### duplicate\ntwo\n');
    await assert.rejects(first.read(), /Duplicate/);
    await writeFile(first.file, Buffer.from([0xff])); await assert.rejects(first.read());
    await writeFile(first.file, 'x'.repeat(65537)); await assert.rejects(first.read(), /64 KiB/);
    const abort = new AbortController(); abort.abort(); await assert.rejects(first.read(abort.signal));
    await rm(first.directory, { recursive: true }); await mkdir(join(home, 'redirect')); await symlink(join(home, 'redirect'), first.directory);
    await assert.rejects(first.read(), /symbolic/);
  } finally { await rm(home, { recursive: true, force: true }); }
});
