import fs from 'node:fs';
import path from 'node:path';

import { app } from 'electron';

export type StoredModel = {
  id: string;
  name: string;
  displayName?: string;
  version?: string;
  sizeBytes?: number;
  checksum?: string;
  algo?: string;
  sourceType?: string;
  sourceUrl?: string;
  installPath?: string;
  status?: string;
  progressBytes?: number;
  installedAt?: number;
  updatedAt?: number;
  lastError?: string;
};

export type ModelConfig = {
  rootDir?: string;
  defaultModelId?: string;
  concurrency?: number;
};

type StoreShape = {
  config: ModelConfig;
  models: StoredModel[];
};

const STORE_DIR = path.join(app.getPath('userData'), 'data');
const STORE_FILE = path.join(STORE_DIR, 'model-configs.json');

function ensureStore(): void {
  if (!fs.existsSync(STORE_DIR)) fs.mkdirSync(STORE_DIR, { recursive: true });
  if (!fs.existsSync(STORE_FILE)) fs.writeFileSync(STORE_FILE, JSON.stringify({ config: { concurrency: 2 }, models: [] } as StoreShape, null, 2));
}

function read(): StoreShape {
  ensureStore();
  try {
    const raw = fs.readFileSync(STORE_FILE, 'utf-8');
    const data = JSON.parse(raw);
    return { config: data.config || {}, models: Array.isArray(data.models) ? data.models : [] };
  } catch {
    return { config: { concurrency: 2 }, models: [] };
  }
}

function write(next: StoreShape): void {
  ensureStore();
  fs.writeFileSync(STORE_FILE, JSON.stringify(next, null, 2));
}

export const ModelStore = {
  getConfig(): ModelConfig {
    return read().config;
  },
  setConfig(patch: Partial<ModelConfig>): ModelConfig {
    const cur = read();
    const merged = { ...cur.config, ...patch };
    write({ ...cur, config: merged });
    return merged;
  },
  list(): StoredModel[] {
    return read().models;
  },
  get(id: string): StoredModel | undefined {
    return read().models.find((m) => m.id === id);
  },
  upsert(model: StoredModel): StoredModel {
    const cur = read();
    const idx = cur.models.findIndex((m) => m.id === model.id);
    if (idx >= 0) cur.models[idx] = { ...cur.models[idx], ...model, updatedAt: Date.now() };
    else cur.models.push({ ...model, updatedAt: Date.now() });
    write(cur);
    return model;
  },
  patch(id: string, patch: Partial<StoredModel>): StoredModel | undefined {
    const cur = read();
    const idx = cur.models.findIndex((m) => m.id === id);
    if (idx < 0) return undefined;
    cur.models[idx] = { ...cur.models[idx], ...patch, updatedAt: Date.now() };
    write(cur);
    return cur.models[idx];
  },
  replaceAll(list: StoredModel[]) {
    const cur = read();
    write({ ...cur, models: list });
  }
};
