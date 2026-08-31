import fs from 'node:fs';

import { cloneDeep } from 'lodash-es';

import { getResourcePath } from '../common/utils';
import { pluginResourceManager } from '../plugins';
import { loadPluginDefinitions } from '../plugins/plugin-loader';
import type { PluginDefinition } from '../plugins/types';

export function checkModelsExist(models: PluginDefinition[]): void {
  // 使用插件管理模块获取模型目录
  const modelPath = pluginResourceManager.getPluginResourceDir('plugin:sherpa-onnx', 'model');
  console.log('modelPath', modelPath);

  // 检查目录是否存在
  if (!fs.existsSync(modelPath)) {
    console.warn('模型目录不存在:', modelPath);
    return;
  }

  fs.readdirSync(modelPath).forEach((file) => {
    const model = models.find((m) => m.name === file);
    if (model) {
      // @ts-ignore
      model.disabled = false;
      // @ts-ignore
      model.download = true;
    }
  });
}

export async function getDefaultSherpaModels(): Promise<PluginDefinition[]> {
  const models = await getPluginModels('plugin:sherpa-onnx');
  checkModelsExist(cloneDeep(models));

  return models;
}

/**
 * 获取某个插件的所有模型列表
 * @param pluginId 插件ID，例如 'plugin:sherpa-onnx'
 * @returns 该插件的所有模型定义列表
 */
export async function getPluginModels(pluginId: string): Promise<PluginDefinition[]> {
  try {
    const pluginsJsonPath = getResourcePath('plugins');
    if (!pluginsJsonPath) {
      console.warn('[getPluginModels] 无法获取插件配置文件路径');
      return [];
    }

    const definitions = await loadPluginDefinitions(pluginsJsonPath);

    // 过滤出指定插件的所有模型（type === 'model' 且 pluginId 匹配）
    const models = definitions.filter((def) => def.type === 'model' && def.pluginId === pluginId);

    return models;
  } catch (err) {
    console.error('[getPluginModels] 获取插件模型列表失败:', err);
    return [];
  }
}
