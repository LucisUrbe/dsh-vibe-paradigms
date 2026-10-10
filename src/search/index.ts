import type { Context } from '@deepseek-ai/cordis';
import { credentialRef } from '@deepseek-ai/dsh-credentials';
import { launchEnvironmentOf } from '@deepseek-ai/dsh-launch-environment';
import type { WebSearchProvider } from '@deepseek-ai/dsh-web';
import { PerplexityRawSearch } from './perplexity.js';
import { DoubaoSearch, type DoubaoEdition } from './doubao.js';
import { SearchRouter, type SearchPolicy } from './router.js';
import { createOfficialSearch } from './official.js';
import type {} from './settings.js';

export const name = 'vibe-paradigms-search';
export const inject = ['web'];
export { PerplexityRawSearch, DoubaoSearch, SearchRouter };
export type { SearchPolicy, DoubaoEdition };
export type { SearchTrace } from './router.js';
export interface Config {
  policy?: SearchPolicy;
  allowOfficialFallback?: boolean;
  doubaoEdition?: DoubaoEdition;
  perplexityKeyEnv?: string;
  doubaoKeyEnv?: string;
}
export function apply(ctx: Context, config: Config = {}): void {
  // One root settings owner also updates already mounted preset revisions.
  // Static config remains the fallback for independently hosted realms.
  const options = (): Config => ctx.get('vibeSearchSettings')?.options() ?? config;
  const policy = config.policy ?? 'auto', edition = config.doubaoEdition ?? 'custom';
  if (!['auto', 'cross-check', 'deepseek-official'].includes(policy) || !['custom', 'global'].includes(edition) || (config.allowOfficialFallback !== undefined && typeof config.allowOfficialFallback !== 'boolean')) throw new Error('Invalid vibe-paradigms search configuration.');
  const resolve = (reference: () => string) => {
    return async () => {
      const ref = credentialRef(reference());
      const credentials = ctx.get('credentials');
      return credentials ? (await credentials.resolve(ref))?.value : launchEnvironmentOf(ctx).get(ref)?.value;
    };
  };
  const providers: WebSearchProvider[] = [
    new PerplexityRawSearch(resolve(() => options().perplexityKeyEnv ?? 'PERPLEXITY_API_KEY')),
    new DoubaoSearch(resolve(() => options().doubaoKeyEnv ?? 'DOUBAO_SEARCH_API_KEY'), () => options().doubaoEdition ?? 'custom'),
    createOfficialSearch(ctx),
  ];
  // The installed Session.append cannot mark downstream informational events
  // ignorable. Persist provenance through the official tool/result instead;
  // unknown required events would make the conversation unrestorable.
  ctx.web.registerSearchProvider(new SearchRouter(new Map(providers.map(provider => [provider.id, provider])), () => options()));
}
