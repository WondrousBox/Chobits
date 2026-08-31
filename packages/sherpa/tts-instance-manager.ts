import path from 'path';

import { getResourcePath } from '../common/utils';
import { pluginResourceManager } from '../plugins';
import ChildProcessManager from './child-process-manager';
import { getTTSModelConfig, TTSInstances, TTSModelConfig } from './common';
import { findSherpaOnnxNativeLibPath, findSherpaOnnxNodePath } from './utils';

const Ins: TTSInstances = {};

export interface CreateTTSInstanceOptions {
  uuid: string;
  model: string;
  numThreads?: number;
  maxNumSentences?: number;
}

export interface GenerateSpeechOptions {
  uuid: string;
  text: string;
  sid?: number;
  speed?: number;
  outputPath?: string;
  requestId: string;
}

export interface TTSResult {
  requestId: string;
  samples?: number[];
  sampleRate?: number;
  duration?: number;
  outputPath?: string;
  elapsedSeconds?: number;
  rtf?: number;
  error?: string;
}

export async function createTTSInstance(data: CreateTTSInstanceOptions): Promise<TTSInstances[string]> {
  console.log(`[TTS] create tts instance`, data);

  if (Ins[data.uuid]) {
    return Ins[data.uuid];
  }

  return new Promise((resolve, reject) => {
    const processPath = path.resolve(getResourcePath('sherpa')!, 'tts_process.js');
    console.log(`[TTS] process path:`, processPath);

    // 获取 sherpa-onnx-node 模块的路径
    const sherpaOnnxNodePath = findSherpaOnnxNodePath();
    if (!sherpaOnnxNodePath) {
      reject(new Error('Cannot find sherpa-onnx-node module'));
      return;
    }

    console.log(`[TTS] sherpaOnnxNodePath:`, sherpaOnnxNodePath);

    // 获取原生库路径并设置 DYLD_LIBRARY_PATH
    const nativeLibPath = findSherpaOnnxNativeLibPath();
    const env: NodeJS.ProcessEnv = {
      ...process.env,
      SHERPA_ONNX_NODE_PATH: sherpaOnnxNodePath
    };

    if (nativeLibPath) {
      console.log(`[TTS] Found native lib at:`, nativeLibPath);
      const existingDyldPath = process.env.DYLD_LIBRARY_PATH || '';
      env.DYLD_LIBRARY_PATH = existingDyldPath ? `${nativeLibPath}:${existingDyldPath}` : nativeLibPath;
    } else {
      console.warn(`[TTS] Warning: Could not find sherpa-onnx native library`);
    }

    const ttsProcess = new ChildProcessManager(processPath, {
      forkOptions: {
        env,
        stdio: ['pipe', 'pipe', 'pipe', 'ipc']
      }
    });

    ttsProcess.on('message', (res) => {
      if (res.event === 'started') {
        console.log(`[TTS] start complete`);
        resolve(Ins[data.uuid]);
      }
      if (res.event === 'tts:complete' || res.event === 'tts:error') {
        Ins[data.uuid]?.handler?.(res.data);
      }
      if (res.event === 'log') {
        console.log(res.data);
      }
    });

    ttsProcess.on('exit', (code) => {
      ttsProcess.stop();
      console.log(`[TTS] process exit: ${code}`);
    });

    if (!ttsProcess.exist()) {
      ttsProcess.start();

      // 使用插件管理模块获取模型目录
      const modelDir = pluginResourceManager.getPluginResourceDir('plugin:sherpa-onnx', 'model');

      const modelConfig: TTSModelConfig = getTTSModelConfig({
        model: data.model,
        modelDir: modelDir,
        numThreads: data.numThreads,
        maxNumSentences: data.maxNumSentences
      });

      console.log(`[TTS] model config:`, JSON.stringify(modelConfig, null, 2));

      ttsProcess.send({
        data: { modelConfig },
        event: 'start'
      });

      console.log(`[TTS] process created and sent start data`);
      Ins[data.uuid] = {
        process: ttsProcess,
        type: 'process'
      };
    } else {
      console.log(`[TTS] process already exists, cannot create new process`);
      reject(new Error(`[TTS] process already exists, cannot create new process`));
    }
  });
}

export function getTTSInstance(uuid: string): TTSInstances[string] | undefined {
  return Ins[uuid];
}

export function generateSpeech(options: GenerateSpeechOptions): void {
  const instance = Ins[options.uuid];
  if (!instance) {
    console.error(`[TTS] Instance ${options.uuid} not found`);
    return;
  }

  instance.process?.send({
    event: 'generate',
    data: {
      text: options.text,
      sid: options.sid ?? 0,
      speed: options.speed ?? 1.0,
      outputPath: options.outputPath,
      requestId: options.requestId
    }
  });
}

export function freeTTSInstance(uuid: string): void {
  Ins[uuid]?.process?.send({
    event: 'stop',
    data: {}
  });
  delete Ins[uuid];
}
