/**
 * 统一消息系统类型定义
 *
 * 设计目标：
 * - 统一 Toast（轻量提示）、Notice（通知）、Busy（忙碌状态）三种消息
 * - 提供优先级管理，确保重要消息优先展示
 * - 支持渲染进程和主进程两种触发方式
 */

import type { MessageCategory } from '../types';

// ============================================================================
// 消息类型枚举
// ============================================================================

/**
 * 消息类型
 * - busy: 忙碌状态（最高优先级）- 阻塞型，显示进度
 * - notice: 通知消息（中优先级）- 需要关注，可交互
 * - toast: 轻量提示（低优先级）- 临时信息
 */
export type MessageType = 'busy' | 'notice' | 'toast';

/**
 * 消息等级（用于视觉区分）
 */
export type MessageLevel = 'info' | 'success' | 'warning' | 'error';

/**
 * 消息优先级映射
 */
export const MESSAGE_PRIORITY: Record<MessageType, number> = {
  busy: 3,
  notice: 2,
  toast: 1
};

// ============================================================================
// 按钮定义
// ============================================================================

/**
 * 消息按钮定义
 */
export interface MessageButton {
  /** 按钮唯一标识 */
  id: string;
  /** 按钮显示文本 */
  label: string;
  /** 预定义动作：'dismiss'（关闭消息）、'snooze'（稍后提醒）等 */
  action?: string;
  /** 按钮样式 */
  variant?: 'default' | 'secondary' | 'outline' | 'ghost';
}

// ============================================================================
// 消息数据结构
// ============================================================================

/**
 * 基础消息结构
 */
interface BaseMessage {
  /** 唯一标识（自动生成或指定） */
  id: string;
  /** 消息类型 */
  type: MessageType;
  /** 消息等级 */
  level?: MessageLevel;
  /** 创建时间戳 */
  createdAt: number;
}

/**
 * Toast 消息（轻量提示）
 */
export interface ToastMessage extends BaseMessage {
  type: 'toast';
  /** 消息内容（自定义文本） */
  content?: string;
  /** 预设文案分类 */
  category?: MessageCategory;
  /** 文案上下文（用于动态文案） */
  ctx?: any;
  /** 自动关闭时间（毫秒），0 表示常驻，默认 5000 */
  duration?: number;
}

/**
 * Notice 消息（通知）
 */
export interface NoticeMessage extends BaseMessage {
  type: 'notice';
  /** 消息内容 */
  content: string;
  /** 交互按钮列表 */
  buttons?: MessageButton[];
  /** 自动关闭时间（毫秒），0 表示常驻，默认 4000 */
  duration?: number;
  /** 是否常驻显示 */
  persistent?: boolean;
  /** 关联的提醒ID（用于按钮回调） */
  routineId?: string;
}

/**
 * Busy 消息（忙碌状态）
 */
export interface BusyMessage extends BaseMessage {
  type: 'busy';
  /** 消息内容 */
  content?: string;
  /** 进度值（0-100），不提供则显示 loading 动画 */
  progress?: number;
}

/**
 * 统一消息类型
 */
export type SpriteMessage = ToastMessage | NoticeMessage | BusyMessage;

// ============================================================================
// 消息输入（创建消息时使用，id 和 createdAt 自动生成）
// ============================================================================

export type ToastInput = Omit<ToastMessage, 'id' | 'type' | 'createdAt'> & { id?: string };
export type NoticeInput = Omit<NoticeMessage, 'id' | 'type' | 'createdAt'> & { id?: string };
export type BusyInput = Omit<BusyMessage, 'id' | 'type' | 'createdAt'> & { id?: string };

// ============================================================================
// IPC 通信 payload
// ============================================================================

/**
 * 统一消息 IPC payload
 */
export interface MessageIPCPayload {
  type: MessageType;
  id?: string;
  content?: string;
  level?: MessageLevel;
  progress?: number;
  buttons?: MessageButton[];
  duration?: number;
  persistent?: boolean;
  routineId?: string;
  category?: MessageCategory;
  ctx?: any;
}

/**
 * IPC 频道名称
 */
export const MESSAGE_IPC_CHANNELS = {
  /** 统一消息频道 */
  MESSAGE: 'app:message',
  /** 清除消息 */
  MESSAGE_CLEAR: 'app:message:clear',
  /** 兼容：旧版通知频道 */
  LEGACY_NOTICE: 'app:notice',
  /** 兼容：旧版忙碌开始 */
  LEGACY_BUSY_START: 'app:busy:start',
  /** 兼容：旧版忙碌结束 */
  LEGACY_BUSY_END: 'app:busy:end',
  /** 兼容：旧版忙碌进度 */
  LEGACY_BUSY_PROGRESS: 'app:busy:progress'
} as const;

// ============================================================================
// Context 类型
// ============================================================================

/**
 * 消息队列状态
 */
export interface MessageQueueState {
  /** 当前显示的消息 */
  current: SpriteMessage | null;
  /** 消息队列（按优先级排序） */
  queue: SpriteMessage[];
}

/**
 * 消息 Context 值
 */
export interface MessageContextValue {
  /** 当前显示的消息 */
  current: SpriteMessage | null;
  /** 显示 Toast 消息 */
  showToast: (input: ToastInput) => string;
  /** 显示 Notice 消息 */
  showNotice: (input: NoticeInput) => string;
  /** 显示 Busy 消息 */
  showBusy: (input: BusyInput) => string;
  /** 更新 Busy 进度 */
  updateBusy: (progress: number, content?: string) => void;
  /** 清除 Busy 状态 */
  clearBusy: () => void;
  /** 关闭指定消息 */
  dismiss: (id?: string) => void;
  /** 清除所有消息 */
  clearAll: () => void;
  /** 处理按钮点击 */
  handleButtonClick: (button: MessageButton) => void;
}

// ============================================================================
// 默认配置
// ============================================================================

export const DEFAULT_DURATION: Record<MessageType, number> = {
  toast: 5000,
  notice: 4000,
  busy: 0 // busy 不自动关闭
};
