import { WebError } from '@deepseek-ai/dsh-web';
import type { WebSearchRequest } from '@deepseek-ai/dsh-web';

export type ResolveKey = () => Promise<string | undefined>;
export function resultLimit(request: WebSearchRequest): number {
  const limit = request.maxResults ?? 8;
  if (!Number.isSafeInteger(limit) || limit < 1) throw new WebError('Search result limit must be a positive integer.', 'WEB_SEARCH_INVALID_REQUEST');
  return Math.min(limit, 20);
}
export function queryText(request: WebSearchRequest): string {
  if (typeof request.query !== 'string' || !request.query.trim() || [...request.query].length > 2000) throw new WebError('Search query must contain 1 to 2000 characters.', 'WEB_SEARCH_INVALID_REQUEST');
  return request.query.trim();
}
export function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new WebError('Search response has an invalid object shape.', 'WEB_SEARCH_INVALID_RESPONSE');
  return value as Record<string, unknown>;
}
// Fixed vendor endpoints and redirect:error keep keys out of redirected requests.
// Never include a response body or a credential resolver error in diagnostics.
export async function postJSON(id: string, endpoint: string, resolveKey: ResolveKey, body: unknown, signal?: AbortSignal): Promise<Record<string, unknown>> {
  signal?.throwIfAborted();
  let key: string | undefined;
  try { key = await resolveKey(); } catch { throw new WebError(`${id} credential resolution failed.`, 'WEB_PROVIDER_CREDENTIAL_ERROR'); }
  signal?.throwIfAborted();
  if (!key?.trim()) throw new WebError(`${id} credential is not configured.`, 'WEB_PROVIDER_CREDENTIAL_MISSING');
  const budget = AbortSignal.timeout(20000), combined = signal ? AbortSignal.any([signal, budget]) : budget;
  try {
    const response = await fetch(endpoint, { method: 'POST', headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body), redirect: 'error', signal: combined });
    if (!response.ok) { await response.body?.cancel(); throw new WebError(`${id} search returned HTTP ${response.status}.`, `WEB_SEARCH_HTTP_${response.status}`); }
    const reader = response.body?.getReader();
    if (!reader) throw new WebError(`${id} search response is empty.`, 'WEB_SEARCH_INVALID_RESPONSE');
    const chunks: Uint8Array[] = []; let bytes = 0;
    try {
      while (true) {
        combined.throwIfAborted();
        const { value, done } = await reader.read();
        if (done) break;
        bytes += value.byteLength;
        if (bytes > 2 * 1024 * 1024) throw new WebError(`${id} search response exceeds 2 MiB.`, 'WEB_SEARCH_RESPONSE_TOO_LARGE');
        chunks.push(value);
      }
    } finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
    return object(JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks))));
  } catch (error) {
    if (signal?.aborted) throw new WebError('Search cancelled.', 'WEB_ABORTED');
    if (budget.aborted) throw new WebError(`${id} search timed out.`, 'WEB_SEARCH_TIMEOUT');
    if (error instanceof WebError) throw error;
    throw new WebError(`${id} search transport or JSON response failed.`, 'WEB_SEARCH_INVALID_RESPONSE');
  }
}
