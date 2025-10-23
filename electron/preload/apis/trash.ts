import { ipcRenderer } from 'electron';
import { IPCParams } from '../type';

export type TrashItem = {
  id: string;
  entityType: 'document' | 'resource' | 'conversation';
  entityId: string;
  title?: string | null;
  summary?: string | null;
  reason?: string | null;
  deletedAt?: number | null;
  deletedBy?: string | null;
  payload?: string | null;
  expireAt?: number | null;
};

export type TrashBridgeParams = {
  'trash:list': IPCParams<[{ filter?: Partial<TrashItem>; limit?: number; offset?: number }], TrashItem[]>;
  'trash:restore': IPCParams<[{ recycleIds: string[] }], { restored: number }>;
  'trash:purge': IPCParams<[{ recycleIds: string[] }], { deleted: number }>;
  'trash:empty': IPCParams<[{ filter?: Partial<TrashItem> }], { deleted: number }>;
};

const methods: Array<keyof TrashBridgeParams> = ['trash:list', 'trash:restore', 'trash:purge', 'trash:empty'];

export type TrashBridgeType = {
  [K in keyof TrashBridgeParams]: (...args: TrashBridgeParams[K]['request']) => Promise<TrashBridgeParams[K]['response']>;
};

const bridge: Record<string, any> = {};
methods.forEach((m) => {
  bridge[m] = (...args: any[]) => ipcRenderer.invoke(m as string, ...args);
});

export const trashBridge = bridge as TrashBridgeType;
