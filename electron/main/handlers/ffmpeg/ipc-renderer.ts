import { ipcRenderer } from 'electron';

import { IpcParams } from '../types';

type FFmpegIpcParams = {
  playSprite: IpcParams<[void], boolean>;
  convertMovToWebmWithAlpha: IpcParams<[Partial<{ inputPath: string; outputPath: string }>], string>;
};

const methods: Array<keyof FFmpegIpcParams> = ['playSprite', 'convertMovToWebmWithAlpha'];

export type FFmpegIpcType = { [K in keyof FFmpegIpcParams]: (...args: FFmpegIpcParams[K]['request']) => Promise<FFmpegIpcParams[K]['response']> };

const newIpc: Record<string, any> = {};

methods.forEach((method) => {
  newIpc[method] = (...args: FFmpegIpcParams[typeof method]['request']) => ipcRenderer.invoke(method as string, ...args);
});

export const ffmpegIpcRenderer = {
  ...newIpc
} as FFmpegIpcType;
