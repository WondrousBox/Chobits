import * as fs from 'node:fs';
import { platform } from 'node:os';

import type { MissingModel, Plugin } from '@chobits/workflow';

export const ParakeetPlugin: Plugin = {
  id: 'plugin:parakeet',
  label: 'Parakeet CLI',
  description: 'NVIDIA Parakeet 命令行工具，用于音频和视频转录',
  capabilities: ['transcribe'],
  installHint: '通过插件资源管理器下载 Parakeet 转录插件',

  async isInstalled(ctx) {
    if (!ctx.pluginResourceManager) {
      return false;
    }
    const binaryName = platform() === 'win32' ? 'parakeet.exe' : 'parakeet';
    const enginePath = ctx.pluginResourceManager.getEnginePath('plugin:parakeet', binaryName);
    if (fs.existsSync(enginePath)) {
      return true;
    }
    return false;
  },
  async prepare(ctx) {
    void ctx;
    // 如果资源管理器中安装了engine，可以在这里设置环境变量或路径
    // 目前 parakeet CLI 通常通过 PATH 访问，所以暂时不需要额外准备
  },
  async checkRequiredModels(ctx, nodeConfig): Promise<MissingModel[]> {
    const missingModels: MissingModel[] = [];
    if (!ctx.pluginResourceManager) {
      return missingModels;
    }

    // 检查配置中的模型
    const modelName = String(nodeConfig?.model || '');
    if (modelName) {
      const pluginId = 'plugin:parakeet';
      const modelPath = ctx.pluginResourceManager.getModelPath(pluginId, modelName);
      if (!fs.existsSync(modelPath)) {
        // 尝试从已安装的资源中查找模型资源ID
        const { PluginResourceStore } = await import('../../../plugins/plugin-resource-store');
        const installedModels = PluginResourceStore.listByType(pluginId, 'model');
        const modelResource = installedModels.find((r) => r.name === modelName);

        missingModels.push({
          pluginId,
          modelName,
          resourceId: modelResource?.resourceId,
          displayName: modelResource?.displayName
        });
      }
    }

    return missingModels;
  }
};
