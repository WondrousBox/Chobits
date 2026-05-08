# AI Provider 音乐生成能力实施计划

更新时间：2026-05-08

## 1. 背景

当前 `packages/ai` 的 Provider 体系已经把聊天、向量、转写、图片生成等能力收敛到 `ProviderDefinition` / `ProviderService` / Pi runtime execution 链路中。音乐生成还没有成为一等能力：模型类型里虽然已经预留了 `text2music`，但 capability、默认模型、adapter、IPC、preload、workflow 与统计链路都还没有对应定义。

本计划目标是新增“音乐生成”的通用 Provider 调用方式，并优先接入 MiniMax 音乐模型，使 Coding Plan、Workflow 或后续工具调用都能稳定地完成音乐合成。

补充结论：音乐生成与 TTS 都属于“音频输出”，但不应合并成一个 `audioGeneration` 能力。二者应共享音频 artifact、落盘、缓存、播放和统计基础设施，但在 Provider capability 与请求语义上保持独立：

- `speechSynthesis`：文本到语音，核心是 voice、language、rate、pitch、SSML、timestamps、低延迟/批量合成。
- `musicGeneration`：文本/歌词/参考音频到音乐，核心是 prompt、lyrics、instrumental、duration、cover、loop、多候选和版权元数据。

## 2. 外部 API 调研摘要

| 服务商 / 平台 | 官方资料 | 调用形态 | 关键输入 | 输出形态 | 设计启示 |
| --- | --- | --- | --- | --- | --- |
| MiniMax | [Music Generation guide](https://platform.minimaxi.com/docs/guides/music-generation), [Music API reference](https://platform.minimaxi.com/docs/api-reference/music-intro), [Lyrics Generation](https://platform.minimaxi.com/docs/api-reference/lyrics-generation) | `POST /v1/music_generation`；歌词生成单独 endpoint | `model`, `prompt`, `lyrics`, `stream`, `output_format`, `audio_setting`, cover/reference audio 参数 | URL 或原始音频数据；可配音频格式 | 最适合首个内建实现；歌词生成应作为可选前置能力，不应绑死进核心生成接口 |
| Google Lyria | [Vertex AI Lyria model reference](https://cloud.google.com/vertex-ai/generative-ai/docs/model-reference/lyria-music-generation) | Vertex AI 预测接口 | prompt、negative prompt、seed、sample count 等 | base64 音频数据 | 通用接口需要支持 `negativePrompt`、`seed`、多候选输出 |
| ElevenLabs Music | [Music API](https://elevenlabs.io/music-api), [Music cookbook](https://elevenlabs.io/docs/cookbooks/music) | 专用 music API，支持分段/流式等音乐工作流 | prompt、vocal/instrumental、sections、format 等 | 音频文件 / 流式片段 | 不同 Provider 会暴露强音乐结构控制；核心字段应小，差异放 `extras` |
| Mubert | [Mubert API](https://mubert.com/api) | 生成 track / loop / stream | text、genre、mood、BPM、duration 等 | 音频 URL / 流 | 需要兼容背景音乐、循环音乐、长时长音乐 |
| Beatoven | [Beatoven API](https://www.beatoven.ai/api) | 商用背景音乐 API | prompt、mood、genre、duration、场景等 | 音频资产 | 面向视频/内容生产，资源落盘和授权元数据很重要 |
| Stability AI Stable Audio | [Stable Audio](https://stability.ai/stable-audio) | 音频生成 / audio-to-audio / inpainting | prompt、duration、参考音频、编辑区间等 | 音频文件 | 后续要预留 reference audio、audio editing、inpainting 扩展点 |
| fal / Replicate | [fal MiniMax Music](https://fal.ai/models/fal-ai/minimax-music/api), [fal model API](https://fal.ai/docs/model-api-reference) | 平台队列 / 模型托管 API | model-specific JSON | URL、base64、队列状态 | 第三方模型平台适合作为 plugin provider 或异步 job provider |
| OpenAI | [Text to speech](https://platform.openai.com/docs/guides/text-to-speech), [Speech to text](https://platform.openai.com/docs/guides/speech-to-text) | TTS/STT，不是公开音乐生成主链路 | text、voice、format；audio file | 语音音频 / 转写文本 | 不应把 TTS/STT 与音乐生成混为一个 `audio` capability |

结论：音乐生成和现有 `transcribe`、`imageGeneration` 都不同。它既可能是 text-to-music，也可能是 lyrics-to-song、instrumental、cover、reference-audio、loop、long-track、streaming 或 async job。因此应新增独立 capability：`musicGeneration`。

## 3. TTS API 调研摘要

| 服务商 / 平台 | 官方资料 | 调用形态 | 关键输入 | 输出形态 | 设计启示 |
| --- | --- | --- | --- | --- | --- |
| MiniMax | [同步语音合成 T2A](https://platform.minimaxi.com/docs/api-reference/speech-t2a-intro), [HTTP T2A](https://platform.minimaxi.com/docs/api-reference/speech-t2a-http), [API 概览](https://platform.minimaxi.com/docs/api-reference/api-overview) | `POST /v1/t2a_v2`；另有 WebSocket、异步长文本、音色复刻、音色设计 | `model`, `text`, `stream`, `voice_setting`, `pronunciation_dict`, `audio_setting`, `subtitle_enable` | 非流式返回 hex audio；流式返回音频片段；长文本返回异步任务/file | MiniMax 音乐和 TTS 可共用 provider secrets/baseUrl，但 endpoint 和响应完全不同 |
| OpenAI | [Text to speech](https://platform.openai.com/docs/guides/text-to-speech) | Audio speech endpoint / SDK | model、input text、voice、format；支持 streaming | 音频 bytes / stream | OpenAI 已有 `tts` 模型定义，但当前 AI provider 没有 speech synthesis capability |
| ElevenLabs | [Text to Speech API](https://elevenlabs.io/text-to-speech-api), [Create speech](https://elevenlabs.io/docs/api-reference/text-to-speech), [Docs overview](https://elevenlabs.io/docs/overview) | `POST /v1/text-to-speech/:voice_id`；支持 streaming、voice library、pronunciation dictionary | voice_id、text、model_id、language_code、voice_settings、dictionary、seed | MP3 默认，另有 PCM / μ-law 等；可流式 | voice 是一等资源，TTS request 必须有 voice 选择和 voice settings 扩展 |
| Google Cloud TTS | [Chirp 3 HD voices](https://cloud.google.com/text-to-speech/docs/chirp3-hd), [voices.list](https://cloud.google.com/text-to-speech/docs/reference/rest/v1/voices/list), [SSML](https://cloud.google.com/text-to-speech/docs/ssml) | REST/gRPC；online、streaming、batch | text/SSML、voice name、language_code、audio_config、timepoints | binary audio / base64 audio content；支持 MP3、LINEAR16、OGG_OPUS 等 | 需要支持 SSML、voice list、timepoints/timestamps |
| Azure AI Speech | [REST TTS](https://learn.microsoft.com/en-us/azure/ai-services/speech-service/rest-text-to-speech), [Batch synthesis](https://learn.microsoft.com/en-us/azure/cognitive-services/speech-service/batch-synthesis), [SSML voice controls](https://learn.microsoft.com/en-us/azure/ai-services/speech-service/speech-synthesis-markup-voice) | 区域化 REST endpoint；SDK；Batch synthesis | SSML、voice、style、role、rate、pitch、output format、region key | audio bytes；batch 返回 zip URL | 企业 TTS 常有 region、SSML、长文本 batch 和 voice style |
| Amazon Polly | [SynthesizeSpeech](https://docs.aws.amazon.com/polly/latest/dg/API_SynthesizeSpeech.html), [StartSpeechSynthesisTask](https://docs.aws.amazon.com/polly/latest/dg/API_StartSpeechSynthesisTask.html), [SSML](https://docs.aws.amazon.com/polly/latest/dg/ssml.html) | 同步 bytes；异步 S3 task | Engine、VoiceId、Text/TextType、OutputFormat、SampleRate、Lexicon、SpeechMarkTypes | audio stream；async 返回 S3 output URI | TTS 常需要 speech marks / 字幕时间戳；长文本走 job 模式 |
| Deepgram Aura | [REST TTS](https://developers.deepgram.com/docs/text-to-speech), [Streaming TTS](https://developers.deepgram.com/docs/streaming-text-to-speech) | REST bytes stream；WebSocket streaming | text、model voice、encoding/container、stream controls | audio stream；headers 含模型、字符数、request id | 实时 TTS 要支持边生成边播放、Flush/Close 控制 |
| Cartesia Sonic | [Realtime quickstart](https://docs.cartesia.ai/get-started/realtime-text-to-speech-quickstart), [WebSocket API](https://docs.cartesia.ai/api-reference/tts/websocket), [Docs overview](https://docs.cartesia.ai/) | WebSocket 为主，也支持实时上下文 | model_id、transcript、voice、language、context_id、output_format、timestamps | chunk/base64、done、timestamps、error events | 若以后做精灵实时说话，流式 TTS 要用独立事件协议，不适合塞进一次性 `generateMusic()` |

结论：TTS 与音乐生成的共同点是“产物都是音频”，但 Provider API 的控制面完全不同。TTS 需要 `speechSynthesis` capability，而不是复用 `musicGeneration`，也不应继续只挂在独立 `packages/tts` 的 Edge 引擎里。

## 4. 当前代码落点

已有基础：

- `packages/ai/providers/model-types.ts` 已有 `text2music` 模型类型。
- `packages/ai/providers/model-types.ts` 已有 `tts` 模型类型。
- `packages/ai/providers/service.ts` 已统一 Provider capability、默认模型、runtime model info。
- `packages/ai/runtime/pi/execution-service.ts` 已有 `embed()`、`transcribe()`、`generateImage()` 这类 one-shot 执行链路。
- `packages/workflow/nodes/image-generate.ts` 已经展示了“能力筛选 + 动态模型选择 + execution service 调用”的可复用模式。
- `packages/tts` 已有批量 TTS、缓存、去重、音频落盘、去静音、进度事件、字幕时间更新。
- `packages/sprite-core/speak` 已有精灵说话服务、缓存和播放回调。

缺失点：

- `ProviderCapabilityKey` 缺少 `musicGeneration`。
- `ProviderCapabilityKey` 缺少 `speechSynthesis`。
- `ProviderDefaultModels` 缺少 `musicGeneration`。
- `ProviderDefaultModels` 缺少 `speechSynthesis`。
- `ProviderAdapter` 缺少 `generateMusic()`。
- `ProviderAdapter` 缺少 `synthesizeSpeech()`。
- `AIApi`、IPC、preload 缺少 `generateMusic()`。
- `AIApi`、IPC、preload 缺少通用 `synthesizeSpeech()`。
- `ProviderModelSelect` 缺少 music/text2music 的默认模型映射和展示文案。
- `ProviderModelSelect` 当前把 `audio` 映射到 `defaults.transcribe`，这会混淆 STT 和 TTS。
- Plugin provider manifest validator/runtime 缺少音乐能力字段。
- Plugin provider manifest validator/runtime 缺少 TTS 能力字段。
- MiniMax 内建 provider 目前只有 chat 模型，未声明 `music-2.6` / `music-cover`。
- MiniMax 内建 provider 未声明 `speech-2.8-hd`、`speech-2.8-turbo` 等 TTS 模型。
- Workflow 和 Pi toolbox 没有音乐生成节点或工具入口。
- `packages/tts/batch-tts-service.ts` 的 `BatchTTSConfig.type` 虽预留 `OpenAI` / `Volc`，但当前实际只创建 `EdgeTTS`。

## 5. 推荐抽象

### 5.0 音频能力分层原则

建议将音频能力拆成三层：

1. Provider capability 层：
   - `transcribe`：音频到文本。
   - `speechSynthesis`：文本到语音。
   - `musicGeneration`：文本/歌词/参考音频到音乐。
2. Audio artifact 层：
   - 统一描述 `audioUrl` / `audioBase64` / `filePath` / `mimeType` / `durationMs` / `timestamps` / `metadata`。
   - 统一提供下载、hex/base64 解码、落盘、mime 推断、duration 探测。
3. 产品业务层：
   - 字幕配音、精灵说话、语音预览使用 `speechSynthesis`。
   - 背景音乐、歌曲、配乐生成使用 `musicGeneration`。
   - 两者共用缓存和播放器，但不共用请求体。

### 5.1 能力定义

新增 Provider capability：

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

新增默认模型：

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

模型类型继续使用已有 `text2music`，后续可按需补充 `music-cover`、`music-edit`、`text2audio` 等更细类型，但第一阶段不要扩太多。

TTS 模型类型继续使用已有 `tts`。不要把 `tts` 映射为 `audio`，否则会和 `stt` / `transcribe` 冲突。

### 5.2 通用音频产物

新增一个可复用的音频 artifact 类型，音乐生成与 TTS 都使用它：

```ts
export type GeneratedAudioArtifact = {
  audioUrl?: string;
  audioBase64?: string;
  filePath?: string;
  mimeType?: string;
  format?: string;
  durationMs?: number;
  sampleRate?: number;
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

### 5.3 音乐生成请求与响应

核心接口保持小而稳定，Provider 差异放入 `extras`：

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
  outputFormat?: 'mp3' | 'wav' | 'aac' | 'flac' | 'm4a' | string;
  extras?: Record<string, any>;
};

export type MusicGenerationResponse = {
  artifacts: GeneratedAudioArtifact[];
  model?: string;
  providerId?: string;
  usage?: TokenUsage;
  rawUsage?: unknown;
  rawResponse?: unknown;
};
```

为什么响应用 `artifacts[]`：

- Lyria / 部分平台支持多候选。
- MiniMax 可能返回单首，也可能后续扩展 stream/chunk。
- 平台型 provider 常返回 URL、base64、文件路径或 job 结果。

### 5.4 TTS 请求与响应

```ts
export type SpeechSynthesisRequest = ProviderScopedRequest & {
  model: string;
  text: string;
  voice?: string;
  voiceId?: string;
  language?: string;
  inputFormat?: 'text' | 'ssml' | string;
  outputFormat?: 'mp3' | 'wav' | 'aac' | 'flac' | 'pcm' | 'opus' | 'mulaw' | 'alaw' | string;
  sampleRate?: number;
  bitrate?: number;
  speed?: number;
  rate?: number;
  pitch?: number;
  volume?: number;
  emotion?: string;
  returnTimestamps?: boolean;
  stream?: boolean;
  extras?: Record<string, any>;
};

export type SpeechSynthesisResponse = {
  artifacts: GeneratedAudioArtifact[];
  model?: string;
  providerId?: string;
  voice?: string;
  voiceId?: string;
  usage?: TokenUsage;
  rawUsage?: unknown;
  rawResponse?: unknown;
};
```

TTS 的第一版应以非流式为主，但响应类型先保留 timestamps 和 stream 的扩展空间。流式 TTS 后续需要单独的事件协议，不建议直接复用当前 one-shot response。

### 5.5 Adapter 契约

```ts
export interface ProviderAdapter {
  // ...
  generateMusic?(req: MusicGenerationRequest, signal?: AbortSignal): Promise<MusicGenerationResponse>;
  synthesizeSpeech?(req: SpeechSynthesisRequest, signal?: AbortSignal): Promise<SpeechSynthesisResponse>;
}
```

音乐生成建议走 ProviderAdapter 方法，而不是像当前图片生成一样全部塞在一个 OpenAI-style service 里。原因是各家音乐 API 差异很大，MiniMax 也不是 OpenAI-compatible image API。

TTS 也建议走 ProviderAdapter 方法。现有 `packages/tts` 可以作为批量/缓存/字幕业务服务继续存在，但底层合成引擎应逐步从 `EdgeTTS` switch 改为调用 AI Provider 的 `synthesizeSpeech()`。

## 6. 分阶段实施

### Phase 0：当前状态与文档确认

目标：只确认边界，不改功能。

- 确认 MiniMax API Key / Base URL / 模型可用性。
- 确认生成结果是否需要自动落盘到 Resource 系统。
- 确认第一版只做非流式生成。
- 确认第一版是否需要歌词生成 endpoint。
- 确认 TTS 首版是否只接 MiniMax，还是同时接 OpenAI。
- 确认现有 `packages/tts` 是否继续作为字幕批量合成入口。

建议第一版范围：

- 必做：MiniMax `music-2.6` text/lyrics-to-song。
- 必做：MiniMax `speech-2.8-turbo` 或 `speech-2.8-hd` 非流式 TTS。
- 必做：输出 URL / hex/base64 归一化。
- 必做：生成结果可下载保存为本地音频文件。
- 可选：MiniMax lyrics generation。
- 暂缓：streaming、cover/reference audio、长任务队列 UI。

### Phase 1：通用 Provider 类型与能力

涉及文件：

- `packages/ai/types.ts`
- `packages/ai/providers/model-types.ts`
- `packages/ai/providers/service.ts`
- `packages/ai/providers/plugins/validator.ts`
- `packages/ai/providers/plugins/runtime.ts`
- `src/components/common/ProviderModelSelect.tsx`

任务：

- 增加 `musicGeneration` capability 和 default model。
- 增加 `speechSynthesis` capability 和 default model。
- 增加 `MusicGenerationRequest` / `MusicGenerationResponse`。
- 增加 `SpeechSynthesisRequest` / `SpeechSynthesisResponse`。
- 增加 `GeneratedAudioArtifact`，音乐与 TTS 共同复用。
- 给 `ProviderAdapter` 增加可选 `generateMusic()`。
- 给 `ProviderAdapter` 增加可选 `synthesizeSpeech()`。
- `getProviderCapabilities()`、`getProviderDefaultModels()` 支持 `musicGeneration`。
- `getProviderCapabilities()`、`getProviderDefaultModels()` 支持 `speechSynthesis`。
- `resolveRuntimeModelCapabilities()` 对 `type === 'text2music'` 输出 `music_generation: true`。
- `resolveRuntimeModelCapabilities()` 对 `type === 'tts'` 输出 `speech_synthesis: true`。
- Plugin provider manifest validator/runtime 支持声明音乐能力，但标准 driver 默认不支持，除非 module adapter 自己实现。
- Plugin provider manifest validator/runtime 支持声明 TTS 能力，但标准 driver 默认只在对应 driver 实现后开放。
- `ProviderModelSelect` 增加 `music` / `text2music` 的展示文案、颜色和默认模型映射。
- `ProviderModelSelect` 增加 `tts` 的展示文案、颜色和默认模型映射。

验收：

- Provider 列表能返回 `capabilities.musicGeneration`。
- Provider 列表能返回 `capabilities.speechSynthesis`。
- `listModels(providerId)` 能返回 `type: 'text2music'` 且带 `music_generation` capability。
- `listModels(providerId)` 能返回 `type: 'tts'` 且带 `speech_synthesis` capability。
- 不影响 chat/image/transcribe 现有能力。

### Phase 2：MiniMax 内建 Provider 接入

涉及文件：

- `packages/ai/providers/builtins/minimax/models.ts`
- `packages/ai/providers/builtins/minimax/definition.ts`
- `packages/ai/providers/minimax.ts`

任务：

- 在 MiniMax models 中新增：
  - `music-2.6`，`type: 'text2music'`
  - `music-cover`，可先标记为 `text2music` 或 `music-cover`，第一版 UI 只筛 `text2music`
  - `speech-2.8-turbo`，`type: 'tts'`
  - `speech-2.8-hd`，`type: 'tts'`
- MiniMax definition 增加：
  - `capabilities.musicGeneration = true`
  - `capabilities.speechSynthesis = true`
  - `defaults.models.musicGeneration = 'music-2.6'`
  - `defaults.models.speechSynthesis = 'speech-2.8-turbo'`
- 在 `MiniMaxProvider` 中实现 `generateMusic()`：
  - 合并 provider secrets 和 request extras secrets。
  - 默认 baseUrl 使用 `https://api.minimaxi.com` 或从当前 `baseUrl` 规整出 music endpoint。
  - 调用 `/v1/music_generation`。
  - 映射通用字段到 MiniMax 字段：`prompt`、`lyrics`、`model`、`output_format`、`audio_setting` 等。
  - 允许透传 `extras.minimax`，用于 `stream`、cover 参数、歌词优化等非通用字段。
  - 归一化 URL / hex / base64 输出。
- 在 `MiniMaxProvider` 中实现 `synthesizeSpeech()`：
  - 调用 `/v1/t2a_v2`。
  - 映射通用字段到 MiniMax 字段：`text`、`model`、`voice_setting`、`audio_setting`、`pronunciation_dict`、`subtitle_enable`。
  - 第一版固定 `stream: false`，返回 hex audio 后写入或转成 `audioBase64`。
  - 允许透传 `extras.minimax`，用于 emotion、timber_weights、language_boost、subtitle 等细项。
- 可选实现 `generateLyrics()` 不进入通用 ProviderAdapter，先作为 MiniMax provider 内部 helper 或 workflow 前置节点。

验收：

- MiniMax Provider 配置完成后，调用 `generateMusic()` 能返回至少一个 artifact。
- MiniMax Provider 配置完成后，调用 `synthesizeSpeech()` 能返回至少一个 artifact。
- URL 输出和 raw audio 输出都能归一化。
- API Key 缺失、HTTP 非 2xx、空结果都有明确错误。

### Phase 3：Pi execution、IPC 与 preload

涉及文件：

- `packages/ai/runtime/pi/execution-service.ts`
- `packages/ai/ipc-main.ts`
- `packages/ai/ipc-renderer.ts`
- `electron/preload/type.ts`
- `src/renderer.d.ts`
- 可能新增：`packages/ai/runtime/pi/music-generation-service.ts`

任务：

- 在 `PiExecutionService` 增加 `generateMusic(payload)`：
  - 解析 provider/preset/secrets。
  - 检查 `musicGeneration` capability 和 `provider.generateMusic`。
  - 注入 resolved secrets。
  - 记录 analytics usage。
- 在 `PiExecutionService` 增加 `synthesizeSpeech(payload)`：
  - 解析 provider/preset/secrets。
  - 检查 `speechSynthesis` capability 和 `provider.synthesizeSpeech`。
  - 注入 resolved secrets。
  - 记录 analytics usage。
- 增加 IPC：
  - `ai:generateMusic`
  - `ai:synthesizeSpeech`
  - `window.YUA.ai.generateMusic(payload)`
  - `window.YUA.ai.synthesizeSpeech(payload)`
- 统计字段建议：
  - `operationKey: 'generate_music'`
  - `sourceType: 'music_generation'`
  - `usageCategory: 'media'`
  - `usageFeature: 'music_generation'`
  - `usageStage: 'generate'`
- TTS 统计字段建议：
  - `operationKey: 'synthesize_speech'`
  - `sourceType: 'speech_synthesis'`
  - `usageCategory: 'media'`
  - `usageFeature: 'speech_synthesis'`
  - `usageStage: 'generate'`
- 如果 provider 没有 usage，先记录 provider_reported 空 usage + metadata。

验收：

- Renderer 能通过 `window.YUA.ai.generateMusic()` 调起 MiniMax。
- Renderer 能通过 `window.YUA.ai.synthesizeSpeech()` 调起 MiniMax。
- 失败时 analytics 记录 failed。
- 成功时 analytics 记录 completed，并包含 prompt chars、lyrics chars、duration、artifact count。
- TTS 成功时 analytics 记录 text chars、voice、format、duration、artifact count。

### Phase 4：音频 artifact 落盘与资源化

涉及位置需按现有 Resource / workflow 文件管理规则确认。

任务：

- 新增音频 artifact 归一化 helper：
  - URL：下载到本地临时/项目目录。
  - base64/hex：转成 Buffer 写入本地文件。
  - mime/format 推断扩展名。
- 第一版建议落在 workflow/resource project 目录，避免只返回可能过期的远程 URL。
- 这个 helper 同时服务 `generateMusic()` 和 `synthesizeSpeech()`。
- `packages/tts` 和 `packages/sprite-core/speak` 后续也应复用该 helper，减少重复的音频写盘、duration 探测逻辑。
- Workflow 节点输出同时给：
  - `audio`：本地文件路径或 URL
  - `audioUrl`：远程 URL（如果有）
  - `audioPath`：本地路径（如果已落盘）
  - `artifacts`：完整数组
- 后续可接 ResourceCreateNode，自动生成 audio resource。

验收：

- MiniMax 返回 URL 时，本地能得到可播放文件。
- MiniMax 返回原始音频数据时，本地能得到可播放文件。
- MiniMax TTS hex audio 能落盘为可播放音频。
- 文件名稳定且不会覆盖已有生成结果。

### Phase 5：Workflow / Coding Plan 可调用入口

涉及文件：

- `packages/workflow/nodes/ai-workflow-utils.ts`
- 新增：`packages/workflow/nodes/music-generate.ts`
- `packages/workflow/nodes/index.ts`
- 可选：`packages/ai/runtime/pi/tools/*`

任务：

- 新增 `audio/music-generate` 或 `music/music-generate` 节点。
- 新增 `audio/speech-synthesize` 或 `tts/speech-synthesize` 节点；如果不想扩大 UI，第一版可先让现有字幕 TTS 入口接 AI Provider。
- 动态配置复用 `getDynamicModelConfig()`：
  - `providerCapability: 'musicGeneration'`
  - `modelPredicate: model.type === 'text2music' || model.capabilities?.music_generation`
- TTS 动态配置：
  - `providerCapability: 'speechSynthesis'`
  - `modelPredicate: model.type === 'tts' || model.capabilities?.speech_synthesis`
- 节点输入：
  - `prompt`
  - 可选 `lyrics`
- 节点 config：
  - providerId
  - providerPresetId
  - model
  - mode
  - duration
  - outputFormat
  - instrumental
- 节点输出：
  - audio
  - audioPath
  - audioUrl
  - artifacts
- 如果 Coding Plan 主要通过 workflow 调用，优先让 workflow 节点可用。
- 如果需要 Pi agent 直接调用，则再加一个 `music-generate` tool，内部调用 `PiExecutionService.generateMusic()`。
- 如果需要 Pi agent 直接配音，则再加一个 `speech-synthesize` tool，内部调用 `PiExecutionService.synthesizeSpeech()`。

验收：

- Workflow Builder 能选择 MiniMax + music model。
- 节点执行后能得到可播放音频。
- TTS 入口能选择 MiniMax + tts model。
- 字幕批量 TTS 或独立 TTS workflow 能得到可播放音频。
- Coding Plan 能通过 workflow-run 或新增 tool 完成音乐合成。

### Phase 6：现有 TTS 系统迁移

目标：不要重写 `packages/tts`，而是把它从“内置 Edge 引擎”迁移成“批量编排 + 缓存 + 时间轴业务层”。

任务：

- 在 `BatchTTSConfig` 中增加 AI provider 字段：
  - `providerId`
  - `providerPresetId`
  - `model`
  - `voiceId`
  - `language`
  - `outputFormat`
- `createTTSInstance()` 从 switch Edge 改成：
  - `type === 'Edge'`：继续走当前 EdgeTTS。
  - `type === 'AIProvider'`：调用 `PiExecutionService.synthesizeSpeech()`。
- 缓存 key 增加 provider/model/voice/outputFormat，避免不同服务商同文本命中错误缓存。
- `SpriteSpeakConfig` 也预留 provider/model/voice 字段，使精灵说话可选用 AI Provider TTS。
- TTS 设置页从固定 Edge voice 列表逐步改成 provider/model/voice 三段式。

验收：

- 旧 Edge TTS 配置仍可用。
- 字幕 TTS track 能用 MiniMax TTS 合成。
- 精灵说话可继续使用 Edge，切到 AI Provider 时也能播放。

### Phase 7：体验补强与多 Provider 扩展

后续扩展：

- MiniMax lyrics generation 节点：`music/lyrics-generate`。
- MiniMax cover/reference audio。
- MiniMax async long-text TTS。
- OpenAI TTS provider adapter。
- ElevenLabs Music provider 或 plugin provider。
- ElevenLabs TTS provider adapter，支持 voice library。
- Google Lyria provider。
- Google Cloud TTS provider adapter，支持 SSML/timepoints。
- Azure Speech / Amazon Polly provider adapter，支持 batch/long-form。
- Deepgram / Cartesia streaming TTS provider adapter，用于实时精灵说话。
- fal / Replicate 平台型 provider，支持 async job。
- 支持 streaming progress。
- 支持多候选预览与选择。
- 支持授权/商业用途 metadata 展示。

## 7. 测试计划

单元测试：

- `ProviderCapabilities` 默认值包含 `musicGeneration: false`。
- `ProviderCapabilities` 默认值包含 `speechSynthesis: false`。
- MiniMax definition 暴露 `musicGeneration: true`。
- MiniMax definition 暴露 `speechSynthesis: true`。
- `listProviderRuntimeModels('minimax')` 返回 `music-2.6` 且 capability 包含 `music_generation`。
- `listProviderRuntimeModels('minimax')` 返回 TTS 模型且 capability 包含 `speech_synthesis`。
- Plugin validator 接受合法 `musicGeneration` 字段，拒绝非 boolean。
- Plugin validator 接受合法 `speechSynthesis` 字段，拒绝非 boolean。
- `ProviderModelSelect` 对 `modelTypes={['text2music']}` 能选择 `defaultModels.musicGeneration`。
- `ProviderModelSelect` 对 `modelTypes={['tts']}` 能选择 `defaultModels.speechSynthesis`。

Provider 测试：

- mock `fetch`，验证 MiniMax request body。
- mock URL output，验证 artifact 映射。
- mock hex/base64 output，验证 artifact 映射。
- mock 401/500/空 response，验证错误。
- mock MiniMax T2A hex output，验证 TTS artifact 映射。
- mock voice_setting / audio_setting / pronunciation_dict 透传。

Execution 测试：

- capability 缺失时报错。
- provider 未实现 `generateMusic` 时报错。
- provider 未实现 `synthesizeSpeech` 时报错。
- 成功/失败都记录 analytics。
- preset secrets 覆盖 provider secrets。

Workflow 测试：

- 动态配置只列出 `musicGeneration` provider。
- model 下拉只列 `text2music` / `music_generation` 模型。
- 节点执行返回 `audio` / `artifacts`。
- TTS 动态配置只列出 `speechSynthesis` provider。
- TTS 节点执行返回 `audio` / `artifacts` / timestamps。

手动验收：

- 使用 MiniMax API Key 生成一段 30-60 秒音乐。
- 使用 MiniMax API Key 合成一段 10-30 秒语音。
- 验证生成文件可在系统播放器或应用内音频预览播放。
- 验证断网、Key 错误、余额不足时错误信息可读。
- 验证旧 Edge TTS 不受影响。

## 8. 风险与约束

- Provider 差异大：不要把所有字段都塞入通用 request，差异字段放 `extras`。
- URL 可能过期：生成后应尽快落盘。
- 原始音频体积大：IPC 不宜长期传大 base64，优先 main process 落盘后返回 file path。
- Streaming/async job 复杂度高：第一版先做非流式同步调用。
- 版权与授权：不同服务商对商用、翻唱、参考音频有不同条款，metadata 中预留 license/source 字段。
- 内容安全：歌词、声音克隆、cover/reference audio 后续需要额外策略。
- TTS 有声音克隆、拟声、名人声音等合规风险，voice cloning / custom voice 不应默认开放到通用入口。
- 实时 TTS 与批量 TTS 的工程形态不同；不要为了实时语音牺牲字幕批量合成的稳定性。

## 9. 推荐第一版交付范围

第一版建议做 MiniMax 非流式音乐生成 + MiniMax 非流式 TTS，重点打通共享音频产物链路：

1. 通用 `musicGeneration` capability。
2. 通用 `speechSynthesis` capability。
3. 通用 `GeneratedAudioArtifact`。
4. 通用 `MusicGenerationRequest` / `MusicGenerationResponse`。
5. 通用 `SpeechSynthesisRequest` / `SpeechSynthesisResponse`。
6. MiniMax `music-2.6` 模型定义与 `generateMusic()`。
7. MiniMax `speech-2.8-turbo` / `speech-2.8-hd` 模型定义与 `synthesizeSpeech()`。
8. `PiExecutionService.generateMusic()`。
9. `PiExecutionService.synthesizeSpeech()`。
10. `window.YUA.ai.generateMusic()`。
11. `window.YUA.ai.synthesizeSpeech()`。
12. `music/music-generate` workflow 节点。
13. TTS 首版可先接入现有 `packages/tts` 批量合成入口，或新增一个轻量 `tts/speech-synthesize` workflow 节点。
14. 生成结果自动保存为本地音频文件。

暂不做：

- 多服务商接入。
- 流式音频。
- cover/reference audio。
- lyrics generation UI。
- async job queue UI。
- TTS voice cloning / voice design。

## 10. 文件变更清单预估

核心类型与 provider：

- `packages/ai/types.ts`
- `packages/ai/providers/model-types.ts`
- `packages/ai/providers/service.ts`
- `packages/ai/providers/plugins/validator.ts`
- `packages/ai/providers/plugins/runtime.ts`
- `packages/ai/providers/builtins/minimax/models.ts`
- `packages/ai/providers/builtins/minimax/definition.ts`
- `packages/ai/providers/minimax.ts`

执行链路：

- `packages/ai/runtime/pi/execution-service.ts`
- `packages/ai/ipc-main.ts`
- `packages/ai/ipc-renderer.ts`
- `electron/preload/type.ts`
- `src/renderer.d.ts`

UI / Workflow：

- `src/components/common/ProviderModelSelect.tsx`
- `packages/workflow/nodes/ai-workflow-utils.ts`
- `packages/workflow/nodes/music-generate.ts`
- `packages/workflow/nodes/speech-synthesize.ts`
- `packages/workflow/nodes/index.ts`
- `packages/tts/batch-tts-service.ts`
- `packages/tts/ipc-main.ts`
- `packages/tts/ipc-renderer.ts`
- `packages/sprite-core/speak/*`

测试：

- `test/provider-models.spec.ts`
- 新增 `test/music-generation-provider.spec.ts`
- 新增 `test/music-generation-execution.spec.ts`
- 新增 `test/music-generate-workflow.spec.ts`
- 新增 `test/speech-synthesis-provider.spec.ts`
- 新增 `test/speech-synthesis-execution.spec.ts`
- 新增或扩展 `packages/tts/batch-tts-service.test.ts`

## 11. 后续决策点

实施前需要确认：

- MiniMax `baseUrl` 字段是否继续配置为 `https://api.minimaxi.com/v1`，还是为音乐生成独立规整到 `https://api.minimaxi.com`。
- 生成音频是否默认创建 Resource，还是仅返回 workflow output。
- Coding Plan 首版是通过 Workflow 调用，还是需要新增 Pi tool。
- 是否把歌词生成作为同一 workflow 节点的可选前置步骤。
- TTS 首版是否只支持 MiniMax，还是同时接 OpenAI。
- 现有字幕批量 TTS 是否直接切入 AI Provider，还是先保留 Edge，新增独立 AI TTS 入口。
- TTS voice 列表是内建静态配置，还是通过 provider runtime 拉取。
- 音频 artifact 落盘路径是否统一到 resource project `data/audio-generation`，并与现有 `data/tts/<trackId>` 兼容。
