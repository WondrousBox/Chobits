import { ipcRenderer } from 'electron';

import { IpcParams } from '../types';

type FFmpegIpcParams = {
  playSprite: IpcParams<[void], boolean>;
  convertMovToWebmWithAlpha: IpcParams<[Partial<{ inputPath: string; outputPath: string }>], string>;
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
  extractWaveform: IpcParams<
    [
      {
        inputPath: string;
        samplesCount?: number;
      }
    ],
    { peaks: number[]; duration: number }
  >;
  exportVideo: IpcParams<[any], string>;
};

const methods: Array<keyof FFmpegIpcParams> = ['playSprite', 'convertMovToWebmWithAlpha', 'removeBackgroundFromImage', 'extractWaveform', 'exportVideo'];

export type FFmpegIpcType = { [K in keyof FFmpegIpcParams]: (...args: FFmpegIpcParams[K]['request']) => Promise<FFmpegIpcParams[K]['response']> };

const newIpc: Record<string, any> = {};

methods.forEach((method) => {
  newIpc[method] = (...args: FFmpegIpcParams[typeof method]['request']) => ipcRenderer.invoke(method as string, ...args);
});

export const ffmpegIpcRenderer = {
  ...newIpc
} as FFmpegIpcType;
