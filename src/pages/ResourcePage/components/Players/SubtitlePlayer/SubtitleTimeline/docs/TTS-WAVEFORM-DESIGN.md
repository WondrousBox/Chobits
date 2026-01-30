# TTS 音频块波形图方案分析

## 一、两种生成时机对比

### 方案 1：合成时生成波形数据

**流程**：在 `packages/tts/batch-tts-service.ts` 中，每段音频写入磁盘后，立即调用与 `extractWaveform` 相同的逻辑（或复用 ffmpeg handler），生成 peaks 并持久化到音频同目录的 `.${basename}.waveform-${cacheKey}.json`。

| 优点 | 缺点 |
|------|------|
| 用户首次看到 TTS 块时波形已就绪，无等待 | 合成管线变重，每段多一次 ffmpeg 解码 + 写缓存 |
| 滚动/缩放时无需再算，直接读缓存 | 需在 main 进程协调：合成服务要能调波形生成（或发 IPC） |
| 与现有整轨 WaveformTrack 的「先算再缓存」一致 | 若以后改波形分辨率/样式，需考虑是否重算 |

**实现要点**：
- 合成完成后对 `audioPath` 调一次 `extractWaveform`（或抽成共享 util），samplesCount 固定（如 150–200），缓存路径与现有 ffmpeg handler 约定一致。
- 可做成「合成完成后异步生成波形」，不阻塞 progress 事件，只保证最终有缓存即可。

---

### 方案 2：预览时临时生成（按需 + 缓存）

**流程**：TTS 块进入视口时，若尚无波形数据，则调用现有 `window.YUA.ffmpeg.extractWaveform({ inputPath, samplesCount })`。main 进程侧已实现「同路径同 samplesCount 则读磁盘缓存」，因此第二次及以后同一文件会直接命中缓存。

| 优点 | 缺点 |
|------|------|
| 不改动合成管线，实现简单 | 首次滚动到某块时会有一次解码延迟（通常几百 ms） |
| 只对「真正展示」的块请求波形，节省首屏开销 | 若一次出现很多新块（如缩小缩放），可能短时多发请求 |
| 波形分辨率/样式可随时改，只需改前端请求参数 | 需做并发控制（见下） |

**实现要点**：
- **固定 samplesCount**：TTS 单段多为数秒，用 100–200 个点即可，例如 `Math.min(200, Math.max(50, Math.ceil(duration * 30)))`。
- **并发控制**：全局限制同时进行的 `extractWaveform` 数量（如 2–3），多余请求排队，避免同时打开 50 个块时 50 个 ffmpeg 一起跑。
- **按需请求**：仅当块在视口内（或即将进入视口）再请求；可用 Intersection Observer 或由 TTSAudioTrack 根据 viewport 判断 visible 再传 `audioPath` 给子组件。
- **内存缓存**：前端用 `Map<cacheKey, { peaks, duration }>` 缓存已拿到的结果，同一会话内重复滚动不重复请求。

---

## 二、推荐结论

**更推荐方案 2（预览时按需生成 + 现有磁盘缓存）**，理由：

1. **零侵入合成管线**：batch-tts 保持只写音频文件，逻辑简单、稳定。
2. **现有缓存可复用**：`extractWaveform` 已在磁盘写 `.waveform-xxx.json`，第二次打开同一资源、同一块直接读缓存，体验接近「合成时生成」。
3. **首屏与滚动更可控**：只对可见块请求，配合并发限制和前端缓存，避免首屏卡顿。
4. **灵活性**：以后若要改波形密度或样式，只需改前端请求参数和绘制逻辑，无需重跑合成。

若你**非常在意「第一次看到每个 TTS 块就必须立刻有波形」**，再考虑方案 1：在合成完成回调里对每条 `audioPath` 异步调用一次波形生成并写缓存，且注意与现有 ffmpeg 缓存路径、格式一致。

---

## 三、Canvas 性能建议（每个音频一块波形时）

目标：轨道上可能同时存在大量 TTS 块，每个块内要画一小段波形，需控制 DOM 数量、重绘次数和主线程开销。

### 3.1 架构选择

| 策略 | 做法 | 性能 | 适用 |
|------|------|------|------|
| **A. 每块一个 canvas** | 每个 TTSAudioBlock 内嵌一个 `<canvas>` | DOM 多、可能几十个 canvas | 块数量少（&lt;20） |
| **B. 单轨一个 canvas** | 整条 TTS 轨道一个 canvas，按可见块循环绘制每个块的波形 | 仅 1 个 canvas，一次 draw 画完所有可见块 | **推荐**，块数量多 |
| **C. 预渲染为位图** | 有 peaks 后画到离屏 canvas 或生成 data URL，用 `<img>` 或 `background-image` 展示 | 无滚动时重绘，只算一次 | 块多且波形不随缩放重画时 |

**推荐 B**：  
- TTSAudioTrack 持有**一个** canvas，宽度与轨道内容区一致，高度与轨道高度一致。  
- 每帧（或当 viewport / 可见块列表变化时）只画一次：遍历当前可见的 TTS 块，对每个块根据 `left/width` 和其 `peaks` 在 canvas 上画对应区间内的波形。  
- 这样无论有多少块，DOM 上只有 1 个 canvas，重绘成本可控。

### 3.2 Canvas 绘制优化（与现有 WaveformTrack 一致）

- **使用预计算 peaks**：只传 `peaks: number[]` 和 duration，不在渲染时解码音频。
- **按可见区域绘制**：只画落在当前 viewport 内的块；每个块内只画与 `[blockLeft, blockLeft+blockWidth]` 相交的 peak 区间，避免无效循环。
- **整数坐标**：`ctx.fillRect(x, y, w, h)` 的 x/y/w/h 取整，减少亚像素绘制。
- **2D 上下文**：若仅绘制、不读像素，可 `getContext('2d', { willReadFrequently: false })`，便于浏览器优化。
- **条形/线段数量**：每个块内条形数 ≈ 块宽度（px）/ 2～3 即可，不必与 peaks 长度一致，可对 peaks 做下采样再画。
- **避免频繁 resize**：canvas 宽高与轨道可见宽度/高度一致即可，用 `devicePixelRatio` 设置 backing store 分辨率，避免每帧改尺寸。

### 3.3 数据流与职责划分

- **波形数据**：  
  - 由「波形加载层」按需请求：`extractWaveform(audioPath, samplesCount)`，并做并发限制 + 内存缓存。  
  - 结果 `{ peaks, duration }` 可通过 context 或 props 提供给 TTSAudioTrack。
- **TTSAudioTrack**：  
  - 维护「可见块列表」及每个块是否已有波形数据；  
  - 持有一个 canvas，在 useEffect 中根据可见块 + 各块 peaks 统一绘制；  
  - 无波形数据的块可先不画或画占位（如纯色）。
- **TTSAudioBlock**：  
  - 仅负责布局（left/width）、点击、选中、播放/删除按钮；  
  - 不再内嵌 canvas，波形完全由轨道级单 canvas 绘制。

### 3.4 可选：Web Worker

- 若将来在**渲染进程**内从原始 PCM 计算 peaks（例如用 Web Audio 解码后再算），建议把「解码 + 降采样为 peaks」放到 Worker，主线程只收 `peaks` 再画。  
- 当前方案若始终用 main 进程 `extractWaveform`，则暂无 Worker 需求。

---

## 四、实现顺序建议

1. **波形数据层**：封装 `getWaveformForTTSBlock(audioPath, duration)`，内部调 `extractWaveform`，固定 samplesCount（如 150），加全局队列（最多 2–3 并发）+ 内存缓存；返回 `Promise<{ peaks, duration }>`。
2. **TTSAudioTrack**：增加单 canvas；在 viewport/可见块变化时，请求可见块的波形数据，收到后 setState 触发重绘；在 useEffect 中根据可见块列表 + peaks 统一绘制。
3. **TTSAudioBlock**：保持现有交互与布局，不包 canvas；若需要「无波形时显示占位」，可由轨道在 canvas 上为该块画一个简单占位条。
4. **调优**：用 React DevTools / Performance 看重绘频率；若滚动仍卡，可对「请求波形」做防抖或对「绘制」做 requestAnimationFrame 节流。

按上述顺序，即可在**不改合成管线**的前提下，用「预览时按需生成 + 单轨单 canvas」实现高性能、可扩展的 TTS 波形展示。
