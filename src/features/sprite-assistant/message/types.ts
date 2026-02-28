/**
 * 统一消息系统类型定义 — re-exported from @packages/sprite-core/types
 * 保持向后兼容，所有类型定义已迁移至 packages/sprite-core/types.ts
 */

// Re-export everything from sprite-core
export type {
  MessageType,
  MessageLevel,
  MessageButton,
  ToastMessage,
  NoticeMessage,
  BusyMessage,
  ToastInput,
  NoticeInput,
  BusyInput,
  MessageIPCPayload,
  MessageQueueState,
  MessageContextValue
} from '@packages/sprite-core/types';

export { MESSAGE_PRIORITY, MESSAGE_IPC_CHANNELS, DEFAULT_DURATION } from '@packages/sprite-core/types';

// Backward compat: SpriteMessage → SpriteMessageData
export type { SpriteMessageData as SpriteMessage } from '@packages/sprite-core/types';
