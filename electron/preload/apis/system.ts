import { ipcRenderer } from 'electron';
import type { IPCParams } from '../type';

export type SystemBridgeParams = {
  // Database
  'database:getPath': IPCParams<[], { ok: boolean; path?: string; dir?: string; error?: string }>;
  'database:openLocation': IPCParams<[], { ok: boolean; error?: string }>;

  // Logs
  'logs:getPath': IPCParams<[], { ok: boolean; dir?: string; error?: string }>;
  'logs:openLocation': IPCParams<[], { ok: boolean; error?: string }>;
};

const methods: Array<keyof SystemBridgeParams> = ['database:getPath', 'database:openLocation', 'logs:getPath', 'logs:openLocation'];

export type SystemBridgeType = {
  [K in keyof SystemBridgeParams]: (...args: SystemBridgeParams[K]['request']) => Promise<SystemBridgeParams[K]['response']>;
};

const bridge: Record<string, any> = {};
methods.forEach((m) => {
  bridge[m] = (...args: any[]) => ipcRenderer.invoke(m as string, ...args);
});

export const systemBridge = bridge as SystemBridgeType;
