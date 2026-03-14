import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import { app } from 'electron';

import { toCanonicalProviderId } from './runtime/pi/provider-alias';

export type ProviderPreset = {
  id: string;
  providerId: string;
  name: string;
  model?: string;
  systemPrompt?: string;
  // non-secret config copy (e.g., baseUrl or org)
  config?: Record<string, any>;
  // enabled tools for this preset
  enabledTools?: string[];
  createdAt: number;
  updatedAt: number;
};

export type ProviderInstance = ProviderPreset;

type StoreShape = { presets: ProviderPreset[] };

const FILE = path.join(app.getPath('userData'), 'data', 'ai-provider-presets.json');
const LEGACY_FILE = path.join(app.getPath('userData'), 'data', 'ai-provider-instances.json');

function normalizePreset(preset: ProviderPreset): ProviderPreset {
  const canonicalProviderId = toCanonicalProviderId(preset.providerId);
  if (canonicalProviderId === preset.providerId) {
    return preset;
  }

  return {
    ...preset,
    providerId: canonicalProviderId
  };
}

function toStoreShape(data: unknown): StoreShape {
  const rawPresets = Array.isArray((data as any)?.presets) ? (data as any).presets : Array.isArray((data as any)?.instances) ? (data as any).instances : [];

  return {
    presets: rawPresets.map(normalizePreset)
  };
}

function readFile(file: string): StoreShape | undefined {
  try {
    const raw = fs.readFileSync(file, 'utf8');
    return toStoreShape(JSON.parse(raw));
  } catch {
    return undefined;
  }
}

function read(): StoreShape {
  return readFile(FILE) || readFile(LEGACY_FILE) || { presets: [] };
}

function write(data: StoreShape): void {
  try {
    const normalizedData = {
      presets: data.presets.map(normalizePreset)
    };
    fs.mkdirSync(path.dirname(FILE), { recursive: true });
    fs.writeFileSync(FILE, JSON.stringify(normalizedData, null, 2), 'utf8');
  } catch {
    // ignore write errors
  }
}

const presetStore = {
  list(providerId?: string): ProviderPreset[] {
    const d = read();
    const canonicalProviderId = providerId ? toCanonicalProviderId(providerId) : undefined;
    return canonicalProviderId ? d.presets.filter((preset) => preset.providerId === canonicalProviderId) : d.presets;
  },
  get(id: string): ProviderPreset | undefined {
    const d = read();
    return d.presets.find((preset) => preset.id === id);
  },
  create(payload: Omit<ProviderPreset, 'id' | 'createdAt' | 'updatedAt'> & { id?: string }): ProviderPreset {
    const d = read();
    const now = Date.now();
    const item: ProviderPreset = {
      id: payload.id || randomUUID(),
      providerId: toCanonicalProviderId(payload.providerId),
      name: payload.name,
      model: payload.model,
      systemPrompt: payload.systemPrompt,
      config: payload.config || {},
      enabledTools: payload.enabledTools || [],
      createdAt: now,
      updatedAt: now
    };
    d.presets.push(item);
    write(d);
    return item;
  },
  update(id: string, patch: Partial<Omit<ProviderPreset, 'id' | 'createdAt'>>): ProviderPreset | undefined {
    const d = read();
    const idx = d.presets.findIndex((preset) => preset.id === id);
    if (idx < 0) return undefined;
    const next = normalizePreset({
      ...d.presets[idx],
      ...patch,
      ...(patch.providerId ? { providerId: toCanonicalProviderId(patch.providerId) } : {}),
      updatedAt: Date.now()
    } as ProviderPreset);
    d.presets[idx] = next;
    write(d);
    return next;
  },
  delete(id: string): boolean {
    const d = read();
    const before = d.presets.length;
    d.presets = d.presets.filter((preset) => preset.id !== id);
    write(d);
    return d.presets.length !== before;
  }
};

export const PresetsStore = presetStore;
export const InstancesStore = presetStore;
