import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';

import { app } from 'electron';

import { WorkflowDefinition, WorkflowRunRecord } from './types';

const FILE = 'workflows.json';

type DbShape = {
  defs: WorkflowDefinition[];
  runs: WorkflowRunRecord[];
};

function getFile(): string {
  const dir = app.getPath('userData');
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

export const WorkflowStore = {
  async list(): Promise<WorkflowDefinition[]> {
    const db = await readDb();
    return db.defs;
  },
  async get(id: string): Promise<WorkflowDefinition | undefined> {
    const db = await readDb();
    return db.defs.find((d) => d.id === id);
  },
  async upsert(def: WorkflowDefinition): Promise<void> {
    const db = await readDb();
    const idx = db.defs.findIndex((d) => d.id === def.id);
    if (idx >= 0) db.defs[idx] = def;
    else db.defs.push(def);
    await writeDb(db);
  },
  async remove(id: string): Promise<void> {
    const db = await readDb();
    db.defs = db.defs.filter((d) => d.id !== id);
    await writeDb(db);
  },
  async addRun(rec: WorkflowRunRecord): Promise<void> {
    const db = await readDb();
    db.runs.push(rec);
    // cap size
    if (db.runs.length > 2000) db.runs = db.runs.slice(-1000);
    await writeDb(db);
  },
  async updateRun(rec: WorkflowRunRecord): Promise<void> {
    const db = await readDb();
    const idx = db.runs.findIndex((r) => r.runId === rec.runId);
    if (idx >= 0) db.runs[idx] = rec;
    else db.runs.push(rec);
    await writeDb(db);
  },
  async listRuns(workflowId?: string, limit = 100): Promise<WorkflowRunRecord[]> {
    const db = await readDb();
    const rows = workflowId ? db.runs.filter((r) => r.workflowId === workflowId) : db.runs;
    return rows.slice(-limit);
  }
};
