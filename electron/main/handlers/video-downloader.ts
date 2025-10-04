import { EventEmitter } from 'node:events';
import { HttpsProxyAgent } from "https-proxy-agent";
import { SocksProxyAgent } from "socks-proxy-agent";
import { resolve } from "node:path";
import os from "node:os";
import path from "node:path";
import fs from "node:fs";

import ytdlpStatic from "../libs/ytdlp-static";

// 默认文件夹配置
const DEFAULT_FOLDERS = {
  download: './downloads'
};

// 工具函数
function getRealPath(...paths: string[]): string {
  for (const p of paths) {
    if (fs.existsSync(p)) {
      return p;
    }
  }
  return paths[paths.length - 1];
}

function isFunction(fn: any): fn is Function {
  return typeof fn === 'function';
}

function sendMainWindowError(data: any): void {
  console.error('[VideoDownloader] Error:', data);
  // 这里可以添加发送到主窗口的逻辑
}

function cleanDownloadUrl(url: string): string {
  return url.trim();
}

function generateUUID(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

async function downloadImageFromUrl(url: string, filename: string, folder: string, destination?: string): Promise<string> {
  // 简化实现，实际应该下载图片
  return '';
}

function changeFileName(originalName: string, newName: string): string {
  const ext = path.extname(originalName);
  return newName + ext;
}

function compareAndRenameFiles(source: string, dest: string): void {
  try {
    if (fs.existsSync(source)) {
      fs.renameSync(source, dest);
    }
  } catch (error) {
    console.error('[VideoDownloader] Failed to rename file:', error);
  }
}

function getFileNameWithoutExtension(filePath: string): string {
  return path.basename(filePath, path.extname(filePath));
}

function getHttpProxy(): any {
  // 简化实现，返回null表示无代理
  return null;
}

function getSetting(key?: string): any {
  // 简化实现，返回默认设置
  return {
    externalResourceMode: "1",
    externalResourceCookies: false
  };
}

// 下载器接口
export interface Downloader {
  download(options: DownloadOptions): Promise<void>;
  cancel(): void;
}

// 下载选项接口
export interface DownloadOptions {
  url: string;
  filename?: string;
  destination?: string;
  thumbnailUrl?: string;
  quality?: number;
  onProgress?: (progress: DownloadProgress) => void;
  onError?: (error: Error) => void;
  onCompleted?: (files: string[], thumbnails: string[]) => void;
}

// 下载进度接口
export interface DownloadProgress {
  percent?: number;
  totalSize?: string;
  downloadSpeed?: string;
  eta?: string;
  statusText?: string;
}

// 视频信息接口
export interface VideoInfo {
  title: string;
  filename: string;
  description: string;
  thumbnail: string;
  duration: number;
  categories: string[];
  tags: string[];
  quality: string;
  automatic_captions?: Record<string, {
    ext: string;
    url: string;
    protocol?: string;
    name?: string;
  }[]>;
  subtitles: Record<string, {
    ext: string;
    url: string;
    name: string;
  }[]>;
  chapters: Array<{
    start_time: number;
    end_time: number;
    title: string;
  }>;
  ext: string;
  video_ext: string;
  audio_ext: string;
  format: string;
  format_id: string;
  format_note: string;
}

// 下载任务状态
export type DownloadStatus = 'queued' | 'downloading' | 'completed' | 'failed' | 'cancelled';

// 下载任务接口
export interface DownloadTask {
  id: string;
  url: string;
  filename?: string;
  destination?: string;
  status: DownloadStatus;
  progress: DownloadProgress;
  error?: string;
  startTime?: number;
  endTime?: number;
  downloader?: VideoDownloader;
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

  // 获取所有任务
  getAllTasks(): DownloadTask[] {
    return Array.from(this.tasks.values());
  }

  // 处理下载队列
  private async processQueue(): Promise<void> {
    if (this.running.size >= this.maxConcurrent) return;

    const queuedTasks = Array.from(this.tasks.values())
      .filter(task => task.status === 'queued')
      .slice(0, this.maxConcurrent - this.running.size);

    for (const task of queuedTasks) {
      this.startDownload(task);
    }
  }

  // 开始下载
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
        ...task,
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
          this.processQueue(); // 处理下一个任务
        },
        onCompleted: (files, thumbnails) => {
          task.status = 'completed';
          task.endTime = Date.now();
          this.running.delete(task.id);
          this.emit('taskCompleted', task);
          this.processQueue(); // 处理下一个任务
        }
      });
    } catch (error) {
      task.status = 'failed';
      task.error = error instanceof Error ? error.message : String(error);
      task.endTime = Date.now();
      this.running.delete(task.id);
      this.emit('taskFailed', task);
      this.processQueue(); // 处理下一个任务
    }
  }

  // 设置最大并发数
  setMaxConcurrent(max: number): void {
    this.maxConcurrent = Math.max(1, max);
  }

  // 清理已完成的任务
  cleanup(): void {
    const completedTasks = Array.from(this.tasks.values())
      .filter(task => ['completed', 'failed', 'cancelled'].includes(task.status));
    
    for (const task of completedTasks) {
      this.tasks.delete(task.id);
    }
    
    this.emit('cleanup', completedTasks.length);
  }
}

// 视频下载器类
export class VideoDownloader implements Downloader {
  private controller?: AbortController;
  private ffmpegPath: string;
  private ytdlPath: string;

  constructor() {
    this.ffmpegPath = getRealPath(
      `../addon/ffmpeg/${os.platform() === "darwin" ? "ffmpeg" : "ffmpeg.exe"}`,
      `./resources/ffmpeg/${os.platform()}/${os.arch()}/${os.platform() === "darwin" ? "ffmpeg" : "ffmpeg.exe"}`,
    );

    this.ytdlPath = getRealPath(
      `../yt-dlp/${os.platform() === "darwin" ? "yt-dlp_macos" : "yt-dlp.exe"}`,
      `./resources/yt-dlp/${os.platform()}/${os.platform() === "darwin" ? "yt-dlp_macos" : "yt-dlp.exe"}`,
    );

    ytdlpStatic.setBinaryPath(this.ytdlPath);
  }

  async download(options: DownloadOptions): Promise<void> {
    this.controller = new AbortController();
    const { signal } = this.controller;

    const {
      url,
      filename,
      destination,
      thumbnailUrl,
      onProgress,
      onError,
      onCompleted,
    } = options;

    const quality: string[] = [];
    const tempName = DEFAULT_FOLDERS.download + "_" + generateUUID();
    const tempFile = filename ? changeFileName(filename, tempName) : tempName + ".mp4";
    const downloadPath = resolve(destination || __dirname, tempFile);
    const destPath = resolve(destination || __dirname, filename || tempName + ".mp4");

    const thumbnail = thumbnailUrl
      ? await downloadImageFromUrl(thumbnailUrl, getFileNameWithoutExtension(filename || tempFile), DEFAULT_FOLDERS.download, destination)
      : "";

    let settings;
    try {
      settings = getSetting();
    } catch (error) {
      console.warn("[VideoDownloader] Failed to get settings:", error);
      settings = {};
    }

    console.log("[VideoDownloader] ffmpegPath: ", this.ffmpegPath);
    console.log("[VideoDownloader] --> tempPath: " + downloadPath);
    console.log("[VideoDownloader] --> destPath: " + destPath);

    const args = [cleanDownloadUrl(url), ...quality, "-o", downloadPath, "--ffmpeg-location", this.ffmpegPath];

    if (settings?.externalResourceMode === "2") {
      args.push("-f", "bv*[height<=480]+ba/b[height<=480] / wv*+ba/w");
    }

    this.applyCookies(this.getAgent(args));

    console.log("[VideoDownloader] --> args: ", args);

    const dl = ytdlpStatic.exec(args, undefined, signal);
    const downloadRegex = /\s*([\s\S]*%)\s*of\s*([\s\S]*)\s*at\s*([\s\S]*s)\s*ETA\s*([\s\S]*)\s*/;
    const mergeRegex = /Merging formats into "([\s\S]*)"/;
    let mergeFile = "";
    let isAborted = false;

    dl
      .on("ytDlpEvent", (eventType: string, eventData: string) => {
        if (eventType === "Merger") {
          const match = eventData.match(mergeRegex);
          if (match) {
            mergeFile = match[1];
          }
        }
        if (eventType === "download") {
          const match = eventData.match(downloadRegex);
          if (match) {
            const progress = match[1];
            const totalSize = match[2];
            const downloadSpeed = match[3];
            const eta = match[4];
            isFunction(onProgress) &&
              onProgress({
                percent: Number(progress.replace("%", "")),
                downloadSpeed,
                totalSize,
                eta,
              });
          }
        } else {
          isFunction(onProgress) &&
            onProgress({
              statusText: "Transcoding...",
            });
        }
      })
      .on("error", (error: any) => {
        if (isAborted) {
          return;
        }
        console.error(`${url} retrieve failed:`, error);
        isFunction(onError) && onError(error);
        sendMainWindowError({
          error,
          data: {
            title: "Failed to retrieve media file",
            body: filename,
          },
          notification: true
        });
      })
      .on("abort", (code) => {
        const title = "Media processing has been interrupted. ";
        isAborted = true;
        console.log(title + "pid: " + code);
        sendMainWindowError({
          error: title,
          data: {
            title,
            body: filename,
          }
        });
        isFunction(onError) && onError(new Error(title));
      })
      .on("close", (code) => {
        if (isAborted) {
          return;
        }
        console.log("[VideoDownloader] all done, code:", code);

        if (mergeFile) {
          console.log(`[VideoDownloader] rename merged file
${mergeFile}
-->
${destPath}`);
          compareAndRenameFiles(mergeFile, destPath);
        } else {
          console.log(`[VideoDownloader] rename file
${downloadPath}
-->
${destPath}`);
          compareAndRenameFiles(downloadPath, destPath);
        }
        isFunction(onCompleted) && onCompleted([destPath], [thumbnail]);
      });
  }

  cancel(): void {
    this.controller?.abort();
  }

  private applyCookies(args: string[]): string[] {
    try {
      const settings = getSetting("externalResourceCookies");

      if (settings) {
        args.push("--cookies-from-browser", "chrome");
      }
    } catch (error) {
      console.warn("[VideoDownloader] Failed to apply cookies:", error);
    }

    return args;
  }

  private getAgent(args: string[]): string[] {
    try {
      const agent = getHttpProxy();
      if (agent instanceof HttpsProxyAgent) {
        // 使用公共方法获取代理URL
        const proxyUrl = (agent as any).proxy?.href || (agent as any).proxy?.toString();
        if (proxyUrl) {
          args.push("--proxy", proxyUrl, "--socket-timeout", "60");
        }
      } else if (agent instanceof SocksProxyAgent) {
        // 使用公共方法获取代理信息
        const proxyInfo = (agent as any).proxy;
        if (proxyInfo?.host && proxyInfo?.port) {
          args.push("--proxy", `socks://${proxyInfo.host}:${proxyInfo.port}`, "--socket-timeout", "60");
        }
      }
    } catch (error) {
      console.warn("[VideoDownloader] Failed to get proxy agent:", error);
    }

    return args;
  }
}

// 获取视频信息的函数
export async function getVideoInfo(url: string, timeoutMs: number = 30000): Promise<VideoInfo> {
  console.log("[VideoDownloader] Starting info fetch for:", url);

  const args = [cleanDownloadUrl(url), "--prefer-free-formats"];
  const downloader = new VideoDownloader();
  
  // 应用cookies和代理设置
  try {
    downloader['applyCookies'](downloader['getAgent'](args));
  } catch (error) {
    console.warn("[VideoDownloader] Failed to apply cookies/proxy:", error);
  }

  const controller = new AbortController();
  const signal = controller.signal;
  let timeoutError: Error | undefined;

  const timeoutId = setTimeout(() => {
    timeoutError = new Error(`Request timed out after ${timeoutMs}ms`);
    controller.abort();
  }, timeoutMs);

  try {
    const info: VideoInfo = await ytdlpStatic.getVideoInfo(args, signal);

    if (info instanceof Error) {
      if (timeoutError) {
        console.error(timeoutError.message || timeoutError);
        throw timeoutError.message || timeoutError;
      }

      console.error(info.message || info);
      throw info.message || info;
    }

    return info;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error("[VideoDownloader] Error fetching info:", errorMessage);

    if (signal.aborted) {
      throw new Error(`Operation aborted: ${timeoutError?.message || errorMessage}`);
    }
    throw new Error(`Failed to fetch video info: ${errorMessage}`);

  } finally {
    timeoutError = undefined;
    clearTimeout(timeoutId);
  }
}

// 获取缩略图的函数
export async function getThumbnail(url: string): Promise<string> {
  const args = [cleanDownloadUrl(url)];
  const downloader = new VideoDownloader();
  
  try {
    downloader['applyCookies'](downloader['getAgent'](args));
  } catch (error) {
    console.warn("[VideoDownloader] Failed to apply cookies/proxy for thumbnail:", error);
  }

  return ytdlpStatic.getThumbnail(args);
}

// 创建全局下载管理器实例
export const downloadManager = new DownloadManager();