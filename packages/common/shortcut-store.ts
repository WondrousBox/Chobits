import { EventEmitter } from 'node:events';
import fs from 'node:fs';
import path from 'node:path';

import type { PlatformKey, ShortcutAction, ShortcutEnabledConfig, ShortcutsConfig } from '@packages/common/types/shortcuts';
import { app, type BrowserWindow } from 'electron';

export type { MultiAccel, PlatformKey, ShortcutAction, ShortcutEnabledConfig, ShortcutsConfig, ShortcutValue, SingleAccel } from '@packages/common/types/shortcuts';

export const SHORTCUT_SCHEMA: ShortcutAction[] = [
  {
    id: 'toggleChatWindow',
    label: 'AI 聊天面板切换',
    type: 'single',
    defaults: { darwin: 'CommandOrControl+K', win32: 'CommandOrControl+K', linux: 'CommandOrControl+K' }
  },
  {
    id: 'toggleDevtools',
    label: 'DevTools 切换',
    type: 'multi',
    defaults: { darwin: ['CommandOrControl+Shift+I'], win32: ['CommandOrControl+Shift+I'], linux: ['CommandOrControl+Shift+I'] }
  },
  {
    id: 'toggleMainWindow',
    label: '显示/隐藏主窗口',
    type: 'single',
    defaults: { darwin: 'CommandOrControl+Shift+K', win32: 'CommandOrControl+Shift+K', linux: 'CommandOrControl+Shift+K' }
  }
];

const emitter = new EventEmitter();
let cached: ShortcutsConfig | null = null;
let cachedEnabled: ShortcutEnabledConfig | null = null;

// 默认启用状态（当前没有默认关闭的快捷键）
const DEFAULT_ENABLED: ShortcutEnabledConfig = {};

function getFile(): string {
  const dir = app.getPath('userData');
  return path.join(dir, 'data', 'shortcuts.json');
}

function getEnabledFile(): string {
  const dir = app.getPath('userData');
  return path.join(dir, 'data', 'shortcuts-enabled.json');
}

function defaultConfigFromSchema(): ShortcutsConfig {
  const cfg: ShortcutsConfig = {};
  const plat = process.platform as PlatformKey;
  for (const act of SHORTCUT_SCHEMA) {
    const d = act.defaults[plat] ?? act.defaults.darwin ?? act.defaults.win32 ?? act.defaults.linux;
    if (d !== undefined) cfg[act.id] = d as any;
  }
  return cfg;
}

export function loadShortcutsConfig(): ShortcutsConfig {
  if (cached) return cached as ShortcutsConfig;
  const file = getFile();
  try {
    if (fs.existsSync(file)) {
      const txt = fs.readFileSync(file, 'utf8');
      const parsed = JSON.parse(txt);
      cached = { ...defaultConfigFromSchema(), ...(parsed as ShortcutsConfig) };
      return cached as ShortcutsConfig;
    }
  } catch {
    // fallthrough to defaults
  }
  cached = defaultConfigFromSchema();
  try {
    fs.writeFileSync(file, JSON.stringify(cached, null, 2), 'utf8');
  } catch {
    // ignore
  }
  return cached as ShortcutsConfig;
}

export function saveShortcutsConfig(partial: Partial<ShortcutsConfig>): ShortcutsConfig {
  const curr = loadShortcutsConfig();
  const next: ShortcutsConfig = { ...curr, ...sanitizeConfig(partial) };
  cached = next;
  try {
    fs.writeFileSync(getFile(), JSON.stringify(next, null, 2), 'utf8');
  } catch {
    // ignore
  }
  emitter.emit('changed', next);
  return next;
}

export function onShortcutsConfigChanged(cb: (cfg: ShortcutsConfig) => void): () => void {
  emitter.on('changed', cb);
  return () => emitter.off('changed', cb);
}

export function notifyShortcutsUpdatedTo(win?: BrowserWindow | null): void {
  try {
    const cfg = loadShortcutsConfig();
    win?.webContents?.send('shortcuts:config-updated', cfg);
  } catch {
    // ignore
  }
}

export function getShortcutSchema(): ShortcutAction[] {
  return SHORTCUT_SCHEMA;
}

function sanitizeConfig(partial: Partial<ShortcutsConfig>): ShortcutsConfig {
  const out: ShortcutsConfig = {} as any;
  for (const [k, v] of Object.entries(partial || {})) {
    if (v == null) continue;
    if (typeof v === 'string') out[k] = v.trim();
    else if (Array.isArray(v)) out[k] = v.filter(Boolean).map((s) => String(s).trim());
    else if (typeof v === 'object') {
      const obj: any = {};
      (['darwin', 'win32', 'linux'] as PlatformKey[]).forEach((p) => {
        const pv: any = (v as any)[p];
        if (pv == null) return;
        if (Array.isArray(pv)) obj[p] = pv.filter(Boolean).map((s) => String(s).trim());
        else if (typeof pv === 'string') obj[p] = pv.trim();
      });
      out[k] = obj;
    }
  }
  return out;
}

export function resolveAcceleratorsForPlatform(cfg: ShortcutsConfig, platform: PlatformKey = process.platform as PlatformKey): Record<string, string[]> {
  const resolved: Record<string, string[]> = {};
  for (const action of SHORTCUT_SCHEMA) {
    const val = (cfg as any)[action.id] ?? undefined;
    const def = action.defaults[platform] ?? action.defaults.darwin ?? action.defaults.win32 ?? action.defaults.linux;
    const ensureArr = (x: any): string[] => (Array.isArray(x) ? x : x != null ? [String(x)] : []);
    let accels: string[] = [];
    if (val == null) accels = ensureArr(def);
    else if (typeof val === 'string') accels = [val];
    else if (Array.isArray(val)) accels = val;
    else if (typeof val === 'object') {
      const pv = (val as any)[platform] ?? (val as any).darwin ?? (val as any).win32 ?? (val as any).linux ?? def;
      accels = ensureArr(pv);
    }
    resolved[action.id] = accels.filter(Boolean);
  }
  return resolved;
}

// ===== 快捷键启用状态管理 =====

export function loadShortcutEnabledConfig(): ShortcutEnabledConfig {
  if (cachedEnabled) return cachedEnabled;
  const file = getEnabledFile();
  try {
    if (fs.existsSync(file)) {
      const txt = fs.readFileSync(file, 'utf8');
      const parsed = JSON.parse(txt);
      cachedEnabled = { ...DEFAULT_ENABLED, ...parsed };
      return cachedEnabled!;
    }
  } catch {
    // fallthrough to defaults
  }
  cachedEnabled = { ...DEFAULT_ENABLED };
  try {
    const dir = path.dirname(file);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(file, JSON.stringify(cachedEnabled, null, 2), 'utf8');
  } catch {
    // ignore
  }
  return cachedEnabled;
}

export function saveShortcutEnabledConfig(partial: Partial<ShortcutEnabledConfig>): ShortcutEnabledConfig {
  const curr = loadShortcutEnabledConfig();
  const next: ShortcutEnabledConfig = { ...curr };
  for (const [key, value] of Object.entries(partial)) {
    if (value !== undefined) next[key] = value;
  }
  cachedEnabled = next;
  try {
    const file = getEnabledFile();
    const dir = path.dirname(file);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(file, JSON.stringify(next, null, 2), 'utf8');
  } catch {
    // ignore
  }
  emitter.emit('enabled-changed', next);
  return next;
}

export function onShortcutEnabledChanged(cb: (cfg: ShortcutEnabledConfig) => void): () => void {
  emitter.on('enabled-changed', cb);
  return () => emitter.off('enabled-changed', cb);
}

export function isShortcutEnabled(actionId: string): boolean {
  const cfg = loadShortcutEnabledConfig();
  // 只有在 enabled config 中明确配置的才需要检查
  if (actionId in cfg) {
    return (cfg as any)[actionId] === true;
  }
  // 其他快捷键默认启用
  return true;
}
