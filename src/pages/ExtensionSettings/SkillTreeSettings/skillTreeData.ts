import type { ComponentType } from 'react';
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

import { DEFAULT_SPRITE_CAPABILITY_DEFINITIONS, type SpriteCapabilityDefinition, type SpriteCapabilityStatus, type SpriteCapabilityTier } from '@packages/sprite-core/capability-registry';

export type SkillStatus = SpriteCapabilityStatus;

export type SkillTier = SpriteCapabilityTier;

export const skillTierConfig: Record<SkillTier, { label: string; color: string; order: number }> = {
  beginner: { label: '初级', color: '#22c55e', order: 0 },
  intermediate: { label: '中级', color: '#3b82f6', order: 1 },
  advanced: { label: '高级', color: '#a855f7', order: 2 },
  professional: { label: '专业', color: '#f97316', order: 3 },
  master: { label: '大师', color: '#ef4444', order: 4 }
};

export interface SkillNode extends SpriteCapabilityDefinition {
  icon: ComponentType<{ className?: string }>;
}

export interface SkillBranch {
  id: string;
  name: string;
  color: string;
  glowColor: string;
  gradientFrom: string;
  gradientTo: string;
}

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

const skillNodeIcons: Record<string, ComponentType<{ className?: string }>> = {
  microphone: TbMicrophone,
  systemAudio: TbVolume,
  screenshot: TbCamera,
  speechRecognition: TbEar,
  screenRecord: TbScreenShare,
  imageRecognition: TbPhoto,
  realtimeTranscribe: TbWriting,
  videoAnalysis: TbVideo,
  meetingNotes: TbSubtask,
  dailyCare: TbHeartbeat,
  scheduleReminder: TbCalendarEvent,
  smartReminder: TbBell,
  spriteManage: TbMoodKid,
  movement: TbRun,
  customAppearance: TbPalette,
  actionChoreography: TbWand,
  emotionExpression: TbSparkles,
  aiChat: TbMessageChatbot,
  docUnderstanding: TbFileText,
  translation: TbLanguage,
  smartAssistant: TbBrain,
  autoAgent: TbRobot,
  masterAssistant: TbSparkles
};

export const skillTreeNodes: SkillNode[] = DEFAULT_SPRITE_CAPABILITY_DEFINITIONS.map((definition) => ({
  ...definition,
  icon: skillNodeIcons[definition.id] ?? TbSparkles
}));

export const skillTreeNodeMap = new Map(skillTreeNodes.map((node) => [node.id, node]));

export function getNodeColors(branchId: string): SkillBranch {
  return skillBranches[branchId] || skillBranches.core;
}

export function getTierConfig(tier: SkillTier): { label: string; color: string; order: number } {
  return skillTierConfig[tier];
}
