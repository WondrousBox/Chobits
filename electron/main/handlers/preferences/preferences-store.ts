import fs from 'node:fs';
import path from 'node:path';

import { app } from 'electron';

import type { MusicReactivityPreferences } from '../../../../packages/audio-reactivity/types';
import { DEFAULT_MUSIC_REACTIVITY_PREFERENCES, normalizeMusicReactivityPreferences } from '../../../../packages/audio-reactivity/types';
import type { OnboardingState } from '../../../../packages/sprite-core/quest';

// 预览模式类型: 'window' 表示弹窗，'panel' 表示右侧面板
export type PreviewMode = 'window' | 'panel';

// 偏好设置配置接口
export interface PreferencesConfig {
  // 预览模式
  previewMode: PreviewMode;
  // WebRecorder 麦克风设备ID
  webRecorderDeviceId?: string;
  assistantMiniWindowEnabled: boolean;
  musicReactivity: MusicReactivityPreferences;
  /** 新手引导 / Quest 系统状态（由 QuestEngine 持久化，结构由 sprite-core/quest 定义） */
  onboardingState?: OnboardingState;
}

// 默认配置
const DEFAULT_CONFIG: PreferencesConfig = {
  previewMode: 'window',
  assistantMiniWindowEnabled: false,
  musicReactivity: DEFAULT_MUSIC_REACTIVITY_PREFERENCES
};

type StoreShape = {
  preferences: PreferencesConfig;
};

const STORE_DIR = path.join(app.getPath('userData'), 'data');
const STORE_FILE = path.join(STORE_DIR, 'preferences-config.json');

/**
 * 确保存储文件存在
 */
function ensureStore(): void {
  if (!fs.existsSync(STORE_DIR)) {
    fs.mkdirSync(STORE_DIR, { recursive: true });
  }
  if (!fs.existsSync(STORE_FILE)) {
    fs.writeFileSync(STORE_FILE, JSON.stringify({ preferences: DEFAULT_CONFIG } as StoreShape, null, 2));
  }
}

/**
 * 读取配置
 */
function read(): StoreShape {
  ensureStore();
  try {
    const raw = fs.readFileSync(STORE_FILE, 'utf-8');
    const data = JSON.parse(raw);
    return {
      preferences: {
        previewMode: data.preferences?.previewMode || DEFAULT_CONFIG.previewMode,
        webRecorderDeviceId: data.preferences?.webRecorderDeviceId,
        assistantMiniWindowEnabled: typeof data.preferences?.assistantMiniWindowEnabled === 'boolean' ? data.preferences.assistantMiniWindowEnabled : DEFAULT_CONFIG.assistantMiniWindowEnabled,
        musicReactivity: normalizeMusicReactivityPreferences(data.preferences?.musicReactivity),
        onboardingState: data.preferences?.onboardingState
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
  ensureStore();
  try {
    fs.writeFileSync(STORE_FILE, JSON.stringify(next, null, 2));
  } catch (error) {
    console.error('[PreferencesStore] 写入配置失败:', error);
    throw error;
  }
}

/**
 * 偏好设置存储
 */
export const PreferencesStore = {
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
  },

  /**
   * 获取音乐响应配置
   */
  getMusicReactivity(): MusicReactivityPreferences {
    return this.getConfig().musicReactivity;
  },

  /**
   * 设置音乐响应配置
   */
  setMusicReactivity(config: Partial<MusicReactivityPreferences>): PreferencesConfig {
    return this.setConfig({
      musicReactivity: normalizeMusicReactivityPreferences({
        ...this.getMusicReactivity(),
        ...config
      })
    });
  },

  /**
   * 获取新手引导/Quest 状态
   */
  getOnboardingState(): OnboardingState | undefined {
    return this.getConfig().onboardingState;
  },

  /**
   * 设置新手引导/Quest 状态（QuestEngine 持久化用）
   */
  setOnboardingState(state: OnboardingState): PreferencesConfig {
    return this.setConfig({ onboardingState: state });
  }
};
