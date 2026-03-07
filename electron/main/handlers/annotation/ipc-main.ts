import { ipcMain } from 'electron';

import { ResourcesRepo } from '../../db/repositories';
import { type AnnotationData, type AnnotationItem, deleteProjectAnnotations, loadProjectAnnotations, saveProjectAnnotations } from '../resource/resource-project';

// ========== 标注数据类型 (重新导出) ==========

export type { AnnotationData, AnnotationItem, AnnotationType } from '../resource/resource-project';

// ========== CRUD 操作 (使用项目文件夹) ==========

/**
 * 加载标注数据（从项目文件夹 data/annotations.json）
 */
export async function loadAnnotationData(resourceId: string): Promise<AnnotationData | null> {
  try {
    const resource = await ResourcesRepo.getById(resourceId);
    if (!resource) {
      console.warn(`[Annotation] 资源不存在: ${resourceId}`);
      return null;
    }
    if (!resource.workspaceId) {
      console.warn(`[Annotation] 资源缺少工作空间ID: ${resourceId}`);
      return null;
    }
    return loadProjectAnnotations(resourceId, resource.workspaceId);
  } catch (error) {
    console.error(`[Annotation] 加载标注数据失败: ${resourceId}`, error);
    return null;
  }
}

/**
 * 保存标注数据（到项目文件夹 data/annotations.json）
 */
export async function saveAnnotationData(resourceId: string, annotations: AnnotationItem[]): Promise<{ success: boolean; error?: string }> {
  try {
    const resource = await ResourcesRepo.getById(resourceId);
    if (!resource) {
      return { success: false, error: '资源不存在' };
    }
    if (!resource.workspaceId) {
      return { success: false, error: '资源缺少工作空间ID' };
    }
    return saveProjectAnnotations(resourceId, resource.workspaceId, annotations);
  } catch (error: any) {
    console.error(`[Annotation] 保存标注数据失败: ${resourceId}`, error);
    return { success: false, error: error?.message || 'unknown' };
  }
}

/**
 * 删除标注数据（从项目文件夹）
 */
export async function deleteAnnotationData(resourceId: string): Promise<{ success: boolean; error?: string }> {
  try {
    const resource = await ResourcesRepo.getById(resourceId);
    if (!resource || !resource.workspaceId) {
      return { success: true }; // 资源不存在，视为成功
    }
    return deleteProjectAnnotations(resourceId, resource.workspaceId);
  } catch (error) {
    console.error(`[Annotation] 删除标注数据失败: ${resourceId}`, error);
    return { success: false, error: String(error) };
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

  console.log('[Annotation] IPC处理器已初始化（使用项目文件夹存储）');
}
