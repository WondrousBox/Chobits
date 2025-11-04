import { ipcRenderer } from 'electron';

import { IPCParams } from '../type';

type FFmpegBridgeParams = {
  playSprite: IPCParams<[void], boolean>;
  convertMovToWebmWithAlpha: IPCParams<[Partial<{ inputPath: string; outputPath: string }>], string>;
};

const methods: Array<keyof FFmpegBridgeParams> = ['playSprite', 'convertMovToWebmWithAlpha'];

export type FFmpegBridgeType = { [K in keyof FFmpegBridgeParams]: (...args: FFmpegBridgeParams[K]['request']) => Promise<FFmpegBridgeParams[K]['response']> };

const newBridge: Record<string, any> = {};

methods.forEach((method) => {
  newBridge[method] = (...args: FFmpegBridgeParams[typeof method]['request']) => ipcRenderer.invoke(method as string, ...args);
});

export const ffmpegBridge = {
  ...newBridge
} as FFmpegBridgeType;
