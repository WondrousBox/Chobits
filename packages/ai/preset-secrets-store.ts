import { SERVICE_INST } from '../common/config';
import { ENABLE_KEYTAR, readSettingsStorage as readStorage, writeSettingsStorage as writeStorage } from './settings-file';

async function setStoredPresetSecret(presetId: string, key: string, value: string): Promise<void> {
  const storage = readStorage();
  storage.instances[presetId] = { ...(storage.instances[presetId] || {}), [key]: value };
  writeStorage(storage.providers, storage.instances);

  if (ENABLE_KEYTAR) {
    try {
      const keytar = await import('keytar');
      await keytar.setPassword(SERVICE_INST, `${presetId}:${key}`, value);
    } catch {
      // ignore keytar errors, file storage is primary
    }
  }
}

async function getStoredPresetSecret(presetId: string, key: string): Promise<string | undefined> {
  if (ENABLE_KEYTAR) {
    try {
      const keytar = await import('keytar');
      const value = await keytar.getPassword(SERVICE_INST, `${presetId}:${key}`);
      if (value != null) return value;
    } catch {
      // ignore keytar errors, fallback to file storage
    }
  }

  const storage = readStorage();
  return storage.instances[presetId]?.[key];
}

async function deletePresetKeytarEntries(presetId: string): Promise<void> {
  if (!ENABLE_KEYTAR) return;

  try {
    const keytar = await import('keytar');
    const credentials = await keytar.findCredentials(SERVICE_INST);
    const accountPrefix = `${presetId}:`;

    for (const cred of credentials) {
      if (cred.account.startsWith(accountPrefix)) {
        await keytar.deletePassword(SERVICE_INST, cred.account);
      }
    }
  } catch {
    // ignore keytar errors
  }
}

export async function getStoredPresetSecrets(presetId: string, keys: string[]): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  for (const key of keys) {
    const value = await getStoredPresetSecret(presetId, key);
    if (value != null) out[key] = value;
  }
  return out;
}

export async function setStoredPresetSecrets(presetId: string, secrets: Record<string, string>): Promise<void> {
  for (const [key, value] of Object.entries(secrets)) {
    if (value != null) await setStoredPresetSecret(presetId, key, value);
  }
}

export async function clearStoredPresetSecrets(presetId: string): Promise<void> {
  const storage = readStorage();
  delete storage.instances[presetId];
  writeStorage(storage.providers, storage.instances);
  await deletePresetKeytarEntries(presetId);
}

export async function clearAllStoredPresetSecrets(): Promise<void> {
  const storage = readStorage();
  writeStorage(storage.providers, {});

  if (!ENABLE_KEYTAR) return;

  try {
    const keytar = await import('keytar');
    const credentials = await keytar.findCredentials(SERVICE_INST);
    for (const cred of credentials) {
      await keytar.deletePassword(SERVICE_INST, cred.account);
    }
  } catch {
    // ignore keytar errors
  }
}
