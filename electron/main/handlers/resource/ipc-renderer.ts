import { ipcRenderer } from 'electron';

import type { IpcParams, PartialByKey } from './types';

export type Resource = {
  id: string;
  type: 'image' | 'video' | 'audio' | 'text' | 'link' | 'file' | 'document' | 'other';
  workspaceId?: string;
  title?: string;
  description?: string;
  url?: string;
  domain?: string;
  sourceName?: string;
  authorName?: string;
  language?: string;
  mimeType?: string;
  sizeBytes?: number;
  durationMs?: number;
  width?: number;
  height?: number;
  filePath?: string;
  contentText?: string;
  thumbnail?: ArrayBuffer | Uint8Array;
  thumbnailPath?: string;
  previewUrl?: string;
  tags?: string; // JSON string
  categories?: string; // JSON string
  visibility?: 'private' | 'unlisted' | 'public';
  nsfw?: 0 | 1;
  favorite?: 0 | 1;
  rating?: number;
  status?: 'new' | 'processing' | 'ready' | 'archived' | 'error';
  collectedAt?: number;
  publishedAt?: number;
  createdAt?: number;
  updatedAt?: number;
  metadata?: string; // JSON string
  embedding?: ArrayBuffer | Uint8Array;
};

export type ResourceBridgeParams = {
  'resource:add': IpcParams<[{ resource: PartialByKey<Resource, 'id'> }], { success: true; data: Resource }>;
  'resource:list': IpcParams<[void], Resource[]>;
  getResource: IpcParams<[{ id: string }], Resource | undefined>;
  updateResource: IpcParams<[{ id: string; patch: any }], { success: boolean; data?: any }>;
  deleteResource: IpcParams<[{ id: string }], { success: true }>;
  deleteResources: IpcParams<[{ ids: string[] }], { success: true }>;
  openResource: IpcParams<[{ id: string }], { success: boolean }>;
  revealResource: IpcParams<[{ id: string }], { success: boolean }>;
  renameResource: IpcParams<[{ id: string; newName: string; renameFile?: boolean }], { success: boolean; fileRenamed?: boolean; newPath?: string }>;
  moveResourcesToWorkspace: IpcParams<[{ ids: string[]; workspaceId: string }], { moved: number }>;
  /** 批量移动资源到指定文件夹（或移出文件夹）。包含跨工作空间校验。 */
  'resource:moveToFolder': IpcParams<[{ ids: string[]; folderId: string | null; workspaceId?: string }], { success: boolean; moved?: number; invalid?: string[]; error?: string }>;
  rebuildResourceThumbnail: IpcParams<[{ id: string; size?: number; force?: boolean }], { success: boolean; data?: Resource; error?: string }>;
  cleanupThumbnails: IpcParams<[void], { success: boolean; removed?: number; error?: string }>;
  /** 上传原始文件数据到主进程，返回保存后的本地路径；若重复（同名且 hash 相同）则 duplicate=true */
  uploadResourceFile: IpcParams<[{ fileName: string; data: ArrayBuffer }], { success: boolean; filePath?: string; error?: string; duplicate?: boolean; hash?: string }>;
  /** 开始流式上传文件，返回 uploadId */
  uploadResourceFileStreamStart: IpcParams<[{ fileName: string; totalSize: number }], { success: boolean; uploadId?: string; error?: string }>;
  /** 发送文件数据块 */
  uploadResourceFileStreamChunk: IpcParams<[{ uploadId: string; chunk: ArrayBuffer; chunkIndex: number }], { success: boolean; error?: string }>;
  /** 结束流式上传，返回保存后的本地路径；若重复（同名且 hash 相同）则 duplicate=true */
  uploadResourceFileStreamEnd: IpcParams<[{ uploadId: string }], { success: boolean; filePath?: string; error?: string; duplicate?: boolean; hash?: string }>;
  /** 标签聚合列表（默认按当前默认工作空间；scope=global 时全局） */
  'tags:listAll': IpcParams<[{ workspaceId?: string; scope?: 'workspace' | 'global' }], Array<{ tag: string; count: number }>>;
  /** 按标签筛选资源 */
  listResourcesByTag: IpcParams<[{ tag: string; workspaceId?: string; includeDeleted?: boolean; limit?: number; offset?: number }], Resource[]>;
  /** 从 resources.tags 回填 resource_tags（默认按当前默认工作空间） */
  'tags:backfill': IpcParams<[{ workspaceId?: string }], { success: boolean; processed: number }>;
};

const methods: Array<keyof ResourceBridgeParams> = [
  'resource:add',
  'resource:list',
  'getResource',
  'updateResource',
  'deleteResource',
  'deleteResources',
  'openResource',
  'revealResource',
  'renameResource',
  'moveResourcesToWorkspace',
  'resource:moveToFolder',
  'rebuildResourceThumbnail',
  'cleanupThumbnails',
  'uploadResourceFile',
  'uploadResourceFileStreamStart',
  'uploadResourceFileStreamChunk',
  'uploadResourceFileStreamEnd',
  'tags:listAll',
  'listResourcesByTag',
  'tags:backfill'
];

export type ResourceIpcType = {
  [K in keyof ResourceBridgeParams]: (...args: ResourceBridgeParams[K]['request']) => Promise<ResourceBridgeParams[K]['response']>;
};

const newIpc: Record<string, any> = {};
methods.forEach((m) => {
  newIpc[m] = (...args: ResourceBridgeParams[typeof m]['request']) => ipcRenderer.invoke(m as string, ...args);
});

export const resourceIpcRenderer = newIpc as ResourceIpcType;
