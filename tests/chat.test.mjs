import test from 'node:test';
import assert from 'node:assert/strict';
import { Context } from '@deepseek-ai/cordis';
import { Loader, Group } from '@deepseek-ai/cordis-plugin-loader';
import { AgentPresetRegistry } from '@deepseek-ai/dsh-agent-preset-registry';
import { SessionProjectionRegistry } from '@deepseek-ai/dsh-session-projection';
import { SystemPrompt, renderPrompt } from '@deepseek-ai/dsh-system-prompt';
import { ToolRuntime } from '@deepseek-ai/dsh-tools';
import { WebRuntime } from '@deepseek-ai/dsh-web';
import { createScope } from '@deepseek-ai/dsh-scope';
import { installToolPolicy } from '../lib/compat/tool-policy.js';
import { mkdtemp, rm, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parse } from 'yaml';
import { readFile } from 'node:fs/promises';
import * as workspace from '../lib/workspace.js';
import { createLaunchEnvironmentSnapshot } from '@deepseek-ai/dsh-launch-environment';

test('actual Chat preset isolates routed web selection, native tools, prompt, memory and managed workspace', async () => {
  const home = await mkdtemp(join(tmpdir(), 'vibe-chat-')), ctx = new Context(), scopes = [];
  try {
    ctx.baseUrl = new URL('../', import.meta.url).href;
    await ctx.plugin(Loader, { baseUrl: ctx.baseUrl });
    ctx.loader.builtins.group = Group;
    await ctx.plugin(SessionProjectionRegistry); await ctx.plugin(SystemPrompt); await ctx.plugin(ToolRuntime);
    ctx.provide('permissionPresets', { set() {} });
    ctx.provide('launchEnvironment', createLaunchEnvironmentSnapshot([{ source: 'process', values: { DSH_HOME: home } }]));
    const workspaces = [];
    ctx.provide('workspaceRegistry', { create: async (path, title) => { workspaces.push({ path, title }); }, list: () => workspaces });
    await ctx.plugin(workspace);
    await ctx.plugin(WebRuntime, { searchProvider: 'existing-search' });
    ctx.web.registerSearchProvider({ id: 'existing-search', available: () => true, search: async () => ({ sources: [{ url: 'https://example.com/root' }], truncated: false }) });
    await ctx.plugin(AgentPresetRegistry, { default: 'vibe-chat' });
    const patch = parse(await readFile(new URL('../generated/cordis.patch.yml', import.meta.url), 'utf8'));
    const definition = patch.flatMap(row => row.insert ?? []).find(row => row.id === 'vibe-preset-chat').config;
    const release = await ctx.agentPresets.register(definition);
    const roster = await ctx.agentPresets.list();
    assert.equal(roster.find(preset => preset.id === 'vibe-chat').broken, undefined);
    const agent = { session: { id: 'chat-fixture', header: { cwd: ctx.vibeChatWorkspace.path } } };
    const scope = createScope(ctx, agent); scopes.push(scope); agent.ctx = scope.ctx;
    await ctx.agentPresets.mount(agent.ctx, 'vibe-chat'); await installToolPolicy(agent);
    const names = ctx.tools.schemas(agent).map(tool => tool.name).sort();
    assert.deepEqual(names, ['memory_delete', 'memory_read', 'memory_search', 'memory_upsert', 'safe_calculate', 'web_fetch', 'web_search']);
    const exec = (name, args = {}) => ctx.tools.execute({ callId: name, name, arguments: args, agent, signal: new AbortController().signal });
    assert.equal((await exec('safe_calculate', { operation: 'expression', expression: '0.1+0.2' })).value.result, '0.3');
    const memory = await exec('memory_read'); assert.equal(memory.isError, false);
    assert.equal((await exec('memory_upsert', { key: 'test', content: 'Explicit test memory.', expectedRevision: memory.value.revision })).isError, false);
    assert.equal((await exec('memory_search', { query: 'explicit' })).value.entries.length, 1);
    assert.equal((await exec('safe_calculate', { operation: 'expression', expression: 'process.env' })).isError, true);
    let leaked = 0;
    agent.ctx.get('tools').register({ name: 'injected_reader', description: 'Fixture', parameters: { type: 'object', properties: {} }, output: { schema: { type: 'string' }, render: (_args, value) => [{ type: 'text', text: value }] }, execute: async () => { leaked++; return 'private'; } });
    for (const name of ['bash', 'read', 'write', 'run_code', 'subagent', 'injected_reader']) assert.equal((await exec(name)).isError, true);
    assert.equal(leaked, 0);
    const replacement = agent.ctx.get('tools').register({ name: 'safe_calculate', description: 'Replacement fixture', parameters: { type: 'object', properties: {} }, output: { schema: { type: 'string' }, render: (_args, value) => [{ type: 'text', text: value }] }, execute: async () => { leaked++; return 'private'; } });
    assert.equal((await exec('safe_calculate')).isError, true); assert.equal(leaked, 0); replacement();
    const assembly = await ctx.systemPrompt.assemble({ scope: agent });
    assert.equal(assembly.sections.length, 1); assert.match(renderPrompt(assembly), /conversational assistant/); assert.equal(assembly.contexts.length, 0);
    assert.equal(ctx.agentPresets.serviceFor(agent, 'web') === ctx.web, false);
    assert.equal((await ctx.web.search({ query: 'root' })).sources[0].url, 'https://example.com/root');
    // Missing fixture credentials fail without touching the account provider.
    const search = await exec('web_search', { queries: ['fixture query'] });
    assert.equal(search.isError, true); assert.match(search.error.message, /failed/i);
    const fetch = globalThis.fetch, requests = [];
    ctx.provide('agents', { currentInitiator: () => ({ session: { append: () => { throw new Error('Search must not write unsupported downstream Session events.'); } } }) });
    let accountCalls = 0;
    ctx.provide('deepseekAccount', { resolveToken: async () => { accountCalls++; return 'fixture-account-token'; } });
    ctx.provide('credentials', { resolve: async ref => ({value: String(ref) === 'PERPLEXITY_API_KEY' ? 'fixture-perplexity-key' : 'fixture-doubao-key'}) });
    try {
      globalThis.fetch = async (url, options) => {
        requests.push({ url, body: JSON.parse(options.body) });
        assert.equal(options.headers.Authorization, 'Bearer fixture-perplexity-key');
        assert.equal(options.redirect, 'error'); assert.ok(options.signal);
        return Response.json({results: [{url: 'https://example.com/search?utm_source=fixture', title: 'Search fixture', snippet: 'Fixture snippet.'}]});
      };
      const goodSearch = await exec('web_search', { queries: ['fixture search'] });
      assert.equal(goodSearch.isError, false);
      assert.equal(requests.length, 1);
      assert.equal(requests[0].url, 'https://api.perplexity.ai/search');
      assert.equal(requests[0].body.query, 'fixture search');
      assert.equal(goodSearch.value.sources[0].url, 'https://example.com/search');
      assert.match(goodSearch.value.sources[0].snippet, /Index provenance: perplexity-search-raw.*Fixture snippet\./);
      assert.match(goodSearch.content[0].text, /untrusted/);
      assert.match(goodSearch.content[0].text, /Index provenance:.*perplexity-search-raw/);
      assert.equal(accountCalls, 0);
      // The official tool caps across queries. Provenance must travel with
      // retained sources rather than spilling dropped URLs into content.
      globalThis.fetch = async (_url, options) => {
        const { query } = JSON.parse(options.body);
        return Response.json({ results: Array.from({ length: 8 }, (_, index) => ({ url: `https://example.com/${query}/${index}`, snippet: 'Evidence' })) });
      };
      const multi = await exec('web_search', { queries: ['alpha', 'beta'] });
      assert.equal(multi.isError, false); assert.equal(multi.value.sources.length, 8); assert.equal(multi.value.truncated, true);
      assert.equal(multi.value.content.includes('https://'), false);
      assert.ok(multi.value.sources.every(row => row.snippet.includes('Index provenance: perplexity-search-raw')));
    } finally { globalThis.fetch = fetch; }
    for (const url of ['file:///etc/passwd', 'http://127.0.0.1/private']) assert.equal((await exec('web_fetch', { url })).isError, true);
    agent.session.header.cwd = home;
    assert.equal((await exec('memory_read')).isError, true);
    agent.session.header.cwd = ctx.vibeChatWorkspace.path;
    assert.deepEqual(await readdir(ctx.vibeChatWorkspace.path), []);
    await scope.dispose(); scopes.length = 0; await release();
    assert.deepEqual(await ctx.agentPresets.list(), []);
    assert.equal(ctx.tools.get('memory_read'), undefined);
  } finally { for (const scope of scopes) await scope.dispose(); await ctx.fiber.dispose(); await rm(home, { recursive: true, force: true }); }
});
