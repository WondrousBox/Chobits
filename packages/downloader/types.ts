export type DownloadProgress = {
  doneBytes: number;
  totalBytes?: number;
  speedBps?: number;
  etaMs?: number;
};

export interface Downloader {
  download(url: string, destinationPath: string, onProgress?: (p: DownloadProgress) => void, signal?: AbortSignal): Promise<string>;
}
