/**
 * 全局功能旗标(主进程与渲染进程共享的纯定义,不依赖 electron)
 *
 * 用于将不常用功能默认关闭;用户可在「设置 → 功能管理」中重新开启。
 * 旗标存储于 preferences-config.json 的 featureFlags 字段。
 */

export type FeatureKey =
  | 'gamification'
  | 'music'
  | 'rss'
  | 'projectTracking'
  | 'recording'
  | 'spleeter'
  | 'emojiPacks'
  | 'analytics'
  | 'workflow'
  | 'localAi';

export interface FeatureDefinition {
  key: FeatureKey;
  label: string;
  description: string;
  defaultEnabled: boolean;
}

export const FEATURE_DEFINITIONS: FeatureDefinition[] = [
  {
    key: 'gamification',
    label: '游戏化系统',
    description: '任务、成就、等级、新手引导、日常关心等养成玩法',
    defaultEnabled: false
  },
  {
    key: 'music',
    label: '音乐功能',
    description: 'AI 音乐生成、音频舞动、音乐频谱窗',
    defaultEnabled: false
  },
  {
    key: 'rss',
    label: 'RSS 订阅',
    description: '订阅 RSS / 视频源并自动整理入库',
    defaultEnabled: false
  },
  {
    key: 'projectTracking',
    label: '项目追踪',
    description: '从对话中提取项目进展并跟踪',
    defaultEnabled: false
  },
  {
    key: 'recording',
    label: '录屏与录音',
    description: '屏幕录制、麦克风 / 系统音频录制、网页录制',
    defaultEnabled: false
  },
  {
    key: 'spleeter',
    label: '人声分离',
    description: '音视频人声 / 伴奏分离(spleeter)',
    defaultEnabled: false
  },
  {
    key: 'emojiPacks',
    label: '表情包',
    description: '表情包收藏与发送',
    defaultEnabled: false
  },
  {
    key: 'analytics',
    label: '统计分析页',
    description: '资源库中的用量统计页面(仅隐藏页面,数据统计继续)',
    defaultEnabled: false
  },
  {
    key: 'workflow',
    label: '工作流引擎',
    description: '可视化编排自动化工作流(高级功能)',
    defaultEnabled: false
  },
  {
    key: 'localAi',
    label: '本地 AI 推理',
    description: '本地语音识别(sherpa)与 OCR,无需联网但占用更多磁盘与内存',
    defaultEnabled: false
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
