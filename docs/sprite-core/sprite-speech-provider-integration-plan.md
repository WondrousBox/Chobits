# 角色说话接入 AI Provider 语音合成规划

> 状态：已实现。角色说话现在可在 Edge 和 AI Provider 之间切换；普通 `sprite.speak()` 固定使用 AI Provider `complete/http` 完整合成并写入本地缓存。AI 聊天 delta 驱动的 PCM 边合成边播放使用独立开关，运行时按模型能力自动选择 `duplex-stream/websocket`、`output-stream/http-stream`、`complete/http` 并优雅降级，见 [AI 对话实时语音合成与 PCM 播放实施计划](./sprite-realtime-chat-speech-plan.md)。

## 1. 当前结论

MiniMax 的语音合成底座已经在 `packages/ai` 中具备三种请求方式：

| Provider 能力    | 通用入口                                                                                   | MiniMax 映射                                                        | 当前代码状态 |
| ---------------- | ------------------------------------------------------------------------------------------ | ------------------------------------------------------------------- | ------------ |
| HTTP 非流式      | `synthesizeSpeech()` + `mode: 'complete'`                                                  | `POST /v1/t2a_v2`，`stream: false`                                  | 已实现       |
| HTTP 流式        | `streamSpeechSynthesis()` + `mode: 'output-stream'` + `transportPreference: 'http-stream'` | `POST /v1/t2a_v2`，`stream: true`                                   | 已实现       |
| WebSocket 双向流 | `streamSpeechSynthesis()` + `mode: 'duplex-stream'` + `transportPreference: 'websocket'`   | `WSS /ws/v1/t2a_v2`，`task_start` / `task_continue` / `task_finish` | 已实现       |

角色说话已接入这些能力。改造后的链路是：

- `src/pages/ExtensionSettings/SpeakSettings.tsx` 提供 Edge / AI Provider 引擎切换。
- AI Provider 面板可选择 provider、preset、TTS model、voiceId 和普通说话音频格式；不再让用户选择合成模式。
- `packages/sprite-core/speak/types.ts` 的 `SpriteSpeakConfig` 已增加 `engine` 和 `aiProvider`。
- `packages/sprite-core/speak/speak-service.ts` 会根据配置调用 Edge TTS 或注入的 `SpriteSpeechSynthesisExecutor`。普通说话始终构造 `complete/http` 请求；实时聊天朗读由运行时自动选择和降级。
- `packages/sprite-core/speak/speak-cache.ts` 已支持 Provider cache key 和动态音频扩展名，同时保留旧 Edge cache id 兼容。

因此接入目标不是“再实现一遍 MiniMax TTS”，而是让 `sprite-core/speak` 变成角色说话的业务编排层，底层合成引擎可选择 Edge 或 AI Provider。

## 2. 目标与非目标

目标：

- 角色机能扩展中的“语音合成/角色说话”支持选择 `Edge` 或 `AI Provider`。
- AI Provider 模式使用统一 `speechSynthesis` capability，未来可接 MiniMax、OpenAI、ElevenLabs、火山、腾讯、阿里等服务商。
- 保留现有 `window.chobits.sprite.speak()`、`synthesizeSpeech()`、气泡展示、talk 动画触发和缓存行为。
- 普通角色说话使用 `complete/http`，保证“合成完成 -> 缓存 -> 播放”的稳定体验。
- AI 聊天 delta 的实时朗读走独立开关，默认关闭，优先使用 WebSocket `duplex-stream` + PCM 播放器；不支持时按能力降级到 HTTP 流式或完整 HTTP 合成。

非目标：

- 不把 Edge TTS 改造成 Provider。Edge 可以继续作为内置本地/免费引擎存在。
- 不把 TTS 合并到音乐生成能力。语音仍使用 `speechSynthesis`，音乐使用 `musicGeneration`。
- 普通 `sprite:speak(text)` 仍以完整音频文件路径和缓存为中心；聊天实时朗读不改变这个入口，单独通过实时会话 API 接入。

## 3. 配置模型

当前配置通过 `engine` 区分 Edge 和 AI Provider，旧 Edge 字段继续服务 Edge 面板。AI Provider 配置只保存影响声音内容的参数，不保存合成模式或传输方式；普通说话和实时朗读的调用策略由运行时按使用场景和 provider/model capability 决定。

```ts
export type SpriteSpeakEngine = 'edge' | 'ai-provider';

export interface SpriteSpeakAIProviderConfig {
  providerId: string;
  providerPresetId?: string;
  model: string;
  voiceId: string;
  voice?: string;
  language?: string;
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
  engine: SpriteSpeakEngine;

  // Legacy Edge fields. Keep them for the Edge settings panel and old config reads.
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
- 保存新配置时仍保留 Edge 旧字段，避免旧窗口或旧代码读取失败。
- 旧配置中如果曾保存过 `mode` / `transportPreference` 会被读取流程忽略；新配置模型不再定义这两个字段，UI 也不暴露选择项。
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
   - 支持选择当前 provider 的 preset；不选择时走 `resolveUsablePreset()` 自动选择可用预设。
   - 音色使用 provider voice 选择器。第一阶段可先提供“常用 MiniMax 音色 + 手动输入 voiceId”，后续再扩展统一 voice catalog。
   - 合成模式不在配置页暴露。普通说话由系统固定走 `complete/http`；AI 回复实时朗读由系统按模型 metadata 中的 `speechSynthesis.modes/transports/audioFormats` 自动选择。
   - 展示 Provider 配置状态。未配置 API key 或 preset 时，提供“去配置”入口。
   - 试听按钮仍调用 `window.chobits.sprite.speak()`，让测试覆盖真实角色说话链路。

需要扩展的前端类型：

- `SpeakSettings.tsx` 的本地 `SpriteSpeakConfig` 应改为从 `@packages/sprite-core/speak/types` 引入，避免 UI 和主进程类型分叉。
- `ProviderModelSelect` 的 `ModelRow` 应允许读取 `speechSynthesis?: { modes?: string[]; transports?: string[]; audioFormats?: string[]; voices?: unknown[] }` 这类 metadata，用于运行时策略和后续 UI 状态提示。

## 5. 主进程运行链路

`sprite-core` 不应直接强依赖 `packages/ai`。建议在 `SpriteManagerOptions` 中注入一个语音合成执行器：

```ts
export interface SpriteSpeechSynthesisExecutor {
  synthesize(req: SpeechSynthesisRequest): Promise<SpeechSynthesisResponse>;
  stream?(req: SpeechSynthesisRequest, onEvent: (event: SpeechSynthesisStreamEvent) => void, input?: AsyncIterable<SpeechTextInputChunk>): Promise<SpeechSynthesisResponse>;
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
  -> callback sprite:speak-started with audioPath
  -> SpriteManager trigger talk animation only when audio will play
```

AI Provider 请求映射：

```ts
const request: SpeechSynthesisRequest = {
  providerId: config.aiProvider.providerId,
  providerPresetId: config.aiProvider.providerPresetId,
  model: config.aiProvider.model,
  text,
  mode: 'complete',
  transportPreference: 'http',
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
- 普通 `sprite.speak()` 固定使用 `complete/http`，这样缓存 key 和费用行为稳定，不会因为旧配置或 UI 选择误走流式。
- 实时聊天朗读优先使用 `duplex-stream/websocket`，适合 token/delta 流实时说话。
- 如果当前 provider/model 未声明 WebSocket 能力或运行时在未出音频前失败，则降级到 `output-stream/http-stream`。
- 如果 HTTP 流式也不可用，则降级到 `complete/http`，按文本分片逐段完整合成并送入 PCM 播放队列。

## 6. 缓存与文件

角色说话统一使用本地缓存，缓存目录是 `<userData>/data/sprite-speak-cache/`：

```text
sprite-speak-cache/
  cache-index.json
  <cacheId>.<audio-format>
```

Edge 旧实现使用：

```ts
MD5(
  JSON.stringify({
    serviceType,
    voiceName,
    rate,
    pitch,
    text: sanitizedText
  })
);
```

其中 `sanitizedText` 是去掉 emoji 后真正送入 TTS 的文本。为了兼容旧缓存，Edge 路径仍保留这个 JSON 顺序和字段集合，不把新增的 `engine` 写进 hash。

AI Provider 使用稳定序列化后的配置指纹加文本再做 MD5：

```ts
MD5(
  stableJson({
    engine: 'ai-provider',
    aiProvider: {
      providerId,
      providerPresetId,
      model,
      voiceId,
      voice,
      language,
      audioFormat,
      speed,
      pitch,
      voiceVolume,
      emotion
    },
    audioSetting,
    subtitle,
    pronunciationDict,
    extras: stableExtras,
    text: sanitizedText
  })
);
```

这样同一段文本在同一套语音配置下会命中本地缓存，不会重复调用服务商；切换 provider、preset、model、voiceId、语速、音高、发声音量、情绪、格式或字幕/发音词典会得到新的 `cacheId`，避免误复用旧音频。

缓存 key 建议包含：

- `engine`
- Edge: `voiceName`、`rate`、`pitch`
- AI Provider: `providerId`、`providerPresetId`、`model`、`voiceId`、`language`、`audioSetting`、`speed`、`pitch`、`voiceVolume`、`emotion`、`extras` 中参与合成的稳定字段
- `text`

不进入缓存 key 的字段：

- `secrets`：密钥不应落入 hash 或 cache index。
- `requestId`、`outputDir`：单次调用控制字段，不影响声音内容。
- `usage`：统计 metadata，不影响声音内容。
- `volume`：角色播放器音量，只影响播放响度，不影响合成音频；Provider 发声音量使用 `aiProvider.voiceVolume`，会进入 hash。

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
    voice?: string;
    language?: string;
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

当前实现状态：

- Edge cache id 保持旧算法兼容。
- AI Provider 使用 `stableJson()` 保证对象 key 顺序稳定，再做 MD5。
- `SpeakService.synthesize()` 先 `cache.get(cacheId)`，命中直接返回 `audioPath` 和 `fromCache: true`。
- 未命中才调用 Edge 或 AI Provider executor，成功后 `cache.put()` 写入本地文件和 `cache-index.json`。

## 7. 流式与实时朗读规划

普通角色说话已完成：

- `synthesizeSpeech()` 和 `speak()` 都固定走 `complete/http`，返回完整 `audioPath`，保持现有播放、缓存、talk 动画语义。
- AI Provider 缓存 key 不包含用户可配的合成模式或传输方式；普通说话的 `complete/http` 是运行时调用策略。
- `output-stream` 和 `duplex-stream` 仍保留在 Provider 能力层，供实时朗读、旁白等场景按能力自动使用。

第二阶段 AI 聊天实时朗读已完成第一版：

- `SpriteSpeakConfig` 已增加 `realtimeSpeech.enabled`，默认关闭。
- 设置页已增加“AI 回复实时朗读”开关。只有用户明确开启后，聊天 assistant 正文 delta 才会进入 TTS。
- `SpeakService` 已新增实时 session API，使用可重放文本输入队列和自动策略候选。
- 实时朗读候选顺序为 `duplex-stream/websocket` -> `output-stream/http-stream` -> `complete/http`。候选必须被 provider/model 的 `speechSynthesis` metadata 声明支持；未声明 metadata 的 provider 只保守使用 `complete/http`。
- 如果较高优先级策略在未输出音频前失败，session 会重放已接收文本并切到下一档；已经输出音频后不再混用其它策略，避免多路声音叠加。
- 渲染进程已新增 PCM 播放器，消费连续 `audio_delta`，不等待完整文件。
- talk 动画在第一段有效 PCM 音频到达后触发。
- 聊天实时朗读开启时只播放 assistant 正文 delta；AI 开始/结束/错误提示、工具结果 `speech`、表情包发送结果等辅助说话会跳过普通 `sprite.speak()`，关闭实时朗读后恢复原行为。
- 聊天实时朗读第一版默认不写 speak cache，避免每条对话回复落盘；普通 `sprite.speak()` 缓存策略不变。

后续增强：

- 如果输出不是 PCM，可另行增加 MediaSource/解码器路径；第一版实时聊天只要求 PCM。
- 可选在结束后聚合落盘，写入 speak cache。
- 增加 session 级延迟、underrun、首包耗时监控。

实时聊天朗读的详细配置、IPC、PCM 播放器和验收标准见 [AI 对话实时语音合成与 PCM 播放实施计划](./sprite-realtime-chat-speech-plan.md)。

## 8. IPC 与 Preload

现有 IPC 可以继续承载新配置：

- `sprite:speak:get-config`
- `sprite:speak:set-config`
- `sprite:speak`
- `sprite:speak:get-cache-stats`
- `sprite:speak:clear-cache`

第一阶段无需新增角色说话 IPC。设置页选择 provider/model 可以直接复用 `window.chobits.ai.getProviders()`、`window.chobits.ai.listModels()`、`window.chobits.ai.resolveUsablePreset()` 和 Provider 配置窗口。

聊天实时朗读需要新增实时会话 IPC：

- `sprite:speak:realtime:start`
- `sprite:speak:realtime:append-text`
- `sprite:speak:realtime:flush`
- `sprite:speak:realtime:finish`
- `sprite:speak:realtime:cancel`

实时会话的事件通过返回的 `eventsChannel` 推送，事件包括 `started`、`audio_delta`、`metadata`、`completed`、`error`、`done`。

## 9. 分阶段实施清单

### Phase 1：完整合成接入

- [x] 扩展 `SpriteSpeakConfig` 类型，保留旧字段并增加 `engine` / `aiProvider`。
- [x] `SpeakConfigStore` 增加旧配置迁移和新字段持久化。
- [x] `SpeakCache` 支持 Provider cache key、动态扩展名和新版 cache index。
- [x] `SpriteManagerOptions` 增加 `speechSynthesisExecutor` 注入点。
- [x] Electron main 注入 `PiExecutionService.synthesizeSpeech()` 和 `streamSpeechSynthesis()`。
- [x] `SpeakService` 增加 AI Provider engine 分支，构造通用 `SpeechSynthesisRequest`。
- [x] `SpeakSettings.tsx` 增加 Edge / AI Provider 引擎切换、ProviderModelSelect、voiceId、自动策略说明和配置入口。
- [x] `SpeakSettings.tsx` 支持选择当前 Provider 的 preset，适配 MiniMax Token Plan 多预设。
- [x] 试听、缓存、talk 动画保持当前行为。

### Phase 2：AI 聊天实时朗读 + PCM 播放

- [x] `SpriteSpeakConfig` 增加 `realtimeSpeech`，默认关闭。
- [x] 设置页增加“AI 回复实时朗读”开关、scope 和 PCM 参数。
- [x] `SpeakService` 增加实时 session API，支持 `appendText()`、`flush()`、`finish()`、`cancel()`。
- [x] `SpeakService` 实时 session 支持 WS -> HTTP 流式 -> HTTP 完整的 capability 驱动自动策略和失败降级。
- [x] 新增 sprite realtime IPC/preload handle。
- [x] Renderer 新增 PCM streaming player。
- [x] ChatPage 接入 assistant delta，跳过 thinking/tool（原规划的 Resource AIChatSidebar 已随资源系统移除）。
- [x] 聊天取消、页面卸载、message completed 时正确关闭 TTS session。

### Phase 3：实时播放增强与缓存增强

- 支持非 PCM 流式音频的解码播放路径。
- 可选将实时 session 的最终聚合音频写入 speak cache。
- 增加 session 级延迟、underrun、首包耗时监控。

### Phase 4：Provider voice catalog

- 在 Provider 模型 metadata 或单独 Provider API 中声明 voice 选项。
- UI 从“手动 voiceId + MiniMax 常用项”升级为统一音色选择器。
- 支持收藏、最近使用、角色默认音色。

## 10. 验收标准

- 旧配置文件没有 `engine` 时仍按 Edge 正常朗读。
- 选择 Edge 时，现有音色、语速、音高、播放音量、缓存、试听不回退。
- 选择 AI Provider + MiniMax + `speech-2.8-turbo` + 合法 `voiceId` 时，`window.chobits.sprite.speak()` 能合成、缓存并播放。
- 未配置 Provider API key 时，设置页能明确引导配置，不在 speak 时静默失败。
- 切换 provider、model、voiceId、speed、pitch、emotion 后缓存 key 变化。
- 普通 `sprite.speak()` 即使旧配置中存在 `duplex-stream/websocket`，也仍使用 `complete/http` 和同一套缓存 key。
- 开启实时朗读时，系统按模型能力优先 WS、再 HTTP 流式、再 HTTP 完整；不需要用户手动选择合成方式。
- `synthesizeSpeech()` 只预合成，不触发 talk 动画；`speak()` 在音频即将播放时才触发 talk 动画。
- TypeScript 编译通过，并覆盖 Edge 旧配置迁移、AI Provider 请求映射、缓存 key 和错误提示测试。

## 11. 接入前清理项

- [x] `MiniMaxProvider.synthesizeSpeech()` 对非 `complete` mode 的错误文案已改为提示调用流式入口。
- [x] `SpeakSettings.tsx` 已改为导入共享 `SpriteSpeakConfig` 类型。
- [x] `SpriteSpeakConfig.volume` 在 UI 中标记为播放音量，Provider 发声音量使用 `aiProvider.voiceVolume`。

## 12. 已验证

- `pnpm exec tsc --noEmit`
- `pnpm exec vitest run test/sprite/sprite-speak-provider.spec.ts test/ai/minimax-music-provider.spec.ts`（原 `test/tts-strip-emoji.spec.ts` 已不存在）
