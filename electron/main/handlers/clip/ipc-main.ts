import { ipcMain } from 'electron';
import fs from 'fs-extra';
import * as path from 'path';

import { ResourcesRepo, WorkspacesRepo } from '../../db/repositories';

export interface ClipDataV1 {
  version: 1;
  clips: any[];
  updatedAt: number;
}

export type ClipData = ClipDataV1;

async function getClipFilePath(resourceId: string): Promise<string | null> {
  const resource = await ResourcesRepo.getById(resourceId);

  if (!resource) {
    console.warn(`[Clip] 资源不存在: ${resourceId}`);
    return null;
  }

  if (!resource.folderId) {
    console.warn(`[Clip] 资源不在任何文件夹中: ${resourceId}`);
    return null;
  }

  const workspaceId = resource.workspaceId;
  const workspace = workspaceId ? await WorkspacesRepo.getById(workspaceId) : await WorkspacesRepo.getDefault();

  if (!workspace || !workspace.rootPath) {
    console.warn(`[Clip] 工作空间根路径不存在`);
    return null;
  }

  return path.join(workspace.rootPath, 'resources', 'folders', resource.folderId, 'clips', `${resourceId}.json`);
}

export async function loadClipData(resourceId: string): Promise<ClipData | null> {
  try {
    const filePath = await getClipFilePath(resourceId);

    if (!filePath) {
      return null;
    }

    if (!(await fs.pathExists(filePath))) {
      console.log(`[Clip] 剪辑数据文件不存在: ${filePath}`);
      return null;
    }

    const content = await fs.readFile(filePath, 'utf8');
    const data = JSON.parse(content) as ClipData;

    console.log(`[Clip] 加载剪辑数据成功: ${resourceId}, ${data.clips?.length || 0} 个片段`);
    return data;
  } catch (error) {
    console.error(`[Clip] 加载剪辑数据失败: ${resourceId}`, error);
    return null;
  }
}

export async function saveClipData(resourceId: string, clips: any[]): Promise<{ success: boolean; error?: string }> {
  try {
    const filePath = await getClipFilePath(resourceId);

    if (!filePath) {
      return { success: false, error: '资源不在任何文件夹中，无法保存剪辑数据' };
    }

    const dir = path.dirname(filePath);
    await fs.ensureDir(dir);

    const data: ClipData = {
      version: 1,
      clips,
      updatedAt: Date.now()
    };

    await fs.writeFile(filePath, JSON.stringify(data, null, 2), 'utf8');

    console.log(`[Clip] 保存剪辑数据成功: ${resourceId}, ${clips.length} 个片段`);
    return { success: true };
  } catch (error: any) {
    console.error(`[Clip] 保存剪辑数据失败: ${resourceId}`, error);
    return { success: false, error: error?.message || 'unknown' };
  }
}

export async function deleteClipData(resourceId: string): Promise<{ success: boolean }> {
  try {
    const filePath = await getClipFilePath(resourceId);

    if (!filePath) {
      return { success: true };
    }

    if (await fs.pathExists(filePath)) {
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
