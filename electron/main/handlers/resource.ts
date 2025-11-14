import { createHash } from 'node:crypto';
import * as fscb from 'node:fs';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';

import { BrowserWindow, ipcMain, shell } from 'electron';
import { Resource } from 'electron/preload/apis/resource';

import { TaggingService } from '../ai/tagging-service';
import { FoldersRepo, ResourcesRepo, TagsRepo, WorkspacesRepo } from '../db/repositories';
import { detectBasicType, generateThumbnailForResource } from '../utils/thumbnail';

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
  ipcMain.handle('resource:add', async (_event, payload: { resource: Resource }) => {
    const res = payload.resource || {};
    // Attach workspace: copy local file into default workspace if available
    let workspaceId = res.workspaceId;
    let filePath = res.filePath as string | undefined;
    try {
      const ws = await WorkspacesRepo.getDefault();
      if (ws && ws.id) {
        workspaceId = workspaceId || ws.id;
        if (filePath && ws.rootPath) {
          try {
            const base = path.basename(filePath);
            const targetDir = path.join(ws.rootPath, 'resources');
            await fs.mkdir(targetDir, { recursive: true });
            const target = path.join(targetDir, base);
            if (filePath !== target) {
              await fs.copyFile(filePath, target);
              filePath = target;
            }
          } catch (e) {
            console.warn('[workspace] copy file into workspace failed', e);
          }
        }
      }
    } catch {
      /* noop */
    }

    // Basic file type detection (if not provided)
    const detected = detectBasicType(filePath, res.type);
    if (!res.type && detected.type) res.type = detected.type as any;
    if (!res.mimeType && detected.mimeType) res.mimeType = detected.mimeType;

    const row = await ResourcesRepo.upsert({ ...res, workspaceId, filePath } as any);

    // Fire-and-forget: auto-tag text resources via AI TaggingService (no renderer involvement)
    try {
      const text = (res as any).contentText || (res as any).description || (res as any).title || '';
      const textStr = (typeof text === 'string' ? text : '').trim();
      if (row && textStr) {
        setTimeout(async () => {
          try {
            const tags = await TaggingService.autoTagText(textStr, { maxLabels: 8 });
            if (Array.isArray(tags) && tags.length) {
              try {
                await ResourcesRepo.update((row as any).id, { tags: JSON.stringify(tags) } as any);
              } catch {
                /* ignore update errors */
              }
            }
          } catch (e) {
            console.warn('[auto-tag] failed', e);
          }
        }, 0);
      }
    } catch {
      /* ignore auto-tag failures */
    }

    // Conditionally enqueue embedding only for text-like resources
    // const isText = isTextLikeResource({ type: res.type, mimeType: res.mimeType, filePath });
    // if (isText) {
    //   const text = res.contentText || res.description || res.title;
    //   if (typeof text === 'string' && text.trim().length > 0 && row) {
    //     try {
    //       const chunks = chunkText(text);
    //       const items = chunks.map((c) => ({
    //         id: `${row.id}#${c.index}`,
    //         content: c.content,
    //         metadata: { parentId: row.id, chunkIndex: c.index, chunkCount: c.count, source: 'resource' }
    //       }));
    //       embeddingQueue.enqueue({ items, dim: 384, batchSize: 16 });
    //     } catch (e) {
    //       console.warn('[embedding] enqueue failed', e);
    //     }
    //   }
    // }

    // Generate thumbnail file (new strategy) if no path present
    if (row && !(row as any).thumbnailPath) {
      try {
        const ws = await WorkspacesRepo.getDefault();
        const baseDir = ws?.rootPath ? path.join(ws.rootPath, 'resources', '.thumbs') : path.join(process.cwd(), 'uploads', '.thumbs');
        await fs.mkdir(baseDir, { recursive: true });
        const thumb = await generateThumbnailForResource({ filePath, type: res.type, title: res.title });
        if (thumb) {
          const thumbPath = path.join(baseDir, `${row.id}.png`);
          try {
            await fs.writeFile(thumbPath, thumb);
          } catch (e) {
            console.warn('[thumbnail] write file failed', e);
          }
          await ResourcesRepo.update(row.id, { thumbnailPath: thumbPath } as any);
          const updated = await ResourcesRepo.getById(row.id);
          // Broadcast insert event to all renderer windows
          try {
            const resData: any = updated || row;
            const payload = { action: 'inserted', id: resData?.id, resource: resData };
            BrowserWindow.getAllWindows().forEach((w) => {
              try {
                w.webContents.send('resource:inserted', payload);
                w.webContents.send('resource:changed', payload);
              } catch {
                /* ignore */
              }
            });
          } catch {
            /* ignore */
          }
          return { success: true, data: updated || row };
        }
      } catch (e) {
        console.warn('[thumbnail] generation failed', e);
      }
    }
    // Broadcast insert event to all renderer windows
    try {
      if (row) {
        const payload2 = { action: 'inserted', id: (row as any).id, resource: row };
        BrowserWindow.getAllWindows().forEach((w) => {
          try {
            w.webContents.send('resource:inserted', payload2);
            w.webContents.send('resource:changed', payload2);
          } catch {
            /* ignore */
          }
        });
      }
    } catch {
      /* ignore */
    }
    return { success: true, data: row };
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
    return { success: true, data: row };
  });

  ipcMain.handle('deleteResources', async (_event, payload: { ids: string[] }) => {
    const now = Date.now();
    const rows = await Promise.all((payload.ids || []).map((id) => ResourcesRepo.update(id, { deletedAt: now } as any)));
    return { success: true, deleted: rows.filter(Boolean).length, data: rows.filter(Boolean) };
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
    return { moved, data: updated };
  });

  ipcMain.handle('openResource', async (_event, payload: { id: string }) => {
    const res = await ResourcesRepo.getById(payload.id);
    if (!res) return { success: false };
    if (res.filePath) {
      await shell.openPath(res.filePath);
      return { success: true };
    }
    if (res.url) {
      await shell.openExternal(res.url);
      return { success: true };
    }
    return { success: false };
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

  ipcMain.handle('updateResource', async (_event, payload: { id: string; patch: any }) => {
    const { id, patch } = payload;
    const updated = await ResourcesRepo.update(id, patch);
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
          if (updated) moved += 1;
        } catch {
          // 单条失败，继续下一条
        }
      }
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
  ipcMain.handle('uploadResourceFile', async (_event, payload: { fileName: string; data: ArrayBuffer }) => {
    try {
      const { fileName, data } = payload || { fileName: '', data: new ArrayBuffer(0) };
      if (!fileName || !data) return { success: false, error: 'invalid-params' };
      const ws = await WorkspacesRepo.getDefault();
      const baseDir = ws?.rootPath ? path.join(ws.rootPath, 'resources') : path.join(process.cwd(), 'uploads');
      await fs.mkdir(baseDir, { recursive: true });

      const incomingBuffer = Buffer.from(data as any);
      const incomingHash = createHash('sha256').update(incomingBuffer).digest('hex');

      let target = path.join(baseDir, fileName);
      const ext = path.extname(fileName);
      const nameNoExt = path.basename(fileName, ext);

      // 若存在同名文件，检查 hash；相同则视为重复直接返回
      if (fscb.existsSync(target)) {
        try {
          const existHash = await new Promise<string>((resolve, reject) => {
            const h = createHash('sha256');
            const rs = fscb.createReadStream(target);
            rs.on('error', reject);
            rs.on('data', (chunk) => h.update(chunk));
            rs.on('end', () => resolve(h.digest('hex')));
          });
          if (existHash === incomingHash) {
            return { success: false, duplicate: true, filePath: target, hash: incomingHash, error: 'duplicate' };
          }
        } catch {
          /* ignore hash errors and proceed to rename */
        }
      }

      // 仅当同名但不同 hash，执行重命名逻辑避免覆盖
      let counter = 1;
      while (fscb.existsSync(target)) {
        target = path.join(baseDir, `${nameNoExt}(${counter})${ext}`);
        counter++;
      }

      await fs.writeFile(target, incomingBuffer);
      return { success: true, filePath: target, hash: incomingHash };
    } catch (e: any) {
      console.warn('uploadResourceFile failed', e);
      return { success: false, error: e?.message || 'unknown-error' };
    }
  });

  // 流式上传：开始上传
  ipcMain.handle('uploadResourceFileStreamStart', async (_event, payload: { fileName: string; totalSize: number }) => {
    try {
      const { fileName, totalSize } = payload || { fileName: '', totalSize: 0 };
      if (!fileName || totalSize <= 0) return { success: false, error: 'invalid-params' };

      const ws = await WorkspacesRepo.getDefault();
      const baseDir = ws?.rootPath ? path.join(ws.rootPath, 'resources') : path.join(process.cwd(), 'uploads');
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

      return { success: true, uploadId };
    } catch (e: any) {
      console.warn('uploadResourceFileStreamStart failed', e);
      return { success: false, error: e?.message || 'unknown-error' };
    }
  });

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

      return new Promise((resolve, reject) => {
        stream.writeStream.write(buffer, (err) => {
          if (err) {
            console.warn('uploadResourceFileStreamChunk write failed', err);
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
        stream.writeStream.end((err) => {
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
        return { success: false, error: 'size-mismatch' };
      }

      // 检查是否与已存在文件重复（同名文件）
      const baseDir = path.dirname(target);
      const originalFileName = stream.fileName;
      const originalTarget = path.join(baseDir, originalFileName);

      if (fscb.existsSync(originalTarget) && originalTarget !== target) {
        try {
          const existHash = await new Promise<string>((resolve, reject) => {
            const h = createHash('sha256');
            const rs = fscb.createReadStream(originalTarget);
            rs.on('error', reject);
            rs.on('data', (chunk) => h.update(chunk));
            rs.on('end', () => resolve(h.digest('hex')));
          });
          if (existHash === incomingHash) {
            // 删除新上传的文件，返回已存在的文件
            try {
              await fs.unlink(target);
            } catch {
              /* ignore */
            }
            uploadStreams.delete(uploadId);
            return { success: false, duplicate: true, filePath: originalTarget, hash: incomingHash, error: 'duplicate' };
          }
        } catch {
          /* ignore hash errors and proceed */
        }
      }

      uploadStreams.delete(uploadId);
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
      return { success: false, error: e?.message || 'unknown-error' };
    }
  });
}

// keep file local helpers minimal; tagging moved to TaggingService
