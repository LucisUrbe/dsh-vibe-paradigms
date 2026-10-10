// Test-only tools for registry revisions and lifecycle policy checks.
// This fixture is not exported or shipped in the npm bundle.
export const inject = ['tools'];
export const toolNames = ['web_search', 'web_fetch', 'safe_calculate', 'memory_read', 'memory_search', 'memory_upsert', 'memory_delete'];
export function apply(ctx, config = {}) {
  for (const name of toolNames) ctx.tools.register({
    name, description: 'Test fixture', parameters: { type: 'object', properties: {} },
    output: { schema: { type: 'object', properties: { message: { type: 'string' } } }, render: (_args, value) => [{ type: 'text', text: JSON.stringify(value) }] },
    execute: async (_args, exec) => { exec.signal.throwIfAborted(); return { message: config.message ?? 'fixture' }; },
  });
}
