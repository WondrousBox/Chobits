import { app, ipcMain, shell } from 'electron';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { Workspace } from 'electron/preload/apis/workspace';
import { PartialByKey } from 'electron/preload/type';
import { WorkspacesRepo } from '../db/repositories';
import { addAllowedResourceRoot, addWorkspaceResourceRoot } from '../resource-protocol';
import { DefaultWorkspaceName } from '../config';

function ensureDirSync(p: string): void {
  if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
}

function safeFolderName(name?: string): string {
  const n = (name ?? 'Workspace')
    .replace(/[\\/:*?"<>|]/g, ' ') // remove invalid path chars
    .replace(/\s+/g, ' ') // collapse whitespace
    .trim();
  return n.length ? n : 'Workspace';
}

async function createWorkspace(workspace: PartialByKey<Workspace, 'id'>): Promise<{ success: boolean; data?: any }> {
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

  ipcMain.handle('workspace:add', async (_e, payload: { workspace: PartialByKey<Workspace, 'id'> }) => {
    // 需要添加一个逻辑，就是检查用户选择的工作空间文件夹是不是空的，如果是就保持现在的创建逻辑，如果不是空的，就用用户设置的工作空间名称作为文件夹进行创建，然后将rootPath指向新创建的文件夹
    const ws = payload?.workspace ?? {};
    const originalRoot = ws.rootPath;
    if (!originalRoot) return createWorkspace(ws);

    try {
      const exists = fs.existsSync(originalRoot);
      let usePath = originalRoot;

      if (exists) {
        const stat = fs.statSync(originalRoot);
        if (!stat.isDirectory()) {
          // Not a directory; fall back to default behavior
          return createWorkspace(ws);
        }
        // Determine if directory is effectively empty (ignore dotfiles like .DS_Store)
        const entries = await fsp.readdir(originalRoot, { withFileTypes: true });
        const meaningful = entries.filter((ent) => !ent.name.startsWith('.'));

        if (meaningful.length > 0) {
          // Not empty: create a subfolder with the workspace name
          const baseName = safeFolderName(ws.name);
          const parent = originalRoot;
          let candidate = path.join(parent, baseName);
          if (fs.existsSync(candidate)) {
            // Find an available suffix "<name> 2..99"
            for (let i = 2; i < 100; i++) {
              const alt = path.join(parent, `${baseName} ${i}`);
              if (!fs.existsSync(alt)) {
                candidate = alt;
                break;
              }
            }
          }
          ensureDirSync(candidate);
          usePath = candidate;
        }
      }

      return createWorkspace({ ...ws, rootPath: usePath });
    } catch {
      // On any error, fall back to original behavior
      return createWorkspace(ws);
    }
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
