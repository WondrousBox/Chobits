import { EventEmitter } from 'node:events';
import fs from 'node:fs';
import path from 'node:path';

import { app } from 'electron';

import { calculateFileHash, unzipFileWith7Z } from '../common/utils/file';
import type { Downloader } from '../downloader/types';
import { PluginConfigStore } from './plugin-config-store';
import { PluginResourceStore } from './plugin-resource-store';

export type ResourceType = 'engine' | 'model';

export type DownloadStatus = 'queued' | 'downloading' | 'extracting' | 'verifying' | 'installed' | 'failed' | 'cancelled';

export interface PluginResource {
  id: string; // 唯一标识
  pluginId: string; // 插件ID，如 'plugin:whisper'
  type: ResourceType; // 资源类型：engine 或 model
  name: string; // 资源名称
  displayName?: string; // 显示名称
  version?: string; // 版本号
  sizeBytes?: number; // 文件大小（字节）
  sha256?: string; // SHA256校验和
  sourceUrl: string; // 下载URL
  sourceType?: 'http' | 'https'; // 源类型
  archiveType?: 'zip' | 'tar.gz' | 'tar' | 'none'; // 压缩包类型，none表示不压缩
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
}

export interface DownloadProgress {
  id: string;
  status: DownloadStatus;
  doneBytes: number;
  totalBytes?: number;
  speedBps?: number;
  etaMs?: number;
  error?: string;
}

interface InternalTask {
  resource: PluginResource;
  controller?: AbortController;
  startedAt?: number;
  lastTickBytes?: number;
  lastTickAt?: number;
  deleteAfterInstall?: boolean; // 是否在安装完成后删除下载文件
}

/**
 * 插件资源管理器
 * 负责下载和管理插件所需的engine工具和模型文件
 * 目录结构：
 * - resources/plugins/{pluginId}/engine/ - Engine工具
 * - resources/plugins/{pluginId}/models/ - 模型文件
 */
class PluginResourceManager extends EventEmitter {
  private queue: InternalTask[] = [];
  private running: InternalTask[] = [];
  private concurrency = 2;
  private downloadDir: string;
  private downloader: Downloader | null = null;

  constructor() {
    super();
    // 使用用户的下载目录作为下载存储目录
    this.downloadDir = path.join(app.getPath('downloads'), 'ChobitsDownloads');
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
  enqueue(resource: PluginResource, deleteAfterInstall: boolean = false): void {
    // 保存到store
    PluginResourceStore.upsert(resource);

    // 确保目录存在
    const targetDir = resource.type === 'engine' ? this.getPluginResourceDir(resource.pluginId, 'engine') : this.getPluginResourceDir(resource.pluginId, 'model');
    fs.mkdirSync(targetDir, { recursive: true });

    // 设置安装路径
    if (!resource.installPath) {
      if (resource.type === 'engine') {
        resource.installPath = this.getEnginePath(resource.pluginId, resource.binaryName || resource.name);
      } else {
        resource.installPath = this.getModelPath(resource.pluginId, resource.name);
      }
    }

    const task: InternalTask = { resource, deleteAfterInstall };
    this.queue.push(task);
    console.log('[PluginDL] enqueue', { id: resource.id, url: resource.sourceUrl, installPath: resource.installPath });
    this.kick();
  }

  /**
   * 取消下载
   */
  cancel(id: string): void {
    const inRun = this.running.find((t) => t.resource.id === id);
    if (inRun && inRun.controller) {
      try {
        inRun.controller.abort();
      } catch {
        // 忽略取消错误
      }
    }
    this.queue = this.queue.filter((t) => t.resource.id !== id);
    console.warn('[PluginDL] cancel', { id });
    this.emitProgress(id, { status: 'cancelled', doneBytes: 0 });
  }

  /**
   * 检查资源是否已安装
   */
  isInstalled(resource: PluginResource): boolean {
    if (!resource.installPath) return false;
    return fs.existsSync(resource.installPath);
  }

  private emitProgress(id: string, partial: Partial<DownloadProgress>): void {
    const base: DownloadProgress = { id, status: 'queued', doneBytes: 0, ...partial } as any;
    this.emit('progress', base);
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

    task.resource.status = 'downloading';
    task.startedAt = Date.now();
    task.lastTickAt = task.startedAt;
    task.lastTickBytes = 0;
    task.controller = new AbortController();
    this.running.push(task);

    const url = task.resource.sourceUrl;
    const archiveType = task.resource.archiveType || 'none';
    const installDir = path.dirname(task.resource.installPath!);

    // 下载文件到下载目录
    // 从URL中提取文件名，如果无法提取则使用资源名称
    let urlFileName: string;
    try {
      const urlObj = new URL(url);
      urlFileName = path.basename(urlObj.pathname) || '';
    } catch {
      urlFileName = '';
    }
    if (!urlFileName) {
      const ext = archiveType === 'none' ? 'bin' : archiveType;
      urlFileName = `${task.resource.name}.${ext}`;
    }
    // 清理文件名中的非法字符（Windows 不允许的字符）
    const sanitizeFileName = (fileName: string): string => {
      // Windows 不允许的字符: < > : " / \ | ? *
      return fileName.replace(/[<>:"/\\|?*]/g, '_');
    };
    const sanitizedId = sanitizeFileName(task.resource.id);
    const sanitizedUrlFileName = sanitizeFileName(urlFileName);
    const downloadFile = path.join(this.downloadDir, `${sanitizedId}-${sanitizedUrlFileName}`);

    try {
      console.log('[PluginDL] start download', { id: task.resource.id, url, downloadFile });
      // 下载文件到下载目录（通过下载器实现）
      await this.downloader.download(
        url,
        downloadFile,
        (p) => {
          this.emitProgress(task.resource.id, {
            status: 'downloading',
            doneBytes: p.doneBytes,
            totalBytes: p.totalBytes,
            speedBps: p.speedBps,
            etaMs: p.etaMs
          });
        },
        task.controller?.signal
      );

      // 验证SHA256校验和
      if (task.resource.sha256) {
        task.resource.status = 'verifying';
        this.emitProgress(task.resource.id, { status: 'verifying' });
        console.log('[PluginDL] verifying', { id: task.resource.id, downloadFile });

        // 使用公共方法计算文件hash
        const digest = await calculateFileHash(downloadFile);
        if (digest !== task.resource.sha256) {
          console.error('[PluginDL] checksum mismatch', { id: task.resource.id, expect: task.resource.sha256, got: digest });
          fs.unlinkSync(downloadFile);
          throw new Error('CHECKSUM_MISMATCH');
        }
      }

      // 从下载目录解压或移动到安装位置
      if (archiveType !== 'none') {
        task.resource.status = 'extracting';
        this.emitProgress(task.resource.id, { status: 'extracting' });
        console.log('[PluginDL] extracting', { id: task.resource.id, archive: downloadFile, to: installDir, type: archiveType });
        // 从下载目录解压到安装目录
        await this.extractArchive(downloadFile, installDir, archiveType, task.resource.extractTo, task);
      } else {
        // 直接移动文件到安装位置
        fs.renameSync(downloadFile, task.resource.installPath!);
      }

      // 根据参数决定是否删除下载文件（默认不删除）
      if (task.deleteAfterInstall && fs.existsSync(downloadFile)) {
        try {
          fs.unlinkSync(downloadFile);
          console.log('[PluginDL] removed archive after install', { id: task.resource.id });
        } catch {
          // 忽略删除错误
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
      PluginResourceStore.patch(task.resource.id, {
        status: 'installed',
        installedAt: task.resource.installedAt,
        installPath: task.resource.installPath
      });
      this.emitProgress(task.resource.id, {
        status: 'installed',
        doneBytes: task.resource.sizeBytes || 0,
        totalBytes: task.resource.sizeBytes
      });
      console.log('[PluginDL] installed', { id: task.resource.id, installPath: task.resource.installPath });
    } catch (err: any) {
      if (err.name === 'AbortError') {
        task.resource.status = 'cancelled';
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
      }
      // 清理下载文件（如果存在）
      if (fs.existsSync(downloadFile)) {
        try {
          fs.unlinkSync(downloadFile);
        } catch {
          // 忽略删除错误
        }
      }
    } finally {
      this.finish(task);
    }
  }

  private finish(task: InternalTask): void {
    this.running = this.running.filter((t) => t !== task);
    this.kick();
  }

  private async extractArchive(archivePath: string, targetDir: string, archiveType: 'zip' | 'tar.gz' | 'tar', extractTo?: string, task?: InternalTask): Promise<void> {
    const finalDir = extractTo ? path.join(targetDir, extractTo) : targetDir;
    fs.mkdirSync(finalDir, { recursive: true });

    // 使用封装的unzipFileWith7Z统一解压所有格式（zip, tar, tar.gz等）
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

    await unzipFileWith7Z(archivePath, finalDir, progressCallback);
  }
}

export const pluginResourceManager = new PluginResourceManager();
