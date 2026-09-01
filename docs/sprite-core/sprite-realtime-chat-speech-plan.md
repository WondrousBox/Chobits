# AI 对话实时语音合成与 PCM 播放实施计划

> 状态：Phase 1-4 第一版已实现。本文承接 [角色说话接入 AI Provider 语音合成规划](./sprite-speech-provider-integration-plan.md) 的流式阶段，已把 AI 聊天的 assistant delta 输出接入 Provider 语音合成，并用 PCM 播放器做到边合成边播放。默认关闭，只有用户在角色说话设置中明确开启后才会消费 TTS 服务商额度。运行时会按模型能力自动选择 `duplex-stream/websocket`、`output-stream/http-stream`、`complete/http`，用户不需要在设置里选择合成方式。

## 1. 目标

- 在 `设置 -> 机能扩展 -> 语音合成/角色说话` 中增加“AI 回复实时朗读”开关，默认 `false`。
- 开启后，ChatPage 和资源侧边栏 AI Chat 的 assistant 正文 delta 可以实时送入语音合成。
- 优先使用 AI Provider `speechSynthesis` 的 `duplex-stream` + `websocket`，面向 LLM token/delta 输入；不可用时自动降级到 HTTP 流式，再不可用时降级到 HTTP 完整合成。
- 音频输出优先使用 PCM，renderer 使用 Web Audio PCM 播放器消费 `audio_delta`，不等待完整音频文件。
- 保留现有 `window.YUA.sprite.speak()` 的完整合成、缓存、播放语义。普通角色说话和聊天实时朗读是两个入口。
- 对费用和误触发做保护：默认关闭、只朗读 assistant 正文、不朗读 thinking、不朗读用户输入、不自动朗读工具调用文本。

非目标：

- 不把 Edge TTS 改造成实时流式引擎。Edge 仍用于完整文件合成和缓存播放。
- 不要求所有 Provider 都支持最高级实时能力。Provider/model 只要声明 `speechSynthesis` capability 和对应 `modes/transports/audioFormats`，运行时就会按能力选择最合适的路径。
- 不把每个聊天 delta 都生成一段独立音频文件。实时播放是连续会话，`audio_delta` 进入同一个 PCM 播放队列。

## 2. 当前基础

已具备：

- `packages/ai` 已定义 `SpeechSynthesisRequest`、`SpeechSynthesisStreamEvent`、`SpeechTextInputChunk` 和 `streamSpeechSynthesis()`。
- MiniMax Provider 已支持：
  - `complete`：HTTP 非流式。
  - `output-stream`：HTTP 流式，完整文本输入。
  - `duplex-stream`：WebSocket 双向流，文本分片输入、音频分片输出。
- Renderer 侧 `window.YUA.ai.streamSpeechSynthesis()` 已提供 `appendText()`、`flush()`、`finish()`、`cancel()`。
- 角色说话已接入 AI Provider。普通 `sprite.speak()` 固定 `complete/http` 并缓存；实时聊天朗读使用独立 session 自动选择流式或完整合成策略。

缺口：

- 角色说话没有独立的实时会话 API。
- 聊天页 delta 没有接入 TTS 文本输入队列。
- Renderer 没有面向裸 PCM chunk 的连续播放器。
- 设置页没有“自动朗读 AI 回复”的独立开关。
- 当前流式事件里的播放参数还需要约定 `channels`、`sampleFormat`、字节序等 PCM 必需信息。

## 3. 配置模型

在 `SpriteSpeakConfig` 下新增实时聊天朗读配置。它和现有 `enabled` 不互相替代：

- `enabled`：控制普通角色说话能力，例如 `sprite.speak()`、工具结果 speech、系统提示朗读。
- `realtimeSpeech.enabled`：控制 AI 聊天 assistant 回复是否实时朗读，默认关闭。

建议类型：

```ts
export interface SpriteSpeakRealtimeSpeechConfig {
  enabled: boolean;
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
  realtimeSpeech?: SpriteSpeakRealtimeSpeechConfig;
}
```

默认值：

```ts
realtimeSpeech: {
  enabled: false,
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

- 实时朗读只在 `engine === 'ai-provider'` 且当前 provider/model 至少支持一种可播放 PCM 的 `speechSynthesis` 策略时启用。
- 策略优先级固定为 `duplex-stream/websocket` -> `output-stream/http-stream` -> `complete/http`。配置文件不保存 `mode` / `transportPreference`，这两个字段只存在于运行时发给 Provider 的 `SpeechSynthesisRequest` 中。
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
  - 当前模型不支持任何 PCM 实时朗读策略时，禁用开关或在启动时返回不可用。
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
  -> resolve strategies from provider/model speechSynthesis metadata
  -> Provider strategy: WS duplex / HTTP stream / HTTP complete
  -> audio_delta
  -> renderer PCMStreamingPlayer.append()
```

这样可以把以下逻辑集中在 `sprite-core/speak`：

- 读取角色说话配置和开关。
- 判断 provider/model 支持哪些实时朗读策略。
- 构造统一 `SpeechSynthesisRequest`。
- 管理 session id、owner、取消、超时和并发限制。
- 触发 talk 动画。
- 记录 usage source。

聊天页只做三件事：

- 在 assistant 消息开始时准备 controller。
- 把 `delta` 文本喂给 controller。
- 在 `message_completed`、取消、错误、页面卸载时 finish/cancel。
- 发送请求前刷新实时朗读配置，把 `realtimeSpeechScope` 透传到 AI 请求；当该 scope 的实时朗读开启时，同时把当前角色说话使用的 TTS `providerId`、`model`、`voiceId` 放入 `extras.realtimeSpeech`，供后端按 provider/model metadata 注入实时朗读提示词。
- 当该 scope 的实时朗读开启时，聊天页跳过工具结果 `speech`，主进程 AI 事件也只展示提示和动画，不触发普通 TTS。

LLM system prompt 注入规则：

- 只有 `realtimeSpeech.enabled === true`、当前 scope 开启、角色说话 engine 为 `ai-provider` 时才注入。
- 注入内容来自当前 TTS provider/model 的 `speechSynthesis.realtimeSpeechPromptGuidance`，例如 MiniMax 的段落换行、`<#0.4#>` 停顿标签和语气词标签说明。
- 聊天层只识别统一的 `extras.realtimeSpeech` 上下文，不硬编码 MiniMax 私有标签。新增服务商时在模型 metadata 中声明自己的实时朗读提示词即可。
- 关闭实时朗读时不注入，避免普通文字聊天被 TTS 风格约束污染。

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
- 取消聊天流、关闭页面、切换会话时必须关闭 TTS 流式连接或正在执行的 HTTP 请求、清空输入队列、通知 renderer 停止播放器。
- 如果当前策略在未输出任何音频前失败，可以重放已接收文本并尝试下一档策略；如果已经开始输出音频，则不再混用其它策略，发送 `error` / `done` 并停止当前播放器。

## 7. Provider 请求映射

实时聊天朗读请求由自动策略生成，候选顺序固定：

1. `mode: 'duplex-stream'` + `transportPreference: 'websocket'`：文本分片输入，音频分片输出。
2. `mode: 'output-stream'` + `transportPreference: 'http-stream'`：按文本缓冲块逐次完整文本输入，音频分片输出。
3. `mode: 'complete'` + `transportPreference: 'http'`：按文本缓冲块逐次完整合成，再把音频 payload 转为 `audio_delta` 事件。

候选必须同时满足：

- `SpeechSynthesisExecutor` 有对应入口：`duplex-stream` / `output-stream` 需要 `stream()`，`complete` 需要 `synthesize()`。
- provider/model metadata 声明了对应 `speechSynthesis.modes`、`speechSynthesis.transports` 和 `audioFormats` 中的 `pcm`。
- 未声明 metadata 的 provider 不假设支持流式，只保守尝试 `complete/http`。

基础请求字段：

```ts
const request: SpeechSynthesisRequest = {
  providerId: aiProvider.providerId,
  providerPresetId: aiProvider.providerPresetId,
  model: aiProvider.model,
  mode: selectedStrategy.mode,
  transportPreference: selectedStrategy.transportPreference,
  voice: aiProvider.voice,
  voiceId: aiProvider.voiceId,
  language: aiProvider.language,
  audioSetting: {
    format: 'pcm',
    sampleRate: realtimeSpeech.audioSetting.sampleRate,
    channels: realtimeSpeech.audioSetting.channels
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
- `complete/http` 降级路径要求 provider 返回可被读取为 PCM 的 artifact；否则会报错并结束 session。

## 8. 文本分片策略

不要把每个 LLM delta 原样发给 TTS。实时朗读链路现在有两层处理：renderer hook 保留换行并做轻量缓冲来降低 IPC 频率；`SpeakService` 内部的 `RealtimeSpeechTextParser` 才是最终发送给 Provider 前的权威断句器。这样即使前端因为定时 flush 把半句话提前交给主进程，主进程也会继续缓存，直到拿到适合 TTS 的文本段。

输入规则：

- 只接收 `StreamEvent.type === 'delta'` 的 assistant 正文。
- 忽略 `thinking_delta`。
- `SpeakService` 会继续清理 markdown 结构噪声，例如标题符号、列表前缀、粗体标记、链接、引用、表格分隔线和代码块。
- 保留 markdown block 结构：空行、标题行、列表项换行都作为 TTS 结构边界，不把无标点标题和下一条列表内容粘成一句。
- 过滤 emoji，沿用当前 TTS sanitize 规则。

flush 规则：

- 命中中文/英文句末标点时产出一个文本段，例如 `。！？!?…`。
- 行尾/段尾的语气符号 `～` / `~` 也按句末处理。
- 换行作为 block boundary；无标点标题、列表项和段落会单独成段。
- 逗号、顿号、分号、冒号只在 buffer 已经达到一定长度后作为软边界，避免过碎。
- `flush()` 只尝试按已有自然边界出段；如果只剩半句话，不会强制发送。
- 达到 `maxChars` 且没有可用标点时才按空白或硬长度切分，作为兜底保护。
- `message_completed` / `finish()` 时强制发送最后剩余 buffer，然后关闭 Provider 输入。

当前算法：

```text
renderer append(delta)
  -> preserve newline structure, light normalize and debounce
  -> handle.appendText(buffer)

SpeakService appendText(text)
  -> strip emoji
  -> RealtimeSpeechTextParser.append(text)
  -> clean markdown / URL / code fence noise, keep block boundaries
  -> append to parser buffer
  -> emit complete sentence, safe soft-boundary segment, or maxChars fallback segment
  -> enqueue only emitted segments to Provider input queue

flush()
  -> parser.flush()
  -> do not send incomplete residual text

complete()
  -> renderer flushes its local buffer
  -> handle.finish()
  -> parser.end() sends remaining residual text
  -> input queue closes
```

后续可以增加：

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
- `pause()`
- `resume()`
- `append(chunk)`
- `end()`
- `stop()`
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
- `pause()` 暂停当前 `AudioContext`，保留已排程 PCM；`resume()` 继续播放。
- `stop()` / `cancel()` 立即停止并清空队列；`end()` 播完剩余 buffer 后淡出。
- 新一轮聊天发送前必须主动 `stop()` 当前实时朗读，避免上一轮尚未播完的 PCM 队列继续出声。

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
  - session 结束后用完整 assistant 文本和实际使用的策略、provider、model、voice、PCM 参数生成 cache id。
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
- [x] 明确 PCM 播放器和 Provider 自动策略的职责边界。
- [x] `SpriteSpeakConfig` 增加 `realtimeSpeech`。
- [x] `SpeakConfigStore` 增加默认值迁移。
- [x] 设置页增加开关、scope 和 PCM 参数。

### Phase 2：sprite 实时语音会话 API

- [x] `SpeakService` 新增 `startRealtimeSession()`。
- [x] 增加 session 输入队列，支持 `appendText()`、`flush()`、`finish()`、`cancel()`。
- [x] 新增 sprite IPC/preload handle。
- [x] Main 侧通过 `speechSynthesisExecutor.stream()` 调用 Provider。
- [x] Main 侧支持 `duplex-stream/websocket`、`output-stream/http-stream`、`complete/http` 的自动候选和未出音频前降级。
- [x] 每个 scope 限制一个活跃 session。

### Phase 3：PCM 播放器

- [x] 新增 `PcmStreamPlayer`。
- [x] 支持 `s16le` mono PCM。
- [x] 支持 start buffer、取消、自然结束。
- [x] 支持暂停、恢复、强制停止，并在新一轮聊天发送前清空旧 PCM 队列。
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

- [x] Provider 不支持 WebSocket 时可降级到 HTTP 流式或 HTTP 完整合成。
- [ ] Provider 不支持任何 PCM 朗读策略时设置页禁用开关。
- [ ] AudioContext 未解锁时给出设置页或 toast 提示。
- [ ] 增加 underrun、首包耗时、播放延迟日志。
- [x] 增加 usage metadata：`sourceType=sprite_chat_realtime_speech`。
- [x] 增加最小回归测试。
- [ ] 升级为 AudioWorklet ring buffer 播放器。

## 13. 验收标准

- 默认配置下，AI 聊天产生 delta 不会调用任何 TTS Provider。
- 用户开启“AI 回复实时朗读”后，assistant 正文 delta 能触发一个 Provider 语音 session，并按能力优先走 WS、再 HTTP 流式、再 HTTP 完整。
- 第一段 PCM `audio_delta` 到达后，renderer 不等待完整文件即可开始播放。
- `thinking_delta` 不被朗读。
- 开启实时朗读时，AI 开始/结束/错误提示、工具结果 `speech`、表情包发送结果不会触发普通 `sprite.speak()`；关闭实时朗读后这些入口保持原行为。
- 停止生成、页面卸载、会话切换会取消 TTS session 和 PCM 播放器。
- AI 回复尚未播完时发起下一轮提问，会先停止上一轮实时朗读和已排程 PCM，再开始新的实时会话。
- Provider 未配置或模型不支持任何可播放策略时，设置页禁用开关或启动失败，聊天页不会静默消耗额度。
- 普通 `sprite.speak()` 的缓存和播放行为不受影响。
- TypeScript 通过，覆盖配置迁移、开关默认关闭、文本分片、session 取消和 PCM 解码单测。

## 14. 风险与处理

| 风险 | 处理 |
| --- | --- |
| TTS 比 LLM delta 慢，播放延迟明显 | 文本缓冲器按标点和时间 flush，播放器使用小 start buffer |
| Provider 返回格式不是 PCM | 第一版拒绝实时播放并报错，后续增加解码路径 |
| sample rate 与 AudioContext 不一致 | 播放器内做线性重采样 |
| 聊天取消后流式连接未关闭 | session cancel 必须关闭输入队列、AbortController、播放器 |
| 自动朗读造成费用浪费 | 默认关闭，且仅 assistant 正文触发 |
| 多个聊天窗口同时朗读 | 按 scope 限制并发，后开始的 session 取消同 scope 旧 session |
