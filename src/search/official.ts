import type { Context } from '@deepseek-ai/cordis';
import { credentialRef } from '@deepseek-ai/dsh-credentials';
import type {} from '@deepseek-ai/dsh-deepseek-account';
import { launchEnvironmentOf } from '@deepseek-ai/dsh-launch-environment';
import { Config, DeepSeekSearchProvider, DEEPSEEK_DEFAULT_BASE_URL, DEEPSEEK_DEFAULT_MODEL, DEEPSEEK_DEFAULT_API_VERSION, DEEPSEEK_DEFAULT_MAX_TOKENS, DEEPSEEK_DEFAULT_MAX_USES } from '@deepseek-ai/dsh-web-search-deepseek';
import type {} from '@deepseek-ai/dsh-settings';

export { Config };
export const name = 'vibe-chat-official-search';
export const inject = ['web'];

// Use the official provider's public credential callbacks so auxiliary search
// is independent of the conversation model. Never copy its transport/parser.
export function apply(ctx: Context, config: Config): void {
  ctx.web.registerSearchProvider(createOfficialSearch(ctx, config));
}
export function createOfficialSearch(ctx: Context, config?: Config): DeepSeekSearchProvider {
  return new DeepSeekSearchProvider(() => {
    // The native Web search page owns these live fields. Read its authoritative
    // section for each explicit official operation, including in Chat's realm.
    const section = ctx.get('settings')?.describe().find(row => row.ns === 'web-search-deepseek')?.value as Record<string, unknown> | undefined;
    const text = (key: string): string | undefined => typeof section?.[key] === 'string' ? section[key] as string : undefined;
    const number = (key: string): number | undefined => typeof section?.[key] === 'number' ? section[key] as number : undefined;
    const environment = launchEnvironmentOf(ctx), reference = credentialRef(config?.apiKeyEnv.get() ?? text('apiKeyEnv') ?? 'DEEPSEEK_API_KEY');
    const baseURL = config?.baseURL.get() ?? text('baseURL') ?? environment.get('DEEPSEEK_SEARCH_BASE_URL')?.value ?? DEEPSEEK_DEFAULT_BASE_URL;
    return {
      baseURL, model: config?.model.get() ?? text('model') ?? DEEPSEEK_DEFAULT_MODEL, apiVersion: config?.apiVersion.get() ?? text('apiVersion') ?? DEEPSEEK_DEFAULT_API_VERSION, maxTokens: config?.maxTokens.get() ?? number('maxTokens') ?? DEEPSEEK_DEFAULT_MAX_TOKENS, maxUses: config?.maxUses.get() ?? number('maxUses') ?? DEEPSEEK_DEFAULT_MAX_USES,
      apiKey: config?.apiKey.get() ?? text('apiKey'), apiKeyEnv: reference,
      resolveApiKey: async () => {
        const credentials = ctx.get('credentials');
        return credentials ? (await credentials.resolve(reference))?.value : environment.get(reference)?.value;
      },
      resolveAccountToken: async endpoint => {
        // Account authority is confined to the shipped official endpoint. The
        // account service additionally enforces its own endpoint admission.
        if (endpoint !== `${DEEPSEEK_DEFAULT_BASE_URL}/messages`) return undefined;
        return await ctx.get('deepseekAccount')?.resolveToken(endpoint);
      },
      recordRequest: request => { ctx.get('agents')?.currentInitiator()?.session.append('web/deepseek-search-llm-request', request); },
    };
  });
}
