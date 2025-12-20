import { ipcMain } from 'electron';

import { recorderServer } from './index';

export function initRecorderHandlers(): void {
  ipcMain.handle('recorder:start', async (_, port?: number) => {
    return recorderServer.start(port);
  });

  ipcMain.handle('recorder:stop', async () => {
    return recorderServer.stop();
  });
}
