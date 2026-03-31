export type DownloadStatus = 'queued' | 'downloading' | 'extracting' | 'verifying' | 'installed' | 'failed' | 'cancelled' | 'removed';

export type InstalledResource = {
  id: string;
  resourceId: string;
  pluginId: string;
  type: 'engine' | 'model';
  name: string;
  displayName?: string;
  version?: string;
  sizeBytes?: number;
  progressBytes?: number;
  status?: DownloadStatus;
  speedBps?: number;
  etaMs?: number;
  lastError?: string;
};

export type NetworkCheckResult = {
  name: string;
  url: string;
  success: boolean;
  error?: string;
};
