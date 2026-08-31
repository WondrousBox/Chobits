import { generateKeyPairSync, sign as cryptoSign } from 'node:crypto';
import { cpSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

const archiveExtractMap = new Map<string, string>();
const archiveEntryMap = new Map<string, Array<{ name?: string; attr?: string; size?: string }>>();

function collectArchiveListEntries(sourceDir: string, rootDir = sourceDir): Array<{ name: string; attr: string; size: string }> {
  const entries: Array<{ name: string; attr: string; size: string }> = [];
  for (const entry of readdirSync(sourceDir)) {
    const entryPath = path.join(sourceDir, entry);
    const relativePath = path.relative(rootDir, entryPath).split(path.sep).join('/');
    const stats = lstatSync(entryPath);
    entries.push({
      name: relativePath,
      attr: stats.isSymbolicLink() ? 'lrwxrwxrwx' : stats.isDirectory() ? 'D' : 'A',
      size: stats.isDirectory() ? '0' : String(stats.size)
    });

    if (stats.isDirectory()) {
      entries.push(...collectArchiveListEntries(entryPath, rootDir));
    }
  }
  return entries;
}

vi.mock('../../packages/common/utils/file', () => ({
  listArchiveEntriesWith7Z: vi.fn(async (archivePath: string) => {
    const explicitEntries = archiveEntryMap.get(archivePath);
    if (explicitEntries) {
      return explicitEntries;
    }

    const sourceDir = archiveExtractMap.get(archivePath);
    if (!sourceDir) {
      throw new Error(`Missing test archive mapping for ${archivePath}`);
    }
    return collectArchiveListEntries(sourceDir);
  }),
  unzipFileWith7Z: vi.fn(async (archivePath: string, outputFolderPath: string) => {
    const sourceDir = archiveExtractMap.get(archivePath);
    if (!sourceDir) {
      throw new Error(`Missing test archive mapping for ${archivePath}`);
    }
    mkdirSync(outputFolderPath, { recursive: true });
    for (const entry of readdirSync(sourceDir)) {
      cpSync(path.join(sourceDir, entry), path.join(outputFolderPath, entry), {
        recursive: true
      });
    }
  }),
  zipDirectoryContentsWith7Z: vi.fn(async (sourceFolderPath: string, zipFilePath: string) => {
    mkdirSync(path.dirname(zipFilePath), { recursive: true });
    writeFileSync(zipFilePath, JSON.stringify(collectArchiveListEntries(sourceFolderPath), null, 2), 'utf-8');
  })
}));

import { unzipFileWith7Z, zipDirectoryContentsWith7Z } from '../../packages/common/utils/file';
import {
  buildCharacterGalleryAIEditContext,
  importCharacterGalleryItem,
  listCharacterGalleryItems,
  removeCharacterGalleryItem,
  replaceCharacterGalleryItemImage,
  updateCharacterGalleryItem
} from '../../packages/sprite-core/character-gallery-manager';
import { calculateCharacterPackPayloadDigest } from '../../packages/sprite-core/character-pack-integrity';
import {
  activateCharacterPack,
  exportCharacterPack,
  getActiveCharacterPack,
  getCharacterPackImportPreviewCacheRootDir,
  initCharacterPackManager,
  inspectCharacterPackFromArchive,
  installCharacterPackFromArchive,
  listCharacterPacks,
  removeCharacterPack,
  resetCharacterPackManager,
  saveCharacterPackEditorDraft
} from '../../packages/sprite-core/character-pack-manager';
import { createCharacterPackSignaturePayload } from '../../packages/sprite-core/character-pack-signature';
import { CHARACTER_MESSAGE_SPECS, CHARACTER_PROGRESS_KIND_LABEL_SPECS, CHARACTER_PROGRESS_MESSAGE_SPECS, getCharacterMessageTemplateLines } from '../../packages/sprite-core/messages/default-character';

function expectCharacterMessagesCoverSpecs(messages: Record<string, any>): void {
  for (const spec of CHARACTER_MESSAGE_SPECS) {
    const entry = messages[spec.section]?.[spec.key];
    expect(getCharacterMessageTemplateLines(entry), `${spec.section}.${spec.key}`).not.toHaveLength(0);
  }

  for (const spec of CHARACTER_PROGRESS_KIND_LABEL_SPECS) {
    expect(messages.progress?.kindLabels?.[spec.key], `progress.kindLabels.${spec.key}`).toBeTruthy();
  }

  for (const spec of CHARACTER_PROGRESS_MESSAGE_SPECS) {
    expect(messages.progress?.[spec.key], `progress.${spec.key}`).toBeTruthy();
  }
}

function writeJsonFile(filePath: string, payload: unknown): void {
  mkdirSync(path.dirname(filePath), { recursive: true });
  writeFileSync(filePath, JSON.stringify(payload, null, 2), 'utf-8');
}

function writePack(rootDir: string, packId: string, name: string, overrides?: Record<string, unknown>): void {
  const basePack = {
    formatVersion: 1,
    id: packId,
    name,
    version: '1.0.0',
    author: 'test',
    description: `${name} description`,
    license: 'MIT',
    tags: ['test'],
    minAppVersion: '1.0.0',
    provenance: {
      channel: 'community',
      publisher: 'Test Publisher',
      homepage: 'https://example.com/packs/test-pack',
      repository: 'https://example.com/packs/test-pack/repo'
    },
    signature: {
      algorithm: 'ed25519',
      keyId: 'test-key'
    },
    assets: {
      character: 'character.json',
      animations: 'animations/index.json',
      preview: {
        avatar: 'preview/avatar.png',
        gif: 'preview/preview.gif',
        video: 'preview/preview.webm'
      }
    },
    capabilities: {
      hasCustomAnimations: true,
      supportedLanguages: ['zh-CN']
    }
  };

  writeJsonFile(path.join(rootDir, 'pack.json'), {
    ...basePack,
    ...overrides
  });
  mkdirSync(path.join(rootDir, 'preview'), { recursive: true });
  writeFileSync(path.join(rootDir, 'preview', 'avatar.png'), 'preview', 'utf-8');
  writeFileSync(path.join(rootDir, 'preview', 'preview.gif'), 'gif-preview', 'utf-8');
  writeFileSync(path.join(rootDir, 'preview', 'preview.webm'), 'video-preview', 'utf-8');
}

function readPack(rootDir: string): Record<string, any> {
  return JSON.parse(readFileSync(path.join(rootDir, 'pack.json'), 'utf-8'));
}

function readCharacter(rootDir: string): Record<string, any> {
  return JSON.parse(readFileSync(path.join(rootDir, 'character.json'), 'utf-8'));
}

function writeTrustRoot(
  rootDir: string,
  keys: Array<{
    keyId: string;
    publicKeyPem: string;
    algorithm?: 'ed25519';
    publishers?: string[];
    channels?: string[];
  }>,
  options?: {
    revocations?: Array<{
      keyId: string;
      reason?: string;
    }>;
  }
): void {
  writeJsonFile(path.join(rootDir, 'trust-root.json'), {
    version: 1,
    keys: keys.map((key) => ({
      keyId: key.keyId,
      algorithm: key.algorithm ?? 'ed25519',
      publicKeyPem: key.publicKeyPem,
      ...(key.publishers ? { publishers: key.publishers } : {}),
      ...(key.channels ? { channels: key.channels } : {})
    })),
    ...(options?.revocations?.length
      ? {
          revocations: options.revocations.map((revocation) => ({
            keyId: revocation.keyId,
            ...(revocation.reason ? { reason: revocation.reason } : {})
          }))
        }
      : {})
  });
}

function tryCreateSymlink(targetPath: string, linkPath: string): boolean {
  try {
    symlinkSync(targetPath, linkPath);
    return true;
  } catch {
    return false;
  }
}

async function writePackWithPayloadDigest(rootDir: string, packId: string, name: string, overrides?: Record<string, unknown>): Promise<string> {
  writePack(rootDir, packId, name, {
    ...overrides,
    signature: {
      algorithm: 'sha256',
      keyId: 'test-digest-key'
    }
  });
  const digest = await calculateCharacterPackPayloadDigest(rootDir);
  writePack(rootDir, packId, name, {
    ...overrides,
    signature: {
      algorithm: 'sha256',
      keyId: 'test-digest-key',
      digest: `sha256:${digest}`
    }
  });
  return digest;
}

function createTestArchive(archivePath: string, sourceDir: string): string {
  mkdirSync(path.dirname(archivePath), { recursive: true });
  writeFileSync(archivePath, 'fake archive payload', 'utf-8');
  archiveExtractMap.set(archivePath, sourceDir);
  return archivePath;
}

async function signPackWithTrustedKey(
  rootDir: string,
  privateKeyPem: string,
  options?: {
    mutatePayloadAfterSign?: (rootDir: string) => void;
  }
): Promise<{ digest: string; signatureValue: string }> {
  const pack = readPack(rootDir);
  const digest = await calculateCharacterPackPayloadDigest(rootDir);
  const payload = createCharacterPackSignaturePayload(pack, digest);
  const signatureValue = cryptoSign(null, Buffer.from(payload, 'utf-8'), privateKeyPem).toString('base64');

  writeJsonFile(path.join(rootDir, 'pack.json'), {
    ...pack,
    signature: {
      ...pack.signature,
      value: signatureValue
    }
  });

  options?.mutatePayloadAfterSign?.(rootDir);

  return {
    digest,
    signatureValue
  };
}

describe('character pack manager', () => {
  let tempRoot: string | null = null;

  afterEach(() => {
    archiveExtractMap.clear();
    archiveEntryMap.clear();
    vi.mocked(unzipFileWith7Z).mockClear();
    vi.mocked(zipDirectoryContentsWith7Z).mockClear();
    resetCharacterPackManager();
    if (tempRoot) {
      rmSync(tempRoot, { recursive: true, force: true });
      tempRoot = null;
    }
  });

  it('lists builtin and installed packs and persists builtin as the fallback active pack', async () => {
    tempRoot = mkdtempSync(path.join(os.tmpdir(), 'character-pack-manager-'));
    const builtinRoot = path.join(tempRoot, 'builtin-pack');
    const userDataDir = path.join(tempRoot, 'user-data');
    const installedRoot = path.join(userDataDir, 'data', 'character-packs', 'pack-beta');

    writePack(builtinRoot, 'pack-alpha', 'Pack Alpha');
    writePack(installedRoot, 'pack-beta', 'Pack Beta');

    initCharacterPackManager({
      userDataDir,
      builtinPackRootDir: builtinRoot,
      appVersion: '1.0.0'
    });

    const packs = await listCharacterPacks();
    expect(packs.map((pack) => [pack.id, pack.source, pack.isActive])).toEqual([
      ['pack-alpha', 'builtin', true],
      ['pack-beta', 'installed', false]
    ]);
    expect(packs[0].resolvedAssets.animations).toBe(path.join(builtinRoot, 'animations/index.json'));
    expect(packs[0].resolvedAssets.preview?.avatar).toBe(path.join(builtinRoot, 'preview/avatar.png'));
    expect(packs[0].trust).toMatchObject({
      level: 'signature-declared',
      publisher: 'Test Publisher',
      channel: 'community',
      signatureDeclared: true,
      verificationStatus: 'builtin-bundled'
    });
    expect(packs[0].trust.note).toContain('内置分发');

    const activePack = await getActiveCharacterPack();
    expect(activePack).toMatchObject({
      id: 'pack-alpha',
      source: 'builtin',
      isActive: true
    });
    expect(typeof packs[0].companionSince).toBe('number');
    expect(activePack?.companionSince).toBe(packs[0].companionSince);
    expect(packs[1].companionSince).toBeUndefined();

    const stateFile = path.join(userDataDir, 'data', 'active-character-pack.json');
    expect(existsSync(stateFile)).toBe(true);
    const state = JSON.parse(readFileSync(stateFile, 'utf-8'));
    expect(state).toMatchObject({
      version: 1,
      id: 'pack-alpha',
      source: 'builtin'
    });
    expect(state.firstUsedAtByPack).toEqual({
      'builtin:pack-alpha': packs[0].companionSince
    });
  });

  it('tracks companion start timestamps per pack and keeps them on reactivation', async () => {
    tempRoot = mkdtempSync(path.join(os.tmpdir(), 'character-pack-manager-'));
    const builtinRoot = path.join(tempRoot, 'builtin-pack');
    const userDataDir = path.join(tempRoot, 'user-data');
    const installedRoot = path.join(userDataDir, 'data', 'character-packs', 'pack-beta');
    const stateFile = path.join(userDataDir, 'data', 'active-character-pack.json');
    const alphaSince = 1700000000000;

    writePack(builtinRoot, 'pack-alpha', 'Pack Alpha');
    writePack(installedRoot, 'pack-beta', 'Pack Beta');
    writeJsonFile(stateFile, {
      version: 1,
      id: 'pack-alpha',
      source: 'builtin',
      firstUsedAtByPack: {
        'builtin:pack-alpha': alphaSince
      }
    });

    initCharacterPackManager({
      userDataDir,
      builtinPackRootDir: builtinRoot,
      appVersion: '1.0.0'
    });

    const activation = await activateCharacterPack('pack-beta', { source: 'installed' });
    const betaSince = activation?.pack.companionSince;

    expect(activation).toMatchObject({
      changed: true,
      pack: {
        id: 'pack-beta',
        source: 'installed',
        isActive: true
      }
    });
    expect(typeof betaSince).toBe('number');
    const betaCompanionSince = betaSince!;
    expect(betaCompanionSince).toBeGreaterThan(0);

    const packs = await listCharacterPacks();
    expect(packs.find((pack) => pack.id === 'pack-alpha')?.companionSince).toBe(alphaSince);
    expect(packs.find((pack) => pack.id === 'pack-beta')?.companionSince).toBe(betaCompanionSince);

    const persistedState = JSON.parse(readFileSync(stateFile, 'utf-8'));
    expect(persistedState.firstUsedAtByPack).toEqual({
      'builtin:pack-alpha': alphaSince,
      'installed:pack-beta': betaCompanionSince
    });

    const reactivation = await activateCharacterPack('pack-beta', { source: 'installed' });
    expect(reactivation?.changed).toBe(false);
    expect(reactivation?.pack.companionSince).toBe(betaCompanionSince);
  });

  it('installs a pack from a .cbpk archive and resolves the extracted pack root', async () => {
    tempRoot = mkdtempSync(path.join(os.tmpdir(), 'character-pack-manager-'));
    const builtinRoot = path.join(tempRoot, 'builtin-pack');
    const archiveSourceRoot = path.join(tempRoot, 'archive-source', 'nested-pack-root');
    const archivePath = path.join(tempRoot, 'imports', 'pack-delta.cbpk');
    const userDataDir = path.join(tempRoot, 'user-data');

    writePack(builtinRoot, 'pack-alpha', 'Pack Alpha');
    writePack(archiveSourceRoot, 'pack-delta', 'Pack Delta');
    mkdirSync(path.dirname(archivePath), { recursive: true });
    writeFileSync(archivePath, 'fake archive payload', 'utf-8');
    archiveExtractMap.set(archivePath, path.join(tempRoot, 'archive-source'));

    initCharacterPackManager({
      userDataDir,
      builtinPackRootDir: builtinRoot,
      appVersion: '1.0.0'
    });

    const result = await installCharacterPackFromArchive(archivePath, {
      activate: true
    });

    expect(result).toMatchObject({
      activated: true,
      pack: {
        id: 'pack-delta',
        source: 'installed',
        isActive: true
      }
    });
    expect(existsSync(path.join(userDataDir, 'data', 'character-packs', 'pack-delta', 'pack.json'))).toBe(true);
  });

  it('rejects the legacy .chobits-character archive extension', async () => {
    tempRoot = mkdtempSync(path.join(os.tmpdir(), 'character-pack-manager-'));
    const builtinRoot = path.join(tempRoot, 'builtin-pack');
    const archiveSourceRoot = path.join(tempRoot, 'archive-source', 'nested-pack-root');
    const archivePath = path.join(tempRoot, 'imports', 'pack-delta.chobits-character');
    const userDataDir = path.join(tempRoot, 'user-data');

    writePack(builtinRoot, 'pack-alpha', 'Pack Alpha');
    writePack(archiveSourceRoot, 'pack-delta', 'Pack Delta');
    createTestArchive(archivePath, path.join(tempRoot, 'archive-source'));

    initCharacterPackManager({
      userDataDir,
      builtinPackRootDir: builtinRoot,
      appVersion: '1.0.0'
    });

    await expect(inspectCharacterPackFromArchive(archivePath)).rejects.toThrow('Unsupported character pack archive extension');
    await expect(installCharacterPackFromArchive(archivePath)).rejects.toThrow('Unsupported character pack archive extension');
  });

  it('exports a character pack as a complete zip archive payload', async () => {
    tempRoot = mkdtempSync(path.join(os.tmpdir(), 'character-pack-manager-'));
    const builtinRoot = path.join(tempRoot, 'builtin-pack');
    const userDataDir = path.join(tempRoot, 'user-data');
    const installedRoot = path.join(userDataDir, 'data', 'character-packs', 'pack-beta');
    const outputPath = path.join(tempRoot, 'exports', 'pack-beta.zip');

    writePack(builtinRoot, 'pack-alpha', 'Pack Alpha');
    writePack(installedRoot, 'pack-beta', 'Pack Beta');
    writeJsonFile(path.join(installedRoot, 'character.json'), { id: 'beta', name: 'Beta' });
    writeFileSync(path.join(installedRoot, 'notes.md'), '# Pack Notes', 'utf-8');

    initCharacterPackManager({
      userDataDir,
      builtinPackRootDir: builtinRoot,
      appVersion: '1.0.0'
    });

    const result = await exportCharacterPack('pack-beta', outputPath, {
      source: 'installed'
    });

    expect(result).toMatchObject({
      outputPath,
      pack: {
        id: 'pack-beta',
        source: 'installed'
      }
    });
    expect(result?.bytes).toBeGreaterThan(0);
    expect(zipDirectoryContentsWith7Z).toHaveBeenCalledTimes(1);

    const archivedEntries = JSON.parse(readFileSync(outputPath, 'utf-8')) as Array<{ name: string }>;
    expect(archivedEntries.map((entry) => entry.name).sort()).toEqual(
      expect.arrayContaining(['character.json', 'notes.md', 'pack.json', 'preview/avatar.png', 'preview/preview.gif', 'preview/preview.webm'])
    );
  });

  it('uses .cbpk when exporting without a supported archive extension', async () => {
    tempRoot = mkdtempSync(path.join(os.tmpdir(), 'character-pack-manager-'));
    const builtinRoot = path.join(tempRoot, 'builtin-pack');
    const userDataDir = path.join(tempRoot, 'user-data');
    const installedRoot = path.join(userDataDir, 'data', 'character-packs', 'pack-beta');
    const outputPath = path.join(tempRoot, 'exports', 'pack-beta');

    writePack(builtinRoot, 'pack-alpha', 'Pack Alpha');
    writePack(installedRoot, 'pack-beta', 'Pack Beta');

    initCharacterPackManager({
      userDataDir,
      builtinPackRootDir: builtinRoot,
      appVersion: '1.0.0'
    });

    const result = await exportCharacterPack('pack-beta', outputPath, {
      source: 'installed'
    });

    expect(result?.outputPath).toBe(`${outputPath}.cbpk`);
    expect(existsSync(`${outputPath}.cbpk`)).toBe(true);
  });

  it('preflights archive entries before extraction and rejects path traversal', async () => {
    tempRoot = mkdtempSync(path.join(os.tmpdir(), 'character-pack-manager-'));
    const builtinRoot = path.join(tempRoot, 'builtin-pack');
    const archivePath = path.join(tempRoot, 'imports', 'pack-unsafe.cbpk');
    const userDataDir = path.join(tempRoot, 'user-data');

    writePack(builtinRoot, 'pack-alpha', 'Pack Alpha');
    mkdirSync(path.dirname(archivePath), { recursive: true });
    writeFileSync(archivePath, 'fake archive payload', 'utf-8');
    archiveEntryMap.set(archivePath, [
      { name: 'nested-pack-root/pack.json', attr: 'A' },
      { name: '../evil.txt', attr: 'A' },
      { name: '/tmp/evil.txt', attr: 'A' },
      { name: 'C:\\evil.txt', attr: 'A' },
      { name: 'nested-pack-root/linked-outside.txt', attr: 'lrwxrwxrwx' }
    ]);

    initCharacterPackManager({
      userDataDir,
      builtinPackRootDir: builtinRoot,
      appVersion: '1.0.0'
    });

    vi.mocked(unzipFileWith7Z).mockClear();
    await expect(inspectCharacterPackFromArchive(archivePath)).rejects.toThrow('unsafe archive entries');
    await expect(installCharacterPackFromArchive(archivePath)).rejects.toThrow('unsafe archive entries');
    expect(unzipFileWith7Z).not.toHaveBeenCalled();
  });

  it('preflights archive entry count and expanded size before extraction', async () => {
    tempRoot = mkdtempSync(path.join(os.tmpdir(), 'character-pack-manager-'));
    const builtinRoot = path.join(tempRoot, 'builtin-pack');
    const archivePath = path.join(tempRoot, 'imports', 'pack-huge.cbpk');
    const userDataDir = path.join(tempRoot, 'user-data');

    writePack(builtinRoot, 'pack-alpha', 'Pack Alpha');
    mkdirSync(path.dirname(archivePath), { recursive: true });
    writeFileSync(archivePath, 'fake archive payload', 'utf-8');

    initCharacterPackManager({
      userDataDir,
      builtinPackRootDir: builtinRoot,
      appVersion: '1.0.0'
    });

    archiveEntryMap.set(
      archivePath,
      Array.from({ length: 2001 }, (_, index) => ({
        name: `nested-pack-root/files/${index}.txt`,
        attr: 'A',
        size: '1'
      }))
    );

    vi.mocked(unzipFileWith7Z).mockClear();
    await expect(inspectCharacterPackFromArchive(archivePath)).rejects.toThrow('too many entries');
    expect(unzipFileWith7Z).not.toHaveBeenCalled();

    archiveEntryMap.set(archivePath, [
      { name: 'nested-pack-root/pack.json', attr: 'A', size: '1024' },
      { name: 'nested-pack-root/preview/large.webm', attr: 'A', size: String(257 * 1024 * 1024) }
    ]);

    vi.mocked(unzipFileWith7Z).mockClear();
    await expect(installCharacterPackFromArchive(archivePath)).rejects.toThrow('oversized entries');
    expect(unzipFileWith7Z).not.toHaveBeenCalled();

    archiveEntryMap.set(archivePath, [
      { name: 'nested-pack-root/pack.json', attr: 'A', size: '1024' },
      { name: 'nested-pack-root/animations/a.webm', attr: 'A', size: String(200 * 1024 * 1024) },
      { name: 'nested-pack-root/animations/b.webm', attr: 'A', size: String(200 * 1024 * 1024) },
      { name: 'nested-pack-root/animations/c.webm', attr: 'A', size: String(200 * 1024 * 1024) }
    ]);

    vi.mocked(unzipFileWith7Z).mockClear();
    await expect(inspectCharacterPackFromArchive(archivePath)).rejects.toThrow('expanded size is too large');
    expect(unzipFileWith7Z).not.toHaveBeenCalled();
  });

  it('rejects archive imports that extract symbolic links', async () => {
    tempRoot = mkdtempSync(path.join(os.tmpdir(), 'character-pack-manager-'));
    const builtinRoot = path.join(tempRoot, 'builtin-pack');
    const archiveSourceRoot = path.join(tempRoot, 'archive-source', 'nested-pack-root');
    const archivePath = path.join(tempRoot, 'imports', 'pack-symlink.cbpk');
    const userDataDir = path.join(tempRoot, 'user-data');
    const outsideTargetPath = path.join(tempRoot, 'outside-target.txt');
    const symlinkPath = path.join(archiveSourceRoot, 'linked-outside.txt');

    writePack(builtinRoot, 'pack-alpha', 'Pack Alpha');
    writePack(archiveSourceRoot, 'pack-symlink', 'Pack Symlink');
    writeFileSync(outsideTargetPath, 'outside', 'utf-8');
    if (!tryCreateSymlink(outsideTargetPath, symlinkPath)) {
      return;
    }
    mkdirSync(path.dirname(archivePath), { recursive: true });
    writeFileSync(archivePath, 'fake archive payload', 'utf-8');
    archiveExtractMap.set(archivePath, path.join(tempRoot, 'archive-source'));

    initCharacterPackManager({
      userDataDir,
      builtinPackRootDir: builtinRoot,
      appVersion: '1.0.0'
    });

    await expect(inspectCharacterPackFromArchive(archivePath)).rejects.toThrow('unsafe archive entries');
    await expect(installCharacterPackFromArchive(archivePath)).rejects.toThrow('unsafe archive entries');
    expect(existsSync(path.join(userDataDir, 'data', 'character-packs', 'pack-symlink'))).toBe(false);
  });

  it('inspects archive imports before installation, including conflict and warning metadata', async () => {
    tempRoot = mkdtempSync(path.join(os.tmpdir(), 'character-pack-manager-'));
    const builtinRoot = path.join(tempRoot, 'builtin-pack');
    const gammaArchiveSourceRoot = path.join(tempRoot, 'gamma-archive-source', 'nested-pack-root');
    const betaArchiveSourceRoot = path.join(tempRoot, 'beta-archive-source', 'nested-pack-root');
    const gammaArchivePath = path.join(tempRoot, 'imports', 'pack-gamma.cbpk');
    const betaArchivePath = path.join(tempRoot, 'imports', 'pack-beta.cbpk');
    const installedRoot = path.join(tempRoot, 'user-data', 'data', 'character-packs', 'pack-beta');
    const userDataDir = path.join(tempRoot, 'user-data');

    writePack(builtinRoot, 'pack-alpha', 'Pack Alpha');
    writePack(gammaArchiveSourceRoot, 'pack-gamma', 'Pack Gamma');
    writePack(installedRoot, 'pack-beta', 'Pack Beta');
    writePack(betaArchiveSourceRoot, 'pack-beta', 'Pack Beta Archive');
    createTestArchive(gammaArchivePath, path.join(tempRoot, 'gamma-archive-source'));
    createTestArchive(betaArchivePath, path.join(tempRoot, 'beta-archive-source'));

    initCharacterPackManager({
      userDataDir,
      builtinPackRootDir: builtinRoot,
      appVersion: '1.2.0'
    });

    await activateCharacterPack('pack-beta', {
      source: 'installed'
    });
    const previewCacheRoot = getCharacterPackImportPreviewCacheRootDir();

    const gammaArchiveInspection = await inspectCharacterPackFromArchive(gammaArchivePath);
    expect(gammaArchiveInspection).toMatchObject({
      sourceType: 'archive',
      sourcePath: gammaArchivePath,
      pack: {
        id: 'pack-gamma',
        name: 'Pack Gamma'
      },
      existingPack: null,
      activePack: {
        id: 'pack-beta',
        source: 'installed'
      },
      requiresReplace: false,
      willReplaceActive: false,
      installable: true,
      blockingErrors: [],
      compatibility: {
        currentPlatform: process.platform,
        currentAppVersion: '1.2.0',
        minAppVersion: '1.0.0',
        appVersionSatisfied: true,
        supportedFormatVersion: 1,
        formatVersionSupported: true
      }
    });
    expect(gammaArchiveInspection.pack.previewAvatarPath).toBeTruthy();
    expect(gammaArchiveInspection.pack.previewGifPath).toBeTruthy();
    expect(gammaArchiveInspection.pack.previewVideoPath).toBeTruthy();
    expect(gammaArchiveInspection.pack.previewAvatarPath?.startsWith(previewCacheRoot + path.sep)).toBe(true);
    expect(gammaArchiveInspection.pack.previewGifPath?.startsWith(previewCacheRoot + path.sep)).toBe(true);
    expect(gammaArchiveInspection.pack.previewVideoPath?.startsWith(previewCacheRoot + path.sep)).toBe(true);
    expect(existsSync(gammaArchiveInspection.pack.previewAvatarPath!)).toBe(true);
    expect(existsSync(gammaArchiveInspection.pack.previewGifPath!)).toBe(true);
    expect(existsSync(gammaArchiveInspection.pack.previewVideoPath!)).toBe(true);
    expect(gammaArchiveInspection.pack.trust).toMatchObject({
      level: 'signature-declared',
      publisher: 'Test Publisher',
      channel: 'community',
      signatureDeclared: true,
      verificationStatus: 'declared-unverified'
    });
    expect(gammaArchiveInspection.warnings.map((warning) => warning.code)).toEqual(['missing-character-asset', 'missing-animation-asset']);

    const betaArchiveInspection = await inspectCharacterPackFromArchive(betaArchivePath);
    expect(betaArchiveInspection).toMatchObject({
      sourceType: 'archive',
      sourcePath: betaArchivePath,
      pack: {
        id: 'pack-beta',
        name: 'Pack Beta Archive'
      },
      existingPack: {
        id: 'pack-beta',
        source: 'installed'
      },
      activePack: {
        id: 'pack-beta',
        source: 'installed'
      },
      requiresReplace: true,
      willReplaceActive: true,
      installable: true,
      blockingErrors: [],
      compatibility: {
        currentPlatform: process.platform,
        currentAppVersion: '1.2.0',
        minAppVersion: '1.0.0',
        appVersionSatisfied: true,
        supportedFormatVersion: 1,
        formatVersionSupported: true
      }
    });
    expect(betaArchiveInspection.pack.previewAvatarPath).toBeTruthy();
    expect(betaArchiveInspection.pack.previewGifPath).toBeTruthy();
    expect(betaArchiveInspection.pack.previewVideoPath).toBeTruthy();
    expect(betaArchiveInspection.pack.previewAvatarPath?.startsWith(previewCacheRoot + path.sep)).toBe(true);
    expect(betaArchiveInspection.pack.previewGifPath?.startsWith(previewCacheRoot + path.sep)).toBe(true);
    expect(betaArchiveInspection.pack.previewVideoPath?.startsWith(previewCacheRoot + path.sep)).toBe(true);
    expect(existsSync(betaArchiveInspection.pack.previewAvatarPath!)).toBe(true);
    expect(existsSync(betaArchiveInspection.pack.previewGifPath!)).toBe(true);
    expect(existsSync(betaArchiveInspection.pack.previewVideoPath!)).toBe(true);
  });

  it('classifies unsigned and publisher-declared packs without pretending they are verified', async () => {
    tempRoot = mkdtempSync(path.join(os.tmpdir(), 'character-pack-manager-'));
    const builtinRoot = path.join(tempRoot, 'builtin-pack');
    const publisherDeclaredRoot = path.join(tempRoot, 'publisher-pack');
    const unsignedRoot = path.join(tempRoot, 'unsigned-pack');
    const publisherArchivePath = path.join(tempRoot, 'imports', 'pack-publisher.cbpk');
    const unsignedArchivePath = path.join(tempRoot, 'imports', 'pack-unsigned.cbpk');
    const userDataDir = path.join(tempRoot, 'user-data');

    writePack(builtinRoot, 'pack-alpha', 'Pack Alpha');
    writePack(publisherDeclaredRoot, 'pack-publisher', 'Pack Publisher', {
      signature: undefined
    });
    writePack(unsignedRoot, 'pack-unsigned', 'Pack Unsigned', {
      provenance: {},
      signature: {}
    });

    initCharacterPackManager({
      userDataDir,
      builtinPackRootDir: builtinRoot,
      appVersion: '1.2.0'
    });

    createTestArchive(publisherArchivePath, publisherDeclaredRoot);
    createTestArchive(unsignedArchivePath, unsignedRoot);

    const publisherInspection = await inspectCharacterPackFromArchive(publisherArchivePath);
    expect(publisherInspection.pack.trust).toMatchObject({
      level: 'publisher-declared',
      publisher: 'Test Publisher',
      channel: 'community',
      signatureDeclared: false,
      verificationStatus: 'none'
    });
    expect(publisherInspection.pack.trust.note).toContain('不会自动校验来源真实性');

    const unsignedInspection = await inspectCharacterPackFromArchive(unsignedArchivePath);
    expect(unsignedInspection.pack.trust).toMatchObject({
      level: 'unsigned',
      signatureDeclared: false,
      verificationStatus: 'none',
      links: []
    });
    expect(unsignedInspection.pack.trust.note).toContain('未声明发布者');
  });

  it('verifies external pack signatures against the bundled trust root', async () => {
    tempRoot = mkdtempSync(path.join(os.tmpdir(), 'character-pack-manager-'));
    const builtinRoot = path.join(tempRoot, 'builtin-pack');
    const signedRoot = path.join(tempRoot, 'signed-pack');
    const signedArchivePath = path.join(tempRoot, 'imports', 'pack-signed.cbpk');
    const userDataDir = path.join(tempRoot, 'user-data');
    const { publicKey, privateKey } = generateKeyPairSync('ed25519');

    writePack(builtinRoot, 'pack-alpha', 'Pack Alpha');
    writeTrustRoot(builtinRoot, [
      {
        keyId: 'trusted:test-publisher',
        publicKeyPem: publicKey.export({ type: 'spki', format: 'pem' }).toString(),
        publishers: ['Test Publisher'],
        channels: ['community']
      }
    ]);

    writePack(signedRoot, 'pack-signed', 'Pack Signed', {
      signature: {
        algorithm: 'ed25519',
        keyId: 'trusted:test-publisher'
      }
    });
    await signPackWithTrustedKey(signedRoot, privateKey.export({ type: 'pkcs8', format: 'pem' }).toString());

    initCharacterPackManager({
      userDataDir,
      builtinPackRootDir: builtinRoot,
      appVersion: '1.2.0'
    });

    createTestArchive(signedArchivePath, signedRoot);

    const inspection = await inspectCharacterPackFromArchive(signedArchivePath);
    expect(inspection.installable).toBe(true);
    expect(inspection.blockingErrors).toEqual([]);
    expect(inspection.pack.trust).toMatchObject({
      verificationStatus: 'signature-verified',
      signatureVerification: {
        status: 'verified',
        keyId: 'trusted:test-publisher',
        trustedKeyId: 'trusted:test-publisher'
      }
    });
    expect(inspection.pack.trust.note).toContain('公钥签名校验');
  });

  it('blocks imports when a trusted key signature no longer matches the pack payload', async () => {
    tempRoot = mkdtempSync(path.join(os.tmpdir(), 'character-pack-manager-'));
    const builtinRoot = path.join(tempRoot, 'builtin-pack');
    const signedRoot = path.join(tempRoot, 'signed-pack');
    const signedArchivePath = path.join(tempRoot, 'imports', 'pack-signed.cbpk');
    const userDataDir = path.join(tempRoot, 'user-data');
    const { publicKey, privateKey } = generateKeyPairSync('ed25519');

    writePack(builtinRoot, 'pack-alpha', 'Pack Alpha');
    writeTrustRoot(builtinRoot, [
      {
        keyId: 'trusted:test-publisher',
        publicKeyPem: publicKey.export({ type: 'spki', format: 'pem' }).toString(),
        publishers: ['Test Publisher'],
        channels: ['community']
      }
    ]);

    writePack(signedRoot, 'pack-signed', 'Pack Signed', {
      signature: {
        algorithm: 'ed25519',
        keyId: 'trusted:test-publisher'
      }
    });
    await signPackWithTrustedKey(signedRoot, privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(), {
      mutatePayloadAfterSign: (rootDir) => {
        writeFileSync(path.join(rootDir, 'preview', 'avatar.png'), 'tampered-preview', 'utf-8');
      }
    });

    initCharacterPackManager({
      userDataDir,
      builtinPackRootDir: builtinRoot,
      appVersion: '1.2.0'
    });

    createTestArchive(signedArchivePath, signedRoot);

    const inspection = await inspectCharacterPackFromArchive(signedArchivePath);
    expect(inspection.installable).toBe(false);
    expect(inspection.pack.trust).toMatchObject({
      verificationStatus: 'signature-mismatch',
      signatureVerification: {
        status: 'mismatch',
        keyId: 'trusted:test-publisher'
      }
    });
    expect(inspection.blockingErrors.map((error) => error.code)).toContain('signature-verification-failed');
    await expect(installCharacterPackFromArchive(signedArchivePath)).rejects.toThrow('可信公钥签名校验失败');
  });

  it('marks signed packs with unknown key ids as untrusted instead of verified', async () => {
    tempRoot = mkdtempSync(path.join(os.tmpdir(), 'character-pack-manager-'));
    const builtinRoot = path.join(tempRoot, 'builtin-pack');
    const signedRoot = path.join(tempRoot, 'signed-pack');
    const signedArchivePath = path.join(tempRoot, 'imports', 'pack-signed.cbpk');
    const userDataDir = path.join(tempRoot, 'user-data');
    const { privateKey } = generateKeyPairSync('ed25519');

    writePack(builtinRoot, 'pack-alpha', 'Pack Alpha');
    writePack(signedRoot, 'pack-signed', 'Pack Signed', {
      signature: {
        algorithm: 'ed25519',
        keyId: 'unknown:test-key'
      }
    });
    await signPackWithTrustedKey(signedRoot, privateKey.export({ type: 'pkcs8', format: 'pem' }).toString());

    initCharacterPackManager({
      userDataDir,
      builtinPackRootDir: builtinRoot,
      appVersion: '1.2.0'
    });

    createTestArchive(signedArchivePath, signedRoot);

    const inspection = await inspectCharacterPackFromArchive(signedArchivePath);
    expect(inspection.installable).toBe(true);
    expect(inspection.pack.trust).toMatchObject({
      verificationStatus: 'signature-untrusted',
      signatureVerification: {
        status: 'untrusted',
        keyId: 'unknown:test-key'
      }
    });
    expect(inspection.warnings.map((warning) => warning.code)).toContain('signature-untrusted-key');
  });

  it('blocks imports when the trust root has revoked the signing key', async () => {
    tempRoot = mkdtempSync(path.join(os.tmpdir(), 'character-pack-manager-'));
    const builtinRoot = path.join(tempRoot, 'builtin-pack');
    const signedRoot = path.join(tempRoot, 'signed-pack');
    const signedArchivePath = path.join(tempRoot, 'imports', 'pack-signed.cbpk');
    const userDataDir = path.join(tempRoot, 'user-data');
    const { privateKey } = generateKeyPairSync('ed25519');

    writePack(builtinRoot, 'pack-alpha', 'Pack Alpha');
    writeTrustRoot(builtinRoot, [], {
      revocations: [
        {
          keyId: 'trusted:test-publisher',
          reason: 'rotated to trusted:test-publisher:v2'
        }
      ]
    });

    writePack(signedRoot, 'pack-signed', 'Pack Signed', {
      signature: {
        algorithm: 'ed25519',
        keyId: 'trusted:test-publisher'
      }
    });
    await signPackWithTrustedKey(signedRoot, privateKey.export({ type: 'pkcs8', format: 'pem' }).toString());

    initCharacterPackManager({
      userDataDir,
      builtinPackRootDir: builtinRoot,
      appVersion: '1.2.0'
    });

    createTestArchive(signedArchivePath, signedRoot);

    const inspection = await inspectCharacterPackFromArchive(signedArchivePath);
    expect(inspection.installable).toBe(false);
    expect(inspection.pack.trust).toMatchObject({
      verificationStatus: 'signature-revoked',
      signatureVerification: {
        status: 'revoked',
        keyId: 'trusted:test-publisher',
        trustedKeyId: 'trusted:test-publisher'
      }
    });
    expect(inspection.pack.trust.note).toContain('已被当前应用信任根撤销');
    expect(inspection.blockingErrors.map((error) => error.code)).toContain('signature-key-revoked');
    await expect(installCharacterPackFromArchive(signedArchivePath)).rejects.toThrow('已被当前应用信任根撤销');
  });

  it('verifies declared sha256 pack payload digests and blocks mismatches', async () => {
    tempRoot = mkdtempSync(path.join(os.tmpdir(), 'character-pack-manager-'));
    const builtinRoot = path.join(tempRoot, 'builtin-pack');
    const verifiedRoot = path.join(tempRoot, 'verified-pack');
    const mismatchedRoot = path.join(tempRoot, 'mismatched-pack');
    const verifiedArchivePath = path.join(tempRoot, 'imports', 'pack-verified.cbpk');
    const mismatchedArchivePath = path.join(tempRoot, 'imports', 'pack-mismatch.cbpk');
    const userDataDir = path.join(tempRoot, 'user-data');

    writePack(builtinRoot, 'pack-alpha', 'Pack Alpha');
    const digest = await writePackWithPayloadDigest(verifiedRoot, 'pack-verified', 'Pack Verified');
    writePack(mismatchedRoot, 'pack-mismatch', 'Pack Mismatch', {
      signature: {
        algorithm: 'sha256',
        keyId: 'test-digest-key',
        digest: `sha256:${'0'.repeat(64)}`
      }
    });

    initCharacterPackManager({
      userDataDir,
      builtinPackRootDir: builtinRoot,
      appVersion: '1.2.0'
    });

    createTestArchive(verifiedArchivePath, verifiedRoot);
    createTestArchive(mismatchedArchivePath, mismatchedRoot);

    const verifiedInspection = await inspectCharacterPackFromArchive(verifiedArchivePath);
    expect(verifiedInspection.installable).toBe(true);
    expect(verifiedInspection.pack.trust).toMatchObject({
      level: 'signature-declared',
      signatureDeclared: true,
      verificationStatus: 'digest-verified',
      digest: {
        status: 'verified',
        declared: digest,
        actual: digest
      }
    });
    expect(verifiedInspection.pack.trust.note).toContain('内容摘要已校验');
    expect(verifiedInspection.pack.trust.note).toContain('未形成受信签名结论');

    const mismatchedInspection = await inspectCharacterPackFromArchive(mismatchedArchivePath);
    expect(mismatchedInspection.installable).toBe(false);
    expect(mismatchedInspection.pack.trust).toMatchObject({
      verificationStatus: 'digest-mismatch',
      digest: {
        status: 'mismatch',
        declared: '0'.repeat(64)
      }
    });
    expect(mismatchedInspection.blockingErrors.map((error) => error.code)).toContain('signature-digest-mismatch');
    await expect(installCharacterPackFromArchive(mismatchedArchivePath)).rejects.toThrow('SHA-256 digest');
  });

  it('does not resolve or cache pack assets outside the pack root', async () => {
    tempRoot = mkdtempSync(path.join(os.tmpdir(), 'character-pack-manager-'));
    const builtinRoot = path.join(tempRoot, 'builtin-pack');
    const importRoot = path.join(tempRoot, 'import-pack');
    const importArchivePath = path.join(tempRoot, 'imports', 'pack-escape.cbpk');
    const outsideRoot = path.join(tempRoot, 'outside-assets');
    const userDataDir = path.join(tempRoot, 'user-data');

    writePack(builtinRoot, 'pack-alpha', 'Pack Alpha');
    writeJsonFile(path.join(outsideRoot, 'evil-character.json'), { version: 1, id: 'evil', name: 'Evil' });
    writeJsonFile(path.join(outsideRoot, 'evil-index.json'), { version: 1, items: [] });
    mkdirSync(path.join(outsideRoot, 'voices'), { recursive: true });
    writeFileSync(path.join(outsideRoot, 'avatar.png'), 'outside-avatar', 'utf-8');
    writeFileSync(path.join(outsideRoot, 'preview.gif'), 'outside-gif', 'utf-8');
    writeFileSync(path.join(outsideRoot, 'preview.webm'), 'outside-video', 'utf-8');
    writePack(importRoot, 'pack-escape', 'Pack Escape', {
      assets: {
        character: '../outside-assets/evil-character.json',
        animations: path.join(outsideRoot, 'evil-index.json'),
        voices: '../outside-assets/voices',
        preview: {
          avatar: '../outside-assets/avatar.png',
          gif: path.join(outsideRoot, 'preview.gif'),
          video: '../outside-assets/preview.webm'
        }
      }
    });

    initCharacterPackManager({
      userDataDir,
      builtinPackRootDir: builtinRoot,
      appVersion: '1.2.0'
    });

    createTestArchive(importArchivePath, importRoot);

    const inspection = await inspectCharacterPackFromArchive(importArchivePath);

    expect(inspection.installable).toBe(false);
    expect(inspection.pack.previewAvatarPath).toBeUndefined();
    expect(inspection.pack.previewGifPath).toBeUndefined();
    expect(inspection.pack.previewVideoPath).toBeUndefined();
    expect(inspection.blockingErrors.map((error) => error.code)).toEqual(['core-asset-path-outside-pack']);
    expect(inspection.blockingErrors[0].message).toContain('character=../outside-assets/evil-character.json');
    expect(inspection.blockingErrors[0].message).toContain(`animations=${path.join(outsideRoot, 'evil-index.json')}`);
    expect(inspection.warnings.map((warning) => warning.code)).toEqual(['asset-path-outside-pack']);
    expect(inspection.warnings[0].message).toContain('voices=../outside-assets/voices');
    expect(inspection.warnings[0].message).toContain('preview.avatar=../outside-assets/avatar.png');
    expect(inspection.warnings[0].message).toContain(`preview.gif=${path.join(outsideRoot, 'preview.gif')}`);
    expect(inspection.warnings[0].message).toContain('preview.video=../outside-assets/preview.webm');

    await expect(installCharacterPackFromArchive(importArchivePath)).rejects.toThrow('核心资源路径越过角色包目录');
  });

  it('marks incompatible packs as non-installable and blocks install when format or app version requirements are not satisfied', async () => {
    tempRoot = mkdtempSync(path.join(os.tmpdir(), 'character-pack-manager-'));
    const builtinRoot = path.join(tempRoot, 'builtin-pack');
    const incompatibleRoot = path.join(tempRoot, 'incompatible-pack');
    const incompatibleArchivePath = path.join(tempRoot, 'imports', 'pack-zeta.cbpk');
    const userDataDir = path.join(tempRoot, 'user-data');

    writePack(builtinRoot, 'pack-alpha', 'Pack Alpha');
    writePack(incompatibleRoot, 'pack-zeta', 'Pack Zeta', {
      formatVersion: 2,
      minAppVersion: '2.5.0'
    });

    initCharacterPackManager({
      userDataDir,
      builtinPackRootDir: builtinRoot,
      appVersion: '1.2.0'
    });

    createTestArchive(incompatibleArchivePath, incompatibleRoot);

    const inspection = await inspectCharacterPackFromArchive(incompatibleArchivePath);
    expect(inspection).toMatchObject({
      installable: false,
      compatibility: {
        currentPlatform: process.platform,
        currentAppVersion: '1.2.0',
        minAppVersion: '2.5.0',
        appVersionSatisfied: false,
        supportedFormatVersion: 1,
        formatVersionSupported: false
      }
    });
    expect(inspection.blockingErrors.map((entry) => entry.code)).toEqual(['unsupported-format-version', 'min-app-version-not-satisfied']);

    await expect(
      installCharacterPackFromArchive(incompatibleArchivePath, {
        activate: true
      })
    ).rejects.toThrow(/formatVersion <= 1/);
  });

  it('creates editor packs with a fresh empty animation index instead of copying builtin animations', async () => {
    tempRoot = mkdtempSync(path.join(os.tmpdir(), 'character-pack-manager-'));
    const builtinRoot = path.join(tempRoot, 'builtin-pack');
    const userDataDir = path.join(tempRoot, 'user-data');

    writePack(builtinRoot, 'pack-alpha', 'Pack Alpha');
    writeJsonFile(path.join(builtinRoot, 'animations/index.json'), {
      version: 1,
      items: [
        {
          meta: {
            id: 'builtin-idle',
            title: 'Builtin Idle',
            primaryTrigger: 'idle'
          },
          source: {
            localPath: 'idle.webm',
            type: 'video/webm'
          }
        }
      ]
    });
    writeFileSync(path.join(builtinRoot, 'animations/idle.webm'), 'builtin-idle', 'utf-8');

    initCharacterPackManager({
      userDataDir,
      builtinPackRootDir: builtinRoot,
      appVersion: '1.0.0'
    });

    const result = await saveCharacterPackEditorDraft(
      {
        pack: {
          id: 'custom-alpha',
          name: 'Custom Alpha',
          version: '1.0.0',
          author: 'test',
          description: 'custom alpha',
          license: 'Custom',
          tags: ['custom'],
          platform: [process.platform]
        },
        character: {
          id: 'custom-alpha',
          name: 'Custom Alpha',
          nameAliases: [],
          tagline: 'Custom tagline',
          background: 'Custom background',
          coreTraits: ['warm'],
          boundaries: ['kind'],
          speechTone: 'gentle',
          language: 'zh-CN',
          firstPerson: '我',
          addressUser: '你',
          quirks: [],
          speechExamples: [],
          metaDescription: 'custom alpha',
          metaTags: ['custom']
        }
      },
      {
        basePackId: 'pack-alpha',
        basePackSource: 'builtin',
        activate: true
      }
    );

    const installedRoot = path.join(userDataDir, 'data', 'character-packs', 'custom-alpha');
    const pack = readPack(installedRoot);
    const character = readCharacter(installedRoot);
    const animationIndex = JSON.parse(readFileSync(path.join(installedRoot, 'animations/index.json'), 'utf-8'));

    expect(result).toMatchObject({
      created: true,
      activated: true,
      pack: {
        id: 'custom-alpha',
        source: 'installed',
        isActive: true
      }
    });
    expect(pack.assets).toMatchObject({
      character: 'character.json',
      animations: 'animations/index.json',
      gallery: 'gallery/index.json'
    });
    expect(pack.assets.preview).toBeUndefined();
    expect(animationIndex).toEqual({
      version: 1,
      items: []
    });
    expect(JSON.parse(readFileSync(path.join(installedRoot, 'gallery/index.json'), 'utf-8'))).toEqual({
      version: 1,
      items: []
    });
    expect(existsSync(path.join(installedRoot, 'animations/idle.webm'))).toBe(false);
    expect(existsSync(path.join(installedRoot, 'index.json'))).toBe(false);
    expectCharacterMessagesCoverSpecs(character.messages);
    expect(character.messages.categories.welcome).toEqual(['Custom Alpha上线了。', '你回来啦，今天想先处理什么？', '我在这里。']);
    expect(character.messages.events.aiComplete).toEqual(['回答好了。', '搞定了。']);
    expect(character.messages.routines['file.drop.intake.selected']).toBe('交给我吧。');
  });

  it('saves editor message overrides into custom character definitions', async () => {
    tempRoot = mkdtempSync(path.join(os.tmpdir(), 'character-pack-manager-'));
    const builtinRoot = path.join(tempRoot, 'builtin-pack');
    const userDataDir = path.join(tempRoot, 'user-data');

    writePack(builtinRoot, 'pack-alpha', 'Pack Alpha');

    initCharacterPackManager({
      userDataDir,
      builtinPackRootDir: builtinRoot,
      appVersion: '1.0.0'
    });

    await saveCharacterPackEditorDraft(
      {
        pack: {
          id: 'custom-lines',
          name: 'Custom Lines',
          version: '1.0.0',
          author: 'test',
          description: 'custom lines',
          license: 'Custom',
          tags: ['custom'],
          platform: [process.platform]
        },
        character: {
          id: 'custom-lines',
          name: 'Custom Lines',
          nameAliases: [],
          tagline: 'Custom tagline',
          background: 'Custom background',
          coreTraits: ['warm'],
          boundaries: ['kind'],
          speechTone: 'gentle',
          language: 'zh-CN',
          firstPerson: '咱',
          addressUser: '搭档',
          quirks: [],
          speechExamples: [],
          metaDescription: 'custom lines',
          metaTags: ['custom']
        },
        messages: {
          welcome: ['自定义欢迎'],
          click: ['自定义点击'],
          reminder: ['自定义休息'],
          tip: ['自定义提示'],
          fileDrop: ['自定义收文件'],
          aiThinking: ['自定义思考'],
          aiComplete: ['自定义完成'],
          aiError: ['自定义错误'],
          downloadComplete: ['自定义下载完成'],
          dailyRestReminder: ['自定义休息提醒'],
          fileDropPrompt: ['自定义文件询问']
        }
      },
      {
        basePackId: 'pack-alpha',
        basePackSource: 'builtin',
        activate: true
      }
    );

    const character = readCharacter(path.join(userDataDir, 'data', 'character-packs', 'custom-lines'));

    expect(character.messages.categories.welcome).toBe('自定义欢迎');
    expect(character.messages.categories.fileDrop).toBe('自定义收文件');
    expect(character.messages.events.aiThinking).toBe('自定义思考');
    expect(character.messages.events.downloadComplete).toBe('自定义下载完成');
    expect(getCharacterMessageTemplateLines(character.messages.events.appear)).toEqual(['咱来了。', '已经就位。']);
    expect(character.messages.routines['file.drop.intake.selected']).toBe('交给我吧。');
    expectCharacterMessagesCoverSpecs(character.messages);
  });

  it('imports, updates, replaces and removes installed character gallery items', async () => {
    tempRoot = mkdtempSync(path.join(os.tmpdir(), 'character-pack-manager-'));
    const builtinRoot = path.join(tempRoot, 'builtin-pack');
    const userDataDir = path.join(tempRoot, 'user-data');
    const sourceImage = path.join(tempRoot, 'idle-front.png');
    const replacementImage = path.join(tempRoot, 'idle-front-edited.png');

    writePack(builtinRoot, 'pack-alpha', 'Pack Alpha');
    const onePixelPng = Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000a49444154789c63000100000500010d0a2db40000000049454e44ae426082', 'hex');
    writeFileSync(sourceImage, onePixelPng);
    writeFileSync(replacementImage, onePixelPng);

    initCharacterPackManager({
      userDataDir,
      builtinPackRootDir: builtinRoot,
      appVersion: '1.0.0'
    });

    await saveCharacterPackEditorDraft(
      {
        pack: {
          id: 'custom-gallery',
          name: 'Custom Gallery',
          version: '1.0.0',
          author: 'test',
          description: 'custom gallery',
          license: 'Custom',
          tags: ['custom'],
          platform: [process.platform]
        },
        character: {
          id: 'custom-gallery',
          name: 'Custom Gallery',
          nameAliases: [],
          tagline: 'Custom tagline',
          background: 'Custom background',
          coreTraits: ['warm'],
          boundaries: ['kind'],
          speechTone: 'gentle',
          language: 'zh-CN',
          firstPerson: '我',
          addressUser: '你',
          quirks: [],
          speechExamples: [],
          metaDescription: 'custom gallery',
          metaTags: ['custom']
        }
      },
      {
        basePackId: 'pack-alpha',
        basePackSource: 'builtin',
        activate: true
      }
    );

    const imported = await importCharacterGalleryItem({
      filePath: sourceImage,
      draft: {
        title: 'Idle Front',
        kind: 'pose',
        semantic: {
          action: 'idle',
          view: 'front'
        },
        tags: ['idle', 'front'],
        ai: {
          referenceRole: 'character',
          preserveIdentity: true,
          promptHint: 'Keep character identity.'
        }
      }
    });
    const installedRoot = path.join(userDataDir, 'data', 'character-packs', 'custom-gallery');

    expect(imported.item).toMatchObject({
      id: 'idle-front',
      title: 'Idle Front',
      kind: 'pose',
      semantic: {
        action: 'idle',
        view: 'front'
      }
    });
    expect(imported.item.source.localPath.startsWith(installedRoot + path.sep)).toBe(true);
    expect(existsSync(imported.item.source.localPath)).toBe(true);

    const listed = await listCharacterGalleryItems();
    expect(listed?.items).toHaveLength(1);
    expect(JSON.parse(readFileSync(path.join(installedRoot, 'gallery/index.json'), 'utf-8')).items[0].source.localPath).toBe('gallery/images/idle-front.png');

    const updated = await updateCharacterGalleryItem(imported.item.id, {
      title: 'Idle Front Updated',
      kind: 'action',
      semantic: {
        action: 'idle',
        view: 'front',
        emotion: 'neutral'
      },
      tags: ['idle', 'front', 'updated']
    });
    expect(updated).toMatchObject({
      ok: true,
      item: {
        title: 'Idle Front Updated',
        kind: 'action',
        tags: ['idle', 'front', 'updated']
      }
    });

    const replaced = await replaceCharacterGalleryItemImage(imported.item.id, {
      filePath: replacementImage,
      origin: {
        type: 'ai-edited',
        parentId: imported.item.id,
        prompt: 'local repaint'
      }
    });
    expect(replaced.ok).toBe(true);
    expect(replaced.item?.origin).toMatchObject({
      type: 'ai-edited',
      parentId: imported.item.id
    });

    const aiContext = await buildCharacterGalleryAIEditContext({
      itemIds: [imported.item.id],
      prompt: 'Make a storyboard frame.'
    });
    expect(aiContext).toMatchObject({
      prompt: 'Make a storyboard frame.',
      images: [
        {
          id: imported.item.id,
          title: 'Idle Front Updated',
          kind: 'action',
          mimeType: 'image/png'
        }
      ]
    });
    expect(aiContext.referencesSummary).toContain('Idle Front Updated');
    expect(aiContext.combinedPrompt).toContain('Make a storyboard frame.');
    expect(aiContext.referenceSet).toMatchObject({
      imageCount: 1,
      itemIds: [imported.item.id],
      actions: ['idle'],
      views: ['front']
    });

    const removed = await removeCharacterGalleryItem(imported.item.id);
    expect(removed).toEqual({ ok: true });
    expect((await listCharacterGalleryItems())?.items).toHaveLength(0);
  });

  it('builds a multi-image gallery AI edit context for storyboard references', async () => {
    tempRoot = mkdtempSync(path.join(os.tmpdir(), 'character-pack-manager-'));
    const builtinRoot = path.join(tempRoot, 'builtin-pack');
    const userDataDir = path.join(tempRoot, 'user-data');
    const onePixelPng = Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000a49444154789c63000100000500010d0a2db40000000049454e44ae426082', 'hex');
    const sourceImage = path.join(tempRoot, 'source.png');
    writePack(builtinRoot, 'pack-alpha', 'Pack Alpha');
    writeFileSync(sourceImage, onePixelPng);

    initCharacterPackManager({
      userDataDir,
      builtinPackRootDir: builtinRoot,
      appVersion: '1.0.0'
    });

    await saveCharacterPackEditorDraft(
      {
        pack: {
          id: 'custom-gallery-multi-reference',
          name: 'Custom Gallery Multi Reference',
          version: '1.0.0',
          author: 'test',
          description: 'multi reference gallery',
          license: 'Custom',
          tags: ['custom'],
          platform: [process.platform]
        },
        character: {
          id: 'custom-gallery-multi-reference',
          name: 'Custom Gallery Multi Reference',
          nameAliases: [],
          tagline: 'Custom tagline',
          background: 'Custom background',
          coreTraits: ['warm'],
          boundaries: ['kind'],
          speechTone: 'gentle',
          language: 'zh-CN',
          firstPerson: '我',
          addressUser: '你',
          quirks: [],
          speechExamples: [],
          metaDescription: 'multi reference gallery',
          metaTags: ['custom']
        }
      },
      {
        basePackId: 'pack-alpha',
        basePackSource: 'builtin',
        activate: true
      }
    );

    const idle = await importCharacterGalleryItem({
      filePath: sourceImage,
      draft: {
        title: 'Idle Front',
        kind: 'pose',
        semantic: { action: 'idle', view: 'front' },
        tags: ['idle', 'front'],
        ai: { referenceRole: 'character', preserveIdentity: true, promptHint: 'Keep the face and outfit.', negativePrompt: 'extra limbs' }
      }
    });
    const left = await importCharacterGalleryItem({
      filePath: sourceImage,
      draft: {
        title: 'Walk Left',
        kind: 'action',
        semantic: { action: 'walk-left', view: 'left' },
        tags: ['walk', 'left'],
        ai: { referenceRole: 'pose', referenceStrength: 0.65, promptHint: 'Use the left-facing silhouette.' }
      }
    });
    const jump = await importCharacterGalleryItem({
      filePath: sourceImage,
      draft: {
        title: 'Jump Point',
        kind: 'action',
        semantic: { action: 'jump-point', view: 'three-quarter-right' },
        tags: ['jump', 'point'],
        ai: { referenceRole: 'storyboard', promptHint: 'Use the airborne pointing gesture.' }
      }
    });

    const context = await buildCharacterGalleryAIEditContext({
      itemIds: [idle.item.id, left.item.id, jump.item.id],
      prompt: 'Create a single storyboard frame.',
      negativePrompt: 'low detail'
    });

    expect(context.images.map((image) => image.id)).toEqual([idle.item.id, left.item.id, jump.item.id]);
    expect(context.images.map((image) => image.referenceRole)).toEqual(['character', 'pose', 'storyboard']);
    expect(context.referenceSet).toMatchObject({
      imageCount: 3,
      itemIds: [idle.item.id, left.item.id, jump.item.id],
      actions: ['idle', 'walk-left', 'jump-point'],
      views: ['front', 'left', 'three-quarter-right'],
      roles: ['character', 'pose', 'storyboard'],
      negativePrompts: ['extra limbs']
    });
    expect(context.combinedPrompt).toContain('Create a single storyboard frame.');
    expect(context.combinedPrompt).toContain('Walk Left');
    expect(context.combinedPrompt).toContain('Use the airborne pointing gesture.');
    expect(context.combinedNegativePrompt).toContain('low detail');
    expect(context.combinedNegativePrompt).toContain('extra limbs');
    expect(context.groups).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: 'action', key: 'idle', itemIds: [idle.item.id] }),
        expect.objectContaining({ kind: 'view', key: 'left', itemIds: [left.item.id] }),
        expect.objectContaining({ kind: 'role', key: 'storyboard', itemIds: [jump.item.id] })
      ])
    );

    await expect(
      buildCharacterGalleryAIEditContext({
        itemIds: [],
        prompt: 'Missing references'
      })
    ).rejects.toThrow('At least one gallery reference image is required');
  });

  it('only cleans files managed by the character gallery directories', async () => {
    tempRoot = mkdtempSync(path.join(os.tmpdir(), 'character-pack-manager-'));
    const builtinRoot = path.join(tempRoot, 'builtin-pack');
    const userDataDir = path.join(tempRoot, 'user-data');
    const sourceImage = path.join(tempRoot, 'idle-front.png');
    const onePixelPng = Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000a49444154789c63000100000500010d0a2db40000000049454e44ae426082', 'hex');

    writePack(builtinRoot, 'pack-alpha', 'Pack Alpha');
    writeFileSync(sourceImage, onePixelPng);

    initCharacterPackManager({
      userDataDir,
      builtinPackRootDir: builtinRoot,
      appVersion: '1.0.0'
    });

    await saveCharacterPackEditorDraft(
      {
        pack: {
          id: 'custom-gallery-cleanup',
          name: 'Custom Gallery Cleanup',
          version: '1.0.0',
          author: 'test',
          description: 'custom gallery cleanup',
          license: 'Custom',
          tags: ['custom'],
          platform: [process.platform]
        },
        character: {
          id: 'custom-gallery-cleanup',
          name: 'Custom Gallery Cleanup',
          nameAliases: [],
          tagline: 'Custom tagline',
          background: 'Custom background',
          coreTraits: ['warm'],
          boundaries: ['kind'],
          speechTone: 'gentle',
          language: 'zh-CN',
          firstPerson: '我',
          addressUser: '你',
          quirks: [],
          speechExamples: [],
          metaDescription: 'custom gallery cleanup',
          metaTags: ['custom']
        }
      },
      {
        basePackId: 'pack-alpha',
        basePackSource: 'builtin',
        activate: true
      }
    );

    const installedRoot = path.join(userDataDir, 'data', 'character-packs', 'custom-gallery-cleanup');
    const protectedAsset = path.join(installedRoot, 'preview', 'avatar.png');
    mkdirSync(path.dirname(protectedAsset), { recursive: true });
    writeFileSync(protectedAsset, onePixelPng);

    const imported = await importCharacterGalleryItem({
      filePath: sourceImage,
      draft: {
        title: 'Idle Front',
        kind: 'pose'
      }
    });

    const indexPath = path.join(installedRoot, 'gallery', 'index.json');
    const index = JSON.parse(readFileSync(indexPath, 'utf-8'));
    index.items[0].source.localPath = 'preview/avatar.png';
    writeFileSync(indexPath, `${JSON.stringify(index, null, 2)}\n`, 'utf-8');

    expect((await listCharacterGalleryItems())?.items[0].source.localPath).toBe(protectedAsset);
    await removeCharacterGalleryItem(imported.item.id);

    expect(existsSync(protectedAsset)).toBe(true);
  });

  it('removes an inactive installed pack and keeps the current active pack unchanged', async () => {
    tempRoot = mkdtempSync(path.join(os.tmpdir(), 'character-pack-manager-'));
    const builtinRoot = path.join(tempRoot, 'builtin-pack');
    const installedRoot = path.join(tempRoot, 'user-data', 'data', 'character-packs', 'pack-beta');
    const userDataDir = path.join(tempRoot, 'user-data');

    writePack(builtinRoot, 'pack-alpha', 'Pack Alpha');
    writePack(installedRoot, 'pack-beta', 'Pack Beta');

    initCharacterPackManager({
      userDataDir,
      builtinPackRootDir: builtinRoot,
      appVersion: '1.0.0'
    });

    const removal = await removeCharacterPack('pack-beta', {
      source: 'installed'
    });

    expect(removal).toMatchObject({
      removedPack: {
        id: 'pack-beta',
        source: 'installed'
      },
      activePack: {
        id: 'pack-alpha',
        source: 'builtin'
      },
      switchedActivePack: false
    });
    expect(existsSync(installedRoot)).toBe(false);
  });
});
