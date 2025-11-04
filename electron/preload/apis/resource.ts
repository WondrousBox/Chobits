import { ipcRenderer } from 'electron';
import { IPCParams, PartialByKey } from '../type';

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
  'resource:add': IPCParams<[{ resource: PartialByKey<Resource, 'id'> }], { success: true; data: Resource }>;
  'resource:list': IPCParams<[void], Resource[]>;
  getResource: IPCParams<[{ id: string }], Resource | undefined>;
  updateResource: IPCParams<[{ id: string; patch: any }], { success: boolean; data?: any }>;
  deleteResource: IPCParams<[{ id: string }], { success: true }>;
  deleteResources: IPCParams<[{ ids: string[] }], { success: true }>;
  openResource: IPCParams<[{ id: string }], { success: boolean }>;
  revealResource: IPCParams<[{ id: string }], { success: boolean }>;
  renameResource: IPCParams<[{ id: string; newName: string; renameFile?: boolean }], { success: boolean; fileRenamed?: boolean; newPath?: string }>;
  moveResourcesToWorkspace: IPCParams<[{ ids: string[]; workspaceId: string }], { moved: number }>;
  /** 批量移动资源到指定文件夹（或移出文件夹）。包含跨工作空间校验。 */
  'resource:moveToFolder': IPCParams<[{ ids: string[]; folderId: string | null; workspaceId?: string }], { success: boolean; moved?: number; invalid?: string[]; error?: string }>;
  rebuildResourceThumbnail: IPCParams<[{ id: string; size?: number; force?: boolean }], { success: boolean; data?: Resource; error?: string }>;
  cleanupThumbnails: IPCParams<[void], { success: boolean; removed?: number; error?: string }>;
  /** 上传原始文件数据到主进程，返回保存后的本地路径；若重复（同名且 hash 相同）则 duplicate=true */
  uploadResourceFile: IPCParams<[{ fileName: string; data: ArrayBuffer }], { success: boolean; filePath?: string; error?: string; duplicate?: boolean; hash?: string }>;
  /** 标签聚合列表（默认按当前默认工作空间；scope=global 时全局） */
  'tags:listAll': IPCParams<[{ workspaceId?: string; scope?: 'workspace' | 'global' }], Array<{ tag: string; count: number }>>;
  /** 按标签筛选资源 */
  listResourcesByTag: IPCParams<[{ tag: string; workspaceId?: string; includeDeleted?: boolean; limit?: number; offset?: number }], Resource[]>;
  /** 从 resources.tags 回填 resource_tags（默认按当前默认工作空间） */
  'tags:backfill': IPCParams<[{ workspaceId?: string }], { success: boolean; processed: number }>;
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
  'tags:listAll',
  'listResourcesByTag',
  'tags:backfill'
];

export type ResourceBridgeType = {
  [K in keyof ResourceBridgeParams]: (...args: ResourceBridgeParams[K]['request']) => Promise<ResourceBridgeParams[K]['response']>;
};

const bridge: Record<string, any> = {};
methods.forEach((m) => {
  bridge[m] = (...args: ResourceBridgeParams[typeof m]['request']) => ipcRenderer.invoke(m as string, ...args);
});

export const resourceBridge = bridge as ResourceBridgeType;
