import { app, ipcMain } from 'electron';

import { type PreferencesConfig, PreferencesStore, type PreviewMode } from './preferences-store';

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

  // 设置 WebRecorder 麦克风设备ID
  ipcMain.handle('preferences:set-web-recorder-device-id', async (_event, payload: { deviceId: string | undefined }) => {
    try {
      const config = PreferencesStore.setWebRecorderDeviceId(payload.deviceId);
      return { ok: true, config };
    } catch (error: any) {
      console.error('[Preferences] 设置 WebRecorder 麦克风设备ID失败:', error);
      return { ok: false, error: error.message || String(error) };
    }
  });
}
