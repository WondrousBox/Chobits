import type { ProviderModelDefinition } from '../../model-types';

// MiniMax Token Plan 套餐模型
// ref: https://platform.minimaxi.com/docs/token-plan/intro
// endpoint: https://api.minimaxi.com/v1

const minimaxChatModels: ProviderModelDefinition[] = [
  {
    abilities: {
      functionCall: true,
      reasoning: true,
      vision: true
    },
    contextWindowTokens: 1_000_000,
    description: 'MiniMax-M2.7 是 MiniMax 最新旗舰模型，兼容 OpenAI 和 Anthropic 接口协议，适用于代码助手、Agent 工具、AI IDE 等多种场景。',
    displayName: 'MiniMax-M2.7',
    enabled: true,
    id: 'MiniMax-M2.7',
    maxOutput: 65_536,
    pricing: {
      currency: 'CNY',
      units: [
        { name: 'textInput', rate: 0, strategy: 'fixed', unit: 'millionTokens' },
        { name: 'textOutput', rate: 0, strategy: 'fixed', unit: 'millionTokens' }
      ]
    },
    type: 'chat'
  },
  {
    abilities: {
      functionCall: true,
      reasoning: true,
      vision: true
    },
    contextWindowTokens: 1_000_000,
    description: 'MiniMax-M2.7-highspeed 是 M2.7 的极速版本，提供更快的推理速度，适合极速版订阅用户。',
    displayName: 'MiniMax-M2.7 Highspeed',
    enabled: true,
    id: 'MiniMax-M2.7-highspeed',
    maxOutput: 65_536,
    pricing: {
      currency: 'CNY',
      units: [
        { name: 'textInput', rate: 0, strategy: 'fixed', unit: 'millionTokens' },
        { name: 'textOutput', rate: 0, strategy: 'fixed', unit: 'millionTokens' }
      ]
    },
    type: 'chat'
  }
];

const minimaxMusicModels: ProviderModelDefinition[] = [
  {
    description: 'MiniMax 音乐生成模型，支持根据提示词和歌词生成完整音乐。',
    displayName: 'Music 2.6',
    enabled: true,
    id: 'music-2.6',
    tags: ['music', 'text-to-music'],
    type: 'text2music'
  },
  {
    description: 'MiniMax 音乐生成免费模型，适合低成本验证音乐生成链路。',
    displayName: 'Music 2.6 Free',
    enabled: true,
    free: true,
    id: 'music-2.6-free',
    tags: ['free', 'music', 'text-to-music'],
    type: 'text2music'
  },
  {
    description: 'MiniMax 翻唱/参考音频音乐模型，适合 cover 类生成。',
    displayName: 'Music Cover',
    enabled: true,
    id: 'music-cover',
    tags: ['cover', 'music'],
    type: 'text2music'
  },
  {
    description: 'MiniMax 翻唱/参考音频免费模型，适合验证 cover 类音乐生成。',
    displayName: 'Music Cover Free',
    enabled: true,
    free: true,
    id: 'music-cover-free',
    tags: ['cover', 'free', 'music'],
    type: 'text2music'
  }
];

const minimaxSpeechModels: ProviderModelDefinition[] = [
  {
    description: 'MiniMax 低延迟语音合成模型，支持 HTTP 非流式、HTTP 流式和 WebSocket 会话式 T2A。',
    displayName: 'Speech 2.8 Turbo',
    enabled: true,
    id: 'speech-2.8-turbo',
    speechSynthesis: {
      audioFormats: ['mp3', 'wav', 'flac', 'pcm'],
      maxTextChars: 10000,
      modes: ['complete', 'output-stream', 'duplex-stream'],
      outputFormats: ['hex', 'url'],
      recommendedStreamTextChars: 3000,
      supportsSubtitle: true,
      transports: ['http', 'http-stream', 'websocket']
    },
    tags: ['speech', 'tts', 'streaming'],
    type: 'tts'
  },
  {
    description: 'MiniMax 高质量语音合成模型，适合对音质要求更高的旁白和配音场景。',
    displayName: 'Speech 2.8 HD',
    enabled: true,
    id: 'speech-2.8-hd',
    speechSynthesis: {
      audioFormats: ['mp3', 'wav', 'flac', 'pcm'],
      maxTextChars: 10000,
      modes: ['complete', 'output-stream', 'duplex-stream'],
      outputFormats: ['hex', 'url'],
      recommendedStreamTextChars: 3000,
      supportsSubtitle: true,
      transports: ['http', 'http-stream', 'websocket']
    },
    tags: ['hd', 'speech', 'tts', 'streaming'],
    type: 'tts'
  }
];

export const allModels = [...minimaxChatModels, ...minimaxMusicModels, ...minimaxSpeechModels];

export default allModels;
