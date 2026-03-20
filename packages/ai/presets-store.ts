import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import { app } from 'electron';

import { toCanonicalProviderId } from './providers/service';
import type { ProviderPresetCreatePayload, ProviderPresetOverrides, ProviderPresetRecord, ProviderPresetUpdatePatch } from './types';

type StoreShape = { presets: ProviderPresetRecord[] };
type LegacyProviderPresetRecord = ProviderPresetRecord & { model?: string };

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

function normalizePreset(preset: LegacyProviderPresetRecord): ProviderPresetRecord {
  const canonicalProviderId = toCanonicalProviderId(preset.providerId);
  const overrides = resolvePresetOverrides(preset);

  return {
    id: preset.id,
    providerId: canonicalProviderId,
    name: preset.name,
    ...(preset.systemPrompt ? { systemPrompt: preset.systemPrompt } : {}),
    config: overrides,
    overrides,
    ...(Array.isArray(preset.enabledTools) ? { enabledTools: [...preset.enabledTools] } : {}),
    ...(typeof preset.createdAt === 'number' ? { createdAt: preset.createdAt } : {}),
    ...(typeof preset.updatedAt === 'number' ? { updatedAt: preset.updatedAt } : {})
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
        const storedPreset = { ...normalizedPreset };
        delete storedPreset.config;
        return storedPreset;
      })
    };
    fs.mkdirSync(path.dirname(FILE), { recursive: true });
    fs.writeFileSync(FILE, JSON.stringify(normalizedData, null, 2), 'utf8');
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new Error(`[AI presets] Failed to write preset storage ${FILE}: ${reason}`);
  }
}

export function listStoredPresets(providerId?: string): ProviderPresetRecord[] {
  const d = read();
  const canonicalProviderId = providerId ? toCanonicalProviderId(providerId) : undefined;
  return canonicalProviderId ? d.presets.filter((preset) => preset.providerId === canonicalProviderId) : d.presets;
}

export function getStoredPreset(id: string): ProviderPresetRecord | undefined {
  const d = read();
  return d.presets.find((preset) => preset.id === id);
}

export function createStoredPreset(payload: ProviderPresetCreatePayload & { id?: string }): ProviderPresetRecord {
  const d = read();
  const now = Date.now();
  const overrides = resolvePresetOverrides(payload);
  const item = normalizePreset({
    id: payload.id || randomUUID(),
    providerId: toCanonicalProviderId(payload.providerId),
    name: payload.name,
    systemPrompt: payload.systemPrompt,
    overrides,
    enabledTools: payload.enabledTools || [],
    createdAt: now,
    updatedAt: now
  });
  d.presets.push(item);
  write(d);
  return item;
}

export function updateStoredPreset(id: string, patch: ProviderPresetUpdatePatch): ProviderPresetRecord | undefined {
  const d = read();
  const idx = d.presets.findIndex((preset) => preset.id === id);
  if (idx < 0) return undefined;
  const nextOverrides = hasOwn(patch, 'overrides') || hasOwn(patch, 'config') ? resolvePresetOverrides(patch) : resolvePresetOverrides(d.presets[idx]);
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
}

export function deleteStoredPreset(id: string): boolean {
  const d = read();
  const before = d.presets.length;
  d.presets = d.presets.filter((preset) => preset.id !== id);
  write(d);
  return d.presets.length !== before;
}
