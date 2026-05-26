import { ipcRenderer } from 'electron';

import type { SpritePurposeStartResult } from '../../../../packages/sprite-core/purpose';
import type { QuestListSnapshot, QuestStartSource } from '../../../../packages/sprite-core/quest';
import type { IpcParams } from '../types';
import type { QuestResetCompletedSummary, QuestResetProgressSummary, QuestStorageLocation } from './ipc-main';

export type QuestIpcParams = {
  'quest:list': IpcParams<[void], { ok: boolean; snapshot?: QuestListSnapshot; error?: string }>;
  'quest:start': IpcParams<[{ id: string; source?: QuestStartSource }], { ok: boolean; snapshot?: QuestListSnapshot; startResult?: SpritePurposeStartResult | null; error?: string }>;
  'quest:getStorageLocation': IpcParams<[], { ok: boolean; location?: QuestStorageLocation; error?: string }>;
  'quest:openStorageLocation': IpcParams<[], { ok: boolean; location?: QuestStorageLocation; error?: string }>;
  'quest:resetCompleted': IpcParams<[], { ok: boolean; snapshot?: QuestListSnapshot; summary?: QuestResetCompletedSummary; error?: string }>;
  'quest:resetProgress': IpcParams<[], { ok: boolean; snapshot?: QuestListSnapshot; summary?: QuestResetProgressSummary; error?: string }>;
};

const methods: Array<keyof QuestIpcParams> = ['quest:list', 'quest:start', 'quest:getStorageLocation', 'quest:openStorageLocation', 'quest:resetCompleted', 'quest:resetProgress'];

export type QuestIpcType = {
  [K in keyof QuestIpcParams]: (...args: QuestIpcParams[K]['request']) => Promise<QuestIpcParams[K]['response']>;
};

const bridge: Record<string, any> = {};
methods.forEach((method) => {
  bridge[method] = (...args: any[]) => ipcRenderer.invoke(method as string, ...args);
});

export const questIpcRenderer = bridge as QuestIpcType;
