/**
 * 场景-动画触发映射配置
 *
 * 定义业务场景到精灵动画事件的映射关系
 * 支持 fallback 机制和优先级配置
 */

import type { MessageCategory, SpriteEventType } from '../types';

/**
 * 触发器配置
 */
export interface TriggerConfig {
  /** 事件类型 */
  eventType: SpriteEventType;
  /** 动画ID（可选，无则fallback到idle） */
  animationId?: string;
  /** 动画时长 */
  duration?: number;
  /** 是否显示toast */
  showToast?: boolean;
  /** toast类别 */
  toastCategory?: MessageCategory;
  /** 自定义toast消息 */
  toastMessage?: string;
}

/**
 * 场景映射表
 * Key: 触发器名称， Value: TriggerConfig
 */
export const TRIGGER_MAPPING: Record<string, TriggerConfig> = {
  // AI 聊天场景
  'ai:chat:start': {
    eventType: 'thinking',
    showToast: true,
    toastCategory: 'loading'
  },
  'ai:chat:complete': {
    eventType: 'success',
    showToast: true,
    toastCategory: 'success'
  },
  'ai:chat:error': {
    eventType: 'error',
    showToast: true,
    toastCategory: 'error'
  },

  // 工作流场景
  'workflow:start': {
    eventType: 'processing',
    showToast: true,
    toastCategory: 'loading'
  },
  'workflow:complete': {
    eventType: 'celebrate',
    showToast: true,
    toastCategory: 'success'
  },
  'workflow:fail': {
    eventType: 'failure',
    showToast: true,
    toastCategory: 'error'
  },

  // 资源导入场景
  'resource:import:start': {
    eventType: 'loading',
    showToast: true,
    toastCategory: 'loading'
  },
  'resource:import:complete': {
    eventType: 'success',
    showToast: true,
    toastCategory: 'success'
  },

  // 文件处理场景
  'file:process:start': {
    eventType: 'processing'
  },
  'file:process:complete': {
    eventType: 'success'
  },
  'file:process:fail': {
    eventType: 'error'
  },

  // 转录/翻译场景
  'transcribe:start': {
    eventType: 'thinking'
  },
  'transcribe:complete': {
    eventType: 'success'
  },
  'translate:start': {
    eventType: 'thinking'
  },
  'translate:complete': {
    eventType: 'success'
  }
};
