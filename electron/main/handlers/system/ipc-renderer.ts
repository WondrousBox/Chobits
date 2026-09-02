import type { BackupInfo } from '@packages/common/db';
import { ipcRenderer } from 'electron';

import type { IpcParams } from '../types';

export type SystemIpcParams = {
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
  'app:open-external-url': IpcParams<[url: string], { ok: boolean; error?: string }>;

  // Logs
  'logs:get-path': IpcParams<[], { ok: boolean; dir?: string; error?: string }>;
  'logs:open-location': IpcParams<[], { ok: boolean; error?: string }>;

  // Microphone
  'system:microphone:get-status': IpcParams<[], { ok: boolean; status?: string; error?: string }>;
  'system:microphone:request-access': IpcParams<[], { ok: boolean; isGranted?: boolean; error?: string }>;
};

const methods: Array<keyof SystemIpcParams> = [
  'database:get-path',
  'database:open-location',
  'database:backup',
  'database:list-backups',
  'database:delete-backup',
  'database:restore-backup',
  'database:import-backup',
  'app:relaunch',
  'app:open-external-url',
  'logs:get-path',
  'logs:open-location',
  'system:microphone:get-status',
  'system:microphone:request-access'
];

export type SystemIpcType = {
  [K in keyof SystemIpcParams]: (...args: SystemIpcParams[K]['request']) => Promise<SystemIpcParams[K]['response']>;
};

const newIpc: Record<string, any> = {};
methods.forEach((m) => {
  newIpc[m] = (...args: any[]) => ipcRenderer.invoke(m as string, ...args);
});

export const systemIpcRenderer = newIpc as SystemIpcType;
