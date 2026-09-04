import fsp from 'node:fs/promises';
import path from 'node:path';

import type { CharacterProfile } from '@packages/common/types/status';
import { app, ipcMain } from 'electron';

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

async function readJson<T>(file: string, fallback: T): Promise<T> {
  try {
    const raw = await fsp.readFile(file, 'utf-8');
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

export async function getStoredCharacterProfile(): Promise<CharacterProfile> {
  return applyCurrentCharacterInfo(await readJson<CharacterProfile>(CHARACTER_PROFILE_FILE, getDefaultCharacterProfile()));
}

export function initStatusHandlers(): void {
  ipcMain.handle('sprite:character:get-profile', async () => {
    const profile = await getStoredCharacterProfile();
    return { ok: true, profile };
  });
}
