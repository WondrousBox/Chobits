import fs from 'node:fs';
import path from 'node:path';

import Mustache from 'mustache';

import { getResourcePath } from '../common/utils';
import ChildProcessManager from './child-process-manager';
import { SHERPA_CONFIG } from './sherpa-config';

export function getVadModel(): string {
  const modelPath = path.resolve(getResourcePath('sherpa')!, 'silero_vad.onnx');
  if (!fs.existsSync(modelPath)) {
    throw new Error(`VAD model not found at ${modelPath}`);
  }
  return modelPath;
}

// Please download test files from
// https://github.com/k2-fsa/sherpa-onnx/releases/tag/asr-models
export type SherpaModel =
  | 'sherpa-onnx-streaming-zipformer-bilingual-zh-en-2023-02-20'
  | 'sherpa-onnx-streaming-zipformer-en-20M-2023-02-17'
  | 'sherpa-onnx-streaming-zipformer-zh-14M-2023-02-23'
  | 'sherpa-onnx-whisper-tiny'
  | 'sherpa-onnx-whisper-base'
  | 'sherpa-onnx-whisper-small'
  | 'sherpa-onnx-whisper-medium'
  | 'sherpa-onnx-whisper-large-v1'
  | 'sherpa-onnx-whisper-large-v2'
  | 'sherpa-onnx-whisper-large-v3'
  | 'sherpa-onnx-whisper-tiny.en'
  | 'sherpa-onnx-whisper-base.en'
  | 'sherpa-onnx-whisper-small.en'
  | 'sherpa-onnx-whisper-medium.en'
  | 'sherpa-onnx-whisper-distil-small.en'
  | 'sherpa-onnx-whisper-distil-large-v2'
  | 'sherpa-onnx-whisper-distil-medium.en'
  | 'sherpa-onnx-whisper-turbo'
  | 'sherpa-onnx-whisper-medium-aishell'
  | 'sherpa-onnx-zipformer-multi-zh-hans-2023-9-2'
  | 'sherpa-onnx-zipformer-cantonese-2024-03-13'
  | 'sherpa-onnx-paraformer-zh-2024-03-09'
  | 'sherpa-onnx-paraformer-zh-small-2024-03-09'
  | 'sherpa-onnx-online-punct-en-2024-08-06'
  | 'sherpa-onnx-punct-ct-transformer-zh-en-vocab272727-2024-04-12-int8'
  | 'sherpa-onnx-punct-ct-transformer-zh-en-vocab272727-2024-04-12'
  | 'sherpa-onnx-zh-wenet-aishell'
  | 'sherpa-onnx-zh-wenet-aishell2'
  | 'sherpa-onnx-zh-wenet-wenetspeech'
  | 'sherpa-onnx-en-wenet-librispeech'
  | 'sherpa-onnx-en-wenet-gigaspeech'
  | 'sherpa-onnx-sense-voice-zh-en-ja-ko-yue-2024-07-17'
  | 'sherpa-onnx-streaming-paraformer-bilingual-zh-en'
  | 'sherpa-onnx-streaming-zipformer-ctc-small-2024-03-18'
  | 'sherpa-onnx-streaming-zipformer-ctc-multi-zh-hans-2023-12-13';

// 需要强制使用 online (streaming) 模式的模型列表
// 这些模型即使名称中没有 'streaming'，也应该使用流式识别
export const FORCE_ONLINE_MODELS: readonly SherpaModel[] = [
  // 'sherpa-onnx-en-wenet-gigaspeech',
  // 'sherpa-onnx-zh-wenet-wenetspeech',
  // 'sherpa-onnx-en-wenet-librispeech',
  // 'sherpa-onnx-zh-wenet-aishell2',
  // 'sherpa-onnx-zh-wenet-aishell'
] as const;

const featConfig = {
  sampleRate: 16000,
  featureDim: 80
};

const commonConfig = {
  // decodingMethod: 'modified_beam_search',
  decodingMethod: 'greedy_search',
  maxActivePaths: 4,
  enableEndpoint: true,
  rule1MinTrailingSilence: 2.4,
  rule2MinTrailingSilence: 1.2,
  rule3MinUtteranceLength: 20
};

export type CommonConfig = Partial<typeof commonConfig>;

export function getModelConfig(data: { model: SherpaModel; modelDir: string; cpu_numThreads?: number; language?: string; commonConfig?: CommonConfig }): any {
  console.log(data);
  const modelDir = data.modelDir;

  // 合并默认 commonConfig 和传入的 commonConfig
  const mergedCommonConfig = {
    ...commonConfig,
    ...(data.commonConfig || {})
  };

  const configData = {
    featConfig,
    modelConfig: {
      modelDir,
      model: data.model,
      numThreads: data.cpu_numThreads || 2,
      language: data.language || '',
      provider: 'cpu',
      debug: 1
    },
    ...mergedCommonConfig
  };

  let config = undefined;

  if (SHERPA_CONFIG[data.model]) {
    try {
      let str = SHERPA_CONFIG[data.model];
      str = Mustache.render(str, configData);
      str = str.replace(/\\/g, '/');
      console.log(str);
      config = JSON.parse(str);
    } catch (e) {
      console.error(e);
    }
  }

  if (config) {
    return config;
  }

  // Please download test files from
  // https://github.com/k2-fsa/sherpa-onnx/releases/tag/asr-models
  switch (data.model) {
    case 'sherpa-onnx-streaming-zipformer-en-20M-2023-02-17':
    case 'sherpa-onnx-streaming-zipformer-zh-14M-2023-02-23':
      return {
        featConfig,
        modelConfig: {
          transducer: {
            encoder: path.resolve(modelDir, data.model, 'encoder-epoch-99-avg-1.onnx'),
            decoder: path.resolve(modelDir, data.model, 'decoder-epoch-99-avg-1.onnx'),
            joiner: path.resolve(modelDir, data.model, 'joiner-epoch-99-avg-1.onnx')
          },
          tokens: path.resolve(modelDir, data.model, 'tokens.txt'),
          numThreads: data.cpu_numThreads || 2,
          provider: 'cpu',
          debug: 1
        },
        ...mergedCommonConfig
      };
    // whisper offline
    case 'sherpa-onnx-whisper-tiny':
    case 'sherpa-onnx-whisper-base':
    case 'sherpa-onnx-whisper-small':
    case 'sherpa-onnx-whisper-medium':
    case 'sherpa-onnx-whisper-large-v1':
    case 'sherpa-onnx-whisper-large-v2':
    case 'sherpa-onnx-whisper-large-v3':
    case 'sherpa-onnx-whisper-tiny.en':
    case 'sherpa-onnx-whisper-base.en':
    case 'sherpa-onnx-whisper-small.en':
    case 'sherpa-onnx-whisper-medium.en':
    case 'sherpa-onnx-whisper-distil-small.en':
    case 'sherpa-onnx-whisper-distil-large-v2':
    case 'sherpa-onnx-whisper-distil-medium.en':
    case 'sherpa-onnx-whisper-turbo':
    case 'sherpa-onnx-whisper-medium-aishell':
      return {
        featConfig,
        modelConfig: {
          whisper: {
            // "encoder": path.resolve(modelDir, data.model, `${data.model.replace("sherpa-onnx-whisper-", "")}-encoder.int8.onnx`),
            // "decoder": path.resolve(modelDir, data.model, `${data.model.replace("sherpa-onnx-whisper-", "")}-decoder.onnx`),
            encoder: path.resolve(modelDir, data.model, `${data.model.replace('sherpa-onnx-whisper-', '')}-encoder.int8.onnx`),
            decoder: path.resolve(modelDir, data.model, `${data.model.replace('sherpa-onnx-whisper-', '')}-decoder.int8.onnx`)
          },
          tokens: path.resolve(modelDir, data.model, `${data.model.replace('sherpa-onnx-whisper-', '')}-tokens.txt`),
          numThreads: data.cpu_numThreads || 2,
          provider: 'cpu',
          debug: 1
        },
        ...mergedCommonConfig
      };
    case 'sherpa-onnx-zipformer-multi-zh-hans-2023-9-2':
      return {
        featConfig,
        modelConfig: {
          transducer: {
            encoder: path.resolve(modelDir, data.model, 'encoder-epoch-20-avg-1.int8.onnx'),
            decoder: path.resolve(modelDir, data.model, 'decoder-epoch-20-avg-1.onnx'),
            joiner: path.resolve(modelDir, data.model, 'joiner-epoch-20-avg-1.int8.onnx')
          },
          tokens: path.resolve(modelDir, data.model, 'tokens.txt'),
          numThreads: data.cpu_numThreads || 2,
          provider: 'cpu',
          debug: 1
        },
        ...mergedCommonConfig
      };
    case 'sherpa-onnx-zipformer-cantonese-2024-03-13':
      return {
        featConfig,
        modelConfig: {
          transducer: {
            encoder: path.resolve(modelDir, data.model, 'encoder-epoch-45-avg-35.int8.onnx'),
            decoder: path.resolve(modelDir, data.model, 'decoder-epoch-45-avg-35.onnx'),
            joiner: path.resolve(modelDir, data.model, 'joiner-epoch-45-avg-35.int8.onnx')
          },
          tokens: path.resolve(modelDir, data.model, 'tokens.txt'),
          numThreads: data.cpu_numThreads || 2,
          provider: 'cpu',
          debug: 1
        },
        ...mergedCommonConfig
      };
    case 'sherpa-onnx-paraformer-zh-2024-03-09':
    case 'sherpa-onnx-paraformer-zh-small-2024-03-09':
      return {
        featConfig,
        modelConfig: {
          paraformer: {
            model: path.resolve(modelDir, data.model, 'model.int8.onnx')
          },
          tokens: path.resolve(modelDir, data.model, 'tokens.txt'),
          numThreads: data.cpu_numThreads || 2,
          provider: 'cpu',
          debug: 1
        },
        ...mergedCommonConfig
      };
  }
}

export function punctuationModelConfig(data: { model: SherpaModel; modelDir: string; cpu_numThreads?: number }): any {
  const modelDir = data.modelDir;

  // Please download test files from
  // https://github.com/k2-fsa/sherpa-onnx/releases/tag/punctuation-models
  switch (data.model) {
    case 'sherpa-onnx-online-punct-en-2024-08-06':
      return {
        model: {
          cnnBilstm: path.resolve(modelDir, data.model, 'model.onnx'),
          bpeVocab: path.resolve(modelDir, data.model, 'bpe.vocab'),
          debug: true,
          numThreads: 1,
          provider: 'cpu'
        }
      };
    case 'sherpa-onnx-punct-ct-transformer-zh-en-vocab272727-2024-04-12-int8':
      return {
        model: {
          ctTransformer: path.resolve(modelDir, data.model, 'model.int8.onnx'),
          debug: true,
          numThreads: 1,
          provider: 'cpu'
        }
      };
    case 'sherpa-onnx-punct-ct-transformer-zh-en-vocab272727-2024-04-12':
      return {
        model: {
          ctTransformer: path.resolve(modelDir, data.model, 'model.onnx'),
          debug: true,
          numThreads: 1,
          provider: 'cpu'
        }
      };
    default:
      return {
        model: {
          ctTransformer: path.resolve(modelDir, data.model, 'model.onnx'),
          debug: true,
          numThreads: 1,
          provider: 'cpu'
        }
      };
  }
}

export function vadModelConfig(): {
  sileroVad: { model: string; threshold: number; minSpeechDuration: number; minSilenceDuration: number; windowSize: number };
  sampleRate: number;
  debug: boolean;
  numThreads: number;
} {
  // please download silero_vad.onnx from
  // https://github.com/k2-fsa/sherpa-onnx/releases/download/asr-models/silero_vad.onnx
  const vadConfig = {
    sileroVad: {
      model: getVadModel(),
      threshold: 0.5,
      minSpeechDuration: 0.1,
      minSilenceDuration: 0,
      windowSize: 512
    },
    sampleRate: 16000,
    debug: true,
    numThreads: 1
  };

  return vadConfig;
}

export type StreamInstances = Record<
  string,
  {
    process: ChildProcessManager;
    type: 'process';
    handler?: (data: { start: number; end: number; text: string; isEndpoint: boolean }) => any;
  }
>;

// ==================== TTS 相关类型 ====================

export interface TTSModelConfig {
  model: {
    kokoro?: {
      model: string;
      voices: string;
      tokens: string;
      dataDir: string;
      lexicon?: string;
    };
    vits?: {
      model: string;
      tokens: string;
      dataDir?: string;
      lexicon?: string;
      dictDir?: string;
    };
    debug: boolean;
    numThreads: number;
    provider: string;
  };
  ruleFsts?: string;
  maxNumSentences: number;
}

export interface TTSInstances {
  [key: string]: {
    process: ChildProcessManager;
    type: 'process';
    handler?: (data: { requestId: string; samples?: number[]; sampleRate?: number; duration?: number; outputPath?: string; elapsedSeconds?: number; rtf?: number; error?: string }) => void;
  };
}

export function getTTSModelConfig(data: { model: string; modelDir: string; numThreads?: number; maxNumSentences?: number }): TTSModelConfig {
  const { model, modelDir, numThreads = 1, maxNumSentences = 1 } = data;
  const modelPath = path.resolve(modelDir, model);

  if (model.startsWith('kokoro-multi-lang') && !model.includes('int8')) {
    // 构建词典路径（包含美式英文、英式英文和中文）
    const lexiconUsEn = path.join(modelPath, 'lexicon-us-en.txt');
    const lexiconGbEn = path.join(modelPath, 'lexicon-gb-en.txt');
    const lexiconZh = path.join(modelPath, 'lexicon-zh.txt');

    // 检查文件是否存在，只添加存在的文件
    const lexicons: string[] = [];
    if (fs.existsSync(lexiconUsEn)) lexicons.push(lexiconUsEn);
    if (fs.existsSync(lexiconGbEn)) lexicons.push(lexiconGbEn);
    if (fs.existsSync(lexiconZh)) lexicons.push(lexiconZh);

    // 构建规则 FST 文件路径（中文音素、数字、日期）
    const ruleFsts: string[] = [];
    const phoneZh = path.join(modelPath, 'phone-zh.fst');
    const numberZh = path.join(modelPath, 'number-zh.fst');
    const dateZh = path.join(modelPath, 'date-zh.fst');

    if (fs.existsSync(phoneZh)) ruleFsts.push(phoneZh);
    if (fs.existsSync(numberZh)) ruleFsts.push(numberZh);
    if (fs.existsSync(dateZh)) ruleFsts.push(dateZh);

    return {
      model: {
        kokoro: {
          model: path.join(modelPath, 'model.onnx'),
          voices: path.join(modelPath, 'voices.bin'),
          tokens: path.join(modelPath, 'tokens.txt'),
          dataDir: path.join(modelPath, 'espeak-ng-data'),
          lexicon: lexicons.length > 0 ? lexicons.join(',') : undefined
        },
        debug: true,
        numThreads,
        provider: 'cpu'
      },
      ruleFsts: ruleFsts.length > 0 ? ruleFsts.join(',') : undefined,
      maxNumSentences
    };
  }

  if (model.startsWith('kokoro-int8-multi-lang')) {
    // 构建词典路径（包含美式英文、英式英文和中文）
    const lexiconUsEn = path.join(modelPath, 'lexicon-us-en.txt');
    const lexiconGbEn = path.join(modelPath, 'lexicon-gb-en.txt');
    const lexiconZh = path.join(modelPath, 'lexicon-zh.txt');

    // 检查文件是否存在，只添加存在的文件
    const lexicons: string[] = [];
    if (fs.existsSync(lexiconUsEn)) lexicons.push(lexiconUsEn);
    if (fs.existsSync(lexiconGbEn)) lexicons.push(lexiconGbEn);
    if (fs.existsSync(lexiconZh)) lexicons.push(lexiconZh);

    // 构建规则 FST 文件路径（中文音素、数字、日期）
    const ruleFsts: string[] = [];
    const phoneZh = path.join(modelPath, 'phone-zh.fst');
    const numberZh = path.join(modelPath, 'number-zh.fst');
    const dateZh = path.join(modelPath, 'date-zh.fst');

    if (fs.existsSync(phoneZh)) ruleFsts.push(phoneZh);
    if (fs.existsSync(numberZh)) ruleFsts.push(numberZh);
    if (fs.existsSync(dateZh)) ruleFsts.push(dateZh);

    return {
      model: {
        kokoro: {
          model: path.join(modelPath, 'model.int8.onnx'),
          voices: path.join(modelPath, 'voices.bin'),
          tokens: path.join(modelPath, 'tokens.txt'),
          dataDir: path.join(modelPath, 'espeak-ng-data'),
          lexicon: lexicons.length > 0 ? lexicons.join(',') : undefined
        },
        debug: true,
        numThreads,
        provider: 'cpu'
      },
      ruleFsts: ruleFsts.length > 0 ? ruleFsts.join(',') : undefined,
      maxNumSentences
    };
  }

  // Kokoro 单语言模型
  if (model.startsWith('kokoro-v1_0')) {
    const lang = model.includes('-zh') ? 'zh' : 'en';
    return {
      model: {
        kokoro: {
          model: path.join(modelPath, 'model.onnx'),
          voices: path.join(modelPath, 'voices.bin'),
          tokens: path.join(modelPath, 'tokens.txt'),
          dataDir: path.join(modelPath, 'espeak-ng-data'),
          lexicon: path.join(modelPath, `lexicon-${lang === 'zh' ? 'zh' : 'us-en'}.txt`)
        },
        debug: true,
        numThreads,
        provider: 'cpu'
      },
      maxNumSentences
    };
  }

  // VITS MeloTTS 模型
  if (model.includes('melo-tts')) {
    return {
      model: {
        vits: {
          model: path.join(modelPath, 'model.onnx'),
          tokens: path.join(modelPath, 'tokens.txt'),
          lexicon: path.join(modelPath, 'lexicon.txt'),
          dictDir: path.join(modelPath, 'dict')
        },
        debug: true,
        numThreads,
        provider: 'cpu'
      },
      maxNumSentences
    };
  }

  // VITS Piper 模型
  if (model.includes('piper')) {
    return {
      model: {
        vits: {
          model: path.join(modelPath, 'model.onnx'),
          tokens: path.join(modelPath, 'tokens.txt'),
          dataDir: path.join(modelPath, 'espeak-ng-data')
        },
        debug: true,
        numThreads,
        provider: 'cpu'
      },
      maxNumSentences
    };
  }

  // 通用 VITS 模型（默认）
  return {
    model: {
      vits: {
        model: path.join(modelPath, 'model.onnx'),
        tokens: path.join(modelPath, 'tokens.txt')
      },
      debug: true,
      numThreads,
      provider: 'cpu'
    },
    maxNumSentences
  };
}
