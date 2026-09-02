import { ipcMain } from 'electron';

import type { SpritePurposePlannerPreferences } from '../../../../packages/sprite-core/purpose';
import type { SpritePurposePlannerPreferencesStore } from './purpose-planner-preferences';
import type { SpritePurposePlannerService } from './purpose-planner-service';

export function initSpritePurposePlannerHandlers(service: SpritePurposePlannerService, store: SpritePurposePlannerPreferencesStore): void {
  ipcMain.handle('sprite:purpose-planner:get-preferences', () => {
    return service.getPreferences();
  });

  ipcMain.handle('sprite:purpose-planner:update-preferences', async (_event, patch: Partial<SpritePurposePlannerPreferences>) => {
    const preferences = service.updatePreferences(patch ?? {});
    await store.write(preferences);
    return preferences;
  });

  ipcMain.handle('sprite:purpose-planner:get-status', () => {
    return service.getStatus();
  });
}
