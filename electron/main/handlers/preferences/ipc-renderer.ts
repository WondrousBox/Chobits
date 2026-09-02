import type { PreferencesConfig, PreviewMode } from '@packages/common/types/preferences';
import { ipcRenderer } from 'electron';

export type { PreferencesConfig, PreviewMode } from '@packages/common/types/preferences';

export type PreferencesIpcType = typeof preferencesIpcRenderer;

export const preferencesIpcRenderer = {
  /**
   * 获取完整配置
   */
  'preferences:get-config': async (): Promise<{ ok: boolean; config?: PreferencesConfig; error?: string }> => {
    return await ipcRenderer.invoke('preferences:get-config');
  },

  /**
   * 设置配置
   */
  'preferences:set-config': async (payload: { config: Partial<PreferencesConfig> }): Promise<{ ok: boolean; config?: PreferencesConfig; error?: string }> => {
    return await ipcRenderer.invoke('preferences:set-config', payload);
  },

  /**
   * 获取预览模式
   */
  'preferences:get-preview-mode': async (): Promise<{ ok: boolean; previewMode?: PreviewMode; error?: string }> => {
    return await ipcRenderer.invoke('preferences:get-preview-mode');
  },

  /**
   * 设置预览模式
   */
  'preferences:set-preview-mode': async (payload: { mode: PreviewMode }): Promise<{ ok: boolean; config?: PreferencesConfig; error?: string }> => {
    return await ipcRenderer.invoke('preferences:set-preview-mode', payload);
  },

  /**
   * 获取 WebRecorder 麦克风设备ID
   */
  'preferences:get-web-recorder-device-id': async (): Promise<{
    ok: boolean;
    deviceId?: string;
    error?: string;
  }> => {
    return await ipcRenderer.invoke('preferences:get-web-recorder-device-id');
  },

  /**
   * 设置 WebRecorder 麦克风设备ID
   */
  'preferences:set-web-recorder-device-id': async (payload: { deviceId: string | undefined }): Promise<{ ok: boolean; config?: PreferencesConfig; error?: string }> => {
    return await ipcRenderer.invoke('preferences:set-web-recorder-device-id', payload);
  }
};
