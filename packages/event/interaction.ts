import { BrowserWindow } from 'electron';

// --- App Notice Types & Functions ---

export type AppNoticeLevel = 'info' | 'success' | 'warning' | 'error';

export interface AppNoticePayload {
  message: string;
  level?: AppNoticeLevel;
  durationMs?: number;
  persistent?: boolean; // 是否常驻显示，不自动消失
  routineId?: string; // 关联的提醒ID，用于常驻消息管理
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
      routineId: payload.routineId
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
