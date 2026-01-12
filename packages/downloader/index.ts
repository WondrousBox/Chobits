import { NodeDownloaderHelper } from './node-downloader-helper';
import type { Downloader } from './types';

export function createDownloader(): Downloader {
  // 使用 node-downloader-helper，支持断点续传、自动重试、代理等特性
  // 完全在主进程运行，渲染进程关闭不影响下载
  return new NodeDownloaderHelper();
}
