import fs from 'node:fs';
import path from 'node:path';

import { cloneDeep } from 'lodash-es';

import { pluginResourceManager } from '../plugins';

export interface ModelType {
  label: string;
  value: string;
  size: string;
  description: string;
  disabled: boolean;
  downloadLink: string;
  speed: number;
  speedLabel: 'common.fast' | 'common.balance' | 'common.high quality';
  speedValue: 'fast' | 'balance' | 'quality';
  quality: number;
  download: boolean;
  lang: string;
  langLabel: string;
  provider: string;
  type: string;
  mode: 'online' | 'offline';
  punctuation: boolean;
  languages: string[];
  enableLanguages: boolean;
}

const SHERPA_MODELS = [
  {
    label: 'SenseVoice',
    value: 'sherpa-onnx-sense-voice-zh-en-ja-ko-yue-2024-07-17',
    size: '999 MB',
    description: '',
    disabled: true,
    downloadLink: 'https://model.memo.ac/sherpa-onnx-sense-voice-zh-en-ja-ko-yue-2024-07-17.tar.bz2',
    speed: 6,
    speedLabel: 'common.fast',
    speedValue: 'fast',
    quality: 2,
    download: false,
    lang: '',
    langLabel: '',
    sha: 'a6b38058add02df1decda0fe36ce08434df44fc4',
    provider: 'sherpa-onnx',
    type: 'asr',
    mode: 'offline',
    punctuation: true,
    languages: ['zh', 'en', 'ja', 'ko', 'yue'],
    enableLanguages: true
  },
  // {
  //   label: "Zipformer-small",
  //   value: "sherpa-onnx-streaming-zipformer-ctc-small-2024-03-18",
  //   size: "176 MB",
  //   description: "",
  //   disabled: true,
  //   downloadLink:
  //     "https://github.com/k2-fsa/sherpa-onnx/releases/download/asr-models/sherpa-onnx-streaming-zipformer-ctc-small-2024-03-18.tar.bz2",
  //   speed: 6,
  //   speedLabel: "common.fast",
  //   speedValue: "fast",
  //   quality: 2,
  //   download: false,
  //   lang: "",
  //   langLabel: "",
  //   sha: "3dee1055efec2f4375905b000ae0891744c41116",
  //   provider: "sherpa-onnx",
  //   type: "asr",
  //   mode: "online",
  // },
  {
    label: 'Paraformer-zh-en',
    value: 'sherpa-onnx-streaming-paraformer-bilingual-zh-en',
    size: '999 MB',
    description: '',
    disabled: true,
    downloadLink: 'https://model.memo.ac/sherpa-onnx-streaming-paraformer-bilingual-zh-en.tar.bz2',
    speed: 6,
    speedLabel: 'common.fast',
    speedValue: 'fast',
    quality: 2,
    download: false,
    lang: '',
    langLabel: '',
    sha: 'd3078d0e7802ee2add8d2aaaf64e0cc15ed61f2f',
    provider: 'sherpa-onnx',
    type: 'asr',
    mode: 'online',
    languages: ['zh', 'en']
  },
  {
    label: 'Zipformer-en',
    value: 'sherpa-onnx-streaming-zipformer-en-20M-2023-02-17',
    size: '122 MB',
    description: '',
    disabled: true,
    downloadLink: 'https://model.memo.ac/sherpa-onnx-streaming-zipformer-en-20M-2023-02-17.tar.bz2',
    speed: 6,
    speedLabel: 'common.fast',
    speedValue: 'fast',
    quality: 2,
    download: false,
    lang: '',
    langLabel: '',
    sha: 'b1bcb45f414d8d3e9a049bec6902d964f1b38f5d',
    provider: 'sherpa-onnx',
    type: 'asr',
    mode: 'online',
    languages: ['en']
  },
  // {
  //   label: "Zipformer-zh",
  //   value: "sherpa-onnx-streaming-zipformer-zh-14M-2023-02-23",
  //   size: "70.6 MB",
  //   description: "",
  //   disabled: true,
  //   downloadLink:
  //     "https://github.com/k2-fsa/sherpa-onnx/releases/download/asr-models/sherpa-onnx-streaming-zipformer-zh-14M-2023-02-23.tar.bz2",
  //   speed: 6,
  //   speedLabel: "common.fast",
  //   speedValue: "fast",
  //   quality: 2,
  //   download: false,
  //   lang: "",
  //   langLabel: "",
  //   sha: "5d73ab2a52f27ae27a4a152bfd8fbc32e612855c",
  //   provider: "sherpa-onnx",
  //   type: "asr",
  //   mode: "online",
  //   languages: ["zh"],
  // },
  // {
  //   label: "zipformer-zh-en",
  //   value: "sherpa-onnx-streaming-zipformer-bilingual-zh-en-2023-02-20",
  //   size: "488 MB",
  //   description: "",
  //   disabled: true,
  //   downloadLink:
  //     "https://github.com/k2-fsa/sherpa-onnx/releases/download/asr-models/sherpa-onnx-streaming-zipformer-bilingual-zh-en-2023-02-20.tar.bz2",
  //   speed: 6,
  //   speedLabel: "common.fast",
  //   speedValue: "fast",
  //   quality: 2,
  //   download: false,
  //   lang: "",
  //   langLabel: "",
  //   sha: "f7910e85b5cec8e9a356e71e8cc8d729d2c95202",
  //   provider: "sherpa-onnx",
  //   type: "asr",
  //   mode: "online",
  //   languages: ["zh", "en"],
  // },
  // {
  //   label: "Whisper-tiny.en",
  //   value: "sherpa-onnx-whisper-tiny.en",
  //   size: "113 MB",
  //   description: "",
  //   disabled: true,
  //   downloadLink:
  //     "https://github.com/k2-fsa/sherpa-onnx/releases/download/asr-models/sherpa-onnx-whisper-tiny.en.tar.bz2",
  //   speed: 6,
  //   speedLabel: "common.fast",
  //   speedValue: "fast",
  //   quality: 2,
  //   download: false,
  //   lang: "",
  //   langLabel: "",
  //   sha: "dd96886ef6efb72f7e86f45a1fb804cb481e6ae2",
  //   provider: "sherpa-onnx",
  //   type: "asr",
  //   mode: "offline",
  //   punctuation: true,
  //   languages: ["en"],
  // },
  // {
  //   label: "Whisper-tiny",
  //   value: "sherpa-onnx-whisper-tiny",
  //   size: "111 MB",
  //   description: "",
  //   disabled: true,
  //   downloadLink:
  //     "https://github.com/k2-fsa/sherpa-onnx/releases/download/asr-models/sherpa-onnx-whisper-tiny.tar.bz2",
  //   speed: 6,
  //   speedLabel: "common.fast",
  //   speedValue: "fast",
  //   quality: 2,
  //   download: false,
  //   lang: "",
  //   langLabel: "",
  //   sha: "6b79d8a065251a9656964a4af7780c63fa2ac4d4",
  //   provider: "sherpa-onnx",
  //   type: "asr",
  //   mode: "offline",
  //   punctuation: true,
  //   languages: ["multi"],
  // },
  {
    label: 'Whisper-base.en',
    value: 'sherpa-onnx-whisper-base.en',
    size: '199 MB',
    description: '',
    disabled: true,
    downloadLink: 'https://model.memo.ac/sherpa-onnx-whisper-base.en.tar.bz2',
    speed: 6,
    speedLabel: 'common.fast',
    speedValue: 'fast',
    quality: 2,
    download: false,
    lang: '',
    langLabel: '',
    sha: '9edb3b7c4d70a9f3977ed4527d7034e9ffb52329',
    provider: 'sherpa-onnx',
    type: 'asr',
    mode: 'offline',
    punctuation: true,
    languages: ['en']
  }
  // {
  //   label: "Whisper-base",
  //   value: "sherpa-onnx-whisper-base",
  //   size: "198 MB",
  //   description: "",
  //   disabled: true,
  //   downloadLink:
  //     "https://github.com/k2-fsa/sherpa-onnx/releases/download/asr-models/sherpa-onnx-whisper-base.tar.bz2",
  //   speed: 6,
  //   speedLabel: "common.fast",
  //   speedValue: "fast",
  //   quality: 2,
  //   download: false,
  //   lang: "",
  //   langLabel: "",
  //   sha: "9d8f4a54b84917f55a8d23ed0dde6b7f47b4c9b0",
  //   provider: "sherpa-onnx",
  //   type: "asr",
  //   mode: "offline",
  //   punctuation: true,
  //   languages: ["multi"],
  // }
];

export function checkModelsExist(models: ModelType[]): void {
  // 使用插件管理模块获取模型目录
  const modelPath = pluginResourceManager.getPluginResourceDir('plugin:sherpa-onnx', 'model');
  console.log('modelPath', modelPath);

  // 检查目录是否存在
  if (!fs.existsSync(modelPath)) {
    console.warn('模型目录不存在:', modelPath);
    return;
  }

  fs.readdirSync(modelPath).forEach((file) => {
    console.log('file', file);

    const model = models.find((m) => m.value === file);
    if (model) {
      model.disabled = false;
      model.download = true;
    }
  });
}

export function getDefaultSherpaModels(): ModelType[] {
  const models = cloneDeep(SHERPA_MODELS) as ModelType[];
  checkModelsExist(models);

  return models;
}
