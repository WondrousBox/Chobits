/**
 * 消息系统基元类型（从 packages/sprite-core/types.ts 物理迁入）。
 *
 * event 包是消息桥接的发送方，这些定义放在这里，
 * 供 sprite-core 与渲染进程通过 @packages/sprite-core/types 的 re-export 继续消费。
 */

// ============================================================================
// 消息分类
// ============================================================================

export type MessageCategory =
  | 'idle'
  | 'hover'
  | 'click'
  | 'focus'
  | 'input'
  | 'scroll'
  | 'press'
  | 'release'
  | 'hold'
  | 'error'
  | 'loading'
  | 'success'
  | 'failure'
  | 'info'
  | 'warning'
  | 'celebrate'
  | 'question'
  | 'answer'
  | 'search'
  | 'navigation'
  | 'selection'
  | 'confirmation'
  | 'cancellation'
  | 'upload'
  | 'download'
  | 'processing'
  | 'waiting'
  | 'timeout'
  | 'retry'
  | 'connect'
  | 'disconnect'
  | 'sync'
  | 'update'
  | 'install'
  | 'remove'
  | 'configure'
  | 'settings'
  | 'profile'
  | 'message'
  | 'alert'
  | 'reminder'
  | 'event'
  | 'task'
  | 'drag'
  | 'drop'
  | 'fileDragOver'
  | 'fileDrop'
  | 'recommend'
  | 'tip'
  | 'system'
  | 'welcome'
  | 'custom';

// ============================================================================
// 消息系统类型（从 message/types.ts 迁移）
// ============================================================================

export type MessageType = 'busy' | 'notice' | 'toast';
export type MessageLevel = 'info' | 'success' | 'warning' | 'error';

export const MESSAGE_PRIORITY: Record<MessageType, number> = {
  busy: 3,
  notice: 2,
  toast: 1
};

export interface MessageButton {
  id: string;
  label: string;
  action?: string;
  variant?: 'default' | 'secondary' | 'outline' | 'ghost';
}

interface BaseMessage {
  id: string;
  type: MessageType;
  level?: MessageLevel;
  createdAt: number;
}

export interface ToastMessage extends BaseMessage {
  type: 'toast';
  content?: string;
  category?: MessageCategory;
  ctx?: any;
  duration?: number;
  image?: {
    alt?: string;
    title?: string;
    url: string;
  };
}

export interface NoticeMessage extends BaseMessage {
  type: 'notice';
  content: string;
  buttons?: MessageButton[];
  duration?: number;
  persistent?: boolean;
  routineId?: string;
}

export interface BusyMessage extends BaseMessage {
  type: 'busy';
  content?: string;
  progress?: number;
}

/** 统一消息联合类型（避免与 SpriteMessage 组件同名） */
export type SpriteMessageData = ToastMessage | NoticeMessage | BusyMessage;

export type ToastInput = Omit<ToastMessage, 'id' | 'type' | 'createdAt'> & { id?: string };
export type NoticeInput = Omit<NoticeMessage, 'id' | 'type' | 'createdAt'> & { id?: string };
export type BusyInput = Omit<BusyMessage, 'id' | 'type' | 'createdAt'> & { id?: string };

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
  image?: {
    alt?: string;
    title?: string;
    url: string;
  };
  shouldSpeak?: boolean;
  ctx?: any;
}

export type MessageBridgeSource = 'app' | 'sprite';
export type MessageBridgeTarget = 'all' | 'sprite';

export interface SpriteConfirmNoticeRequest {
  id?: string;
  content: string;
  level?: MessageLevel;
  confirmLabel?: string;
  cancelLabel?: string;
  timeoutMs?: number;
  shouldSpeak?: boolean;
}

export interface SpriteConfirmNoticeResult {
  confirmed: boolean;
  messageId: string;
  actionId?: string;
  action?: string;
  reason?: 'confirm' | 'cancel' | 'dismissed' | 'timeout' | 'error';
}

export interface MessageBridgeClearPayload {
  id?: string;
  type?: MessageType | 'all';
}

export type MessageBridgePayload =
  | {
      kind: 'show';
      payload: MessageIPCPayload;
      source: MessageBridgeSource;
      target?: MessageBridgeTarget;
    }
  | {
      kind: 'clear';
      payload: MessageBridgeClearPayload;
      source: MessageBridgeSource;
      target?: MessageBridgeTarget;
    };

export const MESSAGE_IPC_CHANNELS = {
  BRIDGE: 'app:message:bridge',
  MESSAGE: 'app:message',
  MESSAGE_CLEAR: 'app:message:clear',
  LEGACY_NOTICE: 'app:notice',
  LEGACY_BUSY_START: 'app:busy:start',
  LEGACY_BUSY_END: 'app:busy:end',
  LEGACY_BUSY_PROGRESS: 'app:busy:progress'
} as const;

export const DEFAULT_DURATION: Record<MessageType, number> = {
  toast: 5000,
  notice: 4000,
  busy: 0
};
