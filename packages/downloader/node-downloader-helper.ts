import path from 'node:path';

// https://github.com/hgouveia/node-downloader-helper
import { DownloaderHelper } from 'node-downloader-helper';

import type { Downloader, DownloadOptions, DownloadProgress } from './types';

/**
 * 基于 node-downloader-helper 的下载器
 * 支持断点续传、自动重试、代理等特性
 * 完全在主进程运行，渲染进程关闭不影响下载
 */
const DEFAULT_STALL_TIMEOUT_MS = 60_000;
const STALL_TIMER_INTERVAL_MS = 5_000;

export class NodeDownloaderHelper implements Downloader {
  async download(url: string, destinationPath: string, options?: DownloadOptions): Promise<string> {
    const dir = path.dirname(destinationPath);
    const filename = path.basename(destinationPath);
    const stallTimeoutEnv = Number(process.env.CHOBITS_DOWNLOAD_STALL_TIMEOUT_MS);
    const stallTimeoutMs = Number.isFinite(stallTimeoutEnv) && stallTimeoutEnv > 0 ? stallTimeoutEnv : DEFAULT_STALL_TIMEOUT_MS;
    const { onProgress, signal, proxyAgent } = options ?? {};

    console.log('[DL-NDH] download initiated', {
      url,
      destinationPath,
      dir,
      filename
    });

    // 获取代理配置
    console.log('[DL-NDH] proxyAgent', proxyAgent);

    const httpRequestOptions: any = {};
    const httpsRequestOptions: any = {};

    if (proxyAgent) {
      // 尝试获取代理详细信息
      const proxyInfo: any = { type: proxyAgent.constructor.name };
      try {
        if ('proxy' in proxyAgent && proxyAgent.proxy) {
          const proxy = (proxyAgent as any).proxy;
          if (typeof proxy === 'string') {
            proxyInfo.url = proxy;
          } else if (proxy.href) {
            proxyInfo.url = proxy.href;
          } else if (proxy.host && proxy.port) {
            proxyInfo.host = proxy.host;
            proxyInfo.port = proxy.port;
          }
        }
      } catch (e) {
        // 忽略获取代理信息的错误
      }
      console.log('[DL-NDH] using proxy', {
        ...proxyInfo,
        url
      });

      // 设置代理 agent
      httpRequestOptions.agent = proxyAgent;
      httpsRequestOptions.agent = proxyAgent;
    } else {
      console.log('[DL-NDH] no proxy configured', { url });
    }

    return new Promise<string>((resolve, reject) => {
      let isAborted = false;
      let dl: DownloaderHelper | null = null;
      let stallTimer: NodeJS.Timeout | null = null;
      let lastProgressAt = Date.now();
      let timeoutTriggered = false;

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
              if (signal) {
                signal.removeEventListener('abort', abortHandler);
              }
              if (dl) {
                dl.stop().catch(() => { });
              }
              clearStallTimer();
              reject(new Error('DownloadTimeout'));
            }
          },
          Math.min(stallTimeoutMs, STALL_TIMER_INTERVAL_MS)
        );
      };

      // 处理取消信号
      const abortHandler = () => {
        isAborted = true;
        console.log('[DL-NDH] download cancelled', { url });
        if (dl) {
          dl.stop().catch(() => { });
        }
        reject(new Error('DownloadCancelled'));
      };

      if (signal) {
        if (signal.aborted) {
          reject(new Error('DownloadCancelled'));
          return;
        }
        signal.addEventListener('abort', abortHandler, { once: true });
      }

      // 创建下载器实例
      dl = new DownloaderHelper(url, dir, {
        fileName: filename,
        resumeIfFileExists: true, // 支持断点续传
        removeOnStop: false, // 停止时不删除文件
        removeOnFail: false, // 失败时不删除文件
        httpRequestOptions,
        httpsRequestOptions,
        retry: {
          maxRetries: 3, // 最大重试次数
          delay: 2000 // 重试延迟（毫秒）
        }
      });

      // 监听下载开始
      dl.on('start', () => {
        console.log('[DL-NDH] download started', { url, filename });
        lastProgressAt = Date.now();
        setupStallTimer();
      });

      // 监听下载进度
      dl.on('progress', (stats: any) => {
        if (isAborted) return;
        lastProgressAt = Date.now();

        // stats 可能包含: { progress, speed, downloaded, total, eta }
        // speed 是字节/秒（B/s）
        const downloaded = stats.downloaded || 0;
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

        if (onProgress) {
          onProgress(progress);
        }

        // console.log('[DL-NDH] progress', stats.progress ? stats.progress.toFixed(2) + '%' : undefined);
      });

      // 监听下载完成
      dl.on('end', (downloadInfo: any) => {
        if (isAborted) return;

        const finalPath = path.join(dir, filename);
        console.log('[DL-NDH] download completed', {
          url,
          destinationPath: finalPath,
          filePath: downloadInfo?.filePath,
          fileSize: downloadInfo?.fileSize
        });

        // 清理取消监听
        if (signal) {
          signal.removeEventListener('abort', abortHandler);
        }
        clearStallTimer();

        resolve(finalPath);
      });

      // 监听下载错误
      dl.on('error', (error) => {
        if (isAborted) return;
        clearStallTimer();

        console.error('[DL-NDH] download error', {
          url,
          error: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? error.stack : undefined
        });

        // 清理取消监听
        if (signal) {
          signal.removeEventListener('abort', abortHandler);
        }

        reject(error);
      });

      dl.on('timeout', () => {
        console.warn('[DL-NDH] underlying socket timeout detected', { url, filename });
      });

      // 监听重试
      dl.on('retry', (attempt: number, retryOptions: any) => {
        console.warn('[DL-NDH] retrying download', {
          url,
          attempt,
          maxRetries: retryOptions?.maxRetries || 3
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
        clearStallTimer();
      });

      // 开始下载
      dl.start().catch((error) => {
        if (isAborted) return;

        console.error('[DL-NDH] failed to start download', {
          url,
          error: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? error.stack : undefined
        });

        // 清理取消监听
        if (signal) {
          signal.removeEventListener('abort', abortHandler);
        }
        clearStallTimer();

        reject(error);
      });
    });
  }
}
