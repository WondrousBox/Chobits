/**
 * Sprite Assets Handler
 *
 * 管理精灵动画资源的 CRUD：
 *   sprite:list        — 列出全部动画
 *   sprite:listByEvent — 按事件类型筛选
 *   sprite:get         — 获取单个动画
 *   sprite:register    — 注册新动画
 *   sprite:remove      — 删除动画
 *   sprite:updateMeta  — 更新元数据
 */

import { randomUUID } from 'node:crypto';
import fscb from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';

import { app, ipcMain } from 'electron';

import type { SpriteAnimation } from '../types';

type SpriteIndex = {
  version: 1;
  items: SpriteAnimation[];
};

/** 外部依赖注入 */
export interface SpriteAssetsDeps {
  /** 将目录加入 res:// 协议的白名单 */
  addAllowedResourceRoot: (dir: string) => void;
  /** 获取 resources/ 下的平台资源路径 */
  getResourcePath: (...args: any[]) => string | undefined;
}

let _deps: SpriteAssetsDeps | undefined;

function deps(): SpriteAssetsDeps {
  if (!_deps) throw new Error('[sprite-assets] Must call initSpriteHandlers(deps) first');
  return _deps;
}

async function ensureDirs(dir: string): Promise<void> {
  await fs.mkdir(dir, { recursive: true });
}

const SETTINGS_DIR = path.join(app.getPath('userData'), 'data');

export async function getDefaultSpritesDir(): Promise<string> {
  // Packaged resources (read-only)
  const spritesDir = deps().getResourcePath('sprites');
  deps().addAllowedResourceRoot(spritesDir! as string);
  return spritesDir!;
}

async function getUserSpritesDir(): Promise<string> {
  const userDir = path.join(SETTINGS_DIR, 'sprites');
  await ensureDirs(userDir);
  deps().addAllowedResourceRoot(userDir);
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

/** 从磁盘加载全部精灵动画（默认 + 用户），供 IPC 和 SpriteManager 共用 */
export async function listSprites(): Promise<SpriteAnimation[]> {
  const [defDir, userDir] = await Promise.all([getDefaultSpritesDir(), getUserSpritesDir()]);
  const [defIdx, userIdx] = await Promise.all([readIndex(defDir), readIndex(userDir)]);
  // tag origin and deletable
  const withFlagsDefault = defIdx.items.map((it) => ({ ...it, meta: { ...it.meta, deletable: false } as SpriteAnimation['meta'] }));
  const withFlagsUser = userIdx.items.map((it) => ({ ...it, meta: { ...it.meta, deletable: true } as SpriteAnimation['meta'] }));
  // Merge: user overrides default on same id
  const map = new Map<string, SpriteAnimation>();
  for (const it of withFlagsDefault) map.set(it.meta.id, it);
  for (const it of withFlagsUser) map.set(it.meta.id, it);
  return Array.from(map.values());
}

export function initSpriteHandlers(injectedDeps: SpriteAssetsDeps): void {
  _deps = injectedDeps;

  ipcMain.handle('sprite:list', () => listSprites());

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
    if (foundUser) return { ...foundUser, meta: { ...foundUser.meta, deletable: true } } as SpriteAnimation;
    const foundDef = defIdx.items.find((i) => i.meta.id === payload.id);
    return foundDef ? ({ ...foundDef, meta: { ...foundDef.meta, deletable: false } } as SpriteAnimation) : undefined;
  });

  ipcMain.handle('sprite:register', async (_e, payload: (Partial<SpriteAnimation> & { filePath?: string }) | { animation?: Partial<SpriteAnimation> & { filePath?: string } }) => {
    // Support both direct payload and wrapped { animation } format
    const anim: Partial<SpriteAnimation> & { filePath?: string } = (payload as any)?.animation || payload || {};
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
      height: anim.height ?? 240,
      padding: anim.padding ?? 100,
      autoplay: anim.autoplay ?? true,
      muted: anim.muted ?? true,
      playsInline: anim.playsInline ?? true,
      loop: anim.loop ?? false,
      autoIdle: anim.autoIdle ?? true,
      loopStartMs: anim.loopStartMs,
      loopEndMs: anim.loopEndMs,
      durationMs: anim.durationMs
    };
    // mark deletable for user-created item
    (newItem.meta as any).deletable = true;

    const idx = await readIndex(spritesDir);
    const existedIdx = idx.items.findIndex((i) => i.meta.id === id);
    if (existedIdx >= 0) idx.items.splice(existedIdx, 1, newItem);
    else idx.items.push(newItem);
    await writeUserIndex(idx);
    return newItem;
  });

  // 从 ArrayBuffer 数据注册精灵（用于 Canvas 录制导出）
  ipcMain.handle(
    'sprite:registerFromData',
    async (
      _e,
      payload: {
        data: ArrayBuffer | Buffer;
        meta?: Partial<SpriteAnimation['meta']>;
        loopStartMs?: number;
        loopEndMs?: number;
        durationMs?: number;
        width?: number;
        height?: number;
      }
    ) => {
      const { data, meta, loopStartMs, loopEndMs, durationMs, width, height } = payload || ({} as any);
      if (!data || !(data instanceof ArrayBuffer || Buffer.isBuffer(data))) {
        throw new Error('[sprite:registerFromData] data is required (ArrayBuffer or Buffer)');
      }

      const id = meta?.id || randomUUID();
      const title = meta?.title || id;
      const spritesDir = await getUserSpritesDir();

      const baseName = `${id}.webm`;
      let finalPath = path.join(spritesDir, baseName);
      let counter = 1;
      while (fscb.existsSync(finalPath)) {
        finalPath = path.join(spritesDir, `${id}-${counter}.webm`);
        counter++;
      }

      // Write buffer to file
      const buf = Buffer.isBuffer(data) ? data : Buffer.from(data);
      await fs.writeFile(finalPath, buf);

      const newItem: SpriteAnimation = {
        meta: { id, title, description: meta?.description, tags: meta?.tags, coverSrc: meta?.coverSrc, eventType: meta?.eventType },
        source: { localPath: finalPath, type: 'video/webm' },
        width: width ?? 180,
        height: height ?? 240,
        padding: 100,
        autoplay: true,
        muted: true,
        playsInline: true,
        loop: false,
        autoIdle: true,
        loopStartMs,
        loopEndMs,
        durationMs
      };
      (newItem.meta as any).deletable = true;

      const idx = await readIndex(spritesDir);
      const existedIdx = idx.items.findIndex((i) => i.meta.id === id);
      if (existedIdx >= 0) idx.items.splice(existedIdx, 1, newItem);
      else idx.items.push(newItem);
      await writeUserIndex(idx);
      return newItem;
    }
  );

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
      userIndexItem.meta = { ...userIndexItem.meta, ...meta, id: userIndexItem.meta.id, deletable: true } as SpriteAnimation['meta'];
      await writeUserIndex(userIdx);
      return { ok: true, item: userIndexItem };
    }
    const defItem = defIdx.items.find((i) => i.meta.id === id);
    if (defItem) {
      // Create an override entry in user index (do not copy file; reference same localPath)
      const newItem: SpriteAnimation = {
        ...defItem,
        meta: { ...defItem.meta, ...meta, id: defItem.meta.id, deletable: true } as SpriteAnimation['meta']
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
