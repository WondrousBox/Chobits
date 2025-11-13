import type { BrowserWindow } from 'electron';

import { NodeDownloaderHelper } from './node-downloader-helper';
import type { Downloader } from './types';

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function createBestDownloader(win: BrowserWindow): Downloader {
  // 使用 node-downloader-helper，支持断点续传、自动重试、代理等特性
  // 完全在主进程运行，渲染进程关闭不影响下载
  return new NodeDownloaderHelper();
}
