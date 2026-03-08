import { ipcRenderer } from 'electron';

import type { IpcParams, PartialByKey } from '../types';

export type Resource = {
  id: string;
  type:
  | 'image'
  | 'video'
  | 'audio'
  | 'text'
  | 'link'
  | 'file'
  | 'document'
  | 'translation'
  | 'summary'
  | 'mindmap'
  | 'note'
  | 'screenshot'
  | 'segments'
  | 'subtitle-edit'
  | 'tts-track'
  | 'media-track'
  | 'other';
  workspaceId?: string;
  folderId?: string;
  parentResourceId?: string; // 父资源ID（用于记录资源来源关系）
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

export type ResourceIpcParams = {
  'resource:add': IpcParams<[{ resource: PartialByKey<Resource, 'id' | 'type'> }], { success: true; data: Resource }>;
  'resource:list': IpcParams<[{ workspaceId?: string; deletedAt?: number }?], Resource[]>;
  /** 按父资源 ID 查询子资源列表 */
  'resource:listChildren': IpcParams<[{ parentResourceId: string; limit?: number; offset?: number }], Resource[]>;
  /** 获取字幕资源的 segments 数据（字级别时间戳） */
  'resource:getSegmentsData': IpcParams<[{ subtitleResourceId: string }], any[] | null>;
  /** 更新字幕资源的 segments 数据（字级别时间戳） */
  'resource:updateSegmentsData': IpcParams<[{ subtitleResourceId: string; segmentsData: any[] }], { success: boolean; error?: string }>;
  /** 删除数据库中现有的 segments 类型资源（迁移到项目文件夹后清理旧数据） */
  'resource:cleanupSegmentsResources': IpcParams<[{ subtitleResourceId?: string }], { success: boolean; deletedCount?: number; error?: string }>;
  getResource: IpcParams<[{ id: string }], Resource | undefined>;
  'resource:update': IpcParams<[{ id: string; patch: any }], { success: boolean; data?: any }>;
  deleteResource: IpcParams<[{ id: string }], { success: true }>;
  deleteResources: IpcParams<[{ ids: string[] }], { success: true }>;
  /** 永久删除资源（不经过回收站） */
  deleteResourcePermanently: IpcParams<[{ id: string }], { success: true; deleted: number }>;
  revealResource: IpcParams<[{ id: string }], { success: boolean }>;
  renameResource: IpcParams<[{ id: string; newName: string; renameFile?: boolean }], { success: boolean; fileRenamed?: boolean; newPath?: string }>;
  moveResourcesToWorkspace: IpcParams<[{ ids: string[]; workspaceId: string }], { moved: number }>;
  /** 批量移动资源到指定文件夹（或移出文件夹）。包含跨工作空间校验。 */
  'resource:moveToFolder': IpcParams<[{ ids: string[]; folderId: string | null; workspaceId?: string }], { success: boolean; moved?: number; invalid?: string[]; error?: string }>;
  rebuildResourceThumbnail: IpcParams<[{ id: string; size?: number; force?: boolean }], { success: boolean; data?: Resource; error?: string }>;
  cleanupThumbnails: IpcParams<[void], { success: boolean; removed?: number; error?: string }>;
  /** 上传原始文件数据到主进程，返回保存后的本地路径；若重复（同名且 hash 相同）则 duplicate=true */
  uploadResourceFile: IpcParams<
    [{ fileName: string; data: ArrayBuffer; workspaceId?: string | null; folderId?: string | null }],
    { success: boolean; filePath?: string; error?: string; duplicate?: boolean; hash?: string }
  >;
  /** 开始流式上传文件，返回 uploadId */
  uploadResourceFileStreamStart: IpcParams<[{ fileName: string; totalSize: number; workspaceId?: string | null; folderId?: string | null }], { success: boolean; uploadId?: string; error?: string }>;
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
  /** 导入本地文件（仅文件，支持多选） */
  'resource:importLocalFiles': IpcParams<[{ workspaceId?: string; folderId?: string }], { canceled: boolean; success?: boolean }>;
  /** 导入本地文件夹（仅文件夹，支持多选） */
  'resource:importLocalFolders': IpcParams<[{ workspaceId?: string; folderId?: string }], { canceled: boolean; success?: boolean }>;
  /** 保存截图：主进程创建/查找截图文件夹、写入文件、创建资源记录；渲染进程只传 data 与上下文 */
  'resource:saveScreenshot': IpcParams<
    [
      {
        data: ArrayBuffer;
        workspaceId?: string;
        folderId?: string | null;
        parentResourceId: string;
        currentTimeSeconds: number;
        parentTitle?: string;
      }
    ],
    { success: boolean; data?: Resource; error?: string }
  >;
  /** 保存录音：将麦克风录音保存为音频资源文件 */
  'resource:saveAudioRecording': IpcParams<
    [
      {
        data: ArrayBuffer;
        workspaceId?: string;
        folderId?: string | null;
        title?: string;
      }
    ],
    { success: boolean; data?: Resource; error?: string }
  >;
  /** 创建编排字幕轨道（存储在项目文件夹 data/tracks/ 中） */
  'resource:createSubtitleEditTrack': IpcParams<[{ parentResourceId: string; title: string }], { id: string; trackId: string; filePath: string }>;
  /** 获取编排字幕轨道列表 */
  'resource:getSubtitleEditTracks': IpcParams<
    [{ parentResourceId: string }],
    Array<{ id: string; trackId: string; title: string; filePath: string; segments: Array<{ index: number; text: string; st?: string; et?: string }> }>
  >;
  /** 删除编排字幕轨道（删除配置文件、更新项目元数据） */
  'resource:deleteSubtitleEditTrack': IpcParams<[{ parentResourceId: string; trackId: string }], { success: boolean; error?: string }>;
  /** 更新编排字幕轨道片段（更新配置文件中的 translatedSegments） */
  'resource:updateSubtitleEditTrack': IpcParams<
    [{ parentResourceId: string; trackId: string; segments: { st: string; et: string; text: string; index: number }[] }],
    { success: boolean; error?: string }
  >;
  /** 删除翻译轨道（删除翻译文件、更新项目元数据） */
  'resource:deleteTranslation': IpcParams<[{ parentResourceId: string; translationId: string }], { success: boolean; error?: string }>;
  /** 创建独立 TTS 轨道（tts-track 子资源） */
  'resource:createTTSTrack': IpcParams<
    [{ parentResourceId: string; title: string; voiceName: string; rate: number; pitch: number; autoTrimSilence: boolean }],
    { id: string; trackId: string; filePath: string }
  >;
  /** 获取独立 TTS 轨道列表 */
  'resource:getTTSTracks': IpcParams<
    [{ parentResourceId: string }],
    Array<{
      id: string;
      title: string;
      filePath: string;
      config: { voiceName: string; rate: number; pitch: number; autoTrimSilence: boolean };
      segments: Array<{ index: number; text: string; startTime: number; endTime: number; md5?: string }>;
    }>
  >;
  /** 更新 TTS 轨道配置或片段 */
  'resource:updateTTSTrack': IpcParams<
    [
      {
        parentResourceId: string;
        trackId: string;
        title?: string;
        config?: { voiceName?: string; rate?: number; pitch?: number; autoTrimSilence?: boolean };
        segments?: Array<{ index: number; text: string; startTime: number; endTime: number; md5?: string }>;
      }
    ],
    { success: boolean; error?: string }
  >;
  /** 删除 TTS 轨道（删除配置文件、音频目录、更新项目元数据） */
  'resource:deleteTTSTrack': IpcParams<[{ parentResourceId: string; trackId: string }], { success: boolean; error?: string }>;
  /** 创建媒体轨道（存储在项目文件夹 data/tracks/ 中） */
  'resource:createMediaTrack': IpcParams<[{ parentResourceId: string; trackId: string; label: string; zIndex: number; color?: string }], { id: string; trackId: string; filePath: string }>;
  /** 获取媒体轨道列表 */
  'resource:getMediaTracks': IpcParams<
    [{ parentResourceId: string }],
    Array<{
      id: string;
      trackId: string;
      title: string;
      label: string;
      zIndex: number;
      visible: boolean;
      locked: boolean;
      color?: string;
      segments: any[];
      sources: any[];
    }>
  >;
  /** 更新媒体轨道 */
  'resource:updateMediaTrack': IpcParams<
    [
      {
        parentResourceId: string;
        trackId: string;
        label?: string;
        zIndex?: number;
        visible?: boolean;
        locked?: boolean;
        color?: string;
        segments?: any[];
        sources?: any[];
      }
    ],
    { success: boolean; error?: string }
  >;
  /** 删除媒体轨道（删除配置文件、更新项目元数据） */
  'resource:deleteMediaTrack': IpcParams<[{ parentResourceId: string; trackId: string }], { success: boolean; error?: string }>;
  // ---- 资源项目目录管理 ----
  /** 获取资源项目目录路径（不创建目录） */
  'resource:getProjectPath': IpcParams<
    [{ resourceId: string; workspaceId: string }],
    { success: boolean; path?: string | null; error?: string }
  >;
  /** 确保资源项目目录存在（如果不存在则创建） */
  'resource:ensureProjectDir': IpcParams<
    [{ resourceId: string; workspaceId: string; subDirs?: Array<'outputs' | 'cache' | 'temp'> }],
    {
      success: boolean;
      path?: string;
      subDirs?: { outputs: string; cache: string; temp: string };
      error?: string;
    }
  >;
  /** 清空资源项目目录 */
  'resource:clearProjectDir': IpcParams<
    [{ resourceId: string; workspaceId: string; subDir?: 'outputs' | 'cache' | 'temp' }],
    { success: boolean; error?: string }
  >;
  /** 删除资源项目目录 */
  'resource:deleteProjectDir': IpcParams<[{ resourceId: string; workspaceId: string }], { success: boolean; error?: string }>;
  /** 获取资源项目目录统计信息 */
  'resource:getProjectStats': IpcParams<
    [{ resourceId: string; workspaceId: string }],
    {
      success: boolean;
      exists?: boolean;
      totalSize?: number;
      fileCount?: number;
      subDirs?: {
        outputs: { size: number; count: number };
        cache: { size: number; count: number };
        temp: { size: number; count: number };
      };
      error?: string;
    }
  >;
  /** 在资源项目目录中创建自定义子目录 */
  'resource:createProjectSubDir': IpcParams<
    [{ resourceId: string; workspaceId: string; dirName: string }],
    { success: boolean; path?: string; error?: string }
  >;
};

const methods: Array<keyof ResourceIpcParams> = [
  'resource:add',
  'resource:list',
  'resource:listChildren',
  'resource:getSegmentsData',
  'resource:updateSegmentsData',
  'resource:cleanupSegmentsResources',
  'getResource',
  'resource:update',
  'deleteResource',
  'deleteResources',
  'deleteResourcePermanently',
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
  'tags:backfill',
  'resource:importLocalFiles',
  'resource:importLocalFolders',
  'resource:saveScreenshot',
  'resource:saveAudioRecording',
  'resource:createSubtitleEditTrack',
  'resource:getSubtitleEditTracks',
  'resource:deleteSubtitleEditTrack',
  'resource:updateSubtitleEditTrack',
  'resource:deleteTranslation',
  'resource:createTTSTrack',
  'resource:getTTSTracks',
  'resource:updateTTSTrack',
  'resource:deleteTTSTrack',
  'resource:createMediaTrack',
  'resource:getMediaTracks',
  'resource:updateMediaTrack',
  'resource:deleteMediaTrack',
  // 资源项目目录
  'resource:getProjectPath',
  'resource:ensureProjectDir',
  'resource:clearProjectDir',
  'resource:deleteProjectDir',
  'resource:getProjectStats',
  'resource:createProjectSubDir'
];

export type ResourceIpcType = {
  [K in keyof ResourceIpcParams]: (...args: ResourceIpcParams[K]['request']) => Promise<ResourceIpcParams[K]['response']>;
};

const newIpc: Record<string, any> = {};
methods.forEach((m) => {
  newIpc[m] = (...args: ResourceIpcParams[typeof m]['request']) => ipcRenderer.invoke(m as string, ...args);
});

export const resourceIpcRenderer = newIpc as ResourceIpcType;
