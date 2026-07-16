# 本地文件拖拽路径优先导入实施计划

> 状态：实施完成，待应用冒烟验收
> 日期：2026-07-16
> 参考实现：`F:\Develop\electron-react` 提交 `82b7e75a7bb2cf759f20a369b53b7f656849ae16`

## 1. 背景

本项目当前通过公共 `Dropzone` 接收桌面拖入的文件，再由资源服务把 `File` 内容传给 Electron 主进程：

- 小文件先执行 `File.arrayBuffer()`，再通过 `uploadResourceFile` 一次性传输。
- 大于 50 MB 的文件通过 `File.stream()` 和三段流式 IPC 接口分块传输。
- 主进程收到内容后写入 workspace，随后调用 `resource:add` 创建资源记录。

这条“上传”链路不是网络上传，而是渲染进程到主进程的本地 IPC 数据传输。对于原本就在本机磁盘上的拖拽文件，这会产生不必要的读取、序列化、跨进程传输和再次写入。

本项目使用 Electron `39.2.7`，但仍依赖旧的非标准 `File.path`。Electron 已使用 `webUtils.getPathForFile(file)` 取代对 `File.path` 的扩展，因此物理文件拖入后无法可靠获得绝对路径。

同时，`react-dropzone` 使用的 `file-selector` 会为文件补充类似 `./example.mp4` 或 `/folder/example.mp4` 的相对路径。该路径只用于表示拖入目录结构，不能作为磁盘源文件路径。

## 2. 现状结论

### 2.1 问题根因

当前问题由三部分共同造成：

1. preload 没有暴露 `webUtils.getPathForFile(file)`。
2. 渲染层多处继续读取 `(file as any).path`，取得的可能为空，也可能只是 `file-selector` 生成的相对路径。
3. `addResourcesFromSelectedFiles()` 只要看到 `f.file` 就无条件走内容上传，没有“真实本地路径优先”的分支。

### 2.2 已有能力

主进程的 `resource:add` 已经具备托管本地文件的主要能力：

- 根据 workspace/folder 决定目标目录。
- 使用 `fs.copyFile` 把外部文件复制到资源目录。
- 避免覆盖同名文件。
- 识别资源类型、生成缩略图并创建数据库记录。

因此一期不需要重写资源导入系统，也不需要修改数据库表结构。需要补齐的是路径获取、路径语义和导入分支选择。

## 3. 实施目标

### 3.1 功能目标

- 对来自本地磁盘的拖拽文件，使用 `webUtils.getPathForFile(file)` 获取绝对路径。
- 物理文件优先把路径交给主进程，由主进程直接执行文件复制。
- 不再把物理文件内容通过 IPC 上传给主进程。
- 对剪贴板图片、录音、截图和 JavaScript 构造的 `File`/`Blob` 保留现有上传兜底。
- 正确区分磁盘绝对路径和拖入目录的相对层级。
- 精灵文件投递、资源页、背包和字幕时间线等拖拽入口使用同一套路径获取规则。

### 3.2 性能目标

- 物理文件拖入时不调用 `File.arrayBuffer()` 或 `File.stream()`。
- 物理文件拖入时不调用 `uploadResourceFile*` IPC。
- 大文件复制由主进程文件系统 API 完成，不经过渲染进程内存。

### 3.3 正确性目标

- 原始文件保持不变，资源库保存 workspace 内的副本。
- 复制成功后才创建资源记录。
- 复制失败时返回明确错误，不静默创建指向外部源文件或空路径的记录。
- 文件投递完成事件中的 `files` 和 `resources` 使用最终可用路径。

## 4. 非目标

- 本期不删除现有上传接口；它们仍服务于没有磁盘路径的内存文件。
- 本期不改变 linked folder 的“不复制原文件”语义。
- 本期不增加数据库字段，不执行 schema 变更或 `db:generate`。
- 本期不实现任意目录授权或长期文件访问授权模型。
- 本期不重写文件夹批量扫描和 `resource:importLocalFolders`。
- 本期不改变资源去重策略；如需按 hash 去重，应单独设计。

## 5. 关键设计决定

### 5.1 路径只在 preload 中解析

在 preload 文件桥接中新增同步方法：

```ts
getPathForFile(file: File): string;
```

实现规则：

1. 优先调用 `webUtils.getPathForFile(file)`。
2. Electron 旧版本兼容时，可读取 legacy `file.path`。
3. legacy 值必须是绝对路径；拒绝 `./name`、`/folder/name` 等由 `file-selector` 生成的相对路径。
4. 对 JavaScript 构造且没有磁盘后端的 `File` 返回空字符串。
5. 获取失败返回空字符串，由资源服务决定是否进入上传兜底。

渲染层不直接导入 Electron 的 `webUtils`，也不自行猜测文件系统路径。

### 5.2 分离本地路径和相对路径

扩展 `SelectedResourceFileType`：

```ts
export type SelectedResourceFileType = {
  path: string;          // 兼容现有调用，迁移期间不再作为唯一语义来源
  localPath?: string;    // 本地磁盘绝对路径，仅由 preload bridge 解析
  relativePath?: string; // 拖入目录内的相对路径，仅用于重建目录层级
  name?: string;
  size?: number;
  file?: File;
  // 其余现有字段保持不变
};
```

约束：

- 是否可直接复制只检查 `localPath`，不检查 `path` 或 `relativePath`。
- 资源页目录分组只使用 `relativePath`，不从 `localPath` 截取目录。
- `path` 暂时保留以降低迁移风险；本期完成后，新代码不得继续赋予它多重语义。
- 后续可单独清理 `path` 字段，但不作为本期阻塞项。

### 5.3 物理路径优先，内容上传兜底

资源服务采用以下决策顺序：

```text
存在 localPath
  -> 校验并调用主进程路径导入/资源创建能力
  -> 主进程复制文件到 workspace
  -> 返回创建后的 Resource

不存在 localPath，但存在 File
  -> 使用现有 ArrayBuffer/stream 上传
  -> 再创建 Resource

两者都不存在
  -> 返回可诊断错误，不创建空文件资源
```

### 5.4 复用 `resource:add`，同时收紧失败语义

一期优先复用现有 `resource:add`，避免新增一套复制、缩略图和资源入库逻辑。

在路径导入场景中需要补齐以下保障：

- 调用前确认路径为绝对路径。
- 主进程执行 `fs.stat`，确认路径存在且为普通文件。
- workspace 托管模式下，复制失败必须返回失败，不能继续用原始外部路径入库。
- linked folder 模式继续遵循现有 linked 语义，不强制复制。
- 返回值必须包含最终资源记录，供精灵投递菜单立即使用。

如果无法在不影响其他 `resource:add` 调用方的前提下收紧失败语义，则新增窄接口 `resource:importLocalPath`，其内部复用 `addResource` 的公共逻辑，不复制实现代码。

## 6. 目标流程

### 6.1 本地物理文件

```text
DOM drop
  -> react-dropzone accepted File
  -> preload: webUtils.getPathForFile(file)
  -> SelectedResourceFileType.localPath
  -> addResourcesFromSelectedFiles
  -> resource:add / resource:importLocalPath
  -> main: stat + fs.copyFile
  -> ResourcesRepo.upsert
  -> thumbnail/event/fileDrop:resources-ready
```

### 6.2 内存文件

```text
paste / screenshot / generated File
  -> preload getPathForFile returns ""
  -> SelectedResourceFileType.localPath is undefined
  -> addResourcesFromSelectedFiles
  -> existing uploadResourceFile* fallback
  -> resource:add
```

### 6.3 拖入文件夹中的文件

```text
File.localPath    = F:\source\album\cover.jpg
File.relativePath = /album/cover.jpg

localPath    -> 仅用于读取和复制源文件
relativePath -> 仅用于创建资源目录 album
```

不得从 `F:\source\album\cover.jpg` 推导资源目录，否则可能错误创建 `F:`、`source`、`album` 等层级。

## 7. 预计改动范围

### 7.1 Electron preload

涉及文件：

- `electron/preload/index.ts`
- `electron/main/handlers/file/ipc-renderer.ts`
- `src/renderer.d.ts`

改动：

- 引入 `webUtils`。
- 为 `window.YUA.file` 增加 `getPathForFile(file)`。
- 补齐 TypeScript 类型。
- 兼容 legacy 绝对 `File.path`，拒绝相对路径兜底。

### 7.2 公共拖拽模型

涉及文件：

- `src/pages/ResourcePage/types.ts`
- `src/components/common/Dropzone.tsx`

改动：

- 新增 `localPath` 和 `relativePath`。
- 公共 Dropzone 对每个 `File` 调用 preload bridge。
- 从 `file-selector` 的 `relativePath` 或 `webkitRelativePath` 保存目录相对路径。
- 文件扩展名继续优先从文件名判断，不依赖绝对路径。

### 7.3 资源导入服务

涉及文件：

- `src/pages/ResourcePage/services/resourceService.ts`
- `src/pages/ResourcePage/hooks/useResourceUpload.ts`
- 必要时修改 `electron/main/handlers/resource/ipc-renderer.ts`
- 必要时修改 `electron/main/handlers/resource/ipc-main.ts`
- `electron/main/handlers/resource/index.ts`

改动：

- `localPath` 存在时跳过所有文件内容上传接口。
- `localPath` 不存在时保留当前大小文件上传分支。
- 目录分组改用 `relativePath`。
- 主进程增加路径存在性、文件类型和复制结果校验。
- 复制成功后返回最终资源记录和路径。

### 7.4 精灵文件投递

涉及文件：

- `src/features/sprite-assistant/hooks/useFileDropCollector.ts`
- `src/features/sprite-assistant/AIAssistant.tsx`

改动：

- `sprite.fileDrop` payload 优先使用 `localPath`。
- 导入完成后的 `fileDrop:resources-ready` 使用资源最终路径。
- 保持 `correlationId`、`source: 'sprite-drop'` 和现有 purpose/routine 行为不变。
- 失败时不能发送伪造的 resources-ready 成功结果。

### 7.5 其他旧路径读取点

至少检查并迁移：

- `src/pages/ResourcePage/services/resourceService.ts`
- `src/features/sprite-assistant/hooks/useFileDropCollector.ts`
- `src/pages/ResourcePage/ResourcePage.tsx`
- `src/pages/ResourcePage/utils/resourceCardEditor.tsx`
- `src/components/chat/EmojiPackButton.tsx`
- `src/pages/ResourcePage/components/Players/SubtitlePlayer/SubtitleTimeline/components/media/MediaImportPanel.tsx`
- `src/pages/ResourcePage/components/Players/SubtitlePlayer/SubtitleTimeline/components/media/MediaTrack.tsx`
- `src/pages/ResourcePage/components/Players/SubtitlePlayer/SubtitleTimeline/components/media/MediaTrackQuickAdd.tsx`

迁移完成后，业务代码不应再直接读取 `(file as any).path`。

## 8. 分阶段实施清单

### Phase 1：preload 路径桥接

- [x] 为 `window.YUA.file` 增加 `getPathForFile`。
- [x] 使用 `webUtils.getPathForFile` 获取路径。
- [x] 增加 legacy 绝对路径兜底。
- [x] 补齐 renderer 类型声明。
- [x] 通过路径优先测试覆盖物理路径和构造的 `File` 分支。

### Phase 2：统一拖拽数据模型

- [x] `SelectedResourceFileType` 增加 `localPath`、`relativePath`。
- [x] 公共 Dropzone 同时填充两类路径。
- [x] 资源目录分组切换到 `relativePath`。
- [x] 防止 Windows 盘符或绝对目录被创建为资源文件夹。
- [x] 保持单文件和目录拖入行为兼容。

### Phase 3：路径优先导入

- [x] 重构 `addResourcesFromSelectedFiles` 的路径/上传分支。
- [x] 本地路径存在时直接调用主进程复制能力。
- [x] 本地路径不存在时继续使用当前上传兜底。
- [x] 主进程校验绝对路径、存在性和普通文件类型。
- [x] 复制失败时不创建无效资源记录。
- [x] 代码路径确认源文件不会被删除或修改。

### Phase 4：精灵投递与其他入口迁移

- [x] 精灵投递 payload 使用 `localPath`。
- [x] 精灵投递继续返回最终 Resource 给文件操作菜单。
- [x] 迁移字幕时间线拖拽入口。
- [x] 迁移表情包、资源卡片等旧 `File.path` 读取点。
- [x] 保留剪贴板和内存文件上传行为。
- [x] 全仓搜索并消除业务层直接读取 `File.path` 的代码。

### Phase 5：测试与体验收尾

- [x] 增加资源服务分支单元测试。
- [x] 增加路径 helper 和精灵文件投递回归测试。
- [ ] 在 Windows 上完成真实文件拖拽冒烟测试。
- [x] 将物理文件路径导入的 UI 文案从“上传”调整为“导入”。
- [x] 保持现有固定进度容器，未引入路径分支导致的布局变化。

## 9. 测试计划

### 9.1 preload 路径测试

| 场景 | 预期 |
| --- | --- |
| 从资源管理器拖入普通文件 | 返回绝对路径 |
| 从资源管理器拖入多个文件 | 每个文件返回对应绝对路径 |
| JavaScript `new File()` | 返回空字符串 |
| 剪贴板网页图片 | 返回空字符串并进入上传兜底 |
| legacy `.path = './a.txt'` | 拒绝作为本地路径 |
| legacy `.path` 为绝对路径 | 可作为兼容兜底 |

### 9.2 资源服务单元测试

- `localPath` 存在：不调用任何 `uploadResourceFile*`。
- `localPath` 存在：`resource:add` 收到本地源路径和正确 workspace/folder。
- `localPath` 缺失且 File 小于等于 50 MB：调用一次性上传。
- `localPath` 缺失且 File 大于 50 MB：调用流式上传。
- 上传或复制失败：不创建空路径资源。
- `source: 'sprite-drop'` metadata 在两条分支中均保留。

### 9.3 目录结构测试

- 单文件 `F:\Downloads\a.txt` 不创建 `F:` 或 `Downloads` 资源目录。
- 拖入目录 `/album/a.jpg` 时只创建 `album`。
- 多层目录 `/album/2026/a.jpg` 正确创建两层资源目录。
- 同名文件复制时使用现有唯一命名规则。

### 9.4 集成与手动验收

- 向资源页拖入一个小文件，确认资源可预览且源文件未变化。
- 向资源页拖入一个大于 50 MB 的文件，确认不经过流式上传 IPC。
- 向桌面精灵拖入文件，确认资源创建、菜单打开和 purpose 事件闭环正常。
- 向背包拖入多个文件，确认全部复制成功。
- 向字幕时间线拖入视频/图片，确认能取得真实路径。
- 粘贴剪贴板图片，确认仍可创建资源。
- 删除或移动原始外部文件，确认 workspace 中已导入资源仍可使用。
- 模拟无权限、源文件消失、目标磁盘空间不足，确认失败可见且不产生无效记录。

## 10. 验收标准

满足以下条件才视为实施完成：

1. Windows 资源管理器拖入的物理文件能取得真实绝对路径。
2. 物理文件导入时不调用 `File.arrayBuffer()`、`File.stream()` 或 `uploadResourceFile*`。
3. 主进程直接复制文件到正确 workspace/folder，数据库保存最终副本路径。
4. 原始文件删除后，已导入资源仍能正常打开。
5. 剪贴板和内存生成文件仍能通过上传兜底导入。
6. 拖入目录不会把磁盘盘符和源绝对目录重建到资源库中。
7. 精灵投递菜单仍能收到完整 resources，并保持现有事件关联。
8. 全仓业务代码不再直接依赖非标准 `File.path`。
9. 类型检查和相关自动化测试通过。

## 11. 风险与控制

### 11.1 路径语义混用

风险最高。必须通过 `localPath`/`relativePath` 分离和测试阻止绝对路径进入目录分组逻辑。

### 11.2 复制失败后错误落库

当前 `addResource` 的部分复制异常会记录警告后继续执行。路径优先导入必须收紧该行为，确保 workspace 托管资源不会意外指向外部源文件。

### 11.3 非磁盘 File 被误判

不得用文件名、`./name` 或 MIME 推测本地路径。`getPathForFile` 返回空时必须进入内容上传兜底。

### 11.4 linked folder 语义被破坏

linked 资源本来就应保留外部路径且不复制。主进程严格复制规则只能应用于 workspace 托管导入，不能覆盖 linked folder 分支。

### 11.5 大文件缺少可见进度

`fs.copyFile` 本身不提供细粒度进度。第一期可以显示不确定进度的“正在导入”；如果产品要求百分比进度，再使用主进程读写流实现复制进度，但文件内容仍不经过 renderer IPC。

## 12. 回滚策略

- 保留现有上传接口和实现，路径优先分支可通过单点条件回退。
- 如果 preload 路径获取失败，自动走现有上传兜底，不影响内存文件。
- 数据库结构不变，不需要数据迁移或回滚脚本。
- 已复制到 workspace 的资源继续是普通 workspace 资源，不依赖新字段。

## 13. 后续可选优化

- 把 `path` 从 `SelectedResourceFileType` 中完全移除，只保留明确命名的路径字段。
- 增加主进程文件复制进度事件。
- 将 `uploadResourceFile*` 重命名为更准确的“内存文件导入”接口。
- 统一资源页、精灵投递、编辑器和媒体时间线的文件接收 helper。
- 在路径导入层增加可配置的 hash 去重策略。
