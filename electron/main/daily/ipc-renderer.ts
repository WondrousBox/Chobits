import { ipcRenderer } from 'electron';

import type { IPCParams } from '../../preload/type';
import type { CustomReminderConfig, CustomReminderInput, DailyCareSnapshot, UpdateSettingsPayload } from './types';

export type DailyCareBridgeParams = {
  'dailyCare:getSnapshot': IPCParams<[], DailyCareSnapshot>;
  'dailyCare:updateSettings': IPCParams<[UpdateSettingsPayload], DailyCareSnapshot>;
  'dailyCare:upsertCustomReminder': IPCParams<[CustomReminderInput], { reminder: CustomReminderConfig; snapshot: DailyCareSnapshot }>;
  'dailyCare:removeCustomReminder': IPCParams<[string], DailyCareSnapshot>;
  'dailyCare:triggerNow': IPCParams<[string], { ok: boolean }>;
};

const methods: Array<keyof DailyCareBridgeParams> = ['dailyCare:getSnapshot', 'dailyCare:updateSettings', 'dailyCare:upsertCustomReminder', 'dailyCare:removeCustomReminder', 'dailyCare:triggerNow'];

export type DailyCareBridgeType = {
  [K in keyof DailyCareBridgeParams]: (...args: DailyCareBridgeParams[K]['request']) => Promise<DailyCareBridgeParams[K]['response']>;
};

const bridge: Partial<DailyCareBridgeType> = {};
methods.forEach((method) => {
  (bridge as any)[method] = (...args: any[]) => ipcRenderer.invoke(method as string, ...args);
});

export const dailyCareBridge = bridge as DailyCareBridgeType;
