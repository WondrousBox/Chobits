import { ipcMain, shell } from 'electron';
import { ResourcesRepo, WorkspacesRepo, TagsRepo } from '../db/repositories';
import { generateThumbnailForResource, detectBasicType } from '../utils/thumbnail';
import { createHash } from 'node:crypto';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as fscb from 'node:fs';
import { Resource } from 'electron/preload/apis/resource';
import { TaggingService } from '../ai/tagging-service';

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
          return { success: true, data: updated || row };
        }
      } catch (e) {
        console.warn('[thumbnail] generation failed', e);
      }
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
}

// keep file local helpers minimal; tagging moved to TaggingService
