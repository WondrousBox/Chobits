export type ModelDefinition = {
  id: string;
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
    checksum?: string;
    algo?: string;
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
    checksum?: string;
    algo?: string;
  }[];
  // 模型作为引擎的子资源（仅当 type === 'engine' 时存在）
  models?: ModelDefinition[];
};

export type InstalledResource = {
  id: string;
  pluginId: string;
  type: 'engine' | 'model';
  name: string;
  displayName?: string;
  version?: string;
  sizeBytes?: number;
  progressBytes?: number;
  status?: string;
  speedBps?: number;
  etaMs?: number;
  lastError?: string;
};

export type NetworkCheckResult = {
  name: string;
  url: string;
  success: boolean;
  error?: string;
};
