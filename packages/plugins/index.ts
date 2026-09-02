import { EventEmitter } from 'node:events';
import fs from 'node:fs';
import path from 'node:path';

import type { Downloader, DownloadOptions, ProxyAgent } from '@aim-packages/downloader';
import { AppEvent, eventManager } from '@packages/event';
import { app } from 'electron';

import { DOWNLOAD_FOLDER_NAME } from '../common/config';
import { calculateFileHash, unzipFileWith7Z } from '../common/utils';
import { PluginConfigStore } from './plugin-config-store';
import { PluginResourceStore } from './plugin-resource-store';

export type ResourceType = 'engine' | 'model';

export type DownloadStatus = 'queued' | 'downloading' | 'extracting' | 'verifying' | 'installed' | 'failed' | 'cancelled';

export interface PluginResource {
  id: string; // 唯一标识, 如 'plugin:whisper_engine_whisper-cli_1.0.0_160ed5bc3dd14eea856493d334349b405782ddcaf0028d4b5df4088345fba2efe'
  resourceId: string; // 资源ID
  pluginId: string; // 插件ID，如 'plugin:whisper'
  type: ResourceType; // 资源类型：engine 或 model
  name: string; // 资源名称
  displayName?: string; // 显示名称
  version?: string; // 版本号
  sizeBytes?: number; // 文件大小（字节）
  sha256?: string; // SHA256校验和
  sourceUrl?: string; // 下载URL
  sourceType?: 'http' | 'https'; // 源类型
  archiveType?: 'zip' | 'tar.gz' | 'tar.bz2' | 'tar' | 'none'; // 压缩包类型，none表示不压缩
  installPath?: string; // 安装路径
  status?: DownloadStatus; // 下载状态
  progressBytes?: number; // 已下载字节数
  installedAt?: number; // 安装时间
  updatedAt?: number; // 更新时间
  lastError?: string; // 最后错误
  // Engine特定字段
  binaryName?: string; // 二进制文件名（用于engine）
  extractTo?: string; // 解压到的目录（相对路径）
  // 模型特定字段
  modelFormat?: string; // 模型格式
  files?: PluginResourceFile[]; // 多文件模型资源清单
}

export interface PluginResourceFile {
  path: string; // 相对 installPath 的文件路径
  sourceUrl: string;
  sizeBytes?: number;
  sha256?: string;
}

export interface DownloadProgress {
  id: string;
  status: DownloadStatus;
  doneBytes: number;
  totalBytes?: number;
  speedBps?: number;
  etaMs?: number;
  percentage?: number;
  error?: string;
  // Resource metadata for renderer to construct entries
  pluginId?: string;
  resourceId?: string;
  type?: ResourceType;
  name?: string;
  displayName?: string;
  version?: string;
}

interface InternalTask {
  resource: PluginResource;
  controller?: AbortController;
  startedAt?: number;
  lastTickBytes?: number;
  lastTickAt?: number;
  deleteAfterInstall?: boolean; // 是否在安装完成后删除下载文件
  proxyAgent?: ProxyAgent;
}

const PLUGIN_ARCHIVE_EXCLUDE_ARGS = ['-xr!__MACOSX', '-xr!__MACOSX/*'];

function isAbortLikeError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const maybeError = error as { name?: string; message?: string };
  return maybeError.name === 'AbortError' || maybeError.name === 'DownloadCancelledError' || maybeError.message === 'Download cancelled';
}

/**
 * 插件资源管理器
 * 负责下载和管理插件所需的engine工具和模型文件
 * 目录结构：
 * - resources/plugins/{pluginId}/engine/ - Engine工具
 * - resources/plugins/{pluginId}/models/ - 模型文件
 */
export class PluginResourceManager extends EventEmitter {
  private queue: InternalTask[] = [];
  private running: InternalTask[] = [];
  private concurrency = 2;
  private downloadDir: string;
  private downloader: Downloader | null = null;
  private lastProgressEmit = new Map<string, number>();
  private static PROGRESS_THROTTLE_MS = 200;

  constructor() {
    super();
    // 使用用户的下载目录作为下载存储目录
    this.downloadDir = path.join(app.getPath('downloads'), DOWNLOAD_FOLDER_NAME);
    // 确保下载目录存在
    fs.mkdirSync(this.downloadDir, { recursive: true });
    // 从配置中读取并发数
    const config = PluginConfigStore.getConfig();
    this.concurrency = config.concurrency ?? 2;
  }

  /**
   * 设置下载器实现
   */
  setDownloader(downloader: Downloader): void {
    console.log('[PluginDL] setDownloader', downloader?.constructor?.name);
    this.downloader = downloader;
  }

  /**
   * 获取下载目录
   */
  getDownloadDir(): string {
    return this.downloadDir;
  }

  /**
   * 设置下载目录
   */
  setDownloadDir(dir: string): void {
    this.downloadDir = dir;
    fs.mkdirSync(this.downloadDir, { recursive: true });
    console.log('[PluginDL] setDownloadDir', { dir: this.downloadDir });
  }

  /**
   * 获取插件资源的基础目录
   * 使用用户配置的插件目录
   */
  getPluginResourceDir(pluginId: string, type: ResourceType): string {
    const pluginsDir = PluginConfigStore.getPluginsDir();
    const pluginName = pluginId.replace('plugin:', ''); // 移除 'plugin:' 前缀
    return path.join(pluginsDir, pluginName, type);
  }

  /**
   * 获取插件配置目录
   */
  getPluginsDir(): string {
    return PluginConfigStore.getPluginsDir();
  }

  /**
   * 设置插件配置目录
   */
  setPluginsDir(dir: string): void {
    PluginConfigStore.setConfig({ pluginsDir: dir });
    console.log('[PluginDL] setPluginsDir', { dir });
  }

  /**
   * 移动插件目录（复制旧目录内容到新目录）
   * @param oldDir 旧目录路径
   * @param newDir 新目录路径
   * @param onProgress 进度回调函数
   */
  async movePluginsDir(oldDir: string, newDir: string, onProgress?: (progress: { current: number; total: number; currentFile: string; percentage: number }) => void): Promise<void> {
    // 如果旧目录不存在或与新目录相同，直接返回
    if (!fs.existsSync(oldDir) || path.resolve(oldDir) === path.resolve(newDir)) {
      return;
    }

    // 确保新目录存在
    fs.mkdirSync(newDir, { recursive: true });
    console.log('[PluginDL] movePluginsDir', { oldDir, newDir });

    // 获取所有文件和目录
    const getAllFiles = (dirPath: string): { files: string[]; dirs: string[] } => {
      const files: string[] = [];
      const dirs: string[] = [];

      const entries = fs.readdirSync(dirPath, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(dirPath, entry.name);
        if (entry.isDirectory()) {
          dirs.push(fullPath);
          const sub = getAllFiles(fullPath);
          files.push(...sub.files);
          dirs.push(...sub.dirs);
        } else if (entry.isFile()) {
          files.push(fullPath);
        }
      }

      return { files, dirs };
    };

    const { files, dirs } = getAllFiles(oldDir);
    const total = files.length + dirs.length;
    let current = 0;

    // 先创建所有目录
    for (const dirPath of dirs) {
      const relativePath = path.relative(oldDir, dirPath);
      const newDirPath = path.join(newDir, relativePath);
      fs.mkdirSync(newDirPath, { recursive: true });

      current++;
      if (onProgress) {
        onProgress({
          current,
          total,
          currentFile: relativePath,
          percentage: Math.round((current / total) * 100)
        });
      }
    }

    // 然后复制所有文件
    for (const filePath of files) {
      const relativePath = path.relative(oldDir, filePath);
      const newFilePath = path.join(newDir, relativePath);
      const newFileDir = path.dirname(newFilePath);

      // 确保目标目录存在
      fs.mkdirSync(newFileDir, { recursive: true });

      // 复制文件
      await fs.promises.copyFile(filePath, newFilePath);

      current++;
      if (onProgress) {
        console.log('[PluginDL] movePluginsDir progress', Math.round((current / total) * 100));

        onProgress({
          current,
          total,
          currentFile: relativePath,
          percentage: Math.round((current / total) * 100)
        });
      }
    }
  }

  /**
   * 获取Engine工具的完整路径
   */
  getEnginePath(pluginId: string, binaryName: string): string {
    const engineDir = this.getPluginResourceDir(pluginId, 'engine');
    const platform = process.platform;
    const arch = process.arch;

    // 尝试平台特定路径
    const candidates = [path.join(engineDir, platform, arch, binaryName), path.join(engineDir, platform, binaryName), path.join(engineDir, binaryName)];

    // 如果是Windows，添加.exe扩展名
    if (platform === 'win32') {
      candidates.unshift(path.join(engineDir, platform, arch, `${binaryName}.exe`), path.join(engineDir, platform, `${binaryName}.exe`), path.join(engineDir, `${binaryName}.exe`));
    }

    // 返回第一个存在的，或返回第一个候选路径（用于安装）
    for (const candidate of candidates) {
      if (fs.existsSync(candidate)) {
        return candidate;
      }
    }
    return candidates[0];
  }

  /**
   * 获取模型文件的完整路径
   */
  getModelPath(pluginId: string, modelName: string): string {
    const modelsDir = this.getPluginResourceDir(pluginId, 'model');
    return path.join(modelsDir, modelName);
  }

  private sanitizeFileName(fileName: string): string {
    // Windows 不允许的字符: < > : " / \ | ? *
    return fileName.replace(/[<>:"/\\|?*]/g, '_');
  }

  private getArchiveDownloadPath(resource: PluginResource, installDir: string, archiveType: Exclude<NonNullable<PluginResource['archiveType']>, 'none'>): string {
    let urlFileName = '';
    if (resource.sourceUrl) {
      try {
        const urlObj = new URL(resource.sourceUrl);
        urlFileName = path.basename(urlObj.pathname) || '';
      } catch {
        urlFileName = '';
      }
    }
    if (!urlFileName) {
      urlFileName = `${resource.name}.${archiveType}`;
    }
    return path.join(installDir, this.sanitizeFileName(urlFileName));
  }

  /**
   * 设置并发数
   */
  setConcurrency(n: number): void {
    this.concurrency = Math.max(1, n);
    // 保存到配置
    PluginConfigStore.setConfig({ concurrency: this.concurrency });
    this.kick();
  }

  /**
   * 将资源加入下载队列
   * @param resource 资源对象
   * @param deleteAfterInstall 是否在安装完成后删除下载文件，默认为false
   */
  enqueue(resource: PluginResource, deleteAfterInstall: boolean = false, options?: { proxyAgent?: ProxyAgent }): PluginResource {
    const activeTask = this.getActiveTask(resource.id);
    if (activeTask) {
      console.log('[PluginDL] skip duplicate enqueue', { id: resource.id, status: activeTask.resource.status });
      return activeTask.resource;
    }

    // 保存到store
    PluginResourceStore.upsert(resource);

    // 确保目录存在
    const targetDir = this.getPluginResourceDir(resource.pluginId, resource.type);
    fs.mkdirSync(targetDir, { recursive: true });

    // 设置安装路径
    if (!resource.installPath) {
      if (resource.type === 'engine') {
        resource.installPath = this.getEnginePath(resource.pluginId, resource.binaryName || resource.name);
      } else {
        resource.installPath = this.getModelPath(resource.pluginId, resource.name);
      }
    }

    const task: InternalTask = { resource, deleteAfterInstall, proxyAgent: options?.proxyAgent };
    this.queue.push(task);
    console.log('[PluginDL] enqueue', { id: resource.id, url: resource.sourceUrl, installPath: resource.installPath });
    this.kick();
    return resource;
  }

  isActive(id: string): boolean {
    return !!this.getActiveTask(id);
  }

  private getActiveTask(id: string): InternalTask | undefined {
    return this.running.find((t) => t.resource.id === id) || this.queue.find((t) => t.resource.id === id);
  }

  /**
   * 取消下载
   */
  cancel(id: string): void {
    const inRun = this.running.find((t) => t.resource.id === id);
    const inQueue = this.queue.find((t) => t.resource.id === id);
    const existing = PluginResourceStore.get(id);
    if (inRun && inRun.controller) {
      try {
        inRun.controller.abort();
      } catch {
        // 忽略取消错误
      }
    }
    console.warn('[PluginDL] cancel', { id });
    if (!inRun && (inQueue || existing)) {
      const resource = inQueue?.resource || existing;
      if (!resource) return;
      resource.status = 'cancelled';
      PluginResourceStore.patch(id, { status: 'cancelled', lastError: undefined });
      this.emitProgress(id, { status: 'cancelled', doneBytes: 0 });
    }
    this.queue = this.queue.filter((t) => t.resource.id !== id);
  }

  /**
   * 检查资源是否已安装
   */
  isInstalled(resource: PluginResource): boolean {
    const installPath = this.getResourceInstallPath(resource);
    if (!installPath) return false;
    if (resource.files?.length) {
      return resource.files.every((file) => {
        const filePath = this.resolveResourceFilePath(installPath, file.path);
        try {
          return Boolean(filePath && fs.statSync(filePath).isFile());
        } catch {
          return false;
        }
      });
    }
    return fs.existsSync(installPath);
  }

  private getResourceInstallPath(resource: PluginResource): string | undefined {
    if (resource.installPath) return resource.installPath;
    if (resource.type === 'engine') {
      return this.getEnginePath(resource.pluginId, resource.binaryName || resource.name);
    }
    return this.getModelPath(resource.pluginId, resource.name);
  }

  private assertManagedResourcePath(resource: PluginResource, targetPath: string): string {
    const root = path.resolve(this.getPluginResourceDir(resource.pluginId, resource.type));
    const resolved = path.resolve(targetPath);
    if (resolved === root || !resolved.startsWith(root + path.sep)) {
      throw new Error(`Invalid managed resource path: ${targetPath}`);
    }
    return resolved;
  }

  async removeInstalledFiles(resource: PluginResource): Promise<string[]> {
    const installPath = this.getResourceInstallPath(resource);
    if (!installPath) return [];

    const deletedPaths: string[] = [];
    const pruneEmptyParents = async (startDir: string): Promise<void> => {
      const pluginsRoot = path.resolve(PluginConfigStore.getPluginsDir());
      let current = path.resolve(startDir);
      while (current !== pluginsRoot && current.startsWith(pluginsRoot + path.sep)) {
        try {
          await fs.promises.rmdir(current);
          deletedPaths.push(current);
        } catch {
          break;
        }
        current = path.dirname(current);
      }
    };
    const removePath = async (targetPath: string): Promise<void> => {
      const resolved = this.assertManagedResourcePath(resource, targetPath);
      if (!fs.existsSync(resolved)) return;
      await fs.promises.rm(resolved, { recursive: true, force: true });
      deletedPaths.push(resolved);
      await pruneEmptyParents(path.dirname(resolved));
    };
    const archiveType = resource.archiveType || 'none';

    if (resource.type === 'engine' && archiveType !== 'none') {
      await removePath(path.dirname(installPath));
      return deletedPaths;
    }

    if (resource.files?.length) {
      for (const file of resource.files) {
        const filePath = this.resolveResourceFilePath(installPath, file.path);
        if (filePath) {
          await removePath(filePath);
          await removePath(`${filePath}.download`);
        }
      }
      return deletedPaths;
    }

    await removePath(installPath);
    await removePath(`${installPath}.download`);
    if (archiveType !== 'none') {
      const archivePath = this.getArchiveDownloadPath(resource, path.dirname(installPath), archiveType);
      await removePath(archivePath);
      await removePath(`${archivePath}.download`);
    }
    return deletedPaths;
  }

  private resolveResourceFilePath(baseDir: string, relativePath: string): string | null {
    const normalized = path.normalize(relativePath || '');
    if (!normalized || path.isAbsolute(normalized) || normalized.startsWith('..') || normalized.includes(`..${path.sep}`)) {
      return null;
    }
    const resolved = path.resolve(baseDir, normalized);
    const root = path.resolve(baseDir);
    if (resolved !== root && !resolved.startsWith(root + path.sep)) {
      return null;
    }
    return resolved;
  }

  private async downloadResourceFile(task: InternalTask, file: PluginResourceFile, targetPath: string, progressOffsetBytes: number, totalBytes?: number): Promise<void> {
    if (!this.downloader) {
      throw new Error('DOWNLOADER_NOT_INITIALIZED');
    }

    fs.mkdirSync(path.dirname(targetPath), { recursive: true });

    let skipDownload = false;
    if (fs.existsSync(targetPath) && file.sha256) {
      task.resource.status = 'verifying';
      this.emitProgress(task.resource.id, {
        status: 'verifying',
        doneBytes: progressOffsetBytes,
        totalBytes
      });
      const existingDigest = await calculateFileHash(targetPath);
      if (existingDigest === file.sha256) {
        skipDownload = true;
      } else {
        fs.unlinkSync(targetPath);
      }
    } else if (fs.existsSync(targetPath) && !file.sha256) {
      skipDownload = true;
    }

    if (skipDownload) {
      return;
    }

    const pluginConfig = PluginConfigStore.getConfig();
    const downloadOptions: DownloadOptions = {
      onProgress: (p) => {
        this.emitProgress(task.resource.id, {
          status: 'downloading',
          doneBytes: progressOffsetBytes + p.doneBytes,
          totalBytes,
          speedBps: p.speedBps,
          etaMs: p.etaMs,
          percentage: totalBytes ? Math.round(((progressOffsetBytes + p.doneBytes) / totalBytes) * 100) : p.percentage
        });
      },
      signal: task.controller?.signal,
      proxyAgent: task.proxyAgent,
      sha256: file.sha256
    };
    if (pluginConfig.downloaderResumeValidation !== undefined) {
      downloadOptions.resumeValidation = pluginConfig.downloaderResumeValidation;
    }
    if (pluginConfig.downloaderDebug !== undefined) {
      downloadOptions.debug = pluginConfig.downloaderDebug;
    }
    await this.downloader.download(file.sourceUrl, targetPath, downloadOptions);
  }

  private emitProgress(id: string, partial: Partial<DownloadProgress>): void {
    // Throttle 'downloading' status updates to avoid IPC flooding
    const now = Date.now();
    if (partial.status === 'downloading') {
      const lastEmit = this.lastProgressEmit.get(id) || 0;
      if (now - lastEmit < PluginResourceManager.PROGRESS_THROTTLE_MS) {
        return;
      }
    }
    this.lastProgressEmit.set(id, now);

    // Find resource metadata from running or queue tasks
    const task = this.running.find((t) => t.resource.id === id) || this.queue.find((t) => t.resource.id === id);
    const resource = task?.resource;
    const base: DownloadProgress = {
      id,
      status: 'queued',
      doneBytes: 0,
      pluginId: resource?.pluginId,
      resourceId: resource?.resourceId,
      type: resource?.type,
      name: resource?.name,
      displayName: resource?.displayName,
      version: resource?.version,
      ...partial
    } as any;
    this.emit('progress', base);
    if (resource && (partial.status === 'downloading' || partial.status === 'extracting' || partial.status === 'verifying')) {
      const resourceLabel = resource.displayName || resource.name || resource.id;
      const progress = partial.percentage ?? (partial.totalBytes && partial.doneBytes !== undefined ? Math.round((partial.doneBytes / partial.totalBytes) * 100) : undefined);
      eventManager.emit(AppEvent.SPRITE_DOWNLOAD_PROGRESS, {
        name: resource.name || resource.id,
        message: `${resource.type === 'model' ? '模型' : '插件'}下载中: ${resourceLabel}`,
        progress
      });
    }

    // Clean up throttle tracking for terminal states
    if (['installed', 'failed', 'cancelled'].includes(partial.status || '')) {
      this.lastProgressEmit.delete(id);
    }
  }

  private kick(): void {
    while (this.running.length < this.concurrency && this.queue.length) {
      const task = this.queue.shift()!;
      this.startTask(task).catch((err) => {
        console.error('[PluginDL] task failed (kick)', { id: task.resource.id, error: String(err) });
        this.emitProgress(task.resource.id, { status: 'failed', error: String(err) });
      });
    }
  }

  private async startTask(task: InternalTask): Promise<void> {
    if (!this.downloader) {
      throw new Error('DOWNLOADER_NOT_INITIALIZED');
    }

    const pluginConfig = PluginConfigStore.getConfig();
    task.resource.status = 'downloading';
    task.startedAt = Date.now();
    task.lastTickAt = task.startedAt;
    task.lastTickBytes = 0;
    task.controller = new AbortController();
    this.running.push(task);

    const url = task.resource.sourceUrl;
    const archiveType = task.resource.archiveType || 'none';
    const installDir = path.dirname(task.resource.installPath!);

    // 确保目标目录存在
    fs.mkdirSync(installDir, { recursive: true });

    // 确定最终文件路径（下载器会自动添加 .download 后缀并在完成后重命名）
    let finalFile: string;

    if (archiveType === 'none') {
      // 非压缩包：直接下载到目标位置
      finalFile = task.resource.installPath!;
    } else {
      // 压缩包：下载到目标目录
      finalFile = this.getArchiveDownloadPath(task.resource, installDir, archiveType);
    }

    try {
      // 下载前检查：如果目标文件已存在且有hash，先验证hash
      let skipDownload = false;
      if (!task.resource.files?.length && fs.existsSync(finalFile) && task.resource.sha256) {
        task.resource.status = 'verifying';
        this.emitProgress(task.resource.id, { status: 'verifying' });
        console.log('[PluginDL] checking existing file hash', { id: task.resource.id, file: finalFile });

        const existingDigest = await calculateFileHash(finalFile);
        if (existingDigest === task.resource.sha256) {
          // hash匹配，直接完成，不需要下载
          console.log('[PluginDL] existing file hash matches, skipping download', { id: task.resource.id });

          skipDownload = true;
        } else {
          // hash不匹配，删除旧文件，继续下载
          console.log('[PluginDL] existing file hash mismatch, will re-download', { id: task.resource.id, expect: task.resource.sha256, got: existingDigest });
          if (fs.existsSync(finalFile)) {
            fs.unlinkSync(finalFile);
          }
        }
      }

      // 如果需要下载，执行下载流程
      if (task.resource.files?.length) {
        if (!task.resource.installPath) {
          throw new Error('INSTALL_PATH_REQUIRED');
        }
        fs.mkdirSync(task.resource.installPath, { recursive: true });
        const totalBytes = task.resource.files.reduce((sum, file) => sum + (file.sizeBytes || 0), 0) || task.resource.sizeBytes;
        let doneBytes = 0;
        for (const file of task.resource.files) {
          const targetPath = this.resolveResourceFilePath(task.resource.installPath, file.path);
          if (!targetPath) {
            throw new Error(`Invalid resource file path: ${file.path}`);
          }
          await this.downloadResourceFile(task, file, targetPath, doneBytes, totalBytes);
          doneBytes += file.sizeBytes || 0;
          this.emitProgress(task.resource.id, {
            status: 'downloading',
            doneBytes,
            totalBytes
          });
        }
        skipDownload = true;
      }

      if (!skipDownload) {
        console.log('[PluginDL] start download', { id: task.resource.id, url, finalFile });
        // 下载文件（下载器会自动添加 .download 后缀，并在下载完成后进行 hash 验证和重命名）
        const downloadOptions: DownloadOptions = {
          onProgress: (p) => {
            this.emitProgress(task.resource.id, {
              status: 'downloading',
              doneBytes: p.doneBytes,
              totalBytes: p.totalBytes,
              speedBps: p.speedBps,
              etaMs: p.etaMs,
              percentage: p.percentage
            });
          },
          signal: task.controller?.signal,
          proxyAgent: task.proxyAgent,
          sha256: task.resource.sha256 // 如果提供了 sha256，下载器会自动验证
        };
        if (pluginConfig.downloaderResumeValidation !== undefined) {
          downloadOptions.resumeValidation = pluginConfig.downloaderResumeValidation;
        }
        if (pluginConfig.downloaderDebug !== undefined) {
          downloadOptions.debug = pluginConfig.downloaderDebug;
        }
        await this.downloader.download(url!, finalFile, downloadOptions);
      }

      // 第三步：根据类型处理
      if (archiveType !== 'none') {
        // 压缩包：解压到目标文件夹
        task.resource.status = 'extracting';
        this.emitProgress(task.resource.id, { status: 'extracting' });
        console.log('[PluginDL] extracting', { id: task.resource.id, archive: finalFile, to: installDir, type: archiveType });
        await this.extractArchive(finalFile, installDir, archiveType, task.resource.extractTo, task);

        // 根据参数决定是否删除压缩包（默认不删除）
        const deleteArchiveAfterInstall = pluginConfig.deleteArchiveAfterInstall ?? task.deleteAfterInstall;
        if (deleteArchiveAfterInstall && fs.existsSync(finalFile)) {
          try {
            fs.unlinkSync(finalFile);
            console.log('[PluginDL] removed archive after install', { id: task.resource.id });
          } catch {
            // 忽略删除错误
          }
        }
      }

      // 设置可执行权限（仅限非Windows系统）
      if (task.resource.type === 'engine' && process.platform !== 'win32') {
        try {
          fs.chmodSync(task.resource.installPath!, 0o755);
        } catch {
          // 忽略权限设置错误
        }
      }

      task.resource.status = 'installed';
      task.resource.installedAt = Date.now();
      const totalSizeBytes = task.resource.sizeBytes || task.resource.files?.reduce((sum, file) => sum + (file.sizeBytes || 0), 0) || undefined;
      const resourceLabel = task.resource.displayName || task.resource.name || task.resource.id;
      PluginResourceStore.patch(task.resource.id, {
        status: 'installed',
        installedAt: task.resource.installedAt,
        installPath: task.resource.installPath,
        sizeBytes: totalSizeBytes
      });
      this.emitProgress(task.resource.id, {
        status: 'installed',
        doneBytes: totalSizeBytes || 0,
        totalBytes: totalSizeBytes
      });
      console.log('[PluginDL] installed', { id: task.resource.id, installPath: task.resource.installPath });
      eventManager.emit(AppEvent.SPRITE_DOWNLOAD_COMPLETE, {
        name: task.resource.name || task.resource.id,
        message: `${task.resource.type === 'model' ? '模型' : '插件'}安装完成: ${resourceLabel}`,
        progress: 100
      });
      eventManager.emit(AppEvent.SPRITE_PLUGIN_INSTALLED, {
        name: task.resource.name || task.resource.id,
        pluginId: task.resource.pluginId,
        resourceId: task.resource.resourceId,
        type: task.resource.type,
        message: `${task.resource.type === 'model' ? '模型' : '插件'}安装完成: ${resourceLabel}`
      });
    } catch (err: any) {
      const isCancelled = isAbortLikeError(err);
      if (isCancelled) {
        task.resource.status = 'cancelled';
        PluginResourceStore.patch(task.resource.id, { status: 'cancelled', lastError: undefined });
        console.warn('[PluginDL] cancelled', { id: task.resource.id });
        this.emitProgress(task.resource.id, { status: 'cancelled' });
      } else {
        task.resource.status = 'failed';
        task.resource.lastError = err.message || String(err);
        PluginResourceStore.patch(task.resource.id, {
          status: 'failed',
          lastError: task.resource.lastError
        });
        console.error('[PluginDL] failed', { id: task.resource.id, error: task.resource.lastError });
        this.emitProgress(task.resource.id, { status: 'failed', error: task.resource.lastError });
        eventManager.emit(AppEvent.SPRITE_DOWNLOAD_FAILED, { name: task.resource.name || task.resource.id });
      }
      // 根据配置决定是否清理临时的 .download 文件（下载中断时的临时文件）
      const tempFile = `${finalFile}.download`;
      const shouldDeletePartialDownload = isCancelled ? pluginConfig.deletePartialDownloadOnCancel !== false : pluginConfig.deletePartialDownloadOnFailure !== false;
      if (shouldDeletePartialDownload && fs.existsSync(tempFile)) {
        try {
          fs.unlinkSync(tempFile);
        } catch {
          // 忽略删除错误
        }
      }
      // 只在下载阶段失败时删除已下载的文件
      // 如果是解压阶段失败（文件已下载完成），保留文件以避免重新下载
      if (archiveType === 'none' && pluginConfig.deleteDownloadedFileOnFailure !== false && fs.existsSync(finalFile)) {
        // 非压缩包类型，下载失败时清理不完整的文件
        try {
          fs.unlinkSync(finalFile);
        } catch {
          // 忽略删除错误
        }
      }
      // 注意：压缩包类型的已下载文件保留，下次重试时会通过 hash 校验跳过下载
    } finally {
      this.finish(task);
    }
  }

  private finish(task: InternalTask): void {
    this.running = this.running.filter((t) => t !== task);
    this.kick();
  }

  private async extractArchive(archivePath: string, targetDir: string, archiveType: 'zip' | 'tar.gz' | 'tar.bz2' | 'tar', extractTo?: string, task?: InternalTask): Promise<void> {
    const finalDir = extractTo ? path.join(targetDir, extractTo) : targetDir;
    fs.mkdirSync(finalDir, { recursive: true });

    const progressCallback = task
      ? (data: { total: number; current: number; filePath: string; type: 'Directory' | 'File'; size?: number; percent?: number }) => {
          // 更新解压进度
          // percent是百分比，我们用它来估算已处理的字节数
          const estimatedBytes = task.resource.sizeBytes && data.percent ? Math.floor((task.resource.sizeBytes * data.percent) / 100) : undefined;
          this.emitProgress(task.resource.id, {
            status: 'extracting',
            doneBytes: estimatedBytes,
            totalBytes: task.resource.sizeBytes
          });
        }
      : undefined;

    // tar.bz2 需要解压两次：先解压 bz2 得到 tar 文件，再解压 tar 文件
    if (archiveType === 'tar.bz2') {
      // 第一次解压：解压 bz2 压缩层，得到 tar 文件
      const tempDir = path.join(targetDir, '.temp-extract');
      fs.mkdirSync(tempDir, { recursive: true });

      try {
        await unzipFileWith7Z(archivePath, tempDir, progressCallback, PLUGIN_ARCHIVE_EXCLUDE_ARGS);

        // 查找解压出来的 .tar 文件
        const files = fs.readdirSync(tempDir);
        const tarFile = files.find((f) => f.endsWith('.tar'));

        if (!tarFile) {
          throw new Error(`No .tar file found after extracting ${archivePath}`);
        }

        const tarFilePath = path.join(tempDir, tarFile);

        // 第二次解压：解压 tar 文件到最终目录
        await unzipFileWith7Z(tarFilePath, finalDir, progressCallback, PLUGIN_ARCHIVE_EXCLUDE_ARGS);

        // 清理临时目录和 tar 文件
        try {
          if (fs.existsSync(tarFilePath)) {
            fs.unlinkSync(tarFilePath);
          }
          // 递归删除临时目录
          if (fs.existsSync(tempDir)) {
            fs.rmSync(tempDir, { recursive: true, force: true });
          }
        } catch {
          // 忽略清理错误
        }
      } catch (error) {
        // 清理临时目录（即使出错也要清理）
        try {
          if (fs.existsSync(tempDir)) {
            fs.rmSync(tempDir, { recursive: true, force: true });
          }
        } catch {
          // 忽略清理错误
        }
        throw error;
      }
    } else {
      // 其他格式直接解压
      await unzipFileWith7Z(archivePath, finalDir, progressCallback, PLUGIN_ARCHIVE_EXCLUDE_ARGS);
    }
  }
}

export const pluginResourceManager = new PluginResourceManager();
