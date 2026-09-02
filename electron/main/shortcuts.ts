import { windowManager } from '@aim-packages/window-manager';
import {
  getShortcutSchema,
  isShortcutEnabled,
  loadShortcutsConfig,
  onShortcutEnabledChanged,
  onShortcutsConfigChanged,
  resolveAcceleratorsForPlatform,
  type ShortcutsConfig
} from '@packages/common/shortcut-store';
import { BrowserWindow, globalShortcut } from 'electron';

// Keep track of what we registered so we can cleanly unregister later
const registeredAccelerators: Set<string> = new Set();
let unsubscribeChange: (() => void) | null = null;
let unsubscribeEnabledChange: (() => void) | null = null;
let lastGetMainWindow: GetMainWindow | null = null;

export type GetMainWindow = () => BrowserWindow | null;

function applyRegistration(getMainWindow: GetMainWindow): void {
  const config = loadShortcutsConfig();
  const resolved = resolveAcceleratorsForPlatform(config);

  const actions: Record<string, () => void> = {
    toggleChatWindow: () => {
      try {
        const existing = windowManager.get('chatPanel' as any);
        if (existing) {
          if (existing.isVisible()) existing.close();
          else windowManager.show('chatPanel' as any);
        } else {
          windowManager.createOrShow('chatPanel' as any);
        }
      } catch {
        /* noop */
      }
    },
    toggleDevtools: () => {
      try {
        const win = getMainWindow();
        if (!win || win.isDestroyed()) return;
        const webContents = win.webContents;
        if (webContents.isDevToolsOpened()) webContents.closeDevTools();
        else webContents.openDevTools({ mode: 'detach' });
      } catch (e) {
        console.warn('[shortcut] toggle devtools error', e);
      }
    },
    toggleMainWindow: () => {
      try {
        const win = getMainWindow();
        if (!win || win.isDestroyed()) return;
        if (win.isVisible()) win.hide();
        else win.show();
      } catch (e) {
        console.warn('[shortcut] toggle main window error', e);
      }
    }
  };

  for (const action of getShortcutSchema()) {
    // 检查该快捷键是否启用
    if (!isShortcutEnabled(action.id)) {
      console.log(`[shortcut] skipping ${action.id} (disabled)`);
      continue;
    }
    const list = resolved[action.id] || [];
    const handler = actions[action.id] || (() => {});
    list.forEach((accelerator) => {
      try {
        if (!accelerator) return;
        const ok = globalShortcut.register(accelerator, handler);
        if (!ok) console.warn(`[shortcut] failed to register ${accelerator} (${action.id})`);
        else registeredAccelerators.add(accelerator);
      } catch (e) {
        console.warn(`[shortcut] error registering ${accelerator} (${action.id})`, e);
      }
    });
  }
}

export function registerGlobalShortcuts(getMainWindow: GetMainWindow): void {
  lastGetMainWindow = getMainWindow;
  applyRegistration(getMainWindow);
  // React to future changes
  if (unsubscribeChange) unsubscribeChange();
  unsubscribeChange = onShortcutsConfigChanged(() => {
    unregisterGlobalShortcuts();
    applyRegistration(getMainWindow);
  });
  // React to enabled state changes
  if (unsubscribeEnabledChange) unsubscribeEnabledChange();
  unsubscribeEnabledChange = onShortcutEnabledChanged(() => {
    unregisterGlobalShortcuts();
    applyRegistration(getMainWindow);
  });
}

export function unregisterGlobalShortcuts(): void {
  try {
    for (const accelerator of registeredAccelerators) {
      try {
        globalShortcut.unregister(accelerator);
      } catch {
        // noop
      }
    }
  } finally {
    registeredAccelerators.clear();
  }
}

export async function validateShortcutsConfig(proposed: Partial<ShortcutsConfig>): Promise<{ ok: boolean; details: Record<string, { accelerator: string; ok: boolean; error?: string }[]> }> {
  const current = loadShortcutsConfig();
  const merged: ShortcutsConfig = { ...current, ...(proposed as any) };
  const toTest = resolveAcceleratorsForPlatform(merged);

  // Temporarily release current, test, then restore
  const reapply = lastGetMainWindow ? () => applyRegistration(lastGetMainWindow as GetMainWindow) : () => {};
  const tempRegistered: string[] = [];
  const details: Record<string, { accelerator: string; ok: boolean; error?: string }[]> = {};
  try {
    // Unregister our current accelerators to avoid self-conflict
    unregisterGlobalShortcuts();
    for (const action of getShortcutSchema()) {
      details[action.id] = [];
      for (const accelerator of toTest[action.id] || []) {
        try {
          const ok = globalShortcut.register(accelerator, () => {});
          if (ok) tempRegistered.push(accelerator);
          details[action.id].push({ accelerator, ok });
          if (!ok) {
            // keep going to collect all failures
          }
        } catch (e: any) {
          details[action.id].push({ accelerator, ok: false, error: String(e?.message || e) });
        }
      }
    }
  } finally {
    // Clean up our temporary registrations
    for (const accelerator of tempRegistered) {
      try {
        globalShortcut.unregister(accelerator);
      } catch {
        /* noop */
      }
    }
    // Re-apply the actual current shortcuts
    reapply();
  }

  const ok = Object.values(details).every((arr) => arr.every((r) => r.ok));
  return { ok, details };
}
