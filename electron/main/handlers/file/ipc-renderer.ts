import { ipcRenderer, webUtils } from 'electron';

import { isAbsoluteFileSystemPath } from '../../utils/local-file-path';
import type { IpcParams } from '../types';

export type FileIpcParams = {
  'file:pickDir': IpcParams<[Partial<{ allowCreate: boolean; defaultPath: string }>?], { canceled: boolean; path?: string }>;
  'file:pickFile': IpcParams<
    [
      Partial<{
        filters: { name: string; extensions: string[] }[];
        defaultPath: string;
        multi: boolean;
      }>?
    ],
    { canceled: boolean; path?: string; paths?: string[] }
  >;
  'file:saveFile': IpcParams<
    [
      Partial<{
        filters: { name: string; extensions: string[] }[];
        defaultPath: string;
        title: string;
        nameFieldLabel: string;
        showsTagField: boolean;
      }>?
    ],
    { canceled: boolean; path?: string }
  >;
  'file:openPath': IpcParams<[string], { ok: boolean; error?: string }>;
  'file:reveal': IpcParams<[string], { ok: boolean; error?: string }>;
  'file:readContent': IpcParams<
    [string],
    {
      success: boolean;
      content?: string;
      error?: string;
      truncated?: boolean;
      originalSize?: number;
    }
  >;
  'file:readDirRecursive': IpcParams<
    [string],
    {
      success: boolean;
      data?: Array<{ name: string; path: string; isDirectory: boolean; relativePath: string }>;
      error?: string;
    }
  >;
  'file:pickAny': IpcParams<
    [Partial<{ defaultPath: string }>?],
    {
      canceled: boolean;
      paths?: Array<{ path: string; name: string; isDirectory: boolean }>;
    }
  >;
};

const methods: Array<keyof FileIpcParams> = ['file:pickDir', 'file:pickFile', 'file:saveFile', 'file:openPath', 'file:reveal', 'file:readContent', 'file:readDirRecursive', 'file:pickAny'];

export type FileIpcType = {
  [K in keyof FileIpcParams]: (...args: FileIpcParams[K]['request']) => Promise<FileIpcParams[K]['response']>;
} & {
  getPathForFile: (file: File) => string;
};

const newIpc: Record<string, any> = {};
methods.forEach((m) => {
  newIpc[m] = (...args: any[]) => ipcRenderer.invoke(m as string, ...args);
});

export const fileIpcRenderer = {
  ...newIpc,
  getPathForFile: (file: File): string => {
    try {
      const filePath = webUtils.getPathForFile(file);
      if (filePath) return filePath;
    } catch {
      // Fall through for older Electron versions or non-native File objects.
    }

    const fileWithPaths = file as File & { path?: string; relativePath?: string; webkitRelativePath?: string };
    const legacyPath = fileWithPaths.path;
    const selectorPaths = [fileWithPaths.relativePath, fileWithPaths.webkitRelativePath].filter(Boolean);
    if (typeof legacyPath !== 'string' || selectorPaths.includes(legacyPath)) return '';
    return isAbsoluteFileSystemPath(legacyPath) ? legacyPath : '';
  }
} as FileIpcType;
