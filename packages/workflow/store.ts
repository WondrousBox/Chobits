import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';

import { app } from 'electron';

import { WorkflowDefinition, WorkflowRunRecord } from './types';

const DEFS_FILE = 'workflows.json';
const RUNS_FILE_PREFIX = 'runs';

type DefsShape = {
  defs: WorkflowDefinition[];
};

type RunsShape = WorkflowRunRecord[];

// 预设工作流ID集合（从JSON文件加载）
let presetWorkflowIds = new Set<string>();

// 预设工作流缓存
let presetWorkflowsCache: WorkflowDefinition[] | null = null;
let presetWorkflowsCacheTime: number = 0;
const PRESET_CACHE_TTL = 60000; // 缓存1分钟

function getDataDir(): string {
  const dir = path.resolve(app.getPath('userData'), 'data');
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return dir;
}

function getDefsFile(): string {
  return path.join(getDataDir(), DEFS_FILE);
}

function getRunsFile(spaceId?: string): string {
  const filename = spaceId ? `${RUNS_FILE_PREFIX}-${spaceId}.json` : `${RUNS_FILE_PREFIX}.json`;
  return path.join(getDataDir(), filename);
}

async function readDefs(): Promise<DefsShape> {
  const file = getDefsFile();
  try {
    if (fs.existsSync(file)) {
      const txt = await fsp.readFile(file, 'utf8');
      const data = JSON.parse(txt);
      return { defs: Array.isArray(data.defs) ? data.defs : [] };
    }
  } catch {
    // ignore
  }
  return { defs: [] };
}

async function writeDefs(db: DefsShape): Promise<void> {
  const file = getDefsFile();
  await fsp.writeFile(file, JSON.stringify(db, null, 2), 'utf8');
}

async function readRuns(spaceId?: string): Promise<RunsShape> {
  const file = getRunsFile(spaceId);
  try {
    if (fs.existsSync(file)) {
      const txt = await fsp.readFile(file, 'utf8');
      const data = JSON.parse(txt);
      return Array.isArray(data) ? data : [];
    }
    if (!spaceId) {
      const defsFile = getDefsFile();
      if (fs.existsSync(defsFile)) {
        const txt = await fsp.readFile(defsFile, 'utf8');
        const data = JSON.parse(txt);
        if (Array.isArray(data.runs) && data.runs.length > 0) {
          console.log('[WorkflowStore] Migrating legacy runs from workflows.json to runs.json');
          return data.runs;
        }
      }
    }
  } catch {
    // ignore
  }
  return [];
}

async function writeRuns(spaceId: string | undefined, runs: RunsShape): Promise<void> {
  const file = getRunsFile(spaceId);
  await fsp.writeFile(file, JSON.stringify(runs, null, 2), 'utf8');
}

/**
 * 加载预设工作流定义（带缓存）
 */
export async function loadPresetWorkflows(definitionsPath: string, forceReload?: boolean): Promise<WorkflowDefinition[]> {
  const now = Date.now();

  // 如果缓存有效且不强制重新加载，直接返回缓存
  if (!forceReload && presetWorkflowsCache !== null && now - presetWorkflowsCacheTime < PRESET_CACHE_TTL) {
    return presetWorkflowsCache;
  }

  try {
    const file = definitionsPath;
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
let defsCache: DefsShape | null = null;
const runsCache = new Map<string, RunsShape>(); // key is spaceId (or 'default' for undefined)

let defsSaveTimer: NodeJS.Timeout | null = null;
const runsSaveTimers = new Map<string, NodeJS.Timeout>();
const SAVE_DELAY = 2000; // 2秒防抖

async function ensureDefsLoaded(): Promise<DefsShape> {
  if (defsCache) return defsCache;
  defsCache = await readDefs();
  return defsCache;
}

async function ensureRunsLoaded(spaceId?: string): Promise<RunsShape> {
  const key = spaceId || 'default';
  if (runsCache.has(key)) return runsCache.get(key)!;
  const runs = await readRuns(spaceId);
  runsCache.set(key, runs);
  return runs;
}

async function scheduleSaveDefs(): Promise<void> {
  if (defsSaveTimer) clearTimeout(defsSaveTimer);
  defsSaveTimer = setTimeout(async () => {
    if (defsCache) {
      await writeDefs(defsCache);
    }
    defsSaveTimer = null;
  }, SAVE_DELAY);
}

async function scheduleSaveRuns(spaceId?: string): Promise<void> {
  const key = spaceId || 'default';
  if (runsSaveTimers.has(key)) clearTimeout(runsSaveTimers.get(key)!);
  const timer = setTimeout(async () => {
    const runs = runsCache.get(key);
    if (runs) {
      await writeRuns(spaceId, runs);
    }
    runsSaveTimers.delete(key);
  }, SAVE_DELAY);
  runsSaveTimers.set(key, timer);
}

// 立即保存（用于应用退出时）
export async function flushStore(): Promise<void> {
  if (defsSaveTimer) {
    clearTimeout(defsSaveTimer);
    defsSaveTimer = null;
  }
  if (defsCache) {
    await writeDefs(defsCache);
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  for (const [key, timer] of runsSaveTimers) {
    clearTimeout(timer);
  }
  runsSaveTimers.clear();

  for (const [key, runs] of runsCache) {
    const spaceId = key === 'default' ? undefined : key;
    await writeRuns(spaceId, runs);
  }
}

export const WorkflowStore = {
  async list(): Promise<WorkflowDefinition[]> {
    const db = await ensureDefsLoaded();
    return db.defs;
  },
  async get(id: string): Promise<WorkflowDefinition | undefined> {
    const db = await ensureDefsLoaded();
    return db.defs.find((d) => d.id === id);
  },
  async upsert(def: WorkflowDefinition): Promise<void> {
    // 不允许保存预设工作流
    if (isPresetWorkflow(def.id)) {
      throw new Error(`不能修改预设工作流: ${def.id}`);
    }
    const db = await ensureDefsLoaded();
    const idx = db.defs.findIndex((d) => d.id === def.id);
    if (idx >= 0) db.defs[idx] = def;
    else db.defs.push(def);
    await scheduleSaveDefs();
  },
  async remove(id: string): Promise<void> {
    // 不允许删除预设工作流
    if (isPresetWorkflow(id)) {
      throw new Error(`不能删除预设工作流: ${id}`);
    }
    const db = await ensureDefsLoaded();
    db.defs = db.defs.filter((d) => d.id !== id);
    await scheduleSaveDefs();
  },
  async addRun(rec: WorkflowRunRecord): Promise<void> {
    const spaceId = rec.metadata?.spaceId;
    const runs = await ensureRunsLoaded(spaceId);
    runs.push(rec);
    // cap size
    if (runs.length > 2000) {
      const newRuns = runs.slice(-1000);
      const key = spaceId || 'default';
      runsCache.set(key, newRuns);
    }
    await scheduleSaveRuns(spaceId);
  },
  async updateRun(rec: WorkflowRunRecord): Promise<void> {
    const spaceId = rec.metadata?.spaceId;
    const runs = await ensureRunsLoaded(spaceId);
    const idx = runs.findIndex((r) => r.runId === rec.runId);
    if (idx >= 0) runs[idx] = rec;
    else runs.push(rec);
    await scheduleSaveRuns(spaceId);
  },
  async listRuns(workflowId?: string, limit = 100, resourceId?: string, spaceId?: string): Promise<WorkflowRunRecord[]> {
    const runs = await ensureRunsLoaded(spaceId);
    let rows = runs;
    if (workflowId) {
      rows = rows.filter((r) => r.workflowId === workflowId);
    }
    if (resourceId) {
      rows = rows.filter((r) => r.metadata?.resourceId === resourceId);
    }
    return rows.slice(-limit);
  },
  async removeRun(runId: string, spaceId?: string): Promise<void> {
    const runs = await ensureRunsLoaded(spaceId);
    const newRuns = runs.filter((r) => r.runId !== runId);
    const key = spaceId || 'default';
    runsCache.set(key, newRuns);
    await scheduleSaveRuns(spaceId);
  }
};
