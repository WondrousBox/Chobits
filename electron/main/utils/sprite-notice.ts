import type { BrowserWindow } from 'electron';

import { getMainWindow } from '../index';

export type SpriteNoticeLevel = 'info' | 'success' | 'warning' | 'error';

export interface SpriteNoticePayload {
  message: string;
  level?: SpriteNoticeLevel;
  durationMs?: number;
}

const DEFAULT_DURATION = 4000;

export function sendSpriteNotice(payload: SpriteNoticePayload, win?: BrowserWindow | null): void {
  const targetWin = win || getMainWindow();
  if (!targetWin || targetWin.isDestroyed()) return;

  const message = payload?.message?.trim();
  if (!message) return;

  const level: SpriteNoticeLevel = payload.level || 'info';
  const durationMs = typeof payload.durationMs === 'number' ? payload.durationMs : DEFAULT_DURATION;

  try {
    targetWin.webContents.send('sprite:notice', {
      message,
      level,
      durationMs
    });
  } catch (error) {
    console.warn('[sprite-notice] Failed to send notice event', error);
  }
}
