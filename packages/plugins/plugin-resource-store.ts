import fs from 'node:fs';
import path from 'node:path';

import { app } from 'electron';

import { PluginResource } from '.';

type StoreShape = {
  resources: PluginResource[];
};

const STORE_DIR = path.join(app.getPath('userData'), 'data');
const STORE_FILE = path.join(STORE_DIR, 'plugin-resources.json');

function ensureStore(): void {
  if (!fs.existsSync(STORE_DIR)) fs.mkdirSync(STORE_DIR, { recursive: true });
  if (!fs.existsSync(STORE_FILE)) {
    fs.writeFileSync(STORE_FILE, JSON.stringify({ resources: [] } as StoreShape, null, 2));
  }
}

function read(): StoreShape {
  ensureStore();
  try {
    const raw = fs.readFileSync(STORE_FILE, 'utf-8');
    const data = JSON.parse(raw);
    return { resources: Array.isArray(data.resources) ? data.resources : [] };
  } catch {
    return { resources: [] };
  }
}

function write(next: StoreShape): void {
  ensureStore();
  fs.writeFileSync(STORE_FILE, JSON.stringify(next, null, 2));
}

export const PluginResourceStore = {
  list(): PluginResource[] {
    return read().resources;
  },

  listByPlugin(pluginId: string): PluginResource[] {
    return read().resources.filter((r) => r.pluginId === pluginId);
  },

  listByType(pluginId: string, type: 'engine' | 'model'): PluginResource[] {
    return read().resources.filter((r) => r.pluginId === pluginId && r.type === type);
  },

  get(id: string): PluginResource | undefined {
    return read().resources.find((r) => r.id === id);
  },

  upsert(resource: PluginResource): PluginResource {
    const cur = read();
    const idx = cur.resources.findIndex((r) => r.id === resource.id);
    if (idx >= 0) {
      cur.resources[idx] = { ...cur.resources[idx], ...resource, updatedAt: Date.now() };
    } else {
      cur.resources.push({ ...resource, updatedAt: Date.now() });
    }
    write(cur);
    return resource;
  },

  patch(id: string, patch: Partial<PluginResource>): PluginResource | undefined {
    const cur = read();
    const idx = cur.resources.findIndex((r) => r.id === id);
    if (idx < 0) return undefined;
    cur.resources[idx] = { ...cur.resources[idx], ...patch, updatedAt: Date.now() };
    write(cur);
    return cur.resources[idx];
  },

  remove(id: string): boolean {
    const cur = read();
    const idx = cur.resources.findIndex((r) => r.id === id);
    if (idx < 0) return false;
    cur.resources.splice(idx, 1);
    write(cur);
    return true;
  },

  removeByPlugin(pluginId: string): number {
    const cur = read();
    const before = cur.resources.length;
    cur.resources = cur.resources.filter((r) => r.pluginId !== pluginId);
    write(cur);
    return before - cur.resources.length;
  }
};
