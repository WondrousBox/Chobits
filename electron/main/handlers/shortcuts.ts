import { BrowserWindow, ipcMain } from 'electron';

import { assertSpriteCapabilityUnlocked } from '../../../packages/sprite-core/capability-runtime';
import { notifySpriteCapabilityChanged } from '../../../packages/sprite-core/handler/capability-events';
import {
  getShortcutSchema,
  loadShortcutEnabledConfig,
  loadShortcutsConfig,
  notifyShortcutEnabledUpdatedTo,
  notifyShortcutsUpdatedTo,
  saveShortcutEnabledConfig,
  saveShortcutsConfig,
  type ShortcutEnabledConfig,
  type ShortcutsConfig
} from '../shortcut-store';
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
      // notify renderers（notifyShortcutsUpdatedTo 内部会重新读取最新配置并发送 shortcuts-config-updated）
      notifyShortcutsUpdatedTo(win);
      return { ok: true, data: next };
    } catch (e: any) {
      return { ok: false, error: String(e) };
    }
  });

  // 获取快捷键启用状态配置
  ipcMain.handle('shortcuts:getEnabledConfig', () => {
    try {
      return { ok: true, data: loadShortcutEnabledConfig() };
    } catch (e: any) {
      return { ok: false, error: String(e) };
    }
  });

  // 设置快捷键启用状态配置
  ipcMain.handle('shortcuts:setEnabledConfig', (_evt, partial: Partial<ShortcutEnabledConfig>) => {
    try {
      if (partial.screenshot === true) {
        assertSpriteCapabilityUnlocked('screenshot');
      }
      const next = saveShortcutEnabledConfig(partial);
      if (typeof partial.screenshot === 'boolean') {
        notifySpriteCapabilityChanged({ source: 'shortcuts.screenshot' });
      }
      // notify renderers（notifyShortcutEnabledUpdatedTo 内部会重新读取最新配置并发送 shortcuts-enabled-updated）
      notifyShortcutEnabledUpdatedTo(win);
      return { ok: true, data: next };
    } catch (e: any) {
      return { ok: false, error: String(e) };
    }
  });
}
