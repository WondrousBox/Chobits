import type { ProviderModelDefinition } from '../../model-types';

// chobits-chi-tts 自托管 TTS 服务（OpenAI 兼容 /v1/audio/speech）
// 声线由服务端按 voice 管理（当前仅 chi），模型标识与服务端 /v1/models 返回一致
// 流式：服务端 wav 走 chunked 流式返回（WAV 头 + PCM 裸流），provider 剥头后按 PCM 边收边发

const gptSovitsSpeechModels: ProviderModelDefinition[] = [
  {
    description: '小叽（Chi）声线克隆模型（日语），声线由服务端 voice 管理。',
    displayName: 'Chi TTS',
    enabled: true,
    id: 'chi-tts',
    speechSynthesis: {
      // complete 返回完整 wav；流式播放时输出 pcm（provider 剥掉 WAV 头）
      audioFormats: ['wav', 'pcm'],
      modes: ['complete', 'output-stream'],
      transports: ['http', 'http-stream']
    },
    tags: ['speech', 'tts', 'voice-clone'],
    type: 'tts'
  }
];

export default gptSovitsSpeechModels;
