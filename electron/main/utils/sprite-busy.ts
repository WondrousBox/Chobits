import type { BrowserWindow } from 'electron';

import { getMainWindow } from '../index';

/**
 * 发送繁忙状态开始事件
 * @param progress 进度值 (0-100)，可选
 * @param message 提示消息，可选
 * @param win 目标窗口，如果不提供则使用主窗口
 */
export function sendSpriteBusyStart(progress?: number, message?: string, win?: BrowserWindow | null): void {
  const targetWin = win || getMainWindow();
  if (!targetWin || targetWin.isDestroyed()) return;

  try {
    targetWin.webContents.send('sprite:busy:start', {
      progress: progress !== undefined ? Math.max(0, Math.min(100, progress)) : undefined,
      message
    });
  } catch (error) {
    console.warn('[sprite-busy] Failed to send busy start event', error);
  }
}

/**
 * 发送繁忙状态结束事件
 * @param win 目标窗口，如果不提供则使用主窗口
 */
export function sendSpriteBusyEnd(win?: BrowserWindow | null): void {
  const targetWin = win || getMainWindow();
  if (!targetWin || targetWin.isDestroyed()) return;

  try {
    targetWin.webContents.send('sprite:busy:end');
  } catch (error) {
    console.warn('[sprite-busy] Failed to send busy end event', error);
  }
}

/**
 * 更新繁忙状态进度
 * @param progress 进度值 (0-100)
 * @param message 提示消息，可选
 * @param win 目标窗口，如果不提供则使用主窗口
 */
export function sendSpriteBusyProgress(progress: number, message?: string, win?: BrowserWindow | null): void {
  const targetWin = win || getMainWindow();
  if (!targetWin || targetWin.isDestroyed()) return;

  try {
    targetWin.webContents.send('sprite:busy:progress', {
      progress: Math.max(0, Math.min(100, progress)),
      message
    });
  } catch (error) {
    console.warn('[sprite-busy] Failed to send busy progress event', error);
  }
}
