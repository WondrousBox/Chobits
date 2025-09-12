import { ipcRenderer } from 'electron';
import { IPCParams } from '../type';

export type Resource = {
  id: string;
  type: 'image' | 'video' | 'audio' | 'text' | 'link' | 'file' | 'document' | 'other';
  title?: string;
  description?: string;
  url?: string;
  domain?: string;
  sourceName?: string;
  authorName?: string;
  language?: string;
  mimeType?: string;
  sizeBytes?: number;
  durationMs?: number;
  width?: number;
  height?: number;
  filePath?: string;
  contentText?: string;
  thumbnail?: ArrayBuffer | Uint8Array;
  previewUrl?: string;
  tags?: string; // JSON string
  categories?: string; // JSON string
  visibility?: 'private' | 'unlisted' | 'public';
  nsfw?: 0 | 1;
  favorite?: 0 | 1;
  rating?: number;
  status?: 'new' | 'processing' | 'ready' | 'archived' | 'error';
  collectedAt?: number;
  publishedAt?: number;
  createdAt?: number;
  updatedAt?: number;
  metadata?: string; // JSON string
  embedding?: ArrayBuffer | Uint8Array;
};

export type ResourceBridgeParams = {
  'addResource': IPCParams<[{ resource: Resource }], { success: true }>;
  'listResource': IPCParams<[void], Resource[]>;
  'getResource': IPCParams<[{ id: string }], Resource | undefined>;
  'deleteResource': IPCParams<[{ id: string }], { success: true }>;
};

const methods: Array<keyof ResourceBridgeParams> = [
  'addResource',
  'listResource',
  'getResource',
  'deleteResource',
];

export type ResourceBridgeType = {
  [K in keyof ResourceBridgeParams]: (
    ...args: ResourceBridgeParams[K]["request"]
  ) => Promise<ResourceBridgeParams[K]["response"]>;
};

const bridge: Record<string, any> = {};
methods.forEach(m => {
  bridge[m] = (...args: ResourceBridgeParams[typeof m]['request']) => ipcRenderer.invoke(m as string, ...args);
});

export const resourceBridge = bridge as ResourceBridgeType;
