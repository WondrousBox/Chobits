// Secure secrets store using local file storage (with optional keytar support)
import fs from 'node:fs';
import path from 'node:path';

import { app } from 'electron';
import keytar from 'keytar';

import { SERVICE, SERVICE_INST } from '../common/config';

// 配置：是否启用 keytar（默认 false，使用本地文件存储）
// 如果需要使用 keytar，将此值改为 true
const ENABLE_KEYTAR = false;

const STORAGE_FILE = path.join(app.getPath('userData'), 'data', 'ai-settings.json');

console.log('STORAGE_FILE:', STORAGE_FILE);

// API key can be either a string (legacy format) or an array of named keys (new format)
export type ApiKeyKeyValue = string | ApiKeyItem[];
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

function readStorage(): { providers: Record<string, Record<string, any>>; instances: Record<string, Record<string, any>> } {
  try {
    const raw = fs.readFileSync(STORAGE_FILE, 'utf8');
    const parsed = JSON.parse(raw) || {};
    return {
      providers: parsed.providers || {},
      instances: parsed.instances || {}
    };
  } catch {
    return { providers: {}, instances: {} };
  }
}

function writeStorage(providers: Record<string, Record<string, any>>, instances: Record<string, Record<string, any>>): void {
  try {
    const data = { providers, instances };
    fs.mkdirSync(path.dirname(STORAGE_FILE), { recursive: true });
    fs.writeFileSync(STORAGE_FILE, JSON.stringify(data, null, 2), 'utf8');
  } catch {
    //
  }
}

export async function setSecret(providerId: string, key: string, value: string): Promise<void> {
  // 默认使用文件存储
  const storage = readStorage();
  storage.providers[providerId] = { ...(storage.providers[providerId] || {}), [key]: value };
  writeStorage(storage.providers, storage.instances);

  // 如果启用了 keytar，也同步到 keytar
  if (ENABLE_KEYTAR) {
    try {
      await keytar.setPassword(SERVICE, `${providerId}:${key}`, value);
    } catch {
      // ignore keytar errors, file storage is primary
    }
  }
}

export async function getSecret(providerId: string, key: string): Promise<string | undefined> {
  // 如果启用了 keytar，优先从 keytar 读取
  if (ENABLE_KEYTAR) {
    try {
      const v = await keytar.getPassword(SERVICE, `${providerId}:${key}`);
      if (v != null) return v;
    } catch {
      // ignore keytar errors, fallback to file storage
    }
  }

  // 默认从文件存储读取
  const storage = readStorage();
  return storage.providers[providerId]?.[key];
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

export async function deleteSecret(providerId: string, key: string): Promise<void> {
  // 从文件存储删除
  const storage = readStorage();
  if (storage.providers[providerId]) {
    delete storage.providers[providerId][key];
    writeStorage(storage.providers, storage.instances);
  }

  // 如果启用了 keytar，也从 keytar 删除
  if (ENABLE_KEYTAR) {
    try {
      await keytar.deletePassword(SERVICE, `${providerId}:${key}`);
    } catch {
      // ignore keytar errors
    }
  }
}

export async function clearProviderSecrets(providerId: string): Promise<void> {
  // 从文件存储删除
  const storage = readStorage();
  if (storage.providers[providerId]) {
    delete storage.providers[providerId];
    writeStorage(storage.providers, storage.instances);
  }

  // 如果启用了 keytar，也从 keytar 删除
  if (ENABLE_KEYTAR) {
    try {
      const credentials = await keytar.findCredentials(SERVICE);
      for (const cred of credentials) {
        if (cred.account.startsWith(`${providerId}:`)) {
          await keytar.deletePassword(SERVICE, cred.account);
        }
      }
    } catch {
      // ignore keytar errors
    }
  }
}

export async function setInstanceSecret(instanceId: string, key: string, value: string): Promise<void> {
  // 默认使用文件存储
  const storage = readStorage();
  storage.instances[instanceId] = { ...(storage.instances[instanceId] || {}), [key]: value };
  writeStorage(storage.providers, storage.instances);

  // 如果启用了 keytar，也同步到 keytar
  if (ENABLE_KEYTAR) {
    try {
      await keytar.setPassword(SERVICE_INST, `${instanceId}:${key}`, value);
    } catch {
      // ignore keytar errors, file storage is primary
    }
  }
}

export async function getInstanceSecret(instanceId: string, key: string): Promise<string | undefined> {
  // 如果启用了 keytar，优先从 keytar 读取
  if (ENABLE_KEYTAR) {
    try {
      const v = await keytar.getPassword(SERVICE_INST, `${instanceId}:${key}`);
      if (v != null) return v;
    } catch {
      // ignore keytar errors, fallback to file storage
    }
  }

  // 默认从文件存储读取
  const storage = readStorage();
  return storage.instances[instanceId]?.[key];
}

export async function getAllInstanceSecrets(instanceId: string, keys: string[]): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  for (const k of keys) {
    const v = await getInstanceSecret(instanceId, k);
    if (v != null) out[k] = v;
  }
  return out;
}

export async function setInstanceSecrets(instanceId: string, secrets: Record<string, string>): Promise<void> {
  for (const [k, v] of Object.entries(secrets)) {
    if (v != null) await setInstanceSecret(instanceId, k, v);
  }
}

export async function deleteInstanceSecret(instanceId: string, key: string): Promise<void> {
  // 从文件存储删除
  const storage = readStorage();
  if (storage.instances[instanceId]) {
    delete storage.instances[instanceId][key];
    writeStorage(storage.providers, storage.instances);
  }

  // 如果启用了 keytar，也从 keytar 删除
  if (ENABLE_KEYTAR) {
    try {
      await keytar.deletePassword(SERVICE_INST, `${instanceId}:${key}`);
    } catch {
      // ignore keytar errors
    }
  }
}

export async function clearInstanceSecrets(instanceId: string): Promise<void> {
  // 从文件存储删除
  const storage = readStorage();
  if (storage.instances[instanceId]) {
    delete storage.instances[instanceId];
    writeStorage(storage.providers, storage.instances);
  }

  // 如果启用了 keytar，也从 keytar 删除
  if (ENABLE_KEYTAR) {
    try {
      const credentials = await keytar.findCredentials(SERVICE_INST);
      for (const cred of credentials) {
        if (cred.account.startsWith(`${instanceId}:`)) {
          await keytar.deletePassword(SERVICE_INST, cred.account);
        }
      }
    } catch {
      // ignore keytar errors
    }
  }
}

/**
 * 清理所有存储的 key（包括 provider 和 instance 的所有 secrets）
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

    // 清理 SERVICE_INST 的所有 credentials
    try {
      const credentials = await keytar.findCredentials(SERVICE_INST);
      for (const cred of credentials) {
        await keytar.deletePassword(SERVICE_INST, cred.account);
      }
    } catch {
      // ignore keytar errors
    }
  }
}

// ============================================
// Multiple API Keys Management (New Functions)
// ============================================

/**
 * Get all API keys for a provider's key field
 * Returns the value as-is (could be string or ApiKeyItem[])
 */
export async function getApiKeyRaw(providerId: string, key: string): Promise<ApiKeyKeyValue | undefined> {
  const storage = readStorage();
  return storage.providers[providerId]?.[key];
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
 * Set API keys (replaces all existing keys for this field)
 */
export async function setApiKeys(providerId: string, key: string, keys: ApiKeyItem[]): Promise<void> {
  const storage = readStorage();
  if (!storage.providers[providerId]) {
    storage.providers[providerId] = {};
  }
  storage.providers[providerId][key] = keys;
  writeStorage(storage.providers, storage.instances);
}

/**
 * Add a new API key to a provider's key field
 * Converts the field to array format if it's currently a string
 */
export async function addApiKey(providerId: string, key: string, apiKey: ApiKeyItem): Promise<void> {
  const storage = readStorage();
  if (!storage.providers[providerId]) {
    storage.providers[providerId] = {};
  }

  const currentValue = storage.providers[providerId][key];

  if (isApiKeyString(currentValue)) {
    // Convert single string to array format
    storage.providers[providerId][key] = [
      { name: 'Default', value: currentValue, isDefault: true },
      { ...apiKey, isDefault: false }
    ];
  } else if (isApiKeyArray(currentValue)) {
    // Already an array, just add the new key
    storage.providers[providerId][key] = [...currentValue, { ...apiKey, isDefault: false }];
  } else {
    // No existing value, create new array with single item
    storage.providers[providerId][key] = [{ ...apiKey, isDefault: true }];
  }

  writeStorage(storage.providers, storage.instances);
}

/**
 * Remove an API key by name
 */
export async function removeApiKey(providerId: string, key: string, apiKeyName: string): Promise<void> {
  const storage = readStorage();
  const currentValue = storage.providers[providerId]?.[key];

  if (isApiKeyArray(currentValue)) {
    const filtered = currentValue.filter((k) => k.name !== apiKeyName);

    if (filtered.length === 0) {
      // No keys left, remove the field entirely
      delete storage.providers[providerId][key];
    } else if (filtered.length === 1) {
      // Only one key left, you could keep it as array or convert to string
      // For consistency, keep it as array
      storage.providers[providerId][key] = filtered;
    } else {
      storage.providers[providerId][key] = filtered;
    }

    writeStorage(storage.providers, storage.instances);
  } else if (isApiKeyString(currentValue)) {
    // If it's a string and we're asked to remove "Default", clear it
    if (apiKeyName === 'Default') {
      delete storage.providers[providerId][key];
      writeStorage(storage.providers, storage.instances);
    }
  }
}

/**
 * Update an existing API key
 */
export async function updateApiKey(providerId: string, key: string, apiKeyName: string, updates: Partial<Pick<ApiKeyItem, 'name' | 'value' | 'isDefault'>>): Promise<void> {
  const storage = readStorage();
  const currentValue = storage.providers[providerId]?.[key];

  if (isApiKeyArray(currentValue)) {
    const index = currentValue.findIndex((k) => k.name === apiKeyName);
    if (index !== -1) {
      // If updating name, ensure it doesn't conflict with another key
      if (updates.name && updates.name !== apiKeyName) {
        const nameExists = currentValue.some((k, i) => i !== index && k.name === updates.name!);
        if (nameExists) {
          throw new Error(`API key with name "${updates.name}" already exists`);
        }
      }

      // Update the key
      storage.providers[providerId][key] = currentValue.map((k, i) => (i === index ? { ...k, ...updates } : k));

      // If setting a new default, remove isDefault from others
      if (updates.isDefault) {
        storage.providers[providerId][key] = (storage.providers[providerId][key] as ApiKeyItem[]).map((k, i) => (i === index ? k : { ...k, isDefault: false }));
      }

      writeStorage(storage.providers, storage.instances);
    }
  } else if (isApiKeyString(currentValue)) {
    // If it's a string, only allow updating "Default"
    if (apiKeyName === 'Default') {
      if (updates.name && updates.name !== 'Default') {
        // Rename: convert to array format
        storage.providers[providerId][key] = [{ name: updates.name, value: updates.value ?? currentValue, isDefault: updates.isDefault ?? true }];
      } else if (updates.value) {
        storage.providers[providerId][key] = updates.value;
      }
      writeStorage(storage.providers, storage.instances);
    }
  }
}

/**
 * Set a specific API key as the default
 */
export async function setDefaultApiKey(providerId: string, key: string, apiKeyName: string): Promise<void> {
  await updateApiKey(providerId, key, apiKeyName, { isDefault: true });
}

/**
 * Get the default (or first) API key value for a provider's key field
 * This is useful for backward compatibility with code expecting a single string
 */
export async function getDefaultApiKey(providerId: string, key: string): Promise<string | undefined> {
  const value = await getApiKeyRaw(providerId, key);
  return getFirstApiKey(value);
}
