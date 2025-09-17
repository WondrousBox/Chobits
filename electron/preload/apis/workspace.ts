import { ipcRenderer } from 'electron';
import type { IPCParams } from '../type';

export type Workspace = {
  id: string;
  name: string;
  rootPath: string;
  description?: string;
  isDefault?: 0 | 1;
  status?: 'active' | 'archived' | 'error';
  sizeBytes?: number;
  fileCount?: number;
  lastScanAt?: number;
  metadata?: string; // JSON string
  createdAt?: number;
  updatedAt?: number;
  deletedAt?: number | null;
};

export type WorkspaceBridgeParams = {
  'workspace:add': IPCParams<[{ workspace: Workspace }], { success: true }>;
  'workspace:list': IPCParams<[{ filter?: Partial<Workspace>; limit?: number; offset?: number }], Workspace[]>;
  'workspace:get': IPCParams<[{ id: string }], Workspace | undefined>;
  'workspace:getDefault': IPCParams<[void], Workspace | undefined>;
  'workspace:setDefault': IPCParams<[{ id: string }], { success: true }>;
  'workspace:update': IPCParams<[{ id: string; patch: Partial<Workspace> }], { updated: number }>;
  'workspace:delete': IPCParams<[{ id: string; hard?: boolean }], { deleted: number }>;
  'workspace:ensureDir': IPCParams<[{ id: string }], { ok: boolean; path?: string; created?: boolean }>;
  'workspace:pickDir': IPCParams<[void], { canceled: boolean; path?: string }>;
  'workspace:open': IPCParams<[{ id: string }], { ok: boolean }>;
  'workspace:reveal': IPCParams<[{ id: string }], { ok: boolean }>;
  'workspace:scanStats': IPCParams<[{ id: string }], { ok: boolean; sizeBytes?: number; fileCount?: number }>;
};

const methods: Array<keyof WorkspaceBridgeParams> = [
  'workspace:add',
  'workspace:list',
  'workspace:get',
  'workspace:getDefault',
  'workspace:setDefault',
  'workspace:update',
  'workspace:delete',
  'workspace:ensureDir',
  'workspace:pickDir',
  'workspace:open',
  'workspace:reveal',
  'workspace:scanStats',
];

export type WorkspaceBridgeType = {
  [K in keyof WorkspaceBridgeParams]: (
    ...args: WorkspaceBridgeParams[K]['request']
  ) => Promise<WorkspaceBridgeParams[K]['response']>;
};

const bridge: Record<string, any> = {};
methods.forEach((m) => {
  bridge[m] = (...args: any[]) => ipcRenderer.invoke(m as string, ...args);
});

export const workspaceBridge = bridge as WorkspaceBridgeType;
