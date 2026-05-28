export const CHARACTER_GALLERY_INDEX_VERSION = 1;
export const DEFAULT_CHARACTER_GALLERY_INDEX_PATH = 'gallery/index.json';

export const CHARACTER_GALLERY_ITEM_KINDS = ['pose', 'action', 'expression', 'prop', 'outfit', 'reference', 'background', 'custom'] as const;
export type CharacterGalleryItemKind = (typeof CHARACTER_GALLERY_ITEM_KINDS)[number];

export const CHARACTER_GALLERY_VIEW_ANGLES = ['front', 'back', 'left', 'right', 'three-quarter-left', 'three-quarter-right', 'top', 'bottom', 'custom'] as const;
export type CharacterGalleryViewAngle = (typeof CHARACTER_GALLERY_VIEW_ANGLES)[number];

export const CHARACTER_GALLERY_REFERENCE_ROLES = ['character', 'pose', 'style', 'prop', 'background', 'storyboard', 'custom'] as const;
export type CharacterGalleryReferenceRole = (typeof CHARACTER_GALLERY_REFERENCE_ROLES)[number];

export type CharacterGalleryOriginType = 'import' | 'ai-generated' | 'ai-edited' | 'derived' | 'pack-author';

export interface CharacterGallerySemantic {
  action?: string;
  view?: CharacterGalleryViewAngle;
  emotion?: string;
  propName?: string;
  customLabel?: string;
}

export interface CharacterGalleryAIHints {
  referenceRole?: CharacterGalleryReferenceRole;
  preserveIdentity?: boolean;
  referenceStrength?: number;
  promptHint?: string;
  negativePrompt?: string;
}

export interface CharacterGalleryImageRef {
  height?: number;
  localPath: string;
  sha256?: string;
  sizeBytes?: number;
  type: string;
  width?: number;
}

export interface CharacterGalleryItemOrigin {
  type: CharacterGalleryOriginType;
  parentId?: string;
  model?: string;
  prompt?: string;
  sourceName?: string;
}

export interface CharacterGalleryItem {
  id: string;
  title: string;
  description?: string;
  kind: CharacterGalleryItemKind;
  semantic?: CharacterGallerySemantic;
  tags?: string[];
  source: CharacterGalleryImageRef;
  thumbnail?: CharacterGalleryImageRef;
  ai?: CharacterGalleryAIHints;
  origin?: CharacterGalleryItemOrigin;
  createdAt: string;
  updatedAt: string;
}

export interface CharacterGalleryIndex {
  version: 1;
  updatedAt?: string;
  items: CharacterGalleryItem[];
}

export interface CharacterGalleryItemDraft {
  title?: string;
  description?: string;
  kind?: CharacterGalleryItemKind;
  semantic?: CharacterGallerySemantic;
  tags?: string[];
  ai?: CharacterGalleryAIHints;
}

export interface CharacterGalleryItemPatch extends CharacterGalleryItemDraft {
  origin?: CharacterGalleryItemOrigin;
}

export interface CharacterGalleryAIEditContext {
  images: Array<{
    id: string;
    title: string;
    kind: CharacterGalleryItemKind;
    localPath: string;
    mimeType: string;
    width?: number;
    height?: number;
    tags: string[];
    semantic?: CharacterGallerySemantic;
    ai?: CharacterGalleryAIHints;
  }>;
  prompt: string;
  negativePrompt?: string;
}

export interface CharacterGalleryCanvasDraft {
  action?: string;
  emotion?: string;
  kind?: CharacterGalleryItemKind;
  modelId?: string;
  negativePrompt?: string;
  outputFormat?: 'png' | 'webp' | 'jpeg';
  prompt?: string;
  providerId?: string;
  providerPresetId?: string;
  quality?: string;
  referenceRole?: CharacterGalleryReferenceRole;
  size?: string;
  tags?: string;
  title?: string;
  view?: CharacterGalleryViewAngle | '';
}

export interface CharacterGalleryCanvasNodeLayout {
  assetId?: string;
  draft?: CharacterGalleryCanvasDraft & {
    mode?: 'generate' | 'edit';
    referenceAssetId?: string;
  };
  id: string;
  x: number;
  y: number;
}

export interface CharacterGalleryCanvasLayout {
  nodes: CharacterGalleryCanvasNodeLayout[];
  updatedAt?: string;
  version: 1;
  viewport?: {
    x: number;
    y: number;
    zoom: number;
  };
}

const KIND_SET = new Set<string>(CHARACTER_GALLERY_ITEM_KINDS);
const VIEW_ANGLE_SET = new Set<string>(CHARACTER_GALLERY_VIEW_ANGLES);
const REFERENCE_ROLE_SET = new Set<string>(CHARACTER_GALLERY_REFERENCE_ROLES);
const SUPPORTED_IMAGE_MIME_BY_EXT: Record<string, string> = {
  '.gif': 'image/gif',
  '.jpeg': 'image/jpeg',
  '.jpg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp'
};

function getPathExtension(filePath: string): string {
  const normalized = filePath.split(/[?#]/, 1)[0]?.replace(/\\/g, '/') ?? '';
  const fileName = normalized.slice(normalized.lastIndexOf('/') + 1);
  const dotIndex = fileName.lastIndexOf('.');
  return dotIndex > 0 ? fileName.slice(dotIndex).toLowerCase() : '';
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function normalizeOptionalString(value: unknown, maxLength = 300): string | undefined {
  if (typeof value !== 'string') return undefined;
  const normalized = value.trim().slice(0, maxLength);
  return normalized || undefined;
}

function normalizeStringList(value: unknown, options?: { maxItems?: number; maxLength?: number }): string[] {
  const maxItems = options?.maxItems ?? 32;
  const maxLength = options?.maxLength ?? 80;
  const source = Array.isArray(value) ? value : typeof value === 'string' ? value.split(/[\n,，]/) : [];
  const seen = new Set<string>();
  const result: string[] = [];

  for (const entry of source) {
    const normalized = typeof entry === 'string' ? entry.trim().slice(0, maxLength) : '';
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    result.push(normalized);
    if (result.length >= maxItems) break;
  }

  return result;
}

function normalizePositiveInteger(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? Math.trunc(value) : undefined;
}

function normalizeNonNegativeNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : undefined;
}

export function getCharacterGalleryImageMimeFromPath(filePath: string): string | undefined {
  return SUPPORTED_IMAGE_MIME_BY_EXT[getPathExtension(filePath)];
}

export function isSupportedCharacterGalleryImagePath(filePath: string): boolean {
  return !!getCharacterGalleryImageMimeFromPath(filePath);
}

export function normalizeCharacterGalleryItemId(value: unknown, fallback = 'gallery-image'): string {
  const normalized = typeof value === 'string' ? value.trim().toLowerCase() : '';
  const slug = normalized
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^[^a-z0-9]+/, '')
    .replace(/[^a-z0-9]+$/, '')
    .slice(0, 64);
  return slug || fallback;
}

export function normalizeCharacterGalleryKind(value: unknown): CharacterGalleryItemKind {
  return typeof value === 'string' && KIND_SET.has(value) ? (value as CharacterGalleryItemKind) : 'reference';
}

export function normalizeCharacterGallerySemantic(value: unknown): CharacterGallerySemantic | undefined {
  if (!isPlainObject(value)) return undefined;

  const view = typeof value.view === 'string' && VIEW_ANGLE_SET.has(value.view) ? (value.view as CharacterGalleryViewAngle) : undefined;
  const semantic: CharacterGallerySemantic = {
    ...(normalizeOptionalString(value.action, 80) ? { action: normalizeOptionalString(value.action, 80) } : {}),
    ...(view ? { view } : {}),
    ...(normalizeOptionalString(value.emotion, 80) ? { emotion: normalizeOptionalString(value.emotion, 80) } : {}),
    ...(normalizeOptionalString(value.propName, 80) ? { propName: normalizeOptionalString(value.propName, 80) } : {}),
    ...(normalizeOptionalString(value.customLabel, 80) ? { customLabel: normalizeOptionalString(value.customLabel, 80) } : {})
  };

  return Object.keys(semantic).length > 0 ? semantic : undefined;
}

export function normalizeCharacterGalleryAIHints(value: unknown): CharacterGalleryAIHints | undefined {
  if (!isPlainObject(value)) return undefined;

  const referenceRole = typeof value.referenceRole === 'string' && REFERENCE_ROLE_SET.has(value.referenceRole) ? (value.referenceRole as CharacterGalleryReferenceRole) : undefined;
  const referenceStrength = normalizeNonNegativeNumber(value.referenceStrength);
  const ai: CharacterGalleryAIHints = {
    ...(referenceRole ? { referenceRole } : {}),
    ...(typeof value.preserveIdentity === 'boolean' ? { preserveIdentity: value.preserveIdentity } : {}),
    ...(referenceStrength !== undefined ? { referenceStrength: Math.min(1, referenceStrength) } : {}),
    ...(normalizeOptionalString(value.promptHint, 800) ? { promptHint: normalizeOptionalString(value.promptHint, 800) } : {}),
    ...(normalizeOptionalString(value.negativePrompt, 800) ? { negativePrompt: normalizeOptionalString(value.negativePrompt, 800) } : {})
  };

  return Object.keys(ai).length > 0 ? ai : undefined;
}

export function normalizeCharacterGalleryOrigin(value: unknown): CharacterGalleryItemOrigin | undefined {
  if (!isPlainObject(value)) return undefined;
  const type = typeof value.type === 'string' ? value.type : '';
  if (!['import', 'ai-generated', 'ai-edited', 'derived', 'pack-author'].includes(type)) {
    return undefined;
  }

  return {
    type: type as CharacterGalleryOriginType,
    ...(normalizeOptionalString(value.parentId, 80) ? { parentId: normalizeOptionalString(value.parentId, 80) } : {}),
    ...(normalizeOptionalString(value.model, 120) ? { model: normalizeOptionalString(value.model, 120) } : {}),
    ...(normalizeOptionalString(value.prompt, 2000) ? { prompt: normalizeOptionalString(value.prompt, 2000) } : {}),
    ...(normalizeOptionalString(value.sourceName, 240) ? { sourceName: normalizeOptionalString(value.sourceName, 240) } : {})
  };
}

function normalizeImageRef(value: unknown): CharacterGalleryImageRef | null {
  if (!isPlainObject(value) || typeof value.localPath !== 'string' || !value.localPath.trim()) {
    return null;
  }

  const type = typeof value.type === 'string' && value.type.trim() ? value.type.trim().slice(0, 80) : (getCharacterGalleryImageMimeFromPath(value.localPath) ?? 'application/octet-stream');
  return {
    localPath: value.localPath.trim(),
    type,
    ...(normalizePositiveInteger(value.width) ? { width: normalizePositiveInteger(value.width) } : {}),
    ...(normalizePositiveInteger(value.height) ? { height: normalizePositiveInteger(value.height) } : {}),
    ...(normalizePositiveInteger(value.sizeBytes) ? { sizeBytes: normalizePositiveInteger(value.sizeBytes) } : {}),
    ...(normalizeOptionalString(value.sha256, 80) ? { sha256: normalizeOptionalString(value.sha256, 80) } : {})
  };
}

export function normalizeCharacterGalleryItem(value: unknown): CharacterGalleryItem | null {
  if (!isPlainObject(value)) return null;
  const source = normalizeImageRef(value.source);
  if (!source) return null;

  const id = normalizeCharacterGalleryItemId(value.id, '');
  const title = normalizeOptionalString(value.title, 120);
  if (!id || !title) return null;

  const thumbnail = normalizeImageRef(value.thumbnail);
  const tags = normalizeStringList(value.tags, { maxItems: 32, maxLength: 60 });
  const semantic = normalizeCharacterGallerySemantic(value.semantic);
  const ai = normalizeCharacterGalleryAIHints(value.ai);
  const origin = normalizeCharacterGalleryOrigin(value.origin);
  const createdAt = normalizeOptionalString(value.createdAt, 40) ?? new Date(0).toISOString();
  const updatedAt = normalizeOptionalString(value.updatedAt, 40) ?? createdAt;

  return {
    id,
    title,
    ...(normalizeOptionalString(value.description, 500) ? { description: normalizeOptionalString(value.description, 500) } : {}),
    kind: normalizeCharacterGalleryKind(value.kind),
    ...(semantic ? { semantic } : {}),
    ...(tags.length > 0 ? { tags } : {}),
    source,
    ...(thumbnail ? { thumbnail } : {}),
    ...(ai ? { ai } : {}),
    ...(origin ? { origin } : {}),
    createdAt,
    updatedAt
  };
}

export function normalizeCharacterGalleryIndex(value: unknown): CharacterGalleryIndex {
  if (!isPlainObject(value)) {
    return { version: CHARACTER_GALLERY_INDEX_VERSION, items: [] };
  }

  const items = Array.isArray(value.items) ? value.items.map(normalizeCharacterGalleryItem).filter((item): item is CharacterGalleryItem => !!item) : [];
  return {
    version: CHARACTER_GALLERY_INDEX_VERSION,
    ...(normalizeOptionalString(value.updatedAt, 40) ? { updatedAt: normalizeOptionalString(value.updatedAt, 40) } : {}),
    items
  };
}

export function normalizeCharacterGalleryItemDraft(value: unknown, fallbackTitle: string): CharacterGalleryItemDraft {
  const source = isPlainObject(value) ? value : {};
  const fallback = fallbackTitle.trim().slice(0, 120) || '未命名图片';
  const title = normalizeOptionalString(source.title, 120) ?? fallback;
  const tags = normalizeStringList(source.tags, { maxItems: 32, maxLength: 60 });
  const semantic = normalizeCharacterGallerySemantic(source.semantic);
  const ai = normalizeCharacterGalleryAIHints(source.ai);

  return {
    title,
    ...(normalizeOptionalString(source.description, 500) ? { description: normalizeOptionalString(source.description, 500) } : {}),
    kind: normalizeCharacterGalleryKind(source.kind),
    ...(semantic ? { semantic } : {}),
    ...(tags.length > 0 ? { tags } : {}),
    ...(ai ? { ai } : {})
  };
}

export function normalizeCharacterGalleryItemPatch(value: unknown): CharacterGalleryItemPatch {
  const source = isPlainObject(value) ? value : {};
  const tags = Object.prototype.hasOwnProperty.call(source, 'tags') ? normalizeStringList(source.tags, { maxItems: 32, maxLength: 60 }) : undefined;

  return {
    ...(Object.prototype.hasOwnProperty.call(source, 'title') ? { title: normalizeOptionalString(source.title, 120) ?? '' } : {}),
    ...(Object.prototype.hasOwnProperty.call(source, 'description') ? { description: normalizeOptionalString(source.description, 500) ?? '' } : {}),
    ...(Object.prototype.hasOwnProperty.call(source, 'kind') ? { kind: normalizeCharacterGalleryKind(source.kind) } : {}),
    ...(Object.prototype.hasOwnProperty.call(source, 'semantic') ? { semantic: normalizeCharacterGallerySemantic(source.semantic) } : {}),
    ...(tags !== undefined ? { tags } : {}),
    ...(Object.prototype.hasOwnProperty.call(source, 'ai') ? { ai: normalizeCharacterGalleryAIHints(source.ai) } : {}),
    ...(Object.prototype.hasOwnProperty.call(source, 'origin') ? { origin: normalizeCharacterGalleryOrigin(source.origin) } : {})
  };
}

function normalizeCanvasNumber(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function normalizeCharacterGalleryCanvasDraft(value: unknown): CharacterGalleryCanvasDraft | undefined {
  if (!isPlainObject(value)) return undefined;
  const outputFormat = typeof value.outputFormat === 'string' && ['png', 'webp', 'jpeg'].includes(value.outputFormat) ? (value.outputFormat as 'png' | 'webp' | 'jpeg') : undefined;
  const view = typeof value.view === 'string' && (value.view === '' || VIEW_ANGLE_SET.has(value.view)) ? (value.view as CharacterGalleryViewAngle | '') : undefined;
  const referenceRole = typeof value.referenceRole === 'string' && REFERENCE_ROLE_SET.has(value.referenceRole) ? (value.referenceRole as CharacterGalleryReferenceRole) : undefined;
  const kind = typeof value.kind === 'string' && KIND_SET.has(value.kind) ? (value.kind as CharacterGalleryItemKind) : undefined;
  const draft: CharacterGalleryCanvasDraft = {
    ...(normalizeOptionalString(value.action, 80) ? { action: normalizeOptionalString(value.action, 80) } : {}),
    ...(normalizeOptionalString(value.emotion, 80) ? { emotion: normalizeOptionalString(value.emotion, 80) } : {}),
    ...(kind ? { kind } : {}),
    ...(normalizeOptionalString(value.modelId, 120) ? { modelId: normalizeOptionalString(value.modelId, 120) } : {}),
    ...(normalizeOptionalString(value.negativePrompt, 800) ? { negativePrompt: normalizeOptionalString(value.negativePrompt, 800) } : {}),
    ...(outputFormat ? { outputFormat } : {}),
    ...(normalizeOptionalString(value.prompt, 2000) ? { prompt: normalizeOptionalString(value.prompt, 2000) } : {}),
    ...(normalizeOptionalString(value.providerId, 80) ? { providerId: normalizeOptionalString(value.providerId, 80) } : {}),
    ...(normalizeOptionalString(value.providerPresetId, 120) ? { providerPresetId: normalizeOptionalString(value.providerPresetId, 120) } : {}),
    ...(normalizeOptionalString(value.quality, 40) ? { quality: normalizeOptionalString(value.quality, 40) } : {}),
    ...(referenceRole ? { referenceRole } : {}),
    ...(normalizeOptionalString(value.size, 40) ? { size: normalizeOptionalString(value.size, 40) } : {}),
    ...(normalizeOptionalString(value.tags, 1000) ? { tags: normalizeOptionalString(value.tags, 1000) } : {}),
    ...(normalizeOptionalString(value.title, 120) ? { title: normalizeOptionalString(value.title, 120) } : {}),
    ...(view !== undefined ? { view } : {})
  };
  return Object.keys(draft).length > 0 ? draft : undefined;
}

export function normalizeCharacterGalleryCanvasLayout(value: unknown): CharacterGalleryCanvasLayout {
  if (!isPlainObject(value)) {
    return { version: 1, nodes: [] };
  }

  const nodes = Array.isArray(value.nodes)
    ? value.nodes
        .map((entry): CharacterGalleryCanvasNodeLayout | null => {
          if (!isPlainObject(entry)) return null;
          const id = normalizeOptionalString(entry.id, 120);
          if (!id) return null;
          const draftSource = isPlainObject(entry.draft) ? entry.draft : undefined;
          const mode = draftSource?.mode === 'edit' || draftSource?.mode === 'generate' ? draftSource.mode : undefined;
          const draft = normalizeCharacterGalleryCanvasDraft(draftSource);
          return {
            id,
            x: normalizeCanvasNumber(entry.x, 0),
            y: normalizeCanvasNumber(entry.y, 0),
            ...(normalizeOptionalString(entry.assetId, 80) ? { assetId: normalizeOptionalString(entry.assetId, 80) } : {}),
            ...(draft || mode || normalizeOptionalString(draftSource?.referenceAssetId, 80)
              ? {
                  draft: {
                    ...(draft ?? {}),
                    ...(mode ? { mode } : {}),
                    ...(normalizeOptionalString(draftSource?.referenceAssetId, 80) ? { referenceAssetId: normalizeOptionalString(draftSource?.referenceAssetId, 80) } : {})
                  }
                }
              : {})
          };
        })
        .filter((node): node is CharacterGalleryCanvasNodeLayout => !!node)
    : [];

  const viewport = isPlainObject(value.viewport)
    ? {
        x: normalizeCanvasNumber(value.viewport.x, 0),
        y: normalizeCanvasNumber(value.viewport.y, 0),
        zoom: normalizeCanvasNumber(value.viewport.zoom, 1)
      }
    : undefined;

  return {
    version: 1,
    ...(normalizeOptionalString(value.updatedAt, 40) ? { updatedAt: normalizeOptionalString(value.updatedAt, 40) } : {}),
    ...(viewport ? { viewport } : {}),
    nodes
  };
}
