import { ipcRenderer } from 'electron';

import type { IpcParams } from '../types';

export type FileIpcParams = {
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
  'file:read-content': IpcParams<
    [string],
    {
      ok: boolean;
      content?: string;
      error?: string;
      wasTruncated?: boolean;
      originalSize?: number;
    }
  >;
  'file:read-dir-recursive': IpcParams<
    [string],
    {
      ok: boolean;
      data?: Array<{ name: string; path: string; isDirectory: boolean; relativePath: string }>;
      error?: string;
    }
  >;
  'file:pick-any': IpcParams<
    [Partial<{ defaultPath: string }>?],
    {
      ok: boolean;
      paths?: Array<{ path: string; name: string; isDirectory: boolean }>;
    }
  >;
};

const methods: Array<keyof FileIpcParams> = ['file:pick-dir', 'file:pick-file', 'file:save-file', 'file:open-path', 'file:reveal', 'file:read-content', 'file:read-dir-recursive', 'file:pick-any'];

export type FileIpcType = {
  [K in keyof FileIpcParams]: (...args: FileIpcParams[K]['request']) => Promise<FileIpcParams[K]['response']>;
};

const newIpc: Record<string, any> = {};
methods.forEach((m) => {
  newIpc[m] = (...args: any[]) => ipcRenderer.invoke(m as string, ...args);
});

export const fileIpcRenderer = newIpc as FileIpcType;
