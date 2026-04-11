/**
 * 统一消息系统类型定义 — re-exported from @packages/sprite-core/types
 * 保持向后兼容，所有类型定义已迁移至 packages/sprite-core/types.ts
 */

// Re-export everything from sprite-core
export type {
  BusyInput,
  BusyMessage,
  MessageBridgeClearPayload,
  MessageBridgePayload,
  MessageBridgeSource,
  MessageButton,
  MessageContextValue,
  MessageIPCPayload,
  MessageLevel,
  MessageQueueState,
  MessageType,
  NoticeInput,
  NoticeMessage,
  ToastInput,
  ToastMessage
} from '@packages/sprite-core/types';
export { DEFAULT_DURATION, MESSAGE_IPC_CHANNELS, MESSAGE_PRIORITY } from '@packages/sprite-core/types';

// Backward compat: SpriteMessage → SpriteMessageData
export type { SpriteMessageData as SpriteMessage } from '@packages/sprite-core/types';
