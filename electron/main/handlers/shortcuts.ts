import { BrowserWindow, ipcMain } from 'electron';
import { loadShortcutsConfig, saveShortcutsConfig, notifyShortcutsUpdatedTo, getShortcutSchema, type ShortcutsConfig } from '../shortcut-store';
import { validateShortcutsConfig } from '../shortcuts';

export function initShortcutsHandlers(win: BrowserWindow): void {
    ipcMain.handle('shortcuts:getConfig', () => {
        try {
            return { ok: true, data: loadShortcutsConfig() };
        } catch (e: any) {
            return { ok: false, error: String(e) };
        }
    });

    ipcMain.handle('shortcuts:getSchema', () => {
        try {
            return { ok: true, data: getShortcutSchema() };
        } catch (e: any) {
            return { ok: false, error: String(e) };
        }
    });

    ipcMain.handle('shortcuts:validate', async (_evt, partial: Partial<ShortcutsConfig>) => {
        try {
            const res = await validateShortcutsConfig(partial);
            return { ok: res.ok, data: res };
        } catch (e: any) {
            return { ok: false, error: String(e) };
        }
    });

    ipcMain.handle('shortcuts:setConfig', (_evt, partial: Partial<ShortcutsConfig>) => {
        try {
            const next = saveShortcutsConfig(partial);
            // notify renderers
            try {
                win?.webContents?.send('shortcuts-config-updated', next);
            } catch {
                /* ignore */
            }
            notifyShortcutsUpdatedTo(win);
            return { ok: true, data: next };
        } catch (e: any) {
            return { ok: false, error: String(e) };
        }
    });
}
