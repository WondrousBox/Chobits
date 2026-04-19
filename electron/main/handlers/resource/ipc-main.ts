import { createHash } from 'node:crypto';
import * as fscb from 'node:fs';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';

import { BrowserWindow, dialog, ipcMain, shell } from 'electron';

import { eventManager, sendAppBusyEnd, sendAppBusyProgress, sendAppBusyStart } from '../../../../packages/event';
import { AppEvent } from '../../../../packages/event/events';
// import { TaggingService } from '../ai/tagging-service';
import { FoldersRepo, ResourcesRepo, TagsRepo, WorkspacesRepo } from '../../db/repositories';
// import { sendAppNotice } from '../../../../packages/event';
import { generateThumbnailForResource } from '../../utils/thumbnail';
import { rescanLinkedDirectoryByFolderId } from '../folder/linked-sync';
import { copyPathIntoDirectory, ensureUniquePath, getLinkedFolderContext, getRelativePathWithinMount, movePathSafe } from '../folder/linked-utils';
import { resolveFolderPathFromRow } from '../folder/storage';
import { addResource, ensureDailyFolder, getOrCreateAudioFolder, getOrCreateScreenshotFolder } from '.';
import type { Resource } from './ipc-renderer';
import {
  clearResourceProjectDir,
  createCustomProjectSubDir,
  deleteProjectTrack,
  deleteProjectTranslation,
  deleteResourceProjectDir,
  ensureResourceProjectDir,
  getResourceProjectPath,
  getResourceProjectStats,
  listProjectTracks,
  type ProjectSubDir,
  type ProjectTrackEntry,
  readProjectDataJsonSubDir,
  readProjectMeta,
  readProjectTrackConfig,
  updateSubtitleEditTrackSegments,
  writeProjectDataSubDirFile,
  writeProjectMeta,
  writeProjectTrackConfig
} from './resource-project';

// 存储正在上传的文件流
interface UploadStream {
  fileName: string;
  filePath: string;
  writeStream: fscb.WriteStream;
  hash: ReturnType<typeof createHash>;
  totalSize: number;
  receivedSize: number;
  chunkIndices: Set<number>;
}

const uploadStreams = new Map<string, UploadStream>();
const TEXT_FILE_EXT_RE = /\.(txt|md|log|json|csv|ts|js|tsx|jsx|py|go|rs|java|c|cpp|yml|yaml|toml|ini)$/i;
const SUBTITLE_FILE_EXT_RE = /\.(srt|vtt|ass|ssa)$/i;

function isLinkedFolderRow(folder: { originType?: string } | undefined | null): boolean {
  return folder?.originType === 'linked';
}

function isLinkedResourceRow(resource: { originType?: string } | undefined | null): boolean {
  return resource?.originType === 'linked';
}

async function getWritableFolder(folderId?: string | null): Promise<{ folder: any | null; error?: string }> {
  if (!folderId) return { folder: null };
  const folder = await FoldersRepo.getById(folderId);
  if (!folder) return { folder: null, error: 'folder-not-found' };
  return { folder };
}

function sanitizeFileName(name: string, fallback: string): string {
  const next = String(name || '')
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, ' ')
    .trim();
  return next || fallback;
}

function isSubtitlePath(filePath?: string | null): boolean {
  return !!filePath && SUBTITLE_FILE_EXT_RE.test(filePath);
}

function isEditableTextPath(filePath?: string | null): boolean {
  return !!filePath && TEXT_FILE_EXT_RE.test(filePath);
}

type FolderDestination = {
  folderId: string | null;
  folder: any | null;
  workspace: any | null;
  workspaceId?: string;
  baseDir: string;
  originType: 'workspace' | 'linked';
  linkedContext?: Awaited<ReturnType<typeof getLinkedFolderContext>>;
};

async function resolveFolderDestination(
  folderId?: string | null,
  workspaceId?: string | null,
  options: { ensureDailyFolder?: boolean } = {}
): Promise<FolderDestination> {
  let resolvedFolderId = folderId ?? null;
  let folder = resolvedFolderId ? await FoldersRepo.getById(resolvedFolderId) : null;
  if (resolvedFolderId && !folder) {
    throw new Error('folder-not-found');
  }

  if (folder && isLinkedFolderRow(folder)) {
    const linkedContext = await getLinkedFolderContext(folder);
    return {
      folderId: folder.id,
      folder,
      workspace: linkedContext.workspace || null,
      workspaceId: folder.workspaceId || undefined,
      baseDir: linkedContext.folderPath,
      originType: 'linked',
      linkedContext
    };
  }

  let workspace = workspaceId ? await WorkspacesRepo.getById(workspaceId) : undefined;
  if (!workspace && folder?.workspaceId) {
    workspace = await WorkspacesRepo.getById(folder.workspaceId);
  }
  if (!workspace) {
    workspace = await WorkspacesRepo.getDefault();
  }

  if (workspace?.rootPath && !resolvedFolderId && options.ensureDailyFolder) {
    resolvedFolderId = await ensureDailyFolder(workspace.id, workspace.rootPath);
    folder = await FoldersRepo.getById(resolvedFolderId);
  }

  const baseDir =
    folder && workspace?.rootPath
      ? (await resolveFolderPathFromRow(folder)) || path.join(workspace.rootPath, 'resources')
      : workspace?.rootPath
        ? path.join(workspace.rootPath, 'resources')
        : path.join(process.cwd(), 'uploads');

  return {
    folderId: resolvedFolderId,
    folder: folder || null,
    workspace: workspace || null,
    workspaceId: workspace?.id || undefined,
    baseDir,
    originType: 'workspace'
  };
}

/*
async function getFileStatSnapshot(filePath?: string | null): Promise<{ size: number; mtimeMs: number } | null> {
  if (!filePath) return null;
  try {

          sendProgress(processedEntries, totalEntries, `姝ｅ湪瀵煎叆: ${path.basename(sourcePath)}`);
    const stat = await fs.stat(filePath);
    return { size: stat.size, mtimeMs: stat.mtimeMs };
  } catch {
    return null;
  }
}

*/
async function getFileStatSnapshot(filePath?: string | null): Promise<{ size: number; mtimeMs: number } | null> {
  if (!filePath) return null;
  try {
    const stat = await fs.stat(filePath);
    return { size: stat.size, mtimeMs: stat.mtimeMs };
  } catch {
    return null;
  }
}

async function buildLinkedResourcePatch(
  linkedContext: Awaited<ReturnType<typeof getLinkedFolderContext>>,
  filePath: string,
  folderId: string
): Promise<any> {
  const stat = await fs.stat(filePath);
  return {
    folderId,
    workspaceId: linkedContext.folder.workspaceId || undefined,
    originType: 'linked',
    linkedMountId: linkedContext.mount.id,
    relativePath: getRelativePathWithinMount(linkedContext.mount, filePath),
    filePath,
    sizeBytes: stat.size,
    externalMtimeMs: stat.mtimeMs,
    externalSizeBytes: stat.size,
    syncState: 'synced'
  };
}

async function buildWorkspaceResourcePatch(destination: FolderDestination, filePath: string | undefined, folderId: string | null): Promise<any> {
  const stat = await getFileStatSnapshot(filePath);
  return {
    folderId,
    workspaceId: destination.workspaceId,
    originType: 'workspace',
    linkedMountId: null,
    relativePath: null,
    filePath,
    ...(stat ? { sizeBytes: stat.size } : {}),
    externalMtimeMs: null,
    externalSizeBytes: null,
    syncState: 'synced'
  };
}

export function initResourceHandlers(): void {
  // 导入本地文件（仅文件）
  ipcMain.handle('resource:importLocalFiles', async (_event, payload: { workspaceId?: string; folderId?: string }) => {
    const { workspaceId, folderId } = payload || {};
    const win = BrowserWindow.getFocusedWindow();
    if (!win) return { canceled: true };

    const folderCheck = await getWritableFolder(folderId);
    if (folderCheck.error) {
      return { canceled: false, success: false, error: folderCheck.error };
    }

    console.log('resource:importLocalFiles', payload);

    const res = await dialog.showOpenDialog(win, {
      properties: ['openFile', 'multiSelections'],
      title: '选择文件（可多选）'
    });

    if (res.canceled || res.filePaths.length === 0) return { canceled: true };

    // Start background task
    runImportTask(win, res.filePaths, workspaceId, folderId);

    return { canceled: false, success: true };
  });

  // 导入本地文件夹（仅文件夹）
  ipcMain.handle('resource:importLocalFolders', async (_event, payload: { workspaceId?: string; folderId?: string }) => {
    const { workspaceId, folderId } = payload || {};
    const win = BrowserWindow.getFocusedWindow();
    if (!win) return { canceled: true };

    const folderCheck = await getWritableFolder(folderId);
    if (folderCheck.error) {
      return { canceled: false, success: false, error: folderCheck.error };
    }

    console.log('resource:importLocalFolders', payload);

    const res = await dialog.showOpenDialog(win, {
      properties: ['openDirectory', 'multiSelections'],
      title: '选择文件夹（可多选）'
    });

    if (res.canceled || res.filePaths.length === 0) return { canceled: true };

    // Start background task
    runImportTask(win, res.filePaths, workspaceId, folderId);

    return { canceled: false, success: true };
  });

  ipcMain.handle('resource:add', async (_event, payload: { resource: Resource }) => {
    return addResource(payload);
  });
  ipcMain.handle('resource:list', async (_event, payload?: { workspaceId?: string; deletedAt?: number }) => {
    // Hide soft-deleted items by default
    const filter: any = { deletedAt: payload?.deletedAt ?? 0 };
    if (payload?.workspaceId) {
      filter.workspaceId = payload.workspaceId;
    }
    const rows = await ResourcesRepo.list(filter);
    // 隐藏内部类型的资源（segments 等），这些资源通过 listChildren 查询
    const HIDDEN_TYPES = new Set(['segments', 'subtitle-edit', 'tts-track', 'media-track']);
    return (rows as any[]).filter((r: any) => !HIDDEN_TYPES.has(r.type));
  });
  ipcMain.handle('resource:listChildren', async (_event, payload: { parentResourceId: string; limit?: number; offset?: number }) => {
    const { parentResourceId, limit = 100, offset = 0 } = payload || ({} as any);
    if (!parentResourceId) return [];
    return await ResourcesRepo.listChildren(parentResourceId, limit, offset);
  });

  // 获取字幕资源的 segments 数据（字级别时间戳）
  // 从项目文件夹 data/segments/ 子目录读取
  ipcMain.handle('resource:getSegmentsData', async (_event, payload: { subtitleResourceId: string }) => {
    const { subtitleResourceId } = payload || ({} as any);
    if (!subtitleResourceId) return null;
    try {
      // 获取字幕资源信息以获取 workspaceId
      const subtitleResource = await ResourcesRepo.getById(subtitleResourceId);
      if (!subtitleResource?.workspaceId) return null;

      // 从项目元数据获取 segments 文件信息
      const meta = await readProjectMeta(subtitleResourceId, subtitleResource.workspaceId);
      if (!meta?.segments || meta.segments.length === 0) return null;

      // 读取第一个 segments 文件（从 data/segments/ 子目录）
      // TODO: 后续可以支持根据字幕文件名选择特定的 segments 文件
      const segmentsEntry = meta.segments[0];
      const segmentsData = await readProjectDataJsonSubDir<any[]>(subtitleResourceId, subtitleResource.workspaceId, 'segments', segmentsEntry.segmentsFile);
      return segmentsData;
    } catch (e) {
      console.warn('[resource:getSegmentsData] failed:', e);
      return null;
    }
  });
  // 更新字幕资源的 segments 数据（字级别时间戳）
  // 写入项目文件夹 data/segments/ 子目录
  ipcMain.handle('resource:updateSegmentsData', async (_event, payload: { subtitleResourceId: string; segmentsData: any[] }) => {
    const { subtitleResourceId, segmentsData } = payload || ({} as any);
    if (!subtitleResourceId || !Array.isArray(segmentsData)) {
      return { success: false, error: 'invalid params' };
    }
    try {
      // 获取字幕资源信息以获取 workspaceId
      const subtitleResource = await ResourcesRepo.getById(subtitleResourceId);
      if (!subtitleResource?.workspaceId) {
        return { success: false, error: 'subtitle resource not found' };
      }

      // 从项目元数据获取 segments 文件信息
      const meta = await readProjectMeta(subtitleResourceId, subtitleResource.workspaceId);
      if (!meta?.segments || meta.segments.length === 0) {
        return { success: false, error: 'segments file not found in project meta' };
      }

      // 写入第一个 segments 文件（到 data/segments/ 子目录）
      const segmentsEntry = meta.segments[0];
      const result = await writeProjectDataSubDirFile(subtitleResourceId, subtitleResource.workspaceId, 'segments', segmentsEntry.segmentsFile, JSON.stringify(segmentsData, null, 2));
      if (!result.success) {
        return { success: false, error: result.error };
      }

      console.log('[resource:updateSegmentsData] segments.json updated for', subtitleResourceId);
      return { success: true };
    } catch (e: any) {
      console.warn('[resource:updateSegmentsData] failed:', e);
      return { success: false, error: e?.message || String(e) };
    }
  });

  // 删除数据库中现有的 segments 类型资源
  // 这些资源已经迁移到项目文件夹管理，不再需要数据库记录
  ipcMain.handle('resource:cleanupSegmentsResources', async (_event, payload: { subtitleResourceId?: string }) => {
    const { subtitleResourceId } = payload || {};
    try {
      if (subtitleResourceId) {
        // 删除特定字幕资源的 segments 子资源
        const children = await ResourcesRepo.listChildren(subtitleResourceId, 100, 0);
        const segmentsResources = (children as any[]).filter((c: any) => c.type === 'segments');
        if (segmentsResources.length > 0) {
          const ids = segmentsResources.map((r: any) => r.id);
          await ResourcesRepo.deleteByIds(ids);
          console.log('[resource:cleanupSegmentsResources] 已删除 segments 资源:', ids);
          return { success: true, deletedCount: ids.length };
        }
        return { success: true, deletedCount: 0 };
      } else {
        // 删除所有 segments 类型资源
        const allResources = await ResourcesRepo.list({ type: 'segments' } as any, 10000, 0);
        if (allResources.length > 0) {
          const ids = (allResources as any[]).map((r: any) => r.id);
          await ResourcesRepo.deleteByIds(ids);
          console.log('[resource:cleanupSegmentsResources] 已删除所有 segments 资源:', ids.length, '个');
          return { success: true, deletedCount: ids.length };
        }
        return { success: true, deletedCount: 0 };
      }
    } catch (e: any) {
      console.warn('[resource:cleanupSegmentsResources] failed:', e);
      return { success: false, error: e?.message || String(e) };
    }
  });
  ipcMain.handle('getResource', async (_event, payload: { id: string }) => {
    const r: any = await ResourcesRepo.getById(payload.id);
    if (!r) return r;
    // Lazy migrate old blob thumbnail to file if path missing
    if (r.thumbnail && !r.thumbnailPath) {
      try {
        const ws = await WorkspacesRepo.getDefault();
        const baseDir = ws?.rootPath ? path.join(ws.rootPath, 'resources', '.thumbs') : path.join(process.cwd(), 'uploads', '.thumbs');
        await fs.mkdir(baseDir, { recursive: true });
        const thumbPath = path.join(baseDir, `${r.id}.png`);
        if (!fscb.existsSync(thumbPath)) {
          await fs.writeFile(thumbPath, r.thumbnail as Buffer);
        }
        await ResourcesRepo.update(r.id, { thumbnailPath: thumbPath } as any);
        r.thumbnailPath = thumbPath;
      } catch (e) {
        console.warn('[thumbnail] lazy migrate failed', e);
      }
    }
    return r;
  });
  ipcMain.handle('deleteResource', async (_event, payload: { id: string }) => {
    const current = await ResourcesRepo.getById(payload.id);
    if (!current) return { success: false, error: 'not-found' };
    if (isLinkedResourceRow(current)) {
      return { success: false, error: 'linked-resource-readonly' };
    }

    // Soft delete: mark deletedAt, create recycle_bin entry, and move file to .trash/
    const rows = await ResourcesRepo.softDelete([payload.id]);
    const row = rows[0];
    if (row) {
      eventManager.emit(AppEvent.RESOURCE_DELETED, row);
    }
    return { success: true, data: row };
  });

  ipcMain.handle('deleteResources', async (_event, payload: { ids: string[] }) => {
    const ids = payload.ids || [];
    if (!ids.length) return { success: true, deleted: 0, data: [] };
    const rows = await Promise.all(ids.map((id) => ResourcesRepo.getById(id)));
    if (rows.some((row) => isLinkedResourceRow(row))) {
      return { success: false, error: 'linked-resource-readonly' };
    }
    const deleted = await ResourcesRepo.softDelete(ids);
    if (deleted.length > 0) {
      eventManager.emit(AppEvent.RESOURCE_BATCH_DELETED, deleted);
    }
    return { success: true, deleted: deleted.length, data: deleted };
  });

  // 永久删除资源（不经过回收站）
  ipcMain.handle('deleteResourcePermanently', async (_event, payload: { id: string }) => {
    const current = await ResourcesRepo.getById(payload.id);
    if (!current) return { success: false, deleted: 0, error: 'not-found' };
    if (isLinkedResourceRow(current)) {
      return { success: false, deleted: 0, error: 'linked-resource-readonly' };
    }
    const deleted = await ResourcesRepo.deleteById(payload.id);
    if (deleted > 0) {
      eventManager.emit(AppEvent.RESOURCE_DELETED, { id: payload.id });
    }
    return { success: true, deleted };
  });

  ipcMain.handle('moveResourcesToWorkspace', async (_event, payload: { ids: string[]; workspaceId: string }) => {
    const { ids, workspaceId } = payload || { ids: [], workspaceId: '' };
    if (!ids.length || !workspaceId) return { moved: 0 };
    const ws = await WorkspacesRepo.getById(workspaceId);
    if (!ws || !ws.rootPath) return { moved: 0 };
    const targetDir = path.join(ws.rootPath, 'resources');
    await fs.mkdir(targetDir, { recursive: true });
    let moved = 0;
    const updated: any[] = [];
    const existing = await Promise.all(ids.map((id) => ResourcesRepo.getById(id)));
    if (existing.some((row) => isLinkedResourceRow(row))) {
      return { success: false, moved: 0, data: [], error: 'linked-resource-readonly' };
    }
    for (const id of ids) {
      const res = await ResourcesRepo.getById(id);
      if (!res) continue;
      let newPath = res.filePath as string | undefined;
      try {
        if (res.filePath) {
          const base = path.basename(res.filePath);
          const target = path.join(targetDir, base);
          if (res.filePath !== target) {
            await fs.copyFile(res.filePath, target);
            newPath = target;
          }
        }
        const row = await ResourcesRepo.update(id, { workspaceId, ...(newPath ? { filePath: newPath } : {}) } as any);
        if (row) updated.push(row);
        moved += 1;
      } catch (e) {
        console.warn('move resource failed', e);
      }
    }
    if (updated.length > 0) {
      eventManager.emit(AppEvent.RESOURCE_BATCH_MOVED, updated);
    }
    return { success: true, moved, data: updated };
  });

  ipcMain.handle('revealResource', async (_event, payload: { id: string }) => {
    const res = await ResourcesRepo.getById(payload.id);
    if (!res || !res.filePath) return { success: false };
    shell.showItemInFolder(res.filePath);
    return { success: true };
  });

  // 重建单个资源的缩略图
  ipcMain.handle('rebuildResourceThumbnail', async (_event, payload: { id: string; size?: number; force?: boolean }) => {
    const { id, size = 256 } = payload || ({} as any);
    if (!id) return { success: false, error: 'invalid-id' };
    const res = await ResourcesRepo.getById(id);
    if (!res) return { success: false, error: 'not-found' };
    try {
      const ws = await WorkspacesRepo.getDefault();
      const baseDir = ws?.rootPath ? path.join(ws.rootPath, 'resources', '.thumbs') : path.join(process.cwd(), 'uploads', '.thumbs');
      await fs.mkdir(baseDir, { recursive: true });
      const thumb = await generateThumbnailForResource({ filePath: (res as any).filePath || undefined, type: (res as any).type, title: (res as any).title }, { size });
      if (!thumb) return { success: false, error: 'gen-failed' };
      const thumbPath = path.join(baseDir, `${id}.png`);
      await fs.writeFile(thumbPath, thumb);
      const updated = await ResourcesRepo.update(id, { thumbnailPath: thumbPath } as any);
      return { success: true, data: updated };
    } catch (e: any) {
      console.warn('[thumbnail] rebuild failed', e);
      return { success: false, error: e?.message || 'unknown' };
    }
  });

  // 清理默认工作空间下 .thumbs 中的孤儿缩略图（无对应资源）
  ipcMain.handle('cleanupThumbnails', async () => {
    try {
      const ws = await WorkspacesRepo.getDefault();
      const baseDir = ws?.rootPath ? path.join(ws.rootPath, 'resources', '.thumbs') : path.join(process.cwd(), 'uploads', '.thumbs');
      await fs.mkdir(baseDir, { recursive: true });
      const files = await fs.readdir(baseDir);
      let removed = 0;
      for (const f of files) {
        if (!f.endsWith('.png')) continue;
        const id = f.replace(/\.png$/i, '');
        try {
          const exists = await ResourcesRepo.exists(id);
          if (!exists) {
            await fs.unlink(path.join(baseDir, f));
            removed += 1;
          }
        } catch {
          /* ignore */
        }
      }
      return { success: true, removed };
    } catch (e: any) {
      console.warn('[thumbnail] cleanup failed', e);
      return { success: false, error: e?.message || 'unknown' };
    }
  });

  ipcMain.handle('resource:update', async (_event, payload: { id: string; patch: any }) => {
    const { id } = payload;
    const patch = { ...(payload.patch || {}) };
    const current = await ResourcesRepo.getById(id);
    if (!current) {
      return { success: false, error: 'not-found' };
    }

    try {
      if (typeof patch.subtitleContent === 'string' && current.filePath && isSubtitlePath(current.filePath)) {
        await fs.mkdir(path.dirname(current.filePath), { recursive: true });
        await fs.writeFile(current.filePath, patch.subtitleContent, 'utf8');
        const stat = await getFileStatSnapshot(current.filePath);
        if (stat) {
          patch.sizeBytes = stat.size;
          if (isLinkedResourceRow(current)) {
            patch.externalMtimeMs = stat.mtimeMs;
            patch.externalSizeBytes = stat.size;
            patch.syncState = 'synced';
          }
        }
      }
      delete patch.subtitleContent;

      if (typeof patch.contentText === 'string') {
        try {
          patch.sizeBytes = Buffer.byteLength(patch.contentText, 'utf8');
        } catch {
          // ignore size calculation failure
        }

        if (current.filePath && (current.type === 'text' || isEditableTextPath(current.filePath))) {
          await fs.mkdir(path.dirname(current.filePath), { recursive: true });
          await fs.writeFile(current.filePath, patch.contentText, 'utf8');
          const stat = await getFileStatSnapshot(current.filePath);
          if (stat) {
            patch.sizeBytes = stat.size;
            if (isLinkedResourceRow(current)) {
              patch.externalMtimeMs = stat.mtimeMs;
              patch.externalSizeBytes = stat.size;
              patch.syncState = 'synced';
            }
          }
        }
      }
    } catch (e: any) {
      console.error('[resource:update] file write failed:', e);
      return { success: false, error: 'resource-write-failed' };
    }

    const nextUpdated = await ResourcesRepo.update(id, patch);
    if (nextUpdated) {
      eventManager.emit(AppEvent.RESOURCE_UPDATED, nextUpdated);
    }
    return { success: true, data: nextUpdated };

    // 如果本次更新包含字幕内容，需要写入文件（支持 srt、vtt、ass、ssa 格式）
    if (typeof patch.subtitleContent === 'string') {
      try {
        // 获取当前资源信息
        if (current.filePath && isSubtitlePath(current.filePath)) {
          // 检查是否是字幕文件
            // 确保目录存在
            const dir = path.dirname(current.filePath);
            await fs.mkdir(dir, { recursive: true });
            // 写入文件
            await fs.writeFile(current.filePath, patch.subtitleContent, 'utf8');
            const stat = await getFileStatSnapshot(current.filePath);
            if (stat) {
              patch.sizeBytes = stat.size;
              if (isLinkedResourceRow(current)) {
                patch.externalMtimeMs = stat.mtimeMs;
                patch.externalSizeBytes = stat.size;
                patch.syncState = 'synced';
              }
            }
            // 更新文件大小
              // 忽略计算失败，不阻塞更新
            }
          }
        }
        // 移除 subtitleContent，不保存到数据库
        delete patch.subtitleContent;
      } catch (e: any) {
        console.error('[resource:update] 写入字幕文件失败:', e);
        // 不阻塞更新，继续执行数据库更新
      }
    }

    // 如果本次更新包含文本内容，则同步更新 sizeBytes，保证纯文本资源也有合理的大小
    if (typeof patch.contentText === 'string') {
      try {
        const buf = Buffer.from(patch.contentText, 'utf8');
        patch.sizeBytes = buf.byteLength;
      } catch {
        // 忽略计算失败，不阻塞更新
      }
    }

    const updated = await ResourcesRepo.update(id, patch);
    if (updated) {
      eventManager.emit(AppEvent.RESOURCE_UPDATED, updated);
    }
    return { success: true, data: updated };
  });

  // 批量移动资源到文件夹（或移出文件夹），并进行跨工作空间校验
  ipcMain.handle('resource:moveToFolder', async (_event, payload: { ids: string[]; folderId: string | null; workspaceId?: string }) => {
    try {
      const ids = payload?.ids || [];
      const targetFolderId = typeof payload?.folderId === 'string' ? payload.folderId : null;
      if (!ids.length) return { success: true, moved: 0 };
      {
        const destination = await resolveFolderDestination(targetFolderId, payload?.workspaceId || undefined, { ensureDailyFolder: false });
        const resourcesToMove = (await Promise.all(ids.map((id) => ResourcesRepo.getById(id)))).filter(Boolean) as any[];
        const invalidIds = ids.filter((id) => !resourcesToMove.some((row) => row.id === id));
        if (invalidIds.length) {
          return { success: false, invalid: invalidIds };
        }
        if (destination.workspaceId) {
          const crossWorkspace = resourcesToMove.filter((row) => row.workspaceId && row.workspaceId !== destination.workspaceId);
          if (crossWorkspace.length) {
            return { success: false, invalid: crossWorkspace.map((row) => row.id) };
          }
        }

        await fs.mkdir(destination.baseDir, { recursive: true });

        const movedRows: any[] = [];
        for (const row of resourcesToMove) {
          const sourceFolder = row.folderId ? await FoldersRepo.getById(row.folderId) : null;
          if (isLinkedResourceRow(row) && destination.originType === 'linked') {
            if (!sourceFolder || !isLinkedFolderRow(sourceFolder)) {
              return { success: false, error: 'linked-resource-folder-not-found' };
            }
            const sourceContext = await getLinkedFolderContext(sourceFolder);
            if (sourceContext.mount.id !== destination.linkedContext?.mount.id) {
              return { success: false, error: 'cross-linked-mount-resource-move-not-supported' };
            }
          }
          if (destination.originType === 'linked' && !row.filePath && typeof row.contentText !== 'string') {
            return { success: false, error: 'linked-folder-requires-physical-content' };
          }

          let nextFilePath: string | undefined = row.filePath || undefined;
          if (destination.originType === 'linked') {
            if (row.filePath) {
              const desiredPath = path.join(destination.baseDir, path.basename(row.filePath));
              const samePath = path.resolve(row.filePath) === path.resolve(desiredPath);
              const targetPath = samePath ? row.filePath : await ensureUniquePath(desiredPath);
              if (!samePath) {
                await movePathSafe(row.filePath, targetPath);
              }
              nextFilePath = targetPath;
            } else {
              const baseName = sanitizeFileName(row.title || 'Untitled', 'Untitled');
              const ext = path.extname(baseName);
              const targetPath = await ensureUniquePath(path.join(destination.baseDir, ext ? baseName : `${baseName}.txt`));
              await fs.writeFile(targetPath, row.contentText || '', 'utf8');
              nextFilePath = targetPath;
            }

            const patch = await buildLinkedResourcePatch(destination.linkedContext!, nextFilePath!, destination.folderId!);
            const updated = await ResourcesRepo.update(row.id, patch);
            if (updated) {
              movedRows.push(updated);
              eventManager.emit(AppEvent.RESOURCE_MOVED, updated);
            }
            continue;
          }

          if (row.filePath) {
            const desiredPath = path.join(destination.baseDir, path.basename(row.filePath));
            const samePath = path.resolve(row.filePath) === path.resolve(desiredPath);
            const targetPath = samePath ? row.filePath : await ensureUniquePath(desiredPath);
            if (!samePath) {
              await movePathSafe(row.filePath, targetPath);
            }
            nextFilePath = targetPath;
          }

          const patch = await buildWorkspaceResourcePatch(destination, nextFilePath, targetFolderId ?? null);
          const updated = await ResourcesRepo.update(row.id, patch);
          if (updated) {
            movedRows.push(updated);
            eventManager.emit(AppEvent.RESOURCE_MOVED, updated);
          }
        }

        return { success: true, moved: movedRows.length };
      }

      // 目标工作空间：来自目标文件夹，或调用方提供，或默认空间
      let targetWorkspaceId: string | undefined = payload?.workspaceId;
      if (targetFolderId) {
        const folder = await FoldersRepo.getById(targetFolderId);
        if (!folder) return { success: false, error: 'folder-not-found' };
        if (isLinkedFolderRow(folder)) return { success: false, error: 'linked-folder-readonly' };
        targetWorkspaceId = folder.workspaceId || undefined;
      }
      if (!targetWorkspaceId) {
        const ws = await WorkspacesRepo.getDefault();
        targetWorkspaceId = ws?.id || undefined;
      }
      if (!targetWorkspaceId) return { success: false, error: 'no-workspace' };

      const wsObj = await WorkspacesRepo.getById(targetWorkspaceId);
      const wsRoot = wsObj?.rootPath;
      if (!wsRoot) return { success: false, error: 'workspace-no-root' };

      // 校验所有资源均属于目标工作空间
      const invalid: string[] = [];
      const rows: any[] = [];
      for (const id of ids) {
        const r = await ResourcesRepo.getById(id);
        if (!r || (r as any).workspaceId !== targetWorkspaceId) invalid.push(id);
        else if (isLinkedResourceRow(r)) return { success: false, error: 'linked-resource-readonly' };
        else rows.push(r);
      }
      if (invalid.length) {
        return { success: false, invalid };
      }

      // 执行更新
      // 小工具：跨分区时用 copy + unlink 兜底
      const moveFileSafe = async (src: string, dest: string): Promise<void> => {
        try {
          await fs.rename(src, dest);
        } catch (e: any) {
          if (e?.code === 'EXDEV') {
            // 跨分区，改为 copy + unlink
            const data = await fs.readFile(src);
            await fs.writeFile(dest, data);
            await fs.unlink(src);
          } else {
            throw e;
          }
        }
      };

      let moved = 0;
      for (const r of rows as any[]) {
        try {
          let newPath: string | undefined;
          const hasFile = !!r.filePath;
          if (hasFile) {
            const baseName = path.basename(r.filePath as string);
            const targetDir = targetFolderId ? path.join(wsRoot, 'resources', 'folders', targetFolderId) : path.join(wsRoot, 'resources');
            await fs.mkdir(targetDir, { recursive: true });
            let targetPath = path.join(targetDir, baseName);
            if (r.filePath !== targetPath) {
              // 同名处理：若存在则追加 (n)
              if (fscb.existsSync(targetPath)) {
                const ext = path.extname(baseName);
                const stem = path.basename(baseName, ext);
                let i = 1;
                while (fscb.existsSync(targetPath)) {
                  targetPath = path.join(targetDir, `${stem}(${i})${ext}`);
                  i += 1;
                }
              }
              await moveFileSafe(r.filePath as string, targetPath);
              newPath = targetPath;
            }
          }

          const updated = await ResourcesRepo.update(r.id, { folderId: targetFolderId ?? null, ...(newPath ? { filePath: newPath } : {}) } as any);
          if (updated) {
            moved += 1;
            eventManager.emit(AppEvent.RESOURCE_MOVED, updated);
          }
        } catch {
          // 单条失败，继续下一条
        }
      }
      // Ideally we should emit BATCH_MOVED but here we emit one by one or collect them.
      // Let's just rely on individual updates or maybe I should collect them.
      // For now, individual updates are fine or I can emit a batch event if I collected them.
      // But I didn't collect them in the loop.
      // Let's just emit a generic update event or rely on the loop.
      // Actually, I should probably collect them to be efficient.
      // But the loop structure makes it a bit hard without refactoring.
      // I'll just emit RESOURCE_UPDATED for now inside the loop?
      // Wait, I added RESOURCE_MOVED above.

      return { success: true, moved };
    } catch (e: any) {
      return { success: false, error: e?.message || 'unknown' };
    }
  });

  ipcMain.handle('renameResource', async (_event, payload: { id: string; newName: string; renameFile?: boolean }) => {
    const { id, newName, renameFile } = payload;
    const res = await ResourcesRepo.getById(id);
    if (!res) return { success: false, error: 'not-found' };
    const sanitizedName = sanitizeFileName(newName, 'Untitled');
    if (!sanitizedName) return { success: false, error: 'invalid-name' };

    let fileRenamed = false;
    let newPath: string | undefined = res.filePath || undefined;
    const patch: any = {
      title: sanitizedName
    };

    if (renameFile && res.filePath) {
      const dir = path.dirname(res.filePath);
      const oldBase = path.basename(res.filePath);
      const ext = path.extname(oldBase);
      const desiredBase = sanitizedName.includes('.') ? sanitizedName : `${sanitizedName}${ext}`;
      const desiredPath = path.join(dir, desiredBase);
      const samePath = path.resolve(desiredPath) === path.resolve(res.filePath);
      const targetPath = samePath ? res.filePath : await ensureUniquePath(desiredPath);
      if (!samePath) {
        await movePathSafe(res.filePath, targetPath);
        fileRenamed = true;
      }
      newPath = targetPath;
      patch.filePath = newPath;

      if (isLinkedResourceRow(res)) {
        const sourceFolder = res.folderId ? await FoldersRepo.getById(res.folderId) : null;
        if (!sourceFolder || !isLinkedFolderRow(sourceFolder)) {
          return { success: false, error: 'linked-resource-folder-not-found' };
        }
        const linkedContext = await getLinkedFolderContext(sourceFolder);
        Object.assign(patch, await buildLinkedResourcePatch(linkedContext, newPath, sourceFolder.id));
      } else {
        const stat = await getFileStatSnapshot(newPath);
        if (stat) {
          patch.sizeBytes = stat.size;
        }
      }
    }

    const updatedRow = await ResourcesRepo.update(id, patch);
    if (updatedRow) {
      eventManager.emit(AppEvent.RESOURCE_UPDATED, updatedRow);
    }
    return { success: true, fileRenamed, newPath, data: updatedRow };
    if (isLinkedResourceRow(res)) {
      return { success: false, error: 'linked-resource-readonly' };
    }

    let fileRenamed = false;
    let newPath: string | undefined;
    if (renameFile && res.filePath) {
      const dir = path.dirname(res.filePath);
      const oldBase = path.basename(res.filePath);
      const ext = path.extname(oldBase);
      const targetBase = newName.includes('.') ? newName : `${newName}${ext}`;
      newPath = path.join(dir, targetBase);
      if (newPath !== res.filePath) {
        await fs.rename(res.filePath, newPath);
        fileRenamed = true;
      }
    }

    const updated = await ResourcesRepo.update(id, {
      title: newName,
      ...(newPath ? { filePath: newPath } : {})
    } as any);
    if (updated) {
      eventManager.emit(AppEvent.RESOURCE_UPDATED, updated);
    }
    return { success: true, fileRenamed, newPath, data: updated };
  });

  // 列出标签（默认按当前默认工作空间聚合；若 scope=global 则全局聚合）
  ipcMain.handle('tags:listAll', async (_event, payload?: { workspaceId?: string; scope?: 'workspace' | 'global' }) => {
    let wsId = payload?.workspaceId;
    if (!wsId && payload?.scope !== 'global') {
      try {
        const ws = await WorkspacesRepo.getDefault();
        wsId = ws?.id || undefined;
      } catch {
        /* ignore */
      }
    }
    const rows = await TagsRepo.listAll(wsId);
    return rows;
  });

  // 回填归一化标签表：从 resources.tags 同步到 resource_tags（默认仅同步当前默认工作空间）
  ipcMain.handle('tags:backfill', async (_event, payload?: { workspaceId?: string }) => {
    let wsId = payload?.workspaceId;
    if (!wsId) {
      try {
        const ws = await WorkspacesRepo.getDefault();
        wsId = ws?.id || undefined;
      } catch {
        /* ignore */
      }
    }
    const count = await TagsRepo.backfillFromResources(wsId);
    return { success: true, processed: count };
  });

  // 按标签筛选资源（默认仅返回未软删的资源）
  ipcMain.handle('listResourcesByTag', async (_event, payload: { tag: string; workspaceId?: string; includeDeleted?: boolean; limit?: number; offset?: number }) => {
    const { tag, includeDeleted, limit, offset } = payload || ({} as any);
    if (!tag) return [];
    let wsId = payload.workspaceId;
    if (!wsId) {
      try {
        const ws = await WorkspacesRepo.getDefault();
        wsId = ws?.id || undefined;
      } catch {
        /* ignore */
      }
    }
    return ResourcesRepo.listByTag(tag, { workspaceId: wsId, includeDeleted, limit, offset });
  });

  // 新增：直接从渲染进程接收文件二进制并保存到默认工作空间 resources 目录
  ipcMain.handle('uploadResourceFile', async (_event, payload: { fileName: string; data: ArrayBuffer; folderId?: string; workspaceId?: string }) => {
    try {
      const { fileName, data, folderId, workspaceId } = payload || { fileName: '', data: new ArrayBuffer(0) };
      if (!fileName || !data) return { success: false, error: 'invalid-params' };
      const folderCheck = await getWritableFolder(folderId);
      if (folderCheck.error) {
        return { success: false, error: folderCheck.error };
      }

      // 发送繁忙状态开始
      sendAppBusyStart(0, `上传中: ${fileName}`);

      sendAppBusyStart(0, `涓婁紶涓? ${fileName}`);

      const destination = await resolveFolderDestination(folderId, workspaceId, { ensureDailyFolder: false });
      await fs.mkdir(destination.baseDir, { recursive: true });

      const incomingBuffer = Buffer.from(data as any);
      const incomingHash = createHash('sha256').update(incomingBuffer).digest('hex');
      const ext = path.extname(fileName);
      const nameNoExt = path.basename(fileName, ext);
      let target = path.join(destination.baseDir, fileName);
      let counter = 1;
      while (fscb.existsSync(target)) {
        target = path.join(destination.baseDir, `${nameNoExt}(${counter})${ext}`);
        counter++;
      }

      await fs.writeFile(target, incomingBuffer);

      sendAppBusyProgress(100, `涓婁紶瀹屾垚: ${fileName}`);
      sendAppBusyEnd();

      return { success: true, filePath: target, hash: incomingHash };

      let ws;
      if (workspaceId) {
        ws = await WorkspacesRepo.getById(workspaceId);
      } else {
        ws = await WorkspacesRepo.getDefault();
      }

      let baseDir;
      if (ws?.rootPath) {
        if (folderId) {
          baseDir = path.join(ws.rootPath, 'resources', 'folders', folderId);
        } else {
          baseDir = path.join(ws.rootPath, 'resources');
        }
      } else {
        baseDir = path.join(process.cwd(), 'uploads');
      }

      console.log(folderId, workspaceId, baseDir);

      await fs.mkdir(baseDir, { recursive: true });

      const incomingBuffer = Buffer.from(data as any);
      const incomingHash = createHash('sha256').update(incomingBuffer).digest('hex');

      let target = path.join(baseDir, fileName);
      const ext = path.extname(fileName);
      const nameNoExt = path.basename(fileName, ext);

      // 若存在同名文件，检查 hash；相同则视为重复直接返回
      // if (fscb.existsSync(target)) {
      //   try {
      //     const existHash = await new Promise<string>((resolve, reject) => {
      //       const h = createHash('sha256');
      //       const rs = fscb.createReadStream(target);
      //       rs.on('error', reject);
      //       rs.on('data', (chunk) => h.update(chunk));
      //       rs.on('end', () => resolve(h.digest('hex')));
      //     });
      //     if (existHash === incomingHash) {
      //       sendSpriteBusyEnd(); // 重复文件时结束繁忙状态
      //       sendSpriteNotice({
      //         message: `「${fileName}」已存在，已跳过上传`,
      //         level: 'warning'
      //       });
      //       return { success: false, duplicate: true, filePath: target, hash: incomingHash, error: 'duplicate' };
      //     }
      //   } catch {
      //     /* ignore hash errors and proceed to rename */
      //   }
      // }

      // 仅当同名但不同 hash，执行重命名逻辑避免覆盖
      let counter = 1;
      while (fscb.existsSync(target)) {
        target = path.join(baseDir, `${nameNoExt}(${counter})${ext}`);
        counter++;
      }

      await fs.writeFile(target, incomingBuffer);

      // 发送完成进度和结束
      sendAppBusyProgress(100, `上传完成: ${fileName}`);
      sendAppBusyEnd();

      return { success: true, filePath: target, hash: incomingHash };
    } catch (e: any) {
      console.warn('uploadResourceFile failed', e);
      sendAppBusyEnd(); // 上传失败时结束繁忙状态
      return { success: false, error: e?.message || 'unknown-error' };
    }
  });

  // 截图保存：主进程负责查找/创建「截图」文件夹、写入文件、创建资源记录；渲染进程只传文件数据与上下文
  ipcMain.handle(
    'resource:saveScreenshot',
    async (
      _event,
      payload: {
        data: ArrayBuffer;
        workspaceId?: string;
        folderId?: string | null;
        parentResourceId: string;
        currentTimeSeconds: number;
        parentTitle?: string;
      }
    ) => {
      try {
        const { data, workspaceId, folderId, parentResourceId, currentTimeSeconds, parentTitle } = payload || ({} as any);
        if (!data || !parentResourceId) return { success: false, error: 'invalid-params' };

        let ws: any;
        if (workspaceId) {
          ws = await WorkspacesRepo.getById(workspaceId);
        } else {
          ws = await WorkspacesRepo.getDefault();
        }
        if (!ws?.rootPath) return { success: false, error: 'no-workspace' };

        const screenshotFolderId = await getOrCreateScreenshotFolder(workspaceId ?? ws.id, folderId ?? null);
        if (!screenshotFolderId) return { success: false, error: 'screenshot-folder-failed' };

        const baseDir = path.join(ws.rootPath, 'resources', 'folders', screenshotFolderId);
        await fs.mkdir(baseDir, { recursive: true });

        const now = new Date();
        const pad = (n: number) => n.toString().padStart(2, '0');
        const ts = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
        const baseName = (parentTitle || 'screenshot').replace(/[\\/]+/g, '-').slice(0, 80) || 'screenshot';
        const fileName = `${baseName}-${ts}.png`;

        let target = path.join(baseDir, fileName);
        const ext = path.extname(fileName);
        const nameNoExt = path.basename(fileName, ext);
        let counter = 1;
        while (fscb.existsSync(target)) {
          target = path.join(baseDir, `${nameNoExt}(${counter})${ext}`);
          counter++;
        }

        const buffer = Buffer.from(data as ArrayBuffer);
        await fs.writeFile(target, buffer);

        const mm = Math.floor(currentTimeSeconds / 60)
          .toString()
          .padStart(2, '0');
        const ss = Math.floor(currentTimeSeconds % 60)
          .toString()
          .padStart(2, '0');
        const title = `截图 @ ${mm}:${ss}`;

        const result = await addResource({
          resource: {
            type: 'screenshot',
            filePath: target,
            workspaceId: workspaceId ?? ws.id,
            folderId: screenshotFolderId,
            parentResourceId,
            title
          } as any
        });

        return result?.data ? { success: true, data: result.data } : { success: false, error: 'add-resource-failed' };
      } catch (e: any) {
        console.warn('resource:saveScreenshot failed', e);
        return { success: false, error: e?.message || 'unknown-error' };
      }
    }
  );

  // 录音保存：主进程负责查找/创建「录音」文件夹、写入文件、创建资源记录
  ipcMain.handle(
    'resource:saveAudioRecording',
    async (
      _event,
      payload: {
        data: ArrayBuffer;
        workspaceId?: string;
        folderId?: string | null;
        title?: string;
      }
    ) => {
      try {
        const { data, workspaceId, folderId, title } = payload || ({} as any);
        if (!data) return { success: false, error: 'invalid-params' };

        let ws: any;
        if (workspaceId) {
          ws = await WorkspacesRepo.getById(workspaceId);
        } else {
          ws = await WorkspacesRepo.getDefault();
        }
        if (!ws?.rootPath) return { success: false, error: 'no-workspace' };

        const audioFolderId = await getOrCreateAudioFolder(workspaceId ?? ws.id, folderId ?? null);
        if (!audioFolderId) return { success: false, error: 'audio-folder-failed' };

        const baseDir = path.join(ws.rootPath, 'resources', 'folders', audioFolderId);
        await fs.mkdir(baseDir, { recursive: true });

        const now = new Date();
        const pad = (n: number) => n.toString().padStart(2, '0');
        const ts = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
        const baseName = (title || 'recording').replace(/[\\/]+/g, '-').slice(0, 80) || 'recording';
        const fileName = `${baseName}-${ts}.wav`;

        let target = path.join(baseDir, fileName);
        const ext = path.extname(fileName);
        const nameNoExt = path.basename(fileName, ext);
        let counter = 1;
        while (fscb.existsSync(target)) {
          target = path.join(baseDir, `${nameNoExt}(${counter})${ext}`);
          counter++;
        }

        const buffer = Buffer.from(data as ArrayBuffer);
        await fs.writeFile(target, buffer);

        const result = await addResource({
          resource: {
            type: 'audio',
            filePath: target,
            workspaceId: workspaceId ?? ws.id,
            folderId: audioFolderId,
            title: title || `录音 ${ts}`
          } as any
        });

        return result?.data ? { success: true, data: result.data } : { success: false, error: 'add-resource-failed' };
      } catch (e: any) {
        console.warn('resource:saveAudioRecording failed', e);
        return { success: false, error: e?.message || 'unknown-error' };
      }
    }
  );

  // 流式上传：开始上传
  ipcMain.handle(
    'uploadResourceFileStreamStart',
    async (
      _event,
      payload: {
        fileName: string;
        totalSize: number;
        folderId?: string;
        workspaceId?: string;
      }
    ) => {
      try {
        const { fileName, totalSize } = payload || { fileName: '', totalSize: 0 };
        let { folderId, workspaceId } = payload;
        console.log(folderId, workspaceId);
        if (!fileName || totalSize <= 0) return { success: false, error: 'invalid-params' };
        const folderCheck = await getWritableFolder(folderId);
        if (folderCheck.error) {
          return { success: false, error: folderCheck.error };
        }

        const destination = await resolveFolderDestination(folderId, workspaceId, { ensureDailyFolder: true });
        await fs.mkdir(destination.baseDir, { recursive: true });

        const ext = path.extname(fileName);
        const nameNoExt = path.basename(fileName, ext);
        let target = path.join(destination.baseDir, fileName);
        let counter = 1;
        while (fscb.existsSync(target)) {
          target = path.join(destination.baseDir, `${nameNoExt}(${counter})${ext}`);
          counter++;
        }

        const uploadId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
        const writeStream = fscb.createWriteStream(target);
        const hash = createHash('sha256');

        const stream: UploadStream = {
          fileName,
          filePath: target,
          writeStream,
          hash,
          totalSize,
          receivedSize: 0,
          chunkIndices: new Set()
        };

        uploadStreams.set(uploadId, stream);
        sendAppBusyStart(0, `上传中: ${fileName}`);
        return { success: true, uploadId };

        let ws;
        if (workspaceId) {
          ws = await WorkspacesRepo.getById(workspaceId);
        } else {
          ws = await WorkspacesRepo.getDefault();
          if (ws) workspaceId = ws.id;
        }

        if (ws?.rootPath && !folderId) {
          try {
            folderId = await ensureDailyFolder(ws.id, ws.rootPath);
          } catch (e) {
            console.warn('Failed to ensure daily folder', e);
          }
        }

        let baseDir;
        if (ws?.rootPath) {
          if (folderId) {
            baseDir = path.join(ws.rootPath, 'resources', 'folders', folderId);
          } else {
            baseDir = path.join(ws.rootPath, 'resources');
          }
        } else {
          baseDir = path.join(process.cwd(), 'uploads');
        }
        console.log(baseDir);

        await fs.mkdir(baseDir, { recursive: true });

        const ext = path.extname(fileName);
        const nameNoExt = path.basename(fileName, ext);
        let target = path.join(baseDir, fileName);

        // 处理同名文件（先不检查 hash，等上传完成后再检查）
        let counter = 1;
        while (fscb.existsSync(target)) {
          target = path.join(baseDir, `${nameNoExt}(${counter})${ext}`);
          counter++;
        }

        const uploadId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
        const writeStream = fscb.createWriteStream(target);
        const hash = createHash('sha256');

        const stream: UploadStream = {
          fileName,
          filePath: target,
          writeStream,
          hash,
          totalSize,
          receivedSize: 0,
          chunkIndices: new Set()
        };

        uploadStreams.set(uploadId, stream);

        // 发送繁忙状态开始
        sendAppBusyStart(0, `上传中: ${fileName}`);

        return { success: true, uploadId };
      } catch (e: any) {
        console.warn('uploadResourceFileStreamStart failed', e);
        return { success: false, error: e?.message || 'unknown-error' };
      }
    }
  );

  // 流式上传：发送数据块
  ipcMain.handle('uploadResourceFileStreamChunk', async (_event, payload: { uploadId: string; chunk: ArrayBuffer; chunkIndex: number }) => {
    try {
      const { uploadId, chunk, chunkIndex } = payload || { uploadId: '', chunk: new ArrayBuffer(0), chunkIndex: -1 };
      if (!uploadId || !chunk || chunkIndex < 0) return { success: false, error: 'invalid-params' };

      const stream = uploadStreams.get(uploadId);
      if (!stream) return { success: false, error: 'upload-not-found' };

      // 检查是否重复接收
      if (stream.chunkIndices.has(chunkIndex)) {
        return { success: true }; // 已接收，跳过
      }

      const buffer = Buffer.from(chunk);
      stream.hash.update(buffer);
      stream.receivedSize += buffer.length;
      stream.chunkIndices.add(chunkIndex);

      // 计算并发送进度
      const progress = Math.round((stream.receivedSize / stream.totalSize) * 100);
      sendAppBusyProgress(progress, `上传中: ${stream.fileName}`);

      return new Promise((resolve, reject) => {
        stream.writeStream.write(buffer, (err) => {
          if (err) {
            console.warn('uploadResourceFileStreamChunk write failed', err);
            sendAppBusyEnd(); // 上传失败时结束繁忙状态
            reject({ success: false, error: err.message });
          } else {
            resolve({ success: true });
          }
        });
      });
    } catch (e: any) {
      console.warn('uploadResourceFileStreamChunk failed', e);
      return { success: false, error: e?.message || 'unknown-error' };
    }
  });

  // 流式上传：结束上传
  ipcMain.handle('uploadResourceFileStreamEnd', async (_event, payload: { uploadId: string }) => {
    try {
      const { uploadId } = payload || { uploadId: '' };
      if (!uploadId) return { success: false, error: 'invalid-params' };

      const stream = uploadStreams.get(uploadId);
      if (!stream) return { success: false, error: 'upload-not-found' };

      // 关闭写入流
      await new Promise<void>((resolve, reject) => {
        stream.writeStream.end((err: any) => {
          if (err) reject(err);
          else resolve();
        });
      });

      const incomingHash = stream.hash.digest('hex');
      const target = stream.filePath;

      // 检查文件大小是否匹配
      if (stream.receivedSize !== stream.totalSize) {
        // 清理不完整的文件
        try {
          await fs.unlink(target);
        } catch {
          /* ignore */
        }
        uploadStreams.delete(uploadId);
        sendAppBusyEnd(); // 上传失败时结束繁忙状态
        return { success: false, error: 'size-mismatch' };
      }

      // 检查是否与已存在文件重复（同名文件）
      // const baseDir = path.dirname(target);
      // const originalFileName = stream.fileName;
      // const originalTarget = path.join(baseDir, originalFileName);

      // if (fscb.existsSync(originalTarget) && originalTarget !== target) {
      //   try {
      //     const existHash = await new Promise<string>((resolve, reject) => {
      //       const h = createHash('sha256');
      //       const rs = fscb.createReadStream(originalTarget);
      //       rs.on('error', reject);
      //       rs.on('data', (chunk) => h.update(chunk));
      //       rs.on('end', () => resolve(h.digest('hex')));
      //     });
      //     if (existHash === incomingHash) {
      //       // 删除新上传的文件，返回已存在的文件
      //       try {
      //         await fs.unlink(target);
      //       } catch {
      //         /* ignore */
      //       }
      //       uploadStreams.delete(uploadId);
      //       sendSpriteBusyEnd(); // 重复文件时结束繁忙状态
      //       sendSpriteNotice({
      //         message: `「${stream.fileName}」已存在，已跳过上传`,
      //         level: 'warning'
      //       });
      //       return { success: false, duplicate: true, filePath: originalTarget, hash: incomingHash, error: 'duplicate' };
      //     }
      //   } catch {
      //     /* ignore hash errors and proceed */
      //   }
      // }

      uploadStreams.delete(uploadId);

      // 发送繁忙状态结束
      sendAppBusyEnd();

      return { success: true, filePath: target, hash: incomingHash };
    } catch (e: any) {
      console.warn('uploadResourceFileStreamEnd failed', e);
      // 清理
      const stream = uploadStreams.get(payload.uploadId);
      if (stream) {
        try {
          stream.writeStream.destroy();
          await fs.unlink(stream.filePath).catch(() => { });
        } catch {
          /* ignore */
        }
        uploadStreams.delete(payload.uploadId);
      }
      sendAppBusyEnd(); // 上传失败时结束繁忙状态
      return { success: false, error: e?.message || 'unknown-error' };
    }
  });

  // ---- 编排字幕轨道 (subtitle-edit) ----
  // 存储在项目文件夹的 data/tracks/ 子目录中，不创建数据库记录

  ipcMain.handle('resource:createSubtitleEditTrack', async (_event, payload: { parentResourceId: string; title: string }) => {
    const { parentResourceId, title } = payload;
    const parent = await ResourcesRepo.getById(parentResourceId);
    if (!parent) throw new Error('父资源不存在');
    if (!parent.workspaceId) throw new Error('父资源缺少工作空间 ID');

    // 生成轨道 ID
    const trackId = `subtitle-${Date.now().toString(36)}`;
    const fileName = `${trackId}.json`;

    // 轨道配置内容
    const trackConfig = {
      version: 1,
      resourceId: parentResourceId,
      type: 'subtitle-edit',
      startedAt: Date.now(),
      updatedAt: Date.now(),
      translatedSegments: []
    };

    // 轨道元数据条目
    const trackEntry: ProjectTrackEntry = {
      id: trackId,
      type: 'media', // 使用 media 类型（字幕轨道在时间轴上类似媒体轨道）
      fileName,
      title,
      createdAt: Date.now()
    };

    // 写入轨道配置文件并更新元数据
    const result = await writeProjectTrackConfig(parentResourceId, parent.workspaceId, trackEntry, trackConfig);
    if (!result.success) {
      throw new Error(`创建编排字幕轨道失败: ${result.error}`);
    }

    // 获取文件路径用于返回
    const filePath = await getResourceProjectPath(parentResourceId, parent.workspaceId);
    const fullPath = filePath ? path.join(filePath, 'data', 'tracks', fileName) : undefined;

    return { id: trackId, trackId, filePath: fullPath };
  });

  ipcMain.handle('resource:getSubtitleEditTracks', async (_event, payload: { parentResourceId: string }) => {
    const { parentResourceId } = payload;
    const parent = await ResourcesRepo.getById(parentResourceId);
    if (!parent || !parent.workspaceId) return [];

    const workspaceId = parent.workspaceId;

    // 从项目文件夹读取轨道列表（过滤出 subtitle 类型的轨道）
    const tracks = await listProjectTracks(parentResourceId, workspaceId, 'media');

    // 过滤出以 'subtitle-' 开头的轨道
    const subtitleTracks = tracks.filter((t) => t.id.startsWith('subtitle-'));

    // 读取每个轨道的配置
    const results = await Promise.all(
      subtitleTracks.map(async (t) => {
        let segments: Array<{ index: number; text: string; st?: string; et?: string }> = [];

        const trackConfig = await readProjectDataJsonSubDir<any>(parentResourceId, workspaceId, 'tracks', t.fileName);
        if (trackConfig) {
          segments = trackConfig.translatedSegments || [];
        }

        // 获取文件路径
        const filePath = await getResourceProjectPath(parentResourceId, workspaceId);
        const fullPath = filePath ? path.join(filePath, 'data', 'tracks', t.fileName) : undefined;

        return { id: t.id, trackId: t.id, title: t.title, filePath: fullPath, segments };
      })
    );

    return results;
  });

  ipcMain.handle('resource:deleteSubtitleEditTrack', async (_event, payload: { parentResourceId: string; trackId: string }) => {
    const { parentResourceId, trackId } = payload;
    const parent = await ResourcesRepo.getById(parentResourceId);
    if (!parent || !parent.workspaceId) throw new Error('父资源不存在或缺少工作空间 ID');
    const workspaceId = parent.workspaceId;

    const result = await deleteProjectTrack(parentResourceId, workspaceId, trackId);
    return result;
  });

  ipcMain.handle('resource:updateSubtitleEditTrack', async (_event, payload: { parentResourceId: string; trackId: string; segments: { st: string; et: string; text: string; index: number }[] }) => {
    const { parentResourceId, trackId, segments } = payload;
    const parent = await ResourcesRepo.getById(parentResourceId);
    if (!parent || !parent.workspaceId) throw new Error('父资源不存在或缺少工作空间 ID');
    const workspaceId = parent.workspaceId;

    const result = await updateSubtitleEditTrackSegments(parentResourceId, workspaceId, trackId, segments);
    return result;
  });

  // ---- 翻译轨道 (translation) ----
  // 删除翻译文件和更新项目元数据

  ipcMain.handle('resource:deleteTranslation', async (_event, payload: { parentResourceId: string; translationId: string }) => {
    const { parentResourceId, translationId } = payload;
    const parent = await ResourcesRepo.getById(parentResourceId);
    if (!parent || !parent.workspaceId) throw new Error('父资源不存在或缺少工作空间 ID');
    const workspaceId = parent.workspaceId;

    const result = await deleteProjectTranslation(parentResourceId, workspaceId, translationId);
    return result;
  });

  // ---- 独立 TTS 轨道 (tts-track) ----
  // 存储在项目文件夹的 data/tracks/ 子目录中，不创建数据库记录

  ipcMain.handle('resource:createTTSTrack', async (_event, payload: { parentResourceId: string; title: string; voiceName: string; rate: number; pitch: number; autoTrimSilence: boolean }) => {
    const { parentResourceId, title, voiceName, rate, pitch, autoTrimSilence } = payload;
    const parent = await ResourcesRepo.getById(parentResourceId);
    if (!parent) throw new Error('父资源不存在');
    if (!parent.workspaceId) throw new Error('父资源缺少工作空间 ID');

    // 生成轨道 ID
    const trackId = `tts-${Date.now().toString(36)}`;
    const fileName = `${trackId}.json`;

    // 轨道配置内容
    const trackConfig = {
      version: 1,
      resourceId: parentResourceId,
      type: 'tts-track',
      startedAt: Date.now(),
      updatedAt: Date.now(),
      config: { voiceName, rate, pitch, autoTrimSilence },
      segments: [] // 存储合成的片段信息
    };

    // 轨道元数据条目
    const trackEntry: ProjectTrackEntry = {
      id: trackId,
      type: 'tts',
      fileName,
      title,
      createdAt: Date.now()
    };

    // 写入轨道配置文件并更新元数据
    const result = await writeProjectTrackConfig(parentResourceId, parent.workspaceId, trackEntry, trackConfig);
    if (!result.success) {
      throw new Error(`创建 TTS 轨道失败: ${result.error}`);
    }

    // 获取文件路径用于返回
    const filePath = await getResourceProjectPath(parentResourceId, parent.workspaceId);
    const fullPath = filePath ? path.join(filePath, 'data', 'tracks', fileName) : undefined;

    return { id: trackId, trackId, filePath: fullPath };
  });

  ipcMain.handle('resource:getTTSTracks', async (_event, payload: { parentResourceId: string }) => {
    const { parentResourceId } = payload;
    const parent = await ResourcesRepo.getById(parentResourceId);
    if (!parent || !parent.workspaceId) return [];
    const workspaceId = parent.workspaceId;

    // 从项目文件夹读取轨道列表
    const tracks = await listProjectTracks(parentResourceId, workspaceId, 'tts');

    // 读取每个轨道的配置
    const results = await Promise.all(
      tracks.map(async (t) => {
        let config = { voiceName: 'zh-CN-XiaoxiaoNeural', rate: 20, pitch: 0, autoTrimSilence: true };
        let segments: Array<{ index: number; text: string; startTime: number; endTime: number; md5?: string }> = [];

        const trackConfig = await readProjectDataJsonSubDir<any>(parentResourceId, workspaceId, 'tracks', t.fileName);
        if (trackConfig) {
          if (trackConfig.config) config = { ...config, ...trackConfig.config };
          segments = trackConfig.segments || [];
        }

        // 获取文件路径
        const filePath = await getResourceProjectPath(parentResourceId, workspaceId);
        const fullPath = filePath ? path.join(filePath, 'data', 'tracks', t.fileName) : undefined;

        return { id: t.id, title: t.title, filePath: fullPath, config, segments };
      })
    );

    return results;
  });

  ipcMain.handle(
    'resource:updateTTSTrack',
    async (
      _event,
      payload: {
        parentResourceId: string;
        trackId: string;
        title?: string;
        config?: { voiceName?: string; rate?: number; pitch?: number; autoTrimSilence?: boolean };
        segments?: Array<{ index: number; text: string; startTime: number; endTime: number; md5?: string }>;
      }
    ) => {
      const { parentResourceId, trackId, title, config, segments } = payload;
      const parent = await ResourcesRepo.getById(parentResourceId);
      if (!parent || !parent.workspaceId) throw new Error('父资源不存在或缺少工作空间 ID');
      const workspaceId = parent.workspaceId;

      // 获取轨道元数据
      const meta = await readProjectMeta(parentResourceId, workspaceId);
      const track = meta?.tracks?.find((t) => t.id === trackId);
      if (!track) throw new Error('TTS 轨道不存在');

      // 读取现有配置
      let trackConfig = await readProjectDataJsonSubDir<any>(parentResourceId, workspaceId, 'tracks', track.fileName);
      if (!trackConfig) {
        trackConfig = { version: 1, resourceId: parentResourceId, type: 'tts-track' };
      }

      // 更新配置
      trackConfig.updatedAt = Date.now();
      if (config) {
        trackConfig.config = { ...trackConfig.config, ...config };
      }
      if (segments !== undefined) {
        trackConfig.segments = segments;
      }

      // 更新轨道元数据条目
      const updatedEntry: ProjectTrackEntry = {
        ...track,
        title: title || track.title,
        updatedAt: Date.now()
      };

      // 写入更新
      const result = await writeProjectTrackConfig(parentResourceId, workspaceId, updatedEntry, trackConfig);
      if (!result.success) {
        throw new Error(`更新 TTS 轨道失败: ${result.error}`);
      }

      return { success: true };
    }
  );

  ipcMain.handle('resource:deleteTTSTrack', async (_event, payload: { parentResourceId: string; trackId: string }) => {
    const { parentResourceId, trackId } = payload;
    const parent = await ResourcesRepo.getById(parentResourceId);
    if (!parent || !parent.workspaceId) throw new Error('父资源不存在或缺少工作空间 ID');
    const workspaceId = parent.workspaceId;

    const result = await deleteProjectTrack(parentResourceId, workspaceId, trackId);
    return result;
  });

  // ---- 媒体轨道 (media-track) ----
  // 存储在项目文件夹的 data/tracks/ 子目录中，不创建数据库记录

  ipcMain.handle('resource:createMediaTrack', async (_event, payload: { parentResourceId: string; trackId: string; label: string; zIndex: number; color?: string }) => {
    const { parentResourceId, trackId, label, zIndex, color } = payload;
    const parent = await ResourcesRepo.getById(parentResourceId);
    if (!parent) throw new Error('父资源不存在');
    if (!parent.workspaceId) throw new Error('父资源缺少工作空间 ID');

    const workspaceId = parent.workspaceId;
    const fileName = `${trackId}.json`;

    // 轨道配置内容
    const trackConfig = {
      version: 1,
      resourceId: parentResourceId,
      trackId,
      label,
      segments: [],
      sources: [],
      zIndex,
      visible: true,
      locked: false,
      color: color || null,
      createdAt: Date.now(),
      updatedAt: Date.now()
    };

    // 轨道元数据条目
    const trackEntry: ProjectTrackEntry = {
      id: trackId,
      type: 'media',
      fileName,
      title: label,
      createdAt: Date.now()
    };

    // 写入轨道配置文件并更新元数据
    const result = await writeProjectTrackConfig(parentResourceId, workspaceId, trackEntry, trackConfig);
    if (!result.success) {
      throw new Error(`创建媒体轨道失败: ${result.error}`);
    }

    // 获取文件路径用于返回
    const filePath = await getResourceProjectPath(parentResourceId, workspaceId);
    const fullPath = filePath ? path.join(filePath, 'data', 'tracks', fileName) : undefined;

    console.log(`[createMediaTrack] 创建媒体轨道: ${label}, trackId: ${trackId}`);
    return { id: trackId, trackId, filePath: fullPath };
  });

  ipcMain.handle('resource:getMediaTracks', async (_event, payload: { parentResourceId: string }) => {
    const { parentResourceId } = payload;
    const parent = await ResourcesRepo.getById(parentResourceId);
    if (!parent || !parent.workspaceId) return [];

    const workspaceId = parent.workspaceId;

    // 从项目文件夹读取 media 类型的轨道列表
    const tracks = await listProjectTracks(parentResourceId, workspaceId, 'media');

    // 排除字幕编辑轨道（以 'subtitle-' 开头的轨道）
    const mediaOnlyTracks = tracks.filter((t) => !t.id.startsWith('subtitle-'));

    const results = await Promise.all(
      mediaOnlyTracks.map(async (t) => {
        const trackConfig = await readProjectTrackConfig<any>(parentResourceId, workspaceId, t.fileName);

        return {
          id: t.id,
          trackId: t.id,
          title: t.title,
          label: trackConfig?.label || t.title,
          zIndex: trackConfig?.zIndex ?? 0,
          visible: trackConfig?.visible ?? true,
          locked: trackConfig?.locked ?? false,
          color: trackConfig?.color || null,
          segments: trackConfig?.segments || [],
          sources: trackConfig?.sources || []
        };
      })
    );

    // 按 zIndex 排序
    return results.sort((a, b) => a.zIndex - b.zIndex);
  });

  ipcMain.handle(
    'resource:updateMediaTrack',
    async (
      _event,
      payload: {
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
    ) => {
      const { parentResourceId, trackId, ...updates } = payload;
      const parent = await ResourcesRepo.getById(parentResourceId);
      if (!parent || !parent.workspaceId) throw new Error('父资源不存在或缺少工作空间 ID');

      const workspaceId = parent.workspaceId;

      // 获取轨道元数据
      const meta = await readProjectMeta(parentResourceId, workspaceId);
      const track = meta?.tracks?.find((t) => t.id === trackId);
      if (!track) throw new Error('媒体轨道不存在');

      // 读取现有配置
      let trackConfig = await readProjectTrackConfig<any>(parentResourceId, workspaceId, track.fileName);
      if (!trackConfig) {
        trackConfig = { version: 1, resourceId: parentResourceId, trackId };
      }

      // 更新配置
      trackConfig.updatedAt = Date.now();
      if (updates.label !== undefined) trackConfig.label = updates.label;
      if (updates.zIndex !== undefined) trackConfig.zIndex = updates.zIndex;
      if (updates.visible !== undefined) trackConfig.visible = updates.visible;
      if (updates.locked !== undefined) trackConfig.locked = updates.locked;
      if (updates.color !== undefined) trackConfig.color = updates.color;
      if (updates.segments !== undefined) trackConfig.segments = updates.segments;
      if (updates.sources !== undefined) trackConfig.sources = updates.sources;

      // 更新轨道元数据中的标题
      if (updates.label !== undefined) {
        track.title = updates.label;
        track.updatedAt = Date.now();
        await writeProjectMeta(parentResourceId, workspaceId, { tracks: meta?.tracks });
      }

      // 写入配置文件
      const result = await writeProjectDataSubDirFile(parentResourceId, workspaceId, 'tracks', track.fileName, JSON.stringify(trackConfig, null, 2));
      return { success: result.success, error: result.error };
    }
  );

  ipcMain.handle('resource:deleteMediaTrack', async (_event, payload: { parentResourceId: string; trackId: string }) => {
    const { parentResourceId, trackId } = payload;
    const parent = await ResourcesRepo.getById(parentResourceId);
    if (!parent || !parent.workspaceId) throw new Error('父资源不存在或缺少工作空间 ID');

    const result = await deleteProjectTrack(parentResourceId, parent.workspaceId, trackId);
    return result;
  });

  // ---- 资源项目目录管理 ----

  /**
   * 获取资源项目目录路径（不创建目录）
   */
  ipcMain.handle('resource:getProjectPath', async (_event, payload: { resourceId: string; workspaceId: string }) => {
    const { resourceId, workspaceId } = payload;
    if (!resourceId || !workspaceId) return { success: false, error: 'invalid-params' };

    const projectPath = await getResourceProjectPath(resourceId, workspaceId);
    return { success: true, path: projectPath };
  });

  /**
   * 确保资源项目目录存在（如果不存在则创建）
   * 返回项目目录路径和子目录路径
   */
  ipcMain.handle('resource:ensureProjectDir', async (_event, payload: { resourceId: string; workspaceId: string; subDirs?: ProjectSubDir[] }) => {
    const { resourceId, workspaceId, subDirs } = payload;
    if (!resourceId || !workspaceId) return { success: false, error: 'invalid-params' };

    const result = await ensureResourceProjectDir(resourceId, workspaceId, subDirs);
    if (!result) {
      return { success: false, error: 'workspace-not-found' };
    }

    return { success: true, path: result.path, subDirs: result.subDirs };
  });

  /**
   * 清空资源项目目录（保留目录结构，删除内容）
   * 可选清空指定子目录
   */
  ipcMain.handle('resource:clearProjectDir', async (_event, payload: { resourceId: string; workspaceId: string; subDir?: ProjectSubDir }) => {
    const { resourceId, workspaceId, subDir } = payload;
    if (!resourceId || !workspaceId) return { success: false, error: 'invalid-params' };

    return await clearResourceProjectDir(resourceId, workspaceId, subDir);
  });

  /**
   * 删除资源项目目录（完全删除）
   */
  ipcMain.handle('resource:deleteProjectDir', async (_event, payload: { resourceId: string; workspaceId: string }) => {
    const { resourceId, workspaceId } = payload;
    if (!resourceId || !workspaceId) return { success: false, error: 'invalid-params' };

    return await deleteResourceProjectDir(resourceId, workspaceId);
  });

  /**
   * 获取资源项目目录统计信息
   */
  ipcMain.handle('resource:getProjectStats', async (_event, payload: { resourceId: string; workspaceId: string }) => {
    const { resourceId, workspaceId } = payload;
    if (!resourceId || !workspaceId) return { success: false, error: 'invalid-params' };

    const stats = await getResourceProjectStats(resourceId, workspaceId);
    if (!stats) {
      return { success: false, error: 'workspace-not-found' };
    }

    return { success: true, ...stats };
  });

  /**
   * 在资源项目目录中创建自定义子目录
   */
  ipcMain.handle('resource:createProjectSubDir', async (_event, payload: { resourceId: string; workspaceId: string; dirName: string }) => {
    const { resourceId, workspaceId, dirName } = payload;
    if (!resourceId || !workspaceId || !dirName) {
      return { success: false, error: 'invalid-params' };
    }

    return await createCustomProjectSubDir(resourceId, workspaceId, dirName);
  });
}

// keep file local helpers minimal; tagging moved to TaggingService

// Helper function for background import task
async function runImportTask(win: BrowserWindow, filePaths: string[], workspaceId?: string, folderId?: string): Promise<void> {
  // 触发精灵动画：开始导入（通过事件解耦）
  eventManager.emit(AppEvent.SPRITE_RESOURCE_IMPORT_START);

  const sendProgress = (current: number, total: number, message: string): void => {
    if (win.isDestroyed()) return;
    win.webContents.send('resource:import-progress', {
      visible: true,
      current,
      total,
      percent: total > 0 ? Math.round((current / total) * 100) : 0,
      message
    });
  };

  const sendDone = (total: number): void => {
    if (win.isDestroyed()) return;
    win.webContents.send('resource:import-progress', {
      visible: false,
      current: total,
      total,
      percent: 100,
      message: '导入完成'
    });
    // Trigger reload
    win.webContents.send('resource:changed', { action: 'imported' });
  };

  try {
    if (folderId) {
      const targetFolder = await FoldersRepo.getById(folderId);
      if (targetFolder && isLinkedFolderRow(targetFolder)) {
        const linkedContext = await getLinkedFolderContext(targetFolder);
        const totalEntries = filePaths.length;
        let processedEntries = 0;

        await fs.mkdir(linkedContext.folderPath, { recursive: true });

        for (const sourcePath of filePaths) {
          processedEntries += 1;
          sendProgress(processedEntries, totalEntries, `姝ｅ湪瀵煎叆: ${path.basename(sourcePath)}`);
          await copyPathIntoDirectory(sourcePath, linkedContext.folderPath);
          eventManager.emit(AppEvent.SPRITE_RESOURCE_IMPORT_PROGRESS, {
            progress: totalEntries > 0 ? Math.round((processedEntries / totalEntries) * 100) : 100
          });
        }

        await rescanLinkedDirectoryByFolderId(linkedContext.mount.rootFolderId || linkedContext.folder.id);
        eventManager.emit(AppEvent.SPRITE_RESOURCE_IMPORT_COMPLETE, { count: totalEntries });
        sendDone(totalEntries);
        return;
      }
    }
    sendProgress(0, 0, '正在扫描...');

    // 1. Scan and classify
    const filesToImport: Array<{ path: string; name: string; targetFolderId: string | null }> = [];
    const foldersToScan: Array<{ path: string; name: string; targetParentId: string | null }> = [];
    const rootParentId = folderId || null;

    // Initial classification
    for (const p of filePaths) {
      try {
        const stat = await fs.stat(p);
        const name = path.basename(p);
        if (stat.isDirectory()) {
          foldersToScan.push({ path: p, name, targetParentId: rootParentId });
        } else {
          filesToImport.push({ path: p, name, targetFolderId: rootParentId });
        }
      } catch {
        /* ignore */
      }
    }

    // 2. Process Folders (Create root folder & Scan recursively)
    for (const folder of foldersToScan) {
      try {
        // Create the folder itself
        const createRes = await FoldersRepo.create({
          name: folder.name,
          parentId: folder.targetParentId,
          workspaceId: workspaceId || null
        } as any);

        if (!createRes?.id) continue;
        const newRootId = createRes.id;

        // Recursive scan
        const entries: Array<{ name: string; path: string; isDirectory: boolean; relativePath: string }> = [];
        async function traverse(currentPath: string, relativeBase: string): Promise<void> {
          const dirents = await fs.readdir(currentPath, { withFileTypes: true });
          for (const dirent of dirents) {
            const fullPath = path.join(currentPath, dirent.name);
            const relPath = path.join(relativeBase, dirent.name);
            if (dirent.isDirectory()) {
              entries.push({ name: dirent.name, path: fullPath, isDirectory: true, relativePath: relPath });
              await traverse(fullPath, relPath);
            } else {
              entries.push({ name: dirent.name, path: fullPath, isDirectory: false, relativePath: relPath });
            }
          }
        }
        await traverse(folder.path, '');

        // Sort directories by depth
        const subDirs = entries.filter((e) => e.isDirectory).sort((a, b) => a.relativePath.length - b.relativePath.length);
        const subFiles = entries.filter((e) => !e.isDirectory);

        // Map relative path to folder ID
        const relPathToId: Record<string, string> = {};

        // Create sub-directories
        for (const dir of subDirs) {
          const normalizedRelPath = dir.relativePath.replace(/\\/g, '/');
          const parts = normalizedRelPath.split('/').filter(Boolean);
          const dirName = parts[parts.length - 1];
          const parentRelPath = parts.slice(0, -1).join('/');
          const parentId = parentRelPath ? relPathToId[parentRelPath] : newRootId;

          if (parentId) {
            const res = await FoldersRepo.create({
              name: dirName,
              parentId,
              workspaceId: workspaceId || null
            } as any);
            if (res?.id) {
              relPathToId[normalizedRelPath] = res.id;
            }
          }
        }

        // Add files to import queue
        for (const file of subFiles) {
          const normalizedRelPath = file.relativePath.replace(/\\/g, '/');
          const parentRelPath = normalizedRelPath.split('/').slice(0, -1).join('/');
          const targetId = parentRelPath ? relPathToId[parentRelPath] : newRootId;
          if (targetId) {
            filesToImport.push({
              path: file.path,
              name: file.name,
              targetFolderId: targetId
            });
          }
        }
      } catch (e) {
        console.warn('Error processing folder', folder.path, e);
      }
    }

    // 3. Import Files
    const totalFiles = filesToImport.length;
    let processed = 0;

    for (const task of filesToImport) {
      sendProgress(processed + 1, totalFiles, `正在导入: ${task.name}`);

      // Reuse resource:add logic by calling ResourcesRepo directly and handling file copy
      try {
        const now = Date.now();
        let finalFilePath = task.path;
        let wsRootPath: string | undefined;

        // Determine workspace root
        if (workspaceId) {
          const ws = await WorkspacesRepo.getById(workspaceId);
          wsRootPath = ws?.rootPath || undefined;
        } else {
          const ws = await WorkspacesRepo.getDefault();
          wsRootPath = ws?.rootPath || undefined;
        }

        // Copy file if needed
        if (wsRootPath) {
          const base = path.basename(task.path);
          let targetDir;
          if (task.targetFolderId) {
            targetDir = path.join(wsRootPath, 'resources', 'folders', task.targetFolderId);
          } else {
            targetDir = path.join(wsRootPath, 'resources');
          }

          await fs.mkdir(targetDir, { recursive: true });
          let target = path.join(targetDir, base);

          // Avoid overwriting
          if (target !== task.path) {
            if (fscb.existsSync(target)) {
              const ext = path.extname(base);
              const name = path.basename(base, ext);
              let i = 1;
              while (fscb.existsSync(path.join(targetDir, `${name}(${i})${ext}`))) {
                i++;
              }
              target = path.join(targetDir, `${name}(${i})${ext}`);
            }
            await fs.copyFile(task.path, target);
            finalFilePath = target;
          }
        }

        // Get file stats and calculate hash
        let sizeBytes = 0;
        let fileHash = '';
        try {
          const stats = await fs.stat(finalFilePath);
          sizeBytes = stats.size;

          fileHash = await new Promise<string>((resolve, reject) => {
            const hash = createHash('sha256');
            const stream = fscb.createReadStream(finalFilePath);
            stream.on('error', reject);
            stream.on('data', (chunk) => hash.update(chunk));
            stream.on('end', () => resolve(hash.digest('hex')));
          });
        } catch (e) {
          console.warn('Failed to calculate hash/size for', finalFilePath, e);
        }

        // Detect type
        const ext = (path.extname(task.name).split('.').pop() || '').toLowerCase();
        let type = 'file';
        const imageExt = new Set(['jpg', 'jpeg', 'png', 'gif', 'webp', 'avif', 'svg', 'ico', 'bmp']);
        const videoExt = new Set(['mp4', 'webm', 'mov', 'avi', 'mkv', 'flv', 'mpeg', 'mpg', 'm4v']);
        const audioExt = new Set(['mp3', 'wav', 'ogg', 'aac', 'flac', 'm4a', 'opus']);
        const documentExt = new Set(['pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'md', 'markdown']);
        const textExt = new Set(['txt', 'csv', 'json', 'yaml', 'yml', 'xml', 'html', 'css', 'js', 'ts', 'jsx', 'tsx']);

        if (imageExt.has(ext)) type = 'image';
        else if (videoExt.has(ext)) type = 'video';
        else if (audioExt.has(ext)) type = 'audio';
        else if (documentExt.has(ext)) type = 'document';
        else if (textExt.has(ext)) type = 'text';

        const resource = {
          id: (crypto as any).randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`,
          type,
          title: task.name,
          filePath: finalFilePath,
          folderId: task.targetFolderId,
          workspaceId: workspaceId || undefined,
          sizeBytes,
          metadata: fileHash ? JSON.stringify({ hashSha256: fileHash }) : undefined,
          collectedAt: now,
          createdAt: now,
          updatedAt: now,
          status: 'new'
        };

        const row = await ResourcesRepo.upsert(resource as any);

        // Generate thumbnail if needed (async)
        if (row && !row.thumbnailPath) {
          // Fire and forget thumbnail generation
          generateThumbnailForResource({ filePath: finalFilePath, type: row.type as any, title: row.title as string })
            .then(async (thumb) => {
              if (thumb && wsRootPath) {
                const baseDir = path.join(wsRootPath, 'resources', '.thumbs');
                await fs.mkdir(baseDir, { recursive: true });
                const thumbPath = path.join(baseDir, `${row.id}.png`);
                await fs.writeFile(thumbPath, thumb);
                await ResourcesRepo.update(row.id, { thumbnailPath: thumbPath } as any);
              }
            })
            .catch(() => { });
        }
      } catch (e) {
        console.error('Import file failed', task.path, e);
      }
      processed++;
      // 更新精灵进度（通过事件解耦）
      eventManager.emit(AppEvent.SPRITE_RESOURCE_IMPORT_PROGRESS, {
        progress: Math.round((processed / totalFiles) * 100)
      });
    }

    // 触发精灵动画：导入完成（通过事件解耦）
    eventManager.emit(AppEvent.SPRITE_RESOURCE_IMPORT_COMPLETE, { count: totalFiles });

    sendDone(totalFiles);
  } catch (e) {
    console.error('Import task failed', e);
    // 触发精灵动画：导入失败（通过事件解耦）
    eventManager.emit(AppEvent.SPRITE_RESOURCE_IMPORT_ERROR, {
      message: e instanceof Error ? e.message : String(e)
    });
    if (!win.isDestroyed()) {
      win.webContents.send('resource:import-progress', {
        visible: false,
        error: '导入失败'
      });
    }
  }
}
