import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';

import type { CharacterProfile } from '@packages/common/types/status';
import { app, BrowserWindow, ipcMain } from 'electron';

import pkg from '../../../package.json';
import { getCharacterInfo, getCharacterPackDefinition } from '../../../packages/sprite-core/character-service';

export type { CharacterProfile } from '@packages/common/types/status';

const SETTINGS_DIR = path.join(app.getPath('userData'), 'data');
const CHARACTER_PROFILE_FILE = path.join(SETTINGS_DIR, 'character-profile.json');

function getCurrentCharacterProfile(): Pick<CharacterProfile, 'name' | 'description'> | null {
  const pack = getCharacterPackDefinition();
  const character = pack ? getCharacterInfo() : null;
  if (character?.name?.trim()) {
    return {
      name: character.name,
      ...(character.tagline ? { description: character.tagline } : {})
    };
  }

  if (pack?.name?.trim()) {
    return {
      name: pack.name,
      ...(pack.description ? { description: pack.description } : {})
    };
  }

  return null;
}

function getDefaultCharacterProfile(): CharacterProfile {
  const character = getCurrentCharacterProfile();
  return {
    name: character?.name ?? pkg.name,
    mood: 'idle',
    level: 1,
    favor: 50,
    ...(character?.description ? { description: character.description } : {})
  };
}

function applyCurrentCharacterInfo(profile: CharacterProfile): CharacterProfile {
  const character = getCurrentCharacterProfile();
  if (!character) {
    return profile;
  }

  return {
    ...profile,
    name: character.name,
    ...(character.description ? { description: character.description } : {})
  };
}

function ensureDirSync(dir: string): void {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

async function readJson<T>(file: string, fallback: T): Promise<T> {
  try {
    const raw = await fsp.readFile(file, 'utf-8');
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

async function writeJson(file: string, data: any): Promise<void> {
  ensureDirSync(path.dirname(file));
  await fsp.writeFile(file, JSON.stringify(data, null, 2), 'utf-8');
}

export async function getStoredCharacterProfile(): Promise<CharacterProfile> {
  return applyCurrentCharacterInfo(await readJson<CharacterProfile>(CHARACTER_PROFILE_FILE, getDefaultCharacterProfile()));
}

export function initStatusHandlers(win: BrowserWindow): void {
  void win;

  ipcMain.handle('character:get-profile', async () => {
    const profile = await getStoredCharacterProfile();
    return { ok: true, profile };
  });

  ipcMain.handle('character:update-profile', async (_event, payload: { patch: Partial<CharacterProfile> }) => {
    const current = await readJson<CharacterProfile>(CHARACTER_PROFILE_FILE, getDefaultCharacterProfile());
    const next = { ...current, ...payload?.patch };
    await writeJson(CHARACTER_PROFILE_FILE, next);
    return { ok: true, profile: applyCurrentCharacterInfo(next) };
  });
}
