import path from 'path';
import sherpa_onnx from 'sherpa-onnx-node';
console.log(`version : ${sherpa_onnx.version}`);
console.log(`git sha1: ${sherpa_onnx.gitSha1}`);
console.log(`git date: ${sherpa_onnx.gitDate}`);

const modelPath = '';

// Please download test files from
// https://github.com/k2-fsa/sherpa-onnx/releases/tag/asr-models
const config = {
  featConfig: {
    sampleRate: 16000,
    featureDim: 80
  },
  modelConfig: {
    whisper: {
      encoder: path.join(modelPath, 'tiny.en-encoder.int8.onnx'),
      decoder: path.join(modelPath, 'tiny.en-decoder.int8.onnx')
    },
    tokens: path.join(modelPath, 'tiny.en-tokens.txt'),
    numThreads: 2,
    provider: 'cpu',
    debug: 1
  }
};

const recognizer = new sherpa_onnx.OfflineRecognizer(config);
console.log('Started');
const start = Date.now();
const stream = recognizer.createStream();
const wave = sherpa_onnx.readWave('H:\\AI\\whisper\\models\\sherpa-onnx-whisper-tiny.en\\test_wavs\\8k.wav');
stream.acceptWaveform({ sampleRate: wave.sampleRate, samples: wave.samples });

recognizer.decode(stream);
const result = recognizer.getResult(stream);
const stop = Date.now();
console.log('Done');

const elapsed_seconds = (stop - start) / 1000;
const duration = wave.samples.length / wave.sampleRate;
const real_time_factor = elapsed_seconds / duration;
console.log('Wave duration', duration.toFixed(3), 'seconds');
console.log('Elapsed', elapsed_seconds.toFixed(3), 'seconds');
console.log(`RTF = ${elapsed_seconds.toFixed(3)}/${duration.toFixed(3)} =`, real_time_factor.toFixed(3));
console.log('result\n', result);
