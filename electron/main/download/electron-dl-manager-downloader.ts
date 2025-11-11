import path from 'node:path';

import type { BrowserWindow } from 'electron';
import { ElectronDownloadManager } from 'electron-dl-manager';

import type { Downloader, DownloadProgress } from './types';

// Optional adapter to electron-dl-manager without hard dependency
export class ElectronDlManagerDownloader implements Downloader {
  private win: BrowserWindow;
  private manager: ElectronDownloadManager | null = null;

  constructor(win: BrowserWindow) {
    this.win = win;
    try {
      this.manager = new ElectronDownloadManager();
    } catch (e) {
      this.manager = null;
      console.warn('[DL-EDM] not available', e);
    }
  }

  async download(url: string, destinationPath: string, onProgress?: (p: DownloadProgress) => void, signal?: AbortSignal): Promise<string> {
    if (!this.manager) {
      throw new Error('ELECTRON_DL_MANAGER_NOT_AVAILABLE');
    }

    const dir = path.dirname(destinationPath);
    const filename = path.basename(destinationPath);

    console.log('[DL-EDM] start', { url, destinationPath, dir, filename });

    let downloadId = '';

    await new Promise<void>((resolve, reject) => {
      const cfg: any = {
        window: this.win,
        url,
        // These fields may not be declared in typings but are supported by the lib
        saveAsFilename: filename,
        directory: dir,
        callbacks: {
          onDownloadStarted: (data: any) => {
            const suggested = data?.resolvedFilename;
            console.log('[DL-EDM] started', { url, suggested });
          },
          onDownloadProgress: (data: any) => {
            if (!onProgress) return;
            const received = data.item?.getReceivedBytes?.() ?? 0;
            const total = data.item?.getTotalBytes?.() ?? undefined;
            const p = { doneBytes: received, totalBytes: total } as DownloadProgress;
            onProgress(p);
            console.log('[DL-EDM] progress', received, total);
          },
          onDownloadCompleted: (data: any) => {
            const received = data.item?.getReceivedBytes?.() ?? undefined;
            console.log('[DL-EDM] completed', { url, destinationPath, totalBytes: received });
            resolve();
          },
          onDownloadCancelled: () => {
            console.warn('[DL-EDM] cancelled', { url });
            reject(new Error('DownloadCancelled'));
          },
          onDownloadInterrupted: (data: any) => {
            console.warn('[DL-EDM] interrupted', { url, state: data?.interruptedVia });
            reject(new Error('DownloadInterrupted'));
          },
          onError: (error: Error) => {
            console.error('[DL-EDM] error', error);
            reject(error);
          }
        }
      };

      // EDM doesn't support AbortSignal directly; if provided, cancel via manager when signalled
      let aborted = false;
      const abortHandler = (): void => {
        aborted = true;
        // No direct handle to cancel specific id before we get it; will reject when cancelled callback fires
        console.warn('[DL-EDM] abort requested', { url });
      };
      if (signal) {
        if (signal.aborted) abortHandler();
        signal.addEventListener('abort', abortHandler, { once: true });
      }

      this.manager!.download(cfg)
        .then((id: string) => {
          downloadId = id;
          if (aborted) {
            // Best effort: user requested abort; rely on callbacks for final state
          }
        })
        .catch(reject);
    });

    return downloadId;
  }
}
