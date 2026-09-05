import type { LanguagePreference } from '@packages/common/types/preferences';
import { setSpriteMessagesLanguage } from '@packages/sprite-core/messages';
import { app, BrowserWindow, ipcMain } from 'electron';

import { type PreferencesConfig, PreferencesStore, type PreviewMode, resolveAppLanguage } from './preferences-store';

/**
 * 语言变更广播：各窗口是独立渲染进程，各有自己的 i18n 实例，
 * 需要主进程通知所有窗口同步切换
 */
const broadcastLanguageChange = (language: LanguagePreference): void => {
  BrowserWindow.getAllWindows()
    .filter((bw) => !bw.isDestroyed())
    .forEach((bw) => {
      bw.webContents.send('preferences:language-changed', language);
    });
};

/**
 * 初始化偏好设置 IPC 处理程序
 */
export function initPreferencesHandlers(): void {
  // 获取完整配置
  ipcMain.handle('preferences:get-config', async () => {
    try {
      return { ok: true, config: PreferencesStore.getConfig() };
    } catch (error: any) {
      console.error('[Preferences] 获取配置失败:', error);
      return { ok: false, error: error.message || String(error) };
    }
  });

  // 设置配置
  ipcMain.handle('preferences:set-config', async (_event, payload: { config: Partial<PreferencesConfig> }) => {
    try {
      const config = PreferencesStore.setConfig(payload.config);
      // 开机自启动立即生效;失败仅记录日志,下次启动时会按持久化配置重试
      if (typeof payload.config.launchAtLoginEnabled === 'boolean') {
        try {
          app.setLoginItemSettings({ openAtLogin: payload.config.launchAtLoginEnabled });
        } catch (error) {
          console.error('[Preferences] 应用开机自启动设置失败:', error);
        }
      }
      // 语言变更立即广播到所有窗口，无需重启；主进程侧的精灵消息目录同步切换
      if (payload.config.language) {
        setSpriteMessagesLanguage(resolveAppLanguage());
        broadcastLanguageChange(payload.config.language);
      }
      return { ok: true, config };
    } catch (error: any) {
      console.error('[Preferences] 设置配置失败:', error);
      return { ok: false, error: error.message || String(error) };
    }
  });

  // 获取预览模式
  ipcMain.handle('preferences:get-preview-mode', async () => {
    try {
      return { ok: true, previewMode: PreferencesStore.getPreviewMode() };
    } catch (error: any) {
      console.error('[Preferences] 获取预览模式失败:', error);
      return { ok: false, error: error.message || String(error) };
    }
  });

  // 设置预览模式
  ipcMain.handle('preferences:set-preview-mode', async (_event, payload: { mode: PreviewMode }) => {
    try {
      const config = PreferencesStore.setPreviewMode(payload.mode);
      return { ok: true, config };
    } catch (error: any) {
      console.error('[Preferences] 设置预览模式失败:', error);
      return { ok: false, error: error.message || String(error) };
    }
  });

  // 获取 WebRecorder 麦克风设备ID
  ipcMain.handle('preferences:get-web-recorder-device-id', async () => {
    try {
      return { ok: true, deviceId: PreferencesStore.getWebRecorderDeviceId() };
    } catch (error: any) {
      console.error('[Preferences] 获取 WebRecorder 麦克风设备ID失败:', error);
      return { ok: false, error: error.message || String(error) };
    }
  });
}
