import { app, BrowserWindow, ipcMain } from 'electron';

import { globalInputMonitor } from '../global-input-monitor';
import { SelectedTextLearningConfigStore } from './config-store';
import { SelectedTextLearningService } from './learning-service';
import { SelectedTextTriggerService } from './trigger-service';
import type { SelectedTextLearningConfigPatch, SelectedTextLearningStatus } from './types';

type SelectedTextLearningRuntime = {
  configStore: SelectedTextLearningConfigStore;
  learningService: SelectedTextLearningService;
  triggerService: SelectedTextTriggerService;
};

let runtime: SelectedTextLearningRuntime | null = null;

function getRuntime(): SelectedTextLearningRuntime {
  if (!runtime) {
    throw new Error('selected text learning runtime is not initialized');
  }
  return runtime;
}

function syncTriggerService(targetRuntime = getRuntime()): void {
  const config = targetRuntime.configStore.load();
  if (config.enabled) {
    targetRuntime.triggerService.start();
  } else {
    targetRuntime.triggerService.stop();
  }
}

function getStatus(targetRuntime = getRuntime()): SelectedTextLearningStatus {
  const config = targetRuntime.configStore.load();
  return {
    available: globalInputMonitor.available,
    enabled: config.enabled,
    running: targetRuntime.learningService.isRunning()
  };
}

export function getSelectedTextLearningRuntime(): SelectedTextLearningRuntime | null {
  return runtime;
}

export function initSelectedTextLearningHandlers(win: BrowserWindow): void {
  const configStore = new SelectedTextLearningConfigStore();
  const learningService = new SelectedTextLearningService({
    getConfig: () => configStore.load(),
    getMainWindow: () => {
      if (win && !win.isDestroyed()) return win;
      const fallback = BrowserWindow.getAllWindows().find((item) => !item.isDestroyed());
      return fallback ?? null;
    }
  });
  const triggerService = new SelectedTextTriggerService({
    getConfig: () => configStore.load(),
    onTrigger: async () => {
      await learningService.runFromSelection('hotkey');
    }
  });

  runtime?.triggerService.stop();
  runtime = { configStore, learningService, triggerService };
  syncTriggerService(runtime);

  app.once('before-quit', () => {
    runtime?.triggerService.stop();
  });

  ipcMain.removeHandler('selectedTextLearning:getConfig');
  ipcMain.handle('selectedTextLearning:getConfig', () => configStore.load());

  ipcMain.removeHandler('selectedTextLearning:setConfig');
  ipcMain.handle('selectedTextLearning:setConfig', (_event, patch: SelectedTextLearningConfigPatch) => {
    const next = configStore.save(patch || {});
    syncTriggerService(runtime!);
    return { config: next, ok: true, status: getStatus(runtime!) };
  });

  ipcMain.removeHandler('selectedTextLearning:getStatus');
  ipcMain.handle('selectedTextLearning:getStatus', () => getStatus(runtime!));

  ipcMain.removeHandler('selectedTextLearning:testReadSelection');
  ipcMain.handle('selectedTextLearning:testReadSelection', () => learningService.testReadSelection());

  ipcMain.removeHandler('selectedTextLearning:triggerNow');
  ipcMain.handle('selectedTextLearning:triggerNow', () => learningService.runFromSelection('manual'));

  ipcMain.removeHandler('selectedTextLearning:openLatestOverlay');
  ipcMain.handle('selectedTextLearning:openLatestOverlay', () => learningService.openLatestOverlay());
}
