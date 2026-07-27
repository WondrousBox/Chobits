import path from 'node:path';

import { randomUUID } from 'crypto';
import dayjs from 'dayjs';
import * as fs from 'fs';

import { onAbort } from './abort';
import type { WorkflowEngine } from './engine';

type WorkspaceRecord = { id: string; rootPath?: string | null };
type FolderRecord = { id: string; name?: string | null };

export interface WorkflowResourceEventAdapterPorts {
  engine: WorkflowEngine;
  addResource(payload: { resource: Record<string, any> }): Promise<{ data?: any } | undefined>;
  resources: {
    getById(id: string): Promise<any>;
    update(id: string, patch: Record<string, any>): Promise<any>;
  };
  folders: {
    list(query: Record<string, any>, limit: number, offset: number): Promise<FolderRecord[]>;
    create(folder: Record<string, any>): Promise<any>;
  };
  workspaces: {
    getById(id: string): Promise<WorkspaceRecord | undefined>;
    getDefault(): Promise<WorkspaceRecord | undefined>;
  };
  onResourceUpdated(resource: any): void;
  fetchFn?: typeof fetch;
  createId?: () => string;
  currentDate?: () => string;
  fileSystem?: {
    mkdir(path: string): void;
    exists(path: string): boolean;
    writeFile(path: string, data: Uint8Array): Promise<void>;
  };
}

const defaultFileSystem: NonNullable<WorkflowResourceEventAdapterPorts['fileSystem']> = {
  mkdir: (directory) => fs.mkdirSync(directory, { recursive: true }),
  exists: (filePath) => fs.existsSync(filePath),
  writeFile: (filePath, data) => fs.promises.writeFile(filePath, data)
};

export function attachWorkflowResourceEventAdapter(ports: WorkflowResourceEventAdapterPorts): () => void {
  const { engine } = ports;
  const fetchFn = ports.fetchFn || fetch;
  const createId = ports.createId || randomUUID;
  const currentDate = ports.currentDate || (() => dayjs().format('YYYY-MM-DD'));
  const fileSystem = ports.fileSystem || defaultFileSystem;

  const handleContextUpdate = (payload: any): void => {
    const runId: string | undefined = payload?.__runId;
    const workspaceId: string | undefined = payload?.workspaceId;
    const folderId: string | undefined = payload?.folderId;
    if (!runId || !workspaceId || !folderId) return;

    engine.updateRunContext(runId, { workspaceId, folderId });
    console.log('[workflow][wf:update-context] Updated workflow context', { runId, workspaceId, folderId });
  };

  const handleResourceCreate = async (payload: any): Promise<void> => {
    try {
      const resourceData: Record<string, any> = payload?.resourceData || {};
      const callback = payload?.callback;
      if (!resourceData || typeof resourceData !== 'object' || (!resourceData.filePath && !resourceData.contentText)) {
        callback?.(null);
        return;
      }
      if (!resourceData.workspaceId || !resourceData.folderId) {
        const missing = !resourceData.workspaceId ? 'workspaceId' : 'folderId';
        console.warn(`[workflow][resource:create-request] 资源创建失败：缺少 ${missing}`);
        callback?.(null);
        return;
      }

      const result = await ports.addResource({
        resource: {
          title: resourceData.title,
          filePath: resourceData.filePath,
          sizeBytes: resourceData.sizeBytes,
          description: resourceData.description,
          contentText: resourceData.contentText,
          workspaceId: resourceData.workspaceId,
          folderId: resourceData.folderId,
          parentResourceId: resourceData.parentResourceId
        }
      });
      callback?.(result?.data || null);
    } catch (error) {
      console.warn('[workflow][resource:create-request] failed:', error);
      payload?.callback?.(null);
    }
  };

  const handleResourceUpdate = async (payload: any): Promise<void> => {
    try {
      const resourceId = String(payload?.resourceId || '').trim();
      const patch: Record<string, any> = { ...(payload?.patch || {}) };
      const callback = payload?.callback;
      if (!resourceId || !patch || typeof patch !== 'object') {
        callback?.(null);
        return;
      }

      if (!(await ports.resources.getById(resourceId))) {
        callback?.(null);
        return;
      }

      const updated = await ports.resources.update(resourceId, patch);
      if (updated) ports.onResourceUpdated(updated);
      callback?.(updated || null);
    } catch (error) {
      console.warn('[workflow][resource:update-request] failed:', error);
      payload?.callback?.(null);
    }
  };

  const handleResourceDownload = async (payload: any): Promise<void> => {
    try {
      const url = String(payload?.url || '').trim();
      const workspaceId = payload?.workspaceId ? String(payload.workspaceId) : undefined;
      const folderId = payload?.folderId ? String(payload.folderId) : undefined;
      const callback = payload?.callback;
      const runId: string | undefined = payload?.__runId;

      if (!url || (!url.startsWith('http://') && !url.startsWith('https://'))) {
        callback?.(null, '无效的URL');
        return;
      }

      const workspace = workspaceId ? await ports.workspaces.getById(workspaceId) : await ports.workspaces.getDefault();
      if (!workspace?.rootPath) {
        callback?.(null, '无法获取工作空间路径');
        return;
      }

      let targetFolderId = folderId;
      if (!targetFolderId) {
        try {
          const today = currentDate();
          const siblings = await ports.folders.list({ workspaceId: workspace.id, parentId: null, deletedAt: 0 }, 2000, 0);
          const existing = siblings.find((folder) => folder.name === today);
          if (existing) {
            targetFolderId = existing.id;
          } else {
            const folder = { id: createId(), name: today, parentId: null, workspaceId: workspace.id };
            await ports.folders.create(folder);
            fileSystem.mkdir(path.join(workspace.rootPath, 'resources', 'folders', folder.id));
            targetFolderId = folder.id;
          }
          if (runId && targetFolderId) engine.updateRunContext(runId, { workspaceId: workspace.id, folderId: targetFolderId });
        } catch (error) {
          console.warn('[workflow][resource:download-request] Failed to ensure daily folder', error);
        }
      } else if (runId && workspaceId) {
        engine.updateRunContext(runId, { workspaceId, folderId });
      }

      const targetDir = targetFolderId ? path.join(workspace.rootPath, 'resources', 'folders', targetFolderId) : path.join(workspace.rootPath, 'resources');
      fileSystem.mkdir(targetDir);

      let filename: string;
      try {
        filename = path.basename(new URL(url).pathname) || 'download';
        if (!path.extname(filename)) filename += '.tmp';
      } catch {
        filename = 'download.tmp';
      }
      filename = filename.replace(/[<>:"/\\|?*]/g, '_');

      let targetPath = path.join(targetDir, filename);
      const extension = path.extname(filename);
      const name = path.basename(filename, extension);
      let counter = 1;
      while (fileSystem.exists(targetPath)) {
        targetPath = path.join(targetDir, `${name}(${counter})${extension}`);
        counter++;
      }

      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 300000);
        const removeAbortListener = onAbort(runId ? engine.getRunContext(runId)?.signal : undefined, () => controller.abort());
        let response: Response;
        try {
          response = await fetchFn(url, {
            signal: controller.signal,
            headers: {
              'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
              Accept: '*/*',
              'Accept-Language': 'en-US,en;q=0.9',
              'Accept-Encoding': 'gzip, deflate, br',
              Connection: 'keep-alive',
              Referer: new URL(url).origin,
              'Sec-Fetch-Dest': 'empty',
              'Sec-Fetch-Mode': 'cors',
              'Sec-Fetch-Site': 'cross-site'
            }
          });
        } finally {
          clearTimeout(timeout);
          removeAbortListener();
        }

        if (!response.ok) throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        const buffer = Buffer.from(await response.arrayBuffer());
        await fileSystem.writeFile(targetPath, buffer);
        console.log('[workflow][resource:download-request] File downloaded successfully', { url, targetPath, size: buffer.length });
        callback?.(targetPath);
      } catch (error) {
        console.warn('[workflow][resource:download-request] Download failed:', error);
        callback?.(null, error instanceof Error ? error.message : String(error));
      }
    } catch (error) {
      console.warn('[workflow][resource:download-request] failed:', error);
      payload?.callback?.(null, error instanceof Error ? error.message : String(error));
    }
  };

  engine.on('wf:update-context', handleContextUpdate);
  engine.on('resource:create-request', handleResourceCreate);
  engine.on('resource:update-request', handleResourceUpdate);
  engine.on('resource:download-request', handleResourceDownload);

  return () => {
    engine.off('wf:update-context', handleContextUpdate);
    engine.off('resource:create-request', handleResourceCreate);
    engine.off('resource:update-request', handleResourceUpdate);
    engine.off('resource:download-request', handleResourceDownload);
  };
}
