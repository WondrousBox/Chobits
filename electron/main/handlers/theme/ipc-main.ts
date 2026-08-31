import fs from 'node:fs';
import path from 'node:path';

import type { ThemeSource } from '@packages/common/types/theme';
import { app, BrowserWindow, ipcMain, nativeTheme } from 'electron';

type ThemePayload = {
  themeSource: ThemeSource;
  shouldUseDarkColors: boolean;
};

const STORE_DIR = path.join(app.getPath('userData'), 'data');
const STORE_FILE = path.join(STORE_DIR, 'theme-preference.json');

const readPersistedTheme = (): ThemeSource | null => {
  try {
    if (!fs.existsSync(STORE_FILE)) return null;
    const content = fs.readFileSync(STORE_FILE, 'utf-8');
    const parsed = JSON.parse(content);
    if (parsed?.themeSource === 'system' || parsed?.themeSource === 'light' || parsed?.themeSource === 'dark') {
      return parsed.themeSource;
    }
  } catch {
    //
  }
  return null;
};

const writePersistedTheme = (themeSource: ThemeSource): void => {
  try {
    fs.mkdirSync(path.dirname(STORE_FILE), { recursive: true });
    fs.writeFileSync(STORE_FILE, JSON.stringify({ themeSource, updatedAt: Date.now() }, null, 2), 'utf-8');
  } catch {
    //
  }
};

const getThemePayload = (): ThemePayload => ({
  themeSource: (nativeTheme.themeSource as ThemeSource) || 'system',
  shouldUseDarkColors: nativeTheme.shouldUseDarkColors
});

const broadcastTheme = (): void => {
  const payload = getThemePayload();
  BrowserWindow.getAllWindows()
    .filter((bw) => !bw.isDestroyed())
    .forEach((bw) => {
      bw.webContents.send('theme:updated', payload);
    });
};

export function initThemeHandlers(): void {
  const persisted = readPersistedTheme();
  if (persisted) {
    nativeTheme.themeSource = persisted;
  }

  ipcMain.handle('theme:get', async () => ({ ok: true, ...getThemePayload() }));

  ipcMain.handle('theme:set', async (_event, themeSource: ThemeSource) => {
    try {
      nativeTheme.themeSource = themeSource;
      writePersistedTheme(themeSource);
      broadcastTheme();
      return { ok: true, ...getThemePayload() };
    } catch (error) {
      return { ok: false, error: String(error), ...getThemePayload() };
    }
  });

  const onThemeUpdated = (): void => {
    broadcastTheme();
  };

  nativeTheme.on('updated', onThemeUpdated);
}
