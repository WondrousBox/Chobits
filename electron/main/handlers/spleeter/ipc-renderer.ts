import { ipcRenderer } from 'electron';

import { IpcParams } from '../types';

type SpleeterIpcParams = {
  separate: IpcParams<
    [
      {
        inputFile: string;
        outputPrefix?: string;
      }
    ],
    {
      accompaniment: string;
      vocals: string;
    }
  >;
  isInstalled: IpcParams<[void], { ok: boolean; installed: boolean }>;
  getExecutablePath: IpcParams<[void], { ok: boolean; path: string }>;
};

const methods: Array<keyof SpleeterIpcParams> = ['separate', 'isInstalled', 'getExecutablePath'];

export type SpleeterIpcType = { [K in keyof SpleeterIpcParams]: (...args: SpleeterIpcParams[K]['request']) => Promise<SpleeterIpcParams[K]['response']> };

const newIpc: Record<string, any> = {};

methods.forEach((method) => {
  newIpc[method] = (...args: SpleeterIpcParams[typeof method]['request']) => ipcRenderer.invoke(`spleeter:${method}`, ...args);
});

export const spleeterIpcRenderer = {
  ...newIpc,
  onProgress: (callback: (data: { progress: number }) => void): (() => void) => {
    const listener = (_event: any, data: { progress: number }): void => callback(data);
    ipcRenderer.on('spleeter:progress', listener);
    return (): void => {
      void ipcRenderer.removeListener('spleeter:progress', listener);
    };
  }
} as unknown as SpleeterIpcType & { onProgress: (callback: (data: { progress: number }) => void) => () => void };
