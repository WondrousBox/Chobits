import { app } from 'electron';
import fs from 'fs';
import path from 'path';

import { getResourcePath } from '../../electron/main/utils/resources-path';
import { pluginResourceManager } from '../plugins';
import ChildProcessManager from './child-process-manager';
import { AllModels, getModelConfig, punctuationModelConfig, StreamInstances } from './common';

const Ins: StreamInstances = {};

// 查找 pnpm 模块路径的辅助函数
function findPnpmModulePath(basePath: string, moduleName: string): string | null {
  const pnpmDir = path.resolve(basePath, 'node_modules', '.pnpm');
  if (fs.existsSync(pnpmDir)) {
    try {
      const entries = fs.readdirSync(pnpmDir);
      // 查找匹配的模块目录（格式：moduleName@version）
      const matched = entries.find((entry) => entry.startsWith(`${moduleName}@`));
      if (matched) {
        const modulePath = path.resolve(pnpmDir, matched, 'node_modules', moduleName);
        if (fs.existsSync(modulePath)) {
          return modulePath;
        }
      }
    } catch (e) {
      // ignore
    }
  }
  return null;
}

// 查找 sherpa-onnx-node 模块的实际路径（支持 pnpm 的 node_modules 结构）
function findSherpaOnnxNodePath(): string | null {
  const appPath = app.getAppPath();

  if (appPath.includes('app.asar')) {
    // 打包后的环境：模块在 app.asar.unpacked 中
    const unpackedPath = appPath.replace('app.asar', 'app.asar.unpacked');
    const possiblePath = path.resolve(unpackedPath, 'node_modules', 'sherpa-onnx-node');
    if (fs.existsSync(possiblePath)) {
      return possiblePath;
    }
  } else {
    // 开发环境：尝试多个可能的路径
    const searchPaths = [appPath, process.cwd()];

    for (const basePath of searchPaths) {
      // 1. 尝试直接路径
      const directPath = path.resolve(basePath, 'node_modules', 'sherpa-onnx-node');
      if (fs.existsSync(directPath)) {
        return directPath;
      }

      // 2. 尝试 pnpm 路径
      const pnpmPath = findPnpmModulePath(basePath, 'sherpa-onnx-node');
      if (pnpmPath) {
        return pnpmPath;
      }
    }

    // 3. 如果都找不到，尝试通过 require.resolve 查找
    try {
      const resolvedPath = require.resolve('sherpa-onnx-node/package.json');
      return path.dirname(resolvedPath);
    } catch (e) {
      // ignore
    }
  }

  return null;
}

// 查找 sherpa-onnx-darwin-arm64 原生库路径
function findSherpaOnnxNativeLibPath(): string | null {
  const appPath = app.getAppPath();

  if (appPath.includes('app.asar')) {
    const unpackedPath = appPath.replace('app.asar', 'app.asar.unpacked');
    const possiblePath = path.resolve(unpackedPath, 'node_modules', 'sherpa-onnx-darwin-arm64');
    if (fs.existsSync(possiblePath)) {
      return possiblePath;
    }
  } else {
    const searchPaths = [appPath, process.cwd()];

    for (const basePath of searchPaths) {
      // 1. 尝试直接路径
      const directPath = path.resolve(basePath, 'node_modules', 'sherpa-onnx-darwin-arm64');
      if (fs.existsSync(directPath)) {
        return directPath;
      }

      // 2. 尝试 pnpm 路径
      const pnpmPath = findPnpmModulePath(basePath, 'sherpa-onnx-darwin-arm64');
      if (pnpmPath) {
        return pnpmPath;
      }
    }
  }

  return null;
}

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
    const sherpaOnnxNodePath = findSherpaOnnxNodePath();
    if (!sherpaOnnxNodePath) {
      reject(new Error('Cannot find sherpa-onnx-node module'));
      return;
    }

    console.log('[asr online] sherpaOnnxNodePath:', sherpaOnnxNodePath);

    // 获取原生库路径并设置 DYLD_LIBRARY_PATH
    const nativeLibPath = findSherpaOnnxNativeLibPath();
    const env: NodeJS.ProcessEnv = {
      ...process.env,
      SHERPA_ONNX_NODE_PATH: sherpaOnnxNodePath
    };

    if (nativeLibPath) {
      console.log('[asr online] Found native lib at:', nativeLibPath);
      // 设置 DYLD_LIBRARY_PATH 以便找到原生库
      const existingDyldPath = process.env.DYLD_LIBRARY_PATH || '';
      env.DYLD_LIBRARY_PATH = existingDyldPath ? `${nativeLibPath}:${existingDyldPath}` : nativeLibPath;
    } else {
      console.warn('[asr online] Warning: Could not find sherpa-onnx-darwin-arm64 native library');
    }

    const asrProcess = new ChildProcessManager(processPath, {
      forkOptions: {
        env,
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
