import { createHash, randomUUID } from 'node:crypto';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';

import {
  type CharacterGalleryAIEditContext,
  type CharacterGalleryAIEditDraft,
  type CharacterGalleryCanvasLayout,
  type CharacterGalleryImageRef,
  type CharacterGalleryIndex,
  type CharacterGalleryItem,
  type CharacterGalleryItemDraft,
  type CharacterGalleryItemPatch,
  DEFAULT_CHARACTER_GALLERY_INDEX_PATH,
  getCharacterGalleryImageMimeFromPath,
  isSupportedCharacterGalleryImagePath,
  MAX_CHARACTER_GALLERY_AI_EDIT_REFERENCES,
  normalizeCharacterGalleryCanvasLayout,
  normalizeCharacterGalleryIndex,
  normalizeCharacterGalleryItemDraft,
  normalizeCharacterGalleryItemId,
  normalizeCharacterGalleryItemPatch
} from './character-gallery';
import { type CharacterPackSource, getActiveCharacterPack } from './character-pack-manager';
import { isResolvedPathContainedByRoot, resolvePackRelativeAssetPath } from './character-pack-paths';

export interface CharacterGalleryListResult {
  ok: true;
  pack: {
    id: string;
    name: string;
    source: CharacterPackSource;
    rootDir: string;
    writable: boolean;
  };
  indexPath: string;
  items: CharacterGalleryItem[];
}

export interface CharacterGalleryImportOptions {
  filePath: string;
  draft?: CharacterGalleryItemDraft;
}

export interface CharacterGalleryImportResult {
  ok: true;
  item: CharacterGalleryItem;
}

export interface CharacterGalleryUpdateResult {
  ok: boolean;
  item?: CharacterGalleryItem;
}

export interface CharacterGalleryRemoveResult {
  ok: boolean;
}

export interface CharacterGalleryCanvasLayoutResult {
  layout: CharacterGalleryCanvasLayout;
  ok: true;
  path: string;
  writable: boolean;
}

export interface CharacterGalleryReplaceImageOptions {
  filePath: string;
  origin?: CharacterGalleryItemPatch['origin'];
}

export interface CharacterGalleryManagerDeps {
  addAllowedResourceRoot: (root: string) => void;
}

let _deps: CharacterGalleryManagerDeps | undefined;

function deps(): CharacterGalleryManagerDeps | undefined {
  return _deps;
}

export function initCharacterGalleryManager(injectedDeps: CharacterGalleryManagerDeps): void {
  _deps = injectedDeps;
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function toForwardSlashPath(value: string): string {
  return value.split(path.sep).join('/');
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function getPackGalleryIndexPath(pack: { rootDir: string; assets?: { gallery?: string } }): string {
  const declared = typeof pack.assets?.gallery === 'string' ? pack.assets.gallery : DEFAULT_CHARACTER_GALLERY_INDEX_PATH;
  const resolved = resolvePackRelativeAssetPath(pack.rootDir, declared);
  if (!resolved) {
    return path.join(pack.rootDir, DEFAULT_CHARACTER_GALLERY_INDEX_PATH);
  }
  return path.extname(resolved).toLowerCase() === '.json' ? resolved : path.join(resolved, 'index.json');
}

function getGalleryFilesDir(indexPath: string): string {
  return path.join(path.dirname(indexPath), 'images');
}

function getGalleryThumbsDir(indexPath: string): string {
  return path.join(path.dirname(indexPath), 'thumbs');
}

function getGalleryCanvasPath(indexPath: string): string {
  return path.join(path.dirname(indexPath), 'canvas.json');
}

function isGalleryManagedFile(indexPath: string, filePath: string): boolean {
  return isResolvedPathContainedByRoot(getGalleryFilesDir(indexPath), filePath) || isResolvedPathContainedByRoot(getGalleryThumbsDir(indexPath), filePath);
}

function ensureWritablePack(pack: { source: CharacterPackSource; id: string }): void {
  if (pack.source !== 'installed') {
    throw new Error(`Character gallery can only be edited on installed packs: ${pack.id}`);
  }
}

async function getTargetPack(options?: { packId?: string; source?: CharacterPackSource }): Promise<Awaited<ReturnType<typeof getActiveCharacterPack>>> {
  if (!options?.packId?.trim()) {
    return getActiveCharacterPack();
  }

  const packs = await import('./character-pack-manager').then((mod) => mod.listCharacterPacks());
  const packId = options.packId.trim();
  return (
    packs.find((pack) => pack.id === packId && (!options.source || pack.source === options.source)) ??
    (!options.source ? packs.find((pack) => pack.id === packId && pack.source === 'installed') : undefined) ??
    (!options.source ? packs.find((pack) => pack.id === packId) : undefined) ??
    null
  );
}

async function readIndex(indexPath: string, rootDir: string): Promise<CharacterGalleryIndex> {
  try {
    const raw = JSON.parse(await fsp.readFile(indexPath, 'utf-8'));
    const normalized = normalizeCharacterGalleryIndex(raw);
    const baseDir = path.dirname(indexPath);
    return {
      ...normalized,
      items: normalized.items
        .map((item): CharacterGalleryItem | null => {
          const sourcePath = resolvePackRelativeAssetPath(rootDir, item.source.localPath) ?? resolvePackRelativeAssetPath(baseDir, item.source.localPath);
          if (!sourcePath || !isSupportedCharacterGalleryImagePath(sourcePath) || !fs.existsSync(sourcePath)) return null;
          const thumbPath = item.thumbnail?.localPath ? (resolvePackRelativeAssetPath(rootDir, item.thumbnail.localPath) ?? resolvePackRelativeAssetPath(baseDir, item.thumbnail.localPath)) : null;
          return {
            ...item,
            source: {
              ...item.source,
              localPath: sourcePath
            },
            ...(item.thumbnail && thumbPath && isSupportedCharacterGalleryImagePath(thumbPath) && fs.existsSync(thumbPath)
              ? {
                  thumbnail: {
                    ...item.thumbnail,
                    localPath: thumbPath
                  }
                }
              : {})
          };
        })
        .filter((item): item is CharacterGalleryItem => !!item)
    };
  } catch {
    return { version: 1, items: [] };
  }
}

function serializeLocalPath(rootDir: string, filePath: string): string {
  const relativePath = path.relative(rootDir, filePath);
  return toForwardSlashPath(relativePath);
}

function serializeIndexForPack(rootDir: string, index: CharacterGalleryIndex): CharacterGalleryIndex {
  return {
    version: 1,
    updatedAt: new Date().toISOString(),
    items: index.items.map((item) => ({
      ...item,
      source: {
        ...item.source,
        localPath: path.isAbsolute(item.source.localPath) ? serializeLocalPath(rootDir, item.source.localPath) : item.source.localPath
      },
      ...(item.thumbnail
        ? {
            thumbnail: {
              ...item.thumbnail,
              localPath: path.isAbsolute(item.thumbnail.localPath) ? serializeLocalPath(rootDir, item.thumbnail.localPath) : item.thumbnail.localPath
            }
          }
        : {})
    }))
  };
}

async function writeIndex(indexPath: string, rootDir: string, index: CharacterGalleryIndex): Promise<void> {
  await fsp.mkdir(path.dirname(indexPath), { recursive: true });
  await fsp.writeFile(indexPath, `${JSON.stringify(serializeIndexForPack(rootDir, index), null, 2)}\n`, 'utf-8');
}

async function readCanvasLayout(canvasPath: string): Promise<CharacterGalleryCanvasLayout> {
  try {
    return normalizeCharacterGalleryCanvasLayout(JSON.parse(await fsp.readFile(canvasPath, 'utf-8')));
  } catch {
    return { version: 1, nodes: [] };
  }
}

async function writeCanvasLayout(canvasPath: string, layout: CharacterGalleryCanvasLayout): Promise<CharacterGalleryCanvasLayout> {
  const normalized = normalizeCharacterGalleryCanvasLayout(layout);
  const next: CharacterGalleryCanvasLayout = {
    ...normalized,
    updatedAt: new Date().toISOString()
  };
  await fsp.mkdir(path.dirname(canvasPath), { recursive: true });
  await fsp.writeFile(canvasPath, `${JSON.stringify(next, null, 2)}\n`, 'utf-8');
  return next;
}

async function sha256File(filePath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = createHash('sha256');
    const input = fs.createReadStream(filePath);
    input.on('data', (chunk) => hash.update(chunk));
    input.on('error', reject);
    input.on('end', () => resolve(hash.digest('hex')));
  });
}

async function readImageMetadata(filePath: string): Promise<{ width?: number; height?: number }> {
  try {
    const sharp = (await import('sharp')).default;
    const metadata = await sharp(filePath).metadata();
    return {
      ...(typeof metadata.width === 'number' ? { width: metadata.width } : {}),
      ...(typeof metadata.height === 'number' ? { height: metadata.height } : {})
    };
  } catch {
    return {};
  }
}

async function createThumbnail(sourcePath: string, destinationPath: string): Promise<{ path: string; width?: number; height?: number; sizeBytes?: number } | null> {
  try {
    const sharp = (await import('sharp')).default;
    await fsp.mkdir(path.dirname(destinationPath), { recursive: true });
    await sharp(sourcePath).resize({ width: 512, height: 512, fit: 'inside', withoutEnlargement: true }).webp({ quality: 82 }).toFile(destinationPath);
    const [stat, metadata] = await Promise.all([fsp.stat(destinationPath), readImageMetadata(destinationPath)]);
    return {
      path: destinationPath,
      sizeBytes: stat.size,
      ...metadata
    };
  } catch (error) {
    console.warn('[character-gallery] failed to create thumbnail:', getErrorMessage(error));
    return null;
  }
}

async function buildImageRef(filePath: string): Promise<CharacterGalleryImageRef> {
  const [stat, metadata, sha256] = await Promise.all([fsp.stat(filePath), readImageMetadata(filePath), sha256File(filePath)]);
  return {
    localPath: filePath,
    type: getCharacterGalleryImageMimeFromPath(filePath) ?? 'application/octet-stream',
    sizeBytes: stat.size,
    sha256,
    ...metadata
  };
}

function getUniqueItemId(items: CharacterGalleryItem[], title: string): string {
  const baseId = normalizeCharacterGalleryItemId(title, `image-${Date.now().toString(36)}`);
  const existing = new Set(items.map((item) => item.id));
  if (!existing.has(baseId)) return baseId;
  for (let index = 2; index < 1000; index += 1) {
    const candidate = `${baseId}-${index}`;
    if (!existing.has(candidate)) return candidate;
  }
  return `${baseId}-${randomUUID().slice(0, 8)}`;
}

function getFileStem(filePath: string): string {
  return path.basename(filePath, path.extname(filePath));
}

function uniqueStrings(values: Array<string | undefined>, maxItems = 100): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const normalized = typeof value === 'string' ? value.trim() : '';
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    result.push(normalized);
    if (result.length >= maxItems) break;
  }
  return result;
}

function normalizeAIEditItemIds(value: unknown): string[] {
  return uniqueStrings(Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === 'string') : [], MAX_CHARACTER_GALLERY_AI_EDIT_REFERENCES);
}

function formatReferenceImageLine(item: CharacterGalleryAIEditContext['images'][number], index: number): string {
  const details = [
    item.semantic?.action ? `action=${item.semantic.action}` : '',
    item.semantic?.view ? `view=${item.semantic.view}` : '',
    item.semantic?.emotion ? `emotion=${item.semantic.emotion}` : '',
    item.referenceRole ? `role=${item.referenceRole}` : '',
    item.tags.length ? `tags=${item.tags.join(', ')}` : '',
    item.promptHint ? `hint=${item.promptHint}` : ''
  ]
    .filter(Boolean)
    .join('; ');
  return `${index + 1}. ${item.title} (${item.id})${details ? `: ${details}` : ''}`;
}

function buildReferenceGroups(images: CharacterGalleryAIEditContext['images']): CharacterGalleryAIEditContext['groups'] {
  const groups = new Map<string, CharacterGalleryAIEditContext['groups'][number]>();
  const add = (kind: CharacterGalleryAIEditContext['groups'][number]['kind'], key: string | undefined, labelPrefix: string, itemId: string): void => {
    const normalized = key?.trim();
    if (!normalized) return;
    const groupKey = `${kind}:${normalized}`;
    const current =
      groups.get(groupKey) ??
      ({
        count: 0,
        itemIds: [],
        key: normalized,
        kind,
        label: `${labelPrefix}：${normalized}`
      } satisfies CharacterGalleryAIEditContext['groups'][number]);
    current.count += 1;
    current.itemIds.push(itemId);
    groups.set(groupKey, current);
  };

  for (const image of images) {
    add('action', image.semantic?.action, '动作', image.id);
    add('view', image.semantic?.view, '角度', image.id);
    add('role', image.referenceRole, '参考角色', image.id);
    add('kind', image.kind, '类型', image.id);
  }

  return Array.from(groups.values()).sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
}

function getDestinationImagePath(indexPath: string, itemId: string, sourcePath: string): string {
  const ext = path.extname(sourcePath).toLowerCase() || '.png';
  return path.join(getGalleryFilesDir(indexPath), `${itemId}${ext}`);
}

async function copyImageIntoGallery(indexPath: string, rootDir: string, itemId: string, sourcePath: string): Promise<string> {
  const resolvedSourcePath = path.resolve(sourcePath);
  if (!isSupportedCharacterGalleryImagePath(resolvedSourcePath)) {
    throw new Error(`Unsupported gallery image file type: ${sourcePath}`);
  }
  if (!fs.existsSync(resolvedSourcePath) || !(await fsp.stat(resolvedSourcePath)).isFile()) {
    throw new Error(`Gallery image not found: ${sourcePath}`);
  }

  const destination = getDestinationImagePath(indexPath, itemId, resolvedSourcePath);
  await fsp.mkdir(path.dirname(destination), { recursive: true });

  if (isResolvedPathContainedByRoot(rootDir, resolvedSourcePath) && path.resolve(resolvedSourcePath) === path.resolve(destination)) {
    return resolvedSourcePath;
  }

  if (path.resolve(resolvedSourcePath) !== path.resolve(destination)) {
    await fsp.copyFile(resolvedSourcePath, destination);
  }
  return destination;
}

async function removeUnreferencedFile(rootDir: string, indexPath: string, items: CharacterGalleryItem[], filePath?: string): Promise<void> {
  if (!filePath) return;
  const resolved = path.resolve(filePath);
  if (!isResolvedPathContainedByRoot(rootDir, resolved)) return;
  if (!isGalleryManagedFile(indexPath, resolved)) return;

  const stillReferenced = items.some((item) => {
    const source = path.resolve(item.source.localPath) === resolved;
    const thumb = item.thumbnail?.localPath ? path.resolve(item.thumbnail.localPath) === resolved : false;
    return source || thumb;
  });
  if (!stillReferenced) {
    await fsp.rm(resolved, { force: true }).catch(() => undefined);
  }
}

function itemMatchesQuery(item: CharacterGalleryItem, query: string): boolean {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return true;
  const haystack = [
    item.id,
    item.title,
    item.description,
    item.kind,
    item.semantic?.action,
    item.semantic?.view,
    item.semantic?.emotion,
    item.semantic?.propName,
    item.semantic?.customLabel,
    item.ai?.promptHint,
    ...(item.tags ?? [])
  ]
    .filter((value): value is string => typeof value === 'string')
    .join('\n')
    .toLowerCase();
  return haystack.includes(normalized);
}

export async function listCharacterGalleryItems(options?: { packId?: string; source?: CharacterPackSource; query?: string }): Promise<CharacterGalleryListResult | null> {
  const pack = await getTargetPack(options);
  if (!pack) return null;

  const indexPath = getPackGalleryIndexPath(pack);
  deps()?.addAllowedResourceRoot(pack.rootDir);
  const index = await readIndex(indexPath, pack.rootDir);
  const query = options?.query?.trim() ?? '';

  return {
    ok: true,
    pack: {
      id: pack.id,
      name: pack.name,
      source: pack.source,
      rootDir: pack.rootDir,
      writable: pack.source === 'installed'
    },
    indexPath,
    items: query ? index.items.filter((item) => itemMatchesQuery(item, query)) : index.items
  };
}

export async function getCharacterGalleryCanvasLayout(options?: { packId?: string; source?: CharacterPackSource }): Promise<CharacterGalleryCanvasLayoutResult | null> {
  const pack = await getTargetPack(options);
  if (!pack) return null;
  const indexPath = getPackGalleryIndexPath(pack);
  const canvasPath = getGalleryCanvasPath(indexPath);
  const layout = await readCanvasLayout(canvasPath);
  return {
    ok: true,
    path: canvasPath,
    writable: pack.source === 'installed',
    layout
  };
}

export async function saveCharacterGalleryCanvasLayout(
  layout: CharacterGalleryCanvasLayout,
  options?: { packId?: string; source?: CharacterPackSource }
): Promise<CharacterGalleryCanvasLayoutResult | null> {
  const pack = await getTargetPack(options);
  if (!pack) return null;
  ensureWritablePack(pack);
  const indexPath = getPackGalleryIndexPath(pack);
  const canvasPath = getGalleryCanvasPath(indexPath);
  const next = await writeCanvasLayout(canvasPath, layout);
  return {
    ok: true,
    path: canvasPath,
    writable: true,
    layout: next
  };
}

export async function importCharacterGalleryItem(options: CharacterGalleryImportOptions & { packId?: string; source?: CharacterPackSource }): Promise<CharacterGalleryImportResult> {
  const pack = await getTargetPack(options);
  if (!pack) {
    throw new Error('No active character pack available for gallery import');
  }
  ensureWritablePack(pack);

  const indexPath = getPackGalleryIndexPath(pack);
  const index = await readIndex(indexPath, pack.rootDir);
  const draft = normalizeCharacterGalleryItemDraft(options.draft, getFileStem(options.filePath));
  const id = getUniqueItemId(index.items, draft.title ?? getFileStem(options.filePath));
  const copiedPath = await copyImageIntoGallery(indexPath, pack.rootDir, id, options.filePath);
  const sourceRef = await buildImageRef(copiedPath);
  const thumb = await createThumbnail(copiedPath, path.join(getGalleryThumbsDir(indexPath), `${id}.webp`));
  const now = new Date().toISOString();
  const item: CharacterGalleryItem = {
    id,
    title: draft.title || getFileStem(options.filePath),
    ...(draft.description ? { description: draft.description } : {}),
    kind: draft.kind ?? 'reference',
    ...(draft.semantic ? { semantic: draft.semantic } : {}),
    ...(draft.tags && draft.tags.length > 0 ? { tags: draft.tags } : {}),
    source: sourceRef,
    ...(thumb
      ? {
          thumbnail: {
            localPath: thumb.path,
            type: 'image/webp',
            ...(thumb.width ? { width: thumb.width } : {}),
            ...(thumb.height ? { height: thumb.height } : {}),
            ...(thumb.sizeBytes ? { sizeBytes: thumb.sizeBytes } : {})
          }
        }
      : {}),
    ...(draft.ai ? { ai: draft.ai } : {}),
    origin: {
      type: 'import',
      sourceName: path.basename(options.filePath)
    },
    createdAt: now,
    updatedAt: now
  };

  index.items.push(item);
  await writeIndex(indexPath, pack.rootDir, index);
  deps()?.addAllowedResourceRoot(pack.rootDir);
  return { ok: true, item };
}

export async function updateCharacterGalleryItem(itemId: string, patch: CharacterGalleryItemPatch, options?: { packId?: string; source?: CharacterPackSource }): Promise<CharacterGalleryUpdateResult> {
  const pack = await getTargetPack(options);
  if (!pack) return { ok: false };
  ensureWritablePack(pack);

  const indexPath = getPackGalleryIndexPath(pack);
  const index = await readIndex(indexPath, pack.rootDir);
  const itemIndex = index.items.findIndex((item) => item.id === itemId);
  if (itemIndex === -1) return { ok: false };

  const normalizedPatch = normalizeCharacterGalleryItemPatch(patch);
  const current = index.items[itemIndex];
  const next: CharacterGalleryItem = {
    ...current,
    ...(normalizedPatch.title !== undefined ? { title: normalizedPatch.title.trim() || current.title } : {}),
    ...(normalizedPatch.description !== undefined ? (normalizedPatch.description ? { description: normalizedPatch.description } : { description: undefined }) : {}),
    ...(normalizedPatch.kind !== undefined ? { kind: normalizedPatch.kind } : {}),
    ...(Object.prototype.hasOwnProperty.call(normalizedPatch, 'semantic') ? (normalizedPatch.semantic ? { semantic: normalizedPatch.semantic } : { semantic: undefined }) : {}),
    ...(normalizedPatch.tags !== undefined ? (normalizedPatch.tags.length > 0 ? { tags: normalizedPatch.tags } : { tags: undefined }) : {}),
    ...(Object.prototype.hasOwnProperty.call(normalizedPatch, 'ai') ? (normalizedPatch.ai ? { ai: normalizedPatch.ai } : { ai: undefined }) : {}),
    ...(Object.prototype.hasOwnProperty.call(normalizedPatch, 'origin') ? (normalizedPatch.origin ? { origin: normalizedPatch.origin } : { origin: undefined }) : {}),
    updatedAt: new Date().toISOString()
  };

  index.items.splice(itemIndex, 1, next);
  await writeIndex(indexPath, pack.rootDir, index);
  return { ok: true, item: next };
}

export async function replaceCharacterGalleryItemImage(
  itemId: string,
  replaceOptions: CharacterGalleryReplaceImageOptions,
  options?: { packId?: string; source?: CharacterPackSource }
): Promise<CharacterGalleryUpdateResult> {
  const pack = await getTargetPack(options);
  if (!pack) return { ok: false };
  ensureWritablePack(pack);

  const indexPath = getPackGalleryIndexPath(pack);
  const index = await readIndex(indexPath, pack.rootDir);
  const itemIndex = index.items.findIndex((item) => item.id === itemId);
  if (itemIndex === -1) return { ok: false };

  const current = index.items[itemIndex];
  const previousSource = current.source.localPath;
  const previousThumb = current.thumbnail?.localPath;
  const copiedPath = await copyImageIntoGallery(indexPath, pack.rootDir, itemId, replaceOptions.filePath);
  const sourceRef = await buildImageRef(copiedPath);
  const thumb = await createThumbnail(copiedPath, path.join(getGalleryThumbsDir(indexPath), `${itemId}.webp`));
  const next: CharacterGalleryItem = {
    ...current,
    source: sourceRef,
    thumbnail: thumb
      ? {
          localPath: thumb.path,
          type: 'image/webp',
          ...(thumb.width ? { width: thumb.width } : {}),
          ...(thumb.height ? { height: thumb.height } : {}),
          ...(thumb.sizeBytes ? { sizeBytes: thumb.sizeBytes } : {})
        }
      : undefined,
    ...(replaceOptions.origin ? { origin: normalizeCharacterGalleryItemPatch({ origin: replaceOptions.origin }).origin ?? current.origin } : {}),
    updatedAt: new Date().toISOString()
  };

  index.items.splice(itemIndex, 1, next);
  await writeIndex(indexPath, pack.rootDir, index);
  await removeUnreferencedFile(pack.rootDir, indexPath, index.items, previousSource);
  await removeUnreferencedFile(pack.rootDir, indexPath, index.items, previousThumb);
  return { ok: true, item: next };
}

export async function removeCharacterGalleryItem(itemId: string, options?: { packId?: string; source?: CharacterPackSource; deleteFile?: boolean }): Promise<CharacterGalleryRemoveResult> {
  const pack = await getTargetPack(options);
  if (!pack) return { ok: false };
  ensureWritablePack(pack);

  const indexPath = getPackGalleryIndexPath(pack);
  const index = await readIndex(indexPath, pack.rootDir);
  const itemIndex = index.items.findIndex((item) => item.id === itemId);
  if (itemIndex === -1) return { ok: false };

  const [removed] = index.items.splice(itemIndex, 1);
  const now = new Date().toISOString();
  index.items = index.items.map((item) => {
    if (item.origin?.parentId !== itemId) return item;
    return {
      ...item,
      origin: {
        ...item.origin,
        parentId: undefined
      },
      updatedAt: now
    };
  });
  await writeIndex(indexPath, pack.rootDir, index);
  if (options?.deleteFile !== false) {
    await removeUnreferencedFile(pack.rootDir, indexPath, index.items, removed?.source.localPath);
    await removeUnreferencedFile(pack.rootDir, indexPath, index.items, removed?.thumbnail?.localPath);
  }
  return { ok: true };
}

export async function buildCharacterGalleryAIEditContext(draft: CharacterGalleryAIEditDraft, options?: { packId?: string; source?: CharacterPackSource }): Promise<CharacterGalleryAIEditContext> {
  const prompt = typeof draft.prompt === 'string' ? draft.prompt.trim() : '';
  if (!prompt) {
    throw new Error('AI edit prompt is required');
  }

  const pack = await getTargetPack(options);
  if (!pack) {
    throw new Error('No character pack available for gallery AI edit context');
  }

  const indexPath = getPackGalleryIndexPath(pack);
  const index = await readIndex(indexPath, pack.rootDir);
  const itemIds = normalizeAIEditItemIds(draft.itemIds);
  if (itemIds.length === 0) {
    throw new Error('At least one gallery reference image is required');
  }
  const requestedIds = new Set(itemIds);
  const images = index.items
    .filter((item) => requestedIds.has(item.id))
    .map((item) => ({
      id: item.id,
      title: item.title,
      kind: item.kind,
      localPath: item.source.localPath,
      mimeType: item.source.type,
      ...(item.source.width ? { width: item.source.width } : {}),
      ...(item.source.height ? { height: item.source.height } : {}),
      tags: item.tags ?? [],
      ...(item.semantic ? { semantic: item.semantic } : {}),
      ...(item.ai ? { ai: item.ai } : {}),
      referenceRole: item.ai?.referenceRole ?? 'character',
      ...(typeof item.ai?.referenceStrength === 'number' ? { referenceStrength: item.ai.referenceStrength } : {}),
      preserveIdentity: item.ai?.preserveIdentity ?? true,
      ...(item.ai?.promptHint ? { promptHint: item.ai.promptHint } : {}),
      ...(item.ai?.negativePrompt ? { negativePrompt: item.ai.negativePrompt } : {})
    }));
  const foundIds = new Set(images.map((image) => image.id));
  const missingIds = itemIds.filter((itemId) => !foundIds.has(itemId));
  if (missingIds.length > 0) {
    throw new Error(`Gallery reference images not found: ${missingIds.join(', ')}`);
  }

  const promptHints = uniqueStrings(
    images.map((image) => image.promptHint),
    MAX_CHARACTER_GALLERY_AI_EDIT_REFERENCES
  );
  const ownNegativePrompt = typeof draft.negativePrompt === 'string' && draft.negativePrompt.trim() ? draft.negativePrompt.trim() : undefined;
  const negativePrompts = uniqueStrings(
    images.map((image) => image.negativePrompt),
    MAX_CHARACTER_GALLERY_AI_EDIT_REFERENCES
  );
  const referencesSummaryLines = images.map(formatReferenceImageLine);
  const referencesSummary = referencesSummaryLines.join('\n');
  const combinedPrompt = [prompt, referencesSummary ? `参考图集：\n${referencesSummary}` : '', promptHints.length ? `参考提示：${promptHints.join('；')}` : ''].filter(Boolean).join('\n\n');
  const combinedNegativePrompt = uniqueStrings([ownNegativePrompt, ...negativePrompts]).join('\n') || undefined;
  const actions = uniqueStrings(
    images.map((image) => image.semantic?.action),
    MAX_CHARACTER_GALLERY_AI_EDIT_REFERENCES
  );
  const views = uniqueStrings(
    images.map((image) => image.semantic?.view),
    MAX_CHARACTER_GALLERY_AI_EDIT_REFERENCES
  ) as CharacterGalleryAIEditContext['referenceSet']['views'];
  const roles = uniqueStrings(
    images.map((image) => image.referenceRole),
    MAX_CHARACTER_GALLERY_AI_EDIT_REFERENCES
  ) as CharacterGalleryAIEditContext['referenceSet']['roles'];
  const tags = uniqueStrings(
    images.flatMap((image) => image.tags),
    32
  );
  const groups = buildReferenceGroups(images);

  return {
    images,
    prompt,
    ...(ownNegativePrompt ? { negativePrompt: ownNegativePrompt } : {}),
    combinedPrompt,
    ...(combinedNegativePrompt ? { combinedNegativePrompt } : {}),
    groups,
    referenceSet: {
      actions,
      imageCount: images.length,
      itemIds,
      negativePrompts,
      promptHints,
      roles,
      summary: `${images.length} reference image${images.length === 1 ? '' : 's'}${actions.length ? `; actions: ${actions.join(', ')}` : ''}${views.length ? `; views: ${views.join(', ')}` : ''}`,
      tags,
      views
    },
    referencesSummary
  };
}

export function hasCharacterGalleryDeclaration(value: unknown): boolean {
  return isPlainObject(value) && isPlainObject(value.assets) && typeof value.assets.gallery === 'string' && value.assets.gallery.trim().length > 0;
}
