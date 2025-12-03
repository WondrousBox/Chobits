import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import { app } from 'electron';

export type ProviderInstance = {
  id: string;
  providerId: string;
  name: string;
  model?: string;
  systemPrompt?: string;
  // non-secret config copy (e.g., baseUrl or org)
  config?: Record<string, any>;
  createdAt: number;
  updatedAt: number;
};

type StoreShape = { instances: ProviderInstance[] };

const FILE = path.join(app.getPath('userData'), 'ai-provider-instances.json');

function read(): StoreShape {
  try {
    const raw = fs.readFileSync(FILE, 'utf8');
    const data = JSON.parse(raw);
    return { instances: Array.isArray(data?.instances) ? data.instances : [] };
  } catch {
    return { instances: [] };
  }
}
function write(data: StoreShape) {
  try {
    fs.mkdirSync(path.dirname(FILE), { recursive: true });
    fs.writeFileSync(FILE, JSON.stringify(data, null, 2), 'utf8');
  } catch { }
}

export const InstancesStore = {
  list(providerId?: string): ProviderInstance[] {
    const d = read();
    return providerId ? d.instances.filter((i) => i.providerId === providerId) : d.instances;
  },
  get(id: string): ProviderInstance | undefined {
    const d = read();
    return d.instances.find((i) => i.id === id);
  },
  create(payload: Omit<ProviderInstance, 'id' | 'createdAt' | 'updatedAt'> & { id?: string }): ProviderInstance {
    const d = read();
    const now = Date.now();
    const item: ProviderInstance = {
      id: payload.id || randomUUID(),
      providerId: payload.providerId,
      name: payload.name,
      model: payload.model,
      systemPrompt: payload.systemPrompt,
      config: payload.config || {},
      createdAt: now,
      updatedAt: now
    };
    d.instances.push(item);
    write(d);
    return item;
  },
  update(id: string, patch: Partial<Omit<ProviderInstance, 'id' | 'createdAt'>>): ProviderInstance | undefined {
    const d = read();
    const idx = d.instances.findIndex((i) => i.id === id);
    if (idx < 0) return undefined;
    const next = { ...d.instances[idx], ...patch, updatedAt: Date.now() } as ProviderInstance;
    d.instances[idx] = next;
    write(d);
    return next;
  },
  delete(id: string): boolean {
    const d = read();
    const before = d.instances.length;
    d.instances = d.instances.filter((i) => i.id !== id);
    write(d);
    return d.instances.length !== before;
  }
};
