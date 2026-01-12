import type { Agent as HttpAgent, RequestOptions as HttpRequestOptions } from 'node:http';
import type { Agent as HttpsAgent, RequestOptions as HttpsRequestOptions } from 'node:https';

export type DownloadProgress = {
  doneBytes: number;
  totalBytes?: number;
  speedBps?: number;
  etaMs?: number;
  percentage?: number;
};

export type ProxyAgent = HttpAgent | HttpsAgent;

/**
 * 重试配置
 */
export interface RetryConfig {
  maxRetries?: number;
  delay?: number;
}

export type DownloadOptions = {
  onProgress?: (p: DownloadProgress) => void;
  signal?: AbortSignal;
  proxyAgent?: ProxyAgent;
  retry?: RetryConfig;
  sha256?: string; // SHA256 校验和，如果提供则下载完成后会进行验证
};

export interface Downloader {
  download(url: string, destinationPath: string, options?: DownloadOptions): Promise<string>;
}

/**
 * DownloaderHelper 进度统计信息
 */
export interface DownloaderProgressStats {
  progress?: number;
  speed?: number;
  downloaded?: number;
  total?: number;
  eta?: number;
}

/**
 * DownloaderHelper 下载完成信息
 */
export interface DownloadInfo {
  filePath?: string;
  fileSize?: number;
}

/**
 * DownloaderHelper 重试选项
 */
export interface RetryOptions {
  maxRetries?: number;
  delay?: number;
}

/**
 * HTTP 请求选项（用于 DownloaderHelper）
 */
export interface HttpRequestOptionsForDownloader extends Partial<HttpRequestOptions> {
  agent?: HttpAgent;
}

/**
 * HTTPS 请求选项（用于 DownloaderHelper）
 */
export interface HttpsRequestOptionsForDownloader extends Partial<HttpsRequestOptions> {
  agent?: HttpsAgent;
}

/**
 * 代理信息（用于日志记录）
 */
export interface ProxyInfo {
  type: string;
  url?: string;
  host?: string;
  port?: number;
}

/**
 * 下载超时错误
 */
export class DownloadTimeoutError extends Error {
  constructor(message = 'Download timeout') {
    super(message);
    this.name = 'DownloadTimeoutError';
  }
}

/**
 * 下载取消错误
 */
export class DownloadCancelledError extends Error {
  constructor(message = 'Download cancelled') {
    super(message);
    this.name = 'DownloadCancelledError';
  }
}

/**
 * Hash 校验失败错误
 */
export class HashMismatchError extends Error {
  constructor(
    message = 'Hash mismatch',
    public readonly expected?: string,
    public readonly actual?: string
  ) {
    super(message);
    this.name = 'HashMismatchError';
  }
}
