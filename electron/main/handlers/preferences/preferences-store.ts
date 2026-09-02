import fs from 'node:fs';
import path from 'node:path';

import type { PreferencesConfig, PreviewMode } from '@packages/common/types/preferences';
import { app } from 'electron';

export type { PreferencesConfig, PreviewMode } from '@packages/common/types/preferences';

// 默认配置
const DEFAULT_CONFIG: PreferencesConfig = {
  previewMode: 'window',
  miniChatWindowEnabled: true
};

type StoreShape = {
  preferences: PreferencesConfig;
};

/**
 * 惰性计算存储路径:避免在模块加载时调用 app.getPath(测试环境中 electron app 不可用)
 */
function getStorePaths(): { dir: string; file: string } {
  const dir = path.join(app.getPath('userData'), 'data');
  return { dir, file: path.join(dir, 'preferences-config.json') };
}

/**
 * 确保存储文件存在
 */
function ensureStore(): { dir: string; file: string } {
  const { dir, file } = getStorePaths();
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  if (!fs.existsSync(file)) {
    fs.writeFileSync(file, JSON.stringify({ preferences: DEFAULT_CONFIG } as StoreShape, null, 2));
  }
  return { dir, file };
}

/**
 * 读取配置
 */
function read(): StoreShape {
  const { file } = ensureStore();
  try {
    const raw = fs.readFileSync(file, 'utf-8');
    const data = JSON.parse(raw);
    return {
      preferences: {
        previewMode: data.preferences?.previewMode || DEFAULT_CONFIG.previewMode,
        webRecorderDeviceId: data.preferences?.webRecorderDeviceId,
        miniChatWindowEnabled: typeof data.preferences?.miniChatWindowEnabled === 'boolean' ? data.preferences.miniChatWindowEnabled : DEFAULT_CONFIG.miniChatWindowEnabled,
        featureFlags: data.preferences?.featureFlags
      }
    };
  } catch (error) {
    console.warn('[PreferencesStore] 读取配置失败，使用默认值:', error);
    return { preferences: DEFAULT_CONFIG };
  }
}

/**
 * 写入配置
 */
function write(next: StoreShape): void {
  const { file } = ensureStore();
  try {
    fs.writeFileSync(file, JSON.stringify(next, null, 2));
  } catch (error) {
    console.error('[PreferencesStore] 写入配置失败:', error);
    throw error;
  }
}

/**
 * 偏好设置存储
 */
export const PreferencesStore = {
  getStoreLocation(): { file: string; dir: string } {
    return ensureStore();
  },

  /**
   * 获取完整配置
   */
  getConfig(): PreferencesConfig {
    return read().preferences;
  },

  /**
   * 设置完整配置
   */
  setConfig(config: Partial<PreferencesConfig>): PreferencesConfig {
    const current = read();
    const merged: PreferencesConfig = {
      ...current.preferences,
      ...config
    };
    write({ ...current, preferences: merged });
    return merged;
  },

  /**
   * 获取预览模式
   */
  getPreviewMode(): PreviewMode {
    return this.getConfig().previewMode;
  },

  /**
   * 设置预览模式
   */
  setPreviewMode(mode: PreviewMode): PreferencesConfig {
    return this.setConfig({ previewMode: mode });
  },

  /**
   * 获取 WebRecorder 麦克风设备ID
   */
  getWebRecorderDeviceId(): string | undefined {
    return this.getConfig().webRecorderDeviceId;
  },

  /**
   * 设置 WebRecorder 麦克风设备ID
   */
  setWebRecorderDeviceId(deviceId: string | undefined): PreferencesConfig {
    return this.setConfig({ webRecorderDeviceId: deviceId });
  }
};
