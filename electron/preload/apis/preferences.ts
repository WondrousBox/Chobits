import type { LanguagePreference, PreferencesConfig, PreviewMode } from '@packages/common/types/preferences';
import { ipcRenderer, type IpcRendererEvent } from 'electron';

export type { PreferencesConfig, PreviewMode } from '@packages/common/types/preferences';

export type PreferencesBridgeType = typeof preferencesBridge;

export const preferencesBridge = {
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
   * 订阅语言变更广播（任意窗口切换语言时，主进程通知所有窗口同步）
   */
  'preferences:onLanguageChange': (callback: (language: LanguagePreference) => void): (() => void) => {
    const listener = (_event: IpcRendererEvent, language: LanguagePreference): void => callback(language);
    ipcRenderer.on('preferences:language-changed', listener);
    return () => ipcRenderer.off('preferences:language-changed', listener);
  }
};
