import fs from 'node:fs';
import path from 'node:path';

import { app } from 'electron';

import type { DailyCareStorage } from './types';

const SETTINGS_DIR = path.join(app.getPath('userData'), 'data');
const STORAGE_FILE = path.join(SETTINGS_DIR, 'daily-care.json');

const DEFAULT_STATE: DailyCareStorage = {
  enabled: true,
  routines: {},
  customReminders: []
};

function ensureDir(): void {
  if (!fs.existsSync(SETTINGS_DIR)) {
    fs.mkdirSync(SETTINGS_DIR, { recursive: true });
  }
}

export function loadDailyCareState(): DailyCareStorage {
  try {
    const raw = fs.readFileSync(STORAGE_FILE, 'utf-8');
    const parsed = JSON.parse(raw);
    return {
      enabled: typeof parsed.enabled === 'boolean' ? parsed.enabled : DEFAULT_STATE.enabled,
      routines: parsed.routines || {},
      customReminders: Array.isArray(parsed.customReminders) ? parsed.customReminders : []
    };
  } catch {
    return { ...DEFAULT_STATE };
  }
}

export function saveDailyCareState(state: DailyCareStorage): void {
  try {
    ensureDir();
    fs.writeFileSync(STORAGE_FILE, JSON.stringify(state, null, 2), 'utf-8');
  } catch (error) {
    console.warn('[daily-care] Failed to persist state', error);
  }
}

export function getStorageFilePath(): string {
  return STORAGE_FILE;
}
