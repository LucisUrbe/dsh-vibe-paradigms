import type { WebSearchProvider, WebSearchRequest, WebSearchResult } from '@deepseek-ai/dsh-web';
import { WebError } from '@deepseek-ai/dsh-web';
import { postJSON, queryText, resultLimit, object, type ResolveKey } from './http.js';
import { source, mergeSources } from './normalize.js';

export class PerplexityRawSearch implements WebSearchProvider {
  readonly id = 'perplexity-search-raw';
  constructor(private readonly resolveKey: ResolveKey) {}
  available(): boolean { return true; }
  async search(request: WebSearchRequest, signal?: AbortSignal): Promise<WebSearchResult> {
    const limit = resultLimit(request);
    const body = await postJSON(this.id, 'https://api.perplexity.ai/search', this.resolveKey, { query: queryText(request), max_results: limit, max_tokens: 4000, max_tokens_per_page: 500 }, signal);
    if (!Array.isArray(body.results)) throw new WebError('Perplexity response is missing results[].', 'WEB_SEARCH_INVALID_RESPONSE');
    const rows = body.results.slice(0, 100).flatMap(raw => {
      const page = object(raw), row = source({ url: page.url, title: page.title, snippet: page.snippet, publishedAt: page.date }, this.id);
      return row ? [row] : [];
    });
    const merged = mergeSources([rows], limit);
    return { ...merged, truncated: merged.truncated || body.results.length > 100 };
  }
}
