import fs from 'node:fs';
import path from 'node:path';

import { app } from 'electron';

export type PluginConfig = {
  pluginsDir?: string; // 插件资源目录（包含engine和models）
  concurrency?: number; // 下载并发数
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

function ensureStore(): void {
  if (!fs.existsSync(STORE_DIR)) fs.mkdirSync(STORE_DIR, { recursive: true });
  if (!fs.existsSync(STORE_FILE)) {
    const defaultConfig: PluginConfig = {
      pluginsDir: getDefaultPluginsDir()
    };
    fs.writeFileSync(STORE_FILE, JSON.stringify({ config: defaultConfig } as StoreShape, null, 2));
  }
}

function read(): StoreShape {
  ensureStore();
  try {
    const raw = fs.readFileSync(STORE_FILE, 'utf-8');
    const data = JSON.parse(raw);
    const defaultDir = getDefaultPluginsDir();
    return {
      config: {
        pluginsDir: data.config?.pluginsDir || defaultDir,
        concurrency: data.config?.concurrency ?? 2, // 默认并发数为2
        ...data.config
      }
    };
  } catch {
    return { config: { pluginsDir: getDefaultPluginsDir(), concurrency: 2 } };
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
