import { ipcRenderer } from 'electron';

import type { IPCParams } from '../../preload/type';
import { DAILY_CARE_SNAPSHOT_UPDATED_CHANNEL, type CustomReminderConfig, type CustomReminderInput, type DailyCareSnapshot, type UpdateSettingsPayload } from './types';

export type DailyCareBridgeParams = {
  'dailyCare:getSnapshot': IPCParams<[], DailyCareSnapshot>;
  'dailyCare:updateSettings': IPCParams<[UpdateSettingsPayload], DailyCareSnapshot>;
  'dailyCare:upsertCustomReminder': IPCParams<[CustomReminderInput], { reminder: CustomReminderConfig; snapshot: DailyCareSnapshot }>;
  'dailyCare:removeCustomReminder': IPCParams<[string], DailyCareSnapshot>;
  'dailyCare:triggerNow': IPCParams<[string], { ok: boolean }>;
  'dailyCare:handleButtonClick': IPCParams<[string, string, string?], { ok: boolean }>;
};

const methods: Array<keyof DailyCareBridgeParams> = [
  'dailyCare:getSnapshot',
  'dailyCare:updateSettings',
  'dailyCare:upsertCustomReminder',
  'dailyCare:removeCustomReminder',
  'dailyCare:triggerNow',
  'dailyCare:handleButtonClick'
];

export type DailyCareBridgeType = {
  [K in keyof DailyCareBridgeParams]: (...args: DailyCareBridgeParams[K]['request']) => Promise<DailyCareBridgeParams[K]['response']>;
} & {
  onSnapshotUpdated: (callback: (snapshot: DailyCareSnapshot) => void) => () => void;
};

const bridge: Partial<DailyCareBridgeType> = {};
methods.forEach((method) => {
  (bridge as any)[method] = (...args: any[]) => ipcRenderer.invoke(method as string, ...args);
});
(bridge as DailyCareBridgeType).onSnapshotUpdated = (callback: (snapshot: DailyCareSnapshot) => void) => {
  const handler = (_event: any, snapshot: DailyCareSnapshot): void => callback(snapshot);
  ipcRenderer.on(DAILY_CARE_SNAPSHOT_UPDATED_CHANNEL, handler);
  return () => ipcRenderer.off(DAILY_CARE_SNAPSHOT_UPDATED_CHANNEL, handler);
};

export const dailyCareBridge = bridge as DailyCareBridgeType;
