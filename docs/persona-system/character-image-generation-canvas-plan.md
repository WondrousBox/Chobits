# 角色图片生成关系画布实施文档

> 日期：2026-05-28  
> 状态：第一版已落地  
> 范围：先服务角色图集设计，同时沉淀可复用的图片生成画布能力。

## 1. 背景

角色图集已经支持导入图片、维护元数据、AI 文生图、AI 图生图，并通过 `CharacterGalleryItem.origin.parentId` 记录派生关系。列表或卡片式浏览只能看到单张图片，无法直接表达“参考图 -> 派生图”的设计脉络。

本次实现将角色图集升级为 ReactFlow 关系画布：

- 已有图集图片渲染为图片卡片节点。
- `origin.parentId` 指向当前图集内图片时自动连线。
- 点击图片节点打开全局大图预览。
- 从节点或预览发起“以此图生成”时，在画布上创建带参考图的表单节点。
- 从画布工具栏发起“AI 新建”时，创建无参考图表单节点。
- 表单提交中显示运行状态，成功后原地转为图片节点，失败后保留表单和错误信息。
- 节点位置、视口和未完成表单持久化到角色包的 `gallery/canvas.json`。

## 2. 已实现结构

公共画布层：

```txt
src/features/image-generation-canvas/
  ImageGenerationCanvas.tsx
  layout.ts
  types.ts
  nodes/
    ImageAssetNode.tsx
    ImageGenerationFormNode.tsx
```

角色图集适配层：

```txt
src/pages/ExtensionSettings/
  CharacterGalleryCanvas.tsx
  CharacterGalleryManager.tsx
```

持久化和 IPC：

```txt
packages/sprite-core/character-gallery.ts
packages/sprite-core/character-gallery-manager.ts
packages/sprite-core/handler/sprite-manager-ipc.ts
electron/preload/apis/persona.ts
```

## 3. 公共画布约定

`ImageGenerationCanvas` 不依赖角色图集类型，只依赖 adapter：

- `getAssetView(asset)`：把业务资源转成画布图片节点视图。
- `buildInitialDraft(input)`：创建文生图或图生图表单默认值。
- `submitGeneration(input)`：业务侧负责调用 AI 接口、导入结果并返回新资源。

公共层负责：

- ReactFlow 节点和边渲染。
- 自动布局、视图适配、小地图和控制器。
- 图片节点预览回调。
- 新建无参考图表单。
- 基于参考图新建编辑表单。
- 表单运行、失败、成功转换状态。
- 布局序列化和 debounce 保存。
- 通过 `ImageGenerationCanvasHandle` 暴露 `createEditForm`、`createGenerateForm`、`autoLayout`、`fitView`。

节点 ID 约定：

- 图片节点：`gallery-item:${assetId}`
- 表单节点：`form:${timestamp}-${random}`

成功生成后，表单节点会在原位置转换成 `gallery-item:${newAssetId}`，并立即保存一次布局，避免刷新图集后位置丢失。

## 4. 角色图集行为

`CharacterGalleryCanvas` 负责角色图集 adapter：

- 图片 URL 使用 `makeResSrc(item.thumbnail?.localPath || item.source.localPath)`。
- 父子关系使用 `item.origin?.parentId`。
- 默认 provider 为 `gpteam`，默认模型为 `gpt-image-2`。
- 表单内使用现有 `ProviderModelSelect` 选择图片 provider/model。
- 提交前会通过 `window.YUA.ai.resolveUsablePreset(providerId, providerPresetId)` 获取可用预设。
- 图生图调用 `window.YUA.ai.editImage`，文生图调用 `window.YUA.ai.generateImageArtifact`。
- 提交前打印最终 prompt 和请求关键信息：

```ts
console.info('[CharacterGalleryCanvas] final image prompt before request', {
  mode,
  model,
  providerId,
  providerPresetId,
  size,
  quality,
  outputFormat,
  referenceImagePath,
  prompt
});
```

生成成功后：

- 调用 `window.YUA.persona.importCharacterGalleryItem` 导入图片。
- 再调用 `window.YUA.persona.updateCharacterGalleryItem` 写入 `origin`。
- 图生图写入：

```ts
origin: {
  type: 'ai-edited',
  parentId: referenceItem.id,
  model,
  prompt
}
```

- 文生图写入：

```ts
origin: {
  type: 'ai-generated',
  model,
  prompt
}
```

## 5. 页面交互

`CharacterGalleryManager` 当前职责：

- 读取图集和 `canvas.json`。
- 渲染 `CharacterGalleryCanvas`。
- 保留全局大图预览 Dialog。
- 保留元数据编辑、替换图片、删除图片。
- 预览中的“以此图生成”会关闭预览，并调用画布 `createEditForm(item.id)`。

画布工具栏包含：

- `导入图片`
- `AI 新建`
- `自动整理`
- `适配视图`

搜索过滤只影响当前显示的节点。保存布局时，如果处于搜索状态，会合并隐藏节点的旧布局，避免覆盖整张画布的坐标。

## 6. 持久化

新增 `gallery/canvas.json`，仅保存布局、视口和未完成表单草稿，不复制父子关系主数据。

示例：

```json
{
  "version": 1,
  "updatedAt": "2026-05-28T00:00:00.000Z",
  "viewport": { "x": 0, "y": 0, "zoom": 1 },
  "nodes": [
    { "id": "gallery-item:idle-front", "assetId": "idle-front", "x": 120, "y": 160 },
    {
      "id": "form:abc123",
      "x": 520,
      "y": 160,
      "draft": {
        "mode": "edit",
        "referenceAssetId": "idle-front",
        "title": "奔跑姿势",
        "providerId": "gpteam",
        "modelId": "gpt-image-2",
        "prompt": "保持角色一致，生成向右奔跑的动作参考。"
      }
    }
  ]
}
```

规则：

- installed 角色包允许保存。
- builtin 或只读角色包只展示自动布局，不写入 `canvas.json`。
- 如果 `canvas.json` 丢失，会从图集图片和 `origin.parentId` 自动重建关系图。

IPC/preload：

- `sprite:character:gallery:canvas:get`
- `sprite:character:gallery:canvas:save`
- `window.YUA.persona.getCharacterGalleryCanvasLayout`
- `window.YUA.persona.saveCharacterGalleryCanvasLayout`

## 7. 验收结果

已完成：

- 使用项目已有 `reactflow`，没有引入新的画布库。
- 公共画布组件不依赖角色图集业务类型。
- 已有 AI 派生图片可根据 `origin.parentId` 自动连线。
- 点击图片节点打开全局预览。
- 预览和节点都能发起以当前图片为参考的图生图表单。
- 画布工具栏可以创建无参考图的文生图表单。
- 表单只有一个提交按钮。
- 提交中显示 running 状态，失败保留表单和错误，成功原地转为图片节点。
- 图生图写入 `origin.type = 'ai-edited'` 和 `origin.parentId`。
- 文生图写入 `origin.type = 'ai-generated'`，不写 `parentId`。
- 布局、视口、未完成表单通过 `gallery/canvas.json` 持久化。
- 最终发送 prompt 会在提交前打印日志。

验证：

- `pnpm exec eslint --no-cache --quiet ...` 通过本功能相关文件。
- `pnpm exec tsc --noEmit --pretty false` 只剩既有无关错误：
  - `src/pages/ResourcePage/components/Players/MediaPlayer/useMusicReactivityAnalyzer.ts(41,58): Type 'Uint8Array' is not generic.`
  - `src/pages/ResourcePage/components/Players/MediaPlayer/useMusicReactivityAnalyzer.ts(42,62): Type 'Uint8Array' is not generic.`

## 8. 后续扩展

- 多参考图：从单个 `parentId` 扩展到兼容 `parentIds?: string[]`。
- 批量生成：一个表单生成多张候选图并展开多个子节点。
- 模板节点：按 idle/walk/run/jump 等状态批量创建空白表单。
- 抽离更细的请求 hook：让 `CharacterImageStudio` 和画布表单完全共享请求构造逻辑。
- 资源库、素材变体、分镜设计等场景可继续复用 `ImageGenerationCanvas`。
