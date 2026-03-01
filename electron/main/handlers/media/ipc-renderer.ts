import { ipcRenderer } from 'electron';

import type { IpcParams } from '../types';

export type MediaIpcParams = {
  'media:generateThumbnails': IpcParams<
    [
      {
        sourcePath: string;
        startTime?: number;
        endTime?: number;
        count: number;
        width: number;
        height: number;
      }
    ],
    Array<{ url: string; timeOffset: number; width: number; height: number }>
  >;
  'media:getInfo': IpcParams<
    [string],
    { type: 'video' | 'image'; width: number; height: number; duration: number } | null
  >;
};

const methods: Array<keyof MediaIpcParams> = ['media:generateThumbnails', 'media:getInfo'];

export type MediaIpcType = {
  [K in keyof MediaIpcParams]: (...args: MediaIpcParams[K]['request']) => Promise<MediaIpcParams[K]['response']>;
};

const newIpc: Record<string, any> = {};
methods.forEach((m) => {
  newIpc[m] = (...args: any[]) => ipcRenderer.invoke(m as string, ...args);
});

export const mediaIpcRenderer = newIpc as MediaIpcType;
