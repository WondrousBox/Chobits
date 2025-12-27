/* eslint-disable @typescript-eslint/explicit-function-return-type */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { pathToFileURL } from 'url';

// 动态导入 sherpa-onnx-node，支持开发环境和打包后的环境
let sherpa_onnx;

function log(text) {
  if (process.send) {
    process.send({
      event: 'log',
      data: '[child] ' + text
    });
  } else {
    console.log('[child]', text);
  }
}

// 尝试导入模块的辅助函数
async function tryImportModule(modulePath, possibleEntries = []) {
  // 优先尝试 sherpa-onnx.js，这是 ESM 模块的正确入口
  const entries = possibleEntries.length > 0 ? possibleEntries : ['/sherpa-onnx.js', '/index.js'];

  for (const entry of entries) {
    try {
      const fullPath = path.join(modulePath, entry);
      // 检查文件是否存在
      if (!fs.existsSync(fullPath)) {
        continue;
      }
      const moduleUrl = pathToFileURL(fullPath).href;
      const module = await import(moduleUrl);
      return { success: true, module, path: fullPath };
    } catch (e) {
      // 继续尝试下一个入口
      log(`[asr] Failed to import ${path.join(modulePath, entry)}: ${e.message}`);
    }
  }
  return { success: false };
}

try {
  if (process.env.SHERPA_ONNX_NODE_PATH) {
    // 使用环境变量传递的完整路径（打包后的环境）
    const modulePath = path.resolve(process.env.SHERPA_ONNX_NODE_PATH);
    log(`[asr] Loading sherpa-onnx-node from: ${modulePath}`);

    const result = await tryImportModule(modulePath);
    if (result.success) {
      // 处理 CommonJS 模块的 default 导出
      sherpa_onnx = result.module.default || result.module;
      log(`[asr] sherpa-onnx-node loaded successfully from: ${result.path}`);
    } else {
      throw new Error(`Failed to load sherpa-onnx-node from ${modulePath}`);
    }
  } else {
    // 开发环境：尝试从当前目录的 node_modules 导入
    try {
      log('[asr] Attempting to load sherpa-onnx-node from node_modules...');
      const imported = await import('sherpa-onnx-node');
      // 处理 CommonJS 模块的 default 导出
      sherpa_onnx = imported.default || imported;
      log('[asr] sherpa-onnx-node loaded successfully from node_modules');
    } catch (error) {
      log(`[asr] Failed to load from node_modules: ${error.message}`);
      // 如果失败，尝试从可能的路径导入
      const __filename = fileURLToPath(import.meta.url);
      const __dirname = path.dirname(__filename);
      const possiblePaths = [
        path.resolve(__dirname, '../../node_modules/sherpa-onnx-node'),
        path.resolve(__dirname, '../../../node_modules/sherpa-onnx-node'),
        path.resolve(process.cwd(), 'node_modules/sherpa-onnx-node')
      ];

      log(`[asr] Trying alternative paths: ${possiblePaths.join(', ')}`);
      let loaded = false;
      for (const modulePath of possiblePaths) {
        const result = await tryImportModule(modulePath);
        if (result.success) {
          // 处理 CommonJS 模块的 default 导出
          sherpa_onnx = result.module.default || result.module;
          log(`[asr] sherpa-onnx-node loaded successfully from: ${result.path}`);
          loaded = true;
          break;
        } else {
          log(`[asr] Failed to load from ${modulePath}`);
        }
      }

      if (!loaded) {
        throw new Error(`Cannot find sherpa-onnx-node module. Tried: ${possiblePaths.join(', ')}`);
      }
    }
  }
} catch (error) {
  log(`[asr] Fatal error loading sherpa-onnx-node: ${error.message}`);
  log(`[asr] Stack: ${error.stack}`);
  throw error;
}

let recognizer;
let vad;
let punctuation;
let buffer;

let segmentIndex = 0;
let duration = 0;
let printed = false;

const vadBufferSizeInSeconds = 60;
const bufferSizeInSeconds = 30;

function setupASR(config) {
  recognizer = new sherpa_onnx.OfflineRecognizer(config.modelConfig);

  if (config.punctuationModelConfig) {
    log('[asr] use punctuation');
    punctuation = new sherpa_onnx.OfflinePunctuation(config.punctuationModelConfig);
  }
  vad = new sherpa_onnx.Vad(config.vadConfig, vadBufferSizeInSeconds);
  buffer = new sherpa_onnx.CircularBuffer(bufferSizeInSeconds * vad.config.sampleRate);
  log('[asr] started');
  log(JSON.stringify(config.modelConfig, null, 2));
  console.log(config);

  process.send({
    event: 'started',
    data: config
  });
}

// 16kHz float32 samples
function sendData(samples) {
  const windowSize = vad.config.sileroVad.windowSize;
  buffer.push(samples);

  while (buffer.size() > windowSize) {
    // https://k2-fsa.github.io/sherpa/onnx/faqs/index.html#external-buffers-are-not-allowed
    // External buffers are not allowed

    // If you are using electron >= 21 and get the following error:
    // External buffers are not allowed
    // Then please set enableExternalBuffer to false.
    // Specifically,
    //   For reading wave files, please use sherpa_onnx.readWave(filename, false);, where the second argument false means to not use external buffers
    //   For VAD, please use vad.get(startIndex, n, false) and vad.front(false)
    //   For speaker identification, please use extractor.compute(stream, false)
    //   For TTS, please use:
    //   const audio = tts.generate({
    //     text: text,
    //     sid: 0,
    //     speed: 1.0,
    //     enableExternalBuffer: false,
    //   });
    const h = buffer.get(buffer.head(), windowSize, false); // enableExternalBuffer: false
    buffer.pop(windowSize);

    vad.acceptWaveform(h);

    // Calculate duration in seconds
    duration += Math.round((windowSize / recognizer.config.featConfig.sampleRate) * 1000);

    if (vad.isDetected() && !printed) {
      printed = true;
      process.send({
        event: 'asr:progress',
        data: {
          start: duration,
          end: duration,
          text: '',
          isEndpoint: false
        }
      });
    }

    if (!vad.isDetected()) {
      printed = false;
    }
  }

  while (!vad.isEmpty()) {
    const segment = vad.front(false); // enableExternalBuffer: false
    vad.pop();
    const stream = recognizer.createStream();

    stream.acceptWaveform({
      samples: segment.samples,
      sampleRate: recognizer.config.featConfig.sampleRate
    });
    recognizer.decode(stream);
    const r = recognizer.getResult(stream);
    if (r.text.length > 0) {
      const text = r.text.toLowerCase().trim();

      process.send({
        event: 'asr:progress',
        data: {
          start: (segment.start / vad.config.sampleRate) * 1000,
          end: ((segment.start + segment.samples.length) / vad.config.sampleRate) * 1000,
          text: punctuation ? punctuation.addPunct(text) : text,
          isEndpoint: true
        }
      });
      segmentIndex++;
    }
  }
}

function stopASR() {
  log('[asr] stopping');
  recognizer = undefined;
  vad = undefined;
  punctuation = undefined;
  buffer = undefined;

  segmentIndex = 0;
  duration = 0;
  printed = false;

  log('[asr] stopped');
}

process.on('message', (message) => {
  if (message.event === 'start') {
    log('[asr] start');
    setupASR(message.data);
  } else if (message.event === 'data') {
    sendData(new Float32Array(message.data.samples)); // 16kHz float32 samples
  } else if (message.event === 'stop') {
    log('[asr] stop');
    stopASR();
    process.exit();
  }
});
log('[asr] process initialized');
