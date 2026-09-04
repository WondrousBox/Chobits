import type { CustomProxy, ProxyConfig } from '@packages/common/types/proxy';
import { ipcRenderer } from 'electron';

export type { CustomProxy, ProxyAgentType, ProxyConfig, ProxyType } from '@packages/common/types/proxy';

export type ProxyBridgeType = typeof proxyBridge;

export const proxyBridge = {
  'proxy:get-config': async (): Promise<ProxyConfig> => {
    return await ipcRenderer.invoke('proxy:get-config');
  },

  'proxy:set-config': async (payload: { config: ProxyConfig }): Promise<{ ok: boolean; config?: ProxyConfig; error?: string }> => {
    return await ipcRenderer.invoke('proxy:set-config', payload);
  },

  'proxy:get-system-proxy': async (): Promise<{ ok: boolean; proxy?: { host: string; port: string } | null; error?: string }> => {
    return await ipcRenderer.invoke('proxy:get-system-proxy');
  },

  'proxy:test': async (payload?: { testUrl?: string; timeoutMs?: number }): Promise<{ ok: boolean; latency?: number; error?: string }> => {
    return await ipcRenderer.invoke('proxy:test', payload);
  },

  'proxy:add-custom': async (payload: { proxy: Omit<CustomProxy, 'isActive'> }): Promise<{ ok: boolean; config?: ProxyConfig; error?: string }> => {
    return await ipcRenderer.invoke('proxy:add-custom', payload);
  },

  'proxy:update-custom': async (payload: { index: number; proxy: Partial<CustomProxy> }): Promise<{ ok: boolean; config?: ProxyConfig; error?: string }> => {
    return await ipcRenderer.invoke('proxy:update-custom', payload);
  },

  'proxy:remove-custom': async (payload: { index: number }): Promise<{ ok: boolean; config?: ProxyConfig; error?: string }> => {
    return await ipcRenderer.invoke('proxy:remove-custom', payload);
  }
};
