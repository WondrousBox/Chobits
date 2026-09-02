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
      data: '[tts] ' + text
    });
  } else {
    console.log('[tts]', text);
  }
}

// 尝试导入模块的辅助函数
async function tryImportModule(modulePath, possibleEntries = []) {
  const entries = possibleEntries.length > 0 ? possibleEntries : ['/sherpa-onnx.js', '/index.js'];

  for (const entry of entries) {
    try {
      const fullPath = path.join(modulePath, entry);
      if (!fs.existsSync(fullPath)) {
        continue;
      }
      const moduleUrl = pathToFileURL(fullPath).href;
      const module = await import(moduleUrl);
      return { success: true, module, path: fullPath };
    } catch (e) {
      log(`Failed to import ${path.join(modulePath, entry)}: ${e.message}`);
    }
  }
  return { success: false };
}

try {
  if (process.env.SHERPA_ONNX_NODE_PATH) {
    const modulePath = path.resolve(process.env.SHERPA_ONNX_NODE_PATH);
    log(`Loading sherpa-onnx-node from: ${modulePath}`);

    const result = await tryImportModule(modulePath);
    if (result.success) {
      sherpa_onnx = result.module.default || result.module;
      log(`sherpa-onnx-node loaded successfully from: ${result.path}`);
    } else {
      throw new Error(`Failed to load sherpa-onnx-node from ${modulePath}`);
    }
  } else {
    try {
      log('Attempting to load sherpa-onnx-node from node_modules...');
      const imported = await import('sherpa-onnx-node');
      sherpa_onnx = imported.default || imported;
      log('sherpa-onnx-node loaded successfully from node_modules');
    } catch (error) {
      log(`Failed to load from node_modules: ${error.message}`);
      const __filename = fileURLToPath(import.meta.url);
      const __dirname = path.dirname(__filename);
      const possiblePaths = [
        path.resolve(__dirname, '../../node_modules/sherpa-onnx-node'),
        path.resolve(__dirname, '../../../node_modules/sherpa-onnx-node'),
        path.resolve(process.cwd(), 'node_modules/sherpa-onnx-node')
      ];

      log(`Trying alternative paths: ${possiblePaths.join(', ')}`);
      let loaded = false;
      for (const modulePath of possiblePaths) {
        const result = await tryImportModule(modulePath);
        if (result.success) {
          sherpa_onnx = result.module.default || result.module;
          log(`sherpa-onnx-node loaded successfully from: ${result.path}`);
          loaded = true;
          break;
        } else {
          log(`Failed to load from ${modulePath}`);
        }
      }

      if (!loaded) {
        throw new Error(`Cannot find sherpa-onnx-node module. Tried: ${possiblePaths.join(', ')}`);
      }
    }
  }
} catch (error) {
  log(`Fatal error loading sherpa-onnx-node: ${error.message}`);
  log(`Stack: ${error.stack}`);
  throw error;
}

let tts;

/**
 * 初始化 TTS 实例
 * @param {Object} config - TTS 配置
 */
function setupTTS(config) {
  log('Setting up TTS with config:');
  log(JSON.stringify(config.modelConfig, null, 2));

  if (!sherpa_onnx.OfflineTts) {
    log('ERROR: OfflineTts is not available in sherpa_onnx');
    throw new Error('OfflineTts is not available in sherpa-onnx-node module');
  }

  tts = new sherpa_onnx.OfflineTts(config.modelConfig);

  log('TTS started');
  process.send({
    event: 'started',
    data: config
  });
}

/**
 * 生成语音
 * @param {Object} data - 生成配置
 * @param {string} data.text - 要转换的文本
 * @param {number} data.sid - 说话人 ID
 * @param {number} data.speed - 语速
 * @param {string} data.outputPath - 输出文件路径（可选）
 * @param {string} data.requestId - 请求 ID
 */
function generateSpeech(data) {
  const { text, sid = 0, speed = 1.0, outputPath, requestId } = data;

  log(`Generating speech for: "${text.substring(0, 50)}${text.length > 50 ? '...' : ''}"`);

  const startTime = Date.now();

  try {
    // For Electron >= 21, must set enableExternalBuffer to false
    // https://k2-fsa.github.io/sherpa/onnx/faqs/index.html#external-buffers-are-not-allowed
    const audio = tts.generate({ text, sid, speed, enableExternalBuffer: false });
    const endTime = Date.now();

    const duration = audio.samples.length / audio.sampleRate;
    const elapsedSeconds = (endTime - startTime) / 1000;
    const rtf = elapsedSeconds / duration;

    log(`Generated audio: duration=${duration.toFixed(3)}s, elapsed=${elapsedSeconds.toFixed(3)}s, RTF=${rtf.toFixed(3)}`);

    // 如果指定了输出路径，保存为 WAV 文件
    if (outputPath) {
      sherpa_onnx.writeWave(outputPath, { samples: audio.samples, sampleRate: audio.sampleRate });
      log(`Saved to ${outputPath}`);

      process.send({
        event: 'tts:complete',
        data: {
          requestId,
          outputPath,
          duration,
          sampleRate: audio.sampleRate,
          samplesCount: audio.samples.length,
          elapsedSeconds,
          rtf
        }
      });
    } else {
      // 返回音频数据（Float32Array 转为普通数组以便 IPC 传输）
      process.send({
        event: 'tts:complete',
        data: {
          requestId,
          samples: Array.from(audio.samples),
          sampleRate: audio.sampleRate,
          duration,
          elapsedSeconds,
          rtf
        }
      });
    }
  } catch (error) {
    log(`Error generating speech: ${error.message}`);
    process.send({
      event: 'tts:error',
      data: {
        requestId,
        error: error.message
      }
    });
  }
}

/**
 * 停止 TTS
 */
function stopTTS() {
  log('Stopping TTS');
  tts = undefined;
  log('TTS stopped');
}

process.on('message', (message) => {
  if (message.event === 'start') {
    log('Received start command');
    setupTTS(message.data);
  } else if (message.event === 'generate') {
    log('Received generate command');
    generateSpeech(message.data);
  } else if (message.event === 'stop') {
    log('Received stop command');
    stopTTS();
    process.exit();
  }
});

log('TTS process initialized');
