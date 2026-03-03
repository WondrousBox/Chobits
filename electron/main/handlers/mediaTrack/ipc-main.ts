import { ipcMain } from 'electron';
import fs from 'fs-extra';
import * as path from 'path';

import { ResourcesRepo, WorkspacesRepo } from '../../db/repositories';

/**
 * 媒体轨道数据结构 V1
 */
export interface MediaTrackDataV1 {
  version: 1;
  tracks: MediaTrackData[];
  sources: Record<string, MediaSource>;
  updatedAt: number;
}

export type MediaTrackDataStorage = MediaTrackDataV1;

// 类型定义（与前端 types.ts 保持一致）
export interface MediaSource {
  id: string;
  path: string;
  type: 'video' | 'image';
  duration?: number;
  width: number;
  height: number;
}

export interface MediaTransform {
  x: number;
  y: number;
  scale: number;
  rotation: number;
  opacity: number;
  flipX: boolean;
  flipY: boolean;
}

export interface MediaTransition {
  type: 'none' | 'fade' | 'dissolve' | 'wipe-left' | 'wipe-right';
  duration: number;
}

export interface MediaThumbnail {
  url: string;
  timeOffset: number;
  width: number;
  height: number;
}

export interface MediaSegment {
  id: string;
  sourceId: string;
  timelineStart: number;
  timelineEnd: number;
  sourceStart?: number;
  sourceEnd?: number;
  playbackRate: number;
  muted: boolean;
  volume: number;
  transform: MediaTransform;
  transitionIn?: MediaTransition;
  transitionOut?: MediaTransition;
  thumbnails?: MediaThumbnail[];
  label?: string;
  disabled?: boolean;
  deleted?: boolean;
}

export interface MediaTrackData {
  id: string;
  label: string;
  segments: MediaSegment[];
  zIndex: number;
  visible: boolean;
  locked: boolean;
  color?: string;
  height?: number;
}

/**
 * 获取媒体轨道数据文件路径
 * 存储路径: <workspace>/resources/folders/<folderId>/mediaTracks/<resourceId>.json
 */
async function getMediaTrackFilePath(resourceId: string): Promise<string | null> {
  const resource = await ResourcesRepo.getById(resourceId);

  if (!resource) {
    console.warn(`[MediaTrack] 资源不存在: ${resourceId}`);
    return null;
  }

  if (!resource.folderId) {
    console.warn(`[MediaTrack] 资源不在任何文件夹中: ${resourceId}`);
    return null;
  }

  const workspaceId = resource.workspaceId;
  const workspace = workspaceId ? await WorkspacesRepo.getById(workspaceId) : await WorkspacesRepo.getDefault();

  if (!workspace || !workspace.rootPath) {
    console.warn(`[MediaTrack] 工作空间根路径不存在`);
    return null;
  }

  return path.join(workspace.rootPath, 'resources', 'folders', resource.folderId, 'mediaTracks', `${resourceId}.json`);
}

/**
 * 加载媒体轨道数据
 */
export async function loadMediaTrackData(resourceId: string): Promise<MediaTrackDataStorage | null> {
  try {
    const filePath = await getMediaTrackFilePath(resourceId);

    if (!filePath) {
      return null;
    }

    if (!(await fs.pathExists(filePath))) {
      console.log(`[MediaTrack] 媒体轨道数据文件不存在: ${filePath}`);
      return null;
    }

    const content = await fs.readFile(filePath, 'utf8');
    const data = JSON.parse(content) as MediaTrackDataStorage;

    console.log(`[MediaTrack] 加载媒体轨道数据成功: ${resourceId}, ${data.tracks?.length || 0} 个轨道, ${Object.keys(data.sources || {}).length} 个源`);
    return data;
  } catch (error) {
    console.error(`[MediaTrack] 加载媒体轨道数据失败: ${resourceId}`, error);
    return null;
  }
}

/**
 * 保存媒体轨道数据
 */
export async function saveMediaTrackData(resourceId: string, tracks: MediaTrackData[], sources: Record<string, MediaSource>): Promise<{ success: boolean; error?: string }> {
  try {
    const filePath = await getMediaTrackFilePath(resourceId);

    if (!filePath) {
      return { success: false, error: '资源不在任何文件夹中，无法保存媒体轨道数据' };
    }

    const dir = path.dirname(filePath);
    await fs.ensureDir(dir);

    const data: MediaTrackDataStorage = {
      version: 1,
      tracks,
      sources,
      updatedAt: Date.now()
    };

    await fs.writeFile(filePath, JSON.stringify(data, null, 2), 'utf8');

    console.log(`[MediaTrack] 保存媒体轨道数据成功: ${resourceId}, ${tracks.length} 个轨道, ${Object.keys(sources).length} 个源`);
    return { success: true };
  } catch (error: any) {
    console.error(`[MediaTrack] 保存媒体轨道数据失败: ${resourceId}`, error);
    return { success: false, error: error?.message || 'unknown' };
  }
}

/**
 * 删除媒体轨道数据
 */
export async function deleteMediaTrackData(resourceId: string): Promise<{ success: boolean }> {
  try {
    const filePath = await getMediaTrackFilePath(resourceId);

    if (!filePath) {
      return { success: true };
    }

    if (await fs.pathExists(filePath)) {
      await fs.remove(filePath);
      console.log(`[MediaTrack] 删除媒体轨道数据成功: ${resourceId}`);
    }

    return { success: true };
  } catch (error) {
    console.error(`[MediaTrack] 删除媒体轨道数据失败: ${resourceId}`, error);
    return { success: false };
  }
}

/**
 * 初始化 IPC 处理器
 */
export function initMediaTrackHandlers(): void {
  ipcMain.handle('mediaTrack:load', async (_event, payload: { resourceId: string }) => {
    return loadMediaTrackData(payload.resourceId);
  });

  ipcMain.handle('mediaTrack:save', async (_event, payload: { resourceId: string; tracks: MediaTrackData[]; sources: Record<string, MediaSource> }) => {
    return saveMediaTrackData(payload.resourceId, payload.tracks, payload.sources);
  });

  ipcMain.handle('mediaTrack:delete', async (_event, payload: { resourceId: string }) => {
    return deleteMediaTrackData(payload.resourceId);
  });

  console.log('[MediaTrack] IPC处理器已初始化');
}
