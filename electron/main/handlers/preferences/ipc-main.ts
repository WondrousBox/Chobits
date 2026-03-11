import { ipcMain } from 'electron';

import { type PreferencesConfig, type PreviewMode, PreferencesStore } from './preferences-store';

/**
 * 初始化偏好设置 IPC 处理程序
 */
export function initPreferencesHandlers(): void {
  // 获取完整配置
  ipcMain.handle('preferences:getConfig', async () => {
    try {
      return { ok: true, config: PreferencesStore.getConfig() };
    } catch (error: any) {
      console.error('[Preferences] 获取配置失败:', error);
      return { ok: false, error: error.message || String(error) };
    }
  });

  // 设置配置
  ipcMain.handle('preferences:setConfig', async (_e, payload: { config: Partial<PreferencesConfig> }) => {
    try {
      const config = PreferencesStore.setConfig(payload.config);
      return { ok: true, config };
    } catch (error: any) {
      console.error('[Preferences] 设置配置失败:', error);
      return { ok: false, error: error.message || String(error) };
    }
  });

  // 获取预览模式
  ipcMain.handle('preferences:getPreviewMode', async () => {
    try {
      return { ok: true, previewMode: PreferencesStore.getPreviewMode() };
    } catch (error: any) {
      console.error('[Preferences] 获取预览模式失败:', error);
      return { ok: false, error: error.message || String(error) };
    }
  });

  // 设置预览模式
  ipcMain.handle('preferences:setPreviewMode', async (_e, payload: { mode: PreviewMode }) => {
    try {
      const config = PreferencesStore.setPreviewMode(payload.mode);
      return { ok: true, config };
    } catch (error: any) {
      console.error('[Preferences] 设置预览模式失败:', error);
      return { ok: false, error: error.message || String(error) };
    }
  });

  // 获取 WebRecorder 麦克风设备ID
  ipcMain.handle('preferences:getWebRecorderDeviceId', async () => {
    try {
      return { ok: true, deviceId: PreferencesStore.getWebRecorderDeviceId() };
    } catch (error: any) {
      console.error('[Preferences] 获取 WebRecorder 麦克风设备ID失败:', error);
      return { ok: false, error: error.message || String(error) };
    }
  });

  // 设置 WebRecorder 麦克风设备ID
  ipcMain.handle('preferences:setWebRecorderDeviceId', async (_e, payload: { deviceId: string | undefined }) => {
    try {
      const config = PreferencesStore.setWebRecorderDeviceId(payload.deviceId);
      return { ok: true, config };
    } catch (error: any) {
      console.error('[Preferences] 设置 WebRecorder 麦克风设备ID失败:', error);
      return { ok: false, error: error.message || String(error) };
    }
  });
}
