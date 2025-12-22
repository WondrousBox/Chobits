import { EventEmitter } from 'node:events';
import fs from 'node:fs';
import path from 'node:path';

import { app } from 'electron';

import { DOWNLOAD_FOLDER_NAME } from '../common/config';
import { calculateFileHash, unzipFileWith7Z } from '../common/utils';
import type { Downloader, ProxyAgent } from '../downloader/types';
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
  sourceUrl: string; // 下载URL
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
  enqueue(resource: PluginResource, deleteAfterInstall: boolean = false, options?: { proxyAgent?: ProxyAgent }): void {
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

    // 确保目标目录存在
    fs.mkdirSync(installDir, { recursive: true });

    // 统一处理：所有文件都先下载到目标位置，带.download后缀
    let downloadFile: string;
    let finalFile: string; // hash验证后去掉.download后缀的文件路径

    if (archiveType === 'none') {
      // 非压缩包：下载到目标位置，使用.download后缀
      downloadFile = `${task.resource.installPath!}.download`;
      finalFile = task.resource.installPath!;
    } else {
      // 压缩包：下载到目标目录，使用.download后缀
      // 从URL中提取文件名，如果无法提取则使用资源名称
      let urlFileName: string;
      try {
        const urlObj = new URL(url);
        urlFileName = path.basename(urlObj.pathname) || '';
      } catch {
        urlFileName = '';
      }
      if (!urlFileName) {
        urlFileName = `${task.resource.name}.${archiveType}`;
      }
      // 清理文件名中的非法字符（Windows 不允许的字符）
      const sanitizeFileName = (fileName: string): string => {
        // Windows 不允许的字符: < > : " / \ | ? *
        return fileName.replace(/[<>:"/\\|?*]/g, '_');
      };
      const sanitizedUrlFileName = sanitizeFileName(urlFileName);
      downloadFile = path.join(installDir, `${sanitizedUrlFileName}.download`);
      finalFile = path.join(installDir, sanitizedUrlFileName);
    }

    try {
      // 下载前检查：如果目标文件已存在且有hash，先验证hash
      let skipDownload = false;
      if (fs.existsSync(finalFile) && task.resource.sha256) {
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
      if (!skipDownload) {
        console.log('[PluginDL] start download', { id: task.resource.id, url, downloadFile });
        // 下载文件（带.download后缀）
        await this.downloader.download(url, downloadFile, {
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
          proxyAgent: task.proxyAgent
        });

        // 第一步：检查hash（如果提供了）
        if (task.resource.sha256) {
          task.resource.status = 'verifying';
          this.emitProgress(task.resource.id, { status: 'verifying' });
          console.log('[PluginDL] verifying', { id: task.resource.id, downloadFile });

          // 使用公共方法计算文件hash
          const digest = await calculateFileHash(downloadFile);
          if (digest !== task.resource.sha256) {
            console.error('[PluginDL] checksum mismatch', { id: task.resource.id, expect: task.resource.sha256, got: digest });
            // hash不符，立即删除文件，不能保留
            if (fs.existsSync(downloadFile)) {
              fs.unlinkSync(downloadFile);
            }
            throw new Error('CHECKSUM_MISMATCH');
          }
          console.log('[PluginDL] checksum verified', { id: task.resource.id });
        }

        // 第二步：hash匹配后，去掉.download后缀
        console.log('[PluginDL] finalizing', { id: task.resource.id, from: downloadFile, to: finalFile });
        fs.renameSync(downloadFile, finalFile);
      }

      // 第三步：根据类型处理
      if (archiveType !== 'none') {
        // 压缩包：解压到目标文件夹
        task.resource.status = 'extracting';
        this.emitProgress(task.resource.id, { status: 'extracting' });
        console.log('[PluginDL] extracting', { id: task.resource.id, archive: finalFile, to: installDir, type: archiveType });
        await this.extractArchive(finalFile, installDir, archiveType, task.resource.extractTo, task);

        // 根据参数决定是否删除压缩包（默认不删除）
        if (task.deleteAfterInstall && fs.existsSync(finalFile)) {
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
      // 可能还在.download状态，也可能已经重命名为finalFile
      if (fs.existsSync(downloadFile)) {
        try {
          fs.unlinkSync(downloadFile);
        } catch {
          // 忽略删除错误
        }
      }
      if (fs.existsSync(finalFile)) {
        try {
          fs.unlinkSync(finalFile);
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
        await unzipFileWith7Z(archivePath, tempDir, progressCallback);

        // 查找解压出来的 .tar 文件
        const files = fs.readdirSync(tempDir);
        const tarFile = files.find((f) => f.endsWith('.tar'));

        if (!tarFile) {
          throw new Error(`No .tar file found after extracting ${archivePath}`);
        }

        const tarFilePath = path.join(tempDir, tarFile);

        // 第二次解压：解压 tar 文件到最终目录
        await unzipFileWith7Z(tarFilePath, finalDir, progressCallback);

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
      await unzipFileWith7Z(archivePath, finalDir, progressCallback);
    }
  }
}

export const pluginResourceManager = new PluginResourceManager();
