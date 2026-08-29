import type { ProviderModelDefinition } from '../../model-types';

// GPT-SoVITS 自部署 TTS 服务（api_v2.py）
// 模型标识仅作缓存 key / 设置页展示用途，实际声线由服务端参考音频（ref_audio_path）决定

const gptSovitsSpeechModels: ProviderModelDefinition[] = [
  {
    description: '小叽（Chi）声线克隆模型（日语），需配合服务端参考音频使用。',
    displayName: 'Chi e10',
    enabled: true,
    id: 'chi-e10',
    speechSynthesis: {
      audioFormats: ['wav'],
      modes: ['complete'],
      transports: ['http']
    },
    tags: ['speech', 'tts', 'voice-clone'],
    type: 'tts'
  }
];

export default gptSovitsSpeechModels;
