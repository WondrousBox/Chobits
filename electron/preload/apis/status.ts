import type { CharacterProfile } from '@packages/common/types/status';
import { ipcRenderer } from 'electron';

import type { IpcParams } from '../type';

export type { CharacterProfile } from '@packages/common/types/status';

export type StatusBridgeParams = {
  'sprite:character:get-profile': IpcParams<[void], { ok: boolean; profile: CharacterProfile }>;
};

const methods: Array<keyof StatusBridgeParams> = ['sprite:character:get-profile'];

export type StatusBridgeType = {
  [K in keyof StatusBridgeParams]: (...args: StatusBridgeParams[K]['request']) => Promise<StatusBridgeParams[K]['response']>;
};

const bridge: Record<string, any> = {};
methods.forEach((m) => {
  bridge[m] = (...args: any[]) => ipcRenderer.invoke(m as string, ...args);
});

export const statusBridge = bridge as StatusBridgeType;
