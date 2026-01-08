import { BrowserWindow } from 'electron';

// ============================================================================
// 通用类型定义
// ============================================================================

export type AppNoticeLevel = 'info' | 'success' | 'warning' | 'error';
export type MessageType = 'toast' | 'notice' | 'busy';

export interface AppNoticeButton {
  id: string; // 按钮唯一标识
  label: string; // 按钮显示文本
  action?: string; // 预定义动作：'dismiss'（关闭消息）、'snooze'（稍后提醒）等
  variant?: 'default' | 'secondary' | 'outline' | 'ghost'; // 按钮样式
}

// ============================================================================
// 统一消息系统类型（新）
// ============================================================================

/**
 * 统一消息 payload
 */
export interface SpriteMessagePayload {
  type: MessageType;
  id?: string;
  content?: string;
  level?: AppNoticeLevel;
  progress?: number;
  buttons?: AppNoticeButton[];
  duration?: number;
  persistent?: boolean;
  routineId?: string;
  category?: string;
  ctx?: any;
}

// ============================================================================
// 旧版兼容类型
// ============================================================================

export interface AppNoticePayload {
  message: string;
  level?: AppNoticeLevel;
  durationMs?: number;
  persistent?: boolean; // 是否常驻显示，不自动消失
  routineId?: string; // 关联的提醒ID，用于常驻消息管理
  buttons?: AppNoticeButton[]; // 按钮列表
}

const DEFAULT_DURATION = 4000;

/**
 * 内部辅助函数：发送 IPC 消息到指定窗口或所有窗口
 */
function sendToWindows(channel: string, args: any, win?: BrowserWindow | null): void {
  if (win) {
    if (!win.isDestroyed()) {
      try {
        win.webContents.send(channel, args);
      } catch (error) {
        console.warn(`[app-interaction] Failed to send ${channel} to specific window`, error);
      }
    }
  } else {
    // 如果未指定窗口，则广播给所有窗口
    BrowserWindow.getAllWindows().forEach((w) => {
      if (!w.isDestroyed()) {
        try {
          w.webContents.send(channel, args);
        } catch (error) {
          console.warn(`[app-interaction] Failed to send ${channel} to window ${w.id}`, error);
        }
      }
    });
  }
}

/**
 * 发送通知事件
 * @param payload 通知内容
 * @param win 目标窗口，如果不提供则广播给所有窗口
 */
export function sendAppNotice(payload: AppNoticePayload, win?: BrowserWindow | null): void {
  const message = payload?.message?.trim();
  if (!message) return;

  const level: AppNoticeLevel = payload.level || 'info';
  const durationMs = typeof payload.durationMs === 'number' ? payload.durationMs : DEFAULT_DURATION;

  sendToWindows(
    'app:notice',
    {
      message,
      level,
      durationMs,
      persistent: payload.persistent,
      routineId: payload.routineId,
      buttons: payload.buttons
    },
    win
  );
}

// --- App Busy Types & Functions ---

/**
 * 发送繁忙状态开始事件
 * @param progress 进度值 (0-100)，可选
 * @param message 提示消息，可选
 * @param win 目标窗口，如果不提供则广播给所有窗口
 */
export function sendAppBusyStart(progress?: number, message?: string, win?: BrowserWindow | null): void {
  sendToWindows(
    'app:busy:start',
    {
      progress: progress !== undefined ? Math.max(0, Math.min(100, progress)) : undefined,
      message
    },
    win
  );
}

/**
 * 发送繁忙状态结束事件
 * @param win 目标窗口，如果不提供则广播给所有窗口
 */
export function sendAppBusyEnd(win?: BrowserWindow | null): void {
  sendToWindows('app:busy:end', undefined, win);
}

/**
 * 更新繁忙状态进度
 * @param progress 进度值 (0-100)
 * @param message 提示消息，可选
 * @param win 目标窗口，如果不提供则广播给所有窗口
 */
export function sendAppBusyProgress(progress: number, message?: string, win?: BrowserWindow | null): void {
  sendToWindows(
    'app:busy:progress',
    {
      progress: Math.max(0, Math.min(100, progress)),
      message
    },
    win
  );
}

// ============================================================================
// 统一消息系统 API（新）
// ============================================================================

/**
 * 发送统一消息
 * @param payload 消息内容
 * @param win 目标窗口，如果不提供则广播给所有窗口
 */
export function sendSpriteMessage(payload: SpriteMessagePayload, win?: BrowserWindow | null): void {
  sendToWindows('app:message', payload, win);
}

/**
 * 发送 Toast 消息（轻量提示）
 * @param content 消息内容
 * @param options 选项
 * @param win 目标窗口
 */
export function sendToast(
  content: string,
  options?: {
    level?: AppNoticeLevel;
    duration?: number;
    category?: string;
    ctx?: any;
  },
  win?: BrowserWindow | null
): void {
  sendSpriteMessage(
    {
      type: 'toast',
      content,
      level: options?.level,
      duration: options?.duration,
      category: options?.category,
      ctx: options?.ctx
    },
    win
  );
}

/**
 * 发送 Notice 消息（通知）
 * @param content 消息内容
 * @param options 选项
 * @param win 目标窗口
 */
export function sendNotice(
  content: string,
  options?: {
    level?: AppNoticeLevel;
    duration?: number;
    persistent?: boolean;
    buttons?: AppNoticeButton[];
    routineId?: string;
  },
  win?: BrowserWindow | null
): void {
  sendSpriteMessage(
    {
      type: 'notice',
      content,
      level: options?.level,
      duration: options?.duration,
      persistent: options?.persistent,
      buttons: options?.buttons,
      routineId: options?.routineId
    },
    win
  );
}

/**
 * 发送 Busy 消息（忙碌状态）
 * @param content 消息内容
 * @param progress 进度值 (0-100)
 * @param win 目标窗口
 */
export function sendBusy(content?: string, progress?: number, win?: BrowserWindow | null): void {
  sendSpriteMessage(
    {
      type: 'busy',
      content,
      progress
    },
    win
  );
}

/**
 * 清除消息
 * @param options 选项（可指定 id 或 type）
 * @param win 目标窗口
 */
export function clearSpriteMessage(options?: { id?: string; type?: MessageType | 'all' }, win?: BrowserWindow | null): void {
  sendToWindows('app:message:clear', options || { type: 'all' }, win);
}

/**
 * 清除 Busy 状态
 * @param win 目标窗口
 */
export function clearBusy(win?: BrowserWindow | null): void {
  clearSpriteMessage({ type: 'busy' }, win);
}
