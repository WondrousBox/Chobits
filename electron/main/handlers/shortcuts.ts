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
} from '@packages/common/shortcut-store';
import { BrowserWindow, ipcMain } from 'electron';

import { assertSpriteCapabilityUnlocked } from '../../../packages/sprite-core/capability-runtime';
import { notifySpriteCapabilityChanged } from '../../../packages/sprite-core/handlers/capability-broadcast';
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

  // 获取快捷键启用状态配置
  ipcMain.handle('shortcuts:get-enabled-config', () => {
    try {
      return { ok: true, data: loadShortcutEnabledConfig() };
    } catch (e: any) {
      return { ok: false, error: String(e) };
    }
  });

  // 设置快捷键启用状态配置
  ipcMain.handle('shortcuts:set-enabled-config', (_event, partial: Partial<ShortcutEnabledConfig>) => {
    try {
      if (partial.screenshot === true) {
        assertSpriteCapabilityUnlocked('screenshot');
      }
      const next = saveShortcutEnabledConfig(partial);
      if (typeof partial.screenshot === 'boolean') {
        notifySpriteCapabilityChanged({ source: 'shortcuts.screenshot' });
      }
      // notify renderers（notifyShortcutEnabledUpdatedTo 内部会重新读取最新配置并发送 shortcuts:enabled-updated）
      notifyShortcutEnabledUpdatedTo(win);
      return { ok: true, data: next };
    } catch (e: any) {
      return { ok: false, error: String(e) };
    }
  });
}
