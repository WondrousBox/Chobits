/**
 * Sprite Assets Handler
 *
 * 管理精灵动画资源的 CRUD：
 *   sprite:list        — 列出全部动画
 *   sprite:listByTrigger — 按 trigger 筛选
 *   sprite:get         — 获取单个动画
 *   sprite:register    — 注册新动画
 *   sprite:remove      — 删除动画
 *   sprite:updateMeta  — 更新元数据
 */

import { randomUUID } from 'node:crypto';
import fscb from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { app, ipcMain } from 'electron';

import { isResolvedPathContainedByRoot, resolveContainedRelativeAssetPath } from '../character-pack-paths';
import { getCharacterPackAssetPath, getCharacterPackRootDir } from '../character-service';
import { hasSpriteAnimationTrigger, normalizeSpriteAnimationMeta, normalizeSpriteAnimationMetaPatch, type SpriteAnimation, type SpriteAnimationMetaInput, type SpriteListByTriggerRequest } from '../types';

type SpriteIndex = {
  version: 1;
  items: SpriteAnimation[];
};

interface SpriteIndexTarget {
  indexPath: string;
  containmentRootDir: string;
}

interface SpriteIndexReadOptions {
  containmentRootDirs?: string[];
}

/** 外部依赖注入 */
export interface SpriteAssetsDeps {
  /** 将目录加入 res:// 协议的白名单 */
  addAllowedResourceRoot: (dir: string) => void;
  /** 获取 resources/ 下的平台资源路径 */
  getResourcePath: (...args: any[]) => string | undefined;
  /** 校验精灵 capability 是否已解锁（由运行时权威注入） */
  assertCapabilityUnlocked?: (capabilityId: string) => void;
}

let _deps: SpriteAssetsDeps | undefined;

function deps(): SpriteAssetsDeps {
  if (!_deps) throw new Error('[sprite-assets] Must call initSpriteHandlers(deps) first');
  return _deps;
}

function ensureAssetAuthoringCapability(): void {
  deps().assertCapabilityUnlocked?.('actionChoreography');
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

function normalizeSpriteIndexPath(candidate: string): string {
  const resolved = path.resolve(candidate);
  try {
    if (fscb.existsSync(resolved) && fscb.statSync(resolved).isDirectory()) {
      return path.join(resolved, 'index.json');
    }
  } catch {
    /* ignore stat failures */
  }

  return path.extname(resolved).toLowerCase() === '.json' ? resolved : path.join(resolved, 'index.json');
}

async function getDefaultSpritesIndexTarget(): Promise<SpriteIndexTarget> {
  const packAnimationsPath = getCharacterPackAssetPath('animations');
  if (packAnimationsPath) {
    const containmentRootDir = getCharacterPackRootDir() ?? path.dirname(normalizeSpriteIndexPath(packAnimationsPath));
    deps().addAllowedResourceRoot(containmentRootDir);
    return {
      indexPath: normalizeSpriteIndexPath(packAnimationsPath),
      containmentRootDir
    };
  }

  const spritesDir = await getDefaultSpritesDir();
  return {
    indexPath: path.join(spritesDir, 'index.json'),
    containmentRootDir: spritesDir
  };
}

async function getUserSpritesDir(): Promise<string> {
  const userDir = path.join(SETTINGS_DIR, 'sprites');
  await ensureDirs(userDir);
  deps().addAllowedResourceRoot(userDir);
  return userDir;
}

function normalizeContainmentRoots(rootDirs: string[] | undefined): string[] {
  return Array.from(new Set((rootDirs ?? []).map((rootDir) => path.resolve(rootDir))));
}

function isContainedByAnyRoot(candidatePath: string, rootDirs: string[]): boolean {
  return rootDirs.length === 0 || rootDirs.some((rootDir) => isResolvedPathContainedByRoot(rootDir, candidatePath));
}

function normalizeSpriteLocalPath(localPath: string, options: { baseDir: string; containmentRootDirs: string[] }): string | null {
  const trimmed = localPath.trim();
  if (!trimmed) return null;

  const urlLikeMatch = /^([a-zA-Z][a-zA-Z\d+.-]*):\/\//.exec(trimmed);
  if (urlLikeMatch) {
    if (urlLikeMatch[1]?.toLowerCase() !== 'file') {
      return trimmed;
    }

    try {
      const filePath = fileURLToPath(trimmed);
      return isContainedByAnyRoot(filePath, options.containmentRootDirs) ? filePath : null;
    } catch {
      return null;
    }
  }

  if (path.isAbsolute(trimmed)) {
    const resolved = path.resolve(trimmed);
    return isContainedByAnyRoot(resolved, options.containmentRootDirs) ? resolved : null;
  }

  for (const rootDir of options.containmentRootDirs) {
    const resolved = resolveContainedRelativeAssetPath(options.baseDir, trimmed, rootDir);
    if (resolved) {
      return resolved;
    }
  }

  if (options.containmentRootDirs.length === 0) {
    return path.resolve(options.baseDir, trimmed);
  }

  return null;
}

async function readIndex(indexPathOrDir: string, options: SpriteIndexReadOptions = {}): Promise<SpriteIndex> {
  const idxPath = normalizeSpriteIndexPath(indexPathOrDir);
  if (!fscb.existsSync(idxPath)) {
    return { version: 1, items: [] };
  }
  try {
    const raw = await fs.readFile(idxPath, 'utf-8');
    const data = JSON.parse(raw);
    if (Array.isArray(data.items)) {
      // Normalize relative localPath to absolute path under the index.json directory
      const baseDir = path.dirname(idxPath);
      const containmentRootDirs = normalizeContainmentRoots(options.containmentRootDirs);
      const items = (data.items as SpriteAnimation[])
        .map((item): SpriteAnimation | null => {
          const lp = (item as any)?.source?.localPath;
          // Skip if not a string
          if (typeof lp !== 'string') return normalizeSpriteAnimationItem(item);
          const resolved = normalizeSpriteLocalPath(lp, {
            baseDir,
            containmentRootDirs
          });
          if (!resolved) return null;
          return normalizeSpriteAnimationItem({ ...item, source: { ...item.source, localPath: resolved } });
        })
        .filter((item): item is SpriteAnimation => !!item);
      return { version: 1, items };
    }
  } catch {
    /* ignore malformed sprite index */
  }
  return { version: 1, items: [] };
}

function normalizeSpriteAnimationItem(item: SpriteAnimation): SpriteAnimation {
  return {
    ...item,
    meta: normalizeSpriteAnimationMeta(item.meta)
  };
}

function normalizeIncomingSpriteMeta(meta: SpriteAnimationMetaInput | undefined, options: { id: string; title: string; deletable?: boolean }): SpriteAnimation['meta'] {
  const normalizedMetaPatch = normalizeSpriteAnimationMetaPatch(meta ?? {});

  return normalizeSpriteAnimationMeta({
    ...normalizedMetaPatch,
    id: options.id,
    title: normalizedMetaPatch.title ?? options.title,
    deletable: options.deletable
  }) as SpriteAnimation['meta'];
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
  const [defaultIndex, userDir] = await Promise.all([getDefaultSpritesIndexTarget(), getUserSpritesDir()]);
  const userContainmentRootDirs = [userDir, defaultIndex.containmentRootDir];
  const [defIdx, userIdx] = await Promise.all([
    readIndex(defaultIndex.indexPath, { containmentRootDirs: [defaultIndex.containmentRootDir] }),
    readIndex(userDir, { containmentRootDirs: userContainmentRootDirs })
  ]);
  // tag origin and deletable
  const withFlagsDefault = defIdx.items.map((it) => normalizeSpriteAnimationItem({ ...it, meta: { ...it.meta, deletable: false } as SpriteAnimation['meta'] }));
  const withFlagsUser = userIdx.items.map((it) => normalizeSpriteAnimationItem({ ...it, meta: { ...it.meta, deletable: true } as SpriteAnimation['meta'] }));
  // Merge: user overrides default on same id
  const map = new Map<string, SpriteAnimation>();
  for (const it of withFlagsDefault) map.set(it.meta.id, it);
  for (const it of withFlagsUser) map.set(it.meta.id, it);
  return Array.from(map.values());
}

export function initSpriteHandlers(injectedDeps: SpriteAssetsDeps): void {
  _deps = injectedDeps;

  ipcMain.handle('sprite:list', () => listSprites());

  const handleListByTrigger = async (_e: unknown, payload: SpriteListByTriggerRequest = {}) => {
    const trigger = payload.trigger;
    const all = await (ipcMain as any).invoke?.('sprite:list')?.catch?.(() => undefined);
    if (Array.isArray(all)) {
      if (!trigger) return all;
      return all.filter((s: SpriteAnimation) => hasSpriteAnimationTrigger(s.meta, trigger));
    }
    // fallback manual list
    const [defaultIndex, userDir] = await Promise.all([getDefaultSpritesIndexTarget(), getUserSpritesDir()]);
    const userContainmentRootDirs = [userDir, defaultIndex.containmentRootDir];
    const [defIdx, userIdx] = await Promise.all([
      readIndex(defaultIndex.indexPath, { containmentRootDirs: [defaultIndex.containmentRootDir] }),
      readIndex(userDir, { containmentRootDirs: userContainmentRootDirs })
    ]);
    const map = new Map<string, SpriteAnimation>();
    for (const it of defIdx.items) map.set(it.meta.id, it);
    for (const it of userIdx.items) map.set(it.meta.id, it);
    const arr = Array.from(map.values()).map((item) => normalizeSpriteAnimationItem(item));
    return trigger ? arr.filter((a) => hasSpriteAnimationTrigger(a.meta, trigger)) : arr;
  };

  ipcMain.handle('sprite:listByTrigger', handleListByTrigger);

  ipcMain.handle('sprite:get', async (_e, payload: { id: string }) => {
    const [defaultIndex, userDir] = await Promise.all([getDefaultSpritesIndexTarget(), getUserSpritesDir()]);
    const userContainmentRootDirs = [userDir, defaultIndex.containmentRootDir];
    const [defIdx, userIdx] = await Promise.all([
      readIndex(defaultIndex.indexPath, { containmentRootDirs: [defaultIndex.containmentRootDir] }),
      readIndex(userDir, { containmentRootDirs: userContainmentRootDirs })
    ]);
    const foundUser = userIdx.items.find((i) => i.meta.id === payload.id);
    if (foundUser) return normalizeSpriteAnimationItem({ ...foundUser, meta: { ...foundUser.meta, deletable: true } } as SpriteAnimation);
    const foundDef = defIdx.items.find((i) => i.meta.id === payload.id);
    return foundDef ? normalizeSpriteAnimationItem({ ...foundDef, meta: { ...foundDef.meta, deletable: false } } as SpriteAnimation) : undefined;
  });

  ipcMain.handle('sprite:register', async (_e, payload: (Partial<SpriteAnimation> & { filePath?: string }) | { animation?: Partial<SpriteAnimation> & { filePath?: string } }) => {
    ensureAssetAuthoringCapability();

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
      meta: normalizeIncomingSpriteMeta(anim.meta, { id, title, deletable: true }),
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
      durationMs: anim.durationMs,
      movement: anim.movement
    };

    const defaultIndex = await getDefaultSpritesIndexTarget();
    const idx = await readIndex(spritesDir, { containmentRootDirs: [spritesDir, defaultIndex.containmentRootDir] });
    const existedIdx = idx.items.findIndex((i) => i.meta.id === id);
    if (existedIdx >= 0) idx.items.splice(existedIdx, 1, newItem);
    else idx.items.push(newItem);
    await writeUserIndex(idx);
    return normalizeSpriteAnimationItem(newItem);
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
        autoIdle?: boolean;
        width?: number;
        height?: number;
        padding?: number;
        movement?: SpriteAnimation['movement'];
      }
    ) => {
      ensureAssetAuthoringCapability();

      const { data, meta, loopStartMs, loopEndMs, durationMs, autoIdle, width, height, padding, movement } = payload || ({} as any);
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
        meta: normalizeIncomingSpriteMeta(meta, { id, title, deletable: true }),
        source: { localPath: finalPath, type: 'video/webm' },
        width: width ?? 180,
        height: height ?? 240,
        padding: padding ?? 100,
        autoplay: true,
        muted: true,
        playsInline: true,
        loop: false,
        autoIdle: autoIdle ?? true,
        loopStartMs,
        loopEndMs,
        durationMs,
        movement
      };

      const defaultIndex = await getDefaultSpritesIndexTarget();
      const idx = await readIndex(spritesDir, { containmentRootDirs: [spritesDir, defaultIndex.containmentRootDir] });
      const existedIdx = idx.items.findIndex((i) => i.meta.id === id);
      if (existedIdx >= 0) idx.items.splice(existedIdx, 1, newItem);
      else idx.items.push(newItem);
      await writeUserIndex(idx);
      return normalizeSpriteAnimationItem(newItem);
    }
  );

  ipcMain.handle('sprite:remove', async (_e, payload: { id: string; deleteFile?: boolean }) => {
    ensureAssetAuthoringCapability();

    const { id, deleteFile } = payload || ({} as any);
    const userDir = await getUserSpritesDir();
    const defaultIndex = await getDefaultSpritesIndexTarget();
    const idx = await readIndex(userDir, { containmentRootDirs: [userDir, defaultIndex.containmentRootDir] });
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
          await fs.unlink(p).catch(() => {});
        }
      }
    } catch {
      /* ignore unlink failures */
    }
    return { ok: true };
  });

  ipcMain.handle('sprite:updateMeta', async (_e, payload: { id: string; meta: Partial<SpriteAnimation['meta']> }) => {
    ensureAssetAuthoringCapability();

    const { id, meta } = payload || ({} as any);
    if (!id || !meta) return { ok: false };
    const normalizedMetaPatch = normalizeSpriteAnimationMetaPatch(meta);
    const [defaultIndex, userDir] = await Promise.all([getDefaultSpritesIndexTarget(), getUserSpritesDir()]);
    const userContainmentRootDirs = [userDir, defaultIndex.containmentRootDir];
    const [defIdx, userIdx] = await Promise.all([
      readIndex(defaultIndex.indexPath, { containmentRootDirs: [defaultIndex.containmentRootDir] }),
      readIndex(userDir, { containmentRootDirs: userContainmentRootDirs })
    ]);
    const userIndexItem = userIdx.items.find((i) => i.meta.id === id);
    if (userIndexItem) {
      userIndexItem.meta = normalizeIncomingSpriteMeta({
        ...userIndexItem.meta,
        ...normalizedMetaPatch
      }, {
        id: userIndexItem.meta.id,
        title: normalizedMetaPatch.title ?? userIndexItem.meta.title,
        deletable: true
      });
      await writeUserIndex(userIdx);
      return { ok: true, item: normalizeSpriteAnimationItem(userIndexItem) };
    }
    const defItem = defIdx.items.find((i) => i.meta.id === id);
    if (defItem) {
      // Create an override entry in user index (do not copy file; reference same localPath)
      const newItem: SpriteAnimation = {
        ...defItem,
        meta: normalizeIncomingSpriteMeta({
          ...defItem.meta,
          ...normalizedMetaPatch
        }, {
          id: defItem.meta.id,
          title: normalizedMetaPatch.title ?? defItem.meta.title,
          deletable: true
        })
      };
      const uIdx = await readIndex(userDir, { containmentRootDirs: userContainmentRootDirs });
      const existed = uIdx.items.findIndex((i) => i.meta.id === id);
      if (existed >= 0) uIdx.items.splice(existed, 1, newItem);
      else uIdx.items.push(newItem);
      await writeUserIndex(uIdx);
      return { ok: true, item: normalizeSpriteAnimationItem(newItem) };
    }
    return { ok: false };
  });
}
