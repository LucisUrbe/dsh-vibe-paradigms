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

在 Desktop 的“插件”页启用两个 bundle，重启 Desktop；新会话选择 **Vibe Health**。选择后权限自动变为“仅可查看”，工具仅包含 `vibe_health`，返回 `status: ok` 和 `Hello from Five Modes.`。

密钥由官方 credentials 服务保存为 `OPENCODE_API_KEY`，或通过该环境变量提供；密钥值不进入仓库或 profile patch。模型默认值模板见 [config/profile.patch.yml](config/profile.patch.yml)，仅覆盖 `agent-default-model`。

自定义 profile 可通过以下命令准备：

```sh
pnpm profile:create
```

默认创建仓库内已忽略的 `.local/dsh/profiles/five-modes`，继承 shipped profile 的组合并安装同一 bundle；不启动 Web 服务，不复制凭据。也可设置 `DSH_HOME` 指定独立位置。重复执行复用现有 profile；保留其他配置并更新上述默认模型。

开发时用 `pnpm build` 生成 `lib/` 与 bundle patch。M1 验证了根策略源码 HMR 和预设配置 HMR；直接修改 standing preset 子插件源码的自动更新尚未通过，修改 Health 源码后应重启 Desktop。
