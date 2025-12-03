import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import { app } from 'electron';

export type PromptTemplate = {
  id: string;
  name: string;
  type: 'system' | 'user';
  content: string;
  tags?: string[];
  createdAt: number;
  updatedAt: number;
};

type StoreShape = { templates: PromptTemplate[] };

const FILE = path.join(app.getPath('userData'), 'ai-prompt-templates.json');

function read(): StoreShape {
  try {
    const raw = fs.readFileSync(FILE, 'utf8');
    const data = JSON.parse(raw);
    return { templates: Array.isArray(data?.templates) ? data.templates : [] };
  } catch {
    return { templates: [] };
  }
}
function write(data: StoreShape) {
  try {
    fs.mkdirSync(path.dirname(FILE), { recursive: true });
    fs.writeFileSync(FILE, JSON.stringify(data, null, 2), 'utf8');
  } catch { }
}

export const PromptsStore = {
  list(): PromptTemplate[] {
    return read().templates;
  },
  get(id: string): PromptTemplate | undefined {
    return read().templates.find((t) => t.id === id);
  },
  create(payload: Omit<PromptTemplate, 'id' | 'createdAt' | 'updatedAt'> & { id?: string }): PromptTemplate {
    const d = read();
    const now = Date.now();
    const item: PromptTemplate = { id: payload.id || randomUUID(), createdAt: now, updatedAt: now, ...payload } as any;
    d.templates.push(item);
    write(d);
    return item;
  },
  update(id: string, patch: Partial<Omit<PromptTemplate, 'id' | 'createdAt'>>): PromptTemplate | undefined {
    const d = read();
    const idx = d.templates.findIndex((t) => t.id === id);
    if (idx < 0) return undefined;
    const next = { ...d.templates[idx], ...patch, updatedAt: Date.now() } as PromptTemplate;
    d.templates[idx] = next;
    write(d);
    return next;
  },
  delete(id: string): boolean {
    const d = read();
    const before = d.templates.length;
    d.templates = d.templates.filter((t) => t.id !== id);
    write(d);
    return d.templates.length !== before;
  }
};
