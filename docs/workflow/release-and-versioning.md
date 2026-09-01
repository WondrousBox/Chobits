# 工作流发布与版本策略

## 1. 当前发布线

`@chobits/workflow` 当前 manifest 版本为 `0.1.0`，状态为“技术发布边界已加固、Phase 11 清理待完成、尚未执行外部 registry 发布”。支持 Node.js 18+、ESM 和 TypeScript declarations，不承诺 CommonJS、浏览器或分布式 worker。

公开兼容面只包括 `package.json` 的 exports 和可序列化 contract。仓库内相对路径、`src/`、`dist/`、私有的 `@workflow/integrations`、Electron composition root 和 renderer client 都不属于公共包版本承诺。

## 2. SemVer 规则

- 首次外部发布前，manifest 版本不构成外部兼容承诺；允许删除仓库内部迁移 API，但必须迁移 production、test、fixture、文档和存量用户数据。
- 首次外部发布的 package exports、可序列化 contract、错误码和运行语义开始受 SemVer 约束。
- 发布后的补丁版本不得删除 export、增加既有函数必填参数、改变终态含义，或让该发布线已有合法 definition/request 失效。
- 发布后的不兼容变更必须先给出弃用和迁移说明，再进入允许破坏兼容的版本；不能用永久源码转发层替代正常版本演进。
- `1.0.0` 只在公共 contract、错误码、节点 SDK 和存储 port 经至少一个外部使用周期后考虑。

数据库 schema、宿主应用 preset ID 和业务 node ID 不跟随 npm package SemVer 自动迁移。它们有独立的数据兼容约束，任何变化都必须显式迁移。

## 3. 首次发布前清理窗口

此前 Phase 10 计划在完整 `0.1.x` 中保留旧源码兼容面。由于公共包尚未外部发布，该计划由 Phase 11 取代；以下内容不得进入首次发布基线：

- `defId/def/metadata` legacy run request 映射。
- 默认全局 registry 和模块级注册函数。
- 无前缀旧类型别名与 `types.ts` 兼容聚合门面。
- `packages/workflow/index.ts`、业务节点/plugin/store/adapter 和 OCR runtime 转发文件。
- 公共 `ExecutionContext` 中的宿主 services、FFmpeg、plugin resource 和资源目录字段。
- `src/` 对顶层旧实现的反向导出。

用户保存的 definition 不按源码兼容面处理。删除 schema 读取 fallback 前，必须为内置预设和存量 definition 写入显式版本并验证迁移结果。AI provider、媒体和 OCR 的运行 fallback 也必须通过独立行为覆盖决定，不能为了满足“零 legacy”文本检查而误删。

完整范围和批次见 [工作流旧版兼容清理计划](./legacy-removal-plan.md)。

## 4. 自动发布门槛

从仓库根执行：

```text
pnpm workflow:release:check
pnpm workflow:test:consumer
pnpm workflow:integrations:check
pnpm exec tsc --noEmit --pretty false
pnpm exec vitest run test/*workflow*.spec.ts test/*workflow*.spec.tsx test/automation-scheduler.spec.ts
```

`workflow:release:check` 会验证：

- package 名称、当前预发布版本、Node engine、ESM、`sideEffects: false` 和 `publishConfig`。
- 12 个允许的 exports 均有源码入口、ESM 和 declaration 目标。
- 生产 renderer 不使用仓库 workflow alias，Electron host 不绕过已有公共 exports。
- 公共依赖闭包只包含包内源码、Node built-ins、`zod` 和声明所需的 Node types。
- build 后每个公开 ESM 入口都可由 Node 直接加载，source map 不含用户主目录绝对路径。

Phase 11 将把以下规则加入同一发布门槛：

- production、test、fixture 和文档不再引用旧源码路径或 legacy request。
- 公共包不存在默认 registry、旧类型别名、宿主 context 字段和顶层实现反向导出。
- 预设及存量 definition 迁移完成，`schemaVersion` 不再依赖缺失值 fallback。
- 检查范围覆盖 `packages/ai`、`packages/workflow-integrations`、Electron 和 renderer 的全部 production source。

`workflow:test:consumer` 会在系统临时目录中：

1. 执行真实 `pnpm pack`。
2. 解析 tar archive，而不是依赖命令输出文本。
3. 拒绝源码、fixture、script、cache、数据库、环境文件、软链接和越界路径。
4. 限制为最多 256 个文件、解压后最多 5 MiB，并确认所有 export target 存在。
5. 离线安装 tarball，以 `skipLibCheck: false` 编译独立 TypeScript consumer。
6. 只用公开 exports 验证第三方 node、capability、store、运行、取消、事件、flush 和 dispose。
7. 验证 `src/`、`dist/` 深层导入被 `ERR_PACKAGE_PATH_NOT_EXPORTED` 拒绝。

## 5. 发布步骤

1. 完成 Phase 11 及其 definition 数据迁移验收，确认零旧版兼容债务。
2. 确定首次发布版本并更新 release notes，说明正式 exports、运行要求和数据边界。
3. 运行全部自动发布门槛、lint、Prettier、`git diff --check` 和敏感路径检查。
4. 使用 `pnpm --dir packages/workflow pack` 检查最终 tarball 摘要。
5. 在明确选择 registry、scope 和发布凭据后执行发布；自动验收脚本本身不会向外部 registry 写入。
6. 发布后从空项目安装精确版本，再重复最小运行和类型检查。

包化、build、pack 和 consumer 测试不会启动 Electron 应用，也不会执行数据库 migration。数据库字段变化仍必须先修改 schema，再执行 `pnpm db:generate` 并检查生成 migration。
