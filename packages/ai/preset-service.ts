import { createStoredPreset, deleteStoredPreset, getStoredPreset, listStoredPresets, updateStoredPreset } from './presets-store';
import { clearStoredPresetSecrets, getStoredPresetSecrets, setStoredPresetSecrets } from './preset-secrets-store';
import { listProviderSecretKeys, listRequiredProviderSecretKeys, toCanonicalProviderId } from './providers/service';
import type { ProviderPresetCreatePayload, ProviderPresetRecord, ProviderPresetUpdatePatch } from './types';

function normalizePresetId(presetId?: string): string | undefined {
  const normalizedPresetId = presetId?.trim();
  return normalizedPresetId || undefined;
}

export function listPresets(providerId?: string): ProviderPresetRecord[] {
  return listStoredPresets(providerId);
}

export function getPreset(presetId?: string): ProviderPresetRecord | undefined {
  const normalizedPresetId = normalizePresetId(presetId);
  return normalizedPresetId ? getStoredPreset(normalizedPresetId) : undefined;
}

function isSameProvider(left?: string, right?: string): boolean {
  return toCanonicalProviderId(left) === toCanonicalProviderId(right);
}

export async function isPresetUsable(presetOrId?: ProviderPresetRecord | string): Promise<boolean> {
  const preset = typeof presetOrId === 'string' ? getPreset(presetOrId) : presetOrId;
  if (!preset) {
    return false;
  }

  const requiredKeys = listRequiredProviderSecretKeys(preset.providerId);
  if (!requiredKeys.length) {
    return true;
  }

  const secrets = await getStoredPresetSecrets(preset.id, requiredKeys);
  return requiredKeys.every((key) => {
    const value = secrets[key];
    return typeof value === 'string' && value.trim().length > 0;
  });
}

export async function resolveUsablePreset(providerId: string, preferredPresetId?: string): Promise<ProviderPresetRecord | undefined> {
  const preferredPreset = getPreset(preferredPresetId);
  if (preferredPreset && isSameProvider(preferredPreset.providerId, providerId) && (await isPresetUsable(preferredPreset))) {
    return preferredPreset;
  }

  const presets = listPresets().filter((preset) => isSameProvider(preset.providerId, providerId));
  for (const preset of presets) {
    if (await isPresetUsable(preset)) {
      return preset;
    }
  }

  return undefined;
}

export function createPreset(payload: ProviderPresetCreatePayload): ProviderPresetRecord {
  return createStoredPreset(payload);
}

export function updatePreset(id: string, patch: ProviderPresetUpdatePatch): ProviderPresetRecord | undefined {
  return updateStoredPreset(id, patch);
}

export async function deletePreset(id: string): Promise<boolean> {
  const normalizedPresetId = normalizePresetId(id);
  if (!normalizedPresetId) {
    return false;
  }

  const deleted = deleteStoredPreset(normalizedPresetId);
  if (!deleted) {
    return false;
  }

  await clearStoredPresetSecrets(normalizedPresetId);
  return true;
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

  return getStoredPresetSecrets(preset.id, secretKeys);
}

export async function setPresetSecrets(presetId: string, secrets: Record<string, string>): Promise<void> {
  await setStoredPresetSecrets(presetId, secrets);
}
