import type { PreferencesConfig, PreviewMode } from '@packages/common/types/preferences';
import { ipcRenderer } from 'electron';

export type { PreferencesConfig, PreviewMode } from '@packages/common/types/preferences';

export type PreferencesIpcType = typeof preferencesIpcRenderer;

export const preferencesIpcRenderer = {
  /**
   * 获取完整配置
   */
  'preferences:getConfig': async (): Promise<{ ok: boolean; config?: PreferencesConfig; error?: string }> => {
    return await ipcRenderer.invoke('preferences:getConfig');
  },

  /**
   * 设置配置
   */
  'preferences:setConfig': async (payload: { config: Partial<PreferencesConfig> }): Promise<{ ok: boolean; config?: PreferencesConfig; error?: string }> => {
    return await ipcRenderer.invoke('preferences:setConfig', payload);
  },

  /**
   * 获取预览模式
   */
  'preferences:getPreviewMode': async (): Promise<{ ok: boolean; previewMode?: PreviewMode; error?: string }> => {
    return await ipcRenderer.invoke('preferences:getPreviewMode');
  },

  /**
   * 设置预览模式
   */
  'preferences:setPreviewMode': async (payload: { mode: PreviewMode }): Promise<{ ok: boolean; config?: PreferencesConfig; error?: string }> => {
    return await ipcRenderer.invoke('preferences:setPreviewMode', payload);
  },

  /**
   * 获取 WebRecorder 麦克风设备ID
   */
  'preferences:getWebRecorderDeviceId': async (): Promise<{
    ok: boolean;
    deviceId?: string;
    error?: string;
  }> => {
    return await ipcRenderer.invoke('preferences:getWebRecorderDeviceId');
  },

  /**
   * 设置 WebRecorder 麦克风设备ID
   */
  'preferences:setWebRecorderDeviceId': async (payload: { deviceId: string | undefined }): Promise<{ ok: boolean; config?: PreferencesConfig; error?: string }> => {
    return await ipcRenderer.invoke('preferences:setWebRecorderDeviceId', payload);
  }
};
