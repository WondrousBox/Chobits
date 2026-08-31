import fs from 'node:fs';
import path from 'node:path';

import type { CustomProxy, ProxyConfig } from '@packages/common/types/proxy';
import { app } from 'electron';

export type { CustomProxy, ProxyAgentType, ProxyConfig, ProxyType } from '@packages/common/types/proxy';

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
    // 保留现有的代理列表，即使切换到非custom类型
    const existingProxies = current.proxy.proxies || [];
    const merged: ProxyConfig = {
      type: config.type,
      // 如果切换到custom类型，使用传入的proxies，否则保留现有的proxies
      proxies: config.type === 'custom' ? (config.proxies !== undefined ? config.proxies : existingProxies) : existingProxies.length > 0 ? existingProxies : undefined
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
