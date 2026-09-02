import { ipcRenderer } from 'electron';

import type { PluginConfig } from './plugin-config-store';

export type PluginResourceIpcType = {
  'plugin-resource:list-supported': () => Promise<any[]>;
  'plugin-resource:list-installed-engines': () => Promise<any[]>;
  'plugin-resource:list-supported-models': () => Promise<any[]>;
  'plugin-resource:list': (payload?: { pluginId?: string; type?: 'engine' | 'model' }) => Promise<any[]>;
  'plugin-resource:get': (payload: { id: string }) => Promise<any>;
  'plugin-resource:install': (payload: { pluginId: string; resourceId: string; deleteAfterInstall?: boolean }) => Promise<{ ok: boolean; data?: any; error?: string }>;
  'plugin-resource:cancel': (payload: { id: string }) => Promise<{ ok: boolean }>;
  'plugin-resource:is-installed': (payload: { id: string }) => Promise<{ ok: boolean; installed?: boolean; error?: string }>;
  'plugin-resource:get-engine-path': (payload: { pluginId: string; binaryName: string }) => Promise<{ ok: boolean; path?: string }>;
  'plugin-resource:get-model-path': (payload: { pluginId: string; modelName: string }) => Promise<{ ok: boolean; path?: string }>;
  'plugin-resource:remove': (payload: { id: string; deleteFiles?: boolean }) => Promise<{ ok: boolean; deletedPaths?: string[] }>;
  'plugin-resource:get-download-dir': () => Promise<{ ok: boolean; path?: string }>;
  'plugin-resource:set-download-dir': (payload: { dir: string }) => Promise<{ ok: boolean; error?: string }>;
  'plugin-resource:get-plugins-dir': () => Promise<{ ok: boolean; path?: string }>;
  'plugin-resource:set-plugins-dir': (payload: { dir: string }) => Promise<{ ok: boolean; error?: string }>;
  'plugin-resource:get-concurrency': () => Promise<{ ok: boolean; concurrency?: number }>;
  'plugin-resource:set-concurrency': (payload: { concurrency: number }) => Promise<{ ok: boolean }>;
  'plugin-resource:get-config': () => Promise<{ ok: boolean; config?: PluginConfig }>;
  'plugin-resource:set-config': (payload: Partial<PluginConfig>) => Promise<{ ok: boolean; config?: PluginConfig }>;
  'plugin-resource:check-network': () => Promise<{ ok: boolean; results: Array<{ name: string; url: string; success: boolean; error?: string }> }>;
};

export const pluginResourceIpcRenderer: PluginResourceIpcType = {
  'plugin-resource:list-supported': () => ipcRenderer.invoke('plugin-resource:list-supported'),
  'plugin-resource:list-installed-engines': () => ipcRenderer.invoke('plugin-resource:list-installed-engines'),
  'plugin-resource:list-supported-models': () => ipcRenderer.invoke('plugin-resource:list-supported-models'),
  'plugin-resource:list': (payload) => ipcRenderer.invoke('plugin-resource:list', payload),
  'plugin-resource:get': (payload) => ipcRenderer.invoke('plugin-resource:get', payload),
  'plugin-resource:install': (payload) => ipcRenderer.invoke('plugin-resource:install', payload),
  'plugin-resource:cancel': (payload) => ipcRenderer.invoke('plugin-resource:cancel', payload),
  'plugin-resource:is-installed': (payload) => ipcRenderer.invoke('plugin-resource:is-installed', payload),
  'plugin-resource:get-engine-path': (payload) => ipcRenderer.invoke('plugin-resource:get-engine-path', payload),
  'plugin-resource:get-model-path': (payload) => ipcRenderer.invoke('plugin-resource:get-model-path', payload),
  'plugin-resource:remove': (payload) => ipcRenderer.invoke('plugin-resource:remove', payload),
  'plugin-resource:get-download-dir': () => ipcRenderer.invoke('plugin-resource:get-download-dir'),
  'plugin-resource:set-download-dir': (payload) => ipcRenderer.invoke('plugin-resource:set-download-dir', payload),
  'plugin-resource:get-plugins-dir': () => ipcRenderer.invoke('plugin-resource:get-plugins-dir'),
  'plugin-resource:set-plugins-dir': (payload) => ipcRenderer.invoke('plugin-resource:set-plugins-dir', payload),
  'plugin-resource:get-concurrency': () => ipcRenderer.invoke('plugin-resource:get-concurrency'),
  'plugin-resource:set-concurrency': (payload) => ipcRenderer.invoke('plugin-resource:set-concurrency', payload),
  'plugin-resource:get-config': () => ipcRenderer.invoke('plugin-resource:get-config'),
  'plugin-resource:set-config': (payload) => ipcRenderer.invoke('plugin-resource:set-config', payload),
  'plugin-resource:check-network': () => ipcRenderer.invoke('plugin-resource:check-network')
};
