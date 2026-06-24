# AI Provider 音频能力统一设计

更新时间：2026-06-23

## 1. 背景

`packages/ai` 的 Provider 体系已经统一了模型、密钥、预设、能力声明和运行时 adapter。音乐生成已经以 `musicGeneration` 的形式接入，MiniMax 是当前唯一内建实现。下一步要把 TTS 也纳入同一套 Provider 体系，同时保留以后接入 OpenAI、ElevenLabs、Google Cloud TTS、Azure、火山、腾讯、阿里、Cartesia、Deepgram 等服务商的空间。

本设计目标不是把所有音频能力合成一个大而泛的 `audioGeneration`。音乐生成、语音合成、语音转写的业务语义、模型选择和调用协议都不同，应该在 Provider capability 层分开声明，在 artifact、落盘、缓存、资源库和统计层共享基础设施。

## 2. 设计目标

- Provider 统一声明音频能力、默认模型、模型列表和运行时 adapter。
- 音乐生成和 TTS 共用音频 artifact、落盘、资源化、usage 统计。
- TTS 同时覆盖 HTTP 非流式、HTTP/SSE/chunk 流式、WebSocket 会话式、异步长文本任务。
- 通用上层 API 不暴露 MiniMax 的 `stream`、`task_start`、`task_continue` 等 provider 私有协议。
- Workflow、Pi tools、字幕 TTS、精灵说话后续都能复用同一套 `speechSynthesis` 能力。
- 插件 Provider 可以声明能力；标准 driver 未实现的能力必须由 module adapter 自己实现。

## 3. Capability 分层

Provider capability 使用语义能力，而不是媒体大类：

```ts
export type ProviderCapabilityKey =
  | 'chat'
  | 'modelListing'
  | 'embeddings'
  | 'transcribe'
  | 'imageGeneration'
  | 'musicGeneration'
  | 'speechSynthesis';
```

各能力边界：

| Capability | 输入 | 输出 | 典型场景 |
| --- | --- | --- | --- |
| `transcribe` | 音频 | 文本/字幕 | ASR、字幕转写 |
| `speechSynthesis` | 文本/SSML/文本流 | 人声音频 | 字幕配音、精灵说话、旁白、语音预览 |
| `musicGeneration` | prompt/歌词/参考音频 | 音乐音频 | 歌曲、配乐、纯音乐、翻唱 |

默认模型也按语义能力分开：

```ts
export type ProviderDefaultModels = {
  chat?: string;
  embeddings?: string;
  transcribe?: string;
  imageGeneration?: string;
  musicGeneration?: string;
  speechSynthesis?: string;
};
```

## 4. 模型类型与能力元数据

模型类型继续使用已有 `text2music` 和 `tts`：

- `text2music`：映射为 `capabilities.music_generation = true`。
- `tts`：映射为 `capabilities.speech_synthesis = true`。
- `stt`：映射为 `capabilities.transcribe = true` / `capabilities.asr = true`。

不要把 `tts` 和 `stt` 都折叠成 UI 选择语义里的 `audio`，否则默认模型会混到 `transcribe`，也不利于 workflow 精确筛选。

建议模型定义支持补充音频能力元数据：

```ts
export type SpeechSynthesisTransport =
  | 'http'
  | 'http-stream'
  | 'sse'
  | 'websocket'
  | 'webrtc'
  | 'async-job';

export type SpeechSynthesisModelMetadata = {
  transports: SpeechSynthesisTransport[];
  modes: Array<'complete' | 'output-stream' | 'duplex-stream' | 'async-job'>;
  outputFormats?: string[];
  audioFormats?: string[];
  maxTextChars?: number;
  recommendedStreamTextChars?: number;
  supportsTimestamps?: boolean;
  supportsSubtitle?: boolean;
  supportsVoiceClone?: boolean;
};
```

MiniMax TTS 模型示例：

```ts
{
  id: 'speech-2.8-turbo',
  displayName: 'Speech 2.8 Turbo',
  type: 'tts',
  tags: ['tts', 'speech', 'streaming'],
  capabilities: {
    speech_synthesis: true,
    speech_output_streaming: true,
    speech_duplex_streaming: true
  },
  speechSynthesis: {
    transports: ['http', 'http-stream', 'websocket'],
    modes: ['complete', 'output-stream', 'duplex-stream'],
    outputFormats: ['hex', 'url'],
    audioFormats: ['mp3', 'wav', 'flac', 'pcm'],
    maxTextChars: 10000,
    recommendedStreamTextChars: 3000,
    supportsSubtitle: true
  }
}
```

## 5. 通用音频 Artifact

音乐生成和 TTS 都返回音频 artifact。Provider adapter 只负责把服务商响应归一化，落盘和资源化由共用服务处理。

```ts
export type GeneratedAudioArtifact = {
  audioUrl?: string;
  audioBase64?: string;
  audioBuffer?: Buffer | ArrayBuffer;
  filePath?: string;
  mimeType?: string;
  format?: string;
  durationMs?: number;
  sampleRate?: number;
  bitrate?: number;
  channels?: number;
  sizeBytes?: number;
  title?: string;
  seed?: number;
  timestamps?: Array<{
    type: 'word' | 'sentence' | 'ssml_mark' | 'phoneme' | string;
    text?: string;
    startMs: number;
    endMs?: number;
  }>;
  metadata?: Record<string, any>;
};
```

共用落盘服务建议从当前 `PiMusicGenerationService` 扩展为 `PiAudioArtifactService`：

- 支持 URL 下载、data URL、base64、hex、Buffer。
- 支持流式 append writer，所有 `audio_delta` 追加到同一个文件。
- 统一推断 mime、扩展名、size、duration。
- 写入 workspace `.cache/audio-generation/<feature>` 或 workflow tmpDir。
- 返回去掉大 payload 的 artifact，避免 renderer 长期持有完整 base64。

## 6. 音乐生成接口

音乐生成接口保持小而稳定，差异字段放到 `extras.<providerId>`。`prompt`、`lyrics`、`mode`、`audioSetting`、`referenceAudioUrl` / `referenceAudioBase64` 这类跨服务商字段放在顶层；`stream`、歌词优化、cover feature id、provider 自有质量参数等放入 `extras.minimax`、`extras.suno`、`extras.<providerId>`。

```ts
export type MusicGenerationMode =
  | 'text-to-music'
  | 'lyrics-to-song'
  | 'instrumental'
  | 'cover';

export type MusicGenerationRequest = ProviderScopedRequest & {
  model: string;
  prompt: string;
  lyrics?: string;
  mode?: MusicGenerationMode;
  durationMs?: number;
  negativePrompt?: string;
  seed?: number;
  sampleCount?: number;
  outputFormat?: 'url' | 'hex' | string;
  audioSetting?: {
    sampleRate?: number;
    bitrate?: number;
    format?: string;
    channels?: number;
  };
  referenceAudioUrl?: string;
  referenceAudioBase64?: string;
  extras?: Record<string, any>;
};

export type MusicGenerationResponse = {
  artifacts: GeneratedAudioArtifact[];
  audioUrl?: string;
  audioBase64?: string;
  filePath?: string;
  model?: string;
  providerId?: string;
  usage?: TokenUsage;
  rawUsage?: unknown;
  rawResponse?: unknown;
};
```

Pi agent 工具入口遵循同一规则：

- `musicGenerateTool` 接收可选 `providerId`、`providerPresetId`、`model` 和 `providerOptions`。
- 解析顺序是：显式 `providerId` 优先；否则当前会话 provider 支持 `musicGeneration` 时沿用当前 provider；否则回落 `minimax`，保持旧调用兼容。
- 默认模型来自 `getProviderDefaultModels(providerId).musicGeneration`；MiniMax cover 模式兼容使用 `music-cover`。
- `providerOptions` 只合并到 `extras[providerId]`，不污染通用 `MusicGenerationRequest` 顶层字段。
- MiniMax 历史字段 `lyricsOptimizer`、`coverFeatureId`、`referenceAudioUrl`、`referenceAudioBase64` 仍兼容，同时镜像到 `extras.minimax`。
- MiniMax 非 cover、非纯音乐且没有 `lyrics` 时，adapter 会默认 `lyrics_optimizer: true`；显式传 `lyricsOptimizer: false` 时 adapter 会在本地报出“需要 lyrics / lyricsOptimizer / isInstrumental”的参数错误，避免把无效请求发到远端。

歌词生成属于音乐生成控制面的一部分。Provider adapter 可选实现 `generateLyrics()`；Pi `musicLyricsTool` 使用与 `musicGenerateTool` 相同的 provider 解析规则，差异参数通过 `providerOptions -> extras[providerId]` 传递。

## 7. TTS 运行模式与 Transport

TTS 的关键是分清用户语义和底层传输：

- `mode` 表示上层希望的运行形态。
- `transportPreference` 表示 adapter 选择底层协议时的偏好。
- provider 私有的 `stream`、`output_format`、SSE header、WebSocket task event 只出现在 adapter 内部或 `extras.<providerId>`。

```ts
export type SpeechSynthesisMode =
  | 'complete'
  | 'output-stream'
  | 'duplex-stream'
  | 'async-job';

export type SpeechSynthesisTransportPreference =
  | 'auto'
  | 'http'
  | 'http-stream'
  | 'sse'
  | 'websocket'
  | 'webrtc';
```

模式含义：

| Mode | 输入形态 | 输出形态 | 适合场景 |
| --- | --- | --- | --- |
| `complete` | 完整文本 | 完整音频 artifact | 字幕批量合成、缓存、稳定重试 |
| `output-stream` | 完整文本 | 音频分片输出 + 最终 artifact | 长文本边生成边播放 |
| `duplex-stream` | 文本分片输入 | 音频分片输出 + 最终 artifact | LLM token 流驱动实时说话 |
| `async-job` | 完整长文本 | job id / 轮询 / 文件 URL | 超长文本、批量任务 |

## 8. TTS 请求与响应

```ts
export type SpeechSynthesisRequest = ProviderScopedRequest & {
  model: string;
  text?: string;
  mode?: SpeechSynthesisMode;
  transportPreference?: SpeechSynthesisTransportPreference;
  voice?: string;
  voiceId?: string;
  language?: string;
  inputFormat?: 'text' | 'ssml' | string;
  outputFormat?: 'hex' | 'url' | 'mp3' | 'wav' | 'flac' | 'pcm' | 'opus' | string;
  audioSetting?: {
    format?: string;
    sampleRate?: number;
    bitrate?: number;
    channels?: number;
  };
  speed?: number;
  rate?: number;
  pitch?: number;
  volume?: number;
  emotion?: string;
  returnTimestamps?: boolean;
  subtitle?: {
    enabled?: boolean;
    type?: 'sentence' | 'word' | 'word_streaming' | string;
  };
  pronunciationDict?: Record<string, any>;
  extras?: Record<string, any>;
};

export type SpeechSynthesisResponse = {
  artifacts: GeneratedAudioArtifact[];
  audioUrl?: string;
  audioBase64?: string;
  filePath?: string;
  model?: string;
  providerId?: string;
  voice?: string;
  voiceId?: string;
  usage?: TokenUsage;
  rawUsage?: unknown;
  rawResponse?: unknown;
};
```

`complete` 可以通过 `synthesizeSpeech()` 返回。`output-stream` 和 `duplex-stream` 走事件协议，但最终仍返回 `SpeechSynthesisResponse`，用于缓存、资源化和统计。

## 9. 流式事件协议

流式事件屏蔽 HTTP chunk、SSE、WebSocket binary frame、WebRTC media stream 的差异。

```ts
export type SpeechSynthesisStreamEvent =
  | {
      type: 'started';
      data: {
        requestId?: string;
        providerRequestId?: string;
        mode?: SpeechSynthesisMode;
        transport?: string;
        format?: string;
        sampleRate?: number;
        channels?: number;
        sampleFormat?: 's16le' | 'f32le' | string;
      };
    }
  | {
      type: 'audio_delta';
      data: {
        chunk: ArrayBuffer | Buffer;
        format?: string;
        mimeType?: string;
        sampleRate?: number;
        channels?: number;
        sampleFormat?: 's16le' | 'f32le' | string;
        sequence?: number;
        isHeaderChunk?: boolean;
        encoding?: 'binary' | 'base64' | 'hex';
      };
    }
  | { type: 'text_delta'; data: { text?: string; timestamps?: GeneratedAudioArtifact['timestamps'] } }
  | { type: 'metadata'; data: Record<string, any> }
  | { type: 'completed'; data: SpeechSynthesisResponse }
  | { type: 'error'; data: { message: string; code?: string; cause?: any } }
  | { type: 'done' };

export type SpeechTextInputChunk =
  | { type: 'text'; text: string }
  | { type: 'flush' }
  | { type: 'close' };
```

规则：

- `audio_delta` 是同一个播放队列和同一个输出文件的连续内容，不能每帧生成独立资源。
- 对 wav/mp3 等带文件头的格式，需要保留 `isHeaderChunk`。
- 面向实时播放器的 PCM 流必须声明 `format: 'pcm'`、`sampleRate`、`channels` 和 `sampleFormat`。默认推荐 `s16le`、mono、`32000Hz`。
- Provider adapter 应尽量把 hex/base64 chunk 在 adapter 内归一为二进制 chunk；`encoding` 只作为调试或兼容信息，不应让业务播放器理解 provider 私有包格式。
- Main process 负责边收边写，renderer 只接收播放所需的小块事件。
- 取消请求必须关闭网络连接、文件句柄和 session。

## 10. Provider Adapter 契约

```ts
export interface ProviderAdapter {
  generateMusic?(req: MusicGenerationRequest, signal?: AbortSignal): Promise<MusicGenerationResponse>;

  synthesizeSpeech?(req: SpeechSynthesisRequest, signal?: AbortSignal): Promise<SpeechSynthesisResponse>;

  streamSpeechSynthesis?(
    req: SpeechSynthesisRequest,
    onEvent: (event: SpeechSynthesisStreamEvent) => void,
    signal?: AbortSignal,
    input?: AsyncIterable<SpeechTextInputChunk>
  ): Promise<SpeechSynthesisResponse>;
}
```

`synthesizeSpeech()` 可以内部调用 `streamSpeechSynthesis()` 并聚合音频，也可以直接走 HTTP 非流式。上层不关心 provider 的协议选择。

插件 Provider：

- 声明式 `openai/openai-compatible/anthropic/gemini/ollama` driver 默认不开放 `speechSynthesis` 和 `musicGeneration`，除非对应 driver 明确实现。
- `runtime.mode = module` 的插件可以返回完整 `ProviderAdapter`，自行实现 `generateMusic()`、`synthesizeSpeech()`、`streamSpeechSynthesis()`。
- manifest validator 允许声明能力，但 runtime 会对 driver unsupported capability 给 warning。

## 11. MiniMax 映射

MiniMax Token Plan 共享 `apiKey` 和 `baseUrl`，但音乐生成和 TTS endpoint 完全不同。

### 11.1 MiniMax 音乐生成

- HTTP endpoint：`POST /v1/music_generation`
- 通用 `model` 映射到 MiniMax `model`
- 通用 `prompt` 映射到 MiniMax `prompt`
- 通用 `lyrics` 映射到 MiniMax `lyrics`
- 通用 `audioSetting` 映射到 MiniMax `audio_setting`
- `extras.minimax` 透传 `lyrics_optimizer`、`is_instrumental`、cover/reference audio 等私有字段
- 输出 URL 或 hex，统一转为 `GeneratedAudioArtifact`

### 11.2 MiniMax HTTP T2A

官方 HTTP T2A endpoint：`POST /v1/t2a_v2`。

两种形态使用同一个 endpoint：

- 非流式：MiniMax `stream: false`，可用 `output_format: 'url' | 'hex'`。
- HTTP 流式：MiniMax `stream: true`，流式只支持 hex 音频片段，`output_format` 不应作为通用流式输出格式暴露。

通用字段映射：

| 通用字段 | MiniMax 字段 |
| --- | --- |
| `model` | `model` |
| `text` | `text` |
| `voiceId` / `voice` | `voice_setting.voice_id` |
| `speed` | `voice_setting.speed` |
| `volume` | `voice_setting.vol` |
| `pitch` | `voice_setting.pitch` |
| `emotion` | `voice_setting.emotion` 或 `extras.minimax.voice_setting.emotion` |
| `audioSetting.sampleRate` | `audio_setting.sample_rate` |
| `audioSetting.bitrate` | `audio_setting.bitrate` |
| `audioSetting.format` | `audio_setting.format` |
| `audioSetting.channels` | `audio_setting.channel` |
| `subtitle.enabled` | `subtitle_enable` |
| `subtitle.type` | `subtitle_type` |
| `pronunciationDict` | `pronunciation_dict` |
| `language` | `language_boost` |

Adapter routing：

```ts
if (req.mode === 'complete') {
  return synthesizeMiniMaxHttp({ stream: false });
}

if (req.mode === 'output-stream') {
  return streamMiniMaxHttp({ stream: true });
}

if (req.mode === 'duplex-stream') {
  return streamMiniMaxWebSocket();
}
```

`transportPreference: 'auto'` 时建议：

- 短文本且不要求低延迟：HTTP 非流式。
- 文本超过推荐阈值或用户要求边播：HTTP 流式。
- 需要分段输入：WebSocket。

### 11.3 MiniMax WebSocket T2A

官方 WebSocket endpoint：`WSS /ws/v1/t2a_v2`。

适合 `duplex-stream`：

1. 建立 WebSocket，携带 Authorization。
2. 等待 `connected_success`。
3. 发送 `task_start`，包含模型、音色、音频参数、字幕等配置。
4. 收到 `task_started`。
5. 每个 `SpeechTextInputChunk { type: 'text' }` 映射为 `task_continue`。
6. `flush` 映射为本地 `metadata` 事件，不透传 provider 私有语义。
7. `close` 或输入结束映射为 `task_finish`。
8. 服务端音频块统一发 `audio_delta`。
9. `task_finished` 映射为 `completed` + `done`。

实现要求：

- WebSocket 接收 loop 与输入 loop 并行运行，不能等所有输入结束后才处理音频。
- `task_failed` 或 `base_resp.status_code !== 0` 必须关闭会话并发 `error`。
- 最终仍聚合为 `SpeechSynthesisResponse`，复用音频 artifact 落盘服务。
- IPC stream handle 支持 `appendText(text)`、`flush()`、`finish()`、`cancel()`。

MiniMax WebSocket 私有事件不应透出到 workflow/UI；必要调试信息放到 `metadata`。

当前实现状态：

- `MiniMaxProvider.streamSpeechSynthesis()` 已支持 `mode: 'duplex-stream'` 或 `transportPreference: 'websocket'`。
- Renderer bridge `window.YUA.ai.streamSpeechSynthesis()` 已返回可持续输入的 stream handle。
- WebSocket 会话支持完整文本一次性输入，也支持 AsyncIterable / IPC 队列分段输入。

### 11.4 MiniMax 模型声明

MiniMax definition：

```ts
capabilities: {
  chat: true,
  embeddings: false,
  imageGeneration: false,
  modelListing: true,
  musicGeneration: true,
  speechSynthesis: true,
  transcribe: false
},
defaults: {
  models: {
    chat: 'MiniMax-M2.7',
    musicGeneration: 'music-2.6',
    speechSynthesis: 'speech-2.8-turbo'
  }
}
```

MiniMax models：

- `music-2.6` / `music-2.6-free`：`type: 'text2music'`
- `music-cover` / `music-cover-free`：`type: 'text2music'`
- `speech-2.8-turbo`：`type: 'tts'`
- `speech-2.8-hd`：`type: 'tts'`

## 12. Pi Execution、IPC 与 Workflow

Execution service：

- `generateMusic(payload)`：检查 `musicGeneration` 和 `provider.generateMusic`。
- `generateLyrics(payload)`：检查 `musicGeneration` 和 `provider.generateLyrics`，用于歌曲歌词生成/改写前置步骤。
- `synthesizeSpeech(payload)`：检查 `speechSynthesis` 和 `provider.synthesizeSpeech`。
- `streamSpeechSynthesis(payload, emit, input?)`：检查 `speechSynthesis` 和 `provider.streamSpeechSynthesis`，管理 requestId、AbortSignal、append writer、事件转发和最终 artifact。

IPC / preload：

- `ai:generateMusic` / `window.YUA.ai.generateMusic`
- `ai:synthesizeSpeech` / `window.YUA.ai.synthesizeSpeech`
- `ai:streamSpeechSynthesis` / `window.YUA.ai.streamSpeechSynthesis`
- `ai:appendSpeechSynthesisText`
- `ai:flushSpeechSynthesis`
- `ai:finishSpeechSynthesis`
- `ai:cancelSpeechSynthesis`

Workflow：

- `music/music-generate`
  - `providerCapability: 'musicGeneration'`
  - `modelPredicate: model.type === 'text2music' || model.capabilities?.music_generation`
- `audio/speech-synthesize`
  - `providerCapability: 'speechSynthesis'`
  - `modelPredicate: model.type === 'tts' || model.capabilities?.speech_synthesis`
  - `mode: complete | output-stream | duplex-stream`

`duplex-stream` 需要持续输入通道，普通批量 workflow 节点默认仍建议使用 `complete` 或 `output-stream`；精灵说话、voice session、实时旁白可以使用 stream handle 持续 `appendText()`。

Pi agent 工具：

- `musicGenerateTool`：构造通用 `MusicGenerationRequest`，调用 `PiExecutionService.generateMusic()`，由 execution 层完成 capability 校验、provider adapter 调用、音频落盘、usage 记录。
- `musicLyricsTool`：构造通用 `LyricsGenerationRequest`，调用 `PiExecutionService.generateLyrics()`，用于生成或改写歌词，并可将歌词保存为资源。

## 13. 现有 TTS 系统迁移

`packages/tts` 和 `packages/sprite-core/speak` 不需要被重写。它们应从“合成引擎实现者”逐步变成“业务编排层”：

- `packages/tts`：字幕批量合成、缓存、去静音、时间轴写回、重试。
- `packages/sprite-core/speak`：精灵说话缓存、播放控制、talk 动画触发、气泡展示。
- AI Provider TTS：底层合成引擎，由 `speechSynthesis` capability 提供。

角色说话的具体接入方案单独维护在 [角色说话接入 AI Provider 语音合成规划](../sprite-core/sprite-speech-provider-integration-plan.md)。当前已完成：设置页可选择 Edge / AI Provider；普通 `sprite.speak()` 固定调用 `complete/http` 并使用本地缓存；AI 聊天 delta 驱动的边合成边播放使用独立开关和 PCM 播放器，并按 provider/model capability 自动选择 `duplex-stream/websocket`、`output-stream/http-stream`、`complete/http`。实施计划见 [AI 对话实时语音合成与 PCM 播放实施计划](../sprite-core/sprite-realtime-chat-speech-plan.md)。

迁移策略：

1. 保留 Edge TTS，确保旧配置继续可用。
2. `BatchTTSConfig` 增加 `providerId`、`providerPresetId`、`model`、`voiceId`。
3. 字幕批量 TTS 默认使用 `mode: 'complete'`，保证 duration、缓存和重试稳定。
4. 精灵普通说话继续以完整文件和缓存为中心，并固定使用 `complete/http`；AI 聊天实时朗读默认关闭，开启后由系统按能力优先 WS、再 HTTP 流式、再 HTTP 完整合成。

## 14. Usage 与资源化

Analytics 建议：

| 能力 | operationKey | sourceType | usageFeature | metadata |
| --- | --- | --- | --- | --- |
| 音乐生成 | `generate_music` | `music_generation` | `music_generation` | prompt chars、lyrics chars、mode、duration、artifact count |
| 语音合成 | `synthesize_speech` | `speech_synthesis` | `speech_synthesis` | text chars、voice、format、mode、transport、duration、artifact count |

资源库保存：

- 音乐：`type: 'audio'`，`mediaKind: 'music'`，metadata 写 `musicGeneration`。
- 语音：`type: 'audio'`，`mediaKind: 'speech'`，metadata 写 `speechSynthesis`。

## 15. 分阶段实施

### Phase 1：Provider 类型与模型能力

- 增加 `speechSynthesis` capability 和 default model。
- 增加 `SpeechSynthesisRequest`、`SpeechSynthesisResponse`、`SpeechSynthesisStreamEvent`。
- `ProviderAdapter` 增加 `synthesizeSpeech()`、`streamSpeechSynthesis()`。
- `resolveRuntimeModelCapabilities()` 对 `tts` 输出 `speech_synthesis`。
- Plugin validator/runtime 支持 `speechSynthesis`，标准 driver 默认不支持。
- `ProviderModelSelect` 对 `modelTypes={['tts']}` 使用 `defaults.speechSynthesis`。

### Phase 2：MiniMax TTS complete + HTTP stream + WebSocket duplex

- MiniMax models 增加 TTS 模型。
- MiniMax definition 打开 `speechSynthesis`。
- 实现 HTTP 非流式 T2A：`mode: 'complete'`。
- 实现 HTTP 流式 T2A：`mode: 'output-stream'`。
- 实现 WebSocket 双向 T2A：`mode: 'duplex-stream'`。
- 支持 hex/url 归一化和落盘。

### Phase 3：Pi / IPC / workflow

- `PiExecutionService.synthesizeSpeech()`。
- `PiExecutionService.streamSpeechSynthesis()`。
- IPC/preload 暴露 TTS complete、HTTP stream 和 WebSocket duplex stream。
- Stream handle 支持 `appendText()`、`flush()`、`finish()`、`cancel()`。
- 新增 `audio/speech-synthesize` workflow 节点。

### Phase 4：业务迁移

- `packages/tts` 支持 AI Provider TTS。
- `sprite-core/speak` 已支持 AI Provider TTS；配置、UI、缓存和播放策略见 [角色说话接入 AI Provider 语音合成规划](../sprite-core/sprite-speech-provider-integration-plan.md)。
- 设置页从 Edge voice 列表扩展为 provider/model/voice。

### Phase 4.5：AI 聊天实时朗读

- `sprite-core/speak` 增加 `chatRealtimeSpeech` 配置，默认关闭。
- 新增 sprite 实时语音 session API，封装 Provider 自动策略输入队列，优先 `duplex-stream`，可降级到 `output-stream` 或 `complete`。
- Renderer 增加 PCM streaming player，消费 `audio_delta`。
- ChatPage 和 Resource AIChatSidebar 只把 assistant 正文 delta 送入 session。
- thinking、tool call、tool result 不进入实时朗读。
- 开启实时朗读时，聊天页和 sprite 事件层会屏蔽工具结果 `speech`、表情包辅助说话以及 AI 开始/结束/错误提示的普通 TTS；关闭实时朗读后保持原来的普通 `sprite.speak()` 行为。

### Phase 5：更多服务商

- OpenAI TTS HTTP / chunk streaming。
- ElevenLabs TTS + voice library。
- Google/Azure/Amazon 企业 TTS。
- Deepgram/Cartesia 实时 TTS。
- 火山/腾讯/阿里 WebSocket 或 SSE TTS。

## 16. 非目标与注意事项

- 不把 `speechSynthesis` 合并进 `musicGeneration`。
- 不把 provider 私有的 `stream` boolean 暴露为通用 API 的唯一流式语义。
- 不在第一版开放 voice cloning / voice design 到通用入口。
- 不让 renderer 持有大段 base64 音频。
- 不为了实时低延迟牺牲字幕批量 TTS 的缓存、duration 和重试稳定性。
