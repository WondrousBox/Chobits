import { ipcMain } from 'electron';

import { DailyCareService } from './service';
import type { CustomReminderInput, UpdateSettingsPayload } from './types';

export function initDailyCareIPC(service: DailyCareService): void {
  ipcMain.handle('dailyCare:getSnapshot', () => service.getSnapshot());

  ipcMain.handle('dailyCare:updateSettings', (_event, payload: UpdateSettingsPayload) => {
    return service.updateSettings(payload || {});
  });

  ipcMain.handle('dailyCare:upsertCustomReminder', (_event, payload: CustomReminderInput) => {
    return service.upsertCustomReminder(payload);
  });

  ipcMain.handle('dailyCare:removeCustomReminder', (_event, id: string) => {
    return service.removeCustomReminder(id);
  });

  ipcMain.handle('dailyCare:triggerNow', (_event, id: string) => {
    return service.triggerRoutineById(id);
  });
}
