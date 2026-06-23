# AI 对话实时语音合成与 PCM 播放实施计划

> 状态：Phase 1-4 第一版已实现。本文承接 [角色说话接入 AI Provider 语音合成规划](./sprite-speech-provider-integration-plan.md) 的流式阶段，已把 AI 聊天的 assistant delta 输出接入 Provider `duplex-stream` 语音合成，并用 PCM 播放器做到边合成边播放。默认关闭，只有用户在角色说话设置中明确开启后才会消费 TTS 服务商额度。

## 1. 目标

- 在 `设置 -> 机能扩展 -> 语音合成/角色说话` 中增加“AI 回复实时朗读”开关，默认 `false`。
- 开启后，ChatPage 和资源侧边栏 AI Chat 的 assistant 正文 delta 可以实时送入语音合成。
- 优先使用 AI Provider `speechSynthesis` 的 `duplex-stream` + `websocket`，面向 LLM token/delta 输入。
- 音频输出优先使用 PCM，renderer 使用 Web Audio PCM 播放器消费 `audio_delta`，不等待完整音频文件。
- 保留现有 `window.YUA.sprite.speak()` 的完整合成、缓存、播放语义。普通角色说话和聊天实时朗读是两个入口。
- 对费用和误触发做保护：默认关闭、只朗读 assistant 正文、不朗读 thinking、不朗读用户输入、不自动朗读工具调用文本。

非目标：

- 不把 Edge TTS 改造成实时流式引擎。Edge 仍用于完整文件合成和缓存播放。
- 不要求第一版支持所有 Provider。第一版以 MiniMax WebSocket T2A 的 `duplex-stream` 为目标，其他 Provider 按 capability 渐进接入。
- 不把每个聊天 delta 都生成一段独立音频文件。实时播放是连续会话，`audio_delta` 进入同一个 PCM 播放队列。

## 2. 当前基础

已具备：

- `packages/ai` 已定义 `SpeechSynthesisRequest`、`SpeechSynthesisStreamEvent`、`SpeechTextInputChunk` 和 `streamSpeechSynthesis()`。
- MiniMax Provider 已支持：
  - `complete`：HTTP 非流式。
  - `output-stream`：HTTP 流式，完整文本输入。
  - `duplex-stream`：WebSocket 双向流，文本分片输入、音频分片输出。
- Renderer 侧 `window.YUA.ai.streamSpeechSynthesis()` 已提供 `appendText()`、`flush()`、`finish()`、`cancel()`。
- 角色说话已接入 AI Provider，并可把 `output-stream` / `duplex-stream` 聚合成完整文件后缓存播放。

缺口：

- 角色说话没有独立的实时会话 API。
- 聊天页 delta 没有接入 TTS 文本输入队列。
- Renderer 没有面向裸 PCM chunk 的连续播放器。
- 设置页没有“自动朗读 AI 回复”的独立开关。
- 当前流式事件里的播放参数还需要约定 `channels`、`sampleFormat`、字节序等 PCM 必需信息。

## 3. 配置模型

在 `SpriteSpeakConfig` 下新增实时聊天朗读配置。它和现有 `enabled` 不互相替代：

- `enabled`：控制普通角色说话能力，例如 `sprite.speak()`、工具结果 speech、系统提示朗读。
- `chatRealtimeSpeech.enabled`：控制 AI 聊天 assistant 回复是否实时朗读，默认关闭。

建议类型：

```ts
export interface SpriteSpeakChatRealtimeSpeechConfig {
  enabled: boolean;
  mode: 'duplex-stream' | 'output-stream';
  transportPreference: 'websocket' | 'http-stream' | 'auto';
  audioSetting: {
    format: 'pcm';
    sampleRate: number;
    channels: 1 | 2;
    sampleFormat?: 's16le' | 'f32le' | string;
  };
  chunking: {
    minChars: number;
    maxChars: number;
    maxDelayMs: number;
    flushOnPunctuation: boolean;
  };
  playback: {
    startBufferMs: number;
    maxBufferMs: number;
    fadeInMs: number;
    fadeOutMs: number;
    volume?: number;
  };
  scopes: {
    mainChat: boolean;
    resourceChatSidebar: boolean;
  };
  writeFinalCache?: boolean;
}

export interface SpriteSpeakConfig {
  enabled: boolean;
  engine: SpriteSpeakEngine;
  volume: number;
  aiProvider?: SpriteSpeakAIProviderConfig;
  chatRealtimeSpeech?: SpriteSpeakChatRealtimeSpeechConfig;
}
```

默认值：

```ts
chatRealtimeSpeech: {
  enabled: false,
  mode: 'duplex-stream',
  transportPreference: 'websocket',
  audioSetting: {
    format: 'pcm',
    sampleRate: 32000,
    channels: 1,
    sampleFormat: 's16le'
  },
  chunking: {
    minChars: 8,
    maxChars: 80,
    maxDelayMs: 350,
    flushOnPunctuation: true
  },
  playback: {
    startBufferMs: 160,
    maxBufferMs: 3000,
    fadeInMs: 12,
    fadeOutMs: 32
  },
  scopes: {
    mainChat: true,
    resourceChatSidebar: true
  },
  writeFinalCache: false
}
```

配置约束：

- 第一版只在 `engine === 'ai-provider'` 且当前 provider/model 支持 `speechSynthesis`、`duplex-stream`、`websocket`、`pcm` 时启用开关。
- 如果用户选择 Edge，设置页展示实时朗读不可用，并提示需要切到 AI Provider。
- `playback.volume` 缺省时使用 `SpriteSpeakConfig.volume`。它只影响本地播放，不进入 Provider 请求，也不进入缓存 key。
- `aiProvider.voiceVolume` 仍表示服务商发声音量，会影响合成音频。

## 4. 设置页设计

位置：`设置 -> 机能扩展 -> 语音合成/角色说话`，放在 AI Provider 配置区域下方。

UI 控制：

- Switch：`AI 回复实时朗读`，默认关闭。
- Scope 选择：主聊天、资源侧边栏聊天。第一版可先展示两个 checkbox。
- 输出格式：第一版固定 `PCM`，只作为只读状态展示。
- 高级项：
  - sample rate，默认 `32000`。
  - start buffer，默认 `160ms`。
  - max delay，默认 `350ms`。
  - min/max chars，用于 delta 文本分片。
- 状态提示：
  - Provider 未配置 API key 时，提供“去配置”入口。
  - 当前模型不支持 duplex/PCM 时，禁用开关。
  - 开启后提示会消耗 TTS 额度，但不在普通状态下自动播放。

重要交互：

- 切换开关只保存配置，不立即创建 TTS 会话。
- 只有正在产生 assistant 正文 delta 的聊天会触发实时会话。
- `thinking_delta`、tool call 参数、tool result 文本默认不进入实时朗读。
- 开启实时朗读后，对话过程只保留 assistant 正文 delta 的实时语音；AI 开始/结束/错误提示、工具结果 `speech`、表情包发送结果等辅助说话不再调用普通 `sprite.speak()`，避免多路 TTS 同时播放。
- 关闭实时朗读后，工具结果 `speech` 和现有 AI 事件提示继续保持原来的普通 `sprite.speak()` / toast 自动朗读行为。

## 5. 运行时架构

推荐新增 sprite 级实时语音会话 API，而不是让聊天页直接调用 `window.YUA.ai.streamSpeechSynthesis()`。

```text
Chat stream delta
  -> useRealtimeChatSpeech()
  -> window.YUA.sprite.startRealtimeSpeechSession({ source: 'chat', scope: 'mainChat' })
  -> handle.appendText(deltaText)
  -> SpeakService realtime session
  -> speechSynthesisExecutor.stream(req, onEvent, inputQueue)
  -> Provider duplex-stream
  -> audio_delta
  -> renderer PCMStreamingPlayer.append()
```

这样可以把以下逻辑集中在 `sprite-core/speak`：

- 读取角色说话配置和开关。
- 判断 provider/model 是否支持实时朗读。
- 构造统一 `SpeechSynthesisRequest`。
- 管理 session id、owner、取消、超时和并发限制。
- 触发 talk 动画。
- 记录 usage source。

聊天页只做三件事：

- 在 assistant 消息开始时准备 controller。
- 把 `delta` 文本喂给 controller。
- 在 `message_completed`、取消、错误、页面卸载时 finish/cancel。
- 发送请求前刷新实时朗读配置，把 `spriteRealtimeSpeechScope` 透传到 AI 请求；当该 scope 的实时朗读开启时，聊天页跳过工具结果 `speech`，主进程 AI 事件也只展示提示和动画，不触发普通 TTS。

## 6. IPC 与 Preload

新增 sprite API：

```ts
export type SpriteRealtimeSpeechSource = 'chat';
export type SpriteRealtimeSpeechScope = 'mainChat' | 'resourceChatSidebar';

export type SpriteRealtimeSpeechEvent =
  | { type: 'started'; data: { sessionId: string; sampleRate: number; channels: number; sampleFormat: string } }
  | {
      type: 'audio_delta';
      data: {
        chunk: ArrayBuffer | Buffer;
        format: 'pcm';
        sampleRate: number;
        channels: number;
        sampleFormat: 's16le' | 'f32le' | string;
        sequence?: number;
      };
    }
  | { type: 'metadata'; data: Record<string, any> }
  | { type: 'completed'; data: { sessionId: string; filePath?: string; durationMs?: number } }
  | { type: 'error'; data: { message: string; code?: string } }
  | { type: 'done' };

export interface SpriteRealtimeSpeechHandle {
  sessionId: string;
  appendText(text: string): Promise<void>;
  flush(): Promise<void>;
  finish(): Promise<void>;
  cancel(): Promise<void>;
  on(cb: (event: SpriteRealtimeSpeechEvent) => void): () => void;
  dispose(): void;
}
```

IPC：

- `sprite:speak:realtime:start`
- `sprite:speak:realtime:appendText`
- `sprite:speak:realtime:flush`
- `sprite:speak:realtime:finish`
- `sprite:speak:realtime:cancel`

返回值：

```ts
{
  sessionId: string;
  eventsChannel: string;
}
```

主进程要求：

- 每个 scope 同时最多一个实时语音 session。新 session 开始时取消旧 session。
- 取消聊天流、关闭页面、切换会话时必须关闭 TTS WebSocket、清空输入队列、通知 renderer 停止播放器。
- 如果 Provider 抛错，发送 `error` 和 `done`，不要回退到完整合成，避免无意增加费用。

## 7. Provider 请求映射

实时聊天朗读默认请求：

```ts
const request: SpeechSynthesisRequest = {
  providerId: aiProvider.providerId,
  providerPresetId: aiProvider.providerPresetId,
  model: aiProvider.model,
  mode: 'duplex-stream',
  transportPreference: 'websocket',
  voice: aiProvider.voice,
  voiceId: aiProvider.voiceId,
  language: aiProvider.language,
  audioSetting: {
    format: 'pcm',
    sampleRate: chatRealtimeSpeech.audioSetting.sampleRate,
    channels: chatRealtimeSpeech.audioSetting.channels
  },
  speed: aiProvider.speed,
  pitch: aiProvider.pitch,
  volume: aiProvider.voiceVolume,
  emotion: aiProvider.emotion,
  pronunciationDict: aiProvider.pronunciationDict,
  extras: {
    ...(aiProvider.extras || {}),
    usage: {
      operationKey: 'chat_realtime_speech',
      sourceType: 'sprite_chat_realtime_speech',
      sourceLabel: 'AI 回复实时朗读'
    }
  }
};
```

Provider event 要求：

- `audio_delta.data.format` 必须是 `pcm`。
- `sampleRate`、`channels`、`sampleFormat` 必须在 `started` 或第一段 `audio_delta` 中给出。
- MiniMax HTTP/WebSocket 返回 hex 音频时，adapter 继续在 provider 层转为 binary chunk，不把 hex 暴露给播放器。
- 如果实际返回 MP3/WAV/FLAC，第一版实时播放器拒绝播放并报错；后续可增加 MediaSource/解码器路径。

## 8. 文本分片策略

不要把每个 LLM delta 原样发给 TTS。需要一个文本缓冲器降低碎片感和 Provider 压力。

输入规则：

- 只接收 `StreamEvent.type === 'delta'` 的 assistant 正文。
- 忽略 `thinking_delta`。
- 忽略 markdown 结构噪声的单独碎片，例如只有反引号、列表缩进、空白。
- 过滤 emoji，沿用当前 TTS sanitize 规则。

flush 规则：

- 命中中文/英文句末标点时 flush，例如 `。！？!?`。
- 逗号、顿号、分号可以在 buffer 较长时 flush。
- 达到 `maxChars` 立即 flush。
- 距离上次发送超过 `maxDelayMs` 且 buffer 达到 `minChars` 时 flush。
- `message_completed` 时发送剩余 buffer，然后 `finish()`。

建议第一版算法：

```text
append(delta)
  -> sanitize and normalize whitespace
  -> append to textBuffer
  -> if sentenceBoundary or maxChars or delayReached:
       handle.appendText(textBuffer)
       if sentenceBoundary: handle.flush()
       clear textBuffer

complete()
  -> send remaining textBuffer
  -> handle.finish()
```

后续可以增加：

- markdown code block 跳过朗读。
- URL、长路径、表格内容降噪。
- 中英文分词级更自然断句。

## 9. PCM 播放器设计

新增 renderer 工具：

```text
src/lib/audio/pcm-stream-player.ts
src/lib/audio/pcm-stream-worklet.ts
```

播放器职责：

- `start({ sampleRate, channels, sampleFormat, volume })`
- `append(chunk)`
- `end()`
- `cancel()`
- `setVolume(volume)`
- `getBufferedMs()`

实现建议：

- 使用 Web Audio API。
- 优先使用 `AudioWorkletNode`，用 ring buffer 存储转换后的 Float32 PCM。
- fallback 使用 `ScriptProcessorNode`，只作为兼容路径。
- PCM 默认按 `s16le` 解码，转换为 `Float32Array`。
- 如果 `audioContext.sampleRate !== pcm.sampleRate`，第一版用线性插值重采样。
- `startBufferMs` 达到后开始播放，减少开头卡顿。
- buffer underrun 时短暂补静音，不阻塞 TTS 接收。
- `cancel()` 立即停止并清空队列；`end()` 播完剩余 buffer 后淡出。

播放器不负责：

- Provider 请求。
- 文本分片。
- 缓存写入。
- talk 动画。

## 10. 缓存策略

普通 `sprite.speak(text)`：

- 继续使用 `<userData>/data/sprite-speak-cache/`。
- 先查缓存，未命中才合成。

聊天实时朗读：

- 播放前不查缓存，因为开始播放时还没有完整文本，且聊天回复复用率很低。
- 第一版 `writeFinalCache` 默认 `false`，避免每条聊天回复都落盘造成磁盘增长。
- 如果后续开启 `writeFinalCache`：
  - session 结束后用完整 assistant 文本和实时合成配置生成 cache id。
  - 把聚合后的完整 PCM 或转码后的 WAV/MP3 写入 speak cache。
  - cache metadata 标记 `sourceType: 'chat_realtime_speech'`。

## 11. Talk 动画与播放状态

实时朗读的 talk 动画不应等完整文件生成：

- session 创建时不立即触发 talk。
- 第一段有效 `audio_delta` 到达并成功进入播放器后触发 talk。
- 播放器 buffer 仍有音频时保持 talk-like 状态。
- `done` 或 `cancel` 后停止延长 talk，允许当前 talk 片段自然结束。
- 如果 session 建立失败或没有音频，不触发 talk。

## 12. 分阶段实施

### Phase 1：配置和文档

- [x] 明确实时聊天朗读配置默认关闭。
- [x] 明确 PCM 播放器和 Provider duplex-stream 的职责边界。
- [x] `SpriteSpeakConfig` 增加 `chatRealtimeSpeech`。
- [x] `SpeakConfigStore` 增加默认值迁移。
- [x] 设置页增加开关、scope 和 PCM 参数。

### Phase 2：sprite 实时语音会话 API

- [x] `SpeakService` 新增 `startRealtimeSession()`。
- [x] 增加 session 输入队列，支持 `appendText()`、`flush()`、`finish()`、`cancel()`。
- [x] 新增 sprite IPC/preload handle。
- [x] Main 侧通过 `speechSynthesisExecutor.stream()` 调用 Provider。
- [x] 每个 scope 限制一个活跃 session。

### Phase 3：PCM 播放器

- [x] 新增 `PcmStreamPlayer`。
- [x] 支持 `s16le` mono PCM。
- [x] 支持 start buffer、取消、自然结束。
- [x] 支持 sample rate 不一致时的基础重采样。
- [x] 播放器事件接入 talk 动画时机。

### Phase 4：聊天 delta 接入

- [x] 新增 `useRealtimeChatSpeech()` hook。
- [x] ChatPage 接入 assistant `delta`、`message_completed`、`error`、`done`、cancel。
- [x] Resource AIChatSidebar 接入同一 hook。
- [x] 跳过 `thinking_delta`、tool call 和 tool result。
- [x] 实时朗读开启时屏蔽 AI 开始/结束/错误提示、工具结果 `speech` 和表情包辅助说话。
- [x] 页面卸载、切换会话、用户停止生成时取消 TTS session。

### Phase 5：体验和稳定性

- [ ] Provider 不支持 duplex/PCM 时设置页禁用开关。
- [ ] AudioContext 未解锁时给出设置页或 toast 提示。
- [ ] 增加 underrun、首包耗时、播放延迟日志。
- [x] 增加 usage metadata：`sourceType=sprite_chat_realtime_speech`。
- [x] 增加最小回归测试。
- [ ] 升级为 AudioWorklet ring buffer 播放器。

## 13. 验收标准

- 默认配置下，AI 聊天产生 delta 不会调用任何 TTS Provider。
- 用户开启“AI 回复实时朗读”后，assistant 正文 delta 能触发一个 Provider duplex-stream session。
- 第一段 PCM `audio_delta` 到达后，renderer 不等待完整文件即可开始播放。
- `thinking_delta` 不被朗读。
- 开启实时朗读时，AI 开始/结束/错误提示、工具结果 `speech`、表情包发送结果不会触发普通 `sprite.speak()`；关闭实时朗读后这些入口保持原行为。
- 停止生成、页面卸载、会话切换会取消 TTS session 和 PCM 播放器。
- Provider 未配置或模型不支持时，设置页禁用开关，聊天页不会静默消耗额度。
- 普通 `sprite.speak()` 的缓存和播放行为不受影响。
- TypeScript 通过，覆盖配置迁移、开关默认关闭、文本分片、session 取消和 PCM 解码单测。

## 14. 风险与处理

| 风险 | 处理 |
| --- | --- |
| TTS 比 LLM delta 慢，播放延迟明显 | 文本缓冲器按标点和时间 flush，播放器使用小 start buffer |
| Provider 返回格式不是 PCM | 第一版拒绝实时播放并报错，后续增加解码路径 |
| sample rate 与 AudioContext 不一致 | 播放器内做线性重采样 |
| 聊天取消后 WebSocket 未关闭 | session cancel 必须关闭输入队列、AbortController、播放器 |
| 自动朗读造成费用浪费 | 默认关闭，且仅 assistant 正文触发 |
| 多个聊天窗口同时朗读 | 按 scope 限制并发，后开始的 session 取消同 scope 旧 session |
