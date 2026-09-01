# 工作流文档

本目录统一维护工作流系统的架构、公共 API、发布策略、实施计划和直接集成方案。文档必须明确区分当前实现与未来路线，尚未实现的 API 不能写成现状。

## 核心文档

- [目标架构](./architecture.md)：公共 Node-first 内核、宿主应用工作流集成层、宿主层和客户端的职责与依赖边界。
- [公共 API 与扩展指南](./public-api.md)：公开 exports、runtime、节点 SDK、store/capability/control adapters 和生命周期。
- [发布与版本策略](./release-and-versioning.md)：首次外部发布前清理策略、Node/ESM 支持范围、SemVer、自动发布门槛和发布步骤。
- [优化实施计划](./implementation-plan.md)：Phase 1-11 的范围、实施记录、验收结果和数据库约束。
- [旧版兼容清理计划](./legacy-removal-plan.md)：Phase 11 的删除清单、数据迁移边界、保留项、实施批次和验收门槛。
- [Agent 媒体链工作流计划](./agent-media-chain-plan.md)：AI 工具作为工作流宿主消费者时的资源链和结果契约。

源码模块的当前结构、运行语义和扩展说明见 [工作流模块 README](../../packages/workflow/README.md)。

## 相关领域文档

- [主进程统一调度系统](../scheduler-system/main-process-scheduler-unification-plan.md)：scheduler 负责触发、准入和审计，通过注入的 runtime facade 使用工作流。

调度器、AI provider、OCR、资源、onboarding 和 sprite 等文档仍归各自领域目录维护。它们可以引用工作流公开 contract，但不作为工作流公共内核的架构定义。

## 维护规则

- 架构决策优先更新 `architecture.md`，再同步实施计划和直接集成文档。
- 当前实现发生目录移动时，同步更新相关领域文档中的文件路径，不提前把目标路径写成现状。
- 包化默认不修改数据库模型；如果后续确需修改表字段，必须先修改 schema，再执行 `pnpm db:generate` 并检查 migration。
- 仓库内链接使用相对路径，不写入个人用户名、用户主目录、密码、密钥或访问令牌。
