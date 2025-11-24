import { ipcRenderer } from 'electron';

import { IpcParams } from './types';

export type Folder = {
  id: string;
  name: string;
  description?: string;
  parentId?: string | null;
  workspaceId?: string;
  metadata?: string; // JSON
  createdAt?: number;
  updatedAt?: number;
  deletedAt?: number | null;
};

export type FolderBridgeParams = {
  'folder.create': IpcParams<[{ name: string; parentId?: string | null; workspaceId?: string; description?: string }], { success: boolean; data?: Folder; dirPath?: string; error?: string }>;
  'folder.rename': IpcParams<[{ id: string; name: string }], { success: boolean; data?: Folder; error?: string }>;
  'folder.move': IpcParams<[{ id: string; parentId: string | null }], { success: boolean; data?: Folder; error?: string }>;
  'folder.get': IpcParams<[{ id: string }], Folder | undefined>;
  'folder.list': IpcParams<[{ workspaceId?: string; parentId?: string | null; deletedAt?: 0 | 1 }], Folder[]>;
  'folder.softDelete': IpcParams<[{ ids: string[] }], { success: boolean; data: Folder[] }>;
  'folder.restore': IpcParams<[{ ids: string[] }], { success: boolean; data: Folder[] }>;
  'folder.delete': IpcParams<[{ ids: string[]; deleteChildren?: boolean }], { success: boolean; deleted: number }>;
  'folder.getMasonryLayout': IpcParams<[{ folderId: string }], { success: boolean; data?: any; error?: string }>;
  'folder.saveMasonryLayout': IpcParams<[{ folderId: string; layout: any }], { success: boolean; error?: string }>;
};

const methods: Array<keyof FolderBridgeParams> = [
  'folder.create',
  'folder.rename',
  'folder.move',
  'folder.get',
  'folder.list',
  'folder.softDelete',
  'folder.restore',
  'folder.delete',
  'folder.getMasonryLayout',
  'folder.saveMasonryLayout'
];

export type FolderIpcType = {
  [K in keyof FolderBridgeParams]: (...args: FolderBridgeParams[K]['request']) => Promise<FolderBridgeParams[K]['response']>;
};

const newIpc: Record<string, any> = {};
methods.forEach((m) => {
  newIpc[m] = (...args: FolderBridgeParams[typeof m]['request']) => ipcRenderer.invoke(m as string, ...args);
});

export const folderBridge = newIpc as FolderIpcType;
