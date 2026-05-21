import { ipcRenderer } from 'electron';

import type { SpritePurposeStartResult } from '../../../../packages/sprite-core/purpose';
import type { QuestListSnapshot, QuestStartSource } from '../../../../packages/sprite-core/quest';
import type { IpcParams } from '../types';

export type QuestIpcParams = {
  'quest:list': IpcParams<[void], { ok: boolean; snapshot?: QuestListSnapshot; error?: string }>;
  'quest:start': IpcParams<[{ id: string; source?: QuestStartSource }], { ok: boolean; snapshot?: QuestListSnapshot; startResult?: SpritePurposeStartResult | null; error?: string }>;
};

const methods: Array<keyof QuestIpcParams> = ['quest:list', 'quest:start'];

export type QuestIpcType = {
  [K in keyof QuestIpcParams]: (...args: QuestIpcParams[K]['request']) => Promise<QuestIpcParams[K]['response']>;
};

const bridge: Record<string, any> = {};
methods.forEach((method) => {
  bridge[method] = (...args: any[]) => ipcRenderer.invoke(method as string, ...args);
});

export const questIpcRenderer = bridge as QuestIpcType;
