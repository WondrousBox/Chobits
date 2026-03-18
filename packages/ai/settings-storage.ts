import fs from 'node:fs';
import path from 'node:path';

import { app } from 'electron';

export type SettingsStorageShape = {
  instances: Record<string, Record<string, any>>;
  providers: Record<string, Record<string, any>>;
};

// If keytar support is needed later, keep the switch centralized here.
export const ENABLE_KEYTAR = false;

const STORAGE_FILE = path.join(app.getPath('userData'), 'data', 'ai-settings.json');

export function readSettingsStorage(): SettingsStorageShape {
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

export function writeSettingsStorage(providers: SettingsStorageShape['providers'], instances: SettingsStorageShape['instances']): void {
  try {
    const data = { providers, instances };
    fs.mkdirSync(path.dirname(STORAGE_FILE), { recursive: true });
    fs.writeFileSync(STORAGE_FILE, JSON.stringify(data, null, 2), 'utf8');
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new Error(`[AI settings] Failed to write storage file ${STORAGE_FILE}: ${reason}`);
  }
}
