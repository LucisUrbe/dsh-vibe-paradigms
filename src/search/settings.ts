import { Service, type Context, type Volatile } from '@deepseek-ai/cordis';
import z from '@deepseek-ai/schemastery';
import type {} from '@deepseek-ai/dsh-settings';
import type { Config as SearchOptions } from './index.js';

export const name = 'vibe-search-settings';
export const inject = ['settings'];
export const Config = z.object({
  policy: z.union(['auto', 'cross-check', 'deepseek-official']).default('auto').volatile(),
  allowOfficialFallback: z.boolean().default(false).volatile(),
  doubaoEdition: z.union(['custom', 'global']).default('custom').volatile(),
  perplexityKeyEnv: z.string().role('credential-ref').default('PERPLEXITY_API_KEY').volatile(),
  doubaoKeyEnv: z.string().role('credential-ref').default('DOUBAO_SEARCH_API_KEY').volatile(),
}).default({});
export interface Config {
  policy: Volatile<'auto' | 'cross-check' | 'deepseek-official'>;
  allowOfficialFallback: Volatile<boolean>;
  doubaoEdition: Volatile<'custom' | 'global'>;
  perplexityKeyEnv: Volatile<string>;
  doubaoKeyEnv: Volatile<string>;
}
declare module '@deepseek-ai/cordis' { interface Context { vibeSearchSettings: SearchSettings } }
export class SearchSettings extends Service {
  constructor(ctx: Context, private readonly read: () => SearchOptions) { super(ctx, 'vibeSearchSettings'); }
  options(): SearchOptions { return this.read(); }
}
export function apply(ctx: Context, config: Config): void {
  ctx.effect(() => ctx.settings.configure({ auto: false }));
  new SearchSettings(ctx, () => ({ policy: config.policy.get(), allowOfficialFallback: config.allowOfficialFallback.get(), doubaoEdition: config.doubaoEdition.get(), perplexityKeyEnv: config.perplexityKeyEnv.get(), doubaoKeyEnv: config.doubaoKeyEnv.get() }));
}
