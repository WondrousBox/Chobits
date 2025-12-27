import path from 'path';

import { getResourcePath } from '../../electron/main/utils/resources-path';
import { pluginResourceManager } from '../plugins';
import ChildProcessManager from './child-process-manager';
import { AllModels, getModelConfig, punctuationModelConfig, StreamInstances, vadModelConfig } from './common';
import { findSherpaOnnxNativeLibPath, findSherpaOnnxNodePath } from './utils';

const Ins: StreamInstances = {};

export async function createInstance(data: { uuid: string; model: AllModels; punctuationModel?: string; language?: string }): Promise<StreamInstances[string]> {
  console.log('create offline asr', data);

  if (Ins[data.uuid]) {
    return Ins[data.uuid];
  }

  return new Promise((resolve, reject) => {
    const processPath = path.resolve(getResourcePath('sherpa')!, 'asr_offline_process.js');
    console.log(processPath);
    console.log(getResourcePath('sherpa'));

    // 获取 sherpa-onnx-node 模块的路径
    const sherpaOnnxNodePath = findSherpaOnnxNodePath();
    if (!sherpaOnnxNodePath) {
      reject(new Error('Cannot find sherpa-onnx-node module'));
      return;
    }

    console.log('[asr offline] sherpaOnnxNodePath:', sherpaOnnxNodePath);

    // 获取原生库路径并设置 DYLD_LIBRARY_PATH
    const nativeLibPath = findSherpaOnnxNativeLibPath();
    const env: NodeJS.ProcessEnv = {
      ...process.env,
      SHERPA_ONNX_NODE_PATH: sherpaOnnxNodePath
    };

    if (nativeLibPath) {
      console.log('[asr offline] Found native lib at:', nativeLibPath);
      // 设置 DYLD_LIBRARY_PATH 以便找到原生库
      const existingDyldPath = process.env.DYLD_LIBRARY_PATH || '';
      env.DYLD_LIBRARY_PATH = existingDyldPath ? `${nativeLibPath}:${existingDyldPath}` : nativeLibPath;
    } else {
      console.warn('[asr offline] Warning: Could not find sherpa-onnx-darwin-arm64 native library');
    }

    const asrProcess = new ChildProcessManager(processPath, {
      forkOptions: {
        env,
        stdio: ['pipe', 'pipe', 'pipe', 'ipc'] // Ensure stdio is set correctly
      }
    });

    asrProcess.on('message', (res) => {
      if (res.event === 'started') {
        console.log('[asr offline] start complete');
        resolve(Ins[data.uuid]);
      }
      if (res.event === 'asr:progress') {
        Ins[data.uuid]?.handler?.(res.data);
      }
      if (res.event === 'log') {
        console.log(res.data);
      }
    });

    asrProcess.on('exit', (code) => {
      asrProcess.stop();
      console.log(`[asr offline] process exit: ${code}`);
    });

    if (!asrProcess.exist()) {
      asrProcess.start();
      // 使用插件管理模块获取模型目录
      const modelDir = pluginResourceManager.getPluginResourceDir('plugin:sherpa-onnx', 'model');

      const modelConfig = getModelConfig({
        model: data.model,
        modelDir: modelDir,
        language: data.language
      });

      console.log(modelConfig);

      const punctuationModelConfigData = data.punctuationModel
        ? punctuationModelConfig({
          modelDir: modelDir,
          model: data.punctuationModel as any
        })
        : undefined;

      asrProcess.send({
        data: {
          modelConfig,
          punctuationModelConfig: punctuationModelConfigData,
          vadConfig: vadModelConfig(),
          language: data.language
        },
        event: 'start'
      });

      // console.log(processPath, libPath);

      console.log('[asr offline] process created and sent start data');
      Ins[data.uuid] = {
        process: asrProcess,
        type: 'process'
      };
    } else {
      console.log('[asr offline] process already exists, cannot create new process');
      reject(new Error('[asr offline] process already exists, cannot create new process'));
    }
  });
}

export function getInstance(uuid: string): StreamInstances[string] | undefined {
  return Ins[uuid];
}

// 传入的是 16kHz 的 float32 数组
export function sendData(uuid: string, samples: Float32Array): void {
  Ins[uuid]?.process?.send({
    data: { samples: Array.from(samples) },
    event: 'data'
  });
}

export function freeInstance(uuid: string): void {
  Ins[uuid]?.process?.send({
    event: 'stop',
    data: {}
  });
  delete Ins[uuid];
}
