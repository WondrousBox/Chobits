import { ipcRenderer } from 'electron';

import type { IpcParams } from '../types';

export type SystemIpcParams = {
  // Database
  'database:getPath': IpcParams<[], { ok: boolean; path?: string; dir?: string; error?: string }>;
  'database:openLocation': IpcParams<[], { ok: boolean; error?: string }>;

  // Logs
  'logs:getPath': IpcParams<[], { ok: boolean; dir?: string; error?: string }>;
  'logs:openLocation': IpcParams<[], { ok: boolean; error?: string }>;
};

const methods: Array<keyof SystemIpcParams> = ['database:getPath', 'database:openLocation', 'logs:getPath', 'logs:openLocation'];

export type SystemIpcType = {
  [K in keyof SystemIpcParams]: (...args: SystemIpcParams[K]['request']) => Promise<SystemIpcParams[K]['response']>;
};

const newIpc: Record<string, any> = {};
methods.forEach((m) => {
  newIpc[m] = (...args: any[]) => ipcRenderer.invoke(m as string, ...args);
});

export const systemIpcRenderer = newIpc as SystemIpcType;
