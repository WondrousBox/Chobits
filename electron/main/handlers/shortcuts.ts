import { getShortcutSchema, loadShortcutsConfig, notifyShortcutsUpdatedTo, saveShortcutsConfig, type ShortcutsConfig } from '@packages/common/shortcut-store';
import { BrowserWindow, ipcMain } from 'electron';

import { validateShortcutsConfig } from '../shortcuts';

export function initShortcutsHandlers(win: BrowserWindow): void {
  ipcMain.handle('shortcuts:get-config', () => {
    try {
      return { ok: true, data: loadShortcutsConfig() };
    } catch (e: any) {
      return { ok: false, error: String(e) };
    }
  });

  ipcMain.handle('shortcuts:get-schema', () => {
    try {
      return { ok: true, data: getShortcutSchema() };
    } catch (e: any) {
      return { ok: false, error: String(e) };
    }
  });

  ipcMain.handle('shortcuts:validate', async (_event, partial: Partial<ShortcutsConfig>) => {
    try {
      const result = await validateShortcutsConfig(partial);
      return { ok: result.ok, data: result };
    } catch (e: any) {
      return { ok: false, error: String(e) };
    }
  });

  ipcMain.handle('shortcuts:set-config', (_event, partial: Partial<ShortcutsConfig>) => {
    try {
      const next = saveShortcutsConfig(partial);
      // notify renderers（notifyShortcutsUpdatedTo 内部会重新读取最新配置并发送 shortcuts:config-updated）
      notifyShortcutsUpdatedTo(win);
      return { ok: true, data: next };
    } catch (e: any) {
      return { ok: false, error: String(e) };
    }
  });
}
