import fs from 'node:fs';
import path from 'node:path';

import { app } from 'electron';

export type ProxyType = 'none' | 'system' | 'custom';

export type ProxyAgentType = 'http' | 'socks5';

export interface CustomProxy {
  type: ProxyAgentType;
  hostname: string;
  port: number;
  active: boolean;
}

export interface ProxyConfig {
  type: ProxyType;
  proxies?: CustomProxy[]; // 仅当 type === 'custom' 时使用
}

type StoreShape = {
  proxy: ProxyConfig;
};

const STORE_DIR = path.join(app.getPath('userData'), 'data');
const STORE_FILE = path.join(STORE_DIR, 'proxy-config.json');

function ensureStore(): void {
  if (!fs.existsSync(STORE_DIR)) {
    fs.mkdirSync(STORE_DIR, { recursive: true });
  }
  if (!fs.existsSync(STORE_FILE)) {
    const defaultConfig: ProxyConfig = {
      type: 'none'
    };
    fs.writeFileSync(STORE_FILE, JSON.stringify({ proxy: defaultConfig } as StoreShape, null, 2));
  }
}

function read(): StoreShape {
  ensureStore();
  try {
    const raw = fs.readFileSync(STORE_FILE, 'utf-8');
    const data = JSON.parse(raw);
    return {
      proxy: {
        type: data.proxy?.type || 'none',
        proxies: data.proxy?.proxies || []
      }
    };
  } catch (error) {
    console.warn('[ProxyStore] Failed to read config, using defaults:', error);
    return { proxy: { type: 'none' } };
  }
}

function write(next: StoreShape): void {
  ensureStore();
  try {
    fs.writeFileSync(STORE_FILE, JSON.stringify(next, null, 2));
  } catch (error) {
    console.error('[ProxyStore] Failed to write config:', error);
    throw error;
  }
}

export const ProxyStore = {
  getConfig(): ProxyConfig {
    return read().proxy;
  },

  setConfig(config: ProxyConfig): ProxyConfig {
    const current = read();
    const merged: ProxyConfig = {
      type: config.type,
      proxies: config.type === 'custom' ? config.proxies || [] : undefined
    };
    write({ ...current, proxy: merged });
    return merged;
  },

  /**
   * 获取当前激活的代理配置
   */
  getActiveProxy(): CustomProxy | null {
    const config = this.getConfig();
    if (config.type !== 'custom' || !config.proxies) {
      return null;
    }
    return config.proxies.find((p) => p.active) || null;
  }
};
