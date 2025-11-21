import { ipcRenderer } from 'electron';

import { IPCParams } from '../type';

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
  'folder.create': IPCParams<[{ name: string; parentId?: string | null; workspaceId?: string; description?: string }], { success: boolean; data?: Folder; dirPath?: string; error?: string }>;
  'folder.rename': IPCParams<[{ id: string; name: string }], { success: boolean; data?: Folder; error?: string }>;
  'folder.move': IPCParams<[{ id: string; parentId: string | null }], { success: boolean; data?: Folder; error?: string }>;
  'folder.get': IPCParams<[{ id: string }], Folder | undefined>;
  'folder.list': IPCParams<[{ workspaceId?: string; parentId?: string | null; deletedAt?: 0 | 1 }], Folder[]>;
  'folder.softDelete': IPCParams<[{ ids: string[] }], { success: boolean; data: Folder[] }>;
  'folder.restore': IPCParams<[{ ids: string[] }], { success: boolean; data: Folder[] }>;
  'folder.delete': IPCParams<[{ ids: string[]; deleteChildren?: boolean }], { success: boolean; deleted: number }>;
  'folder.getMasonryLayout': IPCParams<[{ folderId: string }], { success: boolean; data?: any; error?: string }>;
  'folder.saveMasonryLayout': IPCParams<[{ folderId: string; layout: any }], { success: boolean; error?: string }>;
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

export type FolderBridgeType = {
  [K in keyof FolderBridgeParams]: (...args: FolderBridgeParams[K]['request']) => Promise<FolderBridgeParams[K]['response']>;
};

const bridge: Record<string, any> = {};
methods.forEach((m) => {
  bridge[m] = (...args: FolderBridgeParams[typeof m]['request']) => ipcRenderer.invoke(m as string, ...args);
});

export const folderBridge = bridge as FolderBridgeType;
