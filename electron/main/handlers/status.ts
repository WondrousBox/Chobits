import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';

import { app, BrowserWindow, ipcMain } from 'electron';

import pkg from '../../../package.json';

const SETTINGS_DIR = path.join(app.getPath('userData'), 'data');
const ROLE_FILE = path.join(SETTINGS_DIR, 'role.json');

export type RoleProfile = {
  name: string;
  mood?: string;
  level?: number;
  favor?: number; // 0-100
  description?: string;
};

function ensureDirSync(dir: string) {
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

async function writeJson(file: string, data: any) {
  ensureDirSync(path.dirname(file));
  await fsp.writeFile(file, JSON.stringify(data, null, 2), 'utf-8');
}

export async function getStoredRoleProfile(): Promise<RoleProfile> {
  return readJson<RoleProfile>(ROLE_FILE, { name: pkg.name, mood: 'idle', level: 1, favor: 50 });
}

export function initStatusHandlers(_win: BrowserWindow) {
  ipcMain.handle('status:getRole', async () => {
    const role = await getStoredRoleProfile();
    return { ok: true, role };
  });

  ipcMain.handle('status:updateRole', async (_e, payload: { patch: Partial<RoleProfile> }) => {
    const current = await readJson<RoleProfile>(ROLE_FILE, { name: pkg.name, mood: 'idle', level: 1, favor: 50 });
    const next = { ...current, ...payload?.patch };
    await writeJson(ROLE_FILE, next);
    return { ok: true, role: next };
  });
}
