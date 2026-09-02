import { BrowserWindow } from 'electron';

import { MESSAGE_IPC_CHANNELS, type MessageBridgeClearPayload, type MessageBridgePayload, type MessageButton, type MessageIPCPayload, type MessageLevel, type MessageType } from './messages';

export type AppNoticeLevel = MessageLevel;
export type AppNoticeButton = MessageButton;
export type SpriteMessagePayload = MessageIPCPayload;

export interface AppNoticePayload {
  content: string;
  level?: AppNoticeLevel;
  durationMs?: number;
  persistent?: boolean;
  routineId?: string;
  buttons?: AppNoticeButton[];
}

const DEFAULT_NOTICE_DURATION = 4000;

function sendToWindows(channel: string, payload: unknown, win?: BrowserWindow | null): void {
  if (win) {
    if (!win.isDestroyed()) {
      try {
        win.webContents.send(channel, payload);
      } catch (error) {
        console.warn(`[app-interaction] Failed to send ${channel} to specific window`, error);
      }
    }
    return;
  }

  BrowserWindow.getAllWindows().forEach((windowRef) => {
    if (windowRef.isDestroyed()) return;
    try {
      windowRef.webContents.send(channel, payload);
    } catch (error) {
      console.warn(`[app-interaction] Failed to send ${channel} to window ${windowRef.id}`, error);
    }
  });
}

function forwardBridgeMessage(payload: MessageBridgePayload, win?: BrowserWindow | null): void {
  sendToWindows(MESSAGE_IPC_CHANNELS.BRIDGE, payload, win);
}

function sendMessageThroughBridge(payload: SpriteMessagePayload, source: 'app' | 'sprite' = 'app', win?: BrowserWindow | null): void {
  forwardBridgeMessage({ kind: 'show', payload, source }, win);
}

function clearBridgeMessage(payload: MessageBridgeClearPayload = { type: 'all' }, source: 'app' | 'sprite' = 'app', win?: BrowserWindow | null): void {
  forwardBridgeMessage({ kind: 'clear', payload, source }, win);
}

export function sendAppNotice(payload: AppNoticePayload, win?: BrowserWindow | null): void {
  const content = payload?.content?.trim();
  if (!content) return;

  sendMessageThroughBridge(
    {
      type: 'notice',
      content,
      level: payload.level || 'info',
      duration: typeof payload.durationMs === 'number' ? payload.durationMs : DEFAULT_NOTICE_DURATION,
      persistent: payload.persistent,
      routineId: payload.routineId,
      buttons: payload.buttons
    },
    'app',
    win
  );
}

export function sendAppBusyStart(progress?: number, message?: string, win?: BrowserWindow | null): void {
  sendMessageThroughBridge(
    {
      type: 'busy',
      progress: progress !== undefined ? Math.max(0, Math.min(100, progress)) : undefined,
      content: message
    },
    'app',
    win
  );
}

export function sendAppBusyEnd(win?: BrowserWindow | null): void {
  clearBridgeMessage({ type: 'busy' }, 'app', win);
}

export function sendAppBusyProgress(progress: number, message?: string, win?: BrowserWindow | null): void {
  sendMessageThroughBridge(
    {
      type: 'busy',
      progress: Math.max(0, Math.min(100, progress)),
      content: message
    },
    'app',
    win
  );
}

export function sendSpriteMessage(payload: SpriteMessagePayload, win?: BrowserWindow | null): void {
  sendMessageThroughBridge(payload, 'app', win);
}

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
      category: options?.category as any,
      ctx: options?.ctx
    },
    win
  );
}

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

export function clearSpriteMessage(options?: { id?: string; type?: MessageType | 'all' }, win?: BrowserWindow | null): void {
  clearBridgeMessage(options || { type: 'all' }, 'app', win);
}

export function clearBusy(win?: BrowserWindow | null): void {
  clearSpriteMessage({ type: 'busy' }, win);
}
