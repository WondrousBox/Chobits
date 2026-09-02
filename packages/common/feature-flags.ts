/**
 * 全局功能旗标(主进程与渲染进程共享的纯定义,不依赖 electron)
 *
 * mini 分支只保留本地 AI 推理(sherpa 本地 ASR)开关;
 * 旗标存储于 preferences-config.json 的 featureFlags 字段。
 */

export type FeatureKey = 'localAI';

export interface FeatureDefinition {
  key: FeatureKey;
  label: string;
  description: string;
  defaultEnabled: boolean;
}

export const FEATURE_DEFINITIONS: FeatureDefinition[] = [
  {
    key: 'localAI',
    label: '本地 AI 推理',
    description: '本地语音识别(sherpa),无需联网但占用更多磁盘与内存',
    defaultEnabled: true
  }
];

/**
 * 以默认值为底、用户覆盖优先,解析出完整旗标表
 */
export function resolveFeatureFlags(overrides?: Record<string, boolean>): Record<FeatureKey, boolean> {
  const flags = {} as Record<FeatureKey, boolean>;

  for (const def of FEATURE_DEFINITIONS) {
    flags[def.key] = typeof overrides?.[def.key] === 'boolean' ? overrides[def.key] : def.defaultEnabled;
  }

  return flags;
}
