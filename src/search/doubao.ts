import type { WebSearchProvider, WebSearchRequest, WebSearchResult } from '@deepseek-ai/dsh-web';
import { WebError } from '@deepseek-ai/dsh-web';
import { postJSON, queryText, resultLimit, object, type ResolveKey } from './http.js';
import { source, mergeSources } from './normalize.js';

export type DoubaoEdition = 'custom' | 'global';
export class DoubaoSearch implements WebSearchProvider {
  readonly id = 'doubao-search';
  constructor(private readonly resolveKey: ResolveKey, private readonly edition: DoubaoEdition | (() => DoubaoEdition) = 'custom') {}
  available(): boolean { return true; }
  async search(request: WebSearchRequest, signal?: AbortSignal): Promise<WebSearchResult> {
    const query = queryText(request), limit = resultLimit(request);
    // The documented API truncates longer queries. Reject rather than silently
    // searching a different question; the router can use Perplexity instead.
    if ([...query].length > 100) throw new WebError('Doubao search requires a query of at most 100 characters.', 'WEB_SEARCH_QUERY_TOO_LONG');
    const global = (typeof this.edition === 'function' ? this.edition() : this.edition) === 'global';
    const response = await postJSON(this.id, `https://open.feedcoopapi.com/search_api/${global ? 'global_search' : 'web_search'}`, this.resolveKey, global ? { Query: query, SearchType: 'web', DocCount: limit, MaxSnippetLength: 800 } : { Query: query, SearchType: 'web', Count: limit, Filter: { NeedContent: false, NeedUrl: true } }, signal);
    const metadata = object(response.ResponseMetadata);
    if (metadata.Error) throw new WebError('Doubao search returned an API error.', 'WEB_SEARCH_API_ERROR');
    const result = object(response.Result);
    if (typeof result.ErrorCode === 'number' && result.ErrorCode !== 0) throw new WebError('Doubao search returned a result error.', 'WEB_SEARCH_API_ERROR');
    const documents = global ? result.Documents : result.WebResults;
    if (!Array.isArray(documents)) throw new WebError('Doubao response is missing its document array.', 'WEB_SEARCH_INVALID_RESPONSE');
    const rows = documents.slice(0, 100).flatMap(raw => {
      const page = object(raw);
      const snippet = global ? (Array.isArray(page.Snippet) ? page.Snippet.slice(0, 20).flatMap(raw => { const block = object(raw); return block.Type === 'text' && typeof block.Text === 'string' ? [block.Text] : []; }).join(' ') : undefined) : page.Summary ?? page.Snippet;
      const info = global && page.DocumentInfo ? object(page.DocumentInfo) : undefined;
      const host = global && page.HostInfo ? object(page.HostInfo) : undefined;
      const row = source({ url: page.Url, title: page.Title, snippet, publishedAt: global ? info?.PublishTime : page.PublishTime, source: global ? host?.Hostname : page.SiteName }, this.id);
      return row ? [row] : [];
    });
    const merged = mergeSources([rows], limit);
    return { ...merged, truncated: merged.truncated || documents.length > 100 };
  }
}
