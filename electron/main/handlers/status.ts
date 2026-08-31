import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';

import type { RoleProfile } from '@packages/common/types/status';
import { app, BrowserWindow, ipcMain } from 'electron';

import pkg from '../../../package.json';
import { getCharacterInfo, getCharacterPackDefinition } from '../../../packages/sprite-core/character-service';

export type { RoleProfile } from '@packages/common/types/status';

const SETTINGS_DIR = path.join(app.getPath('userData'), 'data');
const ROLE_FILE = path.join(SETTINGS_DIR, 'role.json');

function getCurrentCharacterRoleInfo(): Pick<RoleProfile, 'name' | 'description'> | null {
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

function getDefaultRoleProfile(): RoleProfile {
  const character = getCurrentCharacterRoleInfo();
  return {
    name: character?.name ?? pkg.name,
    mood: 'idle',
    level: 1,
    favor: 50,
    ...(character?.description ? { description: character.description } : {})
  };
}

function applyCurrentCharacterInfo(role: RoleProfile): RoleProfile {
  const character = getCurrentCharacterRoleInfo();
  if (!character) {
    return role;
  }

  return {
    ...role,
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

export async function getStoredRoleProfile(): Promise<RoleProfile> {
  return applyCurrentCharacterInfo(await readJson<RoleProfile>(ROLE_FILE, getDefaultRoleProfile()));
}

export function initStatusHandlers(win: BrowserWindow): void {
  void win;

  ipcMain.handle('status:getRole', async () => {
    const role = await getStoredRoleProfile();
    return { ok: true, role };
  });

  ipcMain.handle('status:updateRole', async (_e, payload: { patch: Partial<RoleProfile> }) => {
    const current = await readJson<RoleProfile>(ROLE_FILE, getDefaultRoleProfile());
    const next = { ...current, ...payload?.patch };
    await writeJson(ROLE_FILE, next);
    return { ok: true, role: applyCurrentCharacterInfo(next) };
  });
}
