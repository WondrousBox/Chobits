import { FEATURE_DEFINITIONS, resolveFeatureFlags, type FeatureKey } from '../../packages/common/feature-flags';

import { PreferencesStore } from './handlers/preferences/preferences-store';

export { FEATURE_DEFINITIONS, type FeatureKey };

/**
 * 读取完整功能旗标表(默认值 + 用户覆盖)
 *
 * 存储不可用时(如测试环境或配置损坏)回退到默认值
 */
export function getFeatureFlags(): Record<FeatureKey, boolean> {
  try {
    return resolveFeatureFlags(PreferencesStore.getConfig().featureFlags);
  } catch (error) {
    console.warn('[FeatureFlags] failed to read flags, falling back to defaults:', error);
    return resolveFeatureFlags();
  }
}

/**
 * 某个功能是否启用
 *
 * 注意:主进程在 initHandlers 等启动路径调用,运行期切换开关需重启生效
 */
export function isFeatureEnabled(key: FeatureKey): boolean {
  return getFeatureFlags()[key];
}
