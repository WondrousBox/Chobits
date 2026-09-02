import { BrowserWindow } from 'electron';

import { SPRITE_CAPABILITY_CHANGED_CHANNEL, type SpriteCapabilityChangedPayload } from '../capability-events';

export function notifySpriteCapabilityChanged(payload: SpriteCapabilityChangedPayload = {}): void {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win || win.isDestroyed()) continue;
    try {
      win.webContents.send(SPRITE_CAPABILITY_CHANGED_CHANNEL, payload);
    } catch {
      /* ignore */
    }
  }
}
