import type { ProviderModelDefinition } from '../../model-types';

// MiniMax Token Plan 套餐模型
// ref: https://platform.minimaxi.com/docs/guides/text-generation
// endpoint: https://api.minimaxi.com/v1

const minimaxTextPricing: ProviderModelDefinition['pricing'] = {
  currency: 'CNY',
  units: [
    { name: 'textInput', rate: 0, strategy: 'fixed', unit: 'millionTokens' },
    { name: 'textOutput', rate: 0, strategy: 'fixed', unit: 'millionTokens' }
  ]
};

const minimaxChatModels: ProviderModelDefinition[] = [
  {
    abilities: {
      functionCall: true,
      reasoning: true,
      video: true,
      vision: true
    },
    contextWindowTokens: 1_000_000,
    displayName: 'MiniMax-M3',
    enabled: true,
    id: 'MiniMax-M3',
    maxOutput: 65_536,
    pricing: minimaxTextPricing,
    type: 'chat'
  },
  {
    abilities: {
      functionCall: true,
      reasoning: true
    },
    contextWindowTokens: 204_800,
    displayName: 'MiniMax-M2.7',
    enabled: true,
    id: 'MiniMax-M2.7',
    maxOutput: 65_536,
    pricing: minimaxTextPricing,
    type: 'chat'
  },
  {
    abilities: {
      functionCall: true,
      reasoning: true
    },
    contextWindowTokens: 204_800,
    displayName: 'MiniMax-M2.7 Highspeed',
    enabled: true,
    id: 'MiniMax-M2.7-highspeed',
    maxOutput: 65_536,
    pricing: minimaxTextPricing,
    type: 'chat'
  },
  {
    abilities: {
      functionCall: true,
      reasoning: true
    },
    contextWindowTokens: 204_800,
    displayName: 'MiniMax-M2.5',
    enabled: true,
    id: 'MiniMax-M2.5',
    maxOutput: 65_536,
    pricing: minimaxTextPricing,
    type: 'chat'
  },
  {
    abilities: {
      functionCall: true,
      reasoning: true
    },
    contextWindowTokens: 204_800,
    displayName: 'MiniMax-M2.5 Highspeed',
    enabled: true,
    id: 'MiniMax-M2.5-highspeed',
    maxOutput: 65_536,
    pricing: minimaxTextPricing,
    type: 'chat'
  },
  {
    abilities: {
      functionCall: true,
      reasoning: true
    },
    contextWindowTokens: 204_800,
    displayName: 'MiniMax-M2.1',
    enabled: true,
    id: 'MiniMax-M2.1',
    maxOutput: 65_536,
    pricing: minimaxTextPricing,
    type: 'chat'
  },
  {
    abilities: {
      functionCall: true,
      reasoning: true
    },
    contextWindowTokens: 204_800,
    displayName: 'MiniMax-M2.1 Highspeed',
    enabled: true,
    id: 'MiniMax-M2.1-highspeed',
    maxOutput: 65_536,
    pricing: minimaxTextPricing,
    type: 'chat'
  },
  {
    abilities: {
      functionCall: true,
      reasoning: true
    },
    contextWindowTokens: 204_800,
    displayName: 'MiniMax-M2',
    enabled: true,
    id: 'MiniMax-M2',
    maxOutput: 65_536,
    pricing: minimaxTextPricing,
    type: 'chat'
  },
  {
    contextWindowTokens: 65_536,
    displayName: 'M2-her',
    enabled: true,
    id: 'M2-her',
    pricing: minimaxTextPricing,
    type: 'chat'
  }
];

const minimaxMusicModels: ProviderModelDefinition[] = [
  {
    displayName: 'Music 2.6',
    enabled: true,
    id: 'music-2.6',
    tags: ['music', 'text-to-music'],
    type: 'text2music'
  },
  {
    displayName: 'Music 2.6 Free',
    enabled: true,
    free: true,
    id: 'music-2.6-free',
    tags: ['free', 'music', 'text-to-music'],
    type: 'text2music'
  },
  {
    displayName: 'Music Cover',
    enabled: true,
    id: 'music-cover',
    tags: ['cover', 'music'],
    type: 'text2music'
  },
  {
    displayName: 'Music Cover Free',
    enabled: true,
    free: true,
    id: 'music-cover-free',
    tags: ['cover', 'free', 'music'],
    type: 'text2music'
  }
];

const minimaxSpeech2RealtimePromptGuidance = [
  '一定要插入停顿和语气词标签，让语气自然。格式必须是标签后面跟文字',
  `停顿标签特征： <#秒数#>
注意：秒数范围从 0.01 到 99.99，最多两位小数，
例如 <#0.4#>。

语气词标签特征: (语气词英文)
注意：要完整包含英文括号和里面的单词，挑选符合语境的使用。
只能选择下面语气标签，一定不能改变和编造新的：
笑声(laughs)
轻笑(chuckle)
咳嗽(coughs)
清嗓子(clear-throat)
呻吟(groans)
正常换气(breath)
喘气(pant)
吸气(inhale)
呼气(exhale)
倒吸气(gasps)
吸鼻子(sniffs)
叹气(sighs)
喷鼻息(snorts)
打嗝(burps)
咂嘴(lip-smacking)
哼唱(humming)
嘶嘶声(hissing)
嗯(emm)
喷嚏(sneezes)`
].join('\n');

const minimaxSpeech2RealtimeDisplayTextFilter = {
  shouldCollapseWhitespace: true,
  id: 'minimax-speech2-realtime-tags',
  rules: [
    {
      pattern: '<#\\s*\\d+(?:\\.\\d{1,2})?\\s*#>',
      type: 'regex'
    },
    {
      flags: 'i',
      pattern: '\\((?:laughs|chuckle|coughs|clear-throat|groans|breath|pant|inhale|exhale|gasps|sniffs|sighs|snorts|burps|lip-smacking|humming|hissing|emm|sneezes)\\)',
      type: 'regex'
    }
  ],
  trim: true
};

const minimaxSpeechModels: ProviderModelDefinition[] = [
  {
    displayName: 'Speech 2.8 Turbo',
    enabled: true,
    id: 'speech-2.8-turbo',
    speechSynthesis: {
      audioFormats: ['mp3', 'wav', 'flac', 'pcm'],
      maxTextChars: 10000,
      modes: ['complete', 'output-stream', 'duplex-stream'],
      outputFormats: ['hex', 'url'],
      realtimeSpeechDisplayTextFilter: minimaxSpeech2RealtimeDisplayTextFilter,
      realtimeSpeechPromptGuidance: minimaxSpeech2RealtimePromptGuidance,
      recommendedStreamTextChars: 3000,
      supportsSubtitle: true,
      transports: ['http', 'http-stream', 'websocket']
    },
    tags: ['speech', 'tts', 'streaming'],
    type: 'tts'
  },
  {
    displayName: 'Speech 2.8 HD',
    enabled: true,
    id: 'speech-2.8-hd',
    speechSynthesis: {
      audioFormats: ['mp3', 'wav', 'flac', 'pcm'],
      maxTextChars: 10000,
      modes: ['complete', 'output-stream', 'duplex-stream'],
      outputFormats: ['hex', 'url'],
      realtimeSpeechDisplayTextFilter: minimaxSpeech2RealtimeDisplayTextFilter,
      realtimeSpeechPromptGuidance: minimaxSpeech2RealtimePromptGuidance,
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
