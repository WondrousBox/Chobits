/**
 * Sprite Assets Handler
 *
 * 管理精灵动画资源的 CRUD：
 *   sprite:list        — 列出全部动画
 *   sprite:list-by-trigger — 按 trigger 筛选
 *   sprite:get         — 获取单个动画
 *   sprite:register    — 注册新动画
 *   sprite:remove      — 删除动画
 *   sprite:update-config — 更新动画播放/触发配置
 *   sprite:update-meta  — 更新元数据
 */

import { randomUUID } from 'node:crypto';
import fscb from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { app, ipcMain } from 'electron';

import { isResolvedPathContainedByRoot, resolveContainedRelativeAssetPath } from '../character-pack-paths';
import { type CharacterPackRuntimeSource, getCharacterPackAssetPath, getCharacterPackRootDir, getCharacterPackSource } from '../character-service';
import {
  getSpriteAnimationTriggers,
  hasSpriteAnimationTrigger,
  normalizeSpriteAnimationMeta,
  normalizeSpriteAnimationMetaPatch,
  type SpriteAnimation,
  type SpriteAnimationMetaInput,
  type SpriteListByTriggerRequest
} from '../types';

type SpriteIndex = {
  version: 1;
  items: SpriteAnimation[];
};

interface SpriteIndexTarget {
  indexPath: string;
  containmentRootDir: string;
  source: CharacterPackRuntimeSource | 'user' | 'resource-fallback';
  writable: boolean;
}

interface SpriteIndexReadOptions {
  containmentRootDirs?: string[];
}

type SpriteAssetsChangeReason = 'register' | 'registerFromData' | 'remove' | 'updateConfig' | 'updateMeta';

export interface SpriteAssetsChangeEvent {
  reason: SpriteAssetsChangeReason;
  id?: string;
}

type SpriteAnimationConfigPatch = Partial<
  Pick<SpriteAnimation, 'width' | 'height' | 'padding' | 'loop' | 'loopCount' | 'autoIdle' | 'durationMs' | 'loopStartMs' | 'loopEndMs' | 'movement'>
> & {
  meta?: Partial<SpriteAnimation['meta']>;
};

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
let spriteAssetsChangeHandler: ((event: SpriteAssetsChangeEvent) => void | Promise<void>) | null = null;

function deps(): SpriteAssetsDeps {
  if (!_deps) throw new Error('[sprite-assets] Must call initSpriteHandlers(deps) first');
  return _deps;
}

export function setSpriteAssetsChangeHandler(handler: ((event: SpriteAssetsChangeEvent) => void | Promise<void>) | null): void {
  spriteAssetsChangeHandler = handler;
}

function notifySpriteAssetsChanged(event: SpriteAssetsChangeEvent): void {
  const handler = spriteAssetsChangeHandler;
  if (!handler) return;

  try {
    void Promise.resolve(handler(event)).catch((err) => {
      console.warn('[sprite-assets] sprite assets change handler failed', err);
    });
  } catch (err) {
    console.warn('[sprite-assets] sprite assets change handler failed', err);
  }
}

function ensureAssetAuthoringCapability(): void {
  deps().assertCapabilityUnlocked?.('spriteManage');
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

function readDeclaredAnimationsIndexPath(rootDir: string): string | null {
  try {
    const pack = JSON.parse(fscb.readFileSync(path.join(rootDir, 'pack.json'), 'utf-8')) as { assets?: { animations?: unknown } };
    if (typeof pack.assets?.animations !== 'string') {
      return null;
    }

    const resolved = resolveContainedRelativeAssetPath(rootDir, pack.assets.animations, rootDir);
    return resolved ? normalizeSpriteIndexPath(resolved) : null;
  } catch {
    return null;
  }
}

async function getDefaultSpritesIndexTarget(): Promise<SpriteIndexTarget> {
  const packAnimationsPath = getCharacterPackAssetPath('animations');
  if (packAnimationsPath) {
    const containmentRootDir = getCharacterPackRootDir() ?? path.dirname(normalizeSpriteIndexPath(packAnimationsPath));
    const source = getCharacterPackSource() ?? 'resource-fallback';
    deps().addAllowedResourceRoot(containmentRootDir);
    return {
      indexPath: normalizeSpriteIndexPath(packAnimationsPath),
      containmentRootDir,
      source,
      writable: source === 'installed'
    };
  }

  const spritesDir = await getDefaultSpritesDir();
  return {
    indexPath: path.join(spritesDir, 'index.json'),
    containmentRootDir: spritesDir,
    source: 'resource-fallback',
    writable: false
  };
}

async function getBuiltinSpritesIndexTarget(): Promise<SpriteIndexTarget> {
  const spritesDir = await getDefaultSpritesDir();
  return {
    indexPath: readDeclaredAnimationsIndexPath(spritesDir) ?? path.join(spritesDir, 'index.json'),
    containmentRootDir: spritesDir,
    source: 'resource-fallback',
    writable: false
  };
}

async function getUserSpritesDir(): Promise<string> {
  const userDir = path.join(SETTINGS_DIR, 'sprites');
  await ensureDirs(userDir);
  deps().addAllowedResourceRoot(userDir);
  return userDir;
}

async function getUserSpritesIndexTarget(): Promise<SpriteIndexTarget> {
  const userDir = await getUserSpritesDir();
  return {
    indexPath: path.join(userDir, 'index.json'),
    containmentRootDir: userDir,
    source: 'user',
    writable: true
  };
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
  const rawLoopCount = typeof item.loopCount === 'number' && Number.isFinite(item.loopCount) ? Math.floor(item.loopCount) : undefined;
  return {
    ...item,
    loopCount: rawLoopCount != null && rawLoopCount > 0 ? rawLoopCount : undefined,
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

function applySpriteAnimationConfigPatch(item: SpriteAnimation, patch: SpriteAnimationConfigPatch): SpriteAnimation {
  const next: SpriteAnimation = { ...item };

  const numericKeys = ['width', 'height', 'padding', 'durationMs', 'loopStartMs', 'loopEndMs'] as const;
  for (const key of numericKeys) {
    if (Object.prototype.hasOwnProperty.call(patch, key)) {
      const value = patch[key];
      if (value === undefined) {
        delete next[key];
      } else if (typeof value === 'number' && Number.isFinite(value)) {
        next[key] = value;
      }
    }
  }

  if (Object.prototype.hasOwnProperty.call(patch, 'loopCount')) {
    const value = patch.loopCount;
    if (value === undefined) {
      delete next.loopCount;
    } else if (typeof value === 'number' && Number.isFinite(value)) {
      const normalizedLoopCount = Math.floor(value);
      if (normalizedLoopCount > 0) {
        next.loopCount = normalizedLoopCount;
      } else {
        delete next.loopCount;
      }
    }
  }

  if (Object.prototype.hasOwnProperty.call(patch, 'loop')) {
    next.loop = patch.loop;
  }

  if (Object.prototype.hasOwnProperty.call(patch, 'autoIdle')) {
    next.autoIdle = patch.autoIdle;
  }

  if (Object.prototype.hasOwnProperty.call(patch, 'movement')) {
    next.movement = patch.movement;
  }

  if (patch.meta) {
    const normalizedMetaPatch = normalizeSpriteAnimationMetaPatch(patch.meta);
    next.meta = normalizeIncomingSpriteMeta(
      {
        ...next.meta,
        ...normalizedMetaPatch
      },
      {
        id: next.meta.id,
        title: normalizedMetaPatch.title ?? next.meta.title,
        deletable: true
      }
    );
  }

  return normalizeSpriteAnimationItem(next);
}

async function writeUserIndex(index: SpriteIndex): Promise<void> {
  await writeSpriteIndex(await getUserSpritesIndexTarget(), index, {
    portableLocalPaths: false
  });
}

function serializeSpriteLocalPathForTarget(localPath: string, target: SpriteIndexTarget): string {
  const trimmed = localPath.trim();
  if (!trimmed) return localPath;

  const urlLikeMatch = /^([a-zA-Z][a-zA-Z\d+.-]*):\/\//.exec(trimmed);
  if (urlLikeMatch && urlLikeMatch[1]?.toLowerCase() !== 'file') {
    return localPath;
  }

  if (!path.isAbsolute(trimmed)) {
    return localPath;
  }

  const resolved = path.resolve(trimmed);
  if (!isResolvedPathContainedByRoot(target.containmentRootDir, resolved)) {
    return localPath;
  }

  const relativePath = path.relative(path.dirname(target.indexPath), resolved).split(path.sep).join('/');
  return relativePath || path.basename(resolved);
}

function serializeSpriteIndexForTarget(index: SpriteIndex, target: SpriteIndexTarget, options: { portableLocalPaths: boolean }): SpriteIndex {
  if (!options.portableLocalPaths) {
    return index;
  }

  return {
    version: 1,
    items: index.items.map((item) => {
      const localPath = item.source?.localPath;
      return typeof localPath === 'string'
        ? {
            ...item,
            source: {
              ...item.source,
              localPath: serializeSpriteLocalPathForTarget(localPath, target)
            }
          }
        : item;
    })
  };
}

async function writeSpriteIndex(target: SpriteIndexTarget, index: SpriteIndex, options?: { portableLocalPaths?: boolean }): Promise<void> {
  await ensureDirs(path.dirname(target.indexPath));
  const serialized = serializeSpriteIndexForTarget(index, target, {
    portableLocalPaths: options?.portableLocalPaths ?? target.source !== 'user'
  });
  await fs.writeFile(target.indexPath, JSON.stringify(serialized, null, 2), 'utf-8');
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

function shouldIncludeUserSprites(defaultIndex: SpriteIndexTarget): boolean {
  return defaultIndex.source !== 'installed';
}

function getUserIndexContainmentRoots(userTarget: SpriteIndexTarget, defaultIndex: SpriteIndexTarget): string[] {
  return [userTarget.containmentRootDir, defaultIndex.containmentRootDir];
}

function getWritableIndexContainmentRoots(writableTarget: SpriteIndexTarget, defaultIndex: SpriteIndexTarget): string[] {
  return writableTarget.source === 'user' ? getUserIndexContainmentRoots(writableTarget, defaultIndex) : [writableTarget.containmentRootDir];
}

async function getWritableSpritesIndexTarget(defaultIndex?: SpriteIndexTarget): Promise<SpriteIndexTarget> {
  const activeIndex = defaultIndex ?? (await getDefaultSpritesIndexTarget());
  if (activeIndex.writable) {
    await ensureDirs(path.dirname(activeIndex.indexPath));
    deps().addAllowedResourceRoot(activeIndex.containmentRootDir);
    return activeIndex;
  }

  return getUserSpritesIndexTarget();
}

async function readVisibleSpriteIndexes(): Promise<{
  defaultIndex: SpriteIndexTarget;
  defaultSprites: SpriteIndex;
  userIndex: SpriteIndexTarget | null;
  userSprites: SpriteIndex;
}> {
  const defaultIndex = await getDefaultSpritesIndexTarget();
  const userIndex = shouldIncludeUserSprites(defaultIndex) ? await getUserSpritesIndexTarget() : null;
  const [defaultSprites, userSprites] = await Promise.all([
    readIndex(defaultIndex.indexPath, { containmentRootDirs: [defaultIndex.containmentRootDir] }),
    userIndex ? readIndex(userIndex.indexPath, { containmentRootDirs: getUserIndexContainmentRoots(userIndex, defaultIndex) }) : Promise.resolve({ version: 1, items: [] } satisfies SpriteIndex)
  ]);

  return {
    defaultIndex,
    defaultSprites,
    userIndex,
    userSprites
  };
}

function withDeletableFlag(item: SpriteAnimation, deletable: boolean): SpriteAnimation {
  return normalizeSpriteAnimationItem({
    ...item,
    meta: {
      ...item.meta,
      deletable
    } as SpriteAnimation['meta']
  });
}

function isLocalPathStillReferenced(index: SpriteIndex, localPath: string): boolean {
  const resolvedLocalPath = path.resolve(localPath);
  return index.items.some((item) => {
    const candidate = item.source?.localPath;
    return typeof candidate === 'string' && path.resolve(candidate) === resolvedLocalPath;
  });
}

async function removeUnreferencedLocalFile(rootDir: string, index: SpriteIndex, localPath?: string): Promise<void> {
  if (!localPath) return;

  try {
    const targetPath = path.resolve(localPath);
    const root = path.resolve(rootDir);
    if ((targetPath === root || isResolvedPathContainedByRoot(root, targetPath)) && !isLocalPathStillReferenced(index, targetPath)) {
      await fs.unlink(targetPath).catch(() => {});
    }
  } catch {
    /* ignore unlink failures */
  }
}

function isIdleLikeSpriteAnimation(item: SpriteAnimation): boolean {
  const triggers = getSpriteAnimationTriggers(item.meta);
  return triggers.length === 0 || triggers.includes('idle');
}

async function readBuiltinIdleFallbackSprites(defaultIndex: SpriteIndexTarget, defaultSprites: SpriteIndex): Promise<SpriteAnimation[]> {
  if (defaultIndex.source !== 'installed' || defaultSprites.items.some(isIdleLikeSpriteAnimation)) {
    return [];
  }

  const builtinIndex = await getBuiltinSpritesIndexTarget();
  if (path.resolve(builtinIndex.indexPath) === path.resolve(defaultIndex.indexPath)) {
    return [];
  }

  const builtinSprites = await readIndex(builtinIndex.indexPath, {
    containmentRootDirs: [builtinIndex.containmentRootDir]
  });
  const idleFallback = builtinSprites.items.find((item) => hasSpriteAnimationTrigger(item.meta, 'idle')) ?? builtinSprites.items.find(isIdleLikeSpriteAnimation);
  return idleFallback ? [withDeletableFlag(idleFallback, false)] : [];
}

/** 从磁盘加载当前可见的精灵动画（内置包会合并全局用户动画，已安装角色包使用包内动画索引） */
export async function listSprites(): Promise<SpriteAnimation[]> {
  const { defaultIndex, defaultSprites, userSprites } = await readVisibleSpriteIndexes();
  // tag origin and deletable
  const withFlagsDefault = defaultSprites.items.map((it) => withDeletableFlag(it, defaultIndex.writable));
  const withFallbackIdle = await readBuiltinIdleFallbackSprites(defaultIndex, defaultSprites);
  const withFlagsUser = userSprites.items.map((it) => withDeletableFlag(it, true));
  // Merge: user overrides default on same id
  const map = new Map<string, SpriteAnimation>();
  for (const it of withFlagsDefault) map.set(it.meta.id, it);
  for (const it of withFallbackIdle) {
    if (!map.has(it.meta.id)) map.set(it.meta.id, it);
  }
  for (const it of withFlagsUser) map.set(it.meta.id, it);
  return Array.from(map.values());
}

export function initSpriteHandlers(injectedDeps: SpriteAssetsDeps): void {
  _deps = injectedDeps;

  ipcMain.handle('sprite:list', () => listSprites());

  const handleListByTrigger = async (_e: unknown, payload: SpriteListByTriggerRequest = {}): Promise<SpriteAnimation[]> => {
    const trigger = payload.trigger;
    const all = await listSprites();
    return trigger ? all.filter((a) => hasSpriteAnimationTrigger(a.meta, trigger)) : all;
  };

  ipcMain.handle('sprite:list-by-trigger', handleListByTrigger);

  ipcMain.handle('sprite:get', async (_e, payload: { id: string }) => {
    return (await listSprites()).find((item) => item.meta.id === payload.id);
  });

  ipcMain.handle('sprite:register', async (_e, payload: (Partial<SpriteAnimation> & { filePath?: string }) | { animation?: Partial<SpriteAnimation> & { filePath?: string } }) => {
    ensureAssetAuthoringCapability();

    // Support both direct payload and wrapped { animation } format
    const anim: Partial<SpriteAnimation> & { filePath?: string } = (payload as any)?.animation || payload || {};
    const srcPath = anim.filePath;
    const id = anim.meta?.id || randomUUID();
    const title = anim.meta?.title || id;
    const defaultIndex = await getDefaultSpritesIndexTarget();
    const writableIndex = await getWritableSpritesIndexTarget(defaultIndex);
    const spritesDir = path.dirname(writableIndex.indexPath);

    let finalPath: string | undefined;
    let type = anim.source?.type;
    if (srcPath && fscb.existsSync(srcPath)) {
      const ext = path.extname(srcPath) || '.webm';
      const resolvedSourcePath = path.resolve(srcPath);
      const writableRoot = path.resolve(writableIndex.containmentRootDir);
      if (resolvedSourcePath === writableRoot || isResolvedPathContainedByRoot(writableRoot, resolvedSourcePath)) {
        finalPath = resolvedSourcePath;
      } else {
        const baseName = `${id}${ext}`;
        finalPath = path.join(spritesDir, baseName);
        let counter = 1;
        while (fscb.existsSync(finalPath)) {
          finalPath = path.join(spritesDir, `${id}-${counter}${ext}`);
          counter++;
        }
        await fs.copyFile(srcPath, finalPath);
      }
      type = type || inferMimeFromExt(ext) || 'video/webm';
    } else if (anim.source?.localPath) {
      // Trust provided localPath only when it already belongs to the writable sprite asset root.
      const provided = path.resolve(anim.source.localPath);
      const writableRoot = path.resolve(writableIndex.containmentRootDir);
      if (provided === writableRoot || isResolvedPathContainedByRoot(writableRoot, provided)) {
        finalPath = provided;
      } else {
        // Reject by copying into the writable animation directory instead of referencing external locations.
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
      loopCount: anim.loopCount,
      autoIdle: anim.autoIdle ?? true,
      loopStartMs: anim.loopStartMs,
      loopEndMs: anim.loopEndMs,
      durationMs: anim.durationMs,
      movement: anim.movement
    };

    const idx = await readIndex(writableIndex.indexPath, { containmentRootDirs: getWritableIndexContainmentRoots(writableIndex, defaultIndex) });
    const existedIdx = idx.items.findIndex((i) => i.meta.id === id);
    const previousLocalPath = existedIdx >= 0 ? idx.items[existedIdx]?.source?.localPath : undefined;
    if (existedIdx >= 0) idx.items.splice(existedIdx, 1, newItem);
    else idx.items.push(newItem);
    await writeSpriteIndex(writableIndex, idx);
    if (previousLocalPath && path.resolve(previousLocalPath) !== path.resolve(finalPath!)) {
      await removeUnreferencedLocalFile(writableIndex.containmentRootDir, idx, previousLocalPath);
    }
    notifySpriteAssetsChanged({ reason: 'register', id });
    return normalizeSpriteAnimationItem(newItem);
  });

  // 从 ArrayBuffer 数据注册精灵（用于 Canvas 录制导出）
  ipcMain.handle(
    'sprite:register-from-data',
    async (
      _e,
      payload: {
        data: ArrayBuffer | Buffer;
        meta?: Partial<SpriteAnimation['meta']>;
        loopStartMs?: number;
        loopEndMs?: number;
        durationMs?: number;
        loop?: boolean;
        loopCount?: number;
        autoIdle?: boolean;
        width?: number;
        height?: number;
        padding?: number;
        movement?: SpriteAnimation['movement'];
      }
    ) => {
      ensureAssetAuthoringCapability();

      const { data, meta, loopStartMs, loopEndMs, durationMs, loop, loopCount, autoIdle, width, height, padding, movement } = payload || ({} as any);
      if (!data || !(data instanceof ArrayBuffer || Buffer.isBuffer(data))) {
        throw new Error('[sprite:register-from-data] data is required (ArrayBuffer or Buffer)');
      }

      const id = meta?.id || randomUUID();
      const title = meta?.title || id;
      const defaultIndex = await getDefaultSpritesIndexTarget();
      const writableIndex = await getWritableSpritesIndexTarget(defaultIndex);
      const spritesDir = path.dirname(writableIndex.indexPath);

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
        loop: loop ?? false,
        loopCount,
        autoIdle: autoIdle ?? true,
        loopStartMs,
        loopEndMs,
        durationMs,
        movement
      };

      const idx = await readIndex(writableIndex.indexPath, { containmentRootDirs: getWritableIndexContainmentRoots(writableIndex, defaultIndex) });
      const existedIdx = idx.items.findIndex((i) => i.meta.id === id);
      const previousLocalPath = existedIdx >= 0 ? idx.items[existedIdx]?.source?.localPath : undefined;
      if (existedIdx >= 0) idx.items.splice(existedIdx, 1, newItem);
      else idx.items.push(newItem);
      await writeSpriteIndex(writableIndex, idx);
      if (previousLocalPath && path.resolve(previousLocalPath) !== path.resolve(finalPath)) {
        await removeUnreferencedLocalFile(writableIndex.containmentRootDir, idx, previousLocalPath);
      }
      notifySpriteAssetsChanged({ reason: 'registerFromData', id });
      return normalizeSpriteAnimationItem(newItem);
    }
  );

  ipcMain.handle('sprite:remove', async (_e, payload: { id: string; deleteFile?: boolean }) => {
    ensureAssetAuthoringCapability();

    const { id, deleteFile } = payload || ({} as any);
    const defaultIndex = await getDefaultSpritesIndexTarget();
    const writableIndex = await getWritableSpritesIndexTarget(defaultIndex);
    const idx = await readIndex(writableIndex.indexPath, { containmentRootDirs: getWritableIndexContainmentRoots(writableIndex, defaultIndex) });
    const i = idx.items.findIndex((a) => a.meta.id === id);
    if (i === -1) {
      // Not removable (likely a default sprite)
      return { ok: false };
    }
    const [removed] = idx.items.splice(i, 1);
    await writeSpriteIndex(writableIndex, idx);
    notifySpriteAssetsChanged({ reason: 'remove', id });
    if (deleteFile) {
      await removeUnreferencedLocalFile(writableIndex.containmentRootDir, idx, removed?.source?.localPath);
    }
    return { ok: true };
  });

  ipcMain.handle('sprite:update-meta', async (_e, payload: { id: string; meta: Partial<SpriteAnimation['meta']> }) => {
    ensureAssetAuthoringCapability();

    const { id, meta } = payload || ({} as any);
    if (!id || !meta) return { ok: false };
    const normalizedMetaPatch = normalizeSpriteAnimationMetaPatch(meta);
    const { defaultIndex, defaultSprites, userIndex, userSprites } = await readVisibleSpriteIndexes();

    if (defaultIndex.writable) {
      const defaultIndexItem = defaultSprites.items.find((i) => i.meta.id === id);
      if (!defaultIndexItem) {
        return { ok: false };
      }

      defaultIndexItem.meta = normalizeIncomingSpriteMeta(
        {
          ...defaultIndexItem.meta,
          ...normalizedMetaPatch
        },
        {
          id: defaultIndexItem.meta.id,
          title: normalizedMetaPatch.title ?? defaultIndexItem.meta.title,
          deletable: true
        }
      );
      await writeSpriteIndex(defaultIndex, defaultSprites);
      notifySpriteAssetsChanged({ reason: 'updateMeta', id });
      return { ok: true, item: normalizeSpriteAnimationItem(defaultIndexItem) };
    }

    const userIndexItem = userSprites.items.find((i) => i.meta.id === id);
    if (userIndexItem) {
      userIndexItem.meta = normalizeIncomingSpriteMeta(
        {
          ...userIndexItem.meta,
          ...normalizedMetaPatch
        },
        {
          id: userIndexItem.meta.id,
          title: normalizedMetaPatch.title ?? userIndexItem.meta.title,
          deletable: true
        }
      );
      await writeUserIndex(userSprites);
      notifySpriteAssetsChanged({ reason: 'updateMeta', id });
      return { ok: true, item: normalizeSpriteAnimationItem(userIndexItem) };
    }
    const defItem = defaultSprites.items.find((i) => i.meta.id === id);
    if (defItem) {
      // Create an override entry in user index (do not copy file; reference same localPath)
      const newItem: SpriteAnimation = {
        ...defItem,
        meta: normalizeIncomingSpriteMeta(
          {
            ...defItem.meta,
            ...normalizedMetaPatch
          },
          {
            id: defItem.meta.id,
            title: normalizedMetaPatch.title ?? defItem.meta.title,
            deletable: true
          }
        )
      };
      const uIdx = userIndex ? await readIndex(userIndex.indexPath, { containmentRootDirs: getUserIndexContainmentRoots(userIndex, defaultIndex) }) : ({ version: 1, items: [] } satisfies SpriteIndex);
      const existed = uIdx.items.findIndex((i) => i.meta.id === id);
      if (existed >= 0) uIdx.items.splice(existed, 1, newItem);
      else uIdx.items.push(newItem);
      await writeUserIndex(uIdx);
      notifySpriteAssetsChanged({ reason: 'updateMeta', id });
      return { ok: true, item: normalizeSpriteAnimationItem(newItem) };
    }
    return { ok: false };
  });

  ipcMain.handle('sprite:update-config', async (_e, payload: { id: string; patch: SpriteAnimationConfigPatch }) => {
    ensureAssetAuthoringCapability();

    const { id, patch } = payload || ({} as any);
    if (!id || !patch) return { ok: false };

    const { defaultIndex, defaultSprites, userIndex, userSprites } = await readVisibleSpriteIndexes();

    if (defaultIndex.writable) {
      const indexItemIndex = defaultSprites.items.findIndex((i) => i.meta.id === id);
      if (indexItemIndex === -1) {
        return { ok: false };
      }

      const nextItem = applySpriteAnimationConfigPatch(defaultSprites.items[indexItemIndex], patch);
      defaultSprites.items.splice(indexItemIndex, 1, nextItem);
      await writeSpriteIndex(defaultIndex, defaultSprites);
      notifySpriteAssetsChanged({ reason: 'updateConfig', id });
      return { ok: true, item: nextItem };
    }

    const userIndexItemIndex = userSprites.items.findIndex((i) => i.meta.id === id);
    if (userIndexItemIndex >= 0) {
      const nextItem = applySpriteAnimationConfigPatch(userSprites.items[userIndexItemIndex], patch);
      userSprites.items.splice(userIndexItemIndex, 1, nextItem);
      await writeUserIndex(userSprites);
      notifySpriteAssetsChanged({ reason: 'updateConfig', id });
      return { ok: true, item: nextItem };
    }

    const defaultIndexItem = defaultSprites.items.find((i) => i.meta.id === id);
    if (defaultIndexItem) {
      const nextItem = applySpriteAnimationConfigPatch(defaultIndexItem, patch);
      const uIdx = userIndex ? await readIndex(userIndex.indexPath, { containmentRootDirs: getUserIndexContainmentRoots(userIndex, defaultIndex) }) : ({ version: 1, items: [] } satisfies SpriteIndex);
      const existed = uIdx.items.findIndex((i) => i.meta.id === id);
      if (existed >= 0) uIdx.items.splice(existed, 1, nextItem);
      else uIdx.items.push(nextItem);
      await writeUserIndex(uIdx);
      notifySpriteAssetsChanged({ reason: 'updateConfig', id });
      return { ok: true, item: nextItem };
    }

    return { ok: false };
  });
}
