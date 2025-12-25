export const SHERPA_CONFIG = {
  'sherpa-onnx-sense-voice-zh-en-ja-ko-yue-2024-07-17': `{
    "featConfig": {
      "sampleRate": {{featConfig.sampleRate}},
      "featureDim": {{featConfig.featureDim}}
    },
    "modelConfig": {
      "senseVoice": {
        "model": "{{{modelConfig.modelDir}}}/{{modelConfig.model}}/model.int8.onnx",
        "useInverseTextNormalization": 1,
        "language": "{{modelConfig.language}}"
      },
      "tokens": "{{{modelConfig.modelDir}}}/{{modelConfig.model}}/tokens.txt",
      "numThreads": {{modelConfig.numThreads}},
      "provider": "{{modelConfig.provider}}",
      "debug": {{modelConfig.debug}}
    }
  }`,

  'sherpa-onnx-streaming-paraformer-bilingual-zh-en': `{
    "featConfig": {
      "sampleRate": {{featConfig.sampleRate}},
      "featureDim": {{featConfig.featureDim}}
    },
    "modelConfig": {
      "paraformer": {
        "encoder": "{{{modelConfig.modelDir}}}/{{modelConfig.model}}/encoder.int8.onnx",
        "decoder": "{{{modelConfig.modelDir}}}/{{modelConfig.model}}/decoder.int8.onnx"
      },
      "tokens": "{{{modelConfig.modelDir}}}/{{modelConfig.model}}/tokens.txt",
      "numThreads": {{modelConfig.numThreads}},
      "provider": "{{modelConfig.provider}}",
      "debug": {{modelConfig.debug}}
    },
    "decodingMethod": "{{decodingMethod}}",
    "maxActivePaths": {{maxActivePaths}},
    "enableEndpoint": {{enableEndpoint}},
    "rule1MinTrailingSilence": {{rule1MinTrailingSilence}},
    "rule2MinTrailingSilence": {{rule2MinTrailingSilence}},
    "rule3MinUtteranceLength": {{rule3MinUtteranceLength}}
  }`,

  'sherpa-onnx-streaming-zipformer-ctc-small-2024-03-18': `{
    "featConfig": {
      "sampleRate": {{featConfig.sampleRate}},
      "featureDim": {{featConfig.featureDim}}
    },
    "modelConfig": {
      "zipformer2Ctc": {
        "model": "{{{modelConfig.modelDir}}}/{{modelConfig.model}}/ctc-epoch-30-avg-3-chunk-16-left-128.int8.onnx"
      },
      "tokens": "{{{modelConfig.modelDir}}}/{{modelConfig.model}}/tokens.txt",
      "numThreads": {{modelConfig.numThreads}},
      "provider": "{{modelConfig.provider}}",
      "debug": {{modelConfig.debug}},
      "modelType": ""
    },
    "ctcFstDecoderConfig": {
      "graph": "{{{modelConfig.modelDir}}}/{{modelConfig.model}}/HLG.fst",
      "maxActive": 3000,
    }
  }`,

  'sherpa-onnx-streaming-zipformer-en-20M-2023-02-17': `{
      "featConfig": {
        "sampleRate": {{featConfig.sampleRate}},
        "featureDim": {{featConfig.featureDim}}
      },
      "modelConfig": {
        "transducer": {
          "encoder": "{{{modelConfig.modelDir}}}/{{modelConfig.model}}/encoder-epoch-99-avg-1.onnx",
          "decoder": "{{{modelConfig.modelDir}}}/{{modelConfig.model}}/decoder-epoch-99-avg-1.onnx",
          "joiner": "{{{modelConfig.modelDir}}}/{{modelConfig.model}}/joiner-epoch-99-avg-1.onnx"
        },
        "tokens": "{{{modelConfig.modelDir}}}/{{modelConfig.model}}/tokens.txt",
        "numThreads": {{modelConfig.numThreads}},
        "provider": "{{modelConfig.provider}}",
        "debug": {{modelConfig.debug}}
      },
      "decodingMethod": "{{decodingMethod}}",
      "maxActivePaths": {{maxActivePaths}},
      "enableEndpoint": {{enableEndpoint}},
      "rule1MinTrailingSilence": {{rule1MinTrailingSilence}},
      "rule2MinTrailingSilence": {{rule2MinTrailingSilence}},
      "rule3MinUtteranceLength": {{rule3MinUtteranceLength}}
    }`,

  'sherpa-onnx-whisper-base.en': `{
      "featConfig": {
        "sampleRate": {{featConfig.sampleRate}},
        "featureDim": {{featConfig.featureDim}}
      },
      "modelConfig": {
        "whisper": {
          "encoder": "{{{modelConfig.modelDir}}}/{{modelConfig.model}}/base.en-encoder.int8.onnx",
          "decoder": "{{{modelConfig.modelDir}}}/{{modelConfig.model}}/base.en-decoder.int8.onnx"
        },
        "tokens": "{{{modelConfig.modelDir}}}/{{modelConfig.model}}/base.en-tokens.txt",
        "numThreads": {{modelConfig.numThreads}},
        "provider": "{{modelConfig.provider}}",
        "debug": {{modelConfig.debug}}
      }
    }`
};
