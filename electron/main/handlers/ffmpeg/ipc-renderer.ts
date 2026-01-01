import { ipcRenderer } from 'electron';

import { IpcParams } from '../types';

type FFmpegIpcParams = {
  playSprite: IpcParams<[void], boolean>;
  convertMovToWebmWithAlpha: IpcParams<[Partial<{ inputPath: string; outputPath: string }>], string>;
  removeGreenScreenToMov: IpcParams<
    [
      Partial<{
        inputPath: string;
        outputPath: string;
        color?: string;
        similarity?: number;
        blend?: number;
        codec?: 'prores_ks' | 'qtrle';
      }>
    ],
    string
  >;
  removeBackgroundFromImage: IpcParams<
    [
      Partial<{
        inputPath: string;
        outputPath: string;
        modelId?: string;
      }>
    ],
    string
  >;
  removeBackgroundWithAI: IpcParams<
    [
      Partial<{
        inputPath: string;
        outputPath: string;
        modelId?: string;
      }>
    ],
    string
  >;
};

const methods: Array<keyof FFmpegIpcParams> = ['playSprite', 'convertMovToWebmWithAlpha', 'removeGreenScreenToMov', 'removeBackgroundFromImage', 'removeBackgroundWithAI'];

export type FFmpegIpcType = { [K in keyof FFmpegIpcParams]: (...args: FFmpegIpcParams[K]['request']) => Promise<FFmpegIpcParams[K]['response']> };

const newIpc: Record<string, any> = {};

methods.forEach((method) => {
  newIpc[method] = (...args: FFmpegIpcParams[typeof method]['request']) => ipcRenderer.invoke(method as string, ...args);
});

export const ffmpegIpcRenderer = {
  ...newIpc
} as FFmpegIpcType;
