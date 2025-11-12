import type { BrowserWindow } from 'electron';

import { ElectronDlManagerDownloader } from './electron-dl-manager-downloader';
import type { Downloader } from './types';

export function createBestDownloader(win: BrowserWindow): Downloader {
  return new ElectronDlManagerDownloader(win);
}
