import { EventEmitter } from 'node:events';

import { subscriptionManager, type YouTubeSubscription } from './subscription-manager';
import { type DownloadCompletionResult, type DownloadOptions, type DownloadProgress, getThumbnail, getVideoInfo, VideoDownloader, type VideoInfo } from './video-downloader';

function generateUUID(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export type DownloadStatus = 'queued' | 'downloading' | 'completed' | 'failed' | 'cancelled';

// 下载任务接口
export interface DownloadTask {
  id: string;
  url: string;
  filename?: string;
  destination?: string;
  quality?: number | string;
  qualityMode?: string;
  folderId?: string;
  parentResourceId?: string;
  metadata?: Record<string, unknown>;
  videoInfo?: any; // 视频信息
  status: DownloadStatus;
  progress: DownloadProgress;
  error?: string;
  startTime?: number;
  endTime?: number;
  downloader?: VideoDownloader;
  result?: DownloadCompletionResult;
}

// 下载管理器类
export class DownloadManager extends EventEmitter {
  private tasks: Map<string, DownloadTask> = new Map();
  private maxConcurrent = 3;
  private running: Set<string> = new Set();

  constructor() {
    super();
  }

  // 添加下载任务
  async addTask(options: DownloadOptions): Promise<string> {
    const taskId = generateUUID();
    const task: DownloadTask = {
      id: taskId,
      url: options.url,
      filename: options.filename,
      destination: options.destination,
      quality: options.quality,
      qualityMode: options.qualityMode,
      folderId: options.folderId,
      parentResourceId: options.parentResourceId,
      metadata: options.metadata,
      videoInfo: options.videoInfo,
      status: 'queued',
      progress: {}
    };

    this.tasks.set(taskId, task);
    this.emit('taskAdded', task);

    // 开始下载
    this.processQueue();

    return taskId;
  }

  // 取消下载任务
  cancelTask(taskId: string): boolean {
    const task = this.tasks.get(taskId);
    if (!task) return false;

    if (task.downloader) {
      task.downloader.cancel();
    }

    task.status = 'cancelled';
    this.running.delete(taskId);
    this.emit('taskCancelled', task);

    return true;
  }

  // 获取任务信息
  getTask(taskId: string): DownloadTask | undefined {
    return this.tasks.get(taskId);
  }

  getAllTasks(): DownloadTask[] {
    return Array.from(this.tasks.values());
  }

  // 处理下载队列
  private async processQueue(): Promise<void> {
    if (this.running.size >= this.maxConcurrent) return;

    const queuedTasks = Array.from(this.tasks.values())
      .filter((task) => task.status === 'queued')
      .slice(0, this.maxConcurrent - this.running.size);

    for (const task of queuedTasks) {
      this.startDownload(task);
    }
  }

  private async startDownload(task: DownloadTask): Promise<void> {
    if (this.running.has(task.id)) return;

    this.running.add(task.id);
    task.status = 'downloading';
    task.startTime = Date.now();
    this.emit('taskStarted', task);

    const downloader = new VideoDownloader();
    task.downloader = downloader;

    try {
      await downloader.download({
        url: task.url,
        filename: task.filename,
        destination: task.destination,
        quality: task.quality,
        qualityMode: task.qualityMode,
        folderId: task.folderId,
        parentResourceId: task.parentResourceId,
        metadata: task.metadata,
        videoInfo: task.videoInfo,
        onProgress: (progress) => {
          task.progress = progress;
          this.emit('taskProgress', task);
        },
        onError: (error) => {
          task.status = 'failed';
          task.error = error.message;
          task.endTime = Date.now();
          this.running.delete(task.id);
          this.emit('taskFailed', task);
          this.processQueue();
        },
        onCompleted: (result) => {
          task.status = 'completed';
          task.endTime = Date.now();
          task.result = result;
          this.running.delete(task.id);
          this.emit('taskCompleted', task);
          this.processQueue();
        }
      });
    } catch (error) {
      task.status = 'failed';
      task.error = error instanceof Error ? error.message : String(error);
      task.endTime = Date.now();
      this.running.delete(task.id);
      this.emit('taskFailed', task);
      this.processQueue();
    }
  }

  // 设置最大并发数
  setMaxConcurrent(max: number): void {
    this.maxConcurrent = Math.max(1, max);
  }

  // 清理已完成的任务
  cleanup(): void {
    const completedTasks = Array.from(this.tasks.values()).filter((task) => ['completed', 'failed', 'cancelled'].includes(task.status));

    for (const task of completedTasks) {
      this.tasks.delete(task.id);
    }

    this.emit('cleanup', completedTasks.length);
  }
}

export const downloadManager = new DownloadManager();

// 导出函数供 IPC 使用
export { getThumbnail, getVideoInfo, subscriptionManager, VideoDownloader };
export type { DownloadOptions, DownloadProgress, VideoInfo, YouTubeSubscription };
