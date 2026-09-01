import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import dayjs from 'dayjs';

import type {
  WorkflowIntegrationDataRecord,
  WorkflowIntegrationResourceDownloadRequest,
  WorkflowIntegrationResourceDownloadResult,
  WorkflowIntegrationResourceWriteCapability
} from '../capabilities/resources';

type WorkspaceRecord = { id: string; rootPath?: string | null };
type FolderRecord = { id: string; name?: string | null };

interface WorkflowIntegrationResourceWriteFileSystem {
  copyFile(source: string, target: string): Promise<void>;
  exists(filePath: string): boolean;
  mkdir(directory: string): void;
  writeFile(filePath: string, data: Uint8Array): Promise<void>;
}

export interface WorkflowIntegrationResourceWritePorts {
  addResource(payload: { resource: WorkflowIntegrationDataRecord }): Promise<{ data?: WorkflowIntegrationDataRecord | null } | undefined>;
  createId?: () => string;
  currentDate?: () => string;
  fetchFn?: typeof fetch;
  fileSystem?: Partial<WorkflowIntegrationResourceWriteFileSystem>;
  folders: {
    create(folder: WorkflowIntegrationDataRecord): Promise<FolderRecord | undefined>;
    list(query: WorkflowIntegrationDataRecord, limit: number, offset: number): Promise<FolderRecord[]>;
  };
  resources: {
    getById(id: string): Promise<WorkflowIntegrationDataRecord | undefined>;
    update(id: string, patch: WorkflowIntegrationDataRecord): Promise<WorkflowIntegrationDataRecord | undefined>;
  };
  updateRunContext?: (runId: string, context: { folderId?: string; workspaceId?: string }) => void;
  workspaces: {
    getById(id: string): Promise<WorkspaceRecord | undefined>;
    getDefault(): Promise<WorkspaceRecord | undefined>;
  };
  onResourceUpdated(resource: WorkflowIntegrationDataRecord): void;
}

const defaultFileSystem: WorkflowIntegrationResourceWriteFileSystem = {
  copyFile: (source, target) => fs.promises.copyFile(source, target),
  exists: (filePath) => fs.existsSync(filePath),
  mkdir: (directory) => fs.mkdirSync(directory, { recursive: true }),
  writeFile: (filePath, data) => fs.promises.writeFile(filePath, data)
};

function abortError(): Error {
  const error = new Error('Resource operation canceled');
  error.name = 'AbortError';
  return error;
}

export function createWorkflowIntegrationResourceWriteCapability(ports: WorkflowIntegrationResourceWritePorts): WorkflowIntegrationResourceWriteCapability {
  const fetchFn = ports.fetchFn || fetch;
  const createId = ports.createId || randomUUID;
  const currentDate = ports.currentDate || (() => dayjs().format('YYYY-MM-DD'));
  const fileSystem: WorkflowIntegrationResourceWriteFileSystem = { ...defaultFileSystem, ...ports.fileSystem };

  const updateContext = (runId: string, context: { folderId?: string; workspaceId?: string }): void => {
    ports.updateRunContext?.(runId, context);
  };

  return {
    async create(resource) {
      if ((!resource.filePath && !resource.contentText) || !resource.workspaceId || !resource.folderId) return undefined;
      const result = await ports.addResource({
        resource: {
          title: resource.title,
          filePath: resource.filePath,
          sizeBytes: resource.sizeBytes,
          description: resource.description,
          contentText: resource.contentText,
          workspaceId: resource.workspaceId,
          folderId: resource.folderId,
          parentResourceId: resource.parentResourceId,
          url: resource.url,
          tags: resource.tags
        }
      });
      return result?.data || undefined;
    },

    async update(resourceId, patch) {
      if (!resourceId || !(await ports.resources.getById(resourceId))) return undefined;
      const updated = await ports.resources.update(resourceId, patch);
      if (updated) ports.onResourceUpdated(updated);
      return updated;
    },

    async download(request: WorkflowIntegrationResourceDownloadRequest): Promise<WorkflowIntegrationResourceDownloadResult> {
      const url = request.url.trim();
      if (!url.startsWith('http://') && !url.startsWith('https://')) throw new Error('无效的URL');
      if (request.signal?.aborted) throw abortError();

      const workspace = request.workspaceId ? await ports.workspaces.getById(request.workspaceId) : await ports.workspaces.getDefault();
      if (!workspace?.rootPath) throw new Error('无法获取工作空间路径');

      let folderId = request.folderId;
      if (!folderId) {
        const today = currentDate();
        const siblings = await ports.folders.list({ workspaceId: workspace.id, parentId: null, deletedAt: 0 }, 2000, 0);
        const existing = siblings.find((folder) => folder.name === today);
        if (existing) {
          folderId = existing.id;
        } else {
          const folder = { id: createId(), name: today, parentId: null, workspaceId: workspace.id };
          const created = await ports.folders.create(folder);
          folderId = created?.id || folder.id;
          fileSystem.mkdir(path.join(workspace.rootPath, 'resources', 'folders', folderId));
        }
      }
      if (request.runId) updateContext(request.runId, { workspaceId: workspace.id, folderId });

      const targetDir = folderId ? path.join(workspace.rootPath, 'resources', 'folders', folderId) : path.join(workspace.rootPath, 'resources');
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
        counter += 1;
      }

      const timeoutController = new AbortController();
      const timeout = setTimeout(() => timeoutController.abort(), 300000);
      const abort = (): void => timeoutController.abort();
      request.signal?.addEventListener('abort', abort, { once: true });
      try {
        const response = await fetchFn(url, {
          signal: timeoutController.signal,
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
        if (!response.ok) throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        const buffer = Buffer.from(await response.arrayBuffer());
        await fileSystem.writeFile(targetPath, buffer);
      } catch (error) {
        if (request.signal?.aborted) throw abortError();
        throw error;
      } finally {
        clearTimeout(timeout);
        request.signal?.removeEventListener('abort', abort);
      }
      return { filePath: targetPath, workspaceId: workspace.id, folderId };
    },

    async copyFileToFolder(sourcePath, workspaceId, folderId) {
      if (!fileSystem.exists(sourcePath)) throw new Error(`文件不存在: ${sourcePath}`);
      const workspace = await ports.workspaces.getById(workspaceId);
      if (!workspace?.rootPath) throw new Error('无法获取工作空间路径');
      const targetDir = path.join(workspace.rootPath, 'resources', 'folders', folderId);
      fileSystem.mkdir(targetDir);
      const initialTarget = path.join(targetDir, path.basename(sourcePath));
      if (path.resolve(sourcePath) === path.resolve(initialTarget)) return sourcePath;

      const extension = path.extname(sourcePath);
      const name = path.basename(sourcePath, extension);
      let targetPath = initialTarget;
      let counter = 1;
      while (fileSystem.exists(targetPath)) {
        targetPath = path.join(targetDir, `${name}(${counter})${extension}`);
        counter += 1;
      }
      await fileSystem.copyFile(sourcePath, targetPath);

      if (['.srt', '.vtt', '.ass', '.ssa'].includes(extension.toLowerCase())) {
        const sidecar = path.join(path.dirname(sourcePath), `${name}.segments.json`);
        if (fileSystem.exists(sidecar)) {
          await fileSystem.copyFile(sidecar, path.join(targetDir, `${path.basename(targetPath, path.extname(targetPath))}.segments.json`));
        }
      }
      return targetPath;
    },

    updateContext
  };
}
