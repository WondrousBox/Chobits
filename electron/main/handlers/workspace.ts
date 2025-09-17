import { BrowserWindow, dialog, ipcMain, shell } from 'electron';
import { WorkspacesRepo } from '../db/repositories';
import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';

function ensureDirSync(p: string) {
  if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
}

export function initWorkspaceHandlers(_win: BrowserWindow) {
  ipcMain.handle('workspace:add', async (_e, payload: { workspace: any }) => {
    const ws = payload.workspace || {};
    const id = ws.id || randomUUID();
    await WorkspacesRepo.upsert({ ...ws, id });
    return { success: true };
  });

  ipcMain.handle('workspace:list', async (_e, payload: { filter?: any; limit?: number; offset?: number }) => {
    return await WorkspacesRepo.list(payload?.filter ?? {}, payload?.limit ?? 100, payload?.offset ?? 0);
  });

  ipcMain.handle('workspace:get', async (_e, payload: { id: string }) => {
    return await WorkspacesRepo.getById(payload.id);
  });

  ipcMain.handle('workspace:getDefault', async () => {
    return await WorkspacesRepo.getDefault();
  });

  ipcMain.handle('workspace:setDefault', async (_e, payload: { id: string }) => {
    await WorkspacesRepo.setDefault(payload.id);
    return { success: true };
  });

  ipcMain.handle('workspace:update', async (_e, payload: { id: string; patch: any }) => {
    const updated = await WorkspacesRepo.update(payload.id, payload.patch);
    return { updated };
  });

  ipcMain.handle('workspace:delete', async (_e, payload: { id: string; hard?: boolean }) => {
    if (payload.hard) {
      const deleted = await WorkspacesRepo.deleteByIds([payload.id]);
      return { deleted };
    } else {
      const deleted = await WorkspacesRepo.softDelete([payload.id]);
      return { deleted };
    }
  });

  ipcMain.handle('workspace:ensureDir', async (_e, payload: { id: string }) => {
    const ws = await WorkspacesRepo.getById(payload.id);
    if (!ws || !ws.rootPath) return { ok: false };
    const p = ws.rootPath;
    const existed = fs.existsSync(p);
    if (!existed) ensureDirSync(p);
    return { ok: true, path: p, created: !existed };
  });

  ipcMain.handle('workspace:pickDir', async () => {
    const res = await dialog.showOpenDialog({ properties: ['openDirectory', 'createDirectory'] });
    if (res.canceled || res.filePaths.length === 0) return { canceled: true };
    return { canceled: false, path: res.filePaths[0] };
  });

  ipcMain.handle('workspace:open', async (_e, payload: { id: string }) => {
    const ws = await WorkspacesRepo.getById(payload.id);
    if (!ws || !ws.rootPath) return { ok: false };
    await shell.openPath(ws.rootPath);
    return { ok: true };
  });

  ipcMain.handle('workspace:reveal', async (_e, payload: { id: string }) => {
    const ws = await WorkspacesRepo.getById(payload.id);
    if (!ws || !ws.rootPath) return { ok: false };
    shell.showItemInFolder(path.join(ws.rootPath));
    return { ok: true };
  });

  ipcMain.handle('workspace:scanStats', async (_e, payload: { id: string }) => {
    const ws = await WorkspacesRepo.getById(payload.id);
    if (!ws || !ws.rootPath) return { ok: false };
    const root = ws.rootPath;
    let size = 0;
    let files = 0;
    async function walk(p: string) {
      const entries = await fsp.readdir(p, { withFileTypes: true });
      for (const ent of entries) {
        const full = path.join(p, ent.name);
        try {
          if (ent.isDirectory()) await walk(full);
          else if (ent.isFile()) {
            const st = await fsp.stat(full);
            size += st.size;
            files += 1;
          }
        } catch {}
      }
    }
    try { await walk(root); } catch {}
    await WorkspacesRepo.update(ws.id, { sizeBytes: size as any, fileCount: files as any, lastScanAt: Date.now() as any });
    return { ok: true, sizeBytes: size, fileCount: files };
  });
}
