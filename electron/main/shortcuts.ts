import { globalShortcut, BrowserWindow } from 'electron';
import { windowManager } from './window/window-manager';

// Keep track of what we registered so we can cleanly unregister later
const registered: Set<string> = new Set();

// Default devtools accelerators we support
const DEVTOOLS_COMBOS = ['CommandOrControl+Alt+I', 'CommandOrControl+Shift+I', 'F12'] as const;
const ASSISTANT_COMBO = 'CommandOrControl+K' as const;

export type GetMainWindow = () => BrowserWindow | null;

export function registerGlobalShortcuts(getMainWindow: GetMainWindow): void {
  // Assistant panel toggle
  try {
    const ok = globalShortcut.register(ASSISTANT_COMBO, () => {
      try {
        const existing = windowManager.get('assistant' as any);
        if (existing) {
          if (existing.isVisible()) existing.close();
          else windowManager.show('assistant' as any);
        } else {
          windowManager.createOrShow('assistant' as any);
        }
      } catch {
        // noop
      }
    });
    if (!ok) console.warn(`[shortcut] failed to register ${ASSISTANT_COMBO}`);
    else registered.add(ASSISTANT_COMBO);
  } catch (e) {
    console.warn(`[shortcut] error registering ${ASSISTANT_COMBO}`, e);
  }

  // DevTools toggle shortcuts
  const toggleDevtools = (): void => {
    try {
      const win = getMainWindow();
      if (!win || win.isDestroyed()) return;
      const wc = win.webContents;
      if (wc.isDevToolsOpened()) wc.closeDevTools();
      else wc.openDevTools({ mode: 'detach' });
    } catch (e) {
      console.warn('[shortcut] toggle devtools error', e);
    }
  };

  try {
    DEVTOOLS_COMBOS.forEach((accel) => {
      try {
        const ok = globalShortcut.register(accel, toggleDevtools);
        if (!ok) console.warn(`[shortcut] failed to register ${accel}`);
        else registered.add(accel);
      } catch (e) {
        console.warn(`[shortcut] error registering ${accel}`, e);
      }
    });
  } catch (e) {
    console.warn('[shortcut] unexpected error registering devtools shortcuts', e);
  }
}

export function unregisterGlobalShortcuts(): void {
  try {
    for (const accel of registered) {
      try {
        globalShortcut.unregister(accel);
      } catch {
        // noop
      }
    }
  } finally {
    registered.clear();
  }
}
