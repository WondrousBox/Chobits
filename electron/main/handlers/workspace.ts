import { app, ipcMain, shell } from 'electron';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { WorkspacesRepo } from '../db/repositories';
import { addAllowedResourceRoot, addWorkspaceResourceRoot } from '../resource-protocol';
import { DefaultWorkspaceName } from '../config';

function ensureDirSync(p: string): void {
  if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
}

async function createWorkspace(workspace: any): Promise<{ success: boolean; data?: any }> {
  const ws = workspace || {};
  const data = await WorkspacesRepo.upsert({ ...ws });

  if (!ws || !ws.rootPath) return { success: false };
  const p = ws.rootPath;
  const existed = fs.existsSync(p);
  if (!existed) ensureDirSync(p);
  try {
    const resDir = path.join(p, 'resources');
    ensureDirSync(resDir);
    addAllowedResourceRoot(resDir);
    if (data?.id) addWorkspaceResourceRoot(data.id, resDir);
  } catch {
    //
  }
  return { success: true, data };
}

export function initWorkspaceHandlers(): void {
  ipcMain.handle('workspace:quickStart', async () => {
    // Suggest a default workspace path: ~/Documents/ChobitsWorkspace, fallback to incremented suffix
    let dest = '';
    const docs = app.getPath('documents');
    const base = path.join(docs, DefaultWorkspaceName);
    if (!fs.existsSync(base)) {
      dest = base;
    } else {
      for (let i = 2; i < 50; i++) {
        dest = `${base} ${i}`;
        if (!fs.existsSync(dest)) {
          break;
        }
      }
    }
    if (!dest) {
      dest = base + ' ' + Date.now();
    }

    return createWorkspace({
      name: DefaultWorkspaceName,
      rootPath: dest,
      isDefault: 1,
      status: 'active'
    });
  });

  ipcMain.handle('workspace:add', async (_e, payload: { workspace: any }) => {
    return createWorkspace(payload.workspace);
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
    const data = await WorkspacesRepo.setDefault(payload.id);
    try {
      if (data?.rootPath) {
        const resDir = path.join(data.rootPath, 'resources');
        ensureDirSync(resDir);
        addAllowedResourceRoot(resDir);
        if (data.id) addWorkspaceResourceRoot(data.id, resDir);
      }
    } catch {
      //
    }
    return { success: true, data };
  });

  ipcMain.handle('workspace:update', async (_e, payload: { id: string; patch: any }) => {
    const data = await WorkspacesRepo.update(payload.id, payload.patch);
    return { data };
  });

  ipcMain.handle('workspace:delete', async (_e, payload: { id: string; hard?: boolean }) => {
    if (payload.hard) {
      const deleted = await WorkspacesRepo.deleteByIds([payload.id]);
      return { deleted };
    } else {
      const rows = await WorkspacesRepo.softDelete([payload.id]);
      return { deleted: rows.length, data: rows[0] };
    }
  });

  ipcMain.handle('workspace:open', async (_e, payload: { id: string }) => {
    const ws = await WorkspacesRepo.getById(payload.id);
    if (!ws || !ws.rootPath) return { ok: false };
    await shell.openPath(ws.rootPath);
    return { ok: true };
  });

  ipcMain.handle('workspace:scanStats', async (_e, payload: { id: string }) => {
    const ws = await WorkspacesRepo.getById(payload.id);
    if (!ws || !ws.rootPath) return { ok: false };
    const root = ws.rootPath;
    let size = 0;
    let files = 0;
    async function walk(p: string): Promise<void> {
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
        } catch {
          //
        }
      }
    }
    try {
      await walk(root);
    } catch {
      //
    }
    await WorkspacesRepo.update(ws.id, { sizeBytes: size as any, fileCount: files as any, lastScanAt: Date.now() as any });
    return { ok: true, sizeBytes: size, fileCount: files };
  });
}
