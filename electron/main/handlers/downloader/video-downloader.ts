import fs from 'node:fs';
import http from 'node:http';
import https from 'node:https';
import path from 'node:path';
import { resolve } from 'node:path';

import { app, BrowserWindow } from 'electron';
import { HttpsProxyAgent } from 'https-proxy-agent';
import { SocksProxyAgent } from 'socks-proxy-agent';

import pkg from '../../../../package.json';
import ytdlpStatic from '../../../../packages/common/libs/ytdlp-static';
import { ResourcesRepo, WorkspacesRepo } from '../../db/repositories';
import { binPathLog } from '../../logger';
import { getResourcePath } from '../../utils/resources-path';
import { generateThumbnailForResource } from '../../utils/thumbnail';
import { getHttpProxy as getSystemHttpProxy } from '../proxy/proxy';
import { ensureDailyFolder } from '../resource';
import { getCurrentBinaryPath } from '../ytdlp/updater';
import { cookieManager } from './cookie-manager';

// 默认文件夹配置
const DEFAULT_FOLDERS = {
  download: './downloads'
};

/**
 * 获取 Node.js 可执行文件路径
 * 在开发环境中使用系统 Node.js，在生产环境中使用打包的 Node.js
 */
function getNodeJsPath(): string {
  // 方法 1: 尝试使用 process.execPath (Electron 环境)
  // 在开发环境中，这会指向 electron.exe，我们需要找到真正的 node.exe

  if (app.isPackaged) {
    // 生产环境：使用打包的 node.exe
    // Electron 打包后，node.exe 位于 resources 目录
    const resourcesPath = process.resourcesPath;
    const possiblePaths = [
      path.join(resourcesPath, 'node.exe'), // Windows
      path.join(resourcesPath, 'node'), // macOS/Linux
      path.join(path.dirname(process.execPath), 'node.exe'), // Windows fallback
      path.join(path.dirname(process.execPath), 'node') // macOS/Linux fallback
    ];

    for (const nodePath of possiblePaths) {
      if (fs.existsSync(nodePath)) {
        console.log('[VideoDownloader] Found Node.js in production:', nodePath);
        return nodePath;
      }
    }
  }

  // 开发环境：使用系统 Node.js
  // process.execPath 在开发时指向 electron，但 Electron 内部使用系统 Node.js
  const isWindows = process.platform === 'win32';

  if (isWindows) {
    // Windows: 使用系统 PATH 中的 node
    // 先尝试直接返回 'node'，让系统在 PATH 中查找
    console.log('[VideoDownloader] Using Node.js from system PATH: node');
    return 'node';
  } else {
    // macOS/Linux: 使用系统 node
    console.log('[VideoDownloader] Using Node.js from system PATH: node');
    return 'node';
  }
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

/**
 * 清理文件名，移除或替换系统不支持的特殊字符
 * Windows 不支持的字符: < > : " / \ | ? *
 * 同时移除控制字符和其他不可见字符
 */
function sanitizeFilename(filename: string): string {
  if (!filename) return filename;

  // 移除或替换不支持的字符
  let cleaned = filename
    // 替换 Windows 不支持的特殊字符
    .replace(/[<>:"/\\|?*]/g, '_')
    // 不允许以点开头
    .replace(/^\.+/, '_')
    // 移除末尾的点
    .replace(/\.+$/, '')
    // 将多个空格替换为单个空格
    .replace(/\s+/g, ' ')
    // 移除首尾空格
    .trim();

  // 移除控制字符 (0x00-0x1F) 和部分扩展 ASCII (0x80-0x9F)
  cleaned = cleaned
    .split('')
    .filter((char) => {
      const code = char.charCodeAt(0);
      return !(code < 32 || (code >= 128 && code <= 159));
    })
    .join('');

  // 限制文件名长度（大多数文件系统限制为 255 字符）
  return cleaned.substring(0, 255);
}

function generateUUID(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

async function downloadImageFromUrl(url: string, filename: string, folder: string, destination?: string): Promise<string> {
  try {
    if (!url || !filename) {
      console.warn('[VideoDownloader] Invalid URL or filename for image download');
      return '';
    }

    const actualDestination = destination || process.cwd();
    const thumbnailsDir = path.join(actualDestination, '.thumbs');

    // 确保缩略图目录存在
    if (!fs.existsSync(thumbnailsDir)) {
      fs.mkdirSync(thumbnailsDir, { recursive: true });
    }

    // 确定文件扩展名
    const urlPath = new URL(url).pathname;
    const urlExt = path.extname(urlPath).toLowerCase();
    const validExts = ['.jpg', '.jpeg', '.png', '.gif', '.webp'];
    const ext = validExts.includes(urlExt) ? urlExt : '.jpg';

    const thumbnailFilename = `${filename}.png`;
    const thumbnailPath = path.join(thumbnailsDir, thumbnailFilename);

    // 如果文件已存在，直接返回路径
    if (fs.existsSync(thumbnailPath)) {
      console.log(`[VideoDownloader] Thumbnail already exists: ${thumbnailPath}`);
      return thumbnailPath;
    }

    return new Promise((resolve, reject) => {
      const client = url.startsWith('https:') ? https : http;

      const request = client.get(url, (response) => {
        if (response.statusCode !== 200) {
          reject(new Error(`HTTP ${response.statusCode}: ${response.statusMessage}`));
          return;
        }

        const contentType = response.headers['content-type'];
        if (!contentType || !contentType.startsWith('image/')) {
          reject(new Error(`Invalid content type: ${contentType}`));
          return;
        }

        const fileStream = fs.createWriteStream(thumbnailPath);
        response.pipe(fileStream);

        fileStream.on('finish', () => {
          fileStream.close();
          console.log(`[VideoDownloader] Downloaded thumbnail: ${thumbnailPath}`);
          resolve(thumbnailPath);
        });

        fileStream.on('error', (err) => {
          fs.unlink(thumbnailPath, () => { }); // 删除部分下载的文件
          reject(err);
        });
      });

      request.on('error', (err) => {
        reject(err);
      });

      request.setTimeout(30000, () => {
        request.destroy();
        reject(new Error('Download timeout'));
      });
    });
  } catch (error) {
    console.warn('[VideoDownloader] Failed to download image:', error);
    return '';
  }
}

// 使用ffmpeg生成视频封面图
async function generateVideoThumbnail(videoPath: string, filename: string, destination?: string): Promise<string> {
  try {
    if (!fs.existsSync(videoPath)) {
      console.warn('[VideoDownloader] Video file does not exist:', videoPath);
      return '';
    }

    const actualDestination = destination || process.cwd();
    const thumbnailsDir = path.join(actualDestination, '.thumbs');

    // 确保缩略图目录存在
    if (!fs.existsSync(thumbnailsDir)) {
      fs.mkdirSync(thumbnailsDir, { recursive: true });
    }

    const thumbnailFilename = `${filename}.png`;
    const thumbnailPath = path.join(thumbnailsDir, thumbnailFilename);

    // 如果文件已存在，直接返回路径
    if (fs.existsSync(thumbnailPath)) {
      console.log(`[VideoDownloader] Thumbnail already exists: ${thumbnailPath}`);
      return thumbnailPath;
    }

    // 使用现有的generateThumbnailForResource函数生成缩略图
    const thumbnailBuffer = await generateThumbnailForResource({ filePath: videoPath, type: 'video', title: filename }, { size: 512, frameAtSeconds: 1.0 });

    if (thumbnailBuffer) {
      fs.writeFileSync(thumbnailPath, thumbnailBuffer);
      console.log(`[VideoDownloader] Generated thumbnail: ${thumbnailPath}`);
      return thumbnailPath;
    }

    return '';
  } catch (error) {
    console.warn('[VideoDownloader] Failed to generate video thumbnail:', error);
    return '';
  }
}

// 获取当前工作空间的资源文件夹路径
async function getCurrentWorkspaceResourcePath(): Promise<string> {
  try {
    const workspace = await WorkspacesRepo.getDefault();
    if (workspace && workspace.rootPath) {
      const resourcePath = path.join(workspace.rootPath, 'resources');
      // 确保目录存在
      if (!fs.existsSync(resourcePath)) {
        fs.mkdirSync(resourcePath, { recursive: true });
      }
      return resourcePath;
    }
  } catch (error) {
    console.warn('[VideoDownloader] Failed to get workspace resource path:', error);
  }

  // 如果获取工作空间失败，回退到默认下载目录
  const fallbackPath = path.join(process.cwd(), DEFAULT_FOLDERS.download);
  if (!fs.existsSync(fallbackPath)) {
    fs.mkdirSync(fallbackPath, { recursive: true });
  }
  return fallbackPath;
}

// 将下载的文件添加到资源数据库
async function addDownloadedFileToResources(filePath: string, videoInfo: any, workspaceId?: string, thumbnailPath?: string, folderId?: string): Promise<any> {
  try {
    const stats = fs.statSync(filePath);
    const filename = path.basename(filePath);
    const ext = path.extname(filePath).toLowerCase();

    // 确定文件类型
    let type = 'video';
    if (['.mp3', '.wav', '.flac', '.aac'].includes(ext)) {
      type = 'audio';
    } else if (['.jpg', '.jpeg', '.png', '.gif', '.webp'].includes(ext)) {
      type = 'image';
    }

    // 获取当前工作空间ID
    let currentWorkspaceId = workspaceId;
    if (!currentWorkspaceId) {
      const workspace = await WorkspacesRepo.getDefault();
      currentWorkspaceId = workspace?.id;
    }

    // 添加到资源数据库
    const resource = await ResourcesRepo.upsert({
      type,
      title: videoInfo?.title || filename,
      description: videoInfo?.description || '',
      url: videoInfo?.webpage_url || '',
      domain: videoInfo?.extractor || '',
      sourceName: videoInfo?.uploader || '',
      authorName: videoInfo?.uploader || '',
      filePath,
      sizeBytes: stats.size,
      durationMs: videoInfo?.duration ? Math.round(videoInfo.duration * 1000) : undefined,
      width: videoInfo?.width || undefined,
      height: videoInfo?.height || undefined,
      mimeType: videoInfo?.mime_type || undefined,
      thumbnailPath: thumbnailPath || undefined,
      workspaceId: currentWorkspaceId,
      folderId: folderId || undefined,
      collectedAt: Date.now()
    } as any);

    console.log(`[VideoDownloader] Added file to resources: ${filePath}`);
    // Broadcast insert event so resource page can refresh
    try {
      const payload = { action: 'inserted', id: (resource as any)?.id, resource };
      BrowserWindow.getAllWindows().forEach((w) => {
        try {
          w.webContents.send('resource:inserted', payload);
          w.webContents.send('resource:changed', payload);
        } catch {
          /* ignore */
        }
      });
    } catch {
      /* ignore */
    }
    return resource;
  } catch (error) {
    console.warn('[VideoDownloader] Failed to add file to resources:', error);
    return null;
  }
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

function getHttpProxy(): HttpsProxyAgent<string> | SocksProxyAgent | undefined {
  // 使用系统的代理功能
  return getSystemHttpProxy();
}

// 外部资源设置存储
type ExternalResourceSettings = {
  externalResourceMode: string;
  externalResourceCookies: boolean;
  preferredBrowser: string;
  // EJS 配置
  ejsRemoteComponents?: 'github' | 'npm' | 'none'; // EJS 远程组件来源，none 表示使用内置
  ejsJsRuntime?: 'deno' | 'node' | 'bun' | 'quickjs' | 'auto'; // JavaScript 运行时，auto 表示自动检测
};

const SETTINGS_DIR = path.join(app.getPath('userData'), 'data');
const SETTINGS_FILE = path.join(SETTINGS_DIR, 'external-resource-settings.json');
// yt-dlp 配置文件路径（标准格式）
export const YTDLP_CONFIG_FILE = path.join(SETTINGS_DIR, 'yt-dlp.conf');

function ensureSettingsDir(): void {
  if (!fs.existsSync(SETTINGS_DIR)) {
    fs.mkdirSync(SETTINGS_DIR, { recursive: true });
  }
}

function readSettings(): ExternalResourceSettings {
  ensureSettingsDir();
  const defaultSettings: ExternalResourceSettings = {
    externalResourceMode: '1',
    externalResourceCookies: false,
    preferredBrowser: 'chrome',
    // EJS 默认配置：使用 npm 远程组件，使用 Node.js (Electron 内置)
    ejsRemoteComponents: 'npm',
    ejsJsRuntime: 'node'
  };

  // 如果配置文件不存在，创建默认配置
  if (!fs.existsSync(SETTINGS_FILE)) {
    writeSettings(defaultSettings);
    return defaultSettings;
  }

  try {
    const content = fs.readFileSync(SETTINGS_FILE, 'utf8');
    const settings = JSON.parse(content);
    const mergedSettings = { ...defaultSettings, ...settings };

    // 如果 yt-dlp 配置文件不存在，从 JSON 设置生成
    if (!fs.existsSync(YTDLP_CONFIG_FILE)) {
      writeYtDlpConfig(mergedSettings);
    }

    return mergedSettings;
  } catch (error) {
    console.warn('[VideoDownloader] Failed to read settings, using defaults:', error);
    return defaultSettings;
  }
}

/**
 * 将设置转换为 yt-dlp 配置文件格式
 * 参考：https://github.com/yt-dlp/yt-dlp?tab=readme-ov-file#configuration
 *
 * 注意：Cookie 配置不在配置文件中，因为需要动态处理浏览器回退逻辑
 */
function generateYtDlpConfig(settings: ExternalResourceSettings): string {
  const lines: string[] = [];

  // 添加文件头注释
  lines.push('# yt-dlp configuration file');
  lines.push('# Generated automatically by ' + pkg.name + '');
  lines.push('# This file is managed by the application settings');
  lines.push('# Manual edits may be overwritten');
  lines.push('');

  // EJS 远程组件配置
  if (settings.ejsRemoteComponents && settings.ejsRemoteComponents !== 'none') {
    lines.push('# EJS remote components');
    lines.push(`--remote-components ejs:${settings.ejsRemoteComponents}`);
    lines.push('');
  }

  // EJS JavaScript 运行时配置
  // 优先使用 Node.js（系统或 Electron 内置），避免要求用户安装 Deno
  if (settings.ejsJsRuntime && settings.ejsJsRuntime !== 'auto') {
    lines.push('# EJS JavaScript runtime');
    if (settings.ejsJsRuntime === 'node') {
      // 使用系统 Node.js 或 Electron 内置的 Node.js
      const nodePath = getNodeJsPath();
      lines.push(`--js-runtimes node:${nodePath}`);
    } else {
      lines.push(`--js-runtimes ${settings.ejsJsRuntime}`);
    }
    lines.push('');
  } else {
    // 如果是 auto，强制使用 Node.js 以避免查找 Deno
    lines.push('# EJS JavaScript runtime (using Node.js)');
    const nodePath = getNodeJsPath();
    lines.push(`--js-runtimes node:${nodePath}`);
    lines.push('');
  }

  // 下载质量模式
  // 根据 externalResourceMode 设置不同的格式选择器
  // 参考: https://github.com/yt-dlp/yt-dlp#format-selection
  const formatSelectors: Record<string, { comment: string; format: string }> = {
    best: {
      comment: 'Download quality: best (default)',
      format: 'bestvideo+bestaudio/best'
    },
    '1080p': {
      comment: 'Download quality: limit to 1080p',
      format: 'bv*[height<=1080]+ba/b[height<=1080]'
    },
    '720p': {
      comment: 'Download quality: limit to 720p',
      format: 'bv*[height<=720]+ba/b[height<=720]'
    },
    '480p': {
      comment: 'Download quality: limit to 480p',
      format: 'bv*[height<=480]+ba/b[height<=480] / wv*+ba/w'
    },
    audio: {
      comment: 'Download quality: audio only',
      format: 'bestaudio/best'
    }
  };

  const qualityMode = settings.externalResourceMode;
  if (qualityMode && qualityMode !== '1' && formatSelectors[qualityMode]) {
    const selector = formatSelectors[qualityMode];
    lines.push(`# ${selector.comment}`);
    lines.push(`-f "${selector.format}"`);
    lines.push('');
  }

  // 其他常用配置
  lines.push('# Prefer free formats');
  lines.push('--prefer-free-formats');
  lines.push('');

  // // 禁用 web_safari 客户端以避免 m3u8 格式的 403 错误
  // // 参考: https://github.com/yt-dlp/yt-dlp/issues/15569
  // lines.push('# Disable web_safari client to avoid m3u8 403 errors');
  // lines.push('--extractor-args "youtube:player_client=default,-web_safari"');
  // lines.push('');

  // // 添加重要的 HTTP 头部来避免 403 错误
  // lines.push('# User-Agent to avoid 403 errors');
  // lines.push('--user-agent "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"');
  // lines.push('');

  // // 添加 Referer 头部
  // lines.push('# Referer header');
  // lines.push('--referer "https://www.youtube.com/"');
  // lines.push('');

  // // 添加重试和超时配置
  // lines.push('# Retry and timeout settings');
  // lines.push('--retries 10');
  // lines.push('--fragment-retries 10');
  // lines.push('--socket-timeout 30');
  // lines.push('');

  // // 添加速率限制来避免被封禁
  // lines.push('# Rate limiting to avoid bans');
  // lines.push('--sleep-requests 1');
  // lines.push('--sleep-interval 0.5');

  return lines.join('\n');
}

/**
 * 写入 yt-dlp 配置文件
 */
function writeYtDlpConfig(settings: ExternalResourceSettings): void {
  ensureSettingsDir();
  try {
    const configContent = generateYtDlpConfig(settings);
    fs.writeFileSync(YTDLP_CONFIG_FILE, configContent, 'utf8');
    console.log('[VideoDownloader] yt-dlp config file written:', YTDLP_CONFIG_FILE);
  } catch (error) {
    console.warn('[VideoDownloader] Failed to write yt-dlp config:', error);
  }
}

function writeSettings(settings: ExternalResourceSettings): void {
  ensureSettingsDir();
  try {
    // 同时写入 JSON 文件（用于 UI 读取）和 yt-dlp 配置文件
    fs.writeFileSync(SETTINGS_FILE, JSON.stringify(settings, null, 2), 'utf8');
    writeYtDlpConfig(settings);
  } catch (error) {
    console.warn('[VideoDownloader] Failed to write settings:', error);
  }
}

export function getSetting(key?: string): ExternalResourceSettings | any {
  const settings = readSettings();
  return key ? settings[key as keyof ExternalResourceSettings] : settings;
}

export function setSetting(key: keyof ExternalResourceSettings, value: any): void {
  const settings = readSettings();
  // @ts-ignore
  settings[key] = value;
  writeSettings(settings);
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
  videoInfo?: any; // 视频信息，用于添加到资源数据库
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
  automatic_captions?: Record<
    string,
    {
      ext: string;
      url: string;
      protocol?: string;
      name?: string;
    }[]
  >;
  subtitles: Record<
    string,
    {
      ext: string;
      url: string;
      name: string;
    }[]
  >;
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

// 视频下载器类
export class VideoDownloader implements Downloader {
  private controller?: AbortController;
  private ffmpegPath: string;
  private ytdlPath: string;

  constructor() {
    this.ffmpegPath = getResourcePath('ffmpeg')!;
    // 使用 updater 中的函数获取正确的 yt-dlp 路径
    this.ytdlPath = getCurrentBinaryPath();

    binPathLog(this.ffmpegPath, 'ffmpeg');
    binPathLog(this.ytdlPath, 'yt-dlp');

    ytdlpStatic.setBinaryPath(this.ytdlPath);
  }

  async download(options: DownloadOptions): Promise<void> {
    this.controller = new AbortController();
    const { signal } = this.controller;

    const { url, filename, destination, thumbnailUrl, videoInfo, onProgress, onError, onCompleted } = options;

    // 获取当前工作空间的资源文件夹路径
    let workspaceResourcePath = await getCurrentWorkspaceResourcePath();
    let dailyFolderId: string | undefined;

    // 如果没有指定 destination，默认使用当天的文件夹
    if (!destination) {
      try {
        const workspace = await WorkspacesRepo.getDefault();
        if (workspace?.id && workspace?.rootPath) {
          dailyFolderId = await ensureDailyFolder(workspace.id, workspace.rootPath);
          workspaceResourcePath = path.join(workspace.rootPath, 'resources', 'folders', dailyFolderId);
          // 确保目录存在
          if (!fs.existsSync(workspaceResourcePath)) {
            fs.mkdirSync(workspaceResourcePath, { recursive: true });
          }
        }
      } catch (error) {
        console.warn('[VideoDownloader] Failed to get daily folder, using default resource path:', error);
      }
    }

    const actualDestination = destination || workspaceResourcePath;

    const quality: string[] = [];
    const tempName = DEFAULT_FOLDERS.download + '_' + generateUUID();
    // 清理文件名，移除系统不支持的特殊字符
    const sanitizedFilename = filename ? sanitizeFilename(filename) : undefined;
    const tempFile = sanitizedFilename ? changeFileName(sanitizedFilename, tempName) : tempName + '.mp4';
    const downloadPath = resolve(actualDestination, tempFile);
    const destPath = resolve(actualDestination, (sanitizedFilename || tempName) + '.mp4');

    // 保存thumbnailUrl供后续使用
    const videoThumbnailUrl = thumbnailUrl;

    console.log(`
=============== VideoDownloader =============================
--- options -------------------------------------------------
url: ${url}
filename: ${filename}
destination: ${destination}
thumbnailUrl: ${thumbnailUrl}

--- paths ---------------------------------------------------
ffmpegPath: ${this.ffmpegPath}
yt-dlpPath: ${this.ytdlPath}
workspaceResourcePath: ${workspaceResourcePath}
sanitizedFilename: ${sanitizedFilename}
actualDestination: ${actualDestination}
tempFile: ${tempFile}

--- output --------------------------------------------------
downloadPath: ${downloadPath}
destPath: ${destPath}
=============================================================
      `);

    const args = [cleanDownloadUrl(url), ...quality, '-o', downloadPath, '--ffmpeg-location', this.ffmpegPath];

    // 使用 yt-dlp 配置文件（如果存在）
    if (fs.existsSync(YTDLP_CONFIG_FILE)) {
      args.push('--config-location', YTDLP_CONFIG_FILE);
      console.log('[VideoDownloader] Using yt-dlp config file:', YTDLP_CONFIG_FILE);
    } else {
      // 如果配置文件不存在，使用代码中的配置作为后备
      this.applyEjsConfig(args);
    }

    // 注意：配置文件中的选项会被自动应用，但命令行参数会覆盖配置文件
    // Cookie 和代理等动态配置仍然需要在参数中添加
    await this.applyCookies(this.getAgent(args));

    console.log('[VideoDownloader] --> args: ', args);

    console.log(args.join(' '));

    const dl = ytdlpStatic.exec(args, undefined, signal);
    const downloadRegex = /\s*([\s\S]*%)\s*of\s*([\s\S]*)\s*at\s*([\s\S]*s)\s*ETA\s*([\s\S]*)\s*/;
    const mergeRegex = /Merging formats into "([\s\S]*)"/;
    let mergeFile = '';
    let isAborted = false;

    dl.on('ytDlpEvent', (eventType: string, eventData: string) => {
      console.log(eventData);

      if (eventType === 'Merger') {
        const match = eventData.match(mergeRegex);
        if (match) {
          mergeFile = match[1];
        }
      }
      if (eventType === 'download') {
        const match = eventData.match(downloadRegex);
        if (match) {
          const progress = match[1];
          const totalSize = match[2];
          const downloadSpeed = match[3];
          const eta = match[4];
          isFunction(onProgress) &&
            onProgress({
              percent: Number(progress.replace('%', '')),
              downloadSpeed,
              totalSize,
              eta
            });
        }
      } else {
        isFunction(onProgress) &&
          onProgress({
            statusText: 'Transcoding...'
          });
      }
    })
      .on('error', (error: any) => {
        if (isAborted) {
          return;
        }
        console.error(`${url} retrieve failed:`, error);
        isFunction(onError) && onError(error);
        sendMainWindowError({
          error,
          data: {
            title: 'Failed to retrieve media file',
            body: filename
          },
          notification: true
        });
      })
      .on('abort', (code) => {
        const title = 'Media processing has been interrupted. ';
        isAborted = true;
        console.log(title + 'pid: ' + code);
        sendMainWindowError({
          error: title,
          data: {
            title,
            body: filename
          }
        });
        isFunction(onError) && onError(new Error(title));
      })
      .on('close', async (code) => {
        if (isAborted) {
          return;
        }
        console.log('[VideoDownloader] ✅️ all done, code:', code);

        if (mergeFile) {
          if (!fs.existsSync(mergeFile)) {
            console.log('[VideoDownloader] merged file not found, try to guess the path');
            const parsedDest = path.parse(mergeFile);
            const guessPath = path.join(path.parse(downloadPath).dir, parsedDest.name + parsedDest.ext);
            console.log('guessPath:', guessPath);

            if (fs.existsSync(guessPath)) {
              mergeFile = guessPath;
            }
          }
          console.log(`
[VideoDownloader] rename merged file
${mergeFile}
-->
${destPath}
`);

          compareAndRenameFiles(mergeFile, destPath);
        } else {
          console.log(`
[VideoDownloader] rename file
${downloadPath}
-->
${destPath}
`);
          compareAndRenameFiles(downloadPath, destPath);
        }

        // 先将下载的文件添加到资源数据库（不包含缩略图路径）
        let resourceId = '';
        try {
          const workspace = await WorkspacesRepo.getDefault();
          const resource = await addDownloadedFileToResources(destPath, videoInfo, workspace?.id, undefined, dailyFolderId);
          resourceId = resource?.id || '';
        } catch (error) {
          console.warn('[VideoDownloader] Failed to add file to resources:', error);
        }

        // 处理封面图
        let finalThumbnailPath = '';

        // 如果有资源ID，尝试生成缩略图
        if (resourceId) {
          try {
            // 先尝试下载封面图
            if (videoThumbnailUrl) {
              finalThumbnailPath = await downloadImageFromUrl(videoThumbnailUrl, resourceId, DEFAULT_FOLDERS.download, actualDestination);
            }

            // 如果没有成功下载封面图，尝试使用ffmpeg生成
            if (!finalThumbnailPath) {
              finalThumbnailPath = await generateVideoThumbnail(destPath, resourceId, actualDestination);
              console.log(`[VideoDownloader] Generated thumbnail: ${finalThumbnailPath}`);
            }

            // 更新资源记录，添加缩略图路径
            if (finalThumbnailPath) {
              const updated = await ResourcesRepo.update(resourceId, { thumbnailPath: finalThumbnailPath } as any);
              console.log(`[VideoDownloader] Updated resource with thumbnail: ${finalThumbnailPath}`);
              // Broadcast change so UI can reflect new thumbnail
              try {
                const payload = { action: 'updated', id: resourceId, resource: updated };
                BrowserWindow.getAllWindows().forEach((w) => {
                  try {
                    w.webContents.send('resource:changed', payload);
                  } catch {
                    /* ignore */
                  }
                });
              } catch {
                /* ignore */
              }
            }
          } catch (error) {
            console.warn('[VideoDownloader] Failed to process thumbnail:', error);
          }
        }

        isFunction(onCompleted) && onCompleted([destPath], [finalThumbnailPath]);
      });
  }

  cancel(): void {
    this.controller?.abort();
  }

  /**
   * 应用 EJS 配置到 yt-dlp 参数
   * 根据设置添加 --remote-components 和 --js-runtimes 参数
   */
  private applyEjsConfig(args: string[]): string[] {
    try {
      const settings = getSetting();
      const remoteComponents = settings.ejsRemoteComponents || 'npm';
      const jsRuntime = settings.ejsJsRuntime || 'node';

      // 添加远程组件配置（如果启用）
      if (remoteComponents !== 'none') {
        args.push('--remote-components', `ejs:${remoteComponents}`);
        console.log(`[VideoDownloader] EJS remote components: ${remoteComponents}`);
      }

      // 添加 JavaScript 运行时配置
      // 优先使用 Node.js（系统或内置），避免要求用户安装 Deno
      if (jsRuntime === 'node') {
        // 使用系统 Node.js 或内置的 Node.js
        const nodePath = getNodeJsPath();
        args.push('--js-runtimes', `node:${nodePath}`);
        console.log(`[VideoDownloader] EJS JS runtime: node (${nodePath})`);
      } else if (jsRuntime !== 'auto') {
        args.push('--js-runtimes', jsRuntime);
        console.log(`[VideoDownloader] EJS JS runtime: ${jsRuntime}`);
      } else {
        // auto 模式：强制使用 Node.js 而不是让 yt-dlp 查找 Deno
        const nodePath = getNodeJsPath();
        args.push('--js-runtimes', `node:${nodePath}`);
        console.log(`[VideoDownloader] EJS JS runtime: auto -> node (${nodePath})`);
      }
    } catch (error) {
      console.warn('[VideoDownloader] Failed to apply EJS config:', error);
    }

    return args;
  }

  private async applyCookies(args: string[]): Promise<string[]> {
    try {
      const useCookies = getSetting('externalResourceCookies');

      if (useCookies) {
        // 优先使用内置的 Cookie Manager
        if (cookieManager.isLoggedIn()) {
          try {
            // 导出 cookies 到临时文件
            const cookieFile = await cookieManager.exportNetscapeCookies();
            args.push('--cookies', cookieFile);
            console.log('[VideoDownloader] Using cookies from built-in Cookie Manager');
            return args;
          } catch (error) {
            console.warn('[VideoDownloader] Failed to use Cookie Manager cookies:', error);
          }
        } else {
          console.log('[VideoDownloader] Cookie Manager: Not logged in. User should login via YouTube login window.');
        }

        // 回退方案：尝试从浏览器读取 cookies
        const preferredBrowser = getSetting('preferredBrowser');
        const browsers = [preferredBrowser, 'chrome', 'firefox', 'edge', 'safari'].filter((browser, index, arr) => arr.indexOf(browser) === index);
        let cookieApplied = false;

        for (const browser of browsers) {
          try {
            args.push('--cookies-from-browser', browser);
            cookieApplied = true;
            console.log(`[VideoDownloader] Using cookies from ${browser} browser`);
            break;
          } catch (error) {
            console.warn(`[VideoDownloader] Failed to use cookies from ${browser}:`, error);
            // 移除失败的浏览器参数
            const lastIndex = args.lastIndexOf('--cookies-from-browser');
            if (lastIndex !== -1) {
              args.splice(lastIndex, 2);
            }
          }
        }

        if (!cookieApplied) {
          console.warn('[VideoDownloader] Could not apply cookies from any source. For private/age-restricted videos, please login via YouTube login window.');
        }
      }
    } catch (error) {
      console.warn('[VideoDownloader] Failed to apply cookies:', error);
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
          args.push('--proxy', proxyUrl, '--socket-timeout', '60');
        }
      } else if (agent instanceof SocksProxyAgent) {
        // 使用公共方法获取代理信息
        const proxyInfo = (agent as any).proxy;
        if (proxyInfo?.host && proxyInfo?.port) {
          args.push('--proxy', `socks://${proxyInfo.host}:${proxyInfo.port}`, '--socket-timeout', '60');
        }
      }
    } catch (error) {
      console.warn('[VideoDownloader] Failed to get proxy agent:', error);
    }

    return args;
  }
}

// 获取视频信息的函数
export async function getVideoInfo(url: string, timeoutMs: number = 30000): Promise<VideoInfo> {
  console.log('[VideoDownloader] Starting info fetch for:', url);

  const args = [cleanDownloadUrl(url), '--prefer-free-formats', '--dump-json', '--no-playlist'];
  const downloader = new VideoDownloader();

  // 使用 yt-dlp 配置文件（如果存在）
  if (fs.existsSync(YTDLP_CONFIG_FILE)) {
    args.push('--config-location', YTDLP_CONFIG_FILE);
  } else {
    // 如果配置文件不存在，使用代码中的配置作为后备
    downloader['applyEjsConfig'](args);
  }

  // 应用动态配置（cookies 和代理）
  // 注意：Cookie 需要动态处理浏览器回退，所以仍然在代码中处理
  try {
    await downloader['applyCookies'](downloader['getAgent'](args));
  } catch (error) {
    console.warn('[VideoDownloader] Failed to apply cookies/proxy:', error);
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
    console.error('[VideoDownloader] Error fetching info:', errorMessage);

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
    await downloader['applyCookies'](downloader['getAgent'](args));
  } catch (error) {
    console.warn('[VideoDownloader] Failed to apply cookies/proxy for thumbnail:', error);
  }

  return ytdlpStatic.getThumbnail(args);
}
