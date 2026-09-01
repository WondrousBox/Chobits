import { createHash } from 'node:crypto';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { type ArchiveListEntry, listArchiveEntriesWith7Z, unzipFileWith7Z, zipDirectoryContentsWith7Z } from '../common/utils/file';
import { CHARACTER_PACK_ARCHIVE_EXTENSION } from './character-pack-archive';
import { assessCharacterPackDigest, calculateCharacterPackPayloadDigest, type CharacterPackDigestVerification } from './character-pack-integrity';
import { isPathContainedByRoot, isResolvedPathContainedByRoot, resolvePackRelativeAssetPath, resolvePackRelativeAssetPathWithDiagnostics } from './character-pack-paths';
import { type CharacterPackSignatureVerification, type CharacterPackTrustRoot, loadCharacterPackTrustRoot, verifyCharacterPackSignature } from './character-pack-signature';
import { DEFAULT_CHARACTER_GALLERY_INDEX_PATH } from './character-gallery';
import type {
  CharacterDefinition,
  CharacterMessageTemplateEntry,
  CharacterMessagesConfig,
  CharacterPackAssets,
  CharacterPackCapabilities,
  CharacterPackDefinition,
  CharacterPackProvenance,
  CharacterPackSignature,
  CharacterProgressMessagesConfig,
  SpeechExample
} from './character-service';
import {
  buildDefaultCharacterMessageEditorFields,
  buildDefaultCharacterMessages,
  CHARACTER_MESSAGE_SPECS,
  CHARACTER_PROGRESS_KIND_LABEL_SPECS,
  CHARACTER_PROGRESS_MESSAGE_SPECS,
  createCharacterMessageEditorFields,
  type CharacterMessageSpec,
  type CharacterPackEditorMessageFields
} from './messages/default-character';

export type CharacterPackSource = 'builtin' | 'installed';
export type CharacterPackTrustLevel = 'unsigned' | 'publisher-declared' | 'signature-declared';
export type CharacterPackTrustVerificationStatus =
  | 'none'
  | 'declared-unverified'
  | 'builtin-bundled'
  | 'digest-verified'
  | 'digest-mismatch'
  | 'signature-verified'
  | 'signature-mismatch'
  | 'signature-revoked'
  | 'signature-untrusted';
export type CharacterPackTrustLinkLabel = 'homepage' | 'repository' | 'support' | 'canonical';

export interface ResolvedCharacterPackAssets {
  character?: string;
  animations?: string;
  gallery?: string;
  voices?: string;
  preview?: {
    avatar?: string;
    gif?: string;
    video?: string;
  };
}

export interface CharacterPackTrustLink {
  label: CharacterPackTrustLinkLabel;
  url: string;
}

export interface CharacterPackTrustAssessment {
  level: CharacterPackTrustLevel;
  publisher?: string;
  channel?: string;
  signatureDeclared: boolean;
  verificationStatus: CharacterPackTrustVerificationStatus;
  digest?: CharacterPackDigestVerification;
  signatureVerification?: CharacterPackSignatureVerification;
  note: string;
  links: CharacterPackTrustLink[];
}

export interface CharacterPackSummary extends CharacterPackDefinition {
  trust: CharacterPackTrustAssessment;
  source: CharacterPackSource;
  rootDir: string;
  packFile: string;
  isActive: boolean;
  companionSince?: number;
  resolvedAssets: ResolvedCharacterPackAssets;
}

export interface CharacterPackActivationResult {
  changed: boolean;
  pack: CharacterPackSummary;
}

export interface CharacterPackInstallOptions {
  replaceExisting?: boolean;
  activate?: boolean;
}

export interface CharacterPackInstallResult {
  replaced: boolean;
  activated: boolean;
  pack: CharacterPackSummary;
}

export interface CharacterPackExportResult {
  pack: CharacterPackSummary;
  outputPath: string;
  bytes: number;
}

export type CharacterPackImportSourceType = 'archive';

export interface CharacterPackImportWarning {
  code:
    | 'missing-character-asset'
    | 'missing-animation-asset'
    | 'missing-gallery-asset'
    | 'missing-voice-asset'
    | 'asset-path-outside-pack'
    | 'signature-digest-unverified'
    | 'signature-untrusted-key'
    | 'signature-unverified'
    | 'platform-mismatch'
    | 'invalid-min-app-version';
  message: string;
}

export interface CharacterPackImportBlockingError {
  code: 'unsupported-format-version' | 'min-app-version-not-satisfied' | 'core-asset-path-outside-pack' | 'signature-digest-mismatch' | 'signature-verification-failed' | 'signature-key-revoked';
  message: string;
}

export interface CharacterPackImportPreview extends CharacterPackDefinition {
  trust: CharacterPackTrustAssessment;
  previewAvatarPath?: string;
  previewGifPath?: string;
  previewVideoPath?: string;
}

export interface CharacterPackImportCompatibility {
  currentPlatform: NodeJS.Platform;
  platformSupported: boolean | null;
  supportedFormatVersion: number;
  formatVersionSupported: boolean;
  currentAppVersion?: string;
  minAppVersion?: string;
  appVersionSatisfied: boolean | null;
}

export interface CharacterPackImportInspection {
  sourceType: CharacterPackImportSourceType;
  sourcePath: string;
  pack: CharacterPackImportPreview;
  existingPack: CharacterPackSummary | null;
  activePack: CharacterPackSummary | null;
  requiresReplace: boolean;
  willReplaceActive: boolean;
  installable: boolean;
  blockingErrors: CharacterPackImportBlockingError[];
  warnings: CharacterPackImportWarning[];
  compatibility: CharacterPackImportCompatibility;
}

export interface CharacterPackRemovalResult {
  removedPack: CharacterPackSummary;
  activePack: CharacterPackSummary | null;
  switchedActivePack: boolean;
}

export interface CharacterPackEditorPackFields {
  id: string;
  name: string;
  version: string;
  author: string;
  description: string;
  license: string;
  tags: string[];
  minAppVersion?: string;
  platform: string[];
}

export interface CharacterPackEditorCharacterFields {
  id: string;
  name: string;
  nameAliases: string[];
  tagline: string;
  background: string;
  coreTraits: string[];
  boundaries: string[];
  speechTone: string;
  language: string;
  firstPerson: string;
  addressUser: string;
  quirks: string[];
  speechExamples: SpeechExample[];
  metaDescription: string;
  metaTags: string[];
}

export type CharacterPackEditorMessagesFields = CharacterPackEditorMessageFields;

export interface CharacterPackEditorDraft {
  pack: CharacterPackEditorPackFields;
  character: CharacterPackEditorCharacterFields;
  messages?: CharacterPackEditorMessagesFields;
}

export interface CharacterPackEditorSaveOptions {
  basePackId?: string;
  basePackSource?: CharacterPackSource;
  replaceExisting?: boolean;
  activate?: boolean;
}

export interface CharacterPackEditorSaveResult extends CharacterPackInstallResult {
  created: boolean;
  updated: boolean;
}

export interface CharacterPackManagerOptions {
  userDataDir: string;
  builtinPackRootDir: string;
  appVersion?: string;
}

interface ActiveCharacterPackState {
  version: 1;
  id: string;
  source: CharacterPackSource;
  firstUsedAtByPack?: Record<string, number>;
}

const SUPPORTED_CHARACTER_PACK_FORMAT_VERSION = 1;
const IMPORT_PREVIEW_CACHE_LIMIT = 24;
const EDITOR_ANIMATION_INDEX_PATH = 'animations/index.json';
const EDITOR_GALLERY_INDEX_PATH = DEFAULT_CHARACTER_GALLERY_INDEX_PATH;
const WINDOWS_ABSOLUTE_ARCHIVE_PATH_PATTERN = /^[a-zA-Z]:[\\/]/;
const MAX_CHARACTER_PACK_ARCHIVE_ENTRIES = 2_000;
const MAX_CHARACTER_PACK_ARCHIVE_ENTRY_SIZE_BYTES = 256 * 1024 * 1024;
const MAX_CHARACTER_PACK_ARCHIVE_UNCOMPRESSED_SIZE_BYTES = 512 * 1024 * 1024;
const CHARACTER_PACK_ARCHIVE_EXTENSIONS = new Set(['.zip', CHARACTER_PACK_ARCHIVE_EXTENSION]);

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function normalizeString(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

function normalizeOptionalString(value: unknown): string | undefined {
  const normalized = normalizeString(value).trim();
  return normalized || undefined;
}

function normalizeStringList(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === 'string') : [];
}

function normalizeHttpUrl(value: unknown): string | undefined {
  const normalized = normalizeOptionalString(value);
  if (!normalized) {
    return undefined;
  }

  try {
    const parsed = new URL(normalized);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return undefined;
    }
    return parsed.toString();
  } catch {
    return undefined;
  }
}

function parseVersionSegments(value: string | undefined): number[] | null {
  if (typeof value !== 'string') {
    return null;
  }

  const normalized = value.trim();
  if (!normalized) {
    return null;
  }

  const core = normalized.split(/[+-]/, 1)[0];
  if (!core) {
    return null;
  }

  const segments = core.split('.');
  if (segments.length === 0 || segments.some((segment) => !/^\d+$/.test(segment))) {
    return null;
  }

  return segments.map((segment) => Number.parseInt(segment, 10));
}

function compareVersionSegments(left: number[], right: number[]): number {
  const length = Math.max(left.length, right.length);
  for (let index = 0; index < length; index += 1) {
    const leftValue = left[index] ?? 0;
    const rightValue = right[index] ?? 0;
    if (leftValue > rightValue) {
      return 1;
    }
    if (leftValue < rightValue) {
      return -1;
    }
  }
  return 0;
}

function normalizePackAssets(value: unknown): CharacterPackAssets | undefined {
  if (!isPlainObject(value)) {
    return undefined;
  }

  const preview = isPlainObject(value.preview)
    ? {
        ...(typeof value.preview.avatar === 'string' ? { avatar: value.preview.avatar } : {}),
        ...(typeof value.preview.gif === 'string' ? { gif: value.preview.gif } : {}),
        ...(typeof value.preview.video === 'string' ? { video: value.preview.video } : {})
      }
    : undefined;

  const assets: CharacterPackAssets = {
    ...(typeof value.character === 'string' ? { character: value.character } : {}),
    ...(typeof value.animations === 'string' ? { animations: value.animations } : {}),
    ...(typeof value.gallery === 'string' ? { gallery: value.gallery } : {}),
    ...(typeof value.voices === 'string' ? { voices: value.voices } : {}),
    ...(typeof value.live2d === 'string' ? { live2d: value.live2d } : {}),
    ...(preview && Object.keys(preview).length > 0 ? { preview } : {})
  };

  return Object.keys(assets).length > 0 ? assets : undefined;
}

function normalizePackCapabilities(value: unknown): CharacterPackCapabilities | undefined {
  if (!isPlainObject(value)) {
    return undefined;
  }

  const capabilities: CharacterPackCapabilities = {
    ...(typeof value.hasVoice === 'boolean' ? { hasVoice: value.hasVoice } : {}),
    ...(typeof value.hasCustomAnimations === 'boolean' ? { hasCustomAnimations: value.hasCustomAnimations } : {}),
    ...(typeof value.has3DModel === 'boolean' ? { has3DModel: value.has3DModel } : {}),
    ...(Array.isArray(value.supportedLanguages) ? { supportedLanguages: normalizeStringList(value.supportedLanguages) } : {}),
    ...(Array.isArray(value.dimensionExtensions) ? { dimensionExtensions: normalizeStringList(value.dimensionExtensions) } : {})
  };

  return Object.keys(capabilities).length > 0 ? capabilities : undefined;
}

function normalizePackProvenance(value: unknown): CharacterPackProvenance | undefined {
  if (!isPlainObject(value)) {
    return undefined;
  }

  const provenance: CharacterPackProvenance = {
    ...(normalizeOptionalString(value.channel) ? { channel: normalizeOptionalString(value.channel) } : {}),
    ...(normalizeOptionalString(value.publisher) ? { publisher: normalizeOptionalString(value.publisher) } : {}),
    ...(normalizeHttpUrl(value.homepage) ? { homepage: normalizeHttpUrl(value.homepage) } : {}),
    ...(normalizeHttpUrl(value.repository) ? { repository: normalizeHttpUrl(value.repository) } : {}),
    ...(normalizeHttpUrl(value.support) ? { support: normalizeHttpUrl(value.support) } : {}),
    ...(normalizeHttpUrl(value.canonicalUrl) ? { canonicalUrl: normalizeHttpUrl(value.canonicalUrl) } : {})
  };

  return Object.keys(provenance).length > 0 ? provenance : undefined;
}

function normalizePackSignature(value: unknown): CharacterPackSignature | undefined {
  if (!isPlainObject(value)) {
    return undefined;
  }

  const signature: CharacterPackSignature = {
    ...(normalizeOptionalString(value.algorithm) ? { algorithm: normalizeOptionalString(value.algorithm) } : {}),
    ...(normalizeOptionalString(value.keyId) ? { keyId: normalizeOptionalString(value.keyId) } : {}),
    ...(normalizeOptionalString(value.digest) ? { digest: normalizeOptionalString(value.digest) } : {}),
    ...(normalizeOptionalString(value.value) ? { value: normalizeOptionalString(value.value) } : {})
  };

  return Object.keys(signature).length > 0 ? signature : undefined;
}

function getCharacterPackTrustLinks(provenance?: CharacterPackProvenance): CharacterPackTrustLink[] {
  return [
    provenance?.homepage ? { label: 'homepage', url: provenance.homepage } : null,
    provenance?.repository ? { label: 'repository', url: provenance.repository } : null,
    provenance?.support ? { label: 'support', url: provenance.support } : null,
    provenance?.canonicalUrl ? { label: 'canonical', url: provenance.canonicalUrl } : null
  ].filter((entry): entry is CharacterPackTrustLink => !!entry);
}

function hasDeclaredCharacterPackSignature(signature?: CharacterPackSignature): boolean {
  return !!signature && Object.values(signature).some((value) => typeof value === 'string' && value.trim().length > 0);
}

function describeDigestVerification(digest: CharacterPackDigestVerification | undefined): string | null {
  if (digest?.status === 'verified') {
    return 'SHA-256 内容摘要已校验通过';
  }

  if (digest?.status === 'mismatch') {
    return 'SHA-256 内容摘要与本地内容不一致';
  }

  if (digest?.status === 'unsupported' || digest?.status === 'error') {
    return '声明的 digest 当前无法形成有效校验结果';
  }

  return null;
}

function describeSignatureVerification(signatureVerification: CharacterPackSignatureVerification | undefined): string | null {
  if (signatureVerification?.status === 'verified') {
    return '可信公钥签名已校验通过';
  }

  if (signatureVerification?.status === 'mismatch') {
    return '可信公钥签名校验失败';
  }

  if (signatureVerification?.status === 'revoked') {
    return '签名 key 已被当前应用信任根撤销';
  }

  if (signatureVerification?.status === 'untrusted') {
    return '签名 keyId 未被当前应用信任根收录';
  }

  if (signatureVerification?.status === 'unsupported') {
    return '声明的签名当前无法按受信签名规则校验';
  }

  if (signatureVerification?.status === 'error') {
    return '签名校验过程发生错误';
  }

  return null;
}

function assessCharacterPackTrust(
  pack: Pick<CharacterPackDefinition, 'provenance' | 'signature'>,
  options?: {
    source?: CharacterPackSource;
    digest?: CharacterPackDigestVerification;
    signatureVerification?: CharacterPackSignatureVerification;
  }
): CharacterPackTrustAssessment {
  const publisher = pack.provenance?.publisher?.trim() || undefined;
  const channel = pack.provenance?.channel?.trim() || undefined;
  const links = getCharacterPackTrustLinks(pack.provenance);
  const signatureDeclared = hasDeclaredCharacterPackSignature(pack.signature);
  const isBuiltinBundled = options?.source === 'builtin';
  const digest = options?.digest;
  const digestNote = describeDigestVerification(digest);
  const signatureVerification = options?.signatureVerification;
  const signatureNote = describeSignatureVerification(signatureVerification);

  if (isBuiltinBundled && signatureDeclared) {
    return {
      level: 'signature-declared',
      ...(publisher ? { publisher } : {}),
      ...(channel ? { channel } : {}),
      signatureDeclared: true,
      verificationStatus: 'builtin-bundled',
      ...(digest && digest.status !== 'missing' ? { digest } : {}),
      ...(signatureVerification && signatureVerification.status !== 'missing' ? { signatureVerification } : {}),
      note: `该角色包随当前应用内置分发，来源已由本地应用包路径确认${digestNote ? `；${digestNote}` : ''}${signatureNote ? `；${signatureNote}` : ''}。`,
      links
    };
  }

  if (isBuiltinBundled) {
    return {
      level: publisher || channel || links.length > 0 ? 'publisher-declared' : 'unsigned',
      ...(publisher ? { publisher } : {}),
      ...(channel ? { channel } : {}),
      signatureDeclared,
      verificationStatus: 'builtin-bundled',
      ...(digest && digest.status !== 'missing' ? { digest } : {}),
      ...(signatureVerification && signatureVerification.status !== 'missing' ? { signatureVerification } : {}),
      note: '该角色包随当前应用内置分发，来源已由本地应用包路径确认。',
      links
    };
  }

  if (signatureDeclared && signatureVerification?.status === 'verified') {
    return {
      level: 'signature-declared',
      ...(publisher ? { publisher } : {}),
      ...(channel ? { channel } : {}),
      signatureDeclared: true,
      verificationStatus: 'signature-verified',
      ...(digest && digest.status !== 'missing' ? { digest } : {}),
      signatureVerification,
      note: `角色包已通过当前应用信任根中的公钥签名校验${digestNote ? `；${digestNote}` : ''}。`,
      links
    };
  }

  if (signatureDeclared && signatureVerification?.status === 'mismatch') {
    return {
      level: 'signature-declared',
      ...(publisher ? { publisher } : {}),
      ...(channel ? { channel } : {}),
      signatureDeclared: true,
      verificationStatus: 'signature-mismatch',
      ...(digest && digest.status !== 'missing' ? { digest } : {}),
      signatureVerification,
      note: '角色包声明了可信 keyId，但公钥签名校验失败，导入将被阻止。',
      links
    };
  }

  if (signatureDeclared && signatureVerification?.status === 'revoked') {
    return {
      level: 'signature-declared',
      ...(publisher ? { publisher } : {}),
      ...(channel ? { channel } : {}),
      signatureDeclared: true,
      verificationStatus: 'signature-revoked',
      ...(digest && digest.status !== 'missing' ? { digest } : {}),
      signatureVerification,
      note: `角色包声明的签名 key 已被当前应用信任根撤销，导入将被阻止${signatureVerification.reason ? `：${signatureVerification.reason}` : ''}。`,
      links
    };
  }

  if (signatureDeclared && signatureVerification?.status === 'untrusted') {
    return {
      level: 'signature-declared',
      ...(publisher ? { publisher } : {}),
      ...(channel ? { channel } : {}),
      signatureDeclared: true,
      verificationStatus: 'signature-untrusted',
      ...(digest && digest.status !== 'missing' ? { digest } : {}),
      signatureVerification,
      note: `角色包声明了签名值，但 keyId 尚未被当前应用信任根信任${signatureVerification.reason ? `：${signatureVerification.reason}` : ''}。`,
      links
    };
  }

  if (signatureDeclared && digest?.status === 'verified') {
    return {
      level: 'signature-declared',
      ...(publisher ? { publisher } : {}),
      ...(channel ? { channel } : {}),
      signatureDeclared: true,
      verificationStatus: 'digest-verified',
      digest,
      ...(signatureVerification && signatureVerification.status !== 'missing' ? { signatureVerification } : {}),
      note: `角色包声明的 SHA-256 内容摘要已校验通过；但当前仍未形成受信签名结论${signatureNote ? `（${signatureNote}）` : ''}。`,
      links
    };
  }

  if (signatureDeclared && digest?.status === 'mismatch') {
    return {
      level: 'signature-declared',
      ...(publisher ? { publisher } : {}),
      ...(channel ? { channel } : {}),
      signatureDeclared: true,
      verificationStatus: 'digest-mismatch',
      digest,
      ...(signatureVerification && signatureVerification.status !== 'missing' ? { signatureVerification } : {}),
      note: '角色包声明的 SHA-256 内容摘要与本地内容不一致，导入将被阻止。',
      links
    };
  }

  if (signatureDeclared) {
    return {
      level: 'signature-declared',
      ...(publisher ? { publisher } : {}),
      ...(channel ? { channel } : {}),
      signatureDeclared: true,
      verificationStatus: 'declared-unverified',
      ...(digest && digest.status !== 'missing' ? { digest } : {}),
      ...(signatureVerification && signatureVerification.status !== 'missing' ? { signatureVerification } : {}),
      note: `角色包声明了来源和签名元数据，但当前仍未形成受信签名结论${signatureNote ? `（${signatureNote}）` : ''}。`,
      links
    };
  }

  if (publisher || channel || links.length > 0) {
    return {
      level: 'publisher-declared',
      ...(publisher ? { publisher } : {}),
      ...(channel ? { channel } : {}),
      signatureDeclared: false,
      verificationStatus: 'none',
      note: '角色包已声明发布者或来源链接，但当前版本不会自动校验来源真实性，请结合来源自行判断。',
      links
    };
  }

  return {
    level: 'unsigned',
    signatureDeclared: false,
    verificationStatus: 'none',
    note: '角色包未声明发布者、来源链接或签名信息，请仅从你信任的渠道导入。',
    links: []
  };
}

function normalizeCharacterPackDefinition(raw: unknown): CharacterPackDefinition | null {
  if (!isPlainObject(raw)) {
    return null;
  }

  const id = normalizeString(raw.id).trim();
  const name = normalizeString(raw.name).trim();
  const version = normalizeString(raw.version).trim();
  const author = normalizeString(raw.author).trim();
  if (!id || !name || !version || !author) {
    return null;
  }

  const formatVersion = typeof raw.formatVersion === 'number' && Number.isFinite(raw.formatVersion) ? raw.formatVersion : 1;
  const assets = normalizePackAssets(raw.assets);
  const capabilities = normalizePackCapabilities(raw.capabilities);
  const provenance = normalizePackProvenance(raw.provenance);
  const signature = normalizePackSignature(raw.signature);
  return {
    formatVersion,
    id,
    name,
    version,
    author,
    description: normalizeString(raw.description),
    license: normalizeString(raw.license),
    tags: normalizeStringList(raw.tags),
    ...(typeof raw.minAppVersion === 'string' ? { minAppVersion: raw.minAppVersion } : {}),
    ...(Array.isArray(raw.platform) ? { platform: normalizeStringList(raw.platform) } : {}),
    ...(assets ? { assets } : {}),
    ...(capabilities ? { capabilities } : {}),
    ...(provenance ? { provenance } : {}),
    ...(signature ? { signature } : {})
  };
}

function resolvePackRelativeAsset(rootDir: string, candidate: unknown): string | undefined {
  return resolvePackRelativeAssetPath(rootDir, candidate) ?? undefined;
}

function resolveCharacterPackAssets(rootDir: string, assets?: CharacterPackAssets): ResolvedCharacterPackAssets {
  const character = resolvePackRelativeAsset(rootDir, assets?.character);
  const animations = resolvePackRelativeAsset(rootDir, assets?.animations);
  const gallery = resolvePackRelativeAsset(rootDir, assets?.gallery);
  const voices = resolvePackRelativeAsset(rootDir, assets?.voices);
  const previewAvatar = resolvePackRelativeAsset(rootDir, assets?.preview?.avatar);
  const previewGif = resolvePackRelativeAsset(rootDir, assets?.preview?.gif);
  const previewVideo = resolvePackRelativeAsset(rootDir, assets?.preview?.video);
  const preview = {
    ...(previewAvatar ? { avatar: previewAvatar } : {}),
    ...(previewGif ? { gif: previewGif } : {}),
    ...(previewVideo ? { video: previewVideo } : {})
  };

  return {
    ...(character ? { character } : {}),
    ...(animations ? { animations } : {}),
    ...(gallery ? { gallery } : {}),
    ...(voices ? { voices } : {}),
    ...(Object.keys(preview).length > 0 ? { preview } : {})
  };
}

async function readCharacterPackAtRoot(
  rootDir: string,
  source: CharacterPackSource,
  options?: {
    trustRoot?: CharacterPackTrustRoot | null;
  }
): Promise<CharacterPackSummary | null> {
  const normalizedRootDir = path.resolve(rootDir);
  const packFile = path.join(normalizedRootDir, 'pack.json');
  try {
    const raw = await fsp.readFile(packFile, 'utf-8');
    const definition = normalizeCharacterPackDefinition(JSON.parse(raw));
    if (!definition) {
      return null;
    }

    let payloadDigest: string | undefined;
    let payloadDigestError: unknown;
    try {
      payloadDigest = await calculateCharacterPackPayloadDigest(normalizedRootDir);
    } catch (error) {
      payloadDigestError = error;
    }

    const digest = assessCharacterPackDigest(definition.signature, {
      actualDigest: payloadDigest,
      error: payloadDigestError
    });
    const signatureVerification = verifyCharacterPackSignature({
      pack: definition,
      trustRoot: options?.trustRoot ?? null,
      payloadDigest,
      payloadDigestError
    });

    return {
      ...definition,
      trust: assessCharacterPackTrust(definition, {
        source,
        digest,
        signatureVerification
      }),
      source,
      rootDir: normalizedRootDir,
      packFile,
      isActive: false,
      resolvedAssets: resolveCharacterPackAssets(normalizedRootDir, definition.assets)
    };
  } catch {
    return null;
  }
}

function matchesPackState(pack: Pick<CharacterPackSummary, 'id' | 'source'>, state: ActiveCharacterPackState | null | undefined): boolean {
  return !!state && pack.id === state.id && pack.source === state.source;
}

function normalizeTimestamp(value: unknown): number | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    return undefined;
  }
  return Math.trunc(value);
}

function normalizePackUsageMap(value: unknown): Record<string, number> | undefined {
  if (!isPlainObject(value)) {
    return undefined;
  }

  const normalized = Object.entries(value).reduce<Record<string, number>>((acc, [key, timestamp]) => {
    const normalizedKey = key.trim();
    const normalizedTimestamp = normalizeTimestamp(timestamp);
    if (normalizedKey && normalizedTimestamp !== undefined) {
      acc[normalizedKey] = normalizedTimestamp;
    }
    return acc;
  }, {});

  return Object.keys(normalized).length > 0 ? normalized : undefined;
}

function getPackUsageKey(pack: Pick<CharacterPackSummary, 'id' | 'source'>): string {
  return `${pack.source}:${pack.id}`;
}

function getPackCompanionSince(pack: Pick<CharacterPackSummary, 'id' | 'source'>, state: ActiveCharacterPackState | null | undefined): number | undefined {
  return normalizeTimestamp(state?.firstUsedAtByPack?.[getPackUsageKey(pack)]);
}

function withPackCompanionSince(pack: CharacterPackSummary, state: ActiveCharacterPackState | null | undefined): CharacterPackSummary {
  const companionSince = getPackCompanionSince(pack, state);
  return {
    ...pack,
    ...(companionSince !== undefined ? { companionSince } : {})
  };
}

function buildActivePackState(pack: Pick<CharacterPackSummary, 'id' | 'source'>, previousState?: ActiveCharacterPackState | null): ActiveCharacterPackState {
  return {
    version: 1,
    id: pack.id,
    source: pack.source,
    ...(previousState?.firstUsedAtByPack ? { firstUsedAtByPack: previousState.firstUsedAtByPack } : {})
  };
}

function ensurePackFirstUsedAt(state: ActiveCharacterPackState, pack: Pick<CharacterPackSummary, 'id' | 'source'>, now = Date.now()): { state: ActiveCharacterPackState; changed: boolean } {
  const usageKey = getPackUsageKey(pack);
  const firstUsedAtByPack = state.firstUsedAtByPack ?? {};
  if (normalizeTimestamp(firstUsedAtByPack[usageKey]) !== undefined) {
    return { state, changed: false };
  }

  return {
    state: {
      ...state,
      firstUsedAtByPack: {
        ...firstUsedAtByPack,
        [usageKey]: Math.max(1, Math.trunc(now))
      }
    },
    changed: true
  };
}

function buildCharacterPackImportPreview(
  pack: CharacterPackSummary,
  options?: {
    previewAssets?: {
      avatar?: string;
      gif?: string;
      video?: string;
    };
  }
): CharacterPackImportPreview {
  const { source, rootDir, packFile, isActive, companionSince, resolvedAssets, ...definition } = pack;
  void source;
  void rootDir;
  void packFile;
  void isActive;
  void companionSince;

  const previewAvatarPath = options?.previewAssets?.avatar ?? (resolvedAssets.preview?.avatar && fs.existsSync(resolvedAssets.preview.avatar) ? resolvedAssets.preview.avatar : undefined);
  const previewGifPath = options?.previewAssets?.gif ?? (resolvedAssets.preview?.gif && fs.existsSync(resolvedAssets.preview.gif) ? resolvedAssets.preview.gif : undefined);
  const previewVideoPath = options?.previewAssets?.video ?? (resolvedAssets.preview?.video && fs.existsSync(resolvedAssets.preview.video) ? resolvedAssets.preview.video : undefined);

  return {
    ...definition,
    ...(previewAvatarPath ? { previewAvatarPath } : {}),
    ...(previewGifPath ? { previewGifPath } : {}),
    ...(previewVideoPath ? { previewVideoPath } : {})
  };
}

interface CharacterPackOutsideAssetPath {
  field: string;
  declaredPath: string;
  core: boolean;
}

function collectOutsidePackAssetPaths(pack: CharacterPackSummary): CharacterPackOutsideAssetPath[] {
  const outsidePaths: CharacterPackOutsideAssetPath[] = [];

  function check(field: string, declaredPath: string | undefined, core: boolean): void {
    if (!declaredPath?.trim()) {
      return;
    }

    const resolution = resolvePackRelativeAssetPathWithDiagnostics(pack.rootDir, declaredPath);
    if (resolution.error === 'outside-root') {
      outsidePaths.push({
        field,
        declaredPath,
        core
      });
    }
  }

  check('character', pack.assets?.character, true);
  check('animations', pack.assets?.animations, true);
  check('gallery', pack.assets?.gallery, false);
  check('voices', pack.assets?.voices, false);
  check('preview.avatar', pack.assets?.preview?.avatar, false);
  check('preview.gif', pack.assets?.preview?.gif, false);
  check('preview.video', pack.assets?.preview?.video, false);

  return outsidePaths;
}

function collectCharacterPackImportWarnings(
  pack: CharacterPackSummary,
  compatibility: CharacterPackImportCompatibility,
  outsideAssetPaths: CharacterPackOutsideAssetPath[]
): CharacterPackImportWarning[] {
  const warnings: CharacterPackImportWarning[] = [];
  const outsideAssetFields = new Set(outsideAssetPaths.map((entry) => entry.field));

  if (outsideAssetPaths.length > 0) {
    warnings.push({
      code: 'asset-path-outside-pack',
      message: `pack.json 声明的资源路径越过角色包目录，已忽略：${outsideAssetPaths.map((entry) => `${entry.field}=${entry.declaredPath}`).join('，')}`
    });
  }

  if (pack.trust.signatureDeclared && pack.trust.digest?.status === 'unsupported') {
    warnings.push({
      code: 'signature-digest-unverified',
      message: `pack.json 声明的 digest 暂无法校验：${pack.trust.digest.declared}`
    });
  }

  if (pack.trust.signatureDeclared && pack.trust.digest?.status === 'error') {
    warnings.push({
      code: 'signature-digest-unverified',
      message: `pack.json 声明的 digest 校验失败：${pack.trust.digest.error ?? 'unknown error'}`
    });
  }

  if (pack.trust.signatureVerification?.status === 'untrusted') {
    warnings.push({
      code: 'signature-untrusted-key',
      message: `pack.json 声明了签名值，但 keyId 尚未被当前应用信任根收录：${pack.trust.signatureVerification.reason ?? pack.trust.signatureVerification.keyId ?? 'unknown key'}`
    });
  }

  if (pack.trust.signatureVerification?.status === 'unsupported') {
    warnings.push({
      code: 'signature-unverified',
      message: `pack.json 声明的签名暂无法校验：${pack.trust.signatureVerification.reason ?? pack.trust.signatureVerification.algorithm ?? 'unsupported signature'}`
    });
  }

  if (pack.trust.signatureVerification?.status === 'error') {
    warnings.push({
      code: 'signature-unverified',
      message: `pack.json 声明的签名校验失败：${pack.trust.signatureVerification.error ?? 'unknown error'}`
    });
  }

  if (pack.assets?.character && !outsideAssetFields.has('character') && (!pack.resolvedAssets.character || !fs.existsSync(pack.resolvedAssets.character))) {
    warnings.push({
      code: 'missing-character-asset',
      message: `pack.json 声明的 character 资源不存在：${pack.assets.character}`
    });
  }

  if (pack.assets?.animations && !outsideAssetFields.has('animations') && (!pack.resolvedAssets.animations || !fs.existsSync(pack.resolvedAssets.animations))) {
    warnings.push({
      code: 'missing-animation-asset',
      message: `pack.json 声明的 animations 索引不存在：${pack.assets.animations}`
    });
  }

  if (pack.assets?.gallery && !outsideAssetFields.has('gallery') && (!pack.resolvedAssets.gallery || !fs.existsSync(pack.resolvedAssets.gallery))) {
    warnings.push({
      code: 'missing-gallery-asset',
      message: `pack.json 声明的 gallery 索引不存在：${pack.assets.gallery}`
    });
  }

  if (pack.assets?.voices && !outsideAssetFields.has('voices') && (!pack.resolvedAssets.voices || !fs.existsSync(pack.resolvedAssets.voices))) {
    warnings.push({
      code: 'missing-voice-asset',
      message: `pack.json 声明的 voices 目录不存在：${pack.assets.voices}`
    });
  }

  if (Array.isArray(pack.platform) && pack.platform.length > 0 && !pack.platform.includes(process.platform)) {
    warnings.push({
      code: 'platform-mismatch',
      message: `角色包声明支持 ${pack.platform.join(', ')}，当前平台为 ${process.platform}`
    });
  }

  if (pack.minAppVersion && compatibility.appVersionSatisfied === null && compatibility.currentAppVersion) {
    warnings.push({
      code: 'invalid-min-app-version',
      message: `角色包声明的最低应用版本无法解析：${pack.minAppVersion}`
    });
  }

  return warnings;
}

function assessCharacterPackImport(
  pack: CharacterPackSummary,
  options?: { currentAppVersion?: string }
): {
  blockingErrors: CharacterPackImportBlockingError[];
  warnings: CharacterPackImportWarning[];
  compatibility: CharacterPackImportCompatibility;
} {
  const currentPlatform = process.platform;
  const currentAppVersion = options?.currentAppVersion?.trim() || undefined;
  const minAppVersion = pack.minAppVersion?.trim() || undefined;

  let appVersionSatisfied: boolean | null = null;
  if (minAppVersion && currentAppVersion) {
    const minVersionSegments = parseVersionSegments(minAppVersion);
    const currentVersionSegments = parseVersionSegments(currentAppVersion);
    if (minVersionSegments && currentVersionSegments) {
      appVersionSatisfied = compareVersionSegments(currentVersionSegments, minVersionSegments) >= 0;
    }
  }

  const compatibility: CharacterPackImportCompatibility = {
    currentPlatform,
    platformSupported: Array.isArray(pack.platform) && pack.platform.length > 0 ? pack.platform.includes(currentPlatform) : null,
    supportedFormatVersion: SUPPORTED_CHARACTER_PACK_FORMAT_VERSION,
    formatVersionSupported: pack.formatVersion <= SUPPORTED_CHARACTER_PACK_FORMAT_VERSION,
    ...(currentAppVersion ? { currentAppVersion } : {}),
    ...(minAppVersion ? { minAppVersion } : {}),
    appVersionSatisfied
  };

  const blockingErrors: CharacterPackImportBlockingError[] = [];
  const outsideAssetPaths = collectOutsidePackAssetPaths(pack);
  const outsideCoreAssetPaths = outsideAssetPaths.filter((entry) => entry.core);

  if (!compatibility.formatVersionSupported) {
    blockingErrors.push({
      code: 'unsupported-format-version',
      message: `当前应用仅支持 formatVersion <= ${SUPPORTED_CHARACTER_PACK_FORMAT_VERSION}，该角色包为 ${pack.formatVersion}`
    });
  }

  if (minAppVersion && appVersionSatisfied === false && currentAppVersion) {
    blockingErrors.push({
      code: 'min-app-version-not-satisfied',
      message: `当前应用版本 ${currentAppVersion} 低于角色包要求的最低版本 ${minAppVersion}`
    });
  }

  if (outsideCoreAssetPaths.length > 0) {
    blockingErrors.push({
      code: 'core-asset-path-outside-pack',
      message: `pack.json 核心资源路径越过角色包目录：${outsideCoreAssetPaths.map((entry) => `${entry.field}=${entry.declaredPath}`).join('，')}。请改为角色包目录内的相对路径。`
    });
  }

  if (pack.trust.digest?.status === 'mismatch') {
    blockingErrors.push({
      code: 'signature-digest-mismatch',
      message: `pack.json 声明的 SHA-256 digest 与角色包内容不一致：declared=${pack.trust.digest.declared ?? 'unknown'}，actual=${pack.trust.digest.actual ?? 'unknown'}`
    });
  }

  if (pack.trust.signatureVerification?.status === 'mismatch') {
    blockingErrors.push({
      code: 'signature-verification-failed',
      message: `pack.json 声明的可信公钥签名校验失败：${pack.trust.signatureVerification.reason ?? pack.trust.signatureVerification.keyId ?? 'unknown key'}`
    });
  }

  if (pack.trust.signatureVerification?.status === 'revoked') {
    blockingErrors.push({
      code: 'signature-key-revoked',
      message: `pack.json 声明的签名 key 已被当前应用信任根撤销：${pack.trust.signatureVerification.reason ?? pack.trust.signatureVerification.keyId ?? 'unknown key'}`
    });
  }

  return {
    blockingErrors,
    warnings: collectCharacterPackImportWarnings(pack, compatibility, outsideAssetPaths),
    compatibility
  };
}

async function collectPackFiles(rootDir: string): Promise<string[]> {
  const normalizedRootDir = path.resolve(rootDir);
  const found: string[] = [];

  async function walk(currentDir: string): Promise<void> {
    const entries = await fsp.readdir(currentDir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.name === '__MACOSX') continue;
      const entryPath = path.join(currentDir, entry.name);
      if (entry.isDirectory()) {
        await walk(entryPath);
        continue;
      }
      if (entry.isFile() && entry.name === 'pack.json') {
        found.push(entryPath);
      }
    }
  }

  await walk(normalizedRootDir);
  return found;
}

function isArchiveEntryPathOutsideRoot(entryPath: string): boolean {
  const normalizedEntryPath = entryPath.trim().replace(/\\/g, '/');
  if (!normalizedEntryPath || normalizedEntryPath.startsWith('/') || normalizedEntryPath.startsWith('//') || WINDOWS_ABSOLUTE_ARCHIVE_PATH_PATTERN.test(entryPath.trim())) {
    return true;
  }

  return normalizedEntryPath.split('/').some((segment) => segment === '..');
}

function archiveEntryLooksLikeLink(entry: ArchiveListEntry): boolean {
  const attr = entry.attr?.trim() ?? '';
  if (!attr) {
    return false;
  }

  return /\blrwx/i.test(attr) || /(^|[\s_])L($|[\s_])/i.test(attr) || /\b(symbolic link|symlink|hardlink)\b/i.test(attr);
}

function parseArchiveEntrySize(size: string | undefined): number | null {
  const normalized = size?.trim();
  if (!normalized || !/^\d+$/.test(normalized)) {
    return null;
  }

  const value = Number(normalized);
  return Number.isFinite(value) ? value : Number.POSITIVE_INFINITY;
}

async function assertCharacterPackArchivePreflight(archivePath: string): Promise<void> {
  const entries = await listArchiveEntriesWith7Z(archivePath);
  const unsafeEntries: string[] = [];
  const oversizedEntries: string[] = [];
  let uncompressedSizeBytes = 0;

  if (entries.length > MAX_CHARACTER_PACK_ARCHIVE_ENTRIES) {
    throw new Error(`Character pack archive contains too many entries: ${entries.length} > ${MAX_CHARACTER_PACK_ARCHIVE_ENTRIES}`);
  }

  for (const entry of entries) {
    const entryName = entry.name?.trim();
    if (!entryName) {
      unsafeEntries.push('<empty>');
      continue;
    }

    if (isArchiveEntryPathOutsideRoot(entryName) || archiveEntryLooksLikeLink(entry)) {
      unsafeEntries.push(entryName);
    }

    const entrySize = parseArchiveEntrySize(entry.size);
    if (entrySize === null) {
      continue;
    }

    uncompressedSizeBytes += entrySize;
    if (entrySize > MAX_CHARACTER_PACK_ARCHIVE_ENTRY_SIZE_BYTES) {
      oversizedEntries.push(`${entryName} (${entrySize} bytes)`);
    }
  }

  if (unsafeEntries.length > 0) {
    const preview = unsafeEntries.slice(0, 8).join(', ');
    const suffix = unsafeEntries.length > 8 ? `, ... +${unsafeEntries.length - 8}` : '';
    throw new Error(`Character pack archive contains unsafe archive entries: ${preview}${suffix}`);
  }

  if (oversizedEntries.length > 0) {
    const preview = oversizedEntries.slice(0, 8).join(', ');
    throw new Error(`Character pack archive contains oversized entries: ${preview}; max per entry is ${MAX_CHARACTER_PACK_ARCHIVE_ENTRY_SIZE_BYTES} bytes`);
  }

  if (uncompressedSizeBytes > MAX_CHARACTER_PACK_ARCHIVE_UNCOMPRESSED_SIZE_BYTES) {
    throw new Error(`Character pack archive expanded size is too large: ${uncompressedSizeBytes} > ${MAX_CHARACTER_PACK_ARCHIVE_UNCOMPRESSED_SIZE_BYTES} bytes`);
  }
}

function getRelativePackEntryPath(rootDir: string, entryPath: string): string {
  const relativePath = path.relative(path.resolve(rootDir), path.resolve(entryPath));
  return relativePath || '.';
}

async function assertCharacterPackEntrySafe(rootDir: string, entryPath: string): Promise<void> {
  const normalizedRootDir = path.resolve(rootDir);
  const resolvedEntryPath = path.resolve(entryPath);
  const relativePath = getRelativePackEntryPath(normalizedRootDir, resolvedEntryPath);

  if (!isPathContainedByRoot(normalizedRootDir, resolvedEntryPath)) {
    throw new Error(`Character pack contains a path outside the pack root: ${relativePath}`);
  }

  const stats = await fsp.lstat(resolvedEntryPath);
  if (stats.isSymbolicLink()) {
    throw new Error(`Character pack contains an unsupported symbolic link: ${relativePath}`);
  }

  if (!stats.isDirectory() && !stats.isFile()) {
    throw new Error(`Character pack contains an unsupported filesystem entry: ${relativePath}`);
  }

  if (!isResolvedPathContainedByRoot(normalizedRootDir, resolvedEntryPath)) {
    throw new Error(`Character pack contains a resolved path outside the pack root: ${relativePath}`);
  }
}

async function assertCharacterPackDirectorySafe(rootDir: string): Promise<void> {
  const normalizedRootDir = path.resolve(rootDir);

  async function walk(currentDir: string): Promise<void> {
    await assertCharacterPackEntrySafe(normalizedRootDir, currentDir);

    const entries = await fsp.readdir(currentDir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.name === '__MACOSX') continue;

      const entryPath = path.join(currentDir, entry.name);
      await assertCharacterPackEntrySafe(normalizedRootDir, entryPath);
      if (entry.isDirectory()) {
        await walk(entryPath);
      }
    }
  }

  await walk(normalizedRootDir);
}

async function resolveArchivePackRootDir(extractDir: string): Promise<string | null> {
  const rootPackFile = path.join(path.resolve(extractDir), 'pack.json');
  if (fs.existsSync(rootPackFile)) {
    return path.dirname(rootPackFile);
  }

  const packFiles = await collectPackFiles(extractDir);
  if (packFiles.length !== 1) {
    return null;
  }

  return path.dirname(packFiles[0]);
}

function resolveCharacterPackExportPath(outputPath: string): string {
  const normalized = outputPath.trim();
  if (!normalized) {
    throw new Error('Character pack export path is empty');
  }

  const resolved = path.resolve(normalized);
  const extension = path.extname(resolved).toLowerCase();
  return extension && CHARACTER_PACK_ARCHIVE_EXTENSIONS.has(extension) ? resolved : `${resolved}${CHARACTER_PACK_ARCHIVE_EXTENSION}`;
}

function assertCharacterPackArchiveExtension(archivePath: string): void {
  const extension = path.extname(archivePath).toLowerCase();
  if (!CHARACTER_PACK_ARCHIVE_EXTENSIONS.has(extension)) {
    throw new Error(`Unsupported character pack archive extension: ${extension || '(none)'}. Expected ${CHARACTER_PACK_ARCHIVE_EXTENSION} or .zip`);
  }
}

function normalizeEditorId(value: unknown, label: string): string {
  const normalized = normalizeString(value).trim().toLowerCase();
  if (!/^[a-z0-9][a-z0-9._-]{0,63}$/.test(normalized)) {
    throw new Error(`${label} 只能使用 1-64 位小写字母、数字、点、横线或下划线，并且必须以字母或数字开头`);
  }
  return normalized;
}

function normalizeEditorRequiredString(value: unknown, label: string, maxLength = 120): string {
  const normalized = normalizeString(value).trim();
  if (!normalized) {
    throw new Error(`${label} 不能为空`);
  }
  if (normalized.length > maxLength) {
    throw new Error(`${label} 不能超过 ${maxLength} 个字符`);
  }
  return normalized;
}

function normalizeEditorOptionalString(value: unknown, maxLength = 300): string | undefined {
  const normalized = normalizeString(value).trim();
  if (!normalized) {
    return undefined;
  }
  return normalized.slice(0, maxLength);
}

function normalizeEditorList(value: unknown, options?: { maxItems?: number; maxLength?: number }): string[] {
  const maxItems = options?.maxItems ?? 32;
  const maxLength = options?.maxLength ?? 120;
  const source = Array.isArray(value) ? value : typeof value === 'string' ? value.split(/[\n,，]/) : [];
  const seen = new Set<string>();
  const result: string[] = [];

  for (const item of source) {
    const normalized = normalizeString(item).trim().slice(0, maxLength);
    if (!normalized || seen.has(normalized)) {
      continue;
    }
    seen.add(normalized);
    result.push(normalized);
    if (result.length >= maxItems) {
      break;
    }
  }

  return result;
}

function normalizeEditorSpeechExamples(value: unknown): SpeechExample[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((entry) => {
      if (!isPlainObject(entry)) {
        return null;
      }

      const situation = normalizeString(entry.situation).trim().slice(0, 80);
      const response = normalizeString(entry.response).trim().slice(0, 300);
      return situation && response ? { situation, response } : null;
    })
    .filter((entry): entry is SpeechExample => !!entry)
    .slice(0, 12);
}

function normalizeEditorMessageEntry(value: unknown, options?: { maxItems?: number; maxLength?: number }): string[] {
  return normalizeEditorList(value, {
    maxItems: options?.maxItems ?? 8,
    maxLength: options?.maxLength ?? 180
  });
}

function normalizeEditorMessageText(value: unknown, fallback: string, maxLength = 180): string {
  const normalized = normalizeString(value).trim().slice(0, maxLength);
  return normalized || fallback;
}

function sanitizeEditorMessages(value: unknown, fallback?: CharacterPackEditorMessagesFields): CharacterPackEditorMessagesFields {
  const source: Record<string, unknown> = isPlainObject(value) ? value : {};
  const fallbackFields = fallback ?? buildDefaultCharacterMessageEditorFields();
  const progressKindLabelSource = isPlainObject(source.progressKindLabels) ? source.progressKindLabels : {};
  const progressSource = isPlainObject(source.progress) ? source.progress : {};
  const result = {
    progressKindLabels: {},
    progress: {}
  } as CharacterPackEditorMessagesFields;

  for (const spec of CHARACTER_MESSAGE_SPECS) {
    const messageSpec = spec as CharacterMessageSpec;
    const normalized = normalizeEditorMessageEntry(source[spec.field], {
      maxItems: messageSpec.maxItems,
      maxLength: messageSpec.maxLength
    });
    result[spec.field] = normalized.length ? normalized : fallbackFields[spec.field];
  }

  for (const spec of CHARACTER_PROGRESS_KIND_LABEL_SPECS) {
    result.progressKindLabels[spec.key] = normalizeEditorMessageText(progressKindLabelSource[spec.key], fallbackFields.progressKindLabels[spec.key], 40);
  }

  for (const spec of CHARACTER_PROGRESS_MESSAGE_SPECS) {
    result.progress[spec.key] = normalizeEditorMessageText(progressSource[spec.key], fallbackFields.progress[spec.key], 120);
  }

  return result;
}

function toMessageEntry(lines: string[]): CharacterMessageTemplateEntry | undefined {
  const normalized = normalizeEditorMessageEntry(lines);
  if (normalized.length === 0) {
    return undefined;
  }
  return normalized.length === 1 ? normalized[0] : normalized;
}

function setMessageEntry(target: Record<string, CharacterMessageTemplateEntry>, key: string, lines: string[]): void {
  const entry = toMessageEntry(lines);
  if (entry !== undefined) {
    target[key] = entry;
  }
}

function collectDefinedMessageEntries(source: Record<string, CharacterMessageTemplateEntry | undefined> | undefined): Record<string, CharacterMessageTemplateEntry> {
  const result: Record<string, CharacterMessageTemplateEntry> = {};
  for (const [key, value] of Object.entries(source ?? {})) {
    if (value !== undefined) {
      result[key] = value;
    }
  }
  return result;
}

function mergeEditorMessages(
  baseMessages: CharacterMessagesConfig | undefined,
  draftMessages: CharacterPackEditorMessagesFields,
  fallbackMessages: CharacterMessagesConfig
): CharacterMessagesConfig {
  const progress: CharacterProgressMessagesConfig | undefined = baseMessages?.progress ?? fallbackMessages.progress;
  const categories: Record<string, CharacterMessageTemplateEntry> = {
    ...collectDefinedMessageEntries(fallbackMessages.categories),
    ...collectDefinedMessageEntries(baseMessages?.categories)
  };
  const events: Record<string, CharacterMessageTemplateEntry> = {
    ...collectDefinedMessageEntries(fallbackMessages.events),
    ...collectDefinedMessageEntries(baseMessages?.events)
  };
  const routines: Record<string, CharacterMessageTemplateEntry> = {
    ...collectDefinedMessageEntries(fallbackMessages.routines),
    ...collectDefinedMessageEntries(baseMessages?.routines)
  };

  for (const spec of CHARACTER_MESSAGE_SPECS) {
    const target = spec.section === 'categories' ? categories : spec.section === 'events' ? events : routines;
    setMessageEntry(target, spec.key, draftMessages[spec.field]);
  }

  const progressKindLabels: Record<string, string> = {
    ...(fallbackMessages.progress?.kindLabels ?? {}),
    ...(baseMessages?.progress?.kindLabels ?? {})
  };
  for (const spec of CHARACTER_PROGRESS_KIND_LABEL_SPECS) {
    progressKindLabels[spec.key] = draftMessages.progressKindLabels[spec.key];
  }

  const mergedProgress: CharacterProgressMessagesConfig = {
    ...(progress ?? {}),
    kindLabels: progressKindLabels
  };
  for (const spec of CHARACTER_PROGRESS_MESSAGE_SPECS) {
    mergedProgress[spec.key] = draftMessages.progress[spec.key];
  }

  return {
    ...baseMessages,
    categories,
    events,
    routines,
    progress: mergedProgress
  };
}

function sanitizeEditorDraft(draft: CharacterPackEditorDraft): CharacterPackEditorDraft {
  const minAppVersion = normalizeEditorOptionalString(draft.pack.minAppVersion, 40);
  const fallbackMessages = buildDefaultCharacterMessageEditorFields(draft.character);

  return {
    pack: {
      id: normalizeEditorId(draft.pack.id, '角色包 ID'),
      name: normalizeEditorRequiredString(draft.pack.name, '角色包名称'),
      version: normalizeEditorRequiredString(draft.pack.version, '角色包版本', 40),
      author: normalizeEditorRequiredString(draft.pack.author, '作者', 80),
      description: normalizeString(draft.pack.description).trim().slice(0, 500),
      license: normalizeString(draft.pack.license).trim().slice(0, 80) || 'Custom',
      tags: normalizeEditorList(draft.pack.tags, { maxItems: 24, maxLength: 40 }),
      ...(minAppVersion ? { minAppVersion } : {}),
      platform: normalizeEditorList(draft.pack.platform, { maxItems: 8, maxLength: 20 })
    },
    character: {
      id: normalizeEditorId(draft.character.id, '角色 ID'),
      name: normalizeEditorRequiredString(draft.character.name, '角色名称'),
      nameAliases: normalizeEditorList(draft.character.nameAliases, { maxItems: 12, maxLength: 40 }),
      tagline: normalizeEditorRequiredString(draft.character.tagline, '角色标语', 120),
      background: normalizeEditorRequiredString(draft.character.background, '角色背景', 1200),
      coreTraits: normalizeEditorList(draft.character.coreTraits, { maxItems: 16, maxLength: 180 }),
      boundaries: normalizeEditorList(draft.character.boundaries, { maxItems: 16, maxLength: 220 }),
      speechTone: normalizeEditorRequiredString(draft.character.speechTone, '说话语气', 160),
      language: normalizeString(draft.character.language).trim().slice(0, 24) || 'zh-CN',
      firstPerson: normalizeString(draft.character.firstPerson).trim().slice(0, 24) || '我',
      addressUser: normalizeString(draft.character.addressUser).trim().slice(0, 24) || '你',
      quirks: normalizeEditorList(draft.character.quirks, { maxItems: 16, maxLength: 160 }),
      speechExamples: normalizeEditorSpeechExamples(draft.character.speechExamples),
      metaDescription: normalizeString(draft.character.metaDescription).trim().slice(0, 500),
      metaTags: normalizeEditorList(draft.character.metaTags, { maxItems: 24, maxLength: 40 })
    },
    messages: sanitizeEditorMessages(draft.messages, fallbackMessages)
  };
}

function createFallbackCharacterDefinition(draft: CharacterPackEditorDraft): CharacterDefinition {
  const messages = mergeEditorMessages(undefined, draft.messages ?? sanitizeEditorMessages(undefined, buildDefaultCharacterMessageEditorFields(draft.character)), buildDefaultCharacterMessages(draft.character));

  return {
    version: 1,
    id: draft.character.id,
    name: draft.character.name,
    nameAliases: draft.character.nameAliases,
    identity: {
      tagline: draft.character.tagline,
      background: draft.character.background,
      coreTraits: draft.character.coreTraits,
      boundaries: draft.character.boundaries
    },
    speechStyle: {
      tone: draft.character.speechTone,
      language: draft.character.language,
      firstPerson: draft.character.firstPerson,
      addressUser: draft.character.addressUser,
      examples: draft.character.speechExamples,
      quirks: draft.character.quirks
    },
    favorPersona: {
      stranger: {
        range: [0, 19],
        style: '礼貌但有些拘谨',
        systemPromptOverlay: '你和用户刚认识，说话时保持友善但不过于亲密。'
      },
      friend: {
        range: [20, 79],
        style: '自然友善',
        systemPromptOverlay: '你和用户已经熟悉了，说话自然随意，可以主动分享你的想法。'
      },
      soulmate: {
        range: [80, 100],
        style: '亲密信赖',
        systemPromptOverlay: '你和用户非常亲近，说话可以更有默契，也会主动关心用户的状态。'
      }
    },
    moodExpressions: {
      neutral: { animation: 'idle', messageStyle: '正常语气' },
      joyful: { animation: 'idle', messageStyle: '语气更积极' },
      curious: { animation: 'idle', messageStyle: '语气好奇，会适当追问' }
    },
    dimensions: {
      schema: [],
      extensible: true
    },
    messages,
    meta: {
      author: draft.pack.author,
      version: draft.pack.version,
      license: draft.pack.license,
      description: draft.character.metaDescription || draft.pack.description,
      tags: draft.character.metaTags.length > 0 ? draft.character.metaTags : draft.pack.tags,
      createdAt: new Date().toISOString().slice(0, 10),
      updatedAt: new Date().toISOString().slice(0, 10)
    }
  };
}

function applyEditorDraftToCharacter(baseCharacter: CharacterDefinition | null, draft: CharacterPackEditorDraft, options: { preserveBaseMessages?: boolean } = {}): CharacterDefinition {
  const fallback = createFallbackCharacterDefinition(draft);
  const base = baseCharacter ?? fallback;
  const nowDate = new Date().toISOString().slice(0, 10);
  const baseMeta = base.meta ?? fallback.meta;
  const generatedMessages = buildDefaultCharacterMessages(draft.character);
  const baseMessages = options.preserveBaseMessages ? base.messages : undefined;
  const draftMessages = draft.messages ?? createCharacterMessageEditorFields(baseMessages, generatedMessages);

  return {
    ...base,
    version: typeof base.version === 'number' ? base.version : 1,
    id: draft.character.id,
    name: draft.character.name,
    nameAliases: draft.character.nameAliases,
    identity: {
      ...(base.identity ?? fallback.identity),
      tagline: draft.character.tagline,
      background: draft.character.background,
      coreTraits: draft.character.coreTraits,
      boundaries: draft.character.boundaries
    },
    speechStyle: {
      ...(base.speechStyle ?? fallback.speechStyle),
      tone: draft.character.speechTone,
      language: draft.character.language,
      firstPerson: draft.character.firstPerson,
      addressUser: draft.character.addressUser,
      examples: draft.character.speechExamples,
      quirks: draft.character.quirks
    },
    messages: mergeEditorMessages(baseMessages, draftMessages, generatedMessages),
    meta: {
      ...baseMeta,
      author: draft.pack.author,
      version: draft.pack.version,
      license: draft.pack.license,
      description: draft.character.metaDescription || draft.pack.description || baseMeta.description,
      tags: draft.character.metaTags.length > 0 ? draft.character.metaTags : draft.pack.tags,
      createdAt: baseMeta.createdAt || nowDate,
      updatedAt: nowDate
    }
  };
}

function buildEditorPackDefinition(basePack: CharacterPackSummary | null, draft: CharacterPackEditorDraft, options: { resetAnimations?: boolean } = {}): CharacterPackDefinition {
  const language = draft.character.language.trim();
  const supportedLanguages = Array.from(new Set([...(basePack?.capabilities?.supportedLanguages ?? []), ...(language ? [language] : [])]));
  const baseAssets = options.resetAnimations ? undefined : basePack?.assets;
  const assets: CharacterPackAssets = {
    ...(baseAssets ?? {}),
    character: 'character.json',
    animations: options.resetAnimations ? EDITOR_ANIMATION_INDEX_PATH : (baseAssets?.animations ?? EDITOR_ANIMATION_INDEX_PATH),
    gallery: baseAssets?.gallery ?? EDITOR_GALLERY_INDEX_PATH
  };

  return {
    formatVersion: SUPPORTED_CHARACTER_PACK_FORMAT_VERSION,
    id: draft.pack.id,
    name: draft.pack.name,
    version: draft.pack.version,
    author: draft.pack.author,
    description: draft.pack.description,
    license: draft.pack.license,
    tags: draft.pack.tags,
    ...(draft.pack.minAppVersion ? { minAppVersion: draft.pack.minAppVersion } : {}),
    platform: draft.pack.platform.length > 0 ? draft.pack.platform : [process.platform],
    assets,
    provenance: {
      channel: 'local',
      publisher: draft.pack.author
    },
    capabilities: {
      ...(basePack?.capabilities ?? {}),
      hasCustomAnimations: basePack?.capabilities?.hasCustomAnimations ?? true,
      ...(supportedLanguages.length > 0 ? { supportedLanguages } : {})
    }
  };
}

function buildEditorDraftFromDefinitions(pack: CharacterPackSummary, character: CharacterDefinition | null): CharacterPackEditorDraft {
  const generatedMessages = buildDefaultCharacterMessages(character ?? { name: pack.name });
  const messageSource = pack.source === 'installed' ? character?.messages : undefined;
  const fallbackDraft: CharacterPackEditorDraft = {
    pack: {
      id: pack.id,
      name: pack.name,
      version: pack.version,
      author: pack.author,
      description: pack.description,
      license: pack.license || 'Custom',
      tags: pack.tags ?? [],
      ...(pack.minAppVersion ? { minAppVersion: pack.minAppVersion } : {}),
      platform: pack.platform ?? [process.platform]
    },
    character: {
      id: character?.id ?? pack.id,
      name: character?.name ?? pack.name,
      nameAliases: character?.nameAliases ?? [],
      tagline: character?.identity?.tagline ?? pack.description ?? pack.name,
      background: character?.identity?.background ?? `你是 ${pack.name}，一个陪伴用户工作的桌面精灵。`,
      coreTraits: character?.identity?.coreTraits ?? [],
      boundaries: character?.identity?.boundaries ?? [],
      speechTone: character?.speechStyle?.tone ?? '温和、自然',
      language: character?.speechStyle?.language ?? 'zh-CN',
      firstPerson: character?.speechStyle?.firstPerson ?? '我',
      addressUser: character?.speechStyle?.addressUser ?? '你',
      quirks: character?.speechStyle?.quirks ?? [],
      speechExamples: character?.speechStyle?.examples ?? [],
      metaDescription: character?.meta?.description ?? pack.description ?? '',
      metaTags: character?.meta?.tags ?? pack.tags ?? []
    },
    messages: createCharacterMessageEditorFields(messageSource, generatedMessages)
  };

  return sanitizeEditorDraft(fallbackDraft);
}

async function readCharacterDefinitionForPack(pack: CharacterPackSummary): Promise<CharacterDefinition | null> {
  const characterPath = pack.resolvedAssets.character ?? path.join(pack.rootDir, 'character.json');
  try {
    return JSON.parse(await fsp.readFile(characterPath, 'utf-8')) as CharacterDefinition;
  } catch {
    return null;
  }
}

async function writeJsonFile(filePath: string, value: unknown): Promise<void> {
  await fsp.mkdir(path.dirname(filePath), { recursive: true });
  await fsp.writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf-8');
}

function normalizeAnimationIndexPath(rootDir: string, declaredPath: string): string {
  const resolvedPath = resolvePackRelativeAssetPath(rootDir, declaredPath);
  if (!resolvedPath) {
    throw new Error(`Animation index path must stay inside character pack: ${declaredPath}`);
  }

  return path.extname(resolvedPath).toLowerCase() === '.json' ? resolvedPath : path.join(resolvedPath, 'index.json');
}

async function ensureEmptyAnimationIndex(rootDir: string, declaredPath: string): Promise<void> {
  await writeJsonFile(normalizeAnimationIndexPath(rootDir, declaredPath), {
    version: 1,
    items: []
  });
}

async function ensureAnimationIndexExists(rootDir: string, declaredPath: string): Promise<void> {
  const indexPath = normalizeAnimationIndexPath(rootDir, declaredPath);
  if (fs.existsSync(indexPath)) {
    return;
  }

  await writeJsonFile(indexPath, {
    version: 1,
    items: []
  });
}

async function ensureGalleryIndexExists(rootDir: string, declaredPath: string): Promise<void> {
  const resolvedPath = resolvePackRelativeAssetPath(rootDir, declaredPath);
  if (!resolvedPath) {
    throw new Error(`Gallery index path must stay inside character pack: ${declaredPath}`);
  }

  const indexPath = path.extname(resolvedPath).toLowerCase() === '.json' ? resolvedPath : path.join(resolvedPath, 'index.json');
  if (fs.existsSync(indexPath)) {
    return;
  }

  await writeJsonFile(indexPath, {
    version: 1,
    items: []
  });
}

export class CharacterPackManager {
  private readonly builtinPackRootDir: string;
  private readonly installedPacksDir: string;
  private readonly activePackStateFile: string;
  private readonly importPreviewCacheDir: string;
  private readonly trustRootFile: string;
  private readonly appVersion?: string;
  private trustRootCache: CharacterPackTrustRoot | null | undefined;

  constructor(options: CharacterPackManagerOptions) {
    const userDataDir = path.resolve(options.userDataDir);
    this.builtinPackRootDir = path.resolve(options.builtinPackRootDir);
    this.installedPacksDir = path.join(userDataDir, 'data', 'character-packs');
    this.activePackStateFile = path.join(userDataDir, 'data', 'active-character-pack.json');
    this.importPreviewCacheDir = path.join(userDataDir, 'data', 'character-pack-import-previews');
    this.trustRootFile = path.join(this.builtinPackRootDir, 'trust-root.json');
    this.appVersion = options.appVersion?.trim() || undefined;
  }

  async listPacks(): Promise<CharacterPackSummary[]> {
    const [trustRoot, activeState] = await Promise.all([this.getTrustRoot(), this.readActiveState()]);
    const [builtinPack, installedPacks] = await Promise.all([readCharacterPackAtRoot(this.builtinPackRootDir, 'builtin', { trustRoot }), this.listInstalledPacks(trustRoot)]);

    const packs = [builtinPack, ...installedPacks]
      .filter((pack): pack is CharacterPackSummary => !!pack)
      .sort((left, right) => {
        if (left.source !== right.source) {
          return left.source === 'builtin' ? -1 : 1;
        }
        return left.name.localeCompare(right.name, 'zh-CN');
      });

    let resolvedActive = this.resolveActiveState(packs, activeState);
    if (resolvedActive) {
      const activePack = packs.find((pack) => matchesPackState(pack, resolvedActive));
      if (activePack) {
        const usage = ensurePackFirstUsedAt(resolvedActive, activePack);
        resolvedActive = usage.state;
        if (usage.changed || !matchesPackState(activePack, activeState)) {
          await this.writeActiveState(resolvedActive);
        }
      }
    }

    return packs.map((pack) => ({
      ...withPackCompanionSince(pack, resolvedActive),
      isActive: matchesPackState(pack, resolvedActive)
    }));
  }

  async getActivePack(): Promise<CharacterPackSummary | null> {
    const packs = await this.listPacks();
    return packs.find((pack) => pack.isActive) ?? null;
  }

  async activatePack(packId: string, options?: { source?: CharacterPackSource }): Promise<CharacterPackActivationResult | null> {
    const normalizedId = packId.trim();
    if (!normalizedId) {
      return null;
    }

    const packs = await this.listPacks();
    const targetPack = this.resolvePackById(packs, normalizedId, options?.source);

    if (!targetPack) {
      return null;
    }

    const currentState = await this.readActiveState();
    const usage = ensurePackFirstUsedAt(buildActivePackState(targetPack, currentState), targetPack);
    await this.writeActiveState(usage.state);

    return {
      changed: !targetPack.isActive,
      pack: withPackCompanionSince(
        {
          ...targetPack,
          isActive: true
        },
        usage.state
      )
    };
  }

  private async installPreparedPackDirectory(sourceDir: string, options?: CharacterPackInstallOptions): Promise<CharacterPackInstallResult> {
    const normalizedSourceDir = path.resolve(sourceDir);
    await assertCharacterPackDirectorySafe(normalizedSourceDir);
    const trustRoot = await this.getTrustRoot();
    const sourcePack = await readCharacterPackAtRoot(normalizedSourceDir, 'installed', {
      trustRoot
    });
    if (!sourcePack) {
      throw new Error(`Invalid character pack directory: ${normalizedSourceDir}`);
    }

    this.assertPackInstallable(sourcePack);

    await fsp.mkdir(this.installedPacksDir, { recursive: true });
    const destinationRootDir = path.join(this.installedPacksDir, sourcePack.id);
    const destinationExists = fs.existsSync(destinationRootDir);
    const isSameDirectory = normalizedSourceDir === destinationRootDir;
    const replaceExisting = options?.replaceExisting === true;

    if (!isSameDirectory && destinationExists && !replaceExisting) {
      throw new Error(`Character pack already installed: ${sourcePack.id}`);
    }

    if (!isSameDirectory) {
      if (destinationExists && replaceExisting) {
        await fsp.rm(destinationRootDir, { recursive: true, force: true });
      }

      await this.copyPackDirectory(normalizedSourceDir, destinationRootDir);
    }

    const installedPack = await readCharacterPackAtRoot(destinationRootDir, 'installed', {
      trustRoot
    });
    if (!installedPack) {
      throw new Error(`Installed character pack is invalid: ${destinationRootDir}`);
    }

    let activated = false;
    let finalPack = installedPack;

    if (options?.activate) {
      const activation = await this.activatePack(installedPack.id, { source: 'installed' });
      if (activation) {
        activated = true;
        finalPack = activation.pack;
      }
    } else {
      const activePack = await this.getActivePack();
      finalPack = {
        ...installedPack,
        isActive: !!activePack && activePack.id === installedPack.id && activePack.source === installedPack.source
      };
    }

    return {
      replaced: destinationExists && !isSameDirectory,
      activated,
      pack: finalPack
    };
  }

  async installFromArchive(archivePath: string, options?: CharacterPackInstallOptions): Promise<CharacterPackInstallResult> {
    const normalizedArchivePath = path.resolve(archivePath);
    assertCharacterPackArchiveExtension(normalizedArchivePath);
    await assertCharacterPackArchivePreflight(normalizedArchivePath);
    const tempExtractDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'character-pack-import-'));

    try {
      await unzipFileWith7Z(normalizedArchivePath, tempExtractDir);
      await assertCharacterPackDirectorySafe(tempExtractDir);
      const extractedPackRootDir = await resolveArchivePackRootDir(tempExtractDir);
      if (!extractedPackRootDir) {
        throw new Error(`Unable to resolve extracted character pack root: ${normalizedArchivePath}`);
      }

      return await this.installPreparedPackDirectory(extractedPackRootDir, options);
    } finally {
      await fsp.rm(tempExtractDir, { recursive: true, force: true }).catch(() => undefined);
    }
  }

  async inspectArchive(archivePath: string): Promise<CharacterPackImportInspection> {
    const normalizedArchivePath = path.resolve(archivePath);
    assertCharacterPackArchiveExtension(normalizedArchivePath);
    await assertCharacterPackArchivePreflight(normalizedArchivePath);
    const tempExtractDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'character-pack-import-'));

    try {
      await unzipFileWith7Z(normalizedArchivePath, tempExtractDir);
      await assertCharacterPackDirectorySafe(tempExtractDir);
      const extractedPackRootDir = await resolveArchivePackRootDir(tempExtractDir);
      if (!extractedPackRootDir) {
        throw new Error(`Unable to resolve extracted character pack root: ${normalizedArchivePath}`);
      }

      const sourcePack = await readCharacterPackAtRoot(extractedPackRootDir, 'installed', {
        trustRoot: await this.getTrustRoot()
      });
      if (!sourcePack) {
        throw new Error(`Invalid character pack archive: ${normalizedArchivePath}`);
      }
      const previewAssets = await this.cacheImportPreviewAssets({
        sourcePath: normalizedArchivePath,
        sourcePack
      });

      return await this.buildImportInspection({
        sourceType: 'archive',
        sourcePath: normalizedArchivePath,
        sourcePack,
        previewAssets
      });
    } finally {
      await fsp.rm(tempExtractDir, { recursive: true, force: true }).catch(() => undefined);
    }
  }

  async exportPack(packId: string, outputPath: string, options?: { source?: CharacterPackSource }): Promise<CharacterPackExportResult | null> {
    const normalizedId = packId.trim();
    if (!normalizedId) {
      return null;
    }

    const packs = await this.listPacks();
    const targetPack = this.resolvePackById(packs, normalizedId, options?.source);
    if (!targetPack) {
      return null;
    }

    const normalizedOutputPath = resolveCharacterPackExportPath(outputPath);
    if (isPathContainedByRoot(path.resolve(targetPack.rootDir), normalizedOutputPath)) {
      throw new Error(`Character pack export path must be outside the pack directory: ${targetPack.rootDir}`);
    }

    await assertCharacterPackDirectorySafe(targetPack.rootDir);
    await fsp.mkdir(path.dirname(normalizedOutputPath), { recursive: true });
    try {
      const existingOutput = await fsp.stat(normalizedOutputPath);
      if (existingOutput.isDirectory()) {
        throw new Error(`Character pack export path points to a directory: ${normalizedOutputPath}`);
      }
      await fsp.rm(normalizedOutputPath, { force: true });
    } catch (error: any) {
      if (error?.code !== 'ENOENT') {
        throw error;
      }
    }

    const tempExportDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'character-pack-export-'));
    try {
      const stagingPackDir = path.join(tempExportDir, 'pack');
      await this.copyPackDirectory(targetPack.rootDir, stagingPackDir);
      await zipDirectoryContentsWith7Z(stagingPackDir, normalizedOutputPath);
      const outputStats = await fsp.stat(normalizedOutputPath);

      return {
        pack: targetPack,
        outputPath: normalizedOutputPath,
        bytes: outputStats.size
      };
    } finally {
      await fsp.rm(tempExportDir, { recursive: true, force: true }).catch(() => undefined);
    }
  }

  async removePack(packId: string, options?: { source?: CharacterPackSource }): Promise<CharacterPackRemovalResult | null> {
    const normalizedId = packId.trim();
    if (!normalizedId) {
      return null;
    }

    const packs = await this.listPacks();
    const targetPack = this.resolvePackById(packs, normalizedId, options?.source);

    if (!targetPack) {
      return null;
    }

    if (targetPack.source !== 'installed') {
      throw new Error(`Cannot remove builtin character pack: ${targetPack.id}`);
    }

    if (targetPack.isActive) {
      throw new Error(`Cannot remove active character pack: ${targetPack.id}`);
    }

    await fsp.rm(targetPack.rootDir, { recursive: true, force: true });
    const activePack = await this.getActivePack();

    return {
      removedPack: targetPack,
      activePack,
      switchedActivePack: false
    };
  }

  async getEditorDraft(packId: string, options?: { source?: CharacterPackSource }): Promise<CharacterPackEditorDraft | null> {
    const normalizedId = packId.trim();
    if (!normalizedId) {
      return null;
    }

    const packs = await this.listPacks();
    const pack = this.resolvePackById(packs, normalizedId, options?.source);
    if (!pack) {
      return null;
    }

    return buildEditorDraftFromDefinitions(pack, await readCharacterDefinitionForPack(pack));
  }

  async saveEditorDraft(draft: CharacterPackEditorDraft, options?: CharacterPackEditorSaveOptions): Promise<CharacterPackEditorSaveResult> {
    const sanitizedDraft = sanitizeEditorDraft(draft);
    await fsp.mkdir(this.installedPacksDir, { recursive: true });

    const packs = await this.listPacks();
    const existingInstalledPack = this.resolvePackById(packs, sanitizedDraft.pack.id, 'installed');
    const destinationRootDir = path.join(this.installedPacksDir, sanitizedDraft.pack.id);
    const destinationExists = fs.existsSync(destinationRootDir);
    const replaceExisting = options?.replaceExisting === true;
    const isUpdatingExistingPack = !!existingInstalledPack && replaceExisting;
    if ((existingInstalledPack || destinationExists) && !replaceExisting) {
      throw new Error(`Character pack already exists: ${sanitizedDraft.pack.id}`);
    }

    const requestedBasePack = options?.basePackId?.trim() ? this.resolvePackById(packs, options.basePackId.trim(), options.basePackSource) : null;
    const activePack = packs.find((pack) => pack.isActive) ?? null;
    const basePack = requestedBasePack ?? existingInstalledPack ?? activePack ?? packs.find((pack) => pack.source === 'builtin') ?? packs[0] ?? null;
    if (!basePack) {
      throw new Error('No character pack can be used as an editing base');
    }

    const tempDraftDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'character-pack-editor-'));
    const stagingRootDir = path.join(tempDraftDir, 'pack');
    try {
      if (isUpdatingExistingPack) {
        await this.copyPackDirectory(basePack.rootDir, stagingRootDir);
      } else {
        await fsp.mkdir(stagingRootDir, { recursive: true });
      }

      const characterDefinition = applyEditorDraftToCharacter(await readCharacterDefinitionForPack(basePack), sanitizedDraft, {
        preserveBaseMessages: isUpdatingExistingPack || basePack.source === 'installed'
      });
      const packDefinition = buildEditorPackDefinition(basePack, sanitizedDraft, {
        resetAnimations: !isUpdatingExistingPack
      });
      await writeJsonFile(path.join(stagingRootDir, 'pack.json'), packDefinition);
      await writeJsonFile(path.join(stagingRootDir, 'character.json'), characterDefinition);
      if (packDefinition.assets?.animations) {
        if (isUpdatingExistingPack) {
          await ensureAnimationIndexExists(stagingRootDir, packDefinition.assets.animations);
        } else {
          await ensureEmptyAnimationIndex(stagingRootDir, packDefinition.assets.animations);
        }
      }
      if (packDefinition.assets?.gallery) {
        await ensureGalleryIndexExists(stagingRootDir, packDefinition.assets.gallery);
      }
      await assertCharacterPackDirectorySafe(stagingRootDir);

      const stagingPack = await readCharacterPackAtRoot(stagingRootDir, 'installed', {
        trustRoot: await this.getTrustRoot()
      });
      if (!stagingPack) {
        throw new Error(`Generated character pack is invalid: ${sanitizedDraft.pack.id}`);
      }
      this.assertPackInstallable(stagingPack);

      if (destinationExists) {
        await fsp.rm(destinationRootDir, { recursive: true, force: true });
      }
      await this.copyPackDirectory(stagingRootDir, destinationRootDir);
    } finally {
      await fsp.rm(tempDraftDir, { recursive: true, force: true }).catch(() => undefined);
    }

    const installedPack = await readCharacterPackAtRoot(destinationRootDir, 'installed', {
      trustRoot: await this.getTrustRoot()
    });
    if (!installedPack) {
      throw new Error(`Saved character pack is invalid: ${destinationRootDir}`);
    }

    let activated = false;
    let finalPack = installedPack;
    if (options?.activate) {
      const activation = await this.activatePack(installedPack.id, { source: 'installed' });
      if (activation) {
        activated = true;
        finalPack = activation.pack;
      }
    } else {
      const active = await this.getActivePack();
      finalPack = {
        ...installedPack,
        isActive: !!active && active.id === installedPack.id && active.source === installedPack.source
      };
    }

    return {
      created: !destinationExists,
      updated: destinationExists,
      replaced: destinationExists,
      activated,
      pack: finalPack
    };
  }

  async resolveActivePackRootDir(): Promise<string | null> {
    return (await this.getActivePack())?.rootDir ?? null;
  }

  getImportPreviewCacheRootDir(): string {
    return this.importPreviewCacheDir;
  }

  private async listInstalledPacks(trustRoot: CharacterPackTrustRoot | null): Promise<CharacterPackSummary[]> {
    try {
      const entries = await fsp.readdir(this.installedPacksDir, { withFileTypes: true });
      const packs = await Promise.all(
        entries
          .filter((entry) => entry.isDirectory())
          .map((entry) =>
            readCharacterPackAtRoot(path.join(this.installedPacksDir, entry.name), 'installed', {
              trustRoot
            })
          )
      );

      return packs.filter((pack): pack is CharacterPackSummary => !!pack);
    } catch {
      return [];
    }
  }

  private async getTrustRoot(): Promise<CharacterPackTrustRoot | null> {
    if (this.trustRootCache !== undefined) {
      return this.trustRootCache;
    }

    this.trustRootCache = await loadCharacterPackTrustRoot(this.trustRootFile);
    return this.trustRootCache;
  }

  private resolvePackById(packs: CharacterPackSummary[], normalizedId: string, source?: CharacterPackSource): CharacterPackSummary | null {
    return (
      packs.find((pack) => pack.id === normalizedId && (!source || pack.source === source)) ??
      (!source ? packs.find((pack) => pack.id === normalizedId && pack.source === 'installed') : undefined) ??
      (!source ? packs.find((pack) => pack.id === normalizedId) : undefined) ??
      null
    );
  }

  private async copyPackDirectory(sourceRootDir: string, destinationRootDir: string): Promise<void> {
    const normalizedSourceRootDir = path.resolve(sourceRootDir);
    await fsp.cp(normalizedSourceRootDir, destinationRootDir, {
      recursive: true,
      filter: async (sourcePath) => {
        await assertCharacterPackEntrySafe(normalizedSourceRootDir, sourcePath);
        return true;
      }
    });
  }

  private async buildImportInspection(options: {
    sourceType: CharacterPackImportSourceType;
    sourcePath: string;
    sourcePack: CharacterPackSummary;
    previewAssets?: {
      avatar?: string;
      gif?: string;
      video?: string;
    };
  }): Promise<CharacterPackImportInspection> {
    const packs = await this.listPacks();
    const activePack = packs.find((pack) => pack.isActive) ?? null;
    const existingPack = this.resolvePackById(packs, options.sourcePack.id, 'installed');
    const assessment = assessCharacterPackImport(options.sourcePack, {
      currentAppVersion: this.appVersion
    });

    return {
      sourceType: options.sourceType,
      sourcePath: options.sourcePath,
      pack: buildCharacterPackImportPreview(options.sourcePack, {
        previewAssets: options.previewAssets
      }),
      existingPack,
      activePack,
      requiresReplace: !!existingPack,
      willReplaceActive: !!existingPack?.isActive,
      installable: assessment.blockingErrors.length === 0,
      blockingErrors: assessment.blockingErrors,
      warnings: assessment.warnings,
      compatibility: assessment.compatibility
    };
  }

  private async cacheImportPreviewAssets(options: { sourcePath: string; sourcePack: CharacterPackSummary }): Promise<{ avatar?: string; gif?: string; video?: string }> {
    const avatarSourcePath = options.sourcePack.resolvedAssets.preview?.avatar;
    const gifSourcePath = options.sourcePack.resolvedAssets.preview?.gif;
    const videoSourcePath = options.sourcePack.resolvedAssets.preview?.video;

    const hasAvatar = !!avatarSourcePath && fs.existsSync(avatarSourcePath);
    const hasGif = !!gifSourcePath && fs.existsSync(gifSourcePath);
    const hasVideo = !!videoSourcePath && fs.existsSync(videoSourcePath);
    if (!hasAvatar && !hasGif && !hasVideo) {
      return {};
    }

    await fsp.mkdir(this.importPreviewCacheDir, { recursive: true });
    const cacheKey = await this.buildImportPreviewCacheKey(options);
    const cacheDir = path.join(this.importPreviewCacheDir, cacheKey);
    await fsp.rm(cacheDir, { recursive: true, force: true }).catch(() => undefined);
    await fsp.mkdir(cacheDir, { recursive: true });

    const avatar = hasAvatar ? await this.copyImportPreviewAsset(avatarSourcePath!, path.join(cacheDir, `avatar${path.extname(avatarSourcePath!) || '.png'}`)) : undefined;
    const gif = hasGif ? await this.copyImportPreviewAsset(gifSourcePath!, path.join(cacheDir, `preview${path.extname(gifSourcePath!) || '.gif'}`)) : undefined;
    const video = hasVideo ? await this.copyImportPreviewAsset(videoSourcePath!, path.join(cacheDir, `preview-video${path.extname(videoSourcePath!) || '.webm'}`)) : undefined;

    await this.pruneImportPreviewCache();

    return {
      ...(avatar ? { avatar } : {}),
      ...(gif ? { gif } : {}),
      ...(video ? { video } : {})
    };
  }

  private async buildImportPreviewCacheKey(options: { sourcePath: string; sourcePack: CharacterPackSummary }): Promise<string> {
    const hash = createHash('sha1');
    hash.update('archive');
    hash.update('\0');
    hash.update(path.resolve(options.sourcePath));
    hash.update('\0');
    hash.update(options.sourcePack.id);
    hash.update('\0');
    hash.update(options.sourcePack.version);
    await this.appendImportPreviewCacheStat(hash, options.sourcePath);

    return hash.digest('hex').slice(0, 20);
  }

  private async appendImportPreviewCacheStat(hash: ReturnType<typeof createHash>, targetPath?: string): Promise<void> {
    if (!targetPath) {
      hash.update('\0missing');
      return;
    }

    try {
      const stat = await fsp.stat(targetPath);
      hash.update('\0');
      hash.update(path.resolve(targetPath));
      hash.update('\0');
      hash.update(String(stat.size));
      hash.update('\0');
      hash.update(String(Math.trunc(stat.mtimeMs)));
    } catch {
      hash.update('\0missing');
    }
  }

  private async copyImportPreviewAsset(sourcePath: string, destinationPath: string): Promise<string> {
    await fsp.copyFile(sourcePath, destinationPath);
    return destinationPath;
  }

  private async pruneImportPreviewCache(): Promise<void> {
    try {
      const entries = await fsp.readdir(this.importPreviewCacheDir, { withFileTypes: true });
      const directories = entries.filter((entry) => entry.isDirectory());
      if (directories.length <= IMPORT_PREVIEW_CACHE_LIMIT) {
        return;
      }

      const ordered = await Promise.all(
        directories.map(async (entry) => {
          const fullPath = path.join(this.importPreviewCacheDir, entry.name);
          const stat = await fsp.stat(fullPath);
          return {
            fullPath,
            mtimeMs: stat.mtimeMs
          };
        })
      );

      ordered.sort((left, right) => right.mtimeMs - left.mtimeMs);
      await Promise.all(ordered.slice(IMPORT_PREVIEW_CACHE_LIMIT).map((entry) => fsp.rm(entry.fullPath, { recursive: true, force: true }).catch(() => undefined)));
    } catch {
      // best-effort cache pruning only
    }
  }

  private assertPackInstallable(pack: CharacterPackSummary): void {
    const assessment = assessCharacterPackImport(pack, {
      currentAppVersion: this.appVersion
    });
    if (assessment.blockingErrors.length === 0) {
      return;
    }

    throw new Error(assessment.blockingErrors.map((entry) => entry.message).join('；'));
  }

  private resolveActiveState(packs: CharacterPackSummary[], persistedState: ActiveCharacterPackState | null): ActiveCharacterPackState | null {
    const persistedMatch = persistedState ? packs.find((pack) => matchesPackState(pack, persistedState)) : undefined;
    if (persistedMatch) {
      return persistedState;
    }

    const builtinPack = packs.find((pack) => pack.source === 'builtin');
    if (builtinPack) {
      return buildActivePackState(builtinPack, persistedState);
    }

    const firstPack = packs[0];
    if (!firstPack) {
      return null;
    }

    return buildActivePackState(firstPack, persistedState);
  }

  private async readActiveState(): Promise<ActiveCharacterPackState | null> {
    try {
      const raw = JSON.parse(await fsp.readFile(this.activePackStateFile, 'utf-8'));
      if (!isPlainObject(raw)) {
        return null;
      }

      const id = normalizeString(raw.id).trim();
      const source = raw.source === 'installed' ? 'installed' : raw.source === 'builtin' ? 'builtin' : null;
      if (!id || !source) {
        return null;
      }

      const firstUsedAtByPack = normalizePackUsageMap(raw.firstUsedAtByPack);
      return {
        version: 1,
        id,
        source,
        ...(firstUsedAtByPack ? { firstUsedAtByPack } : {})
      };
    } catch {
      return null;
    }
  }

  private async writeActiveState(state: ActiveCharacterPackState): Promise<void> {
    const firstUsedAtByPack = normalizePackUsageMap(state.firstUsedAtByPack);
    await writeJsonFile(this.activePackStateFile, {
      version: 1,
      id: state.id,
      source: state.source,
      ...(firstUsedAtByPack ? { firstUsedAtByPack } : {})
    });
  }
}

let characterPackManager: CharacterPackManager | null = null;

export function initCharacterPackManager(options: CharacterPackManagerOptions): CharacterPackManager {
  characterPackManager = new CharacterPackManager(options);
  return characterPackManager;
}

export function resetCharacterPackManager(): void {
  characterPackManager = null;
}

function getManager(): CharacterPackManager {
  if (!characterPackManager) {
    throw new Error('CharacterPackManager has not been initialized');
  }
  return characterPackManager;
}

export async function listCharacterPacks(): Promise<CharacterPackSummary[]> {
  return getManager().listPacks();
}

export async function getActiveCharacterPack(): Promise<CharacterPackSummary | null> {
  return getManager().getActivePack();
}

export async function activateCharacterPack(packId: string, options?: { source?: CharacterPackSource }): Promise<CharacterPackActivationResult | null> {
  return getManager().activatePack(packId, options);
}

export async function inspectCharacterPackFromArchive(archivePath: string): Promise<CharacterPackImportInspection> {
  return getManager().inspectArchive(archivePath);
}

export async function installCharacterPackFromArchive(archivePath: string, options?: CharacterPackInstallOptions): Promise<CharacterPackInstallResult> {
  return getManager().installFromArchive(archivePath, options);
}

export async function exportCharacterPack(packId: string, outputPath: string, options?: { source?: CharacterPackSource }): Promise<CharacterPackExportResult | null> {
  return getManager().exportPack(packId, outputPath, options);
}

export async function removeCharacterPack(packId: string, options?: { source?: CharacterPackSource }): Promise<CharacterPackRemovalResult | null> {
  return getManager().removePack(packId, options);
}

export async function getCharacterPackEditorDraft(packId: string, options?: { source?: CharacterPackSource }): Promise<CharacterPackEditorDraft | null> {
  return getManager().getEditorDraft(packId, options);
}

export async function saveCharacterPackEditorDraft(draft: CharacterPackEditorDraft, options?: CharacterPackEditorSaveOptions): Promise<CharacterPackEditorSaveResult> {
  return getManager().saveEditorDraft(draft, options);
}

export async function getActiveCharacterPackRootDir(): Promise<string | null> {
  return getManager().resolveActivePackRootDir();
}

export function getCharacterPackImportPreviewCacheRootDir(): string {
  return getManager().getImportPreviewCacheRootDir();
}
