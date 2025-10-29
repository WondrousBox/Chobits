import { app, BrowserWindow, ipcMain } from 'electron';
import path from 'node:path';
import fs from 'node:fs/promises';
import fscb from 'node:fs';
import { randomUUID } from 'node:crypto';
import type { SpriteAnimation } from '@/components/AIAssistant/messages/types';
import { addAllowedResourceRoot } from '../resource-protocol';
import { getResourcePath } from '../utils/resources-path';

type SpriteIndex = {
  version: 1;
  items: SpriteAnimation[];
};

async function ensureDirs(dir: string): Promise<void> {
  await fs.mkdir(dir, { recursive: true });
}

const SETTINGS_DIR = path.join(app.getPath('home'), '.chobits');

async function getDefaultSpritesDir(): Promise<string> {
  // Packaged resources (read-only)
  const spritesDir = getResourcePath('sprites');
  addAllowedResourceRoot(spritesDir);
  return spritesDir;
}

async function getUserSpritesDir(): Promise<string> {
  const userDir = path.join(SETTINGS_DIR, 'sprites');
  await ensureDirs(userDir);
  addAllowedResourceRoot(userDir);
  return userDir;
}

async function readIndex(dir: string): Promise<SpriteIndex> {
  const idxPath = path.join(dir, 'index.json');
  if (!fscb.existsSync(idxPath)) {
    return { version: 1, items: [] };
  }
  try {
    const raw = await fs.readFile(idxPath, 'utf-8');
    const data = JSON.parse(raw);
    if (Array.isArray(data.items)) {
      // Normalize relative localPath to absolute path under the index.json directory
      const baseDir = path.dirname(idxPath);
      const items = (data.items as SpriteAnimation[]).map((item) => {
        const lp = (item as any)?.source?.localPath;
        // Skip if not a string
        if (typeof lp !== 'string') return item;
        // Treat URL-like strings (e.g. resource://, file://, http://) as-is
        const isUrlLike = /^[a-zA-Z]+:\/\//.test(lp);
        if (isUrlLike || path.isAbsolute(lp)) return item;
        // Resolve relative path against the parent of the sprites directory
        const resolved = path.resolve(baseDir, lp);
        return { ...item, source: { ...item.source, localPath: resolved } };
      });
      return { version: 1, items };
    }
  } catch { }
  return { version: 1, items: [] };
}

async function writeUserIndex(index: SpriteIndex): Promise<void> {
  const dir = await getUserSpritesDir();
  const idxPath = path.join(dir, 'index.json');
  await fs.writeFile(idxPath, JSON.stringify(index, null, 2), 'utf-8');
}

function inferMimeFromExt(ext: string): string | undefined {
  switch (ext.toLowerCase()) {
    case '.mp4':
      return 'video/mp4';
    case '.webm':
      return 'video/webm';
    case '.mov':
      return 'video/quicktime';
    case '.mkv':
      return 'video/x-matroska';
    default:
      return undefined;
  }
}

export function initSpriteHandlers(): void {
  ipcMain.handle('sprite:list', async () => {
    const [defDir, userDir] = await Promise.all([getDefaultSpritesDir(), getUserSpritesDir()]);
    const [defIdx, userIdx] = await Promise.all([readIndex(defDir), readIndex(userDir)]);
    // Merge: user overrides default on same id
    const map = new Map<string, SpriteAnimation>();
    for (const it of defIdx.items) map.set(it.meta.id, it);
    for (const it of userIdx.items) map.set(it.meta.id, it);
    return Array.from(map.values());
  });

  ipcMain.handle('sprite:listByEvent', async (_e, payload: { eventType?: SpriteAnimation['meta']['eventType'] }) => {
    const { eventType } = payload || {};
    const all = await (ipcMain as any).invoke?.('sprite:list')?.catch?.(() => undefined);
    if (Array.isArray(all)) {
      if (!eventType) return all;
      return all.filter((s: SpriteAnimation) => s.meta?.eventType === eventType);
    }
    // fallback manual list
    const [defDir, userDir] = await Promise.all([getDefaultSpritesDir(), getUserSpritesDir()]);
    const [defIdx, userIdx] = await Promise.all([readIndex(defDir), readIndex(userDir)]);
    const map = new Map<string, SpriteAnimation>();
    for (const it of defIdx.items) map.set(it.meta.id, it);
    for (const it of userIdx.items) map.set(it.meta.id, it);
    const arr = Array.from(map.values());
    return eventType ? arr.filter((a) => a.meta?.eventType === eventType) : arr;
  });

  ipcMain.handle('sprite:get', async (_e, payload: { id: string }) => {
    const [defDir, userDir] = await Promise.all([getDefaultSpritesDir(), getUserSpritesDir()]);
    const [defIdx, userIdx] = await Promise.all([readIndex(defDir), readIndex(userDir)]);
    const foundUser = userIdx.items.find((i) => i.meta.id === payload.id);
    if (foundUser) return foundUser;
    return defIdx.items.find((i) => i.meta.id === payload.id);
  });

  ipcMain.handle('sprite:register', async (_e, payload: { animation?: Partial<SpriteAnimation> & { filePath?: string } }) => {
    const anim = payload?.animation || {};
    const srcPath = anim.filePath;
    const id = anim.meta?.id || randomUUID();
    const title = anim.meta?.title || id;
    const spritesDir = await getUserSpritesDir();

    let finalPath: string | undefined;
    let type = anim.source?.type;
    if (srcPath && fscb.existsSync(srcPath)) {
      const ext = path.extname(srcPath) || '.webm';
      const baseName = `${id}${ext}`;
      finalPath = path.join(spritesDir, baseName);
      let counter = 1;
      while (fscb.existsSync(finalPath)) {
        finalPath = path.join(spritesDir, `${id}-${counter}${ext}`);
        counter++;
      }
      await fs.copyFile(srcPath, finalPath);
      type = type || inferMimeFromExt(ext) || 'video/webm';
    } else if (anim.source?.localPath) {
      // trust provided localPath ONLY if it is inside user spritesDir
      const provided = path.resolve(anim.source.localPath);
      const userRoot = path.resolve(spritesDir);
      if (provided === userRoot || provided.startsWith(userRoot + path.sep)) {
        finalPath = provided;
      } else {
        // reject by copying into user dir instead of referencing external location
        try {
          const ext = path.extname(provided) || '.webm';
          const baseName = `${id}${ext}`;
          finalPath = path.join(spritesDir, baseName);
          let counter = 1;
          while (fscb.existsSync(finalPath)) {
            finalPath = path.join(spritesDir, `${id}-${counter}${ext}`);
            counter++;
          }
          await fs.copyFile(provided, finalPath);
          type = type || inferMimeFromExt(ext) || 'video/webm';
        } catch {
          // fallback: no file copied
        }
      }
    }

    const newItem: SpriteAnimation = {
      meta: { id, title, description: anim.meta?.description, tags: anim.meta?.tags, coverSrc: anim.meta?.coverSrc, eventType: anim.meta?.eventType },
      source: { localPath: finalPath!, type: type || 'video/webm' },
      width: anim.width ?? 180,
      height: anim.height ?? 220,
      autoplay: anim.autoplay ?? true,
      muted: anim.muted ?? true,
      playsInline: anim.playsInline ?? true,
      loopStrategy: anim.loopStrategy ?? 'early',
      cutoffSeconds: anim.cutoffSeconds,
      durationMs: anim.durationMs
    };

    const idx = await readIndex(spritesDir);
    const existedIdx = idx.items.findIndex((i) => i.meta.id === id);
    if (existedIdx >= 0) idx.items.splice(existedIdx, 1, newItem);
    else idx.items.push(newItem);
    await writeUserIndex(idx);
    return newItem;
  });

  ipcMain.handle('sprite:remove', async (_e, payload: { id: string; deleteFile?: boolean }) => {
    const { id, deleteFile } = payload || ({} as any);
    const userDir = await getUserSpritesDir();
    const idx = await readIndex(userDir);
    const i = idx.items.findIndex((a) => a.meta.id === id);
    if (i === -1) {
      // Not removable (likely a default sprite)
      return { ok: false };
    }
    const [removed] = idx.items.splice(i, 1);
    await writeUserIndex(idx);
    try {
      if (deleteFile && removed?.source?.localPath) {
        const p = path.resolve(removed.source.localPath);
        const root = path.resolve(userDir);
        if (p === root || p.startsWith(root + path.sep)) {
          await fs.unlink(p).catch(() => { });
        }
      }
    } catch { }
    return { ok: true };
  });

  ipcMain.handle('sprite:updateMeta', async (_e, payload: { id: string; meta: Partial<SpriteAnimation['meta']> }) => {
    const { id, meta } = payload || ({} as any);
    if (!id || !meta) return { ok: false };
    const [defDir, userDir] = await Promise.all([getDefaultSpritesDir(), getUserSpritesDir()]);
    const [defIdx, userIdx] = await Promise.all([readIndex(defDir), readIndex(userDir)]);
    const userIndexItem = userIdx.items.find((i) => i.meta.id === id);
    if (userIndexItem) {
      userIndexItem.meta = { ...userIndexItem.meta, ...meta, id: userIndexItem.meta.id };
      await writeUserIndex(userIdx);
      return { ok: true, item: userIndexItem };
    }
    const defItem = defIdx.items.find((i) => i.meta.id === id);
    if (defItem) {
      // Create an override entry in user index (do not copy file; reference same localPath)
      const newItem: SpriteAnimation = {
        ...defItem,
        meta: { ...defItem.meta, ...meta, id: defItem.meta.id }
      };
      const uIdx = await readIndex(userDir);
      const existed = uIdx.items.findIndex((i) => i.meta.id === id);
      if (existed >= 0) uIdx.items.splice(existed, 1, newItem);
      else uIdx.items.push(newItem);
      await writeUserIndex(uIdx);
      return { ok: true, item: newItem };
    }
    return { ok: false };
  });
}
