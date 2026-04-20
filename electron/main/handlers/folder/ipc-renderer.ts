import { ipcRenderer } from 'electron';

import { IpcParams } from '../types';

export type Folder = {
  id: string;
  name: string;
  description?: string;
  parentId?: string | null;
  workspaceId?: string;
  originType?: 'workspace' | 'linked';
  linkedMountId?: string | null;
  relativePath?: string | null;
  metadata?: string; // JSON
  createdAt?: number;
  updatedAt?: number;
  deletedAt?: number | null;
  rank?: number;
};

export type FolderIpcParams = {
  'folder.create': IpcParams<[{ name: string; parentId?: string | null; workspaceId?: string; description?: string }], { success: boolean; data?: Folder; dirPath?: string; error?: string }>;
  'folder.rename': IpcParams<[{ id: string; name: string }], { success: boolean; data?: Folder; error?: string }>;
  'folder.move': IpcParams<[{ id: string; parentId: string | null; prevRank?: number; nextRank?: number }], { success: boolean; data?: Folder; error?: string }>;
  'folder.get': IpcParams<[{ id: string }], Folder | undefined>;
  'folder.getResolvedPath': IpcParams<[{ id?: string | null; workspaceId?: string }], { success: boolean; path?: string; originType?: 'workspace' | 'linked'; linkedMountId?: string; error?: string }>;
  'folder.linkLocalDirectory': IpcParams<
    [{ workspaceId?: string }],
    {
      success: boolean;
      canceled?: boolean;
      error?: string;
      data?: {
        rootFolderId: string;
        mountId: string;
        stats: {
          folderCount: number;
          resourceCount: number;
          restoredFolderCount: number;
          restoredResourceCount: number;
          hiddenFolderCount: number;
          hiddenResourceCount: number;
          conflictCount: number;
          thumbnailCount: number;
        };
        reactivated: boolean;
        alreadyLinked: boolean;
      };
    }
  >;
  'folder.rescanLinkedDirectory': IpcParams<
    [{ rootFolderId: string }],
    {
      success: boolean;
      error?: string;
      data?: {
        rootFolderId: string;
        mountId: string;
        stats: {
          folderCount: number;
          resourceCount: number;
          restoredFolderCount: number;
          restoredResourceCount: number;
          hiddenFolderCount: number;
          hiddenResourceCount: number;
          conflictCount: number;
          thumbnailCount: number;
        };
      };
    }
  >;
  'folder.unlinkLocalDirectory': IpcParams<
    [{ rootFolderId: string }],
    {
      success: boolean;
      canceled?: boolean;
      error?: string;
      data?: {
        mountId: string;
        hiddenFolderCount: number;
        hiddenResourceCount: number;
      };
    }
  >;
  'folder.recreateLinkedMissingDirectory': IpcParams<
    [{ folderId: string }],
    {
      success: boolean;
      error?: string;
      data?: {
        folderId: string;
        path: string;
        rootFolderId: string;
        stats: {
          folderCount: number;
          resourceCount: number;
          restoredFolderCount: number;
          restoredResourceCount: number;
          hiddenFolderCount: number;
          hiddenResourceCount: number;
          conflictCount: number;
          thumbnailCount: number;
        };
      };
    }
  >;
  'folder.reconnectLinkedMissingDirectory': IpcParams<
    [{ folderId: string }],
    {
      success: boolean;
      canceled?: boolean;
      error?: string;
      data?: {
        folderId: string;
        rootFolderId: string;
        relativePath: string;
        path: string;
        stats: {
          folderCount: number;
          resourceCount: number;
          restoredFolderCount: number;
          restoredResourceCount: number;
          hiddenFolderCount: number;
          hiddenResourceCount: number;
          conflictCount: number;
          thumbnailCount: number;
        };
      };
    }
  >;
  'folder.ignoreLinkedMissingDirectory': IpcParams<
    [{ folderId: string }],
    {
      success: boolean;
      error?: string;
      data?: {
        folderId: string;
        rootFolderId: string;
        hiddenFolderCount: number;
        rescanError?: string;
        stats?: {
          folderCount: number;
          resourceCount: number;
          restoredFolderCount: number;
          restoredResourceCount: number;
          hiddenFolderCount: number;
          hiddenResourceCount: number;
          conflictCount: number;
          thumbnailCount: number;
        };
      };
    }
  >;
  'folder.list': IpcParams<[{ workspaceId?: string; parentId?: string | null; deletedAt?: 0 | 1 }], Folder[]>;
  'folder.softDelete': IpcParams<[{ ids: string[] }], { success: boolean; data: Folder[] }>;
  'folder.restore': IpcParams<[{ ids: string[] }], { success: boolean; data: Folder[] }>;
  'folder.delete': IpcParams<[{ ids: string[]; deleteChildren?: boolean }], { success: boolean; deleted: number }>;
  'folder.toggleLinkedMountWatcher': IpcParams<
    [{ rootFolderId: string; enabled: boolean }],
    { success: boolean; error?: string; data?: { watchEnabled: boolean } }
  >;
  'folder.deleteLinkedRoot': IpcParams<
    [{ rootFolderId: string }],
    {
      success: boolean;
      canceled?: boolean;
      error?: string;
      data?: { mountId: string; deletedFolderCount: number; deletedResourceCount: number };
    }
  >;
  'folder.getMasonryLayout': IpcParams<[{ folderId: string }], { success: boolean; data?: any; error?: string }>;
  'folder.saveMasonryLayout': IpcParams<[{ folderId: string; layout: any }], { success: boolean; error?: string }>;
};

const methods: Array<keyof FolderIpcParams> = [
  'folder.create',
  'folder.rename',
  'folder.move',
  'folder.get',
  'folder.getResolvedPath',
  'folder.linkLocalDirectory',
  'folder.rescanLinkedDirectory',
  'folder.unlinkLocalDirectory',
  'folder.recreateLinkedMissingDirectory',
  'folder.reconnectLinkedMissingDirectory',
  'folder.ignoreLinkedMissingDirectory',
  'folder.list',
  'folder.softDelete',
  'folder.restore',
  'folder.delete',
  'folder.toggleLinkedMountWatcher',
  'folder.deleteLinkedRoot',
  'folder.getMasonryLayout',
  'folder.saveMasonryLayout'
];

export type FolderIpcType = {
  [K in keyof FolderIpcParams]: (...args: FolderIpcParams[K]['request']) => Promise<FolderIpcParams[K]['response']>;
};

const newIpc: Record<string, any> = {};
methods.forEach((m) => {
  newIpc[m] = (...args: FolderIpcParams[typeof m]['request']) => ipcRenderer.invoke(m as string, ...args);
});

export const folderIpcRenderer = newIpc as FolderIpcType;
