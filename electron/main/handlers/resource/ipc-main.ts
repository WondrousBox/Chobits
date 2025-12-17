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
import { addResource, ensureDailyFolder } from '.';
import type { Resource } from './ipc-renderer';

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

export function initResourceHandlers(): void {
  // 导入本地文件（仅文件）
  ipcMain.handle('resource:importLocalFiles', async (_event, payload: { workspaceId?: string; folderId?: string }) => {
    const { workspaceId, folderId } = payload || {};
    const win = BrowserWindow.getFocusedWindow();
    if (!win) return { canceled: true };

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
  ipcMain.handle('resource:list', async () => {
    // Hide soft-deleted items by default
    return await ResourcesRepo.list({ deletedAt: 0 } as any);
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
    // Soft delete: mark deletedAt to trigger recycle_bin entry via trigger
    const row = await ResourcesRepo.update(payload.id, { deletedAt: Date.now() } as any);
    if (row) {
      eventManager.emit(AppEvent.RESOURCE_DELETED, row);
    }
    return { success: true, data: row };
  });

  ipcMain.handle('deleteResources', async (_event, payload: { ids: string[] }) => {
    const now = Date.now();
    const rows = await Promise.all((payload.ids || []).map((id) => ResourcesRepo.update(id, { deletedAt: now } as any)));
    const deleted = rows.filter(Boolean);
    if (deleted.length > 0) {
      eventManager.emit(AppEvent.RESOURCE_BATCH_DELETED, deleted);
    }
    return { success: true, deleted: deleted.length, data: deleted };
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
    return { moved, data: updated };
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

      // 目标工作空间：来自目标文件夹，或调用方提供，或默认空间
      let targetWorkspaceId: string | undefined = payload?.workspaceId;
      if (targetFolderId) {
        const folder = await FoldersRepo.getById(targetFolderId);
        if (!folder) return { success: false, error: 'folder-not-found' };
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
    if (!res) return { success: false };

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

      // 发送繁忙状态开始
      sendAppBusyStart(0, `上传中: ${fileName}`);

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
}

// keep file local helpers minimal; tagging moved to TaggingService

// Helper function for background import task
async function runImportTask(win: BrowserWindow, filePaths: string[], workspaceId?: string, folderId?: string): Promise<void> {
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
    }

    sendDone(totalFiles);
  } catch (e) {
    console.error('Import task failed', e);
    if (!win.isDestroyed()) {
      win.webContents.send('resource:import-progress', {
        visible: false,
        error: '导入失败'
      });
    }
  }
}
