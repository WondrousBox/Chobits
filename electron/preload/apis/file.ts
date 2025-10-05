import { ipcRenderer } from 'electron';
import type { IPCParams } from '../type';

export type FileBridgeParams = {
  'file:pickDir': IPCParams<[Partial<{ allowCreate: boolean; defaultPath: string }>?], { canceled: boolean; path?: string }>;
  'file:pickFile': IPCParams<[
    Partial<{
      filters: { name: string; extensions: string[] }[];
      defaultPath: string;
      multi: boolean;
    }>?], { canceled: boolean; path?: string; paths?: string[] }>;
  'file:openPath': IPCParams<[string], { ok: boolean; error?: string }>;
  'file:readContent': IPCParams<[string, number?], { 
    success: boolean; 
    content?: string; 
    error?: string; 
    truncated?: boolean; 
    originalSize?: number 
  }>;
};

const methods: Array<keyof FileBridgeParams> = [
  'file:pickDir',
  'file:pickFile',
  'file:openPath',
  'file:readContent',
];

export type FileBridgeType = {
  [K in keyof FileBridgeParams]: (
    ...args: FileBridgeParams[K]['request']
  ) => Promise<FileBridgeParams[K]['response']>;
};

const bridge: Record<string, any> = {};
methods.forEach(m => {
  bridge[m] = (...args: any[]) => ipcRenderer.invoke(m as string, ...args);
});

export const fileBridge = bridge as FileBridgeType;
