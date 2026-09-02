/**
 * 统一消息系统导出
 *
 * 使用方式：
 *
 * 1. 在应用根组件包裹 MessageProvider：
 *    ```tsx
 *    import { MessageProvider } from './message';
 *    <MessageProvider>
 *      <SpriteApp />
 *    </MessageProvider>
 *    ```
 *
 * 2. 在组件中使用 useMessage hook：
 *    ```tsx
 *    import { useMessage } from './message';
 *    const { showToast, showNotice, showBusy, clearBusy, dismiss } = useMessage();
 *
 *    // 显示 Toast（预设文案）
 *    showToast({ category: 'welcome' });
 *
 *    // 显示 Toast（自定义文案）
 *    showToast({ content: '操作成功！', level: 'success' });
 *
 *    // 显示 Notice（带按钮）
 *    showNotice({
 *      content: '检测到新版本',
 *      level: 'info',
 *      buttons: [
 *        { id: 'update', label: '立即更新' },
 *        { id: 'later', label: '稍后', action: 'dismiss' }
 *      ]
 *    });
 *
 *    // 显示 Busy 状态
 *    showBusy({ content: '处理中...', progress: 50 });
 *    clearBusy();
 *    ```
 *
 * 3. 在 JSX 中渲染消息：
 *    ```tsx
 *    import { SpriteMessage } from './message';
 *    <SpriteMessage />
 *    ```
 */

// Context & Provider
export { MessageProvider } from './MessageContext';
export { useMessage, useMessageSafe } from './useMessage';

// 统一消息组件
export { SpriteMessage } from './SpriteMessage';

// 渲染器（通常不需要直接使用）
export { BusyRenderer, NoticeRenderer, ToastRenderer } from './renderers';

// 类型导出
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
  SpriteMessage as SpriteMessageType,
  ToastInput,
  ToastMessage
} from './types';

// 常量导出
export { DEFAULT_DURATION, MESSAGE_IPC_CHANNELS, MESSAGE_PRIORITY } from './types';
