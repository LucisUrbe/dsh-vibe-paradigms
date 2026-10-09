# dsh-vibe-paradigms

Five vibe coding paradigms for DeepSeek Harness。



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

在 Desktop 的“插件”页启用两个 bundle，重启 Desktop；在 **Chat** 工作区新建会话，再选择 **Chat** 预设。它提供官方 Web 搜索/抓取、受限数值计算和显式长期记忆，推荐权限为“仅可查看”。选择 **Vibe Health** 可检查插件是否正常；代码任务继续使用官方标准模式。

密钥由官方 credentials 服务保存为 `OPENCODE_API_KEY`，或通过该环境变量提供；密钥值不进入仓库或 profile patch。模型默认值模板见 [config/profile.patch.yml](config/profile.patch.yml)，仅覆盖 `agent-default-model`。

自定义 profile 可通过以下命令准备：

```sh
pnpm profile:create
```

默认创建仓库内已忽略的 `docs/runtime/dsh/profiles/vibe-paradigms`，继承 shipped profile 的组合并安装同一 bundle；不启动 Web 服务，不复制凭据。也可设置 `DSH_HOME` 指定独立位置。重复执行复用现有 profile；保留其他配置并更新上述默认模型。

开发时用 `pnpm build` 生成 `lib/` 与 bundle patch。修改预设子插件源码后重启 Desktop。

Chat 搜索优先使用已登录的 DeepSeek 账号，只向固定官方搜索端点请求账号令牌；未登录时使用官方 credentials 服务中的 `DEEPSEEK_API_KEY`。对话模型与搜索认证相互独立。其他预设沿用原有搜索配置。

Chat 的空工作区位于 `$DSH_HOME/vibe-paradigms/chat-workspace/`，显式记忆位于独立的 `$DSH_HOME/vibe-paradigms/memory/memory.md`。只有明确请求才写入记忆，更新前需读取 revision。计算器接受数值字符串与受限运算，支持十进制、统计、加权、向量/矩阵和 BigInt；循环小数采用 256 位有效数字、half-even 舍入。

本地知识库、探测和验收记录统一保存在已忽略的 `docs/`；npm 包只包含运行代码、生成的 bundle 配置和公开使用说明。
