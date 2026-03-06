import { ipcMain } from 'electron';
import fs from 'fs-extra';

import { ResourcesRepo } from '../../db/repositories';
import { ensureResourceProjectDir, getProjectDataSubDirFilePath, readProjectDataJsonSubDir, writeProjectDataSubDirFile } from '../resource/resource-project';

export interface ClipDataV1 {
  version: 1;
  clips: any[];
  updatedAt: number;
}

export type ClipData = ClipDataV1;

const CLIPS_DIR = 'clips';

export async function loadClipData(resourceId: string): Promise<ClipData | null> {
  try {
    const resource = await ResourcesRepo.getById(resourceId);
    if (!resource || !resource.workspaceId) {
      console.warn(`[Clip] 资源不存在或缺少工作空间 ID: ${resourceId}`);
      return null;
    }

    // 从项目文件夹的 data/clips/ 目录读取
    const data = await readProjectDataJsonSubDir<ClipData>(resourceId, resource.workspaceId, CLIPS_DIR, `${resourceId}.json`);

    if (data) {
      console.log(`[Clip] 加载剪辑数据成功: ${resourceId}, ${data.clips?.length || 0} 个片段`);
      return data;
    }

    return null;
  } catch (error) {
    console.error(`[Clip] 加载剪辑数据失败: ${resourceId}`, error);
    return null;
  }
}

export async function saveClipData(resourceId: string, clips: any[]): Promise<{ success: boolean; error?: string }> {
  try {
    const resource = await ResourcesRepo.getById(resourceId);
    if (!resource || !resource.workspaceId) {
      return { success: false, error: '资源不存在或缺少工作空间 ID' };
    }

    // 确保项目目录存在
    await ensureResourceProjectDir(resourceId, resource.workspaceId, ['data']);

    const data: ClipData = {
      version: 1,
      clips,
      updatedAt: Date.now()
    };

    // 保存到项目文件夹的 data/clips/ 目录
    const result = await writeProjectDataSubDirFile(resourceId, resource.workspaceId, CLIPS_DIR, `${resourceId}.json`, JSON.stringify(data, null, 2));

    if (!result.success) {
      return { success: false, error: result.error };
    }

    console.log(`[Clip] 保存剪辑数据成功: ${resourceId}, ${clips.length} 个片段`);
    return { success: true };
  } catch (error: any) {
    console.error(`[Clip] 保存剪辑数据失败: ${resourceId}`, error);
    return { success: false, error: error?.message || 'unknown' };
  }
}

export async function deleteClipData(resourceId: string): Promise<{ success: boolean }> {
  try {
    const resource = await ResourcesRepo.getById(resourceId);
    if (!resource || !resource.workspaceId) {
      return { success: true };
    }

    const filePath = await getProjectDataSubDirFilePath(resourceId, resource.workspaceId, CLIPS_DIR, `${resourceId}.json`);

    if (filePath && (await fs.pathExists(filePath))) {
      await fs.remove(filePath);
      console.log(`[Clip] 删除剪辑数据成功: ${resourceId}`);
    }

    return { success: true };
  } catch (error) {
    console.error(`[Clip] 删除剪辑数据失败: ${resourceId}`, error);
    return { success: false };
  }
}

export function initClipHandlers(): void {
  ipcMain.handle('clip:load', async (_event, payload: { resourceId: string }) => {
    return loadClipData(payload.resourceId);
  });

  ipcMain.handle('clip:save', async (_event, payload: { resourceId: string; clips: any[] }) => {
    return saveClipData(payload.resourceId, payload.clips);
  });

  ipcMain.handle('clip:delete', async (_event, payload: { resourceId: string }) => {
    return deleteClipData(payload.resourceId);
  });

  console.log('[Clip] IPC处理器已初始化');
}
