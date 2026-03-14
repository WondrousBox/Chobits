import { BrowserWindow } from 'electron';

import type { PushedCard } from './types';

export const CARD_PUSHED_CHANNEL = 'ai:card-pushed';

export function pushCardToWindows(card: Omit<PushedCard, 'timestamp'>, targetWindowId?: number): void {
  const payload: PushedCard = {
    ...card,
    timestamp: Date.now()
  };

  BrowserWindow.getAllWindows().forEach((window) => {
    if (targetWindowId !== undefined && window.id !== targetWindowId) return;
    if (window.isDestroyed()) return;

    try {
      window.webContents.send(CARD_PUSHED_CHANNEL, payload);
    } catch {
      // Ignore windows that disappear mid-broadcast.
    }
  });
}
