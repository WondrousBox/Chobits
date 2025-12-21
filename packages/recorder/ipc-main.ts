import fs from 'node:fs';
import path from 'node:path';

import { app, ipcMain } from 'electron';

import { recorderServer } from './index';

export type RecorderConfig = {
  enabled?: boolean;
};

export function initRecorderHandlers(): void {
  // Recorder config persistence
  const defaultConfig: RecorderConfig = {
    enabled: false
  };
  const configDir = app.getPath('userData');
  const configFile = path.join(configDir, 'data', 'recorder-config.json');
  let recorderConfig: RecorderConfig = defaultConfig;

  // Load config on startup
  try {
    if (fs.existsSync(configFile)) {
      const txt = fs.readFileSync(configFile, 'utf8');
      const parsed = JSON.parse(txt);
      recorderConfig = { ...defaultConfig, ...parsed };
    }
  } catch {
    recorderConfig = defaultConfig;
  }

  function saveConfig(): void {
    try {
      const dir = path.dirname(configFile);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.writeFileSync(configFile, JSON.stringify(recorderConfig, null, 2), 'utf8');
    } catch {
      //
    }
  }

  // Auto-start recorder if enabled
  if (recorderConfig.enabled) {
    recorderServer.start().catch((error) => {
      console.error('[Recorder] Failed to auto-start recorder:', error);
    });
  }

  ipcMain.handle('recorder:start', async (_, port?: number) => {
    return recorderServer.start(port);
  });

  ipcMain.handle('recorder:stop', async () => {
    return recorderServer.stop();
  });

  ipcMain.handle('recorder:status', async () => {
    return recorderServer.isRunning();
  });

  ipcMain.handle('recorder:getConfig', () => {
    return recorderConfig;
  });

  ipcMain.handle('recorder:updateConfig', (_, partial: Partial<RecorderConfig>) => {
    recorderConfig = { ...recorderConfig, ...partial };
    saveConfig();
    return recorderConfig;
  });
}
