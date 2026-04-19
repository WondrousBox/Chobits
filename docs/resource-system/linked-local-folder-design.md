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
- linked 目录在树上已禁用普通新建/重命名/删除/拖拽源行为。

### 7.4 资源侧安全保护

本轮已经补上的保护：

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

## 8. 当前边界

当前 linked 模式的定位是：

- 可关联
- 可扫描
- 可手动重扫
- 可展示目录树和资源
- 可预览
- 可继续使用 `resproject` 派生能力
- 可解除关联

但当前仍然是“只读浏览优先”，以下能力暂未正式放开：

- 在 linked 目录下真实创建文件夹
- 在 linked 目录下上传/导入新文件并直接写入物理目录
- 真实 rename 文件/目录
- 真实 move 文件/目录
- 真实 delete 文件/目录
- watcher 实时同步

这部分建议作为 Phase 2 单独实现与验证。

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

建议按这个顺序补：

1. linked 目录下真实创建子目录。
2. linked 目录下导入/上传文件，直接写入真实目录。
3. linked 资源 rename。
4. linked 资源 move。
5. linked 资源 delete 与恢复策略。
6. linked folder rename/move 以及递归更新 `relativePath`。

### Phase 3：同步和修复

- 文件系统 watcher。
- 外部改动实时刷新。
- 断链目录修复。
- 导出/导入时对 linked mount 的降级策略和重连策略。

## 11. 风险与注意事项

- linked 模式必须继续把数据库作为主索引，否则现有资源系统无法平滑兼容。
- linked 目录的 UI 状态文件、布局文件、缩略图缓存不能写回真实目录。
- 真实文件写操作必须晚于 Phase 1 落地，否则很容易误伤用户硬盘内容。
- unlink 必须永远保证“不删除真实文件”。

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
- `src/pages/ResourcePage/components/FolderTreeRow.tsx`
- `src/pages/ResourcePage/components/layout/ResourceSidebar.tsx`
- `src/pages/ResourcePage/hooks/useFolderOperations.ts`
- `src/pages/ResourcePage/hooks/useFolderImport.ts`
- `src/pages/ResourcePage/hooks/useResourceOperations.ts`

## 13. 结论

本需求最合适的实现路径已经明确：

- 不做“纯物理目录映射且完全不入库”。
- 做“数据库入索引，但不复制原始文件”。
- 派生产物继续留在 workspace 的 `resproject`。
- Phase 1 先把 linked 目录纳入系统并保证安全只读。
- Phase 2 再逐步开放真实物理写操作。
