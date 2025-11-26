import { ipcRenderer } from 'electron';

import { IpcParams } from '../types';

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

export type TrashIpcParams = {
  'trash:list': IpcParams<[{ filter?: Partial<TrashItem>; limit?: number; offset?: number }], TrashItem[]>;
  'trash:restore': IpcParams<[{ recycleIds: string[] }], { restored: number }>;
  'trash:purge': IpcParams<[{ recycleIds: string[] }], { deleted: number }>;
  'trash:empty': IpcParams<[{ filter?: Partial<TrashItem> }], { deleted: number }>;
};

const methods: Array<keyof TrashIpcParams> = ['trash:list', 'trash:restore', 'trash:purge', 'trash:empty'];

export type TrashIpcType = {
  [K in keyof TrashIpcParams]: (...args: TrashIpcParams[K]['request']) => Promise<TrashIpcParams[K]['response']>;
};

const newIpc: Record<string, any> = {};
methods.forEach((m) => {
  newIpc[m] = (...args: any[]) => ipcRenderer.invoke(m as string, ...args);
});

export const trashIpcRenderer = newIpc as TrashIpcType;
