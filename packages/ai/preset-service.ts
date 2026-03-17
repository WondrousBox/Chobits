import { PresetsStore } from './presets-store';
import { listProviderSecretKeys } from './providers/service';
import { getAllPresetSecrets, setPresetSecrets as persistPresetSecrets } from './settings-store';
import type { ProviderPresetCreatePayload, ProviderPresetRecord, ProviderPresetUpdatePatch } from './types';

function normalizePresetId(presetId?: string): string | undefined {
  const normalizedPresetId = presetId?.trim();
  return normalizedPresetId || undefined;
}

export function listPresets(providerId?: string): ProviderPresetRecord[] {
  return PresetsStore.list(providerId);
}

export function getPreset(presetId?: string): ProviderPresetRecord | undefined {
  const normalizedPresetId = normalizePresetId(presetId);
  return normalizedPresetId ? PresetsStore.get(normalizedPresetId) : undefined;
}

export function createPreset(payload: ProviderPresetCreatePayload): ProviderPresetRecord {
  return PresetsStore.create(payload);
}

export function updatePreset(id: string, patch: ProviderPresetUpdatePatch): ProviderPresetRecord | undefined {
  return PresetsStore.update(id, patch);
}

export function deletePreset(id: string): boolean {
  return PresetsStore.delete(id);
}

export async function getPresetSecrets(presetId?: string, keys?: string[]): Promise<Record<string, string>> {
  const preset = getPreset(presetId);
  if (!preset) {
    return {};
  }

  const secretKeys = keys?.length ? keys : listProviderSecretKeys(preset.providerId);
  if (secretKeys.length === 0) {
    return {};
  }

  return getAllPresetSecrets(preset.id, secretKeys);
}

export async function setPresetSecrets(presetId: string, secrets: Record<string, string>): Promise<void> {
  await persistPresetSecrets(presetId, secrets);
}
