import fs from 'node:fs';
import path from 'node:path';

import Mustache from 'mustache';

import { getResourcePath } from '../../electron/main/utils/resources-path';
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
export type AllModels =
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

export function getModelConfig(data: { model: AllModels; modelDir: string; cpu_numThreads?: number; language?: string }): any {
  console.log(data);
  const modelDir = data.modelDir;

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
    ...commonConfig
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
    case 'sherpa-onnx-streaming-zipformer-bilingual-zh-en-2023-02-20':
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
        ...commonConfig
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
        }
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
        }
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
        }
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
        }
      };
  }
}

export function punctuationModelConfig(data: { model: AllModels; modelDir: string; cpu_numThreads?: number }): any {
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
