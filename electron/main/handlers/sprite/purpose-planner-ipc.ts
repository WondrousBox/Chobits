import { ipcMain } from 'electron';

import type { SpritePurposePlannerPreferences } from '../../../../packages/sprite-core/purpose';
import type { SpritePurposePlannerPreferencesStore } from './purpose-planner-preferences';
import type { SpritePurposePlannerService } from './purpose-planner-service';

export function initSpritePurposePlannerIPC(service: SpritePurposePlannerService, store: SpritePurposePlannerPreferencesStore): void {
  ipcMain.handle('sprite:purposePlanner:getPreferences', () => {
    return service.getPreferences();
  });

  ipcMain.handle('sprite:purposePlanner:updatePreferences', async (_event, patch: Partial<SpritePurposePlannerPreferences>) => {
    const preferences = service.updatePreferences(patch ?? {});
    await store.write(preferences);
    return preferences;
  });

  ipcMain.handle('sprite:purposePlanner:getStatus', () => {
    return service.getStatus();
  });
}
