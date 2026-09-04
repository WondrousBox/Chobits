import { ipcRenderer, IpcRendererEvent } from 'electron';

import type { DownloadProgress } from './index';
import type { PluginConfig } from './plugin-config-store';

export type PluginResourceMoveProgressPayload = {
  current: number;
  total: number;
  currentFile: string;
  percentage: number;
};

export type PluginResourceBridgeType = {
  'plugin-resource:list-supported': () => Promise<any[]>;
  'plugin-resource:list': (payload?: { pluginId?: string; type?: 'engine' | 'model' }) => Promise<any[]>;
  'plugin-resource:get': (payload: { id: string }) => Promise<any>;
  'plugin-resource:install': (payload: { pluginId: string; resourceId: string; deleteAfterInstall?: boolean }) => Promise<{ ok: boolean; data?: any; error?: string }>;
  'plugin-resource:cancel': (payload: { id: string }) => Promise<{ ok: boolean }>;
  'plugin-resource:remove': (payload: { id: string; deleteFiles?: boolean }) => Promise<{ ok: boolean; deletedPaths?: string[] }>;
  'plugin-resource:get-download-dir': () => Promise<{ ok: boolean; path?: string }>;
  'plugin-resource:get-plugins-dir': () => Promise<{ ok: boolean; path?: string }>;
  'plugin-resource:set-plugins-dir': (payload: { dir: string }) => Promise<{ ok: boolean; error?: string }>;
  'plugin-resource:get-config': () => Promise<{ ok: boolean; config?: PluginConfig }>;
  'plugin-resource:set-config': (payload: Partial<PluginConfig>) => Promise<{ ok: boolean; config?: PluginConfig }>;
  'plugin-resource:check-network': () => Promise<{ ok: boolean; results: Array<{ name: string; url: string; success: boolean; error?: string }> }>;
  /** 订阅资源下载/安装进度事件（plugin-resource:progress 广播） */
  onProgress: (callback: (info: DownloadProgress) => void) => () => void;
  /** 订阅插件目录移动进度事件（plugin-resource:move-progress 广播） */
  onMoveProgress: (callback: (progress: PluginResourceMoveProgressPayload) => void) => () => void;
};

const subscribePluginResourceEvent = <T>(channel: string, callback: (data: T) => void): (() => void) => {
  const listener = (_event: IpcRendererEvent, data: T): void => callback(data);
  ipcRenderer.on(channel, listener);
  return () => {
    ipcRenderer.off(channel, listener);
  };
};

export const pluginResourceBridge: PluginResourceBridgeType = {
  'plugin-resource:list-supported': () => ipcRenderer.invoke('plugin-resource:list-supported'),
  'plugin-resource:list': (payload) => ipcRenderer.invoke('plugin-resource:list', payload),
  'plugin-resource:get': (payload) => ipcRenderer.invoke('plugin-resource:get', payload),
  'plugin-resource:install': (payload) => ipcRenderer.invoke('plugin-resource:install', payload),
  'plugin-resource:cancel': (payload) => ipcRenderer.invoke('plugin-resource:cancel', payload),
  'plugin-resource:remove': (payload) => ipcRenderer.invoke('plugin-resource:remove', payload),
  'plugin-resource:get-download-dir': () => ipcRenderer.invoke('plugin-resource:get-download-dir'),
  'plugin-resource:get-plugins-dir': () => ipcRenderer.invoke('plugin-resource:get-plugins-dir'),
  'plugin-resource:set-plugins-dir': (payload) => ipcRenderer.invoke('plugin-resource:set-plugins-dir', payload),
  'plugin-resource:get-config': () => ipcRenderer.invoke('plugin-resource:get-config'),
  'plugin-resource:set-config': (payload) => ipcRenderer.invoke('plugin-resource:set-config', payload),
  'plugin-resource:check-network': () => ipcRenderer.invoke('plugin-resource:check-network'),
  onProgress: (callback) => subscribePluginResourceEvent('plugin-resource:progress', callback),
  onMoveProgress: (callback) => subscribePluginResourceEvent('plugin-resource:move-progress', callback)
};
