import { ipcRenderer } from 'electron';

import type { IpcParams, PartialByKey, ResParams } from '../types';

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

export type WorkspaceIpcParams = {
  'workspace:quickStart': IpcParams<[void], ResParams<Workspace>>;
  'workspace:add': IpcParams<[{ workspace: PartialByKey<Workspace, 'id'> }], ResParams<Workspace>>;
  'workspace:list': IpcParams<[{ filter?: Partial<Workspace>; limit?: number; offset?: number }], Workspace[]>;
  'workspace:get': IpcParams<[{ id: string }], Workspace | undefined>;
  'workspace:getDefault': IpcParams<[void], Workspace | undefined>;
  'workspace:setDefault': IpcParams<[{ id: string }], { success: true }>;
  'workspace:update': IpcParams<[{ id: string; patch: Partial<Workspace> }], { updated: number }>;
  'workspace:delete': IpcParams<[{ id: string; hard?: boolean }], { deleted: number }>;
  'workspace:open': IpcParams<[{ id: string }], { ok: boolean }>;
  'workspace:scanStats': IpcParams<[{ id: string }], { ok: boolean; sizeBytes?: number; fileCount?: number }>;
  'workspace:export': IpcParams<[{ id: string; destPath: string }], { success: boolean; error?: string }>;
  'workspace:import': IpcParams<[{ sourcePath: string; name: string; rootPath: string }], { success: boolean; workspaceId?: string; error?: string }>;
};

const methods: Array<keyof WorkspaceIpcParams> = [
  'workspace:quickStart',
  'workspace:add',
  'workspace:list',
  'workspace:get',
  'workspace:getDefault',
  'workspace:setDefault',
  'workspace:update',
  'workspace:delete',
  'workspace:open',
  'workspace:scanStats',
  'workspace:export',
  'workspace:import'
];

export type WorkspaceIpcType = {
  [K in keyof WorkspaceIpcParams]: (...args: WorkspaceIpcParams[K]['request']) => Promise<WorkspaceIpcParams[K]['response']>;
};

const newIpc: Record<string, any> = {};
methods.forEach((m) => {
  newIpc[m] = (...args: any[]) => ipcRenderer.invoke(m as string, ...args);
});

export const workspaceIpcRenderer = newIpc as WorkspaceIpcType;
