import type { CustomProxy, ProxyConfig } from '@packages/common/types/proxy';
import { ipcRenderer } from 'electron';

export type { CustomProxy, ProxyAgentType, ProxyConfig, ProxyType } from '@packages/common/types/proxy';

export type ProxyIpcType = typeof proxyIpcRenderer;

export const proxyIpcRenderer = {
  'proxy:getConfig': async (): Promise<ProxyConfig> => {
    return await ipcRenderer.invoke('proxy:getConfig');
  },

  'proxy:setConfig': async (payload: { config: ProxyConfig }): Promise<{ ok: boolean; config?: ProxyConfig; error?: string }> => {
    return await ipcRenderer.invoke('proxy:setConfig', payload);
  },

  'proxy:getSystemProxy': async (): Promise<{ ok: boolean; proxy?: { host: string; port: string } | null; error?: string }> => {
    return await ipcRenderer.invoke('proxy:getSystemProxy');
  },

  'proxy:test': async (payload?: { testUrl?: string; timeoutMs?: number }): Promise<{ ok: boolean; latency?: number; error?: string }> => {
    return await ipcRenderer.invoke('proxy:test', payload);
  },

  'proxy:addCustom': async (payload: { proxy: Omit<CustomProxy, 'active'> }): Promise<{ ok: boolean; config?: ProxyConfig; error?: string }> => {
    return await ipcRenderer.invoke('proxy:addCustom', payload);
  },

  'proxy:updateCustom': async (payload: { index: number; proxy: Partial<CustomProxy> }): Promise<{ ok: boolean; config?: ProxyConfig; error?: string }> => {
    return await ipcRenderer.invoke('proxy:updateCustom', payload);
  },

  'proxy:removeCustom': async (payload: { index: number }): Promise<{ ok: boolean; config?: ProxyConfig; error?: string }> => {
    return await ipcRenderer.invoke('proxy:removeCustom', payload);
  }
};
