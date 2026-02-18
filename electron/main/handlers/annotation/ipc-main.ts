import { ipcMain } from 'electron';
import fs from 'fs-extra';
import * as path from 'path';

import { ResourcesRepo, WorkspacesRepo } from '../../db/repositories';

// ========== 标注数据类型 ==========

export type AnnotationType = 'highlight' | 'note' | 'vocabulary' | 'comment' | 'custom';

export interface AnnotationItem {
  /** 唯一标识 (uuid) */
  id: string;
  /** 标注的开始时间（秒） */
  startTime: number;
  /** 标注的结束时间（秒） */
  endTime: number;
  /** 被标注的原文文字 */
  text: string;
  /** 所在字幕片段的索引 */
  segmentIndex: number;
  /** 选中文字在片段中的起始字符位置 */
  wordStartIndex: number;
  /** 选中文字在片段中的结束字符位置 */
  wordEndIndex: number;
  /** 标注标题（可选） */
  title?: string;
  /** 标注描述（可选） */
  description?: string;
  /** 标注类型 */
  type: AnnotationType;
  /** 标注颜色 */
  color?: string;
  /** 创建时间戳 */
  createdAt: number;
  /** 更新时间戳 */
  updatedAt: number;
  /** 扩展数据（如生成的单词表、注释内容等） */
  metadata?: Record<string, unknown>;
}

export interface AnnotationDataV1 {
  version: 1;
  annotations: AnnotationItem[];
  updatedAt: number;
}

export type AnnotationData = AnnotationDataV1;

// ========== 文件路径工具 ==========

async function getAnnotationFilePath(resourceId: string): Promise<string | null> {
  const resource = await ResourcesRepo.getById(resourceId);

  if (!resource) {
    console.warn(`[Annotation] 资源不存在: ${resourceId}`);
    return null;
  }

  if (!resource.folderId) {
    console.warn(`[Annotation] 资源不在任何文件夹中: ${resourceId}`);
    return null;
  }

  const workspaceId = resource.workspaceId;
  const workspace = workspaceId ? await WorkspacesRepo.getById(workspaceId) : await WorkspacesRepo.getDefault();

  if (!workspace || !workspace.rootPath) {
    console.warn(`[Annotation] 工作空间根路径不存在`);
    return null;
  }

  return path.join(workspace.rootPath, 'resources', 'folders', resource.folderId, 'annotations', `${resourceId}.json`);
}

// ========== CRUD 操作 ==========

export async function loadAnnotationData(resourceId: string): Promise<AnnotationData | null> {
  try {
    const filePath = await getAnnotationFilePath(resourceId);

    if (!filePath) {
      return null;
    }

    if (!(await fs.pathExists(filePath))) {
      console.log(`[Annotation] 标注数据文件不存在: ${filePath}`);
      return null;
    }

    const content = await fs.readFile(filePath, 'utf8');
    const data = JSON.parse(content) as AnnotationData;

    console.log(`[Annotation] 加载标注数据成功: ${resourceId}, ${data.annotations?.length || 0} 条标注`);
    return data;
  } catch (error) {
    console.error(`[Annotation] 加载标注数据失败: ${resourceId}`, error);
    return null;
  }
}

export async function saveAnnotationData(resourceId: string, annotations: AnnotationItem[]): Promise<{ success: boolean; error?: string }> {
  try {
    const filePath = await getAnnotationFilePath(resourceId);

    if (!filePath) {
      return { success: false, error: '资源不在任何文件夹中，无法保存标注数据' };
    }

    const dir = path.dirname(filePath);
    await fs.ensureDir(dir);

    const data: AnnotationData = {
      version: 1,
      annotations,
      updatedAt: Date.now()
    };

    await fs.writeFile(filePath, JSON.stringify(data, null, 2), 'utf8');

    console.log(`[Annotation] 保存标注数据成功: ${resourceId}, ${annotations.length} 条标注`);
    return { success: true };
  } catch (error: any) {
    console.error(`[Annotation] 保存标注数据失败: ${resourceId}`, error);
    return { success: false, error: error?.message || 'unknown' };
  }
}

export async function deleteAnnotationData(resourceId: string): Promise<{ success: boolean }> {
  try {
    const filePath = await getAnnotationFilePath(resourceId);

    if (!filePath) {
      return { success: true };
    }

    if (await fs.pathExists(filePath)) {
      await fs.remove(filePath);
      console.log(`[Annotation] 删除标注数据成功: ${resourceId}`);
    }

    return { success: true };
  } catch (error) {
    console.error(`[Annotation] 删除标注数据失败: ${resourceId}`, error);
    return { success: false };
  }
}

// ========== IPC 处理器注册 ==========

export function initAnnotationHandlers(): void {
  ipcMain.handle('annotation:load', async (_event, payload: { resourceId: string }) => {
    return loadAnnotationData(payload.resourceId);
  });

  ipcMain.handle('annotation:save', async (_event, payload: { resourceId: string; annotations: AnnotationItem[] }) => {
    return saveAnnotationData(payload.resourceId, payload.annotations);
  });

  ipcMain.handle('annotation:delete', async (_event, payload: { resourceId: string }) => {
    return deleteAnnotationData(payload.resourceId);
  });

  console.log('[Annotation] IPC处理器已初始化');
}
