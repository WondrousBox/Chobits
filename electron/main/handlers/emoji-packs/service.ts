import * as fs from 'node:fs/promises';
import * as path from 'node:path';

import { app, shell } from 'electron';

import { unpack } from '../../../../packages/common/libs/7zip-min-electron';
import { WorkspacesRepo } from '../../db/repositories';
import { addAllowedResourceRoot, addWorkspaceResourceRoot } from '../../resource-protocol';
import { ensureUniquePath } from '../folder/linked-utils';
import type {
  EmojiPackImportResult,
  EmojiPackListNode,
  EmojiPackManifest,
  EmojiPackSearchResult,
  EmojiPackSettings,
  EmojiPackSummary,
  EmojiPackTreeFile,
  EmojiPackTreeFolder,
  EmojiPackTreeNode
} from './types';

const MANIFEST_FILE = 'emoji-pack.manifest.json';
const SETTINGS_FILE = 'emoji-packs-settings.json';
const EMOJI_PACK_DIR_NAME = 'emoji-packs';
const WORKSPACE_RESOURCE_DIR_NAME = 'resources';
const MAX_SCAN_FILES = 12000;
const MAX_SEARCH_RESULTS = 24;
const IMAGE_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp', '.svg', '.ico']);
const ARCHIVE_EXTENSIONS = new Set(['.zip', '.7z', '.rar', '.tar', '.gz', '.tgz']);
const SKIP_DIRS = new Set(['.git', '.svn', '.hg', 'node_modules', '__MACOSX']);

type EmojiPackStorageTarget = {
  baseDir: string;
  resourcesRootPath: string;
  storageKind: 'userData' | 'workspace';
  workspaceId?: string;
  workspaceRootPath?: string;
};

function dataRoot(): string {
  return path.join(app.getPath('userData'), 'data');
}

function settingsPath(): string {
  return path.join(dataRoot(), SETTINGS_FILE);
}

function normalizeRelativePath(value?: string | null): string {
  return String(value || '')
    .replace(/\\/g, '/')
    .replace(/^\/+|\/+$/g, '');
}

function toDisplayTitle(fileName: string): string {
  const stem = path.basename(fileName, path.extname(fileName));
  return stem.replace(/[_-]+/g, ' ').trim() || fileName;
}

function sanitizePackIdStem(name: string): string {
  const cleaned = name
    .trim()
    .split('')
    .map((char) => {
      const code = char.charCodeAt(0);
      return code < 32 || /[<>:"/\\|?*]/.test(char) ? '-' : char;
    })
    .join('')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '');
  return (cleaned || 'emoji-pack').slice(0, 64);
}

function isImagePath(filePath: string): boolean {
  return IMAGE_EXTENSIONS.has(path.extname(filePath).toLowerCase());
}

function isArchivePath(filePath: string): boolean {
  return ARCHIVE_EXTENSIONS.has(path.extname(filePath).toLowerCase());
}

function mimeFromPath(filePath: string): string {
  switch (path.extname(filePath).toLowerCase()) {
    case '.png':
      return 'image/png';
    case '.jpg':
    case '.jpeg':
      return 'image/jpeg';
    case '.gif':
      return 'image/gif';
    case '.webp':
      return 'image/webp';
    case '.bmp':
      return 'image/bmp';
    case '.svg':
      return 'image/svg+xml';
    case '.ico':
      return 'image/x-icon';
    default:
      return 'application/octet-stream';
  }
}

async function readJsonFile<T>(filePath: string): Promise<T | undefined> {
  try {
    return JSON.parse(await fs.readFile(filePath, 'utf8')) as T;
  } catch {
    return undefined;
  }
}

async function writeJsonFile(filePath: string, value: unknown): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, JSON.stringify(value, null, 2), 'utf8');
}

async function resolveStorageTarget(): Promise<EmojiPackStorageTarget> {
  const workspace = await WorkspacesRepo.getDefault().catch(() => undefined);

  if (workspace?.rootPath) {
    const resourcesRootPath = path.join(workspace.rootPath, WORKSPACE_RESOURCE_DIR_NAME);
    const baseDir = path.join(resourcesRootPath, EMOJI_PACK_DIR_NAME);
    const target: EmojiPackStorageTarget = {
      baseDir,
      resourcesRootPath,
      storageKind: 'workspace',
      workspaceId: workspace.id,
      workspaceRootPath: workspace.rootPath
    };
    registerStorageTarget(target);
    return target;
  }

  const resourcesRootPath = dataRoot();
  const target: EmojiPackStorageTarget = {
    baseDir: path.join(resourcesRootPath, EMOJI_PACK_DIR_NAME),
    resourcesRootPath,
    storageKind: 'userData'
  };
  registerStorageTarget(target);
  return target;
}

function toResourceUrl(manifest: Pick<EmojiPackManifest, 'resourcesRootPath' | 'rootPath' | 'workspaceId'>, relativePath: string): string {
  const absPath = path.join(manifest.rootPath, relativePath);
  if (manifest.workspaceId) {
    const relToResources = normalizeRelativePath(path.relative(manifest.resourcesRootPath, absPath));
    if (relToResources && !relToResources.startsWith('..')) {
      return `res://ws/${manifest.workspaceId}/${encodeResourcePath(relToResources)}`;
    }
  }

  return `res://local/${encodeURIComponent(absPath.replace(/\\/g, '/'))}`;
}

function encodeResourcePath(value: string): string {
  return normalizeRelativePath(value).split('/').map(encodeURIComponent).join('/');
}

function registerStorageTarget(target: EmojiPackStorageTarget): void {
  addAllowedResourceRoot(target.resourcesRootPath);
  if (target.workspaceId) {
    addWorkspaceResourceRoot(target.workspaceId, target.resourcesRootPath);
  }
}

function storageTargetKey(target: EmojiPackStorageTarget): string {
  return `${target.storageKind}:${target.workspaceId || ''}:${path.resolve(target.resourcesRootPath)}`;
}

async function resolveDiscoveryTargets(): Promise<EmojiPackStorageTarget[]> {
  const targets: EmojiPackStorageTarget[] = [];
  const seen = new Set<string>();
  const addTarget = (target: EmojiPackStorageTarget): void => {
    const key = storageTargetKey(target);
    if (seen.has(key)) return;
    seen.add(key);
    registerStorageTarget(target);
    targets.push(target);
  };

  const workspaces = await WorkspacesRepo.list({}, 5000, 0).catch(() => []);
  for (const workspace of workspaces) {
    if (!workspace?.rootPath) continue;
    const resourcesRootPath = path.join(workspace.rootPath, WORKSPACE_RESOURCE_DIR_NAME);
    addTarget({
      baseDir: path.join(resourcesRootPath, EMOJI_PACK_DIR_NAME),
      resourcesRootPath,
      storageKind: 'workspace',
      workspaceId: workspace.id,
      workspaceRootPath: workspace.rootPath
    });
  }

  const resourcesRootPath = dataRoot();
  addTarget({
    baseDir: path.join(resourcesRootPath, EMOJI_PACK_DIR_NAME),
    resourcesRootPath,
    storageKind: 'userData'
  });

  return targets;
}

export async function registerEmojiPackResourceRoots(): Promise<void> {
  await resolveDiscoveryTargets();
}

async function copyDirectoryContents(sourceDir: string, targetDir: string): Promise<void> {
  await fs.mkdir(targetDir, { recursive: true });
  const entries = await fs.readdir(sourceDir, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.name === '.DS_Store') continue;
    if (entry.isDirectory() && SKIP_DIRS.has(entry.name)) continue;
    const sourcePath = path.join(sourceDir, entry.name);
    const targetPath = path.join(targetDir, entry.name);
    if (entry.isDirectory()) {
      await fs.cp(sourcePath, targetPath, { recursive: true, errorOnExist: false, force: true });
    } else if (entry.isFile()) {
      await fs.copyFile(sourcePath, targetPath);
    }
  }
}

function unpackArchive(sourcePath: string, targetDir: string): Promise<void> {
  return new Promise((resolve, reject) => {
    unpack(sourcePath, targetDir, (error) => {
      if (error) {
        reject(error);
        return;
      }
      resolve();
    });
  });
}

async function countImmediateImageFiles(dirPath: string): Promise<number> {
  const entries = await fs.readdir(dirPath, { withFileTypes: true }).catch(() => []);
  return entries.filter((entry) => entry.isFile() && isImagePath(entry.name)).length;
}

async function unwrapSingleWrapperDirectory(packRoot: string): Promise<void> {
  const entries = (await fs.readdir(packRoot, { withFileTypes: true }).catch(() => [])).filter((entry) => entry.name !== '.DS_Store' && entry.name !== MANIFEST_FILE);
  const directImageCount = await countImmediateImageFiles(packRoot);
  const dirs = entries.filter((entry) => entry.isDirectory() && !SKIP_DIRS.has(entry.name));
  const files = entries.filter((entry) => entry.isFile());

  if (dirs.length !== 1 || files.length > 0 || directImageCount > 0) {
    return;
  }

  const wrapperDir = path.join(packRoot, dirs[0].name);
  const wrapperEntries = await fs.readdir(wrapperDir);
  for (const entry of wrapperEntries) {
    await fs.rename(path.join(wrapperDir, entry), path.join(packRoot, entry));
  }
  await fs.rm(wrapperDir, { recursive: true, force: true });
}

type ScanState = {
  count: number;
};

async function scanFolder(rootPath: string, currentPath: string, state: ScanState, relativePath = ''): Promise<EmojiPackTreeFolder> {
  const children: EmojiPackTreeNode[] = [];
  const entries = await fs.readdir(currentPath, { withFileTypes: true });

  for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name, 'zh-Hans-CN'))) {
    if (entry.name === '.DS_Store' || entry.name === MANIFEST_FILE) continue;
    if (entry.isDirectory() && SKIP_DIRS.has(entry.name)) continue;

    const childRelativePath = normalizeRelativePath(path.join(relativePath, entry.name));
    const childPath = path.join(rootPath, childRelativePath);

    if (entry.isDirectory()) {
      const childFolder = await scanFolder(rootPath, childPath, state, childRelativePath);
      if (childFolder.children.length > 0) {
        children.push(childFolder);
      }
      continue;
    }

    if (!entry.isFile() || !isImagePath(entry.name)) {
      continue;
    }

    const stat = await fs.stat(childPath);
    children.push({
      kind: 'file',
      mimeType: mimeFromPath(childPath),
      name: entry.name,
      relativePath: childRelativePath,
      sizeBytes: stat.size,
      title: toDisplayTitle(entry.name)
    });

    state.count += 1;
    if (state.count > MAX_SCAN_FILES) {
      throw new Error(`emoji-pack-too-large:${MAX_SCAN_FILES}`);
    }
  }

  return {
    children,
    kind: 'folder',
    name: relativePath ? path.basename(relativePath) : '',
    relativePath
  };
}

function flattenFiles(nodes: EmojiPackTreeNode[]): EmojiPackTreeFile[] {
  const files: EmojiPackTreeFile[] = [];
  for (const node of nodes) {
    if (node.kind === 'file') {
      files.push(node);
    } else {
      files.push(...flattenFiles(node.children));
    }
  }
  return files;
}

function countFolders(folder: EmojiPackTreeFolder): number {
  return folder.children.reduce((total, node) => total + (node.kind === 'folder' ? 1 + countFolders(node) : 0), 0);
}

function summarizeManifest(manifest: EmojiPackManifest): EmojiPackSummary {
  const previewUrls = flattenFiles(manifest.tree.children)
    .slice(0, 4)
    .map((file) => toResourceUrl(manifest, file.relativePath));

  return {
    id: manifest.id,
    importedAt: manifest.importedAt,
    name: manifest.name,
    previewUrls,
    rootPath: manifest.rootPath,
    storageKind: manifest.storageKind,
    topLevelFiles: manifest.topLevelFiles,
    topLevelFolders: manifest.topLevelFolders,
    totalFileCount: manifest.totalFileCount,
    totalFolderCount: manifest.totalFolderCount,
    updatedAt: manifest.updatedAt,
    workspaceId: manifest.workspaceId
  };
}

function folderEntryFromNode(node: EmojiPackTreeFolder, pack: EmojiPackManifest): EmojiPackListNode {
  const childFolders = node.children.filter((child) => child.kind === 'folder');
  const childFiles = node.children.filter((child) => child.kind === 'file');
  return {
    childFolderCount: childFolders.length,
    fileCount: childFiles.length,
    kind: 'folder',
    name: node.name,
    packId: pack.id,
    packName: pack.name,
    relativePath: node.relativePath,
    totalFileCount: flattenFiles(node.children).length
  };
}

function fileEntryFromNode(node: EmojiPackTreeFile, pack: EmojiPackManifest): EmojiPackListNode {
  return {
    kind: 'file',
    mimeType: node.mimeType,
    name: node.name,
    packId: pack.id,
    packName: pack.name,
    relativePath: node.relativePath,
    sizeBytes: node.sizeBytes,
    title: node.title,
    url: toResourceUrl(pack, node.relativePath)
  };
}

function findFolder(folder: EmojiPackTreeFolder, relativePath?: string): EmojiPackTreeFolder | undefined {
  const normalized = normalizeRelativePath(relativePath);
  if (!normalized) return folder;
  for (const child of folder.children) {
    if (child.kind === 'folder') {
      if (child.relativePath === normalized) return child;
      const nested = findFolder(child, normalized);
      if (nested) return nested;
    }
  }
  return undefined;
}

function buildManifest(params: { id: string; name: string; sourcePath?: string; target: EmojiPackStorageTarget; rootPath: string; tree: EmojiPackTreeFolder }): EmojiPackManifest {
  const files = flattenFiles(params.tree.children);
  const topLevelFolders = params.tree.children.filter((child) => child.kind === 'folder').map((child) => child.name);
  const topLevelFiles = params.tree.children.filter((child): child is EmojiPackTreeFile => child.kind === 'file').map((child) => child.name);
  const now = Date.now();

  return {
    id: params.id,
    importedAt: now,
    name: params.name,
    resourcesRootPath: params.target.resourcesRootPath,
    rootPath: params.rootPath,
    sourcePath: params.sourcePath,
    storageKind: params.target.storageKind,
    topLevelFiles,
    topLevelFolders,
    totalFileCount: files.length,
    totalFolderCount: countFolders(params.tree),
    tree: params.tree,
    updatedAt: now,
    workspaceId: params.target.workspaceId,
    workspaceRootPath: params.target.workspaceRootPath
  };
}

async function readManifestFromDirectory(dirPath: string, target?: EmojiPackStorageTarget): Promise<EmojiPackManifest | undefined> {
  const manifest = await readJsonFile<EmojiPackManifest>(path.join(dirPath, MANIFEST_FILE));
  if (!manifest) return undefined;
  manifest.rootPath = dirPath;

  if (target) {
    manifest.resourcesRootPath = target.resourcesRootPath;
    manifest.storageKind = target.storageKind;
    manifest.workspaceId = target.workspaceId;
    manifest.workspaceRootPath = target.workspaceRootPath;
  } else if (!manifest.resourcesRootPath) {
    manifest.resourcesRootPath = path.dirname(path.dirname(dirPath));
  }

  return manifest;
}

async function getPackManifest(packId: string): Promise<EmojiPackManifest | undefined> {
  const targets = await resolveDiscoveryTargets();
  for (const target of targets) {
    const dirPath = path.join(target.baseDir, packId);
    const manifest = await readManifestFromDirectory(dirPath, target);
    if (manifest) {
      registerManifestResourceRoots(manifest);
      return manifest;
    }
  }
  return undefined;
}

function registerManifestResourceRoots(manifest: EmojiPackManifest): void {
  addAllowedResourceRoot(manifest.resourcesRootPath);
  if (manifest.workspaceId) {
    addWorkspaceResourceRoot(manifest.workspaceId, manifest.resourcesRootPath);
  }
}

async function listManifests(): Promise<EmojiPackManifest[]> {
  const targets = await resolveDiscoveryTargets();
  const manifests: EmojiPackManifest[] = [];
  const seenRootPaths = new Set<string>();

  for (const target of targets) {
    const entries = await fs.readdir(target.baseDir, { withFileTypes: true }).catch(() => []);

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const manifest = await readManifestFromDirectory(path.join(target.baseDir, entry.name), target);
      if (manifest && !seenRootPaths.has(manifest.rootPath)) {
        seenRootPaths.add(manifest.rootPath);
        registerManifestResourceRoots(manifest);
        manifests.push(manifest);
      }
    }
  }

  const settings = await getEmojiPackSettings().catch(() => undefined);
  return manifests.sort((left, right) => {
    if (settings?.lastImportedPackId) {
      if (left.id === settings.lastImportedPackId) return -1;
      if (right.id === settings.lastImportedPackId) return 1;
    }
    return right.importedAt - left.importedAt;
  });
}

export async function getEmojiPackSettings(): Promise<EmojiPackSettings> {
  return (await readJsonFile<EmojiPackSettings>(settingsPath())) || {};
}

async function saveLastImportedPack(packId: string): Promise<void> {
  const current = await getEmojiPackSettings();
  await writeJsonFile(settingsPath(), {
    ...current,
    lastImportedPackId: packId
  });
}

export async function listEmojiPacks(): Promise<EmojiPackSummary[]> {
  return (await listManifests()).map(summarizeManifest);
}

export async function listEmojiPackNodes(payload: { packId: string; relativePath?: string; limit?: number }): Promise<{ nodes: EmojiPackListNode[]; pack?: EmojiPackSummary }> {
  const pack = await getPackManifest(payload.packId);
  if (!pack) {
    return { nodes: [] };
  }

  const folder = findFolder(pack.tree, payload.relativePath);
  if (!folder) {
    return { nodes: [], pack: summarizeManifest(pack) };
  }

  const limit = Math.max(1, Math.min(payload.limit || 80, 200));
  const nodes = folder.children.slice(0, limit).map((node) => (node.kind === 'folder' ? folderEntryFromNode(node, pack) : fileEntryFromNode(node, pack)));
  return {
    nodes,
    pack: summarizeManifest(pack)
  };
}

function computeSearchScore(file: EmojiPackTreeFile, query: string): number {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return 1;
  const text = `${file.title} ${file.name} ${file.relativePath}`.toLowerCase();
  if (file.title.toLowerCase() === normalized) return 100;
  if (file.title.toLowerCase().startsWith(normalized)) return 80;
  if (file.name.toLowerCase().includes(normalized)) return 60;
  return text.includes(normalized) ? 40 : 0;
}

export async function searchEmojiPacks(payload: { packId?: string; query: string; limit?: number }): Promise<EmojiPackSearchResult[]> {
  const query = payload.query.trim();
  const requestedManifest = payload.packId ? await getPackManifest(payload.packId) : undefined;
  const manifests = requestedManifest ? [requestedManifest] : await listManifests();
  const results: EmojiPackSearchResult[] = [];

  for (const manifest of manifests.filter((item): item is EmojiPackManifest => Boolean(item))) {
    for (const file of flattenFiles(manifest.tree.children)) {
      const score = computeSearchScore(file, query);
      if (score <= 0 && query) continue;
      results.push({
        mimeType: file.mimeType,
        name: file.name,
        packId: manifest.id,
        packName: manifest.name,
        relativePath: file.relativePath,
        score,
        title: file.title,
        url: toResourceUrl(manifest, file.relativePath)
      });
    }
  }

  return results.sort((left, right) => right.score - left.score || left.title.localeCompare(right.title, 'zh-Hans-CN')).slice(0, Math.max(1, Math.min(payload.limit || MAX_SEARCH_RESULTS, 80)));
}

export async function resolveEmojiFromPack(payload: { packId: string; relativePath: string }): Promise<EmojiPackSearchResult | undefined> {
  const manifest = await getPackManifest(payload.packId);
  const normalized = normalizeRelativePath(payload.relativePath);
  const file = manifest ? flattenFiles(manifest.tree.children).find((item) => item.relativePath === normalized) : undefined;
  if (manifest && file) {
    return {
      mimeType: file.mimeType,
      name: file.name,
      packId: manifest.id,
      packName: manifest.name,
      relativePath: file.relativePath,
      score: 100,
      title: file.title,
      url: toResourceUrl(manifest, file.relativePath)
    };
  }

  const settings = await getEmojiPackSettings().catch(() => undefined);
  const fallbackMatches: Array<{ file: EmojiPackTreeFile; manifest: EmojiPackManifest }> = [];
  for (const candidateManifest of await listManifests()) {
    const candidateFile = flattenFiles(candidateManifest.tree.children).find((item) => item.relativePath === normalized);
    if (candidateFile) {
      fallbackMatches.push({ file: candidateFile, manifest: candidateManifest });
    }
  }

  const fallback = fallbackMatches.find((match) => match.manifest.id === settings?.lastImportedPackId) || fallbackMatches[0];
  if (!fallback) return undefined;

  return {
    mimeType: fallback.file.mimeType,
    name: fallback.file.name,
    packId: fallback.manifest.id,
    packName: fallback.manifest.name,
    relativePath: fallback.file.relativePath,
    score: 100,
    title: fallback.file.title,
    url: toResourceUrl(fallback.manifest, fallback.file.relativePath)
  };
}

export async function importEmojiPackFromPath(sourcePath: string): Promise<EmojiPackImportResult> {
  const resolvedSourcePath = path.resolve(sourcePath);
  let packRoot: string | undefined;
  try {
    const stat = await fs.stat(resolvedSourcePath);
    const sourceName = path.basename(resolvedSourcePath, stat.isDirectory() ? undefined : path.extname(resolvedSourcePath));
    const target = await resolveStorageTarget();
    await fs.mkdir(target.baseDir, { recursive: true });
    const packIdStem = sanitizePackIdStem(sourceName);
    packRoot = await ensureUniquePath(path.join(target.baseDir, `${packIdStem}-${Date.now()}`));
    await fs.mkdir(packRoot, { recursive: true });

    if (stat.isDirectory()) {
      await copyDirectoryContents(resolvedSourcePath, packRoot);
    } else if (stat.isFile() && isArchivePath(resolvedSourcePath)) {
      await unpackArchive(resolvedSourcePath, packRoot);
      await unwrapSingleWrapperDirectory(packRoot);
    } else if (stat.isFile() && isImagePath(resolvedSourcePath)) {
      await fs.copyFile(resolvedSourcePath, path.join(packRoot, path.basename(resolvedSourcePath)));
    } else {
      throw new Error('仅支持导入文件夹、图片文件或 zip/7z/rar/tar 等压缩包。');
    }

    const scanState: ScanState = { count: 0 };
    const tree = await scanFolder(packRoot, packRoot, scanState);
    const totalFileCount = scanState.count;
    if (totalFileCount === 0) {
      await fs.rm(packRoot, { recursive: true, force: true });
      throw new Error('没有扫描到可用图片文件。');
    }

    const manifest = buildManifest({
      id: path.basename(packRoot),
      name: sourceName || '表情包',
      rootPath: packRoot,
      sourcePath: resolvedSourcePath,
      target,
      tree
    });
    await writeJsonFile(path.join(packRoot, MANIFEST_FILE), manifest);
    registerManifestResourceRoots(manifest);
    await saveLastImportedPack(manifest.id);

    return {
      ok: true,
      pack: summarizeManifest(manifest),
      sourcePath: resolvedSourcePath
    };
  } catch (error) {
    if (packRoot) {
      await fs.rm(packRoot, { recursive: true, force: true }).catch(() => undefined);
    }
    return {
      error: error instanceof Error ? error.message : String(error),
      ok: false,
      sourcePath: resolvedSourcePath
    };
  }
}

export async function importEmojiPacksFromPaths(paths: string[]): Promise<EmojiPackImportResult[]> {
  const uniquePaths = Array.from(new Set(paths.map((item) => item.trim()).filter(Boolean)));
  const results: EmojiPackImportResult[] = [];
  for (const sourcePath of uniquePaths) {
    results.push(await importEmojiPackFromPath(sourcePath));
  }
  return results;
}

export async function revealEmojiPack(packId: string): Promise<{ ok: boolean; error?: string }> {
  const pack = await getPackManifest(packId);
  if (!pack) return { ok: false, error: '表情包不存在' };
  shell.showItemInFolder(pack.rootPath);
  return { ok: true };
}
