import type { WebSearchSource } from '@deepseek-ai/dsh-web';

export interface SearchSource extends WebSearchSource {
  readonly source?: string;
  readonly metadata: { readonly providers: readonly string[] };
}
export function canonicalURL(value: unknown): string | undefined {
  if (typeof value !== 'string' || value.length > 8192) return;
  try {
    const url = new URL(value);
    if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password) return;
    url.hash = '';
    for (const key of [...url.searchParams.keys()]) {
      if (/^(utm_.+|fbclid|gclid|dclid|msclkid|yclid|mc_cid|mc_eid)$/i.test(key)) url.searchParams.delete(key);
    }
    url.searchParams.sort();
    return url.href;
  } catch { return; }
}
export function shortText(value: unknown, limit: number): string | undefined {
  if (typeof value !== 'string') return;
  const text = value.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim();
  return text ? [...text].slice(0, limit).join('') : undefined;
}
export function source(raw: { url?: unknown; title?: unknown; snippet?: unknown; publishedAt?: unknown; source?: unknown }, provider: string): SearchSource | undefined {
  const url = canonicalURL(raw.url);
  if (!url) return;
  const title = shortText(raw.title, 240), snippet = shortText(raw.snippet, 800), publisher = shortText(raw.source, 120);
  const date = typeof raw.publishedAt === 'string' ? raw.publishedAt.trim() : '';
  const publishedAt = /^\d{4}-\d{2}-\d{2}(?:T.*)?$/.test(date) && Number.isFinite(Date.parse(date)) ? date : undefined;
  return { url, ...(title ? { title } : {}), ...(snippet ? { snippet } : {}), ...(publishedAt ? { publishedAt } : {}), ...(publisher ? { source: publisher } : {}), metadata: { providers: [provider] } };
}
// Interleave indexes before deduplication, then penalize repeated hostnames.
// Keep provenance from every index even when the canonical URL is shared.
export function mergeSources(groups: readonly (readonly SearchSource[])[], limit: number): { sources: SearchSource[]; truncated: boolean } {
  const byURL = new Map<string, SearchSource>();
  const ranks = Math.max(0, ...groups.map(group => group.length));
  for (let rank = 0; rank < ranks; rank++) for (const group of groups) {
    const row = group[rank];
    if (!row) continue;
    const prior = byURL.get(row.url);
    byURL.set(row.url, prior ? {
      ...row, ...prior,
      metadata: { providers: [...new Set([...prior.metadata.providers, ...row.metadata.providers])] },
    } : row);
  }
  const remaining = [...byURL.values()], sources: SearchSource[] = [], domains = new Map<string, number>();
  while (remaining.length && sources.length < limit) {
    let best = 0, score = Infinity;
    remaining.forEach((row, index) => {
      const host = new URL(row.url).hostname.replace(/^www\./, '');
      const candidate = index + (domains.get(host) ?? 0) * 4;
      if (candidate < score) { best = index; score = candidate; }
    });
    const row = remaining.splice(best, 1)[0]!;
    const host = new URL(row.url).hostname.replace(/^www\./, '');
    domains.set(host, (domains.get(host) ?? 0) + 1); sources.push(row);
  }
  return { sources, truncated: remaining.length > 0 };
}
