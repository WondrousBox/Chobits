import { ipcRenderer } from 'electron';
import type { IPCParams } from '../type';

export type SimpleModel = {
  id: string;
  name: string;
  displayName?: string;
  version?: string;
  sizeBytes?: number;
  checksum?: string;
  algo?: string;
  sourceType?: string;
  sourceUrl?: string;
  installPath?: string;
  status?: string;
  progressBytes?: number;
  installedAt?: number;
  updatedAt?: number;
  lastError?: string;
};

export type ModelConfig = {
  id: string;
  rootDir?: string;
  defaultModelId?: string;
  concurrency?: number;
};

export type SupportedModel = {
  name: string;
  displayName?: string;
  version: string;
  sizeBytes?: number;
  checksum?: string;
  algo?: string;
  sourceType: string;
  sourceUrl: string;
};

export type ModelBridgeParams = {
  'model:getConfig': IPCParams<[void], ModelConfig | null>;
  'model:setConfig': IPCParams<[Partial<{ rootDir: string }>], { ok: boolean; data?: ModelConfig | null }>;
  'model:listSupported': IPCParams<[void], SupportedModel[]>;
  'model:listInstalled': IPCParams<[void], SimpleModel[]>;
  'model:install': IPCParams<[{ name: string; version: string }], { ok: boolean; data?: SimpleModel; error?: string }>;
  'model:uninstall': IPCParams<[{ id: string }], { ok: boolean; error?: string }>;
  'model:verify': IPCParams<[{ id: string }], { ok: boolean; valid?: boolean; error?: string }>;
  'model:retry': IPCParams<[{ id: string }], { ok: boolean; error?: string }>;
  'model:cancel': IPCParams<[{ id: string }], { ok: boolean; error?: string }>;
};

const methods: Array<keyof ModelBridgeParams> = [
  'model:getConfig',
  'model:setConfig',
  'model:listSupported',
  'model:listInstalled',
  'model:install',
  'model:uninstall',
  'model:verify',
  'model:retry',
  'model:cancel',
];

export type ModelBridgeType = {
  [K in keyof ModelBridgeParams]: (
    ...args: ModelBridgeParams[K]['request']
  ) => Promise<ModelBridgeParams[K]['response']>;
};

const bridge: Record<string, any> = {};
methods.forEach(m => {
  bridge[m] = (...args: any[]) => ipcRenderer.invoke(m as string, ...args);
});

export const modelBridge = bridge as ModelBridgeType;
