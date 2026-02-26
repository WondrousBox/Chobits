/**
 * PersonaStateService — 主进程人格状态持久化服务
 *
 * 使用 persona-state.json 文件存储人格状态数据。
 *
 * 使用方式：通过 IPC handler 被渲染进程调用。
 */

import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';

import { app } from 'electron';

import pkg from '../../../package.json';

// ============ 类型定义 ============

export interface PersonaStateRow {
  id: string;
  name: string;
  description?: string;

  // 经验系统
  xp: number;
  level: number;

  // 好感度
  favor: number;

  // 心情
  mood: string;
  moodIntensity: number;

  // 统计
  totalInteractions: number;
  totalSessionTime: number;
  loginStreak: number;
  lastLoginDate: string;

  // 成就（JSON 数组字符串）
  achievements: string;

  // 时间戳
  createdAt: number;
  updatedAt: number;
}

// ============ 文件路径 ============

const SETTINGS_DIR = path.join(app.getPath('userData'), 'data');
const PERSONA_STATE_FILE = path.join(SETTINGS_DIR, 'persona-state.json');

function ensureDirSync(dir: string): void {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

async function readJson<T>(file: string, fallback: T): Promise<T> {
  try {
    const raw = await fsp.readFile(file, 'utf-8');
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

async function writeJson(file: string, data: any): Promise<void> {
  ensureDirSync(path.dirname(file));
  await fsp.writeFile(file, JSON.stringify(data, null, 2), 'utf-8');
}

// ============ 默认状态 ============

function createDefaultState(): PersonaStateRow {
  const now = Date.now();
  return {
    id: 'default',
    name: pkg.name ?? 'Chobits',
    description: undefined,
    xp: 0,
    level: 1,
    favor: 50,
    mood: 'neutral',
    moodIntensity: 50,
    totalInteractions: 0,
    totalSessionTime: 0,
    loginStreak: 0,
    lastLoginDate: '',
    achievements: '[]',
    createdAt: now,
    updatedAt: now
  };
}

// ============ PersonaStateService ============

export class PersonaStateService {
  private state: PersonaStateRow;
  private dirty = false;
  private saveTimer: ReturnType<typeof setInterval> | null = null;

  constructor() {
    this.state = createDefaultState();
  }

  /** 初始化：加载状态 */
  async init(): Promise<void> {
    const saved = await readJson<PersonaStateRow | null>(PERSONA_STATE_FILE, null);
    if (saved) {
      this.state = { ...createDefaultState(), ...saved };
    }

    // 启动自动保存
    this.startAutoSave();
  }

  /** 获取当前状态 */
  getState(): PersonaStateRow {
    return { ...this.state };
  }

  /** 更新状态（partial merge） */
  async updateState(patch: Partial<PersonaStateRow>): Promise<PersonaStateRow> {
    // 防止覆盖 id 和时间戳
    const { id: _id, createdAt: _created, ...safePatch } = patch as any;
    Object.assign(this.state, safePatch);
    this.state.updatedAt = Date.now();
    this.dirty = true;
    await this.save();
    return this.getState();
  }

  /** 增加经验值 */
  async addXP(amount: number): Promise<{ leveledUp: boolean; newLevel: number }> {
    let leveledUp = false;
    this.state.xp += amount;

    // 升级公式：100 * level^1.5
    let xpNeeded = Math.floor(100 * Math.pow(this.state.level, 1.5));
    while (this.state.xp >= xpNeeded && this.state.level < 99) {
      this.state.xp -= xpNeeded;
      this.state.level += 1;
      xpNeeded = Math.floor(100 * Math.pow(this.state.level, 1.5));
      leveledUp = true;
    }

    this.state.updatedAt = Date.now();
    this.dirty = true;
    return { leveledUp, newLevel: this.state.level };
  }

  /** 修改好感度 */
  async changeFavor(delta: number): Promise<number> {
    this.state.favor = Math.max(0, Math.min(100, this.state.favor + delta));
    this.state.updatedAt = Date.now();
    this.dirty = true;
    return this.state.favor;
  }

  /** 记录交互 */
  recordInteraction(): void {
    this.state.totalInteractions += 1;
    this.state.updatedAt = Date.now();
    this.dirty = true;
  }

  /** 记录每日登录 */
  async recordDailyLogin(): Promise<{ isNewDay: boolean; streak: number }> {
    const today = new Date().toISOString().slice(0, 10);
    if (this.state.lastLoginDate === today) {
      return { isNewDay: false, streak: this.state.loginStreak };
    }

    const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
    this.state.loginStreak = this.state.lastLoginDate === yesterday ? this.state.loginStreak + 1 : 1;
    this.state.lastLoginDate = today;
    this.state.updatedAt = Date.now();
    this.dirty = true;
    await this.save();

    return { isNewDay: true, streak: this.state.loginStreak };
  }

  /** 解锁成就 */
  async unlockAchievement(achievementId: string): Promise<boolean> {
    const achievements: string[] = JSON.parse(this.state.achievements || '[]');
    if (achievements.includes(achievementId)) return false;
    achievements.push(achievementId);
    this.state.achievements = JSON.stringify(achievements);
    this.state.updatedAt = Date.now();
    this.dirty = true;
    await this.save();
    return true;
  }

  /** 持久化到文件 */
  async save(): Promise<void> {
    await writeJson(PERSONA_STATE_FILE, this.state);
    this.dirty = false;
  }

  /** 启动自动保存（每 60 秒） */
  startAutoSave(intervalMs = 60000): void {
    this.stopAutoSave();
    this.saveTimer = setInterval(async () => {
      if (this.dirty) {
        await this.save();
      }
    }, intervalMs);
  }

  /** 停止自动保存 */
  stopAutoSave(): void {
    if (this.saveTimer) {
      clearInterval(this.saveTimer);
      this.saveTimer = null;
    }
  }

  /** 销毁（保存并清理） */
  async destroy(): Promise<void> {
    this.stopAutoSave();
    if (this.dirty) {
      await this.save();
    }
  }
}

/** 全局单例 */
let _instance: PersonaStateService | null = null;

export function getPersonaStateService(): PersonaStateService {
  if (!_instance) {
    _instance = new PersonaStateService();
  }
  return _instance;
}
