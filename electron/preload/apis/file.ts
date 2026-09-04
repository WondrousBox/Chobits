import { ipcRenderer } from 'electron';

import type { IpcParams } from '../type';

export type FileBridgeParams = {
  'file:pick-dir': IpcParams<[Partial<{ allowCreate: boolean; defaultPath: string }>?], { ok: boolean; path?: string }>;
  'file:pick-file': IpcParams<
    [
      Partial<{
        filters: { name: string; extensions: string[] }[];
        defaultPath: string;
        multi: boolean;
      }>?
    ],
    { ok: boolean; path?: string; paths?: string[] }
  >;
  'file:save-file': IpcParams<
    [
      Partial<{
        filters: { name: string; extensions: string[] }[];
        defaultPath: string;
        title: string;
        nameFieldLabel: string;
        showsTagField: boolean;
      }>?
    ],
    { ok: boolean; path?: string }
  >;
  'file:open-path': IpcParams<[string], { ok: boolean; error?: string }>;
  'file:reveal': IpcParams<[string], { ok: boolean; error?: string }>;
};

const methods: Array<keyof FileBridgeParams> = ['file:pick-dir', 'file:pick-file', 'file:save-file', 'file:open-path', 'file:reveal'];

export type FileBridgeType = {
  [K in keyof FileBridgeParams]: (...args: FileBridgeParams[K]['request']) => Promise<FileBridgeParams[K]['response']>;
};

const newIpc: Record<string, any> = {};
methods.forEach((m) => {
  newIpc[m] = (...args: any[]) => ipcRenderer.invoke(m as string, ...args);
});

export const fileBridge = newIpc as FileBridgeType;
