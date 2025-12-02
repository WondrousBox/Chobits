import os from 'node:os';

import { readLocalJSON } from '@aim-packages/file-utils';

import { PluginDefinition } from './types';

/**
 * 加载插件列表配置文件
 * 从指定的文件路径加载
 * 将嵌套的模型展开为独立的定义，保持向后兼容
 * @param filePath 插件配置文件的完整路径
 */
export async function loadPluginDefinitions(filePath: string): Promise<PluginDefinition[]> {
  try {
    const arr = await readLocalJSON<PluginDefinition[]>(filePath, []);
    const result: PluginDefinition[] = [];
    for (const plugin of arr) {
      if (!plugin) continue;

      // 添加引擎定义（不包含 models 字段，因为模型会被展开）
      if (plugin.type === 'engine') {
        const { models, ...engineDef } = plugin;
        result.push(engineDef);

        // 如果是引擎且有模型，将模型展开为独立的定义
        if (models && Array.isArray(models)) {
          for (const model of models) {
            result.push(model);
          }
        }
      }
    }

    return result;
  } catch (err) {
    console.error('[PluginLoader] Failed to load plugin definitions:', err);
    return [];
  }
}

/**
 * 根据当前平台和架构获取插件定义
 */
export function getPluginForCurrentPlatform(plugin: PluginDefinition): PluginDefinition['platforms'][0] | undefined {
  const platform = os.platform();
  const arch = os.arch();

  // 优先匹配精确的平台和架构
  let match = plugin.platforms.find((p) => p.platform === platform && p.arch === arch);

  if (!match) {
    match = plugin.platforms.find((p) => p.platform === platform && p.arch === 'all');
  }

  // 如果没有精确匹配，尝试只匹配平台
  if (!match) {
    match = plugin.platforms.find((p) => p.platform === platform);
  }

  if (!match) {
    match = plugin.platforms.find((p) => p.platform === 'all' && p.arch === 'all');
  }

  return match;
}
