import { EventEmitter } from 'node:events';
import fs from 'node:fs';
import path from 'node:path';

import { app, BrowserWindow } from 'electron';

export type PlatformKey = 'darwin' | 'win32' | 'linux';
export type SingleAccel = string | Partial<Record<PlatformKey, string>>;
export type MultiAccel = string[] | Partial<Record<PlatformKey, string[]>>;
export type ShortcutValue = SingleAccel | MultiAccel;
export type ShortcutsConfig = Record<string, ShortcutValue>;

export type ShortcutAction = {
  id: string;
  label: string;
  description?: string;
  type: 'single' | 'multi';
  defaults: Partial<Record<PlatformKey, string | string[]>>;
};

export const SHORTCUT_SCHEMA: ShortcutAction[] = [
  {
    id: 'toggleAssistant',
    label: '助手面板切换',
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
  },
  {
    id: 'screenshot',
    label: '截图',
    description: '触发截图功能',
    type: 'single',
    defaults: { darwin: 'CommandOrControl+Shift+A', win32: 'CommandOrControl+Shift+A', linux: 'CommandOrControl+Shift+A' }
  }
  // {
  //   id: 'favoriteCurrentResource',
  //   label: '收藏当前资源',
  //   description: '触发收藏当前资源（由资源页面监听实现）',
  //   type: 'single',
  //   defaults: { darwin: 'CommandOrControl+Shift+F', win32: 'CommandOrControl+Shift+F', linux: 'CommandOrControl+Shift+F' }
  // }
];

const emitter = new EventEmitter();
let cached: ShortcutsConfig | null = null;

function getFile(): string {
  const dir = app.getPath('userData');
  return path.join(dir, 'shortcuts.json');
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
      cached = migrateLegacyConfig(parsed);
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
    win?.webContents?.send('shortcuts-config-updated', cfg);
  } catch {
    // ignore
  }
}

export function getShortcutSchema(): ShortcutAction[] {
  return SHORTCUT_SCHEMA;
}

function migrateLegacyConfig(parsed: any): ShortcutsConfig {
  const next: ShortcutsConfig = {};
  if (parsed && (parsed.assistantToggle || parsed.devtoolsToggle)) {
    if (parsed.assistantToggle) next['toggleAssistant'] = typeof parsed.assistantToggle === 'string' ? parsed.assistantToggle : '';
    if (parsed.devtoolsToggle) next['toggleDevtools'] = Array.isArray(parsed.devtoolsToggle) ? parsed.devtoolsToggle.filter(Boolean) : [];
  }
  Object.keys(parsed || {}).forEach((k) => {
    if (k !== 'assistantToggle' && k !== 'devtoolsToggle') next[k] = (parsed as any)[k];
  });
  const defaults = defaultConfigFromSchema();
  return { ...defaults, ...next };
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
