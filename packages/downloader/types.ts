import type { Agent as HttpAgent } from 'node:http';
import type { Agent as HttpsAgent } from 'node:https';

export type DownloadProgress = {
  doneBytes: number;
  totalBytes?: number;
  speedBps?: number;
  etaMs?: number;
  percentage?: number;
};

export type ProxyAgent = HttpAgent | HttpsAgent;

export type DownloadOptions = {
  onProgress?: (p: DownloadProgress) => void;
  signal?: AbortSignal;
  proxyAgent?: ProxyAgent;
};

export interface Downloader {
  download(url: string, destinationPath: string, options?: DownloadOptions): Promise<string>;
}
