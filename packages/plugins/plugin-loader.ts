import os from 'node:os';

import { readLocalJSON } from '@aim-packages/file-utils';

import { getResourcePath } from '../../electron/main/utils/resources-path';

export type ModelDefinition = {
  id: string;
  pluginId: string;
  type: 'engine' | 'model';
  name: string;
  displayName: string;
  description?: string;
  version: string;
  archiveType?: 'zip' | 'tar.gz' | 'tar' | 'none';
  platforms: {
    platform: string;
    arch: string;
    sourceUrl: string;
    sizeBytes?: number;
    sha256?: string; // SHA256校验和
  }[];
};

export type PluginDefinition = {
  id: string;
  pluginId: string;
  type: 'engine' | 'model';
  name: string;
  displayName: string;
  description?: string;
  version: string;
  binaryName?: string;
  archiveType?: 'zip' | 'tar.gz' | 'tar' | 'none';
  platforms: {
    platform: string;
    arch: string;
    sourceUrl: string;
    sizeBytes?: number;
    sha256?: string; // SHA256校验和
  }[];
  // 模型作为引擎的子资源（仅当 type === 'engine' 时存在）
  models?: ModelDefinition[];
};

/**
 * 加载插件列表配置文件
 * 从 resources/plugins/plugins.json 加载
 * 将嵌套的模型展开为独立的定义，保持向后兼容
 */
export async function loadPluginDefinitions(): Promise<PluginDefinition[]> {
  try {
    const file = getResourcePath('plugins');
    const arr = await readLocalJSON<PluginDefinition[]>(file, []);
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
