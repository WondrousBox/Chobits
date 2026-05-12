import fs from 'node:fs';
import path from 'node:path';

import { app } from 'electron';

export type PluginConfig = {
  pluginsDir?: string; // 插件资源目录（包含engine和models）
  concurrency?: number; // 下载并发数
  deletePartialDownloadOnCancel?: boolean; // 取消下载时是否删除 .download 临时文件
  deletePartialDownloadOnFailure?: boolean; // 下载失败时是否删除 .download 临时文件
  deleteDownloadedFileOnFailure?: boolean; // 非压缩资源下载失败时是否删除目标文件
  deleteArchiveAfterInstall?: boolean; // 覆盖安装完成后是否删除压缩包；未设置时沿用调用方传入的 deleteAfterInstall
  downloaderResumeValidation?: boolean; // 是否启用 @aim-packages/downloader 的 HEAD 续传校验
  downloaderDebug?: boolean; // 是否打印 @aim-packages/downloader 内部日志
};

type StoreShape = {
  config: PluginConfig;
};

const STORE_DIR = path.join(app.getPath('userData'), 'data');
const STORE_FILE = path.join(STORE_DIR, 'plugin-config.json');

/**
 * 获取默认插件目录
 */
function getDefaultPluginsDir(): string {
  // 优先使用用户主目录，通常不在系统盘
  const pluginDataDir = path.join(app.getPath('userData'), 'data');
  return path.join(pluginDataDir, 'plugins');
}

function getDefaultConfig(): PluginConfig {
  return {
    pluginsDir: getDefaultPluginsDir(),
    concurrency: 2,
    deletePartialDownloadOnCancel: true,
    deletePartialDownloadOnFailure: true,
    deleteDownloadedFileOnFailure: true,
    downloaderResumeValidation: false,
    downloaderDebug: false
  };
}

function withDefaults(config?: PluginConfig): PluginConfig {
  const defaults = getDefaultConfig();
  return {
    ...defaults,
    ...config,
    pluginsDir: config?.pluginsDir || defaults.pluginsDir,
    concurrency: config?.concurrency ?? defaults.concurrency,
    deletePartialDownloadOnCancel: config?.deletePartialDownloadOnCancel ?? defaults.deletePartialDownloadOnCancel,
    deletePartialDownloadOnFailure: config?.deletePartialDownloadOnFailure ?? defaults.deletePartialDownloadOnFailure,
    deleteDownloadedFileOnFailure: config?.deleteDownloadedFileOnFailure ?? defaults.deleteDownloadedFileOnFailure,
    downloaderResumeValidation: config?.downloaderResumeValidation ?? defaults.downloaderResumeValidation,
    downloaderDebug: config?.downloaderDebug ?? defaults.downloaderDebug
  };
}

function hasMissingPersistedDefaults(config?: PluginConfig): boolean {
  return (
    config?.deletePartialDownloadOnCancel === undefined ||
    config.deletePartialDownloadOnFailure === undefined ||
    config.deleteDownloadedFileOnFailure === undefined ||
    config.downloaderResumeValidation === undefined ||
    config.downloaderDebug === undefined
  );
}

function ensureStore(): void {
  if (!fs.existsSync(STORE_DIR)) fs.mkdirSync(STORE_DIR, { recursive: true });
  if (!fs.existsSync(STORE_FILE)) {
    const defaultConfig = getDefaultConfig();
    fs.writeFileSync(STORE_FILE, JSON.stringify({ config: defaultConfig } as StoreShape, null, 2));
  }
}

function read(): StoreShape {
  ensureStore();
  try {
    const raw = fs.readFileSync(STORE_FILE, 'utf-8');
    const data = JSON.parse(raw);
    const config = withDefaults(data.config);
    if (hasMissingPersistedDefaults(data.config)) {
      write({ config });
    }
    return { config };
  } catch {
    return { config: getDefaultConfig() };
  }
}

function write(next: StoreShape): void {
  ensureStore();
  fs.writeFileSync(STORE_FILE, JSON.stringify(next, null, 2));
}

export const PluginConfigStore = {
  getConfig(): PluginConfig {
    return read().config;
  },

  setConfig(patch: Partial<PluginConfig>): PluginConfig {
    const cur = read();
    const merged = { ...cur.config, ...patch };
    // 确保新目录存在
    if (merged.pluginsDir) {
      fs.mkdirSync(merged.pluginsDir, { recursive: true });
    }
    write({ ...cur, config: merged });
    return merged;
  },

  getPluginsDir(): string {
    const config = this.getConfig();
    const dir = config.pluginsDir || getDefaultPluginsDir();
    // 确保目录存在
    fs.mkdirSync(dir, { recursive: true });
    return dir;
  }
};
