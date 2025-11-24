import { BrowserWindow, ipcMain, nativeTheme } from 'electron';

type ThemeSource = 'system' | 'light' | 'dark';

type ThemePayload = {
  themeSource: ThemeSource;
  shouldUseDarkColors: boolean;
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
  ipcMain.handle('theme:get', async () => ({ ok: true, ...getThemePayload() }));

  ipcMain.handle('theme:set', async (_event, themeSource: ThemeSource) => {
    try {
      nativeTheme.themeSource = themeSource;
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
