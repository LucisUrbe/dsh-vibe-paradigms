# dsh-vibe-paradigms

Vibe coding paradigms for DeepSeek Harness。

## 开发与检查

需要 Node.js 24 或以上、pnpm 11，以及已安装 Desktop 随附的 `dsh`。

```sh
pnpm install --frozen-lockfile
pnpm test
pnpm compat
pnpm hmr
pnpm audit:public
```

`test`、`compat`、`hmr` 运行固定版本的公开 Host 服务，使用 Agent/权限夹具，不调用模型。`pnpm hmr` 验证源码重载、预设配置更新、旧 revision 保留和卸载清理。

## 安装

先构建，再使用官方 bundle/profile 机制：

```sh
pnpm build
dsh plugin --profile desktop add "link:$PWD" dsh-opencode-go@0.1.21 --ignore-scripts
```

在 Desktop 的“插件”页启用两个 bundle，重启 Desktop；在 **Chat** 工作区新建会话，再选择 **Chat** 预设。它提供多索引 Web 搜索/官方抓取、受限数值计算和显式长期记忆，推荐权限为“仅可查看”。选择 **Vibe Health** 可检查插件是否正常；代码任务继续使用官方标准模式。

密钥由官方 credentials 服务保存为 `OPENCODE_API_KEY`，或通过该环境变量提供；密钥值不进入仓库或 profile patch。模型默认值模板见 [config/profile.patch.yml](config/profile.patch.yml)，仅覆盖 `agent-default-model`。

自定义 profile 可通过以下命令准备：

```sh
pnpm profile:create
```

默认创建仓库内已忽略的 `docs/runtime/dsh/profiles/vibe-paradigms`，继承 shipped profile 的组合并安装同一 bundle；不启动 Web 服务，不复制凭据。也可设置 `DSH_HOME` 指定独立位置。重复执行复用现有 profile；保留其他配置并更新上述默认模型。

开发时用 `pnpm build` 生成 `lib/` 与 bundle patch。修改预设子插件源码后重启 Desktop。

Chat 通过统一路由调用 Perplexity 原始 Search API 和豆包搜索：普通英文查询优先 Perplexity，中文/中国本地查询优先豆包，事实核查及高风险查询并行查询两个索引。故障或空结果时尝试另一个索引，并报告降级状态。结果规范化、去除跟踪参数、合并重复 URL、保留日期与索引来源，并对同主机过量结果降权；摘要最多 800 字符，最终结果最多 20 条（官方工具默认 8 条）。搜索摘要需要结合原始来源核实。

密钥使用官方 credentials 服务或启动环境中的 `PERPLEXITY_API_KEY`、`DOUBAO_SEARCH_API_KEY`，每次调用重新解析。豆包默认 Custom 版；Global 版使用另一套请求和响应协议，在搜索路由设置中显式选择。搜索和对话模型独立。

DeepSeek 官方搜索优先级最低，默认不主动调用；只有明确选择官方搜索，或启用官方兜底且其他索引无结果时才调用。此时复用已登录的 DeepSeek 账号或 `DEEPSEEK_API_KEY`。在 **插件 → dsh-vibe-paradigms → 搜索路由** 中设置自动策略、强制双索引、豆包版本、官方兜底及两个搜索 Key；保存后立即生效，Chat 和标准模式共用，已有 Chat 会话也会读取当前设置。Key 使用独立 credentials 写入，不存入配置文件。

保留官方 **插件 → 网页搜索** 栏目，用于设置 DeepSeek 的接口地址、Key 与单次搜索预算；这些设置也用于路由中的显式官方搜索。官方插件启用不代表它成为默认搜索。升级旧配置时，移除旧 Perplexity provider 条目和依赖，将根 `web.searchProvider` 设为 `vibe-paradigms-search`，保留 `fetchProvider: http`，恢复 `web-search-deepseek`。生成 bundle 已为新安装配置根路由。

升级后在新 **Chat** 工作区创建会话；旧会话继续保留原 cwd，原目录不会自动移动。迁移记忆前先备份并检查目标是否已有内容。

Chat 的空工作区位于 `$DSH_HOME/vibe-paradigms/chat-workspace/`，显式记忆位于独立的 `$DSH_HOME/vibe-paradigms/memory/memory.md`。只有明确请求才写入记忆，更新前需读取 revision。计算器接受数值字符串与受限运算，支持十进制、统计、加权、向量/矩阵和 BigInt；循环小数采用 256 位有效数字、half-even 舍入。

本地知识库、探测和验收记录统一保存在已忽略的 `docs/`；npm 包只包含运行代码、生成的 bundle 配置和公开使用说明。
