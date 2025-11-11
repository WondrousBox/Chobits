import { ipcRenderer } from 'electron';

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
  proxies?: CustomProxy[];
}

export type ProxyBridgeType = typeof proxyBridge;

export const proxyBridge = {
  getConfig: async (): Promise<ProxyConfig> => {
    return await ipcRenderer.invoke('proxy:getConfig');
  },

  setConfig: async (payload: { config: ProxyConfig }): Promise<{ ok: boolean; config?: ProxyConfig; error?: string }> => {
    return await ipcRenderer.invoke('proxy:setConfig', payload);
  },

  getSystemProxy: async (): Promise<{ ok: boolean; proxy?: { host: string; port: string } | null; error?: string }> => {
    return await ipcRenderer.invoke('proxy:getSystemProxy');
  },

  test: async (payload?: { testUrl?: string }): Promise<{ ok: boolean; latency?: number; error?: string }> => {
    return await ipcRenderer.invoke('proxy:test', payload);
  },

  addCustom: async (payload: { proxy: Omit<CustomProxy, 'active'> }): Promise<{ ok: boolean; config?: ProxyConfig; error?: string }> => {
    return await ipcRenderer.invoke('proxy:addCustom', payload);
  },

  updateCustom: async (payload: { index: number; proxy: Partial<CustomProxy> }): Promise<{ ok: boolean; config?: ProxyConfig; error?: string }> => {
    return await ipcRenderer.invoke('proxy:updateCustom', payload);
  },

  removeCustom: async (payload: { index: number }): Promise<{ ok: boolean; config?: ProxyConfig; error?: string }> => {
    return await ipcRenderer.invoke('proxy:removeCustom', payload);
  }
};
