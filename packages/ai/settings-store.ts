import keytar from 'keytar';

import { SERVICE } from '../common/config';
import { clearAllStoredPresetSecrets } from './preset-secrets-store';
import { getProviderAliases, toCanonicalProviderId } from './providers/service';
import { ENABLE_KEYTAR, readSettingsStorage as readStorage, writeSettingsStorage as writeStorage } from './settings-file';

// API key can be either a string (legacy format) or an array of named keys (new format)
export type ApiKeyStoredValue = string | ApiKeyItem[];
export type ApiKeyItem = { name: string; value: string; isDefault?: boolean };

// Helper to check if a value is an array of API key items
export function isApiKeyArray(value: unknown): value is ApiKeyItem[] {
  return Array.isArray(value) && value.length > 0 && typeof value[0] === 'object' && 'name' in value[0] && 'value' in value[0];
}

// Helper to check if a value is a simple string API key
export function isApiKeyString(value: unknown): value is string {
  return typeof value === 'string';
}

// Helper to get the first (or default) API key value from an array or string
export function getFirstApiKey(value: unknown): string | undefined {
  if (isApiKeyString(value)) return value;
  if (isApiKeyArray(value)) {
    const defaultKey = value.find((k) => k.isDefault);
    return defaultKey?.value || value[0]?.value;
  }
  return undefined;
}

function listProviderStorageIds(providerId: string): string[] {
  const normalizedProviderId = (providerId || '').trim().toLowerCase();
  const canonicalProviderId = toCanonicalProviderId(normalizedProviderId);
  const aliasIds = getProviderAliases(canonicalProviderId).map((id) => id.trim().toLowerCase());
  const otherAliasIds = aliasIds.filter((id) => id && id !== normalizedProviderId && id !== canonicalProviderId);

  return Array.from(new Set([...otherAliasIds, normalizedProviderId, canonicalProviderId].filter(Boolean)));
}

function readProviderRecord(storage: ReturnType<typeof readStorage>, providerId: string): Record<string, any> {
  return listProviderStorageIds(providerId).reduce<Record<string, any>>((merged, storageId) => {
    return {
      ...merged,
      ...(storage.providers[storageId] || {})
    };
  }, {});
}

function writeProviderRecord(storage: ReturnType<typeof readStorage>, providerId: string, record: Record<string, any>): void {
  const canonicalProviderId = toCanonicalProviderId(providerId);

  for (const storageId of listProviderStorageIds(providerId)) {
    if (storageId !== canonicalProviderId) {
      delete storage.providers[storageId];
    }
  }

  if (Object.keys(record).length > 0) {
    storage.providers[canonicalProviderId] = record;
    return;
  }

  delete storage.providers[canonicalProviderId];
}

async function deleteProviderKeytarEntries(providerId: string, key?: string): Promise<void> {
  if (!ENABLE_KEYTAR) return;

  try {
    const credentials = await keytar.findCredentials(SERVICE);
    const storageIds = listProviderStorageIds(providerId);

    for (const cred of credentials) {
      const matched = storageIds.some((storageId) => {
        const prefix = `${storageId}:`;
        if (!cred.account.startsWith(prefix)) return false;
        if (!key) return true;
        return cred.account === `${storageId}:${key}`;
      });

      if (matched) {
        await keytar.deletePassword(SERVICE, cred.account);
      }
    }
  } catch {
    // ignore keytar errors
  }
}

async function setSecret(providerId: string, key: string, value: string): Promise<void> {
  // 默认使用文件存储
  const storage = readStorage();
  const nextRecord = {
    ...readProviderRecord(storage, providerId),
    [key]: value
  };
  writeProviderRecord(storage, providerId, nextRecord);
  writeStorage(storage.providers, storage.instances);

  // 如果启用了 keytar，也同步到 keytar
  if (ENABLE_KEYTAR) {
    try {
      await deleteProviderKeytarEntries(providerId, key);
      await keytar.setPassword(SERVICE, `${toCanonicalProviderId(providerId)}:${key}`, value);
    } catch {
      // ignore keytar errors, file storage is primary
    }
  }
}

async function getSecret(providerId: string, key: string): Promise<string | undefined> {
  // 如果启用了 keytar，优先从 keytar 读取
  if (ENABLE_KEYTAR) {
    for (const storageId of [...listProviderStorageIds(providerId)].reverse()) {
      let v: string | null = null;
      try {
        v = await keytar.getPassword(SERVICE, `${storageId}:${key}`);
      } catch {
        v = null;
      }
      if (v != null) return v;
    }
  }

  // 默认从文件存储读取
  const storage = readStorage();
  return readProviderRecord(storage, providerId)?.[key];
}

export async function getAllSecrets(providerId: string, keys: string[]): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  for (const k of keys) {
    const v = await getSecret(providerId, k);
    if (v != null) out[k] = v;
  }
  return out;
}

export async function setProviderSecrets(providerId: string, secrets: Record<string, string>): Promise<void> {
  for (const [k, v] of Object.entries(secrets)) {
    if (v != null) await setSecret(providerId, k, v);
  }
}

/**
 * 清理所有存储的 key（包括 provider 和 preset 的所有 secrets）
 */
export async function clearAllSecrets(): Promise<void> {
  // 清理文件存储
  writeStorage({}, {});

  // 如果启用了 keytar，也清理 keytar
  if (ENABLE_KEYTAR) {
    // 清理 SERVICE 的所有 credentials
    try {
      const credentials = await keytar.findCredentials(SERVICE);
      for (const cred of credentials) {
        await keytar.deletePassword(SERVICE, cred.account);
      }
    } catch {
      // ignore keytar errors
    }
  }

  await clearAllStoredPresetSecrets();
}

// ============================================
// Multiple API Keys Management (New Functions)
// ============================================

/**
 * Get all API keys for a provider's key field
 * Returns the value as-is (could be string or ApiKeyItem[])
 */
export async function getApiKeyRaw(providerId: string, key: string): Promise<ApiKeyStoredValue | undefined> {
  const storage = readStorage();
  return readProviderRecord(storage, providerId)?.[key];
}

/**
 * Get API keys as an array of ApiKeyItem
 * If the stored value is a string, converts it to a single-item array
 * If it's already an array, returns it as-is
 */
export async function getApiKeys(providerId: string, key: string): Promise<ApiKeyItem[]> {
  const value = await getApiKeyRaw(providerId, key);
  if (isApiKeyString(value)) {
    return [{ name: 'Default', value }];
  }
  if (isApiKeyArray(value)) {
    return value;
  }
  return [];
}

/**
 * Get the default (or first) API key value for a provider's key field
 * This is useful for backward compatibility with code expecting a single string
 */
export async function getDefaultApiKey(providerId: string, key: string): Promise<string | undefined> {
  const value = await getApiKeyRaw(providerId, key);
  return getFirstApiKey(value);
}
