import {
  TbBell,
  TbBrain,
  TbCalendarEvent,
  TbCamera,
  TbEar,
  TbFileText,
  TbHeartbeat,
  TbLanguage,
  TbMessageChatbot,
  TbMicrophone,
  TbMoodKid,
  TbPalette,
  TbPhoto,
  TbRobot,
  TbRun,
  TbScreenShare,
  TbSparkles,
  TbSubtask,
  TbVideo,
  TbVolume,
  TbWand,
  TbWriting
} from 'react-icons/tb';

export type SkillStatus = 'locked' | 'unlocked' | 'active';

// 技能等级
export type SkillTier = 'beginner' | 'intermediate' | 'advanced' | 'professional' | 'master';

export const skillTierConfig: Record<SkillTier, { label: string; color: string; order: number }> = {
  beginner: { label: '初级', color: '#22c55e', order: 0 },
  intermediate: { label: '中级', color: '#3b82f6', order: 1 },
  advanced: { label: '高级', color: '#a855f7', order: 2 },
  professional: { label: '专业', color: '#f97316', order: 3 },
  master: { label: '大师', color: '#ef4444', order: 4 }
};

export interface SkillNode {
  id: string;
  name: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  branch: string; // 技能分支 ID
  tier: SkillTier; // 技能等级
  column: number; // 列位置（同一等级内可以有多列）
  row: number; // 行位置（用于垂直分支）
  prerequisites: string[]; // 前置技能 IDs
  settingsKey?: string; // 映射到实际设置组件的 key
  unlockCondition?: string; // 解锁条件描述
}

export interface SkillBranch {
  id: string;
  name: string;
  color: string;
  glowColor: string;
  gradientFrom: string;
  gradientTo: string;
}

// 技能分支配色方案
export const skillBranches: Record<string, SkillBranch> = {
  core: {
    id: 'core',
    name: '精灵核心',
    color: '#fbbf24',
    glowColor: 'rgba(251, 191, 36, 0.6)',
    gradientFrom: '#fbbf24',
    gradientTo: '#f59e0b'
  },
  perception: {
    id: 'perception',
    name: '感知系',
    color: '#f97316',
    glowColor: 'rgba(249, 115, 22, 0.6)',
    gradientFrom: '#f97316',
    gradientTo: '#ea580c'
  },
  care: {
    id: 'care',
    name: '关怀系',
    color: '#22c55e',
    glowColor: 'rgba(34, 197, 94, 0.6)',
    gradientFrom: '#22c55e',
    gradientTo: '#16a34a'
  },
  avatar: {
    id: 'avatar',
    name: '化身系',
    color: '#a855f7',
    glowColor: 'rgba(168, 85, 247, 0.6)',
    gradientFrom: '#a855f7',
    gradientTo: '#7c3aed'
  },
  intelligence: {
    id: 'intelligence',
    name: '智能系',
    color: '#3b82f6',
    glowColor: 'rgba(59, 130, 246, 0.6)',
    gradientFrom: '#3b82f6',
    gradientTo: '#1d4ed8'
  }
};

// 技能树节点数据 - 从左到右，分支结构
// column: 列位置，同一等级可以有多列（0, 1, 2...）
// row: 行位置，用于垂直排列
export const skillTreeNodes: SkillNode[] = [
  // ============ 感知系分支 (row 0-2) ============
  // 初级 第1列 - 麦克风
  {
    id: 'microphone',
    name: '麦克风录音',
    description: '开启麦克风采集能力，录制语音输入',
    icon: TbMicrophone,
    branch: 'perception',
    tier: 'beginner',
    column: 0,
    row: 0,
    prerequisites: [],
    settingsKey: 'recorder'
  },
  // 初级 第1列 - 系统音频
  {
    id: 'systemAudio',
    name: '系统音频',
    description: '采集电脑系统音频输出',
    icon: TbVolume,
    branch: 'perception',
    tier: 'beginner',
    column: 0,
    row: 1,
    prerequisites: [],
    settingsKey: 'recorder'
  },
  // 初级 第1列 - 截图
  {
    id: 'screenshot',
    name: '屏幕截图',
    description: '快速截取屏幕内容',
    icon: TbCamera,
    branch: 'perception',
    tier: 'beginner',
    column: 0,
    row: 2,
    prerequisites: []
  },
  // 初级 第2列 - 语音识别
  {
    id: 'speechRecognition',
    name: '语音识别',
    description: '将语音转换为文字',
    icon: TbEar,
    branch: 'perception',
    tier: 'beginner',
    column: 1,
    row: 0,
    prerequisites: ['microphone']
  },
  // 中级 第1列 - 屏幕录制
  {
    id: 'screenRecord',
    name: '屏幕录制',
    description: '录制屏幕视频内容',
    icon: TbScreenShare,
    branch: 'perception',
    tier: 'intermediate',
    column: 0,
    row: 1,
    prerequisites: ['screenshot', 'systemAudio']
  },
  // 中级 第1列 - 图片识别
  {
    id: 'imageRecognition',
    name: '图片识别',
    description: 'AI 识别图片中的内容',
    icon: TbPhoto,
    branch: 'perception',
    tier: 'intermediate',
    column: 0,
    row: 2,
    prerequisites: ['screenshot']
  },
  // 中级 第2列 - 实时转写
  {
    id: 'realtimeTranscribe',
    name: '实时转写',
    description: '实时将语音转换为字幕',
    icon: TbWriting,
    branch: 'perception',
    tier: 'intermediate',
    column: 1,
    row: 0,
    prerequisites: ['speechRecognition', 'systemAudio']
  },
  // 高级 第1列 - 视频分析
  {
    id: 'videoAnalysis',
    name: '视频理解',
    description: 'AI 分析视频内容，提取关键信息',
    icon: TbVideo,
    branch: 'perception',
    tier: 'advanced',
    column: 0,
    row: 1,
    prerequisites: ['screenRecord', 'imageRecognition']
  },
  // 高级 第2列 - 会议记录
  {
    id: 'meetingNotes',
    name: '会议记录',
    description: '自动记录会议内容并生成纪要',
    icon: TbSubtask,
    branch: 'perception',
    tier: 'advanced',
    column: 1,
    row: 0,
    prerequisites: ['realtimeTranscribe']
  },

  // ============ 关怀系分支 (row 3-4) ============
  // 初级 第1列 - 日常关心
  {
    id: 'dailyCare',
    name: '日常关心',
    description: '健康提醒、休息建议',
    icon: TbHeartbeat,
    branch: 'care',
    tier: 'beginner',
    column: 0,
    row: 3,
    prerequisites: [],
    settingsKey: 'dailyCare'
  },
  // 中级 第1列 - 日程提醒
  {
    id: 'scheduleReminder',
    name: '日程提醒',
    description: '会议、生日、纪念日提醒',
    icon: TbCalendarEvent,
    branch: 'care',
    tier: 'intermediate',
    column: 0,
    row: 3,
    prerequisites: ['dailyCare'],
    settingsKey: 'dailyCare'
  },
  // 高级 第1列 - 智能提醒
  {
    id: 'smartReminder',
    name: '智能提醒',
    description: '根据习惯自动调整提醒时机',
    icon: TbBell,
    branch: 'care',
    tier: 'advanced',
    column: 0,
    row: 3,
    prerequisites: ['scheduleReminder']
  },

  // ============ 化身系分支 (row 5-6) ============
  // 初级 第1列 - 精灵管理
  {
    id: 'spriteManage',
    name: '精灵形象',
    description: '导入/切换桌面精灵动画',
    icon: TbMoodKid,
    branch: 'avatar',
    tier: 'beginner',
    column: 0,
    row: 5,
    prerequisites: [],
    settingsKey: 'sprite'
  },
  // 初级 第1列 - 自由移动
  {
    id: 'movement',
    name: '自由移动',
    description: '精灵在桌面自由走动',
    icon: TbRun,
    branch: 'avatar',
    tier: 'beginner',
    column: 0,
    row: 6,
    prerequisites: [],
    settingsKey: 'movement'
  },
  // 中级 第1列 - 外观定制
  {
    id: 'customAppearance',
    name: '外观定制',
    description: '自定义精灵外观和配色',
    icon: TbPalette,
    branch: 'avatar',
    tier: 'intermediate',
    column: 0,
    row: 5,
    prerequisites: ['spriteManage']
  },
  // 高级 第1列 - 动作编排
  {
    id: 'actionChoreography',
    name: '动作编排',
    description: '自定义精灵动作序列',
    icon: TbWand,
    branch: 'avatar',
    tier: 'advanced',
    column: 0,
    row: 5,
    prerequisites: ['customAppearance', 'movement']
  },
  // 专业 第1列 - 情感表达
  {
    id: 'emotionExpression',
    name: '情感表达',
    description: '根据对话内容自动展示表情',
    icon: TbSparkles,
    branch: 'avatar',
    tier: 'professional',
    column: 0,
    row: 5,
    prerequisites: ['actionChoreography']
  },

  // ============ 智能系分支 (row 7-8) ============
  // 初级 第1列 - AI 对话
  {
    id: 'aiChat',
    name: 'AI 对话',
    description: '与 AI 助手进行自然对话',
    icon: TbMessageChatbot,
    branch: 'intelligence',
    tier: 'beginner',
    column: 0,
    row: 7,
    prerequisites: []
  },
  // 中级 第1列 - 文档理解
  {
    id: 'docUnderstanding',
    name: '文档理解',
    description: 'AI 阅读和理解文档内容',
    icon: TbFileText,
    branch: 'intelligence',
    tier: 'intermediate',
    column: 0,
    row: 7,
    prerequisites: ['aiChat']
  },
  // 中级 第2列 - 翻译助手
  {
    id: 'translation',
    name: '翻译助手',
    description: '多语言实时翻译',
    icon: TbLanguage,
    branch: 'intelligence',
    tier: 'intermediate',
    column: 1,
    row: 8,
    prerequisites: ['aiChat']
  },
  // 高级 第1列 - 智能助理
  {
    id: 'smartAssistant',
    name: '智能助理',
    description: '理解上下文，主动提供帮助',
    icon: TbBrain,
    branch: 'intelligence',
    tier: 'advanced',
    column: 0,
    row: 7,
    prerequisites: ['docUnderstanding', 'translation']
  },
  // 专业 第1列 - 自动化代理
  {
    id: 'autoAgent',
    name: '自动代理',
    description: '自动执行复杂任务流程',
    icon: TbRobot,
    branch: 'intelligence',
    tier: 'professional',
    column: 0,
    row: 7,
    prerequisites: ['smartAssistant']
  },
  // 大师 第1列 - 全能助手
  {
    id: 'masterAssistant',
    name: '全能助手',
    description: '融合所有能力的终极形态',
    icon: TbSparkles,
    branch: 'intelligence',
    tier: 'master',
    column: 0,
    row: 7,
    prerequisites: ['autoAgent', 'emotionExpression', 'videoAnalysis', 'smartReminder'],
    unlockCondition: '解锁所有专业级技能'
  }
];

// 获取节点的分支配色
export const getNodeColors = (branchId: string): SkillBranch => {
  return skillBranches[branchId] || skillBranches.core;
};

// 获取技能等级配置
export const getTierConfig = (tier: SkillTier) => {
  return skillTierConfig[tier];
};

// 检查技能是否可解锁（前置技能都已激活）
export const canUnlockSkill = (skillId: string, activeSkills: Set<string>): boolean => {
  const skill = skillTreeNodes.find((n) => n.id === skillId);
  if (!skill) return false;
  if (skill.prerequisites.length === 0) return true;
  return skill.prerequisites.every((prereq) => activeSkills.has(prereq));
};
