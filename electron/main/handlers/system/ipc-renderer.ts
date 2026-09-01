import type { BackupInfo } from '@packages/common/db';
import { ipcRenderer } from 'electron';

import type { IpcParams } from '../types';

export type SystemIpcParams = {
  // Database
  'database:getPath': IpcParams<[], { ok: boolean; path?: string; dir?: string; error?: string }>;
  'database:openLocation': IpcParams<[], { ok: boolean; error?: string }>;
  'database:backup': IpcParams<[customPath?: string], { ok: boolean; path?: string; error?: string }>;
  'database:listBackups': IpcParams<[customPath?: string], { ok: boolean; backups?: BackupInfo[]; error?: string }>;
  'database:deleteBackup': IpcParams<[backupPath: string], { ok: boolean; error?: string }>;
  'database:restoreBackup': IpcParams<[backupPath: string], { ok: boolean; requiresRestart?: boolean; error?: string }>;
  'database:importBackup': IpcParams<[sourcePath: string, options?: { restore?: boolean }], { ok: boolean; backupPath?: string; requiresRestart?: boolean; error?: string }>;

  // App
  'app:relaunch': IpcParams<[], { ok: boolean; error?: string }>;
  'app:openExternalUrl': IpcParams<[url: string], { ok: boolean; error?: string }>;

  // Logs
  'logs:getPath': IpcParams<[], { ok: boolean; dir?: string; error?: string }>;
  'logs:openLocation': IpcParams<[], { ok: boolean; error?: string }>;

  // Microphone
  'system:microphone:getStatus': IpcParams<[], { ok: boolean; status?: string; error?: string }>;
  'system:microphone:requestAccess': IpcParams<[], { ok: boolean; granted?: boolean; error?: string }>;
};

const methods: Array<keyof SystemIpcParams> = [
  'database:getPath',
  'database:openLocation',
  'database:backup',
  'database:listBackups',
  'database:deleteBackup',
  'database:restoreBackup',
  'database:importBackup',
  'app:relaunch',
  'app:openExternalUrl',
  'logs:getPath',
  'logs:openLocation',
  'system:microphone:getStatus',
  'system:microphone:requestAccess'
];

export type SystemIpcType = {
  [K in keyof SystemIpcParams]: (...args: SystemIpcParams[K]['request']) => Promise<SystemIpcParams[K]['response']>;
};

const newIpc: Record<string, any> = {};
methods.forEach((m) => {
  newIpc[m] = (...args: any[]) => ipcRenderer.invoke(m as string, ...args);
});

export const systemIpcRenderer = newIpc as SystemIpcType;
