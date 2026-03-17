import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import { app } from 'electron';

import { toCanonicalProviderId } from './providers/service';
import type { ProviderPresetCreatePayload, ProviderPresetOverrides, ProviderPresetRecord, ProviderPresetUpdatePatch } from './types';

type StoreShape = { presets: ProviderPresetRecord[] };

const FILE = path.join(app.getPath('userData'), 'data', 'ai-provider-presets.json');
const LEGACY_FILE = path.join(app.getPath('userData'), 'data', 'ai-provider-instances.json');

function hasOwn(target: object, key: 'config' | 'overrides'): boolean {
  return Object.prototype.hasOwnProperty.call(target, key);
}

function cloneOverrides(value: unknown): ProviderPresetOverrides | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return undefined;
  }

  return { ...(value as ProviderPresetOverrides) };
}

function resolvePresetOverrides(preset: { overrides?: ProviderPresetOverrides; config?: ProviderPresetOverrides }): ProviderPresetOverrides | undefined {
  if (hasOwn(preset, 'overrides')) {
    return cloneOverrides(preset.overrides);
  }

  if (hasOwn(preset, 'config')) {
    return cloneOverrides(preset.config);
  }

  return undefined;
}

function normalizePreset(preset: ProviderPresetRecord): ProviderPresetRecord {
  const canonicalProviderId = toCanonicalProviderId(preset.providerId);
  const overrides = resolvePresetOverrides(preset);

  return {
    ...preset,
    providerId: canonicalProviderId,
    config: overrides,
    overrides
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
      presets: data.presets.map((preset) => {
        const normalizedPreset = normalizePreset(preset);
        const { config: _legacyConfig, ...storedPreset } = normalizedPreset;
        return storedPreset;
      })
    };
    fs.mkdirSync(path.dirname(FILE), { recursive: true });
    fs.writeFileSync(FILE, JSON.stringify(normalizedData, null, 2), 'utf8');
  } catch {
    // ignore write errors
  }
}

const presetStore = {
  list(providerId?: string): ProviderPresetRecord[] {
    const d = read();
    const canonicalProviderId = providerId ? toCanonicalProviderId(providerId) : undefined;
    return canonicalProviderId ? d.presets.filter((preset) => preset.providerId === canonicalProviderId) : d.presets;
  },
  get(id: string): ProviderPresetRecord | undefined {
    const d = read();
    return d.presets.find((preset) => preset.id === id);
  },
  create(payload: ProviderPresetCreatePayload & { id?: string }): ProviderPresetRecord {
    const d = read();
    const now = Date.now();
    const overrides = resolvePresetOverrides(payload);
    const item = normalizePreset({
      id: payload.id || randomUUID(),
      providerId: toCanonicalProviderId(payload.providerId),
      name: payload.name,
      model: payload.model,
      systemPrompt: payload.systemPrompt,
      overrides,
      enabledTools: payload.enabledTools || [],
      createdAt: now,
      updatedAt: now
    });
    d.presets.push(item);
    write(d);
    return item;
  },
  update(id: string, patch: ProviderPresetUpdatePatch): ProviderPresetRecord | undefined {
    const d = read();
    const idx = d.presets.findIndex((preset) => preset.id === id);
    if (idx < 0) return undefined;
    const nextOverrides =
      hasOwn(patch, 'overrides') || hasOwn(patch, 'config')
        ? resolvePresetOverrides(patch)
        : resolvePresetOverrides(d.presets[idx]);
    const next = normalizePreset({
      ...d.presets[idx],
      ...patch,
      config: nextOverrides,
      overrides: nextOverrides,
      ...(patch.providerId ? { providerId: toCanonicalProviderId(patch.providerId) } : {}),
      updatedAt: Date.now()
    } as ProviderPresetRecord);
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
