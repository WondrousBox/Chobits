import { ipcRenderer } from 'electron';

import type { IPCParams } from '../type';

export type RoleProfile = {
  name: string;
  mood?: string;
  level?: number;
  favor?: number;
  description?: string;
};

export type StatusBridgeParams = {
  'status:getRole': IPCParams<[void], { ok: boolean; role: RoleProfile }>;
  'status:updateRole': IPCParams<[{ patch: Partial<RoleProfile> }], { ok: boolean; role: RoleProfile }>;
};

const methods: Array<keyof StatusBridgeParams> = ['status:getRole', 'status:updateRole'];

export type StatusBridgeType = {
  [K in keyof StatusBridgeParams]: (...args: StatusBridgeParams[K]['request']) => Promise<StatusBridgeParams[K]['response']>;
};

const bridge: Record<string, any> = {};
methods.forEach((m) => {
  bridge[m] = (...args: any[]) => ipcRenderer.invoke(m as string, ...args);
});

export const statusBridge = bridge as StatusBridgeType;
