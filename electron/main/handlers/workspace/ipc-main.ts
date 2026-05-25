import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';

import { app, ipcMain, shell } from 'electron';

import { eventManager } from '../../../../packages/event';
import { AppEvent } from '../../../../packages/event/events';
import { DefaultWorkspaceName } from '../../config';
import { WorkspacesRepo } from '../../db/repositories';
import { addAllowedResourceRoot, addWorkspaceResourceRoot } from '../../resource-protocol';
import type { PartialByKey } from '../types';
import { deleteWorkspaceCompletely, exportWorkspace, importWorkspace } from './export';
import type { Workspace } from './ipc-renderer';

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

async function hasWorkspace(): Promise<boolean> {
  const rows = await WorkspacesRepo.list({ deletedAt: 0 } as any, 1, 0);
  return Array.isArray(rows) && rows.length > 0;
}

let lastWorkspaceWizardClosedEventAt = 0;

export async function emitWorkspaceWizardClosedIfStillEmpty(reason: string, sourceWindowId?: number): Promise<{ success: boolean; emitted: boolean }> {
  try {
    const now = Date.now();
    if (now - lastWorkspaceWizardClosedEventAt < 500) {
      return { success: true, emitted: false };
    }
    if (await hasWorkspace()) {
      return { success: true, emitted: false };
    }
    lastWorkspaceWizardClosedEventAt = now;
    eventManager.emit(AppEvent.WORKSPACE_WIZARD_CLOSED, { reason }, sourceWindowId);
    return { success: true, emitted: true };
  } catch (error) {
    console.warn('[workspace] failed to handle workspace wizard close', error);
    return { success: false, emitted: false };
  }
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
  if (data) {
    eventManager.emit(AppEvent.WORKSPACE_CREATED, data);
  }
  return { success: true, data };
}

export function initWorkspaceHandlers(): void {
  ipcMain.handle('workspace:quickStart', async () => {
    // Suggest a default workspace path: ~/Documents/<DefaultWorkspace>, fallback to incremented suffix
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

    const result = await createWorkspace({
      name: DefaultWorkspaceName,
      rootPath: dest,
      isDefault: 1,
      status: 'active'
    });

    if (result.success && result.data) {
      eventManager.emit(AppEvent.WORKSPACE_CREATED, result.data);
    }

    return result;
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
    if (data) {
      eventManager.emit(AppEvent.WORKSPACE_UPDATED, data);
    }
    return { success: true, data };
  });

  ipcMain.handle('workspace:update', async (_e, payload: { id: string; patch: any }) => {
    const data = await WorkspacesRepo.update(payload.id, payload.patch);
    if (data) {
      eventManager.emit(AppEvent.WORKSPACE_UPDATED, data);
    }
    return { data };
  });

  ipcMain.handle('workspace:delete', async (_e, payload: { id: string; keepFolder?: boolean }) => {
    const result = await deleteWorkspaceCompletely(payload.id, { keepFolder: payload.keepFolder });

    if (result.success) {
      eventManager.emit(AppEvent.WORKSPACE_DELETED, { id: payload.id });
      return { success: true, deleted: 1 };
    }

    return { success: false, deleted: 0, error: result.error };
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

  ipcMain.handle('workspace:export', async (_e, payload: { id: string; destPath: string }) => {
    return await exportWorkspace(payload.id, payload.destPath);
  });

  ipcMain.handle('workspace:import', async (_e, payload: { sourcePath: string }) => {
    const result = await importWorkspace(payload.sourcePath);

    // 如果导入成功，触发事件并配置资源根目录
    if (result.success && result.workspaceId) {
      const ws = await WorkspacesRepo.getById(result.workspaceId);
      if (ws) {
        eventManager.emit(AppEvent.WORKSPACE_CREATED, ws);

        // 配置资源根目录
        const resDir = path.join(ws.rootPath, 'resources');
        try {
          if (!fs.existsSync(resDir)) {
            fs.mkdirSync(resDir, { recursive: true });
          }
          addAllowedResourceRoot(resDir);
          addWorkspaceResourceRoot(ws.id, resDir);
        } catch {
          //
        }
      }
    }

    return result;
  });
}
