/**
 * 持久化模块
 *
 * - PersonaStatePersistence: 人格状态持久化（自动保存 + debounce）
 * - AutoWalkConfig: 自动行走配置持久化
 */

import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';

import type { PersonaStatePersistenceRow } from './types';

type LegacyPersonaStatePersistenceRow = Partial<Omit<PersonaStatePersistenceRow, 'version' | 'achievements' | 'dimensions'>> & {
  version?: unknown;
  achievements?: unknown;
  dimensions?: unknown;
};

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function normalizeString(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

function normalizeNumber(value: unknown, fallback = 0): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function normalizeAchievements(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.filter((item): item is string => typeof item === 'string');
  }

  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === 'string') : [];
    } catch {
      return [];
    }
  }

  return [];
}

function normalizeDimensions(value: unknown): Record<string, number> {
  if (!isPlainObject(value)) return {};

  const dimensions: Record<string, number> = {};
  for (const [dimensionId, dimensionValue] of Object.entries(value)) {
    if (typeof dimensionValue === 'number' && Number.isFinite(dimensionValue)) {
      dimensions[dimensionId] = dimensionValue;
    }
  }

  return dimensions;
}

function normalizeLoadedState(raw: unknown): PersonaStatePersistenceRow | null {
  if (!isPlainObject(raw)) return null;

  const parsed = raw as LegacyPersonaStatePersistenceRow;
  const now = Date.now();

  return {
    id: normalizeString(parsed.id, 'default'),
    version: 2,
    name: normalizeString(parsed.name, 'Chobits'),
    description: typeof parsed.description === 'string' ? parsed.description : undefined,
    xp: normalizeNumber(parsed.xp, 0),
    level: Math.max(1, normalizeNumber(parsed.level, 1)),
    favor: normalizeNumber(parsed.favor, 50),
    mood: normalizeString(parsed.mood, 'neutral') as PersonaStatePersistenceRow['mood'],
    moodIntensity: normalizeNumber(parsed.moodIntensity, 50),
    totalInteractions: normalizeNumber(parsed.totalInteractions, 0),
    totalSessionTime: normalizeNumber(parsed.totalSessionTime, 0),
    loginStreak: normalizeNumber(parsed.loginStreak, 0),
    lastLoginDate: normalizeString(parsed.lastLoginDate, ''),
    achievements: normalizeAchievements(parsed.achievements),
    dimensions: normalizeDimensions(parsed.dimensions),
    createdAt: normalizeNumber(parsed.createdAt, now),
    updatedAt: normalizeNumber(parsed.updatedAt, now)
  };
}

// ============================================================================
// 人格状态持久化
// ============================================================================

export class PersonaStatePersistence {
  private filePath: string;
  private dirty = false;
  private saveTimer: ReturnType<typeof setInterval> | null = null;
  private debounceTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(dataDir: string) {
    const settingsDir = path.join(dataDir, 'data');
    this.filePath = path.join(settingsDir, 'persona-state.json');
  }

  /** 加载状态 */
  async load(): Promise<PersonaStatePersistenceRow | null> {
    try {
      const raw = await fsp.readFile(this.filePath, 'utf-8');
      return normalizeLoadedState(JSON.parse(raw));
    } catch {
      return null;
    }
  }

  /** 标记为脏并 debounce 保存 */
  markDirty(): void {
    this.dirty = true;
    this.debounceSave();
  }

  /** 立即保存 */
  async save(state: PersonaStatePersistenceRow): Promise<void> {
    try {
      const dir = path.dirname(this.filePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      await fsp.writeFile(this.filePath, JSON.stringify(state, null, 2), 'utf-8');
      this.dirty = false;
    } catch (err) {
      console.error('[SpriteManager] Failed to save persona state:', err);
    }
  }

  /** 启动自动保存 (每 60 秒) */
  startAutoSave(getState: () => PersonaStatePersistenceRow): void {
    this.stopAutoSave();
    this.saveTimer = setInterval(async () => {
      if (this.dirty) {
        await this.save(getState());
      }
    }, 60_000);
  }

  /** 停止自动保存 */
  stopAutoSave(): void {
    if (this.saveTimer) {
      clearInterval(this.saveTimer);
      this.saveTimer = null;
    }
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }
  }

  /** debounce 保存 (5 秒) */
  private debounceSave(): void {
    if (this.debounceTimer) clearTimeout(this.debounceTimer);
    this.debounceTimer = setTimeout(() => {
      // actual save is done by auto-save loop
    }, 5_000);
  }

  isDirty(): boolean {
    return this.dirty;
  }
}

// ============================================================================
// Auto-walk 配置持久化
// ============================================================================

export class AutoWalkConfig {
  private filePath: string;
  private _enabled = true;

  constructor(dataDir: string) {
    this.filePath = path.join(dataDir, 'data', 'auto-walk-config.json');
  }

  load(): void {
    try {
      if (fs.existsSync(this.filePath)) {
        const txt = fs.readFileSync(this.filePath, 'utf8');
        const parsed = JSON.parse(txt);
        this._enabled = parsed.enabled ?? true;
      }
    } catch {
      this._enabled = true;
    }
  }

  save(): void {
    try {
      const dir = path.dirname(this.filePath);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(this.filePath, JSON.stringify({ enabled: this._enabled }, null, 2), 'utf8');
    } catch {
      /* ignore */
    }
  }

  get enabled(): boolean {
    return this._enabled;
  }

  set enabled(v: boolean) {
    this._enabled = v;
    this.save();
  }
}
