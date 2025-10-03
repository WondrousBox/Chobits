import { ipcRenderer } from 'electron';
import type { IPCParams } from '../type';

export type DatabaseBridgeParams = {
  'database:getPath': IPCParams<[], { ok: boolean; path?: string; dir?: string; error?: string }>;
  'database:openLocation': IPCParams<[], { ok: boolean; error?: string }>;
};

const methods: Array<keyof DatabaseBridgeParams> = [
  'database:getPath',
  'database:openLocation',
];

export type DatabaseBridgeType = {
  [K in keyof DatabaseBridgeParams]: (
    ...args: DatabaseBridgeParams[K]['request']
  ) => Promise<DatabaseBridgeParams[K]['response']>;
};

const bridge: Record<string, any> = {};
methods.forEach(m => {
  bridge[m] = (...args: any[]) => ipcRenderer.invoke(m as string, ...args);
});

export const databaseBridge = bridge as DatabaseBridgeType;
