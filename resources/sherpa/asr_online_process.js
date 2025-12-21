/* eslint-disable @typescript-eslint/explicit-function-return-type */
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
  const entries = possibleEntries.length > 0 ? possibleEntries : ['', '/index.js', '/sherpa-onnx.js'];

  for (const entry of entries) {
    try {
      const fullPath = path.join(modulePath, entry);
      const moduleUrl = pathToFileURL(fullPath).href;
      const module = await import(moduleUrl);
      return { success: true, module, path: fullPath };
    } catch (e) {
      // 继续尝试下一个入口
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
      sherpa_onnx = result.module;
      log(`[asr] sherpa-onnx-node loaded successfully from: ${result.path}`);
    } else {
      throw new Error(`Failed to load sherpa-onnx-node from ${modulePath}`);
    }
  } else {
    // 开发环境：尝试从当前目录的 node_modules 导入
    try {
      log('[asr] Attempting to load sherpa-onnx-node from node_modules...');
      sherpa_onnx = await import('sherpa-onnx-node');
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
          sherpa_onnx = result.module;
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
let stream;
// let display;
let punctuation;

let segmentIndex = 0;
let duration = 0;
let lastText = '';

let useDuration = undefined;

function setupASR(config) {
  recognizer = new sherpa_onnx.OnlineRecognizer(config.modelConfig);

  if (config.punctuationModelConfig) {
    log('[asr] use punctuation');
    punctuation = new sherpa_onnx.Punctuation(config.punctuationModelConfig);
  }
  stream = recognizer.createStream();
  // display = new sherpa_onnx.Display(50);
  log('[asr] started');
  log(JSON.stringify(config.modelConfig, null, 2));
  process.send({
    event: 'started',
    data: config
  });
}

// 16kHz float32 samples
function sendData(samples) {
  // Calculate duration in seconds
  duration += Math.round((samples.length / recognizer.config.featConfig.sampleRate) * 1000);

  stream.acceptWaveform({ sampleRate: recognizer.config.featConfig.sampleRate, samples });

  while (recognizer.isReady(stream)) {
    recognizer.decode(stream);
  }

  const isEndpoint = recognizer.isEndpoint(stream);

  const result = recognizer.getResult(stream);

  if (isEndpoint) {
    if (result.text.length > 0) {
      const text = result.text.toLowerCase().trim();
      // display.print(segmentIndex, text);
      segmentIndex += 1;
      process.send({
        event: 'asr:progress',
        data: {
          start: useDuration !== undefined ? useDuration : result.start_time * 1000,
          end: duration,
          // timestamp: Math.round((result.timestamps[result.timestamps.length - 1] + result.start_time) * 1000),
          text: punctuation ? punctuation.addPunct(text) : text,
          isEndpoint
        }
      });
    }
    lastText = '';
    useDuration = undefined;
    recognizer.reset(stream);
  } else {
    if (result.text.length > 0) {
      if (result.timestamps.length === 0 && result.start_time === 0 && useDuration === undefined) {
        useDuration = duration;
      }
      const text = result.text.toLowerCase().trim();
      if (text !== lastText) {
        lastText = text;
        // display.print(segmentIndex, text);
        process.send({
          event: 'asr:progress',
          data: {
            start: useDuration !== undefined ? useDuration : result.start_time * 1000,
            end: duration,
            // timestamp: Math.round((result.timestamps[result.timestamps.length - 1] + result.start_time) * 1000),
            text,
            isEndpoint
          }
        });
      }
    }
  }
}

function stopASR() {
  log('[asr] stopping');
  recognizer.reset(stream);
  recognizer = undefined;
  stream = undefined;
  // display = undefined;
  punctuation = undefined;

  segmentIndex = 0;
  duration = 0;
  lastText = '';

  useDuration = undefined;

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
