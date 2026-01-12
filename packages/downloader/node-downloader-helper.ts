import { existsSync, mkdirSync, renameSync, unlinkSync } from 'node:fs';
import type { Agent as HttpAgent } from 'node:http';
import type { Agent as HttpsAgent } from 'node:https';
import path from 'node:path';

import * as crypto from 'crypto';
import fs from 'fs';
// https://github.com/hgouveia/node-downloader-helper
import { DownloaderHelper } from 'node-downloader-helper';

export function calculateFileHash(filePath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256');
    const input = fs.createReadStream(filePath);

    input.on('error', reject);
    hash.on('readable', () => {
      const data = hash.read();
      if (data) {
        resolve(data.toString('hex'));
      }
    });

    input.pipe(hash);
  });
}
import type {
  Downloader,
  DownloaderProgressStats,
  DownloadInfo,
  DownloadOptions,
  DownloadProgress,
  HttpRequestOptionsForDownloader,
  HttpsRequestOptionsForDownloader,
  ProxyInfo,
  RetryOptions
} from './types';
import { DownloadCancelledError, DownloadTimeoutError, HashMismatchError } from './types';

/**
 * 基于 node-downloader-helper 的下载器
 * 支持断点续传、自动重试、代理等特性
 * 完全在主进程运行，渲染进程关闭不影响下载
 */
const DEFAULT_STALL_TIMEOUT_MS = 60_000;
const STALL_TIMER_INTERVAL_MS = 5_000;
const DEFAULT_MAX_RETRIES = 3;
const DEFAULT_RETRY_DELAY_MS = 2_000;
const PROGRESS_THROTTLE_MS = 100; // 进度回调节流间隔（毫秒）

/**
 * 验证 URL 格式
 */
function validateUrl(url: string): void {
  try {
    const urlObj = new URL(url);
    if (!['http:', 'https:'].includes(urlObj.protocol)) {
      throw new Error('URL must use http or https protocol');
    }
  } catch (error) {
    if (error instanceof TypeError) {
      throw new Error(`Invalid URL format: ${url}`);
    }
    throw error;
  }
}

/**
 * 验证并确保目标目录存在
 */
function ensureDestinationDir(destinationPath: string): void {
  const dir = path.dirname(destinationPath);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
}

/**
 * 获取代理信息（用于日志记录）
 */
function getProxyInfo(proxyAgent: HttpAgent | HttpsAgent): ProxyInfo {
  const proxyInfo: ProxyInfo = { type: proxyAgent.constructor.name };
  try {
    // 检查 proxyAgent 是否有 proxy 属性
    const agentWithProxy = proxyAgent as HttpAgent & {
      proxy?: string | { href?: string; host?: string; port?: number };
    };
    if ('proxy' in agentWithProxy && agentWithProxy.proxy) {
      const proxy = agentWithProxy.proxy;
      if (typeof proxy === 'string') {
        proxyInfo.url = proxy;
      } else if (proxy && typeof proxy === 'object') {
        if (proxy.href) {
          proxyInfo.url = proxy.href;
        } else if (proxy.host && proxy.port) {
          proxyInfo.host = proxy.host;
          proxyInfo.port = proxy.port;
        }
      }
    }
  } catch {
    // 忽略获取代理信息的错误
  }
  return proxyInfo;
}

/**
 * 创建请求选项（包含代理配置）
 */
function createRequestOptions(proxyAgent?: HttpAgent | HttpsAgent): {
  httpRequestOptions: HttpRequestOptionsForDownloader;
  httpsRequestOptions: HttpsRequestOptionsForDownloader;
} {
  const httpRequestOptions: HttpRequestOptionsForDownloader = {};
  const httpsRequestOptions: HttpsRequestOptionsForDownloader = {};

  if (proxyAgent) {
    httpRequestOptions.agent = proxyAgent as HttpAgent;
    httpsRequestOptions.agent = proxyAgent as HttpsAgent;
  }

  return { httpRequestOptions, httpsRequestOptions };
}

/**
 * 创建节流函数（专门用于进度回调）
 */
function createThrottledProgressCallback(callback: (progress: DownloadProgress) => void, delay: number): (progress: DownloadProgress) => void {
  let lastCall = 0;
  return (progress: DownloadProgress) => {
    const now = Date.now();
    if (now - lastCall >= delay) {
      lastCall = now;
      callback(progress);
    }
  };
}

export class NodeDownloaderHelper implements Downloader {
  async download(url: string, destinationPath: string, options?: DownloadOptions): Promise<string> {
    // 输入验证
    validateUrl(url);
    ensureDestinationDir(destinationPath);

    const dir = path.dirname(destinationPath);
    const filename = path.basename(destinationPath);
    const stallTimeoutEnv = Number(process.env.DOWNLOAD_STALL_TIMEOUT_MS);
    const stallTimeoutMs = Number.isFinite(stallTimeoutEnv) && stallTimeoutEnv > 0 ? stallTimeoutEnv : DEFAULT_STALL_TIMEOUT_MS;
    const { onProgress, signal, proxyAgent, retry, sha256 } = options ?? {};

    // 自动添加 .download 后缀作为临时文件名
    const tempFilename = `${filename}.download`;
    const tempPath = path.join(dir, tempFilename);
    const finalPath = destinationPath;

    console.log('[DL-NDH] download initiated', {
      url,
      destinationPath: finalPath,
      tempPath,
      dir,
      filename,
      tempFilename,
      sha256: sha256 ? 'provided' : 'not provided'
    });

    // 获取代理配置
    if (proxyAgent) {
      const proxyInfo = getProxyInfo(proxyAgent);
      console.log('[DL-NDH] using proxy', {
        ...proxyInfo,
        url
      });
    } else {
      console.log('[DL-NDH] no proxy configured', { url });
    }

    const { httpRequestOptions, httpsRequestOptions } = createRequestOptions(proxyAgent);

    // 配置重试选项
    const retryConfig = {
      maxRetries: retry?.maxRetries ?? DEFAULT_MAX_RETRIES,
      delay: retry?.delay ?? DEFAULT_RETRY_DELAY_MS
    };

    return new Promise<string>((resolve, reject) => {
      let isAborted = false;
      let dl: DownloaderHelper | null = null;
      let stallTimer: NodeJS.Timeout | null = null;
      let lastProgressAt = Date.now();
      let timeoutTriggered = false;

      /**
       * 清理所有资源
       */
      const cleanup = (): void => {
        clearStallTimer();
        if (signal) {
          signal.removeEventListener('abort', abortHandler);
        }
      };

      const clearStallTimer = (): void => {
        if (stallTimer) {
          clearInterval(stallTimer);
          stallTimer = null;
        }
      };

      const setupStallTimer = (): void => {
        clearStallTimer();
        if (!(stallTimeoutMs > 0)) return;
        stallTimer = setInterval(
          () => {
            if (timeoutTriggered || isAborted) return;
            if (Date.now() - lastProgressAt >= stallTimeoutMs) {
              timeoutTriggered = true;
              console.warn('[DL-NDH] download stalled, triggering timeout', {
                url,
                filename,
                stallTimeoutMs
              });
              cleanup();
              if (dl) {
                dl.stop().catch(() => {
                  //
                });
              }
              reject(new DownloadTimeoutError());
            }
          },
          Math.min(stallTimeoutMs, STALL_TIMER_INTERVAL_MS)
        );
      };

      // 处理取消信号
      const abortHandler = (): void => {
        isAborted = true;
        console.log('[DL-NDH] download cancelled', { url });
        cleanup();
        if (dl) {
          dl.stop().catch(() => {
            //
          });
        }
        reject(new DownloadCancelledError());
      };

      if (signal) {
        if (signal.aborted) {
          reject(new DownloadCancelledError());
          return;
        }
        signal.addEventListener('abort', abortHandler, { once: true });
      }

      // 创建下载器实例，使用临时文件名（带 .download 后缀）
      dl = new DownloaderHelper(url, dir, {
        fileName: tempFilename,
        resumeIfFileExists: true, // 支持断点续传
        removeOnStop: false, // 停止时不删除文件
        removeOnFail: false, // 失败时不删除文件
        httpRequestOptions,
        httpsRequestOptions,
        retry: retryConfig
      });

      // 监听下载开始
      dl.on('start', () => {
        console.log('[DL-NDH] download started', { url, filename: tempFilename });
        lastProgressAt = Date.now();
        setupStallTimer();
      });

      // 创建节流的进度回调
      const throttledProgress = onProgress ? createThrottledProgressCallback(onProgress, PROGRESS_THROTTLE_MS) : undefined;

      // 监听下载进度
      dl.on('progress', (stats: DownloaderProgressStats) => {
        if (isAborted) return;
        lastProgressAt = Date.now();

        // stats 可能包含: { progress, speed, downloaded, total, eta }
        // speed 是字节/秒（B/s）
        const downloaded = stats.downloaded ?? 0;
        const total = stats.total;
        const speedBps = stats.speed; // 字节/秒
        const etaSeconds = stats.eta; // 秒
        const etaMs = etaSeconds ? etaSeconds * 1000 : undefined;
        // 计算百分比
        const percentage = total && total > 0 ? Math.min(100, Math.max(0, (downloaded / total) * 100)) : undefined;

        const progress: DownloadProgress = {
          doneBytes: downloaded,
          totalBytes: total,
          speedBps: speedBps,
          etaMs: etaMs,
          percentage: percentage
        };

        if (throttledProgress) {
          throttledProgress(progress);
        }
      });

      // 监听下载完成
      dl.on('end', async (downloadInfo?: DownloadInfo) => {
        if (isAborted) return;

        const downloadedFilePath = downloadInfo?.filePath || tempPath;
        console.log('[DL-NDH] download completed', {
          url,
          downloadedFilePath,
          finalPath,
          fileSize: downloadInfo?.fileSize
        });

        try {
          // 如果提供了 sha256，进行 hash 验证
          if (sha256) {
            console.log('[DL-NDH] verifying hash', { url, downloadedFilePath });
            const digest = await calculateFileHash(downloadedFilePath);
            if (digest !== sha256) {
              console.error('[DL-NDH] hash mismatch', {
                url,
                expected: sha256,
                actual: digest
              });
              // hash 不匹配，删除文件
              if (existsSync(downloadedFilePath)) {
                unlinkSync(downloadedFilePath);
              }
              cleanup();
              reject(new HashMismatchError('Hash mismatch', sha256, digest));
              return;
            }
            console.log('[DL-NDH] hash verified', { url });
          }

          // hash 验证通过（或未提供 hash），重命名文件去掉 .download 后缀
          if (existsSync(downloadedFilePath)) {
            renameSync(downloadedFilePath, finalPath);
            console.log('[DL-NDH] file renamed', { from: downloadedFilePath, to: finalPath });
          }

          cleanup();
          resolve(finalPath);
        } catch (error) {
          // 如果 hash 验证或重命名失败，清理文件
          if (existsSync(downloadedFilePath)) {
            try {
              unlinkSync(downloadedFilePath);
            } catch {
              // 忽略删除错误
            }
          }
          cleanup();
          reject(error);
        }
      });

      // 监听下载错误
      dl.on('error', (error) => {
        if (isAborted) return;
        cleanup();

        console.error('[DL-NDH] download error', {
          url,
          error: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? error.stack : undefined
        });

        reject(error);
      });

      dl.on('timeout', () => {
        console.warn('[DL-NDH] underlying socket timeout detected', { url, filename: tempFilename });
      });

      // 监听重试
      dl.on('retry', (attempt: number, retryOptions?: RetryOptions) => {
        console.warn('[DL-NDH] retrying download', {
          url,
          attempt,
          maxRetries: retryOptions?.maxRetries ?? 3
        });
      });

      // 监听暂停
      dl.on('pause', () => {
        console.log('[DL-NDH] download paused', { url });
      });

      // 监听恢复
      dl.on('resume', () => {
        console.log('[DL-NDH] download resumed', { url });
      });

      // 监听停止
      dl.on('stop', () => {
        console.log('[DL-NDH] download stopped', { url });
        cleanup();
      });

      // 开始下载
      dl.start().catch((error) => {
        if (isAborted) return;

        console.error('[DL-NDH] failed to start download', {
          url,
          error: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? error.stack : undefined
        });

        cleanup();
        reject(error);
      });
    });
  }
}
