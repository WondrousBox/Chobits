import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';

import { app } from 'electron';

import { getResourcePath } from '../../electron/main/utils/resources-path';
import { WorkflowDefinition, WorkflowRunRecord } from './types';

const FILE = 'workflows.json';

type DbShape = {
  defs: WorkflowDefinition[];
  runs: WorkflowRunRecord[];
};

// 预设工作流ID集合（从JSON文件加载）
let presetWorkflowIds = new Set<string>();

// 预设工作流缓存
let presetWorkflowsCache: WorkflowDefinition[] | null = null;
let presetWorkflowsCacheTime: number = 0;
const PRESET_CACHE_TTL = 60000; // 缓存1分钟

function getFile(): string {
  const dir = path.resolve(app.getPath('userData'), 'data');
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return path.join(dir, FILE);
}

async function readDb(): Promise<DbShape> {
  const file = getFile();
  try {
    if (fs.existsSync(file)) {
      const txt = await fsp.readFile(file, 'utf8');
      return JSON.parse(txt);
    }
  } catch {
    // ignore
  }
  return { defs: [], runs: [] };
}

async function writeDb(db: DbShape): Promise<void> {
  const file = getFile();
  await fsp.writeFile(file, JSON.stringify(db, null, 2), 'utf8');
}

/**
 * 加载预设工作流定义（带缓存）
 */
export async function loadPresetWorkflows(forceReload = false): Promise<WorkflowDefinition[]> {
  const now = Date.now();

  // 如果缓存有效且不强制重新加载，直接返回缓存
  if (!forceReload && presetWorkflowsCache !== null && now - presetWorkflowsCacheTime < PRESET_CACHE_TTL) {
    return presetWorkflowsCache;
  }

  try {
    const file = getResourcePath('workflows');
    if (!fs.existsSync(file)) {
      console.warn('[WorkflowStore] 预设工作流文件不存在:', file);
      presetWorkflowsCache = [];
      presetWorkflowsCacheTime = now;
      return [];
    }
    const txt = await fsp.readFile(file, 'utf8');
    const workflows = JSON.parse(txt) as WorkflowDefinition[];
    // 更新预设工作流ID集合
    presetWorkflowIds = new Set(workflows.map((w) => w.id));
    // 更新缓存
    presetWorkflowsCache = workflows;
    presetWorkflowsCacheTime = now;
    console.log(`[WorkflowStore] 加载了 ${workflows.length} 个预设工作流`);
    return workflows;
  } catch (err) {
    console.error('[WorkflowStore] 加载预设工作流失败:', err);
    presetWorkflowsCache = [];
    presetWorkflowsCacheTime = now;
    return [];
  }
}

/**
 * 检查工作流是否为预设工作流
 */
export function isPresetWorkflow(id: string): boolean {
  return presetWorkflowIds.has(id);
}

// 内存缓存
let dbCache: DbShape | null = null;
let saveTimer: NodeJS.Timeout | null = null;
const SAVE_DELAY = 2000; // 2秒防抖

async function ensureLoaded(): Promise<DbShape> {
  if (dbCache) return dbCache;
  dbCache = await readDb();
  return dbCache;
}

async function scheduleSave(): Promise<void> {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(async () => {
    if (dbCache) {
      await writeDb(dbCache);
    }
    saveTimer = null;
  }, SAVE_DELAY);
}

// 立即保存（用于应用退出时）
export async function flushStore(): Promise<void> {
  if (saveTimer) {
    clearTimeout(saveTimer);
    saveTimer = null;
  }
  if (dbCache) {
    await writeDb(dbCache);
  }
}

export const WorkflowStore = {
  async list(): Promise<WorkflowDefinition[]> {
    const db = await ensureLoaded();
    return db.defs;
  },
  async get(id: string): Promise<WorkflowDefinition | undefined> {
    const db = await ensureLoaded();
    return db.defs.find((d) => d.id === id);
  },
  async upsert(def: WorkflowDefinition): Promise<void> {
    // 不允许保存预设工作流
    if (isPresetWorkflow(def.id)) {
      throw new Error(`不能修改预设工作流: ${def.id}`);
    }
    const db = await ensureLoaded();
    const idx = db.defs.findIndex((d) => d.id === def.id);
    if (idx >= 0) db.defs[idx] = def;
    else db.defs.push(def);
    await scheduleSave();
  },
  async remove(id: string): Promise<void> {
    // 不允许删除预设工作流
    if (isPresetWorkflow(id)) {
      throw new Error(`不能删除预设工作流: ${id}`);
    }
    const db = await ensureLoaded();
    db.defs = db.defs.filter((d) => d.id !== id);
    await scheduleSave();
  },
  async addRun(rec: WorkflowRunRecord): Promise<void> {
    const db = await ensureLoaded();
    db.runs.push(rec);
    // cap size
    if (db.runs.length > 2000) db.runs = db.runs.slice(-1000);
    await scheduleSave();
  },
  async updateRun(rec: WorkflowRunRecord): Promise<void> {
    const db = await ensureLoaded();
    const idx = db.runs.findIndex((r) => r.runId === rec.runId);
    if (idx >= 0) db.runs[idx] = rec;
    else db.runs.push(rec);
    await scheduleSave();
  },
  async listRuns(workflowId?: string, limit = 100, resourceId?: string): Promise<WorkflowRunRecord[]> {
    const db = await ensureLoaded();
    let rows = db.runs;
    if (workflowId) {
      rows = rows.filter((r) => r.workflowId === workflowId);
    }
    if (resourceId) {
      rows = rows.filter((r) => r.metadata?.resourceId === resourceId);
    }
    return rows.slice(-limit);
  },
  async removeRun(runId: string): Promise<void> {
    const db = await ensureLoaded();
    db.runs = db.runs.filter((r) => r.runId !== runId);
    await scheduleSave();
  }
};
