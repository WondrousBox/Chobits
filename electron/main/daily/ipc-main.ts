import { ipcMain } from 'electron';

import { assertSpriteCapabilityUnlocked } from '../../../packages/sprite-core/capability-runtime';
import { DailyCareService } from './service';
import type { CustomReminderInput, UpdateSettingsPayload } from './types';

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
