import { BrowserWindow, ipcMain, app } from 'electron';
import path from 'node:path';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import { getDB } from '../db';
import { WorkspacesRepo } from '../db/repositories';

const SETTINGS_DIR = path.join(app.getPath('home'), '.chobits');
const ROLE_FILE = path.join(SETTINGS_DIR, 'role.json');

type RoleProfile = {
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

export function initStatusHandlers(_win: BrowserWindow) {
  ipcMain.handle('status:getRole', async () => {
    const role = await readJson<RoleProfile>(ROLE_FILE, { name: 'Chobits', mood: 'idle', level: 1, favor: 50 });
    return { ok: true, role };
  });

  ipcMain.handle('status:updateRole', async (_e, payload: { patch: Partial<RoleProfile> }) => {
    const current = await readJson<RoleProfile>(ROLE_FILE, { name: 'Chobits', mood: 'idle', level: 1, favor: 50 });
    const next = { ...current, ...payload?.patch };
    await writeJson(ROLE_FILE, next);
    return { ok: true, role: next };
  });

  ipcMain.handle('status:getOverview', async () => {
    const db = getDB();
    const userDir = app.getPath('userData');
    const dbDir = path.join(userDir, 'data');
    const dbPath = path.join(dbDir, process.env.NODE_ENV === 'development' ? 'app-dev.db' : 'app.db');
    const ws = await WorkspacesRepo.getDefault();

    function getSingle<T = any>(sql: string, params: any[] = [], fallback: any = 0): T {
      try {
        const row = (db as any).prepare(sql).get(...params);
        return (row as any) ?? fallback;
      } catch {
        return fallback;
      }
    }
    function getAll<T = any>(sql: string, params: any[] = []): T[] {
      try {
        return (db as any).prepare(sql).all(...params) as T[];
      } catch {
        return [] as T[];
      }
    }

    const resTotal = getSingle<{ count: number }>(`SELECT COUNT(*) as count FROM resources WHERE deleted_at IS NULL`, [])?.count ?? 0;
    const resSize = getSingle<{ size: number }>(`SELECT COALESCE(SUM(size_bytes), 0) as size FROM resources WHERE deleted_at IS NULL`, [])?.size ?? 0;
    const resByType = getAll<{ type: string; count: number; size: number }>(
      `SELECT type as type, COUNT(*) as count, COALESCE(SUM(size_bytes), 0) as size FROM resources WHERE deleted_at IS NULL GROUP BY type`
    );
    const thumbWith = getSingle<{ cnt: number }>(`SELECT COUNT(*) as cnt FROM resources WHERE deleted_at IS NULL AND thumbnail_path IS NOT NULL`, [])?.cnt ?? 0;
    const thumbWithout = getSingle<{ cnt: number }>(`SELECT COUNT(*) as cnt FROM resources WHERE deleted_at IS NULL AND (thumbnail_path IS NULL OR thumbnail_path = '')`, [])?.cnt ?? 0;

    const docTotal = getSingle<{ count: number }>(`SELECT COUNT(*) as count FROM documents WHERE deleted_at IS NULL`, [])?.count ?? 0;
    const docWithEmb = getSingle<{ count: number }>(`SELECT COUNT(*) as count FROM documents WHERE deleted_at IS NULL AND embedding IS NOT NULL`, [])?.count ?? 0;
    const docByType = getAll<{ docType: string | null; count: number }>(`SELECT doc_type as docType, COUNT(*) as count FROM documents WHERE deleted_at IS NULL GROUP BY doc_type`);

    const vecTable = getSingle<{ name?: string }>(`SELECT name FROM sqlite_master WHERE type='table' AND name='vec_docs'`, []);
    const vecEnabled = !!vecTable?.name;
    const vecTotal = vecEnabled ? (getSingle<{ count: number }>(`SELECT COUNT(*) as count FROM vec_docs`, [])?.count ?? 0) : 0;

    const recycleTotal = getSingle<{ count: number }>(`SELECT COUNT(*) as count FROM recycle_bin`, [])?.count ?? 0;

    return {
      ok: true,
      workspace: ws || null,
      resources: {
        total: resTotal,
        totalSizeBytes: resSize,
        byType: resByType,
        thumbnails: { withThumb: thumbWith, withoutThumb: thumbWithout }
      },
      documents: {
        total: docTotal,
        withEmbedding: docWithEmb,
        byDocType: docByType
      },
      vectors: { enabled: vecEnabled, total: vecTotal },
      recycleBin: { total: recycleTotal },
      system: { userDataDir: userDir }
    };
  });
}
