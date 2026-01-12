import * as fs from 'node:fs';
import { platform } from 'node:os';

import type { MissingModel, Plugin } from '../types';

export const FunASRPlugin: Plugin = {
  id: 'plugin:funasr',
  label: 'FunASR CLI',
  description: 'FunASR 命令行工具，用于语音识别和转录',
  capabilities: ['transcribe'],
  installHint: '通过插件资源管理器下载 FunASR 转录插件',

  async isInstalled(ctx) {
    if (!ctx.pluginResourceManager) {
      return false;
    }
    const binaryName = platform() === 'win32' ? 'funasr.exe' : 'funasr';
    const enginePath = ctx.pluginResourceManager.getEnginePath('plugin:funasr', binaryName);
    if (fs.existsSync(enginePath)) {
      return true;
    }
    return false;
  },
  async prepare(ctx) {
    // 如果资源管理器中安装了engine，可以在这里设置环境变量或路径
    // 目前 funasr CLI 通常通过 PATH 访问，所以暂时不需要额外准备
  },
  async checkRequiredModels(ctx, nodeConfig): Promise<MissingModel[]> {
    const missingModels: MissingModel[] = [];
    if (!ctx.pluginResourceManager) {
      return missingModels;
    }

    // FunASR 自动选择最大的ASR模型，不需要从配置中选择
    // 但我们可以检查是否有任何ASR模型可用
    const pluginId = 'plugin:funasr';
    const modelsDir = ctx.pluginResourceManager.getPluginResourceDir(pluginId, 'model');

    if (modelsDir && fs.existsSync(modelsDir)) {
      // 检查是否有 ASR 模型
      const files = fs.readdirSync(modelsDir);
      const hasAsrModel = files.some((f) => f.includes('asr') || f.includes('ASR'));

      if (!hasAsrModel) {
        missingModels.push({
          pluginId,
          modelName: 'funasr-models',
          displayName: 'ASR 模型'
        });
      }
    } else {
      missingModels.push({
        pluginId,
        modelName: 'funasr-models',
        displayName: 'ASR 模型'
      });
    }

    return missingModels;
  }
};
