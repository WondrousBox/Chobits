// Secure secrets store using keytar with JSON fallback
import fs from 'node:fs';
import path from 'node:path';

import { app } from 'electron';
import keytar from 'keytar';

const SERVICE = 'chobits-ai';
const FALLBACK_FILE = path.join(app.getPath('userData'), 'ai-settings.json');

console.log('FALLBACK_FILE:', FALLBACK_FILE);

function readFallback(): { providers: Record<string, Record<string, string>>; instances: Record<string, Record<string, string>> } {
  try {
    const raw = fs.readFileSync(FALLBACK_FILE, 'utf8');
    const parsed = JSON.parse(raw) || {};
    return {
      providers: parsed.providers || {},
      instances: parsed.instances || {}
    };
  } catch {
    return { providers: {}, instances: {} };
  }
}

function writeFallback(providers: Record<string, Record<string, string>>, instances: Record<string, Record<string, string>>) {
  try {
    const data = { providers, instances };
    fs.mkdirSync(path.dirname(FALLBACK_FILE), { recursive: true });
    fs.writeFileSync(FALLBACK_FILE, JSON.stringify(data, null, 2), 'utf8');
  } catch { }
}

export async function setSecret(providerId: string, key: string, value: string) {
  try {
    await keytar.setPassword(SERVICE, `${providerId}:${key}`, value);
  } catch {
    const fb = readFallback();
    fb.providers[providerId] = { ...(fb.providers[providerId] || {}), [key]: value };
    writeFallback(fb.providers, fb.instances);
  }
}

export async function getSecret(providerId: string, key: string): Promise<string | undefined> {
  try {
    const v = await keytar.getPassword(SERVICE, `${providerId}:${key}`);
    if (v != null) return v;
  } catch { }
  const fb = readFallback();
  return fb.providers[providerId]?.[key];
}

export async function getAllSecrets(providerId: string, keys: string[]): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  for (const k of keys) {
    const v = await getSecret(providerId, k);
    if (v != null) out[k] = v;
  }
  return out;
}

export async function setProviderSecrets(providerId: string, secrets: Record<string, string>) {
  for (const [k, v] of Object.entries(secrets)) {
    if (v != null) await setSecret(providerId, k, v);
  }
}

// Instance-level secrets (stored with different service id to avoid clash)
const SERVICE_INST = 'chobits-ai-instance';

export async function setInstanceSecret(instanceId: string, key: string, value: string) {
  try {
    await keytar.setPassword(SERVICE_INST, `${instanceId}:${key}`, value);
  } catch {
    const fb = readFallback();
    fb.instances[instanceId] = { ...(fb.instances[instanceId] || {}), [key]: value };
    writeFallback(fb.providers, fb.instances);
  }
}

export async function getInstanceSecret(instanceId: string, key: string): Promise<string | undefined> {
  try {
    const v = await keytar.getPassword(SERVICE_INST, `${instanceId}:${key}`);
    if (v != null) return v;
  } catch { }
  const fb = readFallback();
  return fb.instances[instanceId]?.[key];
}

export async function getAllInstanceSecrets(instanceId: string, keys: string[]): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  for (const k of keys) {
    const v = await getInstanceSecret(instanceId, k);
    if (v != null) out[k] = v;
  }
  return out;
}

export async function setInstanceSecrets(instanceId: string, secrets: Record<string, string>) {
  for (const [k, v] of Object.entries(secrets)) {
    if (v != null) await setInstanceSecret(instanceId, k, v);
  }
}
