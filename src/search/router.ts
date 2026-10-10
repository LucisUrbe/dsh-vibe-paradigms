import { WebError } from '@deepseek-ai/dsh-web';
import type { WebSearchProvider, WebSearchRequest, WebSearchResult } from '@deepseek-ai/dsh-web';
import { queryText, resultLimit } from './http.js';
import { source, mergeSources, shortText, type SearchSource } from './normalize.js';

export type SearchPolicy = 'auto' | 'cross-check' | 'deepseek-official';
export interface SearchAttempt { provider: string; status: 'ok' | 'empty' | 'error'; code?: string }
export interface SearchTrace { policy: SearchPolicy; attempts: SearchAttempt[]; sources: SearchSource[]; truncated: boolean }
const chinese = /\p{Script=Han}|\b(?:China|Chinese|Beijing|Shanghai)\b/iu;
const check = /事实核查|核实|真假|谣言|争议|舆论|重大新闻|法律|医疗|用药|诊断|投资|股市|\b(?:fact[ -]?check|verify|controvers|breaking news|legal|medical|diagnosis|investment)\b/iu;

export class SearchRouter implements WebSearchProvider {
  readonly id = 'vibe-paradigms-search';
  constructor(private readonly providers: ReadonlyMap<string, WebSearchProvider>, private readonly policy: SearchPolicy | (() => { policy?: SearchPolicy; allowOfficialFallback?: boolean }) = 'auto', private readonly allowOfficialFallback = false, private readonly record?: (trace: SearchTrace) => void) {}
  available(): boolean { return true; }
  async search(request: WebSearchRequest, signal?: AbortSignal): Promise<WebSearchResult> {
    const query = queryText(request), limit = resultLimit(request), attempts: SearchAttempt[] = [], groups: SearchSource[][] = [];
    const options = typeof this.policy === 'function' ? this.policy() : { policy: this.policy, allowOfficialFallback: this.allowOfficialFallback };
    const configured = options.policy ?? 'auto';
    const policy = configured === 'auto' && check.test(query) ? 'cross-check' : configured;
    const primary = chinese.test(query) ? 'doubao-search' : 'perplexity-search-raw';
    const secondary = primary === 'doubao-search' ? 'perplexity-search-raw' : 'doubao-search';
    const run = async (id: string) => {
      signal?.throwIfAborted();
      const provider = this.providers.get(id);
      try {
        if (!provider?.available()) throw new WebError('Search provider unavailable.', 'WEB_PROVIDER_UNAVAILABLE');
        const result = await provider.search({ query, maxResults: limit }, signal);
        signal?.throwIfAborted();
        const rows = result.sources.slice(0, 100).flatMap(raw => { const row = source(raw, id); return row ? [row] : []; });
        return { attempt: { provider: id, status: rows.length ? 'ok' : 'empty' } as SearchAttempt, rows, truncated: result.truncated };
      } catch (error) {
        if (signal?.aborted || (error instanceof WebError && error.code === 'WEB_ABORTED')) throw new WebError('Search cancelled.', 'WEB_ABORTED');
        return { attempt: { provider: id, status: 'error', code: error instanceof WebError ? error.code : 'WEB_PROVIDER_ERROR' } as SearchAttempt, rows: [], truncated: false };
      }
    };
    let upstreamTruncated = false;
    const collect = (result: Awaited<ReturnType<typeof run>>) => { attempts.push(result.attempt); groups.push(result.rows); upstreamTruncated ||= result.truncated; };
    if (policy === 'deepseek-official') collect(await run('deepseek-official'));
    else if (policy === 'cross-check') {
      // Await both to keep deterministic priority/provenance, even on failure.
      const settled = await Promise.allSettled([run(primary), run(secondary)]);
      for (const result of settled) { if (result.status === 'rejected') throw result.reason; collect(result.value); }
    } else {
      collect(await run(primary));
      if (!groups[0]!.length) collect(await run(secondary));
    }
    if (policy !== 'deepseek-official' && options.allowOfficialFallback && !groups.some(group => group.length)) collect(await run('deepseek-official'));
    signal?.throwIfAborted();
    const merged = mergeSources(groups, limit), truncated = upstreamTruncated || merged.truncated;
    this.record?.({ policy, attempts, sources: merged.sources, truncated });
    if (attempts.every(attempt => attempt.status === 'error')) throw new WebError('Search providers failed: ' + attempts.map(attempt => `${attempt.provider} (${attempt.code})`).join(', ') + '. DeepSeek official search requires explicit configuration.', 'WEB_SEARCH_ALL_FAILED');
    // This Host version projects source extensions away. Put provenance in
    // each portable snippet, so the official multi-query merge drops it with
    // its source instead of leaving over-budget URL lists in content.
    const sources = merged.sources.map(row => {
      const prefix = `Index provenance: ${row.metadata.providers.join(', ')}.${row.source ? ` Publisher: ${row.source}.` : ''}`;
      return { ...row, snippet: shortText(`${prefix} ${row.snippet ?? ''}`, 800)! };
    });
    const content = [`Search policy: ${policy}.`, `Indexes: ${attempts.map(attempt => `${attempt.provider}: ${attempt.status}${attempt.code ? ` (${attempt.code})` : ''}`).join('; ')}.`, ...(policy === 'cross-check' ? ['Cross-check requires independent publishers and an inspected primary source; two indexes alone do not verify a claim.'] : []), ...(!sources.length ? ['No results found.'] : [])].join('\n');
    return { sources, truncated, content };
  }
}
