# 关联本地文件夹资源管理设计

## 1. 原始需求保留

以下内容按原始需求整理后保留，作为本设计文档的输入，不删除。

- 先帮我看看现有的资源导入是什么工作原理，并且看看有没有入库。
- 如果是用户自己新建文件夹，那都是存放在工作空间的资源管理里面，而且是平铺的。
- 现在想实现一种新的模式：当用户选择电脑上的某些文件夹之后，需要将文件夹纳入管理。
- 目标是让软件帮助用户管理电脑里的资源，所以不希望再次把资源复制到工作空间里。

期望功能：

1. 增加一个“关联本地文件夹”的按钮入口，点击后弹出选择文件夹。用户选中本地文件夹后，提示是否授权管理这个文件夹；授权后把这个文件夹纳入管理。
2. 文件夹纳入管理后，需要有扫描导入能力，并且目录结构要和物理硬盘保持一致。用户的新增、删除、修改等能力需要和真实文件夹挂钩，并符合当前资源界面的操作逻辑。
3. 这些资源需要支持和现有资源管理相同的能力，包括转写、翻译等，但要考虑派生产物放在哪里。
4. 需要支持随时解除文件夹关联；资源界面里要能明确标识哪些目录是通过物理硬盘关联进来的。
5. 需要判断关联目录里的操作是继续入库，还是只做物理目录映射并通过映射文件隔离管理。

## 2. 现状结论

### 2.1 现有资源导入怎么工作

当前至少有两条主要导入链路：

- 上传/拖拽/粘贴：
  - 渲染层先把文件上传到 workspace 下的 `resources/`。
  - 然后通过 `resource:add` 建资源索引。
- 导入本地文件/文件夹：
  - 主进程直接扫描本地路径。
  - 创建 `folders`/`resources` 记录。
  - 同时把文件复制到 workspace 的资源目录里。

### 2.2 现有系统有没有入库

有，而且数据库是主索引。

- `folders` 保存资源目录树。
- `resources` 保存资源索引、状态、路径、标签等。
- AI、工作流、自动化、派生资源目录都依赖 `workspaceId / folderId / resourceId` 这一套身份。

结论：

- 不能做“完全不入库”的一期方案。
- 最合理方案是：继续入库做索引，但不复制关联目录中的原始文件。

## 3. 目标方案

采用“数据库入索引，但不复制原始文件”的模式。

- 原始文件仍留在用户硬盘原位置。
- 应用只把目录树和文件信息写入数据库。
- `resource.filePath` 对 linked 资源直接保存外部绝对路径。
- AI 派生产物继续存放在 `projects/<resourceId>.resproject/`。
- 缩略图、布局缓存等应用私有数据继续留在 workspace 中，不写回用户真实目录。

这意味着系统会同时支持两种来源：

- `workspace`：现有托管模式，文件实际存放在 workspace。
- `linked`：新模式，数据库托管索引，磁盘托管原文件。

## 4. 关键设计决定

### 4.1 关于“要不要入库”

最终决定：

- 要入库。
- 不复制原始文件。

原因：

- 当前资源页、预览、标签、收藏、评分、工作流、AI 操作都依赖数据库索引。
- 如果不入库，就要重写大量查询、树结构、派生资源和自动化逻辑。
- 这不属于“在现有系统上扩展”，而是重做第二套资源系统。

### 4.2 派生产物放哪里

继续放在 workspace：

```text
<workspaceRoot>/projects/<resourceId>.resproject/
```

这样可以保证：

- 不污染用户真实目录。
- 不改变现有 AI/转写/翻译/轨道工程逻辑。
- linked 资源和 workspace 资源共享同一套派生能力。

### 4.3 linked 目录的操作策略

当前分阶段策略：

- Phase 1：先做“关联 + 扫描 + 浏览 + 预览 + AI 派生可继续使用”。
- Phase 1 内对会直接改动真实文件的操作先视为只读，统一拦截。
- Phase 2 再补“真实物理 rename/move/delete/create/upload”等写操作。

## 5. 数据模型

### 5.1 新表

新增 `linked_folder_mounts`：

- `id`
- `workspaceId`
- `rootFolderId`
- `absolutePath`
- `displayName`
- `authorizedAt`
- `status`
  - `active`
  - `disconnected`
- `lastScanAt`
- `watchEnabled`
- `metadata`

### 5.2 folders 扩展

新增字段：

- `originType`: `workspace | linked`
- `linkedMountId`
- `relativePath`

### 5.3 resources 扩展

新增字段：

- `originType`: `workspace | linked`
- `linkedMountId`
- `relativePath`
- `externalMtimeMs`
- `externalSizeBytes`
- `syncState`
  - `synced`
  - `missing`
  - `conflict`

## 6. Phase 0 已落地

本阶段目标是把 linked 模式所需的基础抽象和表结构先铺好。

已完成：

- 新增 `linked_folder_mounts` 表。
- `folders/resources` 已增加来源字段和 linked 关联字段。
- `resources` 已增加外部文件同步字段。
- 新增统一路径解析层：
  - `electron/main/handlers/folder/storage.ts`
- 新增 `folder.getResolvedPath`，不再让前端硬编码拼接 `workspace/resources/folders/<folderId>`。
- linked 目录的布局文件已切到：
  - `workspace/resources/.folder-layouts/<folderId>.layout.json`
- 资源协议白名单支持新增和移除外部目录。
- 应用启动时会恢复 active linked roots 的协议白名单。

## 7. Phase 1 当前已落地

### 7.1 主能力

已完成以下能力：

- 新增 linked 扫描服务：
  - `electron/main/handlers/folder/linked-sync.ts`
- 支持创建或复用 mount。
- 支持创建或恢复 linked 根目录节点。
- 支持首次扫描物理目录树并建立 `folders/resources` 索引。
- 支持根据 `(linkedMountId, relativePath)` 对齐已有记录。
- 支持缺失文件/目录标记为隐藏，并清理 recycle bin 索引。
- 支持 unlink：
  - mount 标为 `disconnected`
  - linked 索引隐藏
  - 不删除真实文件

### 7.2 IPC

新增 folder 侧 IPC：

- `folder.linkLocalDirectory`
- `folder.rescanLinkedDirectory`
- `folder.unlinkLocalDirectory`

### 7.3 前端

已完成：

- `ResourcePage` 已接入 link/rescan/unlink handler。
- `ContentToolbar` 已增加“关联本地文件夹”入口按钮。
- `FolderTreeRow` 已支持 linked root badge。
- `FolderTreeRow` 已支持 linked root 菜单：
  - `Rescan`
  - `Unlink`
- linked 目录的打开位置已经统一走 `folder.getResolvedPath`。
- Phase 1 时 linked 目录在树上禁用了普通新建/重命名/删除/拖拽源行为；Phase 2 已部分放开创建、重命名、移动。

### 7.4 资源侧安全保护（Phase 1 历史状态）

Phase 1 为了先保证 linked 模式安全落地，曾经补过以下保护：

- linked 目录禁止作为以下入口的目标：
  - `resource:importLocalFiles`
  - `resource:importLocalFolders`
  - `uploadResourceFile`
  - `uploadResourceFileStreamStart`
  - `resource:add`
- linked 资源禁止：
  - `deleteResource`
  - `deleteResources`
  - `deleteResourcePermanently`
  - `renameResource`
  - `resource:moveToFolder`
  - `moveResourcesToWorkspace`
- linked 字幕资源禁止通过 `resource:update.subtitleContent` 回写真实文件。

前端也补了两类兜底：

- 删除失败时不再错误地把本地列表先移掉。
- 导入失败时会给出明确提示。

注意：这些保护不是最终目标。Phase 2 已经部分解除创建、导入、上传、重命名、移动相关限制；删除/恢复策略仍保持保护，见后文当前边界。

## 8. 当前边界

当前 linked 模式的定位是：

- 可关联
- 可扫描
- 可手动重扫
- 可展示目录树和资源
- 可预览
- 可继续使用 `resproject` 派生能力
- 可解除关联
- 可在 linked 目录下创建真实子目录
- 可导入/上传文件到 linked 目录，并直接写入用户真实目录
- 可重命名 linked 资源文件，并同步 `relativePath`、`externalMtimeMs`、`externalSizeBytes`
- 可在同一 linked mount 内移动资源/目录，并递归更新目录树和资源路径
- 可在 workspace 与 linked 目录之间移动资源，移动时会迁移真实文件并切换 `originType`
- 可通过文本/字幕内容更新写回真实文件，并更新外部文件快照字段
- 可删除 linked 资源到应用管理的 linked trash，并从回收站恢复
- 可删除 linked 非 root 文件夹到回收站，并在恢复时带回子资源

当前仍未正式放开：

- linked root delete
- direct permanent delete（不经过回收站）对 linked 资源/目录的产品入口
- 跨 linked mount 资源/目录移动
- 缺失 linked 文件夹/整棵断链目录的可视化修复
- 真正的 conflict 检测与冲突解决策略

当前 delete/restore 的实际语义：

- linked 资源软删时，真实文件会被移到 workspace 下的应用私有 linked trash。
- linked 非 root 文件夹软删时，会级联软删其子资源与子目录；真实文件进入 linked trash。
- 当前不会把 linked 文件夹整体搬运到 `.linked-trash`；但在软删后会按原路径尽力移除已经变空的目录骨架。
- restore linked 文件夹时，会先按 `originalFolderPath` 重建目录骨架，再恢复子资源；纯空目录分支也能回来了。
- purge linked 文件夹时，只会尝试清理仍为空的原目录骨架，避免误删用户后来新放进去的文件。

因此当前 Phase 2 的实际状态是“创建/导入/上传/重命名/移动/软删恢复已开放，但永久删除和同步修复仍保持受控”。

当前 watcher 的实际语义：

- active linked mount 启动时会自动恢复 watcher，并在启动后触发一次防抖 rescan。
- linked 目录发生外部文件/目录变化时，会由主进程 watcher 触发防抖 rescan，同步更新 DB 索引。
- 当前 watcher 已经和资源页 repair UI 接通了第一版文件级修复能力：
  - linked 资源若在磁盘上缺失，会保留资源索引并标记 `syncState=missing`。
  - linked 子目录若在磁盘上缺失，会保留文件夹索引并在 `folders.metadata.linkedFolderState` 标记 `missing-folder`。
  - linked 资源若同一路径文件在 watcher/startup 扫描中发现外部 mtime/size 变化，会标记 `syncState=conflict`。
  - 用户手动 Rescan 会把磁盘当前状态确认为新的同步快照，并把冲突资源恢复为 `synced`。
  - 文件夹树、网格/列表文件夹项会显示缺失目录 badge，并提供“选择新路径重连 / 在原位置重建目录 / 忽略缺失目录”的基础修复入口。
  - 资源页顶部会在存在缺失 linked 子目录时显示批量修复入口，可逐个或批量重建/忽略目录。
  - 缺失/冲突资源的预览会被前端拦截，并提示用户“重新扫描关联目录 / 打开所在目录”。
  - 资源右键菜单已补 missing 的 rescan/open 修复入口，以及 conflict 的“采用磁盘版本 / 另存磁盘副本并确认”决策入口。
- 当前 watcher 也已经补上了 linked root 的目录树状态透出：
  - `linked_folder_mounts.metadata` 会记录最近一次同步结果、隐藏统计和冲突统计。
  - 目录树中的 linked root 会根据 mount 可访问性和最近同步结果显示 `Missing / Repair / Conflict / Error` badge。
  - linked root 菜单会直接展示当前异常说明，继续沿用 `Rescan / Open location / Unlink` 作为修复入口。
- 但当前仍只做到文件级 repair baseline：
  - 缺失 linked 文件夹已可见，并支持选择新路径重连、原路径重建、忽略、批量重建/忽略。
  - 当前重连策略会在同一 workspace 的 active linked mounts 中，按“最深命中的 mount”解析目标目录；若命中另一 mount，会把整棵缺失子树切换到新 mount，并同时重新扫描旧 root 与新 root，避免 badge 和统计残留。linked rescan 也会跳过嵌套的 active mount root，避免重复索引。
  - 但更完整的批量 repair 向导仍未完成。
  - conflict 已有基础检测、手动 Rescan 确认流，以及“采用磁盘版本 / 另存磁盘副本并确认”决策流；但还没有内容 diff 或真正恢复旧文件内容的能力。
  - 还没有用户可配的 watcher 开关 UI。

## 9. 解除关联语义

当前 unlink 的语义是：

- 解除系统管理关系。
- 不删除用户硬盘上的真实目录和真实文件。
- 不强删派生目录。
- 在数据库层把 linked 索引隐藏，mount 置为 `disconnected`。

这是更安全的一期行为。

## 10. 推荐的后续实施顺序

### Phase 2：真实物理写操作

1.  核对 Phase 2 相关文件现状，定位 linked 资源写入与前端限制的剩余缺口
2.  完成主进程 linked 资源写入能力与导入/上传/重命名/移动逻辑
3.  放开前端 linked 非 root 的目录操作并补充错误提示
4.  更新 linked 本地文件夹设计文档，保留原始需求并同步当前实现状态
5.  做最小化校验，汇总剩余风险与未完成项

本次继续 Phase 2 后的完成状态：

- 已清理中断时残留的主进程不可达旧分支和重复声明，恢复本次相关文件的语法检查。
- 已保留并收口 `resource:add` 对 linked 目标的写入逻辑：
  - 外部文件会复制到 linked 真实目录。
  - 文本资源会写成真实 `.txt` 文件。
  - 已在 linked 目标目录内的文件不会重复复制。
  - 写入后会同步 `originType`、`linkedMountId`、`relativePath`、外部 mtime/size 和 `syncState`。
- 已保留并收口导入/上传链路：
  - `resource:importLocalFiles`
  - `resource:importLocalFolders`
  - `uploadResourceFile`
  - `uploadResourceFileStreamStart/Chunk/End`
  - linked 导入目录会复制到真实 linked 目录后触发 rescan。
- 已收口 linked 资源重命名与移动：
  - `renameResource` 支持真实文件 rename。
  - `resource:moveToFolder` 支持 linked 同 mount 内移动、workspace 与 linked 之间移动。
  - 跨 linked mount move 仍显式拒绝。
- 已补 linked delete/restore：
  - `deleteResource` / `deleteResources` 对 linked 资源已放开。
  - linked 资源软删时，真实文件进入 workspace 私有 linked trash。
  - `folder.softDelete` 对 linked 非 root 文件夹已放开，并会级联处理子资源。
  - `folder.softDelete` 会在文件移走后尽力移除已经变空的 linked 目录骨架。
  - `folder.restore` 和 `trash:restore` 恢复 linked 文件夹时，会先重建目录骨架，再同步恢复其子资源。
  - 如果只恢复 linked 子目录或子资源，会自动补回仍处于已删除状态的祖先目录链，避免恢复后挂在一个不可见父节点下。
  - folder/conversation 的回收站索引会在恢复后同步清理，避免恢复后仍残留在回收站列表。
  - `trash:purge` 对 linked 文件夹仅清理空目录骨架，避免误删回收站创建后新增的外部文件；同时已修正 purge 时读取原始目录 payload 的时机。
- 已保留并收口 linked folder 创建、重命名、移动：
  - linked root 本身仍不可 rename/move。
  - linked root 下可以创建真实子目录。
  - linked folder rename/move 会递归更新子目录和资源的 `relativePath`/`filePath`。
- 已补前端限制与错误提示：
  - `FolderTreeRow` linked root 菜单放开 New folder。
  - `FolderSidebar` 不再阻止在 linked root 下创建子目录。
  - 资源重命名等待主进程返回并显示失败原因。
  - 导入、移动、删除相关错误提示区分“写入失败”“跨 mount 不支持”“删除/恢复策略未开放”。
- 已补 linked watcher：
  - `linked-sync.ts` 维护 linked mount watcher 的注册、清理、防抖和串行 rescan。
  - active mount 在启动时会恢复 watcher，并调度一次 startup rescan。
  - link / unlink 会同步启停 watcher，并更新 `watchEnabled`。
  - `LINKED_DIRECTORY_SYNCED` 事件会触发资源页刷新资源、文件夹和标签列表。
- 已补 linked conflict baseline：
  - watcher/startup 扫描若发现同一路径文件的 mtime/size 与上次快照不同，会保留旧快照并标记 `syncState=conflict`。
  - 手动 Rescan 视为用户确认磁盘版本，会更新 `externalMtimeMs`/`externalSizeBytes` 并恢复为 `synced`。
  - linked root 状态摘要会透出 conflict 数量，并显示 `Conflict` badge。
- 已补 linked folder-level repair baseline：
  - 外部缺失的 linked 子目录不再被 `deletedAt` 隐藏，而是通过 `folders.metadata.linkedFolderState` 标记为 `missing-folder`。
  - 缺失子目录在侧边树、网格文件夹卡片和列表文件夹行里保持可见并显示 `Missing` badge。
  - 缺失子目录可选择同一个 linked root 内的新路径重连；重连后会更新该子树的 `relativePath`，并自动 Rescan。
  - 缺失子目录可通过菜单在原路径重建目录；重建后会自动 Rescan，并清理 folder 级 missing 状态。
  - 缺失子目录也可通过菜单忽略；忽略只更新 DB 索引和回收站，不移动任何外部文件，并会尝试自动 Rescan 刷新 root 统计。
  - 资源页顶部提供缺失目录批量修复入口，支持逐个处理和批量重建/忽略。
- 已补 linked conflict decision baseline：
  - conflict 资源可采用磁盘版本，将当前磁盘 mtime/size 确认为新的同步快照。
  - conflict 资源可先把当前磁盘文件复制成 workspace 副本，再确认 linked 资源的磁盘版本。
  - 决策完成后会自动 Rescan linked root，让 root badge 和统计恢复一致。

后续建议按这个顺序补：

1. 缺失 linked 子目录更完整的批量 repair 向导。
2. conflict 的内容 diff、旧文件内容恢复、双版本并排预览。
3. 跨 mount move 的产品策略：禁止、复制、还是移动并切换 mount。

### Phase 3：同步和修复

当前状态：

- watcher 基础能力已完成。
- 文件级 missing repair UI 已起步。
- 文件夹级 missing 可见性、跨 mount 重连、原路径重建、忽略和批量入口已起步。
- 文件级 conflict 检测、手动确认和基础决策流已起步。
- linked root 级别的断链状态可见性与 repair 入口已起步。

后续仍需补齐：

- watcher 精细化与策略开关。
- 外部改动实时刷新策略的细化与降噪。
- 断链子目录 / 缺失 linked 文件夹的批量向导与更多半自动 repair 策略。
- conflict 的 diff 提示、旧版本恢复与双版本预览。
- 导出/导入时对 linked mount 的降级策略和重连策略。

## 11. 风险与注意事项

- linked 模式必须继续把数据库作为主索引，否则现有资源系统无法平滑兼容。
- linked 目录的 UI 状态文件、布局文件、缩略图缓存不能写回真实目录。
- 真实文件写操作已经在 Phase 2 部分开放，后续继续新增 delete/restore 时必须显式确认语义，避免误删用户硬盘内容。
- unlink 必须永远保证“不删除真实文件”。
- linked delete 当前已采用“应用私有 linked trash + 回收站索引 + 空目录骨架尽力移除/恢复”的组合语义，但仍不是整棵目录树的物理 trash 搬运。
- linked mount 内部 move/rename 会改变用户真实目录；失败时应优先保持数据库不提前提交。
- watcher 当前是“目录级防抖重扫”，不是精细 diff；大目录高频写入时仍可能有重复扫描成本。
- 当前 root-level repair UI 只能覆盖 linked root 自身的可访问性与最近同步摘要；若具体缺失的是某个子目录，该子目录节点仍会被隐藏。
- linked folder purge 目前只安全清理空目录骨架；若未来要整体删除原目录，必须先处理“回收站删除后用户又往原目录写入新内容”的风险。
- 若用户在 soft delete 之后又在原路径放入同名文件或把目录替换成文件，当前 restore 仍是 best-effort，完整冲突修复 UI 需要放到后续阶段。

## 12. 本次代码涉及的核心文件

- `electron/main/handlers/folder/linked-sync.ts`
- `electron/main/handlers/folder/ipc-main.ts`
- `electron/main/handlers/folder/ipc-renderer.ts`
- `electron/main/handlers/folder/storage.ts`
- `electron/main/handlers/resource/ipc-main.ts`
- `electron/main/handlers/resource/index.ts`
- `electron/main/resource-protocol.ts`
- `electron/main/index.ts`
- `src/pages/ResourcePage/ResourcePage.tsx`
- `src/pages/ResourcePage/components/layout/ContentToolbar.tsx`
- `src/pages/ResourcePage/components/ExplorerGrid.tsx`
- `src/pages/ResourcePage/components/ExplorerList.tsx`
- `src/pages/ResourcePage/components/FolderTreeRow.tsx`
- `src/pages/ResourcePage/components/FolderSidebar.tsx`
- `src/pages/ResourcePage/components/layout/ResourceSidebar.tsx`
- `src/pages/ResourcePage/hooks/useFolderOperations.ts`
- `src/pages/ResourcePage/hooks/useFolderImport.ts`
- `src/pages/ResourcePage/hooks/useResourceOperations.ts`
- `src/pages/ResourcePage/services/resourceService.ts`
- `src/pages/ResourcePage/utils/linkedFolderState.ts`
- `src/pages/ResourcePage/utils/linkedResourceSync.ts`

## 13. 结论

本需求最合适的实现路径已经明确：

- 不做“纯物理目录映射且完全不入库”。
- 做“数据库入索引，但不复制原始文件”。
- 派生产物继续留在 workspace 的 `resproject`。
- Phase 1 先把 linked 目录纳入系统并保证安全只读。
- Phase 2 已经开放创建、导入/上传、重命名、移动等真实物理写操作。
- Phase 2 已继续开放 linked 资源与 linked 非 root 文件夹的软删/恢复。
- Phase 2 已补上 linked 空目录骨架的基础 trash/restore 语义。
- Phase 3 所需的 linked watcher 基础能力已补齐。
- Phase 3 的文件级 missing repair UI 已起步。
- Phase 3 的文件级 conflict 检测、手动 Rescan 确认和基础决策流已起步，但内容 diff/旧版本恢复仍未完成。
- 文件夹级 missing 可见性、跨 mount 重连、原路径重建、忽略和批量入口已起步，但完整批量向导仍未完成。
- 下一步更适合继续推进 conflict diff / 双版本预览，以及 repair/conflict 流的 focused tests 收口。
