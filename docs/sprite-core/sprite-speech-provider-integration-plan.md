# 角色说话接入 AI Provider 语音合成规划

> 状态：规划文档。本文只定义角色说话如何接入 `speechSynthesis` Provider 能力，暂不替代现有 Edge TTS 实现。

## 1. 当前结论

MiniMax 的语音合成底座已经在 `packages/ai` 中具备三种请求方式：

| Provider 能力 | 通用入口 | MiniMax 映射 | 当前代码状态 |
| --- | --- | --- | --- |
| HTTP 非流式 | `synthesizeSpeech()` + `mode: 'complete'` | `POST /v1/t2a_v2`，`stream: false` | 已实现 |
| HTTP 流式 | `streamSpeechSynthesis()` + `mode: 'output-stream'` + `transportPreference: 'http-stream'` | `POST /v1/t2a_v2`，`stream: true` | 已实现 |
| WebSocket 双向流 | `streamSpeechSynthesis()` + `mode: 'duplex-stream'` + `transportPreference: 'websocket'` | `WSS /ws/v1/t2a_v2`，`task_start` / `task_continue` / `task_finish` | 已实现 |

角色说话尚未接入这些能力。当前链路仍是：

- `src/pages/ExtensionSettings/SpeakSettings.tsx` 只展示 Edge 音色列表。
- `packages/sprite-core/speak/types.ts` 的 `SpriteSpeakConfig` 只有 `serviceType`、`voiceName`、`rate`、`pitch`、`volume`。
- `packages/sprite-core/speak/speak-service.ts` 的 `synthesizeWithService()` 只调用 `EdgeTTS`。
- `packages/sprite-core/speak/speak-cache.ts` 的缓存 key 只包含 Edge 风格字段，且固定写成 `.mp3`。

因此接入目标不是“再实现一遍 MiniMax TTS”，而是让 `sprite-core/speak` 变成角色说话的业务编排层，底层合成引擎可选择 Edge 或 AI Provider。

## 2. 目标与非目标

目标：

- 角色机能扩展中的“语音合成/角色说话”支持选择 `Edge` 或 `AI Provider`。
- AI Provider 模式使用统一 `speechSynthesis` capability，未来可接 MiniMax、OpenAI、ElevenLabs、火山、腾讯、阿里等服务商。
- 保留现有 `window.YUA.sprite.speak()`、`synthesizeSpeech()`、气泡展示、talk 动画触发和缓存行为。
- 第一阶段优先接入 `complete`，保证“合成完成 -> 缓存 -> 播放”的稳定体验。
- 设计上预留 HTTP 流式和 WebSocket 双向流，后续可用于低延迟说话和 LLM token 流驱动的实时语音。

非目标：

- 不把 Edge TTS 改造成 Provider。Edge 可以继续作为内置本地/免费引擎存在。
- 不把 TTS 合并到音乐生成能力。语音仍使用 `speechSynthesis`，音乐使用 `musicGeneration`。
- 第一阶段不强求实现边合成边播。当前 `sprite:speak` 播放事件仍以完整音频文件路径为中心。

## 3. 配置模型

现有配置需要兼容读取。建议新增 `engine` 和 `aiProvider`，旧字段继续服务 Edge：

```ts
export type SpriteSpeakEngine = 'edge' | 'ai-provider';

export interface SpriteSpeakAIProviderConfig {
  providerId: string;
  providerPresetId?: string;
  model: string;
  voiceId: string;
  voice?: string;
  language?: string;
  mode?: 'complete' | 'output-stream' | 'duplex-stream';
  transportPreference?: 'auto' | 'http' | 'http-stream' | 'websocket';
  audioSetting?: {
    format?: 'mp3' | 'wav' | 'flac' | 'pcm' | 'opus' | string;
    sampleRate?: number;
    bitrate?: number;
    channels?: number;
  };
  speed?: number;
  pitch?: number;
  voiceVolume?: number;
  emotion?: string;
  subtitle?: {
    enabled?: boolean;
    type?: 'sentence' | 'word' | 'word_streaming' | string;
  };
  pronunciationDict?: Record<string, any>;
  extras?: Record<string, any>;
}

export interface SpriteSpeakConfig {
  enabled: boolean;
  engine?: SpriteSpeakEngine;

  // Legacy Edge fields. Keep them for old configs and the Edge settings panel.
  serviceType: 'Edge' | string;
  voiceName: string;
  rate: number;
  pitch: number;

  // Playback volume. Do not map this directly to provider voice volume.
  volume: number;

  aiProvider?: SpriteSpeakAIProviderConfig;
}
```

兼容策略：

- 读取旧配置时，`engine` 缺失则按 `serviceType === 'Edge'` 推导为 `edge`。
- 保存新配置时保留旧字段，避免旧窗口或旧代码读取失败。
- `volume` 继续表示播放器音量。Provider 请求里的发声音量使用 `aiProvider.voiceVolume` 映射到 `SpeechSynthesisRequest.volume`。
- 不把 Edge 的百分比 `rate` 原样复用到 Provider。AI Provider 使用 `speed`，由各 provider adapter 映射到自身字段。

## 4. 设置页接入

入口仍在 `设置 -> 机能扩展 -> 语音合成`，用户语义上可以展示为“角色说话”。

UI 分层：

1. 总开关：沿用 `enabled`。
2. 引擎选择：使用分段控件，选项为 `Edge` 和 `AI Provider`。
3. Edge 面板：沿用当前音色、语速、音高、播放音量、试听、清缓存。
4. AI Provider 面板：
   - 使用 `ProviderModelSelect`，传入 `modelTypes={['tts']}`。
   - 使用 `providerFilter={(provider) => provider.capabilities?.speechSynthesis === true}`。
   - 模型默认值优先使用 provider 的 `defaultModels.speechSynthesis`。
   - 音色使用 provider voice 选择器。第一阶段可先提供“常用 MiniMax 音色 + 手动输入 voiceId”，后续再扩展统一 voice catalog。
   - 模式默认 `complete`。`output-stream` 和 `duplex-stream` 放到高级选项，并依据模型 metadata 中的 `speechSynthesis.modes/transports` 做可用性过滤。
   - 展示 Provider 配置状态。未配置 API key 或 preset 时，提供“去配置”入口。
   - 试听按钮仍调用 `window.YUA.sprite.speak()`，让测试覆盖真实角色说话链路。

需要扩展的前端类型：

- `SpeakSettings.tsx` 的本地 `SpriteSpeakConfig` 应改为从 `@packages/sprite-core/speak/types` 引入，避免 UI 和主进程类型分叉。
- `ProviderModelSelect` 的 `ModelRow` 应允许读取 `speechSynthesis?: { modes?: string[]; transports?: string[]; voices?: unknown[] }` 这类 metadata，用于模式和传输过滤。

## 5. 主进程运行链路

`sprite-core` 不应直接强依赖 `packages/ai`。建议在 `SpriteManagerOptions` 中注入一个语音合成执行器：

```ts
export interface SpriteSpeechSynthesisExecutor {
  synthesize(req: SpeechSynthesisRequest): Promise<SpeechSynthesisResponse>;
  stream?(
    req: SpeechSynthesisRequest,
    onEvent: (event: SpeechSynthesisStreamEvent) => void,
    input?: AsyncIterable<SpeechTextInputChunk>
  ): Promise<SpeechSynthesisResponse>;
}
```

Electron main 初始化 `SpriteManager` 时创建或复用 `PiExecutionService`，注入：

```ts
speechSynthesisExecutor: {
  synthesize: (request) => piExecutionService.synthesizeSpeech(request),
  stream: (request, onEvent, input) => piExecutionService.streamSpeechSynthesis(request, onEvent, undefined, input)
}
```

`SpeakService` 负责业务编排：

```text
SpriteManager.speak(text)
  -> SpeakService.speak(text)
  -> stripEmoji / empty check
  -> read SpriteSpeakConfig
  -> generate cache key
  -> cache hit: return audioPath and trigger playback
  -> engine=edge: EdgeTTS -> cache.put()
  -> engine=ai-provider: executor.synthesize(toSpeechSynthesisRequest()) -> cache.put/copy materialized artifact
  -> callback sprite:speak with audioPath
  -> SpriteManager trigger talk animation only when audio will play
```

AI Provider 请求映射：

```ts
const request: SpeechSynthesisRequest = {
  providerId: config.aiProvider.providerId,
  providerPresetId: config.aiProvider.providerPresetId,
  model: config.aiProvider.model,
  text,
  mode: config.aiProvider.mode ?? 'complete',
  transportPreference: config.aiProvider.transportPreference ?? 'auto',
  voice: config.aiProvider.voice,
  voiceId: config.aiProvider.voiceId,
  language: config.aiProvider.language,
  audioSetting: config.aiProvider.audioSetting ?? { format: 'mp3' },
  speed: config.aiProvider.speed,
  pitch: config.aiProvider.pitch,
  volume: config.aiProvider.voiceVolume,
  emotion: config.aiProvider.emotion,
  subtitle: config.aiProvider.subtitle,
  pronunciationDict: config.aiProvider.pronunciationDict,
  extras: {
    ...(config.aiProvider.extras || {}),
    usage: {
      sourceType: 'sprite_speech',
      sourceLabel: '角色说话'
    }
  }
};
```

MiniMax 注意点：

- `voiceId` 必填，否则 adapter 会抛出 `MiniMax speech synthesis requires voiceId or voice`。
- `speech-2.8-turbo` 可作为默认模型，`speech-2.8-hd` 可作为高质量选项。
- `complete` 可用 `transportPreference: 'auto'` 或 `'http'`。
- `output-stream` 使用 `'http-stream'`。
- `duplex-stream` 使用 `'websocket'`，适合后续 token 流实时说话，不适合作为第一阶段默认。

## 6. 缓存与文件

当前缓存固定 `{ serviceType, voiceName, rate, pitch, text } -> cacheId.mp3`，接入 Provider 后需要升级：

缓存 key 建议包含：

- `engine`
- Edge: `voiceName`、`rate`、`pitch`
- AI Provider: `providerId`、`providerPresetId`、`model`、`voiceId`、`language`、`mode`、`transportPreference`、`audioSetting`、`speed`、`pitch`、`voiceVolume`、`emotion`、`extras` 中参与合成的稳定字段
- `text`

缓存条目建议升级：

```ts
config: {
  engine: SpriteSpeakEngine;
  serviceType?: string;
  voiceName?: string;
  rate?: number;
  pitch?: number;
  aiProvider?: {
    providerId: string;
    providerPresetId?: string;
    model: string;
    voiceId: string;
    mode: string;
    transportPreference?: string;
    audioFormat?: string;
  };
};
fileName: string;
mimeType?: string;
durationMs?: number;
```

文件写入策略：

- Edge 继续写入 `.mp3`。
- AI Provider 根据 `artifact.format` 或 `audioSetting.format` 决定扩展名。
- 如果 `PiExecutionService` 返回 `artifact.filePath`，`SpeakService` 可复制文件到 sprite speak cache。
- 如果只返回 `audioBase64`，`SpeakService` 解码后写入 cache。
- 不建议直接复用 Provider artifact 临时路径作为 sprite cache 路径，否则清理策略会互相影响。

## 7. 流式模式规划

第一阶段：

- 只在角色说话默认路径使用 `complete`。
- `synthesizeSpeech()` 和 `speak()` 都返回完整 `audioPath`，保持现有播放、缓存、talk 动画语义。

第二阶段 HTTP 流式：

- `SpeakService` 使用 `streamSpeechSynthesis()` 收集 `audio_delta`。
- 渲染进程新增流式播放通道，例如 `sprite:speak:stream-start`、`sprite:speak:stream-chunk`、`sprite:speak:stream-end`。
- talk 动画可在第一段音频到达时触发，而不是等待完整文件。
- 同时将 chunk 聚合落盘，结束后写入同一套 speak cache。

第三阶段 WebSocket 双向流：

- 新增 `SpeakService.startSession()` 或类似会话 API。
- LLM token 流、AI 自发说话、实时旁白可以持续 `appendText()`。
- 会话结束后发送 `finish()`，聚合最终音频入缓存。
- 普通 `window.YUA.sprite.speak(fullText)` 不默认走 duplex，避免短句也持有 WebSocket 会话。

## 8. IPC 与 Preload

现有 IPC 可以继续承载新配置：

- `sprite:speak:getConfig`
- `sprite:speak:setConfig`
- `sprite:speak:resetConfig`
- `sprite:speak:synthesize`
- `sprite:speak`
- `sprite:speak:getCacheStats`
- `sprite:speak:clearCache`

第一阶段无需新增角色说话 IPC。设置页选择 provider/model 可以直接复用 `window.YUA.ai.getProviders()`、`window.YUA.ai.listModels()`、`window.YUA.ai.resolveUsablePreset()` 和 Provider 配置窗口。

后续流式播放需要新增事件或 IPC：

- `sprite:speak:stream-start`
- `sprite:speak:stream-chunk`
- `sprite:speak:stream-end`
- `sprite:speak:stream-error`

## 9. 分阶段实施清单

### Phase 1：完整合成接入

- 扩展 `SpriteSpeakConfig` 类型，保留旧字段并增加 `engine` / `aiProvider`。
- `SpeakConfigStore` 增加旧配置迁移和新字段持久化。
- `SpeakCache` 支持 Provider cache key、动态扩展名和新版 cache index。
- `SpriteManagerOptions` 增加 `speechSynthesisExecutor` 注入点。
- Electron main 注入 `PiExecutionService.synthesizeSpeech()`。
- `SpeakService` 增加 AI Provider engine 分支，构造通用 `SpeechSynthesisRequest`。
- `SpeakSettings.tsx` 增加 Edge / AI Provider 引擎切换、ProviderModelSelect、voiceId、模式高级项和配置状态提示。
- 试听、缓存、talk 动画保持当前行为。

### Phase 2：HTTP 流式播放

- `SpeakService` 增加 `output-stream` 分支，使用 injected `stream()`。
- 设计并实现 renderer 流式音频播放器。
- 新增流式播放事件和取消能力。
- 流式结束后聚合写入缓存。

### Phase 3：WebSocket 双向会话

- 新增角色说话 session API。
- 支持文本分片输入、flush、finish、cancel。
- 将 AI 自发说话或聊天 token 流接入 session，而不是等待完整文本。
- 增加 session 级超时、并发限制和清理逻辑。

### Phase 4：Provider voice catalog

- 在 Provider 模型 metadata 或单独 Provider API 中声明 voice 选项。
- UI 从“手动 voiceId + MiniMax 常用项”升级为统一音色选择器。
- 支持收藏、最近使用、角色默认音色。

## 10. 验收标准

- 旧配置文件没有 `engine` 时仍按 Edge 正常朗读。
- 选择 Edge 时，现有音色、语速、音高、播放音量、缓存、试听不回退。
- 选择 AI Provider + MiniMax + `speech-2.8-turbo` + 合法 `voiceId` 时，`window.YUA.sprite.speak()` 能合成、缓存并播放。
- 未配置 Provider API key 时，设置页能明确引导配置，不在 speak 时静默失败。
- 切换 provider、model、voiceId、speed、pitch、emotion 后缓存 key 变化。
- `synthesizeSpeech()` 只预合成，不触发 talk 动画；`speak()` 在音频即将播放时才触发 talk 动画。
- TypeScript 编译通过，并覆盖 Edge 旧配置迁移、AI Provider 请求映射、缓存 key 和错误提示测试。

## 11. 接入前清理项

- `MiniMaxProvider.synthesizeSpeech()` 对非 `complete` mode 的错误文案仍写着 `streamSpeechSynthesis` 未实现，应改为提示调用流式入口。
- `SpeakSettings.tsx` 当前本地重复定义 `SpriteSpeakConfig`，应改为导入共享类型。
- `SpriteSpeakConfig.volume` 语义需要在 UI 文案中明确为播放音量，避免和 Provider 发声音量混淆。
