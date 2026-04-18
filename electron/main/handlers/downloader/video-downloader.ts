import fs from 'node:fs';
import http from 'node:http';
import https from 'node:https';
import path from 'node:path';
import { resolve } from 'node:path';

import { app, BrowserWindow } from 'electron';

import ytdlpStatic from '../../../../packages/common/libs/ytdlp-static';
import { isUnsupportedOptionError, UnsupportedOptionError, ytdlpService } from '../../../../packages/ytdlp';
import { FoldersRepo, ResourcesRepo, WorkspacesRepo } from '../../db/repositories';
import { binPathLog } from '../../logger';
import { findUniqueFileName } from '../../utils';
import { getResourcePath } from '../../utils/resources-path';
import { detectBasicType, generateThumbnailForResource } from '../../utils/thumbnail';
import { ensureDailyFolder } from '../resource';

const DEFAULT_FOLDERS = {
  download: './downloads'
};

const QUALITY_MODE_FORMATS: Record<string, string> = {
  best: 'bestvideo+bestaudio/best',
  '1080p': 'bv*[height<=1080]+ba/b[height<=1080]',
  '720p': 'bv*[height<=720]+ba/b[height<=720]',
  '480p': 'bv*[height<=480]+ba/b[height<=480]/wv*+ba/w',
  audio: 'bestaudio/best'
};

const MEDIA_OUTPUT_EXTENSIONS = new Set(['.mp3', '.wav', '.flac', '.aac', '.m4a', '.ogg', '.opus', '.wma', '.mp4', '.mkv', '.mov', '.webm', '.avi', '.ogv']);

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

function normalizeQualityMode(qualityMode?: string, quality?: number | string): string | undefined {
  const raw = qualityMode ?? quality;

  if (typeof raw === 'number') {
    if (raw <= 1) return 'best';
    if (raw === 2) return '720p';
    if (raw >= 3) return 'audio';
    return undefined;
  }

  if (typeof raw !== 'string') {
    return undefined;
  }

  const normalized = raw.trim().toLowerCase();
  if (!normalized) {
    return undefined;
  }

  if (normalized === '1') return 'best';
  if (normalized === '2') return '720p';
  if (normalized === '3') return 'audio';

  return QUALITY_MODE_FORMATS[normalized] ? normalized : undefined;
}

function buildQualityArgs(qualityMode?: string, quality?: number | string): string[] {
  const resolvedQualityMode = normalizeQualityMode(qualityMode, quality);
  const formatSelector = resolvedQualityMode ? QUALITY_MODE_FORMATS[resolvedQualityMode] : undefined;
  const args = formatSelector ? ['--format', formatSelector] : [];

  if (resolvedQualityMode === 'audio') {
    args.push('--extract-audio', '--audio-format', 'mp3', '--audio-quality', '0');
  }

  return args;
}

function areSamePath(a: string, b: string): boolean {
  const resolvedA = path.resolve(a);
  const resolvedB = path.resolve(b);
  return process.platform === 'win32' ? resolvedA.toLowerCase() === resolvedB.toLowerCase() : resolvedA === resolvedB;
}

function extractDestinationPath(eventData: string): string | undefined {
  const match = eventData.trim().match(/^Destination:\s+(.+)$/);
  if (!match) return undefined;

  const candidate = match[1].trim();
  if (!candidate) return undefined;

  if (candidate.startsWith('"') && candidate.endsWith('"')) {
    return candidate.slice(1, -1);
  }

  return candidate;
}

function appendReportedOutputPath(paths: string[], candidate?: string): void {
  if (!candidate) return;
  if (!paths.includes(candidate)) {
    paths.push(candidate);
  }
}

function findFallbackDownloadedOutputs(directory: string, baseName: string): string[] {
  try {
    return fs
      .readdirSync(directory)
      .filter((entry) => entry.startsWith(`${baseName}.`))
      .filter((entry) => {
        const lower = entry.toLowerCase();
        return !lower.endsWith('.part') && !lower.endsWith('.ytdl');
      })
      .filter((entry) => MEDIA_OUTPUT_EXTENSIONS.has(path.extname(entry).toLowerCase()))
      .map((entry) => path.join(directory, entry))
      .sort((a, b) => {
        try {
          return fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs;
        } catch {
          return 0;
        }
      });
  } catch {
    return [];
  }
}

function resolveDownloadedOutputPath(options: { mergeFile?: string; actualDestination: string; tempName: string; reportedOutputPaths: string[] }): string | undefined {
  const { mergeFile, actualDestination, tempName, reportedOutputPaths } = options;

  if (mergeFile && fs.existsSync(mergeFile)) {
    return mergeFile;
  }

  for (let index = reportedOutputPaths.length - 1; index >= 0; index--) {
    const candidate = reportedOutputPaths[index];
    if (candidate && fs.existsSync(candidate)) {
      return candidate;
    }
  }

  return findFallbackDownloadedOutputs(actualDestination, tempName)[0];
}

function moveDownloadedFile(source: string, destination: string): string {
  if (!fs.existsSync(source)) {
    return source;
  }

  if (areSamePath(source, destination)) {
    return source;
  }

  const uniqueDestination = findUniqueFileName(destination);

  try {
    fs.renameSync(source, uniqueDestination);
    return uniqueDestination;
  } catch (error) {
    console.error('[VideoDownloader] Failed to rename file:', error);
    return source;
  }
}

// Windows 保留文件名（设备名等），不区分大小写
const WINDOWS_RESERVED_NAMES = new Set([
  'con',
  'prn',
  'aux',
  'nul',
  'com1',
  'com2',
  'com3',
  'com4',
  'com5',
  'com6',
  'com7',
  'com8',
  'com9',
  'lpt1',
  'lpt2',
  'lpt3',
  'lpt4',
  'lpt5',
  'lpt6',
  'lpt7',
  'lpt8',
  'lpt9'
]);

/**
 * 清理文件名，移除或替换系统不支持的特殊字符（跨平台：Windows / Linux / macOS）
 *
 * 规则取最严格（Windows），保证三端均可安全存储：
 * - 非法字符: < > : " / \ | ? *（Windows 禁止；Linux 仅禁止 /；macOS 禁止 / 和 :）
 * - 控制字符: 0x00-0x1F、0x7F(DEL)、0x80-0x9F（三端均不允许 NUL 等）
 * - 末尾不能为空格或点（Windows 禁止；在 Linux/macOS 去掉也无害）
 * - 保留名仅 Windows 检查（CON、PRN、AUX、NUL、COM1-9、LPT1-9）
 */
function sanitizeFilename(filename: string): string {
  if (!filename) return filename;

  const ext = path.extname(filename);
  const base = ext ? filename.slice(0, -ext.length) : filename;

  let cleaned = base
    .replace(/[<>:"/\\|?*]/g, '_')
    .replace(/^\.+/, '_')
    .replace(/\s+/g, ' ')
    .trim();

  cleaned = cleaned
    .split('')
    .filter((char) => {
      const code = char.charCodeAt(0);
      return !(code < 32 || code === 127 || (code >= 128 && code <= 159));
    })
    .join('');

  // 末尾不能是空格或点（Windows 禁止；Linux/macOS 去掉也可避免兼容性问题）
  cleaned = cleaned.replace(/[\s.]+$/g, '');

  // 限制文件名长度（多数文件系统 255）
  cleaned = cleaned.substring(0, 255);

  // 若清理后为空则用默认名；仅 Windows 检查保留设备名
  if (!cleaned) return 'video';
  const lower = cleaned.toLowerCase();
  if (process.platform === 'win32' && WINDOWS_RESERVED_NAMES.has(lower)) {
    return '_' + cleaned;
  }

  return cleaned;
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

    if (!fs.existsSync(thumbnailsDir)) {
      fs.mkdirSync(thumbnailsDir, { recursive: true });
    }

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
          fs.unlink(thumbnailPath, () => { });
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

async function generateMediaThumbnail(filePath: string, filename: string, destination?: string): Promise<string> {
  try {
    if (!fs.existsSync(filePath)) {
      console.warn('[VideoDownloader] Media file does not exist:', filePath);
      return '';
    }

    const actualDestination = destination || process.cwd();
    const thumbnailsDir = path.join(actualDestination, '.thumbs');

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

    const thumbnailBuffer = await generateThumbnailForResource({ filePath, title: filename }, { size: 512, frameAtSeconds: 1.0 });

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

  const fallbackPath = path.join(process.cwd(), DEFAULT_FOLDERS.download);
  if (!fs.existsSync(fallbackPath)) {
    fs.mkdirSync(fallbackPath, { recursive: true });
  }
  return fallbackPath;
}

// 将下载的文件添加到资源数据库
async function resolveDownloadTarget(folderId?: string): Promise<{
  destinationPath: string;
  workspaceId?: string;
  folderId?: string;
}> {
  if (folderId) {
    try {
      const folder = await FoldersRepo.getById(folderId);
      if (folder?.workspaceId) {
        const workspace = await WorkspacesRepo.getById(folder.workspaceId);
        if (workspace?.rootPath) {
          const folderPath = path.join(workspace.rootPath, 'resources', 'folders', folderId);
          if (!fs.existsSync(folderPath)) {
            fs.mkdirSync(folderPath, { recursive: true });
          }
          return {
            destinationPath: folderPath,
            workspaceId: workspace.id,
            folderId
          };
        }
      }
    } catch (error) {
      console.warn('[VideoDownloader] Failed to resolve target folder, falling back to default path:', error);
    }
  }

  let workspaceResourcePath = await getCurrentWorkspaceResourcePath();
  let dailyFolderId: string | undefined;
  let workspaceId: string | undefined;

  try {
    const workspace = await WorkspacesRepo.getDefault();
    if (workspace?.id && workspace?.rootPath) {
      workspaceId = workspace.id;
      dailyFolderId = await ensureDailyFolder(workspace.id, workspace.rootPath);
      workspaceResourcePath = path.join(workspace.rootPath, 'resources', 'folders', dailyFolderId);
      if (!fs.existsSync(workspaceResourcePath)) {
        fs.mkdirSync(workspaceResourcePath, { recursive: true });
      }
    }
  } catch (error) {
    console.warn('[VideoDownloader] Failed to resolve daily folder, using default resource path:', error);
  }

  return {
    destinationPath: workspaceResourcePath,
    workspaceId,
    folderId: dailyFolderId
  };
}

async function addDownloadedFileToResources(
  filePath: string,
  videoInfo: any,
  workspaceId?: string,
  thumbnailPath?: string,
  folderId?: string,
  options?: {
    parentResourceId?: string;
    metadata?: Record<string, unknown>;
    qualityMode?: string;
  }
): Promise<any> {
  try {
    const stats = fs.statSync(filePath);
    const filename = path.basename(filePath);
    const detected = detectBasicType(filePath);
    const type = options?.qualityMode === 'audio' ? 'audio' : detected.type === 'file' ? 'video' : detected.type;

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
      width: type === 'audio' ? undefined : videoInfo?.width || undefined,
      height: type === 'audio' ? undefined : videoInfo?.height || undefined,
      mimeType: type === 'audio' ? detected.mimeType || videoInfo?.mime_type || undefined : videoInfo?.mime_type || detected.mimeType || undefined,
      thumbnailPath: thumbnailPath || undefined,
      workspaceId: currentWorkspaceId,
      folderId: folderId || undefined,
      parentResourceId: options?.parentResourceId || undefined,
      metadata: options?.metadata ? JSON.stringify(options.metadata) : undefined,
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
  quality?: number | string;
  qualityMode?: string;
  folderId?: string;
  parentResourceId?: string;
  metadata?: Record<string, unknown>;
  videoInfo?: any;
  onProgress?: (progress: DownloadProgress) => void;
  onError?: (error: Error) => void;
  onCompleted?: (result: DownloadCompletionResult) => void;
}

// 下载进度接口
export interface DownloadProgress {
  percent?: number;
  totalSize?: string;
  downloadSpeed?: string;
  eta?: string;
  statusText?: string;
}

export interface DownloadCompletionResult {
  files: string[];
  thumbnails: string[];
  resource?: any;
  resourceId?: string;
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

  constructor() {
    this.ffmpegPath = getResourcePath('ffmpeg')!;

    binPathLog(this.ffmpegPath, 'ffmpeg');
    binPathLog(ytdlpService.getCurrentBinaryPath(), 'yt-dlp');
  }

  async download(options: DownloadOptions): Promise<void> {
    this.controller = new AbortController();
    const { signal } = this.controller;

    const { url, filename, destination, thumbnailUrl, quality, qualityMode, videoInfo, folderId, parentResourceId, metadata, onProgress, onError, onCompleted } = options;

    // 获取当前工作空间的资源文件夹路径
    const resolvedTarget = destination
      ? {
        destinationPath: destination,
        workspaceId: undefined,
        folderId
      }
      : await resolveDownloadTarget(folderId);
    const actualDestination = resolvedTarget.destinationPath;
    if (false) {
      try {
        const workspace = await WorkspacesRepo.getDefault();
        if (workspace?.id && workspace?.rootPath) {
          void workspace;
          void resolvedTarget;
          // 确保目录存在
          if (false) {
            void 0;
          }
        }
      } catch (error) {
        console.warn('[VideoDownloader] Failed to get daily folder, using default resource path:', error);
      }
    }

    const qualityArgs = buildQualityArgs(qualityMode, quality);
    const resolvedQualityMode = normalizeQualityMode(qualityMode, quality);
    const tempName = DEFAULT_FOLDERS.download + '_' + generateUUID();
    // 清理文件名，移除系统不支持的特殊字符
    const sanitizedFilename = filename ? sanitizeFilename(filename) : undefined;
    const tempFileTemplate = tempName + '.%(ext)s';
    const downloadPath = resolve(actualDestination, tempFileTemplate);
    const destBasePath = resolve(actualDestination, sanitizedFilename || tempName);

    // 保存thumbnailUrl供后续使用
    const videoThumbnailUrl = thumbnailUrl;

    console.log(`
=============== VideoDownloader =============================
--- options -------------------------------------------------
url: ${url}
filename: ${filename}
destination: ${destination}
thumbnailUrl: ${thumbnailUrl}
quality: ${quality}
qualityMode: ${qualityMode}
resolvedQualityMode: ${resolvedQualityMode}

--- paths ---------------------------------------------------
ffmpegPath: ${this.ffmpegPath}
yt-dlpPath: ${ytdlpService.getCurrentBinaryPath()}
workspaceId: ${resolvedTarget.workspaceId}
folderId: ${resolvedTarget.folderId}
sanitizedFilename: ${sanitizedFilename}
actualDestination: ${actualDestination}
tempFileTemplate: ${tempFileTemplate}

--- output --------------------------------------------------
downloadPath: ${downloadPath}
destBasePath: ${destBasePath}
=============================================================
      `);

    const baseArgs = [cleanDownloadUrl(url), '--prefer-free-formats', '-o', downloadPath, '--ffmpeg-location', this.ffmpegPath];

    // 使用 ytdlpService 构建完整参数（包含配置文件、代理、cookie）
    const args = await ytdlpService.buildArgsAsync(baseArgs);
    if (qualityArgs.length > 0) {
      args.push(...qualityArgs);
    }

    console.log('[VideoDownloader] --> args: ', args);

    console.log(args.join(' '));

    const dl = ytdlpStatic.exec(args, undefined, signal);
    const downloadRegex = /\s*([\s\S]*%)\s*of\s*([\s\S]*)\s*at\s*([\s\S]*s)\s*ETA\s*([\s\S]*)\s*/;
    const mergeRegex = /Merging formats into "([\s\S]*)"/;
    const reportedOutputPaths: string[] = [];
    let mergeFile = '';
    let isAborted = false;

    dl.on('ytDlpEvent', (eventType: string, eventData: string) => {
      console.log(eventData);

      appendReportedOutputPath(reportedOutputPaths, extractDestinationPath(eventData));

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

        // 检测不支持的选项错误
        const { isUnsupported, option } = isUnsupportedOptionError(error);
        let processedError = error;
        if (isUnsupported && option) {
          const unsupportedError = new UnsupportedOptionError(option, error.message || String(error));
          processedError = new Error(unsupportedError.getUserFriendlyMessage());
        }

        isFunction(onError) && onError(processedError);
        sendMainWindowError({
          error: processedError,
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

        if (mergeFile && !fs.existsSync(mergeFile)) {
          console.log('[VideoDownloader] merged file not found, try to guess the path');
          const parsedDest = path.parse(mergeFile);
          const guessPath = path.join(path.parse(downloadPath).dir, parsedDest.name + parsedDest.ext);
          console.log('guessPath:', guessPath);

          if (fs.existsSync(guessPath)) {
            mergeFile = guessPath;
          }
        }

        const outputPath = resolveDownloadedOutputPath({
          mergeFile,
          actualDestination,
          tempName,
          reportedOutputPaths
        });

        if (!outputPath) {
          const error = new Error('Downloaded file was not found after yt-dlp finished');
          console.error('[VideoDownloader] Failed to resolve output file:', {
            actualDestination,
            tempName,
            reportedOutputPaths
          });
          isFunction(onError) && onError(error);
          return;
        }

        const targetPath = changeFileName(outputPath, destBasePath);
        console.log(`
[VideoDownloader] finalize file
${outputPath}
-->
${targetPath}
`);
        const finalFilePath = moveDownloadedFile(outputPath, targetPath);

        // 先将下载的文件添加到资源数据库（不包含缩略图路径）
        let resourceId = '';
        let downloadedResource: any = null;
        try {
          const resource = await addDownloadedFileToResources(finalFilePath, videoInfo, resolvedTarget.workspaceId, undefined, resolvedTarget.folderId, {
            parentResourceId,
            metadata,
            qualityMode: resolvedQualityMode
          });
          resourceId = resource?.id || '';
          downloadedResource = resource || null;
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
              finalThumbnailPath = await generateMediaThumbnail(finalFilePath, resourceId, actualDestination);
              console.log(`[VideoDownloader] Generated thumbnail: ${finalThumbnailPath}`);
            }

            // 更新资源记录，添加缩略图路径
            if (finalThumbnailPath) {
              const updated = await ResourcesRepo.update(resourceId, { thumbnailPath: finalThumbnailPath } as any);
              downloadedResource = updated || downloadedResource;
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

        isFunction(onCompleted) &&
          onCompleted({
            files: [finalFilePath],
            thumbnails: [finalThumbnailPath].filter(Boolean),
            ...(resourceId ? { resourceId } : {}),
            ...(downloadedResource ? { resource: downloadedResource } : {})
          });
      });
  }

  cancel(): void {
    this.controller?.abort();
  }
}

// 获取视频信息的函数
export async function getVideoInfo(url: string, timeoutMs: number = 30000): Promise<VideoInfo> {
  console.log('[VideoDownloader] Starting info fetch for:', url);

  const baseArgs = [cleanDownloadUrl(url), '--prefer-free-formats'];

  const controller = new AbortController();
  const signal = controller.signal;
  let timeoutError: Error | undefined;

  const timeoutId = setTimeout(() => {
    timeoutError = new Error(`Request timed out after ${timeoutMs}ms`);
    controller.abort();
  }, timeoutMs);

  try {
    // 使用 ytdlpService 构建参数
    const args = await ytdlpService.buildArgsAsync(baseArgs);
    const info: VideoInfo = await ytdlpStatic.getVideoInfo(args, signal);

    if (info instanceof Error) {
      // 检测不支持的选项错误
      const { isUnsupported, option } = isUnsupportedOptionError(info);
      if (isUnsupported && option) {
        throw new UnsupportedOptionError(option, info.message);
      }

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

    // 检测不支持的选项错误
    if (error instanceof UnsupportedOptionError) {
      throw new Error(error.getUserFriendlyMessage());
    }

    const { isUnsupported, option } = isUnsupportedOptionError(error as Error);
    if (isUnsupported && option) {
      const unsupportedError = new UnsupportedOptionError(option, errorMessage);
      throw new Error(unsupportedError.getUserFriendlyMessage());
    }

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
  const baseArgs = [cleanDownloadUrl(url)];

  try {
    const args = await ytdlpService.buildArgsAsync(baseArgs);
    return ytdlpStatic.getThumbnail(args);
  } catch (error) {
    console.warn('[VideoDownloader] Failed to apply cookies/proxy for thumbnail:', error);
    return ytdlpStatic.getThumbnail(baseArgs);
  }
}
