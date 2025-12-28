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
      data: '[vad-child] ' + text
    });
  } else {
    console.log('[vad-child]', text);
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
      log(`[vad] Failed to import ${path.join(modulePath, entry)}: ${e.message}`);
    }
  }
  return { success: false };
}

try {
  if (process.env.SHERPA_ONNX_NODE_PATH) {
    // 使用环境变量传递的完整路径（打包后的环境）
    const modulePath = path.resolve(process.env.SHERPA_ONNX_NODE_PATH);
    log(`[vad] Loading sherpa-onnx-node from: ${modulePath}`);

    const result = await tryImportModule(modulePath);
    if (result.success) {
      // 处理 CommonJS 模块的 default 导出
      sherpa_onnx = result.module.default || result.module;
      log(`[vad] sherpa-onnx-node loaded successfully from: ${result.path}`);
    } else {
      throw new Error(`Failed to load sherpa-onnx-node from ${modulePath}`);
    }
  } else {
    // 开发环境：尝试从当前目录的 node_modules 导入
    try {
      log('[vad] Attempting to load sherpa-onnx-node from node_modules...');
      const imported = await import('sherpa-onnx-node');
      // 处理 CommonJS 模块的 default 导出
      sherpa_onnx = imported.default || imported;
      log('[vad] sherpa-onnx-node loaded successfully from node_modules');
    } catch (error) {
      log(`[vad] Failed to load from node_modules: ${error.message}`);
      // 如果失败，尝试从可能的路径导入
      const __filename = fileURLToPath(import.meta.url);
      const __dirname = path.dirname(__filename);
      const possiblePaths = [
        path.resolve(__dirname, '../../node_modules/sherpa-onnx-node'),
        path.resolve(__dirname, '../../../node_modules/sherpa-onnx-node'),
        path.resolve(process.cwd(), 'node_modules/sherpa-onnx-node')
      ];

      log(`[vad] Trying alternative paths: ${possiblePaths.join(', ')}`);
      let loaded = false;
      for (const modulePath of possiblePaths) {
        const result = await tryImportModule(modulePath);
        if (result.success) {
          // 处理 CommonJS 模块的 default 导出
          sherpa_onnx = result.module.default || result.module;
          log(`[vad] sherpa-onnx-node loaded successfully from: ${result.path}`);
          loaded = true;
          break;
        } else {
          log(`[vad] Failed to load from ${modulePath}`);
        }
      }

      if (!loaded) {
        throw new Error(`Cannot find sherpa-onnx-node module. Tried: ${possiblePaths.join(', ')}`);
      }
    }
  }
} catch (error) {
  log(`[vad] Fatal error loading sherpa-onnx-node: ${error.message}`);
  log(`[vad] Stack: ${error.stack}`);
  throw error;
}

let vad;
let buffer;

const vadBufferSizeInSeconds = 60;
const bufferSizeInSeconds = 30;

function setupVAD(config) {
  vad = new sherpa_onnx.Vad(config.vadConfig, vadBufferSizeInSeconds);
  buffer = new sherpa_onnx.CircularBuffer(bufferSizeInSeconds * vad.config.sampleRate);
  log('[vad] started');

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
    const h = buffer.get(buffer.head(), windowSize, false); // enableExternalBuffer: false
    buffer.pop(windowSize);

    vad.acceptWaveform(h);
  }

  while (!vad.isEmpty()) {
    const segment = vad.front(false); // enableExternalBuffer: false
    vad.pop();

    // Send the audio segment back to parent
    // Convert Float32Array to regular array for JSON serialization
    process.send({
      event: 'vad:segment',
      data: {
        samples: Array.from(segment.samples),
        start: segment.start,
        // duration in seconds
        duration: segment.samples.length / vad.config.sampleRate
      }
    });
  }
}

function stopVAD() {
  log('[vad] stopping');
  vad = undefined;
  buffer = undefined;
  log('[vad] stopped');
}

process.on('message', (message) => {
  if (message.event === 'start') {
    log('[vad] start');
    setupVAD(message.data);
  } else if (message.event === 'data') {
    sendData(new Float32Array(message.data.samples)); // 16kHz float32 samples
  } else if (message.event === 'stop') {
    log('[vad] stop');
    stopVAD();
    process.exit();
  }
});
log('[vad] process initialized');
