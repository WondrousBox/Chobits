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
const registered: Set<string> = new Set();
let unsubscribeChange: (() => void) | null = null;
let unsubscribeEnabledChange: (() => void) | null = null;
let lastGetMainWindow: GetMainWindow | null = null;

export type GetMainWindow = () => BrowserWindow | null;

function applyRegistration(getMainWindow: GetMainWindow): void {
  const cfg = loadShortcutsConfig();
  const resolved = resolveAcceleratorsForPlatform(cfg);

  const actions: Record<string, () => void> = {
    toggleAssistant: () => {
      try {
        const existing = windowManager.get('assistant' as any);
        if (existing) {
          if (existing.isVisible()) existing.close();
          else windowManager.show('assistant' as any);
        } else {
          windowManager.createOrShow('assistant' as any);
        }
      } catch {
        /* noop */
      }
    },
    toggleDevtools: () => {
      try {
        const win = getMainWindow();
        if (!win || win.isDestroyed()) return;
        const wc = win.webContents;
        if (wc.isDevToolsOpened()) wc.closeDevTools();
        else wc.openDevTools({ mode: 'detach' });
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

  for (const act of getShortcutSchema()) {
    // 检查该快捷键是否启用
    if (!isShortcutEnabled(act.id)) {
      console.log(`[shortcut] skipping ${act.id} (disabled)`);
      continue;
    }
    const list = resolved[act.id] || [];
    const handler = actions[act.id] || (() => {});
    list.forEach((accel) => {
      try {
        if (!accel) return;
        const ok = globalShortcut.register(accel, handler);
        if (!ok) console.warn(`[shortcut] failed to register ${accel} (${act.id})`);
        else registered.add(accel);
      } catch (e) {
        console.warn(`[shortcut] error registering ${accel} (${act.id})`, e);
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

export async function validateShortcutsConfig(proposed: Partial<ShortcutsConfig>): Promise<{ ok: boolean; details: Record<string, { accel: string; ok: boolean; error?: string }[]> }> {
  const current = loadShortcutsConfig();
  const merged: ShortcutsConfig = { ...current, ...(proposed as any) };
  const toTest = resolveAcceleratorsForPlatform(merged);

  // Temporarily release current, test, then restore
  const reapply = lastGetMainWindow ? () => applyRegistration(lastGetMainWindow as GetMainWindow) : () => {};
  const tempRegistered: string[] = [];
  const details: Record<string, { accel: string; ok: boolean; error?: string }[]> = {};
  try {
    // Unregister our current accelerators to avoid self-conflict
    unregisterGlobalShortcuts();
    for (const act of getShortcutSchema()) {
      details[act.id] = [];
      for (const accel of toTest[act.id] || []) {
        try {
          const ok = globalShortcut.register(accel, () => {});
          if (ok) tempRegistered.push(accel);
          details[act.id].push({ accel, ok });
          if (!ok) {
            // keep going to collect all failures
          }
        } catch (e: any) {
          details[act.id].push({ accel, ok: false, error: String(e?.message || e) });
        }
      }
    }
  } finally {
    // Clean up our temporary registrations
    for (const accel of tempRegistered) {
      try {
        globalShortcut.unregister(accel);
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
