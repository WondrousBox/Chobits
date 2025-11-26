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
  status?: string;
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
