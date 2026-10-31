# dsh-vibe-paradigms

English | [中文](README.zh.md)

Vibe coding paradigms for [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness), packaged as an external plugin bundle.

The Chat preset provides web search across multiple indexes, official page fetching, bounded numerical calculations, and explicit long-term memory. Use the upstream Standard preset for coding tasks.

Choose any model provider supported by your DeepSeek Harness setup. Search providers are configured independently of the conversation model. **OpenCode Go is optional**; it is one possible model provider, not a requirement for this bundle.

## Requirements

- Node.js 24 or later.
- pnpm 11.
- DeepSeek Harness Desktop 0.2.0-rc.2 or any later 0.x release, and its bundled `dsh` command.

## Installation

From this repository checkout, install dependencies, build, and add the bundle using the official plugin mechanism:

```sh
pnpm install --frozen-lockfile
pnpm build
dsh plugin --profile desktop add "link:$PWD" --ignore-scripts
```

Enable `dsh-vibe-paradigms` on the Desktop **Plugins** page and restart Desktop. Configure your preferred model provider through DeepSeek Harness, then create a session in the **Chat workspace** and select the **Chat preset**. The workspace and preset currently appear as **Chat** in the interface. The recommended permission is read-only (**Read Only**).

This installation adds the bundle without installing a model provider or overriding your default model. Store provider credentials through the official credential service or the environment variables required by your chosen provider. Keep credential values out of the repository and profile patches.

## Compatibility with DSH updates

The bundle declares `engines.dsh: ">=0.2.0-rc.2 <1.0.0-0"`, so the runtime bundled inside the Desktop `.app` keeps loading it across every 0.x update. A 1.0.0 release, including its prereleases, is a major update and needs a new release of this bundle; until then the Host reports the bundle as incompatible and does not load it.

An update inside that range can still change an interface this bundle uses. At startup, the `vibe-compat` row checks every Host service and export the bundle relies on. The Desktop client also reads the plugin inventory: when a row of this bundle fails, stays pending, or the Chat preset cannot compose sessions, an app-wide notice names the affected components and the DSH version. The same summary appears at the top of the bundle's settings card. A fix is then expected in this repository; watch [issues](https://github.com/LucisUrbe/dsh-vibe-paradigms/issues), and use the Standard preset in the meantime. After a fix, update the checkout and restart Desktop:

```sh
git pull
pnpm install --frozen-lockfile
pnpm build
```

The notice follows the Desktop language. Without locale support, or for a language this bundle has no copy for, it uses Simplified Chinese, as do Host-side compatibility diagnostics.

## Web search

### Routing and results

Chat uses a shared router for the Perplexity Search API and Doubao search:

- Ordinary English queries prefer Perplexity.
- Chinese queries and queries about China prefer Doubao.
- Fact-checking and high-risk queries search both indexes in parallel.
- Errors or empty results trigger an attempt with the other index, with degraded operation reported.

The router normalizes results, removes tracking parameters, merges duplicate URLs, preserves dates and index provenance, and downranks excess results from the same host. Snippets are limited to 800 characters and final results to 20 entries; the official tool defaults to 8. Verify search snippets against the original sources.

If you have access to only one provider or cannot reach the other, choose **Perplexity only** or **Doubao only** under **Search policy**. These policies request only the selected index: query language, verification intent, errors, and empty results never switch providers or enable DeepSeek official fallback. Only the selected provider's key is required. Doubao still uses the selected Custom or Global edition.

### Settings and credentials

Open **Plugins → dsh-vibe-paradigms → Search routing** to configure the automatic policy, forced cross-checking, single-provider policies, Doubao edition, official fallback, and the two search keys. Saved changes take effect immediately and are shared by Chat and Standard, including existing Chat sessions.

Search keys are stored separately through the official credential service, not in configuration files. You can also supply `PERPLEXITY_API_KEY` and `DOUBAO_SEARCH_API_KEY` in the launch environment; credential references are resolved on every call. Doubao defaults to Custom. Global uses a different request and response protocol and must be selected explicitly in the routing settings.

DeepSeek official search has the lowest priority and is off by default. It runs only when explicitly selected, or when official fallback is enabled and the other indexes produce no results. It reuses a signed-in DeepSeek account or `DEEPSEEK_API_KEY`.

The official **Plugins → Web search** section remains available for the DeepSeek endpoint, key, and per-search budget. Explicit official searches through the router use these settings too. Enabling the official plugin does not make it the default search provider.

### Upgrading an older configuration

Remove the old Perplexity provider entry and dependency, set the root `web.searchProvider` to `vibe-paradigms-search`, keep `fetchProvider: http`, and restore `web-search-deepseek`. The generated bundle already configures the root router for new installations.

After upgrading, create a session in the new Chat workspace. Existing sessions retain their original working directory; directories are not moved automatically. Before migrating memory, back it up and check whether the destination already contains data.

## Workspace, memory, and calculations

Chat uses an empty workspace at `$DSH_HOME/vibe-paradigms/chat-workspace/`. Explicit memory is stored separately at `$DSH_HOME/vibe-paradigms/memory/memory.md`.

Memory is written only on explicit request. Read the current revision before updating it.

The calculator accepts numeric strings and bounded operations. It supports decimal arithmetic, statistics, weighted calculations, vectors and matrices, and exact `BigInt` arithmetic. Repeating decimals use 256 significant digits with half-even rounding.

## Optional: OpenCode Go

If you choose [OpenCode Go](https://github.com/Duskriver/dsh-opencode-go) as your model provider, install its plugin separately:

```sh
dsh plugin --profile desktop add dsh-opencode-go@0.1.21 --ignore-scripts
```

Enable its bundle on the Desktop Plugins page and restart Desktop. Store its key as `OPENCODE_API_KEY` through the official credential service or provide it through that environment variable, then select an OpenCode Go model.

[config/profile.patch.yml](config/profile.patch.yml) is an optional OpenCode Go default-model example. It overrides only `agent-default-model`, selecting `dsh-opencode-go/deepseek-v4.1-flash` with reasoning effort `high`. The main installation above does not apply this template. Use your chosen provider's identifiers if you adapt it for another provider.

### Optional custom profile helper

For a separate profile using the OpenCode Go example, run:

```sh
pnpm profile:create
```

This helper currently installs both this bundle and the OpenCode Go plugin and applies the default-model template above. Use it when you want that provider and model configuration.

By default, it creates the ignored `docs/runtime/dsh/profiles/vibe-paradigms` directory, inheriting the shipped profile composition. It does not start a web service or copy credentials. Set `DSH_HOME` to choose an independent location. Repeated runs reuse the existing profile, preserve other configuration, and update the default-model entry.

## Development and checks

```sh
pnpm test
pnpm compat
pnpm hmr
pnpm audit:public
```

The development Host is pinned to the DSH release the current Desktop bundles. To check another release, run `pnpm use-dsh <version or dist-tag>` (for example `pnpm use-dsh next`); it rewrites only `devDependencies` and the lockfile, so do not commit the result unless you are moving the pin. CI runs the same checks daily against the `next` and `alpha` dist-tags as an early warning.

`test`, `compat`, and `hmr` run the pinned public host services with agent and permission fixtures, without calling a model. `pnpm hmr` verifies source reloading, preset configuration updates, retention of older revisions, and cleanup on unloading.

Use `pnpm build` to generate `lib/` and the bundle patch during development. Restart Desktop after changing preset subplugin source code.

Local knowledge, probes, and acceptance records live in the ignored `docs/` directory. Public documentation is maintained in English and Chinese, with English as the default README. The npm package contains only runtime code, generated bundle configuration, public READMEs, and the license.

## License

[MIT](LICENSE)
