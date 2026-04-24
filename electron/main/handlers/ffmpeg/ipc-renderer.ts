import type { SpriteAnimationCondition, SpriteAnimationTrigger } from '@packages/sprite-core/types';
import { ipcRenderer } from 'electron';

import { IpcParams } from '../types';

type SpriteAnimationMetaInput = {
  title?: string;
  primaryTrigger?: SpriteAnimationTrigger;
  triggerAliases?: SpriteAnimationTrigger[];
  priority?: number;
  condition?: SpriteAnimationCondition;
  /** 兼容旧输入，等价于 primaryTrigger */
  eventType?: SpriteAnimationTrigger;
};

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
  convertToSpriteAnimation: IpcParams<
    [
      Partial<{
        inputPath: string;
        outputPath: string;
        segments?: {
          start: number;
          loopStart: number;
          loopEnd: number;
          end: number;
        };
        speeds?: {
          intro: number;
          loop: number;
          outro: number;
        };
        chromaKey?: {
          enabled: boolean;
          color: string;
          similarity: number;
          blend: number;
        };
        output?: {
          fps: number;
          width: number;
          height: number;
        };
        meta?: SpriteAnimationMetaInput;
      }>
    ],
    string
  >;
};

const methods: Array<keyof FFmpegIpcParams> = ['playSprite', 'convertMovToWebmWithAlpha', 'removeBackgroundFromImage', 'extractWaveform', 'exportVideo', 'convertToSpriteAnimation'];

export type FFmpegIpcType = { [K in keyof FFmpegIpcParams]: (...args: FFmpegIpcParams[K]['request']) => Promise<FFmpegIpcParams[K]['response']> };

const newIpc: Record<string, any> = {};

methods.forEach((method) => {
  newIpc[method] = (...args: FFmpegIpcParams[typeof method]['request']) => ipcRenderer.invoke(method as string, ...args);
});

export const ffmpegIpcRenderer = {
  ...newIpc
} as FFmpegIpcType;
