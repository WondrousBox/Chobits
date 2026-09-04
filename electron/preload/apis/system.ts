import type { BackupInfo } from '@packages/common/db';
import { ipcRenderer } from 'electron';

import type { IpcParams } from '../type';

/** 与 electron/main/updater.ts 的 UpdateCheckStatus 保持一致 */
export type UpdateCheckStatus = 'disabled' | 'idle' | 'checking' | 'available' | 'not-available' | 'downloaded' | 'error';

export type SystemBridgeParams = {
  // Database
  'database:get-path': IpcParams<[], { ok: boolean; path?: string; dir?: string; error?: string }>;
  'database:open-location': IpcParams<[], { ok: boolean; error?: string }>;
  'database:backup': IpcParams<[customPath?: string], { ok: boolean; path?: string; error?: string }>;
  'database:list-backups': IpcParams<[customPath?: string], { ok: boolean; backups?: BackupInfo[]; error?: string }>;
  'database:delete-backup': IpcParams<[backupPath: string], { ok: boolean; error?: string }>;
  'database:restore-backup': IpcParams<[backupPath: string], { ok: boolean; requiresRestart?: boolean; error?: string }>;
  'database:import-backup': IpcParams<[sourcePath: string, options?: { restore?: boolean }], { ok: boolean; backupPath?: string; requiresRestart?: boolean; error?: string }>;

  // App
  'app:relaunch': IpcParams<[], { ok: boolean; error?: string }>;
  'app:renderer-ready': IpcParams<[], void>;
  'app:update:check': IpcParams<[], { ok: boolean; status?: UpdateCheckStatus; version?: string; error?: string }>;

  // Logs
  'logs:get-path': IpcParams<[], { ok: boolean; dir?: string; error?: string }>;
  'logs:open-location': IpcParams<[], { ok: boolean; error?: string }>;

  // Microphone
  'system:microphone:get-status': IpcParams<[], { ok: boolean; status?: string; error?: string }>;
  'system:microphone:request-access': IpcParams<[], { ok: boolean; isGranted?: boolean; error?: string }>;
};

const methods: Array<keyof SystemBridgeParams> = [
  'database:get-path',
  'database:open-location',
  'database:backup',
  'database:list-backups',
  'database:delete-backup',
  'database:restore-backup',
  'database:import-backup',
  'app:relaunch',
  'app:renderer-ready',
  'app:update:check',
  'logs:get-path',
  'logs:open-location',
  'system:microphone:get-status',
  'system:microphone:request-access'
];

export type SystemBridgeType = {
  [K in keyof SystemBridgeParams]: (...args: SystemBridgeParams[K]['request']) => Promise<SystemBridgeParams[K]['response']>;
};

const newIpc: Record<string, any> = {};
methods.forEach((m) => {
  newIpc[m] = (...args: any[]) => ipcRenderer.invoke(m as string, ...args);
});

export const systemBridge = newIpc as SystemBridgeType;
