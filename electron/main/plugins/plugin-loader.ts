import os from 'node:os';

import { readLocalJSON } from '@aim-packages/file-utils';

import { getResourcePath } from '../utils/resources-path';

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
};

/**
 * 加载插件列表配置文件
 * 从 resources/plugins/plugins.json 加载
 */
export async function loadPluginDefinitions(): Promise<PluginDefinition[]> {
  try {
    const file = getResourcePath('plugins');
    const arr = await readLocalJSON<PluginDefinition[]>(file, []);
    return arr.filter(Boolean) as PluginDefinition[];
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

  // 如果没有精确匹配，尝试只匹配平台
  if (!match) {
    match = plugin.platforms.find((p) => p.platform === platform);
  }

  return match;
}
