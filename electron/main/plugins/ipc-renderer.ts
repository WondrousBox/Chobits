import { ipcRenderer } from 'electron';

export type PluginResourceBridgeType = {
  'plugin-resource:listSupported': () => Promise<any[]>;
  'plugin-resource:list': (payload?: { pluginId?: string; type?: 'engine' | 'model' }) => Promise<any[]>;
  'plugin-resource:get': (payload: { id: string }) => Promise<any>;
  'plugin-resource:install': (payload: { pluginId: string; resourceId: string; deleteAfterInstall?: boolean }) => Promise<{ ok: boolean; data?: any; error?: string }>;
  'plugin-resource:cancel': (payload: { id: string }) => Promise<{ ok: boolean }>;
  'plugin-resource:isInstalled': (payload: { id: string }) => Promise<{ ok: boolean; installed?: boolean; error?: string }>;
  'plugin-resource:getEnginePath': (payload: { pluginId: string; binaryName: string }) => Promise<{ ok: boolean; path?: string }>;
  'plugin-resource:getModelPath': (payload: { pluginId: string; modelName: string }) => Promise<{ ok: boolean; path?: string }>;
  'plugin-resource:remove': (payload: { id: string }) => Promise<{ ok: boolean }>;
  'plugin-resource:getDownloadDir': () => Promise<{ ok: boolean; path?: string }>;
  'plugin-resource:setDownloadDir': (payload: { dir: string }) => Promise<{ ok: boolean }>;
  'plugin-resource:getPluginsDir': () => Promise<{ ok: boolean; path?: string }>;
  'plugin-resource:setPluginsDir': (payload: { dir: string }) => Promise<{ ok: boolean }>;
};

export const pluginResourceAPI: PluginResourceBridgeType = {
  'plugin-resource:listSupported': () => ipcRenderer.invoke('plugin-resource:listSupported'),
  'plugin-resource:list': (payload) => ipcRenderer.invoke('plugin-resource:list', payload),
  'plugin-resource:get': (payload) => ipcRenderer.invoke('plugin-resource:get', payload),
  'plugin-resource:install': (payload) => ipcRenderer.invoke('plugin-resource:install', payload),
  'plugin-resource:cancel': (payload) => ipcRenderer.invoke('plugin-resource:cancel', payload),
  'plugin-resource:isInstalled': (payload) => ipcRenderer.invoke('plugin-resource:isInstalled', payload),
  'plugin-resource:getEnginePath': (payload) => ipcRenderer.invoke('plugin-resource:getEnginePath', payload),
  'plugin-resource:getModelPath': (payload) => ipcRenderer.invoke('plugin-resource:getModelPath', payload),
  'plugin-resource:remove': (payload) => ipcRenderer.invoke('plugin-resource:remove', payload),
  'plugin-resource:getDownloadDir': () => ipcRenderer.invoke('plugin-resource:getDownloadDir'),
  'plugin-resource:setDownloadDir': (payload) => ipcRenderer.invoke('plugin-resource:setDownloadDir', payload),
  'plugin-resource:getPluginsDir': () => ipcRenderer.invoke('plugin-resource:getPluginsDir'),
  'plugin-resource:setPluginsDir': (payload) => ipcRenderer.invoke('plugin-resource:setPluginsDir', payload)
};
