# dsh-vibe-paradigms

[English](README.md) | 中文

为 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) 提供面向自然语言编程的工作模式，以独立插件包的形式安装。

聊天模式提供多索引网页搜索、官方网页抓取、受限数值计算和显式长期记忆。代码任务继续使用官方标准模式。

你可以自由选择当前 DeepSeek Harness 环境支持的模型服务供应商。搜索服务与对话模型分别配置。**OpenCode Go 是可选的模型服务供应商**，本插件包不要求使用它。

## 环境要求

- Node.js 24 或以上。
- pnpm 11。
- DeepSeek Harness 桌面应用及其随附的 `dsh` 命令。

## 安装

在本仓库目录中安装依赖、构建，再通过官方插件机制添加插件包：

```sh
pnpm install --frozen-lockfile
pnpm build
dsh plugin --profile desktop add "link:$PWD" --ignore-scripts
```

在桌面应用的 **插件** 页启用 `dsh-vibe-paradigms`，然后重启应用。通过 DeepSeek Harness 配置你选择的模型服务供应商，再在 **聊天模式** 工作区新建会话，并选择 **聊天模式** 预设。推荐权限为 **仅可查看**。

上述安装步骤只添加本插件包，不安装模型供应商插件，也不覆盖默认模型。模型密钥通过官方凭据服务保存，或通过所选供应商要求的环境变量提供。密钥值不要写入仓库或配置补丁。

## 网页搜索

### 路由与结果处理

聊天模式通过统一路由调用 Perplexity 搜索接口和豆包搜索：

- 普通英文查询优先使用 Perplexity。
- 中文查询和中国相关查询优先使用豆包。
- 事实核查及高风险查询并行使用两个索引。
- 请求失败或结果为空时尝试另一个索引，并报告降级状态。

路由会规范化结果、去除跟踪参数、合并重复网址、保留日期与索引来源，并对同一网站的过量结果降权。摘要最多 800 字符，最终结果最多 20 条；官方工具默认返回 8 条。搜索摘要仍需结合原始来源核实。

只开通一个搜索服务，或无法连接另一个服务时，可在 **搜索策略** 中选择 **只使用 Perplexity** 或 **只使用豆包**。这两种策略只请求选定索引，不因查询语言、核查意图、请求失败或结果为空而切换供应商，也不启用 DeepSeek 官方兜底。只需配置选定供应商的密钥。豆包仍使用所选的自定义版或全球版。

### 设置与凭据

在 **插件 → dsh-vibe-paradigms → 搜索路由** 中设置自动策略、强制双索引查询、单索引策略、豆包版本、官方兜底及两个搜索密钥。保存后立即生效，聊天模式和标准模式共用，已有聊天模式会话也会读取当前设置。

搜索密钥通过官方凭据服务独立保存，不写入配置文件。也可在启动环境中提供 `PERPLEXITY_API_KEY` 和 `DOUBAO_SEARCH_API_KEY`；每次调用都会重新解析凭据引用。豆包默认使用自定义版，界面选项为 `Custom`。全球版的界面选项为 `Global`，使用另一套请求和响应协议，需在搜索路由设置中明确选择。

DeepSeek 官方搜索优先级最低，默认不主动调用。只有明确选择官方搜索，或启用官方兜底且其他索引没有返回结果时才会调用。此时复用已登录的 DeepSeek 账号或 `DEEPSEEK_API_KEY`。

官方 **插件 → 网页搜索** 栏目仍然保留，用于设置 DeepSeek 的接口地址、密钥与单次搜索预算。通过路由明确调用官方搜索时，也使用这些设置。启用官方插件并不代表它成为默认搜索服务。

### 升级旧配置

移除旧 Perplexity 搜索供应商条目和依赖，将根配置中的 `web.searchProvider` 设为 `vibe-paradigms-search`，保留 `fetchProvider: http`，并恢复 `web-search-deepseek`。生成的插件包已为新安装配置根路由。

升级后在新的 **聊天模式** 工作区创建会话。旧会话继续保留原工作目录，目录不会自动移动。迁移记忆前先备份，并检查目标位置是否已有内容。

## 工作区、记忆与计算

聊天模式使用空工作区 `$DSH_HOME/vibe-paradigms/chat-workspace/`。显式记忆单独保存在 `$DSH_HOME/vibe-paradigms/memory/memory.md`。

只有明确请求才会写入记忆。更新前需读取当前版本标识。

计算器接受数值字符串与受限运算，支持十进制运算、统计、加权计算、向量与矩阵，以及精确大整数运算（`BigInt`）。循环小数采用 256 位有效数字，按四舍六入五成双的规则舍入。

## 可选：OpenCode Go

如果选择 [OpenCode Go](https://github.com/Duskriver/dsh-opencode-go) 作为模型服务供应商，可单独安装其插件：

```sh
dsh plugin --profile desktop add dsh-opencode-go@0.1.21 --ignore-scripts
```

在桌面应用的 **插件** 页启用对应插件包并重启应用。通过官方凭据服务将密钥保存为 `OPENCODE_API_KEY`，或通过同名环境变量提供，然后选择 OpenCode Go 模型。

[config/profile.patch.yml](config/profile.patch.yml) 是可选的 OpenCode Go 默认模型示例，仅覆盖 `agent-default-model`，将模型设为 `dsh-opencode-go/deepseek-v4.1-flash`，推理强度设为 `high`。前面的主安装步骤不会应用该模板。若用于其他供应商，请换成对应的供应商和模型标识。

### 可选的独立配置辅助命令

如果需要使用 OpenCode Go 示例的独立配置档案，可执行：

```sh
pnpm profile:create
```

这个辅助命令目前会同时安装本插件包和 OpenCode Go 插件，并应用上述默认模型模板。需要这套供应商和模型配置时再使用。

默认创建仓库内已忽略的 `docs/runtime/dsh/profiles/vibe-paradigms`，继承官方随附配置的插件组合，不启动网页服务，也不复制凭据。可设置 `DSH_HOME` 指定独立位置。重复执行会复用现有配置档案，保留其他配置并更新默认模型条目。

## 开发与检查

```sh
pnpm test
pnpm compat
pnpm hmr
pnpm audit:public
```

`test`、`compat`、`hmr` 运行固定版本的公开宿主服务，使用智能体与权限测试夹具，不调用模型。`pnpm hmr` 验证源码热重载、预设配置更新、旧版本保留和卸载清理。

开发时使用 `pnpm build` 生成 `lib/` 与插件包配置补丁。修改预设子插件源码后需重启桌面应用。

本地知识库、探测和验收记录统一保存在已忽略的 `docs/`。公开文档维护英文和中文两套版本，默认说明文档为英文。npm 包只包含运行代码、生成的插件包配置、公开说明文档和许可证。

## 许可证

[MIT](LICENSE)
