import { BrowserWindow, ipcMain } from 'electron';

import { getSystemProxy, testProxy } from './proxy';
import { type CustomProxy, type ProxyConfig, ProxyStore } from './proxy-store';

export async function initProxyHandlers(win: BrowserWindow): Promise<void> {
  // 应用启动时，如果配置为系统代理，自动获取系统代理
  const config = ProxyStore.getConfig();
  if (config.type === 'system') {
    try {
      await getSystemProxy(win);
      console.log('[Proxy] system proxy loaded on startup');
    } catch (error) {
      console.warn('[Proxy] failed to load system proxy on startup', error);
    }
  }

  // 获取代理配置
  ipcMain.handle('proxy:getConfig', async () => {
    return ProxyStore.getConfig();
  });

  // 设置代理配置
  ipcMain.handle('proxy:setConfig', async (_e, payload: { config: ProxyConfig }) => {
    try {
      const config = ProxyStore.setConfig(payload.config);

      // 如果设置为系统代理，自动获取系统代理设置
      if (config.type === 'system') {
        await getSystemProxy(win);
      }

      return { ok: true, config };
    } catch (error: any) {
      console.error('[Proxy] failed to set config', error);
      return { ok: false, error: error.message || String(error) };
    }
  });

  // 获取系统代理
  ipcMain.handle('proxy:getSystemProxy', async () => {
    try {
      const result = await getSystemProxy(win);
      return { ok: true, proxy: result };
    } catch (error: any) {
      return { ok: false, error: error.message || String(error) };
    }
  });

  // 测试代理连接
  ipcMain.handle('proxy:test', async (_e, payload?: { testUrl?: string; timeoutMs?: number }) => {
    try {
      const latency = await testProxy(payload?.testUrl, payload?.timeoutMs || 10000);
      return { ok: true, latency };
    } catch (error: any) {
      return { ok: false, error: error.message || String(error) };
    }
  });

  // 添加自定义代理
  ipcMain.handle('proxy:addCustom', async (_e, payload: { proxy: Omit<CustomProxy, 'active'> }) => {
    try {
      const config = ProxyStore.getConfig();
      if (config.type !== 'custom') {
        // 如果当前不是自定义模式，切换到自定义模式
        ProxyStore.setConfig({ type: 'custom', proxies: [] });
      }

      const currentConfig = ProxyStore.getConfig();
      const proxies = currentConfig.proxies || [];

      // 新代理默认激活，其他代理设为非激活
      const newProxies = proxies.map((p) => ({ ...p, active: false }));
      newProxies.push({ ...payload.proxy, active: true });

      const updatedConfig = ProxyStore.setConfig({ type: 'custom', proxies: newProxies });
      return { ok: true, config: updatedConfig };
    } catch (error: any) {
      return { ok: false, error: error.message || String(error) };
    }
  });

  // 更新自定义代理
  ipcMain.handle('proxy:updateCustom', async (_e, payload: { index: number; proxy: Partial<CustomProxy> }) => {
    try {
      const config = ProxyStore.getConfig();
      if (config.type !== 'custom' || !config.proxies) {
        return { ok: false, error: 'Not in custom proxy mode' };
      }

      const proxies = [...config.proxies];
      if (payload.index >= 0 && payload.index < proxies.length) {
        proxies[payload.index] = { ...proxies[payload.index], ...payload.proxy };

        // 如果设置为激活，其他代理设为非激活
        if (payload.proxy.active) {
          proxies.forEach((p, i) => {
            if (i !== payload.index) {
              p.active = false;
            }
          });
        }

        const updatedConfig = ProxyStore.setConfig({ type: 'custom', proxies });
        return { ok: true, config: updatedConfig };
      }
      return { ok: false, error: 'Invalid index' };
    } catch (error: any) {
      return { ok: false, error: error.message || String(error) };
    }
  });

  // 删除自定义代理
  ipcMain.handle('proxy:removeCustom', async (_e, payload: { index: number }) => {
    try {
      const config = ProxyStore.getConfig();
      if (config.type !== 'custom' || !config.proxies) {
        return { ok: false, error: 'Not in custom proxy mode' };
      }

      const proxies = config.proxies.filter((_, i) => i !== payload.index);
      const updatedConfig = ProxyStore.setConfig({ type: 'custom', proxies });
      return { ok: true, config: updatedConfig };
    } catch (error: any) {
      return { ok: false, error: error.message || String(error) };
    }
  });
}
