import { FEATURE_DEFINITIONS, resolveFeatureFlags, type FeatureKey } from '../../packages/common/feature-flags';

import { PreferencesStore } from './handlers/preferences/preferences-store';

export { FEATURE_DEFINITIONS, type FeatureKey };

/**
 * 读取完整功能旗标表(默认值 + 用户覆盖)
 */
export function getFeatureFlags(): Record<FeatureKey, boolean> {
  return resolveFeatureFlags(PreferencesStore.getConfig().featureFlags);
}

/**
 * 某个功能是否启用
 *
 * 注意:主进程在 initHandlers 等启动路径调用,运行期切换开关需重启生效
 */
export function isFeatureEnabled(key: FeatureKey): boolean {
  return getFeatureFlags()[key];
}
