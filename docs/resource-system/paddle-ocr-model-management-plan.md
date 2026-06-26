# Paddle OCR 模型管理与运行时接入实施方案

更新时间：2026-06-26

## 1. 背景与目标

当前图片 OCR 入口已经存在：文件动作菜单会执行 `sample:ocr` 工作流，预设工作流中的 OCR 节点为 `image/ocr`，节点实现位于 `packages/workflow/nodes/ocr.ts`。现实现基于 Tesseract，插件检测依赖 `plugin:tesseract`，但运行时直接 `spawn('tesseract')`，安装路径与实际调用路径并不完全收敛。

计划引入 `ppu-paddle-ocr@6.0.0` 作为新的本地 OCR runtime。该库的 Node 入口支持通过 `PaddleOcrService({ model: { detection, recognition, charactersDictionary } })` 指定本地模型文件；如果不传模型路径，会自动从 `ppu-paddle-ocr-models` 下载并缓存到 `~/.cache/ppu-paddle-ocr`。

本方案的核心目标：

- 模型必须由 chobits 软件内模型管理下载、校验、安装和迁移。
- OCR runtime 只读取 chobits 明确传入的本地模型路径。
- 禁止 OCR runtime 隐式联网下载模型，禁止依赖 `~/.cache/ppu-paddle-ocr` 作为产品模型来源。
- 工作流缺模型时应走现有“缺少模型 -> 引导下载 -> 下载后重试”的交互，而不是在节点执行中偷偷下载。

## 2. 硬性原则

1. 不允许使用 `new PaddleOcrService()` 的默认模型行为。
2. 不允许调用 `PaddleOcrService.downloadModels()` 作为应用内安装模型的方式。
3. 不允许把 `https://...` 模型 URL 传给 OCR runtime。
4. `image/ocr` 或新 `image/paddle-ocr` 节点必须在 `initialize()` 前解析出三个本地文件：
   - detection model
   - recognition model
   - characters dictionary
5. 模型安装目录必须由 `pluginResourceManager.getModelPath('plugin:paddle-ocr', modelName)` 或同级封装返回。
6. 模型缺失时必须在 workflow validation 阶段报 `MissingModel`，并让前端模型下载流程处理。

## 3. 外部库事实

已确认 npm 最新版本：

- 包名：`ppu-paddle-ocr`
- 最新版本：`6.0.0`
- npm 发布时间：2026-06-22
- 关键依赖：`ppu-ocv`
- Node 运行需要：`onnxruntime-node`
- 许可证：MIT

`ppu-paddle-ocr` 的 Node 实现行为：

- `PaddleOcrService.initialize()` 会并行加载 detection、recognition、dictionary。
- `options.model.detection` / `recognition` / `charactersDictionary` 可以是本地路径、URL 或 `ArrayBuffer`。
- 若对应字段缺省，则回退到默认 URL，并通过 `processor/model-cache.js` 下载到 `~/.cache/ppu-paddle-ocr`。
- 本地路径加载逻辑是 `path.resolve(process.cwd(), source)` + `readFileSync()`，所以传入绝对路径最稳。

默认 v6 small 组件：

| 组件 | 文件名 |
| --- | --- |
| Detection | `PP-OCRv6_small_det.ort` |
| Recognition | `PP-OCRv6_small_rec.ort` |
| Dictionary | `ppocrv6_dict.txt` |

推荐首批支持的模型：

| 模型 ID | 用途 | 组件 |
| --- | --- | --- |
| `ppocr-v6-small` | 默认，多语言，速度/准确率平衡 | `PP-OCRv6_small_det.ort`, `PP-OCRv6_small_rec.ort`, `ppocrv6_dict.txt` |
| `ppocr-v6-tiny` | 更快，低资源设备 | `PP-OCRv6_tiny_det.ort`, `PP-OCRv6_tiny_rec.ort`, `ppocrv6_tiny_dict.txt` |
| `ppocr-v6-medium` | 更高准确率，初始化和推理更重 | `PP-OCRv6_medium_det.ort`, `PP-OCRv6_medium_rec.ort`, `ppocrv6_dict.txt` |

## 4. 现有 chobits 可复用能力

现有 `plugin-resource` 体系已经满足大部分模型管理诉求：

- 插件资源定义：`resources/plugins/plugins.json`
- 资源下载、校验、安装：`packages/plugins/index.ts`
- 下载 IPC：`packages/plugins/ipc-main.ts`
- 前端安装入口：`window.YUA.pluginResource['plugin-resource:install']`
- 模型路径：`pluginResourceManager.getModelPath(pluginId, modelName)`
- 模型缺失报告：workflow plugin 的 `checkRequiredModels()`
- 缺模型后前端自动引导下载：`src/lib/workflow-runner.ts`

已补齐/需要补齐的点：

- 已扩展 `PluginDefinition.platforms[].files` 与 `PluginResource.files`，支持一个模型资源下载多个文件。
- 已让 `plugin-resource` 把多文件模型安装到 `getModelPath(pluginId, modelName)` 目录下。
- `plugin-resource:remove` 已支持 `deleteFiles?: boolean`。设置页和下载窗口删除模型时会同时删除 store 记录与受管理的安装目录。

## 5. 模型资源定义方案

### 5.1 第一阶段：使用多文件模型资源

第一阶段把一个 OCR 模型视作一个多文件 model resource。下载器按 `files` 清单把 det/rec/dict 三个文件下载到：

```text
{pluginsDir}/paddle-ocr/model/{modelName}/
  detection/PP-OCRv6_small_det.ort
  recognition/PP-OCRv6_small_rec.ort
  dict/ppocrv6_dict.txt
```

其中 `modelName` 使用稳定目录名，例如 `ppocr-v6-small`。

`resources/plugins/plugins.json` 中新增一个系统内置 engine 定义和若干 model：

```json
{
  "id": "paddle-ocr-runtime",
  "pluginId": "plugin:paddle-ocr",
  "type": "engine",
  "name": "paddle-ocr-runtime",
  "displayName": "Paddle OCR Runtime",
  "description": "基于 ppu-paddle-ocr 与 ONNX Runtime 的本地 OCR 引擎",
  "version": "6.0.0",
  "archiveType": "none",
  "category": ["ocr"],
  "languages": ["multi"],
  "platforms": [],
  "models": [
    {
      "id": "ppocr-v6-small",
      "pluginId": "plugin:paddle-ocr",
      "type": "model",
      "name": "ppocr-v6-small",
      "displayName": "PP-OCRv6 Small",
      "description": "默认多语言 OCR 模型，平衡速度和准确率",
      "version": "6.0.0",
      "archiveType": "none",
      "category": "ocr",
      "languages": ["multi"],
      "platforms": [
        {
          "platform": "all",
          "arch": "all",
          "files": [
            {
              "path": "detection/PP-OCRv6_small_det.ort",
              "sourceUrl": "https://media.githubusercontent.com/media/PT-Perkasa-Pilar-Utama/ppu-paddle-ocr-models/main/detection/ort/PP-OCRv6_small_det.ort"
            },
            {
              "path": "recognition/PP-OCRv6_small_rec.ort",
              "sourceUrl": "https://media.githubusercontent.com/media/PT-Perkasa-Pilar-Utama/ppu-paddle-ocr-models/main/recognition/ort/PP-OCRv6_small_rec.ort"
            },
            {
              "path": "dict/ppocrv6_dict.txt",
              "sourceUrl": "https://raw.githubusercontent.com/PT-Perkasa-Pilar-Utama/ppu-paddle-ocr-models/main/recognition/ppocrv6_dict.txt"
            }
          ]
        }
      ]
    }
  ]
}
```

注意：这些 URL 只由 chobits 的模型管理器使用。runtime 不接收 URL，也不会调用 `PaddleOcrService` 的默认下载逻辑。当前清单已经为每个文件声明 `sizeBytes` 与 `sha256`；后续如果要完全自控分发，可把 `files[].sourceUrl` 改为 chobits 自己托管或镜像的地址。

### 5.2 路径校验

runtime 不读取外部 manifest，而是使用 `packages/workflow/runtime/paddle-ocr-models.ts` 中的模型规格解析三件套路径：

```text
ppocr-v6-small:
  detection: detection/PP-OCRv6_small_det.ort
  recognition: recognition/PP-OCRv6_small_rec.ort
  charactersDictionary: dict/ppocrv6_dict.txt
```

运行前校验：

- 三个文件都存在且为普通文件。
- 下载器会拒绝 `files[].path` 中的绝对路径和 `..` 路径，防止写出模型目录。
- 下载器会使用文件级 `sha256` 校验每个文件。

## 6. Runtime 与基础服务设计

OCR runtime 已下沉为独立基础服务包：

```text
packages/ocr/
  paddle-ocr-models.ts
  paddle-ocr-runtime.ts
  service.ts
  ipc-main.ts
  ipc-renderer.ts
```

职责：

- 根据 `modelName` 从 `pluginResourceManager` 解析模型目录。
- 从内置模型规格解析并校验 det/rec/dict 三个本地文件。
- 构造 `PaddleOcrService`，强制传入本地绝对路径。
- 维护 service singleton，按 `modelName + strategy + processingEngine + executionProviders` 建 cache key。
- 提供 `ocrService.recognizeImage(request)` 作为主进程内统一调用入口。
- 提供 `window.YUA.ocr.recognizeImage(request)` 作为 renderer/IPC 调用入口。
- 提供 `listModels()` 查询模型安装状态，调用方无需自己拼插件资源路径。
- 提供 `destroyAll()`，未来在应用退出或模型卸载时释放 session。

伪代码：

```ts
const service = new PaddleOcrService({
  model: {
    detection: resolved.detectionPath,
    recognition: resolved.recognitionPath,
    charactersDictionary: resolved.dictionaryPath
  },
  recognition: {
    charactersDictionary: [],
    strategy
  },
  processing: { engine },
  session: { executionProviders }
});

await service.initialize();
const imageBuffer = await fs.promises.readFile(imagePath);
const result = await service.recognize(
  imageBuffer.buffer.slice(imageBuffer.byteOffset, imageBuffer.byteOffset + imageBuffer.byteLength),
  { flatten: true, noCache }
);
```

实现要点：

- 传入 `ArrayBuffer` 图片，避免依赖库内部对图片路径的支持差异。
- 不暴露 `model` URL 配置。
- 不允许 `modelName` 为空。默认模型由节点配置或应用偏好层明确选择 `ppocr-v6-small`。
- 并发默认保持 1。后续批量 OCR 可用 `batchRecognize()`，但仍由 workflow 并发控制。
- OCR 结果建议同时返回结构化结果和纯文本。

workflow 侧保留兼容导出：

```text
packages/workflow/runtime/paddle-ocr-models.ts
packages/workflow/runtime/paddle-ocr-runtime.ts
```

这两个文件只 re-export `packages/ocr` 中的实现，避免旧引用失效；新的基础能力边界以 `packages/ocr` 为准。

### 6.1 主进程服务调用

主进程内需要 OCR 能力时直接调用服务：

```ts
import { ocrService } from '../../../packages/ocr';

const result = await ocrService.recognizeImage({
  imagePath,
  model: 'ppocr-v6-small',
  strategy: 'per-box',
  processingEngine: 'opencv',
  maxSideLength: 640
});
```

如果模型缺失，会抛出 `OcrModelMissingError`，其中包含 `resourceId` 和 `missingFiles`，上层可以据此引导安装。

### 6.2 IPC 调用

renderer 可通过 preload 暴露的 API 调用：

```ts
const models = await window.YUA.ocr.listModels();
const result = await window.YUA.ocr.recognizeImage({
  imagePath,
  model: 'ppocr-v6-small'
});
```

IPC 通道：

- `ocr:listModels`
- `ocr:recognizeImage`
- `ocr:destroyRuntime`

## 7. Workflow 插件与节点改造

### 7.1 新增插件 `plugin:paddle-ocr`

新增：

```text
packages/workflow/plugins/paddle-ocr.ts
```

职责：

- `isInstalled()`：只检查运行依赖是否可 import。由于 runtime 是 npm 依赖，不需要 engine 二进制；模型缺失必须通过 `checkRequiredModels()` 返回 `MissingModel`，让前端进入模型下载流程。
- `checkRequiredModels(ctx, nodeConfig)`：读取节点 `model` 配置，检查 `getModelPath('plugin:paddle-ocr', modelName)` 下的 det/rec/dict 三件套。
- 缺失时返回 `MissingModel`，带 `pluginId`, `modelName`, `resourceId`, `displayName`。

`initWorkflowSystem()` 注册 `PaddleOcrPlugin`。

### 7.2 节点策略

建议先新增节点：

```text
packages/workflow/nodes/paddle-ocr.ts
```

节点 ID：

```text
image/paddle-ocr
```

配置：

| key | 类型 | 默认 | 说明 |
| --- | --- | --- | --- |
| `model` | select | `ppocr-v6-small` | 模型资源名 |
| `strategy` | select | `per-box` | `per-box` / `per-line` / `cross-line` |
| `processingEngine` | select | `opencv` | `opencv` / `canvas-native` |
| `maxSideLength` | number | 640 | 检测阶段最长边 |
| `flatten` | boolean | true | 输出扁平结构 |
| `noCache` | boolean | false | 单次识别跳过图片结果缓存 |

输入：

- `image`: file/string，图片路径

输出：

- `text`: string
- `results`: array/object
- `confidence`: number

`sample:ocr` 更新为使用 `image/paddle-ocr`。旧 `image/ocr` 可暂时保留为 Tesseract 节点，避免破坏用户自定义工作流。

第二阶段再考虑：

- 将 `image/ocr` 改为抽象节点，配置 `engine: paddle | tesseract`。
- 或把 Tesseract 节点重命名为 `image/tesseract-ocr`，给旧工作流做迁移。

## 8. 前端模型管理与选择

第一阶段尽量复用现有插件页面：

- `plugin-resource:listSupported` 能看到 `plugin:paddle-ocr` 的模型。
- `plugin-resource:install` 下载 OCR 模型资源。
- 下载进度继续走 PluginDownload 页面。
- `plugin-resource:remove({ deleteFiles: true })` 卸载 OCR 模型资源，并删除受管理的模型目录。
- 工作流缺模型时复用 `src/lib/workflow-runner.ts` 的“下载模型” action。

后续增强：

- 在工作流节点配置中动态列出已支持 OCR 模型。
- 在工作流节点配置中动态列出已安装/推荐的 OCR 模型。

## 9. 打包与依赖

新增 npm 依赖：

```text
ppu-paddle-ocr@6.0.0
onnxruntime-node@^1.27.0
```

`ppu-ocv` 会由 `ppu-paddle-ocr` 引入。

Electron builder 需要增加 native/runtime 包白名单：

```json
{
  "asarUnpack": [
    "node_modules/onnxruntime-node/**/*",
    "node_modules/ppu-paddle-ocr/**/*",
    "node_modules/ppu-ocv/**/*"
  ],
  "files": [
    "node_modules/onnxruntime-node/**/*",
    "node_modules/ppu-paddle-ocr/**/*",
    "node_modules/ppu-ocv/**/*"
  ]
}
```

说明：

- `onnxruntime-node` 有 native binary，必须验证 dev 与 packaged app。
- `ppu-ocv` 可能带 wasm/js runtime，需确认打包后 `opencv` engine 可正常初始化。
- 如果 packaged app 中 `opencv` 初始化不稳定，第一版可配置 `processingEngine: canvas-native` 作为 fallback，但默认仍建议 `opencv`。

## 10. 禁止隐式下载的实现防线

代码层防线：

- Runtime factory 必须要求 `modelName`。
- `resolvePaddleOcrModel()` 必须返回三个绝对本地路径，否则抛 `PADDLE_OCR_MODEL_NOT_INSTALLED`。
- 构造 `PaddleOcrService` 时必须显式传 `model` 三字段。
- 不从 `ppu-paddle-ocr` 导入或使用 `DEFAULT_MODEL` / `V6_SMALL_MODEL` 作为 runtime 选项；这些常量只可用于生成下载清单或文档参考。

测试层防线：

- 单测 monkey patch `global.fetch`，运行 OCR 初始化时若发生 fetch 直接失败。
- 单测传缺失模型目录，断言 workflow validation 返回 `MissingModel`。
- 单测 `files[].path` 或模型规格路径包含 `../` 时拒绝或不解析。

运行层防线：

- 默认不设置任何 `~/.cache/ppu-paddle-ocr` 预热逻辑。
- 不在启动阶段调用 `PaddleOcrService.downloadModels()`。
- 日志中打印实际使用的模型目录，但不打印用户完整敏感路径以外的无关内容。

## 11. 实施步骤

### 阶段 1：模型包与资源管理

1. 在 `resources/plugins/plugins.json` 新增 `plugin:paddle-ocr` engine 与 `ppocr-v6-small` / `ppocr-v6-tiny` / `ppocr-v6-medium` models。
2. 每个 model 使用 `platforms[].files` 声明 det/rec/dict 三个文件。
3. 验证插件页面可列出、下载、安装该模型。
4. 验证安装路径为 `{pluginsDir}/paddle-ocr/model/ppocr-v6-small`。
5. 为每个文件补齐 `sizeBytes` 与 `sha256`，用于进度汇总和完整性校验。

### 阶段 2：runtime 与节点

1. 安装 `ppu-paddle-ocr` 与 `onnxruntime-node`。
2. 新增 `paddle-ocr-runtime.ts`，实现模型解析、三件套校验、service cache。
3. 新增 `PaddleOcrPlugin`，实现模型缺失检查。
4. 新增 `image/paddle-ocr` 节点。
5. 更新 `sample:ocr` 使用 `image/paddle-ocr`，默认模型为 `ppocr-v6-small`。

### 阶段 3：打包与验收

1. 更新 `electron-builder.json` 的 `asarUnpack` 与 `files`。
2. 本地 dev 模式 OCR 一张中文/英文混合图。
3. 打包后在 macOS arm64 验证 OCR。
4. Windows x64 验证 `onnxruntime-node` 与 `ppu-ocv`。
5. 卸载/删除模型后，运行工作流应出现缺模型提示，而不是自动下载。

### 阶段 4：体验增强

1. 节点配置动态展示可用模型与推荐策略。
2. 支持 `v6-tiny` / `v6-medium` 下载。
3. 增加资源预览页“一键 OCR 并保存文本/子资源”。
4. 支持把 OCR 结果写回资源 metadata 或生成文本资源。

## 12. 验收标准

- 首次运行 `sample:ocr` 且未安装模型时，提示缺少 `PP-OCRv6 Small`，用户可在软件内下载。
- 模型下载完成后，再次运行 OCR，不访问 `~/.cache/ppu-paddle-ocr`，不触发外部模型下载。
- 断网情况下，只要模型已安装，OCR 可正常执行。
- 断网且模型未安装时，工作流失败原因明确为缺模型。
- OCR runtime 日志能定位实际使用的模型名称和版本。
- 打包产物中 `onnxruntime-node` 可加载，`PaddleOcrService.initialize()` 成功。

## 13. 代码落点清单

预计新增：

- `packages/workflow/runtime/paddle-ocr-runtime.ts`
- `packages/workflow/plugins/paddle-ocr.ts`
- `packages/workflow/nodes/paddle-ocr.ts`

预计修改：

- `package.json`
- `pnpm-lock.yaml`
- `electron-builder.json`
- `resources/plugins/plugins.json`
- `resources/workflows/preset.json`
- `packages/workflow/index.ts`
- `packages/workflow/nodes/index.ts`

已补充：

- `packages/plugins/index.ts`：支持模型目录级删除。
- `src/pages/SettingsPage/PluginPage.tsx` / `src/pages/SettingsPage/PluginDownloadPage.tsx`：删除模型时传入 `deleteFiles: true`。

## 14. 仍需确认

- OCR 模型资源的长期托管地址和版本策略。
- 是否只首发 `v6-small`，还是同时提供 `v6-tiny`。
- 是否保留 Tesseract 节点作为 fallback。
- Windows packaged app 下 `ppu-ocv` 默认 `opencv` backend 是否稳定；若不稳定，首版默认切到 `canvas-native`。
- 是否需要把 OCR 结果自动保存为资源子文本，还是仅作为 workflow 输出。
