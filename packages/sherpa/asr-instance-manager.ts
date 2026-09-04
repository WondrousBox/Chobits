import path from 'path';

import { getResourcePath } from '../common/utils';
import { pluginResourceManager } from '../plugins';
import ChildProcessManager from './child-process-manager';
import { CommonConfig, getModelConfig, punctuationModelConfig, SherpaModel, StreamInstances, vadModelConfig } from './common';
import { findSherpaOnnxNativeLibPath, findSherpaOnnxNodePath } from './utils';

const Ins: StreamInstances = {};

export type ASRType = 'online' | 'offline' | 'vad';

export interface CreateInstanceOptions {
  uuid: string;
  model?: SherpaModel;
  punctuationModel?: string;
  language?: string;
  commonConfig?: CommonConfig;
  vad?: {
    threshold?: number;
    minSpeechDuration?: number;
    minSilenceDuration?: number;
    windowSize?: number;
  };
  type: ASRType;
}

export async function createASRInstance(data: CreateInstanceOptions): Promise<StreamInstances[string]> {
  if (Ins[data.uuid]) {
    return Ins[data.uuid];
  }

  return new Promise((resolve, reject) => {
    let scriptName = 'asr_offline_process.js';
    if (data.type === 'online') {
      scriptName = 'asr_online_process.js';
    } else if (data.type === 'vad') {
      scriptName = 'vad_process.js';
    }
    const processPath = path.resolve(getResourcePath('sherpa')!, scriptName);

    // 获取 sherpa-onnx-node 模块的路径
    const sherpaOnnxNodePath = findSherpaOnnxNodePath();
    if (!sherpaOnnxNodePath) {
      reject(new Error('Cannot find sherpa-onnx-node module'));
      return;
    }

    console.log(`[asr ${data.type}] sherpaOnnxNodePath:`, sherpaOnnxNodePath);

    // 获取原生库路径并设置 DYLD_LIBRARY_PATH
    const nativeLibPath = findSherpaOnnxNativeLibPath();
    const env: NodeJS.ProcessEnv = {
      ...process.env,
      SHERPA_ONNX_NODE_PATH: sherpaOnnxNodePath
    };

    if (nativeLibPath) {
      console.log(`[asr ${data.type}] Found native lib at:`, nativeLibPath);
      // 设置 DYLD_LIBRARY_PATH 以便找到原生库
      const existingDyldPath = process.env.DYLD_LIBRARY_PATH || '';
      env.DYLD_LIBRARY_PATH = existingDyldPath ? `${nativeLibPath}:${existingDyldPath}` : nativeLibPath;
    } else {
      console.warn(`[asr ${data.type}] Warning: Could not find sherpa-onnx-darwin-arm64 native library`);
    }

    const asrProcess = new ChildProcessManager(processPath, {
      forkOptions: {
        env,
        stdio: ['pipe', 'pipe', 'pipe', 'ipc'] // Ensure stdio is set correctly
      }
    });

    asrProcess.on('message', (res) => {
      if (res.event === 'started') {
        console.log(`[asr ${data.type}] start complete`);
        resolve(Ins[data.uuid]);
      }
      if (res.event === 'asr:progress' || res.event === 'vad:segment') {
        Ins[data.uuid]?.handler?.(res.data);
      }
    });

    asrProcess.on('exit', (code) => {
      asrProcess.stop();
      console.log(`[asr ${data.type}] process exit: ${code}`);
    });

    if (!asrProcess.exist()) {
      asrProcess.start();
      // 使用插件管理模块获取模型目录
      const modelDir = pluginResourceManager.getPluginResourceDir('plugin:sherpa-onnx', 'model');

      let modelConfig;
      if (data.type !== 'vad' && data.model) {
        modelConfig = getModelConfig({
          model: data.model,
          modelDir: modelDir,
          language: data.language,
          commonConfig: data.commonConfig
        });
      }

      const punctuationModelConfigData = data.punctuationModel
        ? punctuationModelConfig({
            modelDir: modelDir,
            model: data.punctuationModel as any
          })
        : undefined;

      const startData: any = {
        modelConfig,
        punctuationModelConfig: punctuationModelConfigData,
        language: data.language
      };

      if (data.type === 'offline' || data.type === 'vad') {
        // @ts-ignore
        startData.vadConfig = vadModelConfig(data.vad);
      }

      asrProcess.send({
        data: startData,
        event: 'start'
      });

      console.log(`[asr ${data.type}] process created and sent start data`);
      Ins[data.uuid] = {
        process: asrProcess,
        type: 'process'
      };
    } else {
      console.log(`[asr ${data.type}] process already exists, cannot create new process`);
      reject(new Error(`[asr ${data.type}] process already exists, cannot create new process`));
    }
  });
}

export function getASRInstance(uuid: string): StreamInstances[string] | undefined {
  return Ins[uuid];
}

// 传入的是 16kHz 的 float32 数组
export function sendASRData(uuid: string, samples: Float32Array): void {
  Ins[uuid]?.process?.send({
    data: { samples: Array.from(samples) },
    event: 'data'
  });
}

export function freeASRInstance(uuid: string): void {
  Ins[uuid]?.process?.send({
    event: 'stop',
    data: {}
  });
  delete Ins[uuid];
}
