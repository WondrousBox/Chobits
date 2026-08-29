import { ipcMain } from 'electron';

import { assertSpriteCapabilityUnlocked } from '../../../packages/sprite-core/capability-runtime';
import { DailyCareService } from './service';
import type { CustomReminderConfig, CustomReminderInput, DailyCareSnapshot, UpdateSettingsPayload } from './types';

function buildDisabledSnapshot(): DailyCareSnapshot {
  return { enabled: false, routines: [], customReminders: [], lastUpdated: Date.now() };
}

/**
 * gamification 功能旗标关闭时注册的降级 handler:
 * 返回禁用态空快照 / { ok: false },渲染侧设置页据此展示"未开启"空态,避免 "No handler registered" 噪音。
 */
export function initDailyCareStubIPC(): void {
  ipcMain.handle('dailyCare:getSnapshot', () => buildDisabledSnapshot());
  ipcMain.handle('dailyCare:updateSettings', () => buildDisabledSnapshot());
  ipcMain.handle('dailyCare:upsertCustomReminder', (_event, payload: CustomReminderInput) => ({
    reminder: { ...payload, id: payload?.id ?? '' } as CustomReminderConfig,
    snapshot: buildDisabledSnapshot()
  }));
  ipcMain.handle('dailyCare:removeCustomReminder', () => buildDisabledSnapshot());
  ipcMain.handle('dailyCare:triggerNow', () => ({ ok: false }));
  ipcMain.handle('dailyCare:handleButtonClick', () => ({ ok: false }));
}

export function initDailyCareIPC(service: DailyCareService): void {
  ipcMain.handle('dailyCare:getSnapshot', () => service.getSnapshot());

  ipcMain.handle('dailyCare:updateSettings', (_event, payload: UpdateSettingsPayload) => {
    if (payload?.enabled !== false) {
      assertSpriteCapabilityUnlocked('dailyCare');
    }
    return service.updateSettings(payload || {});
  });

  ipcMain.handle('dailyCare:upsertCustomReminder', (_event, payload: CustomReminderInput) => {
    assertSpriteCapabilityUnlocked('dailyCare');
    return service.upsertCustomReminder(payload);
  });

  ipcMain.handle('dailyCare:removeCustomReminder', (_event, id: string) => {
    assertSpriteCapabilityUnlocked('dailyCare');
    return service.removeCustomReminder(id);
  });

  ipcMain.handle('dailyCare:triggerNow', (_event, id: string) => {
    assertSpriteCapabilityUnlocked('dailyCare');
    return service.triggerRoutineById(id);
  });

  ipcMain.handle('dailyCare:handleButtonClick', (_event, routineId: string, buttonId: string, action?: string) => {
    assertSpriteCapabilityUnlocked('dailyCare');
    return service.handleButtonClick(routineId, buttonId, action);
  });
}
