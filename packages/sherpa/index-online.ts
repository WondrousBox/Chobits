import { app } from 'electron';
import path from 'path';

import { getResourcePath } from '../../electron/main/utils/resources-path';
import { pluginResourceManager } from '../plugins';
import ChildProcessManager from './child-process-manager';
import { AllModels, getModelConfig, punctuationModelConfig, StreamInstances } from './common';

const Ins: StreamInstances = {};

export async function createInstance(data: { uuid: string; model: AllModels; punctuationModel?: string; language?: string }): Promise<StreamInstances[string]> {
  console.log('create online asr', data);

  if (Ins[data.uuid]) {
    return Ins[data.uuid];
  }

  return new Promise((resolve, reject) => {
    const processPath = path.resolve(getResourcePath('sherpa')!, 'asr_online_process.js');
    console.log(processPath);
    console.log(getResourcePath('sherpa'));

    // 获取 sherpa-onnx-node 模块的路径
    // 在打包后的应用中，模块在 app.asar.unpacked 目录中
    // ESM 模块不使用 NODE_PATH，所以需要传递完整路径
    const appPath = app.getAppPath();
    let sherpaOnnxNodePath: string;

    if (appPath.includes('app.asar')) {
      // 打包后的环境：模块在 app.asar.unpacked 中
      const unpackedPath = appPath.replace('app.asar', 'app.asar.unpacked');
      sherpaOnnxNodePath = path.resolve(unpackedPath, 'node_modules', 'sherpa-onnx-node');
      console.log('[asr online] Production mode - appPath:', appPath);
      console.log('[asr online] Production mode - unpackedPath:', unpackedPath);
      console.log('[asr online] Production mode - sherpaOnnxNodePath:', sherpaOnnxNodePath);
    } else {
      // 开发环境：模块在项目根目录的 node_modules 中
      sherpaOnnxNodePath = path.resolve(appPath, 'node_modules', 'sherpa-onnx-node');
      console.log('[asr online] Development mode - appPath:', appPath);
      console.log('[asr online] Development mode - sherpaOnnxNodePath:', sherpaOnnxNodePath);
    }

    const asrProcess = new ChildProcessManager(processPath, {
      forkOptions: {
        env: {
          ...process.env, // 保留当前进程的环境变量
          SHERPA_ONNX_NODE_PATH: sherpaOnnxNodePath // 传递模块的完整路径给子进程
          // DYLD_LIBRARY_PATH: libPath
        },
        stdio: ['pipe', 'pipe', 'pipe', 'ipc'] // Ensure stdio is set correctly
      }
    });

    asrProcess.on('message', (res) => {
      if (res.event === 'started') {
        console.log('[asr online] start complete');
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
      console.log(`[asr online] process exit: ${code}`);
    });

    if (!asrProcess.exist()) {
      asrProcess.start();
      // 使用插件管理模块获取模型目录
      const modelDir = pluginResourceManager.getPluginResourceDir('plugin:sherpa-onnx', 'model');

      asrProcess.send({
        data: {
          modelConfig: getModelConfig({
            model: data.model,
            modelDir: modelDir,
            language: data.language
          }),
          punctuationModelConfig: data.punctuationModel
            ? punctuationModelConfig({
              modelDir: modelDir,
              model: data.punctuationModel as any
            })
            : undefined,
          language: data.language
        },
        event: 'start'
      });

      // console.log(processPath, libPath);

      console.log('[asr online] process created and sent start data');
      Ins[data.uuid] = {
        process: asrProcess,
        type: 'process'
      };
    } else {
      console.log('[asr online] process already exists, cannot create new process');
      reject(new Error('[asr online] process already exists, cannot create new process'));
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
