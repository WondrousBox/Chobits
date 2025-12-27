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

function readStorage(): { providers: Record<string, Record<string, string>>; instances: Record<string, Record<string, string>> } {
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

function writeStorage(providers: Record<string, Record<string, string>>, instances: Record<string, Record<string, string>>): void {
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

  console.log('getAllSecrets:', out);
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
