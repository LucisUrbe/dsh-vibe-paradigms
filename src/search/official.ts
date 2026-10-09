import type { Context } from '@deepseek-ai/cordis';
import { credentialRef } from '@deepseek-ai/dsh-credentials';
import type {} from '@deepseek-ai/dsh-deepseek-account';
import { launchEnvironmentOf } from '@deepseek-ai/dsh-launch-environment';
import { Config, DeepSeekSearchProvider, DEEPSEEK_DEFAULT_BASE_URL } from '@deepseek-ai/dsh-web-search-deepseek';

export { Config };
export const name = 'vibe-chat-official-search';
export const inject = ['web'];

// Use the official provider's public credential callbacks so auxiliary search
// is independent of the conversation model. Never copy its transport/parser.
export function apply(ctx: Context, config: Config): void {
  ctx.web.registerSearchProvider(new DeepSeekSearchProvider(() => {
    const environment = launchEnvironmentOf(ctx), reference = credentialRef(config.apiKeyEnv.get());
    const baseURL = config.baseURL.get() ?? environment.get('DEEPSEEK_SEARCH_BASE_URL')?.value ?? DEEPSEEK_DEFAULT_BASE_URL;
    return {
      baseURL, model: config.model.get(), apiVersion: config.apiVersion.get(), maxTokens: config.maxTokens.get(), maxUses: config.maxUses.get(),
      apiKey: config.apiKey.get(), apiKeyEnv: reference,
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
  }));
}
