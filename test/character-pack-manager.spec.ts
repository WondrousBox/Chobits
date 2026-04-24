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

vi.mock('../packages/common/utils/file', () => ({
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
  })
}));

import { unzipFileWith7Z } from '../packages/common/utils/file';
import { calculateCharacterPackPayloadDigest } from '../packages/sprite-core/character-pack-integrity';
import {
  getActiveCharacterPack,
  getCharacterPackImportPreviewCacheRootDir,
  initCharacterPackManager,
  inspectCharacterPackFromArchive,
  inspectCharacterPackFromDirectory,
  installCharacterPackFromArchive,
  installCharacterPackFromDirectory,
  listCharacterPacks,
  removeCharacterPack,
  resetCharacterPackManager
} from '../packages/sprite-core/character-pack-manager';
import { createCharacterPackSignaturePayload } from '../packages/sprite-core/character-pack-signature';

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
    const installedRoot = path.join(userDataDir, 'character-packs', 'pack-beta');

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

    const stateFile = path.join(userDataDir, 'data', 'active-character-pack.json');
    expect(existsSync(stateFile)).toBe(true);
    expect(JSON.parse(readFileSync(stateFile, 'utf-8'))).toEqual({
      version: 1,
      id: 'pack-alpha',
      source: 'builtin'
    });
  });

  it('installs a pack from a directory and can activate it immediately', async () => {
    tempRoot = mkdtempSync(path.join(os.tmpdir(), 'character-pack-manager-'));
    const builtinRoot = path.join(tempRoot, 'builtin-pack');
    const importRoot = path.join(tempRoot, 'import-pack');
    const userDataDir = path.join(tempRoot, 'user-data');

    writePack(builtinRoot, 'pack-alpha', 'Pack Alpha');
    writePack(importRoot, 'pack-gamma', 'Pack Gamma');

    initCharacterPackManager({
      userDataDir,
      builtinPackRootDir: builtinRoot,
      appVersion: '1.0.0'
    });

    const result = await installCharacterPackFromDirectory(importRoot, {
      activate: true
    });

    expect(result).toMatchObject({
      replaced: false,
      activated: true,
      pack: {
        id: 'pack-gamma',
        source: 'installed',
        isActive: true
      }
    });
    expect(existsSync(path.join(userDataDir, 'character-packs', 'pack-gamma', 'pack.json'))).toBe(true);

    const activePack = await getActiveCharacterPack();
    expect(activePack).toMatchObject({
      id: 'pack-gamma',
      source: 'installed',
      isActive: true
    });
  });

  it('installs a pack from a .chobits-character archive and resolves the extracted pack root', async () => {
    tempRoot = mkdtempSync(path.join(os.tmpdir(), 'character-pack-manager-'));
    const builtinRoot = path.join(tempRoot, 'builtin-pack');
    const archiveSourceRoot = path.join(tempRoot, 'archive-source', 'nested-pack-root');
    const archivePath = path.join(tempRoot, 'imports', 'pack-delta.chobits-character');
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
    expect(existsSync(path.join(userDataDir, 'character-packs', 'pack-delta', 'pack.json'))).toBe(true);
  });

  it('preflights archive entries before extraction and rejects path traversal', async () => {
    tempRoot = mkdtempSync(path.join(os.tmpdir(), 'character-pack-manager-'));
    const builtinRoot = path.join(tempRoot, 'builtin-pack');
    const archivePath = path.join(tempRoot, 'imports', 'pack-unsafe.chobits-character');
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
    const archivePath = path.join(tempRoot, 'imports', 'pack-huge.chobits-character');
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
    const archivePath = path.join(tempRoot, 'imports', 'pack-symlink.chobits-character');
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
    expect(existsSync(path.join(userDataDir, 'character-packs', 'pack-symlink'))).toBe(false);
  });

  it('inspects directory and archive imports before installation, including conflict and warning metadata', async () => {
    tempRoot = mkdtempSync(path.join(os.tmpdir(), 'character-pack-manager-'));
    const builtinRoot = path.join(tempRoot, 'builtin-pack');
    const importRoot = path.join(tempRoot, 'import-pack');
    const archiveSourceRoot = path.join(tempRoot, 'archive-source', 'nested-pack-root');
    const archivePath = path.join(tempRoot, 'imports', 'pack-beta.chobits-character');
    const installedRoot = path.join(tempRoot, 'user-data', 'character-packs', 'pack-beta');
    const userDataDir = path.join(tempRoot, 'user-data');

    writePack(builtinRoot, 'pack-alpha', 'Pack Alpha');
    writePack(importRoot, 'pack-gamma', 'Pack Gamma');
    writePack(installedRoot, 'pack-beta', 'Pack Beta');
    writePack(archiveSourceRoot, 'pack-beta', 'Pack Beta Archive');
    mkdirSync(path.dirname(archivePath), { recursive: true });
    writeFileSync(archivePath, 'fake archive payload', 'utf-8');
    archiveExtractMap.set(archivePath, path.join(tempRoot, 'archive-source'));

    initCharacterPackManager({
      userDataDir,
      builtinPackRootDir: builtinRoot,
      appVersion: '1.2.0'
    });

    await installCharacterPackFromDirectory(installedRoot, {
      activate: true
    });
    const previewCacheRoot = getCharacterPackImportPreviewCacheRootDir();

    const directoryInspection = await inspectCharacterPackFromDirectory(importRoot);
    expect(directoryInspection).toMatchObject({
      sourceType: 'directory',
      sourcePath: importRoot,
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
    expect(directoryInspection.pack.previewAvatarPath).toBeTruthy();
    expect(directoryInspection.pack.previewGifPath).toBeTruthy();
    expect(directoryInspection.pack.previewVideoPath).toBeTruthy();
    expect(directoryInspection.pack.previewAvatarPath?.startsWith(previewCacheRoot + path.sep)).toBe(true);
    expect(directoryInspection.pack.previewGifPath?.startsWith(previewCacheRoot + path.sep)).toBe(true);
    expect(directoryInspection.pack.previewVideoPath?.startsWith(previewCacheRoot + path.sep)).toBe(true);
    expect(existsSync(directoryInspection.pack.previewAvatarPath!)).toBe(true);
    expect(existsSync(directoryInspection.pack.previewGifPath!)).toBe(true);
    expect(existsSync(directoryInspection.pack.previewVideoPath!)).toBe(true);
    expect(directoryInspection.pack.trust).toMatchObject({
      level: 'signature-declared',
      publisher: 'Test Publisher',
      channel: 'community',
      signatureDeclared: true,
      verificationStatus: 'declared-unverified'
    });
    expect(directoryInspection.warnings.map((warning) => warning.code)).toEqual(['missing-character-asset', 'missing-animation-asset']);

    const archiveInspection = await inspectCharacterPackFromArchive(archivePath);
    expect(archiveInspection).toMatchObject({
      sourceType: 'archive',
      sourcePath: archivePath,
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
    expect(archiveInspection.pack.previewAvatarPath).toBeTruthy();
    expect(archiveInspection.pack.previewGifPath).toBeTruthy();
    expect(archiveInspection.pack.previewVideoPath).toBeTruthy();
    expect(archiveInspection.pack.previewAvatarPath?.startsWith(previewCacheRoot + path.sep)).toBe(true);
    expect(archiveInspection.pack.previewGifPath?.startsWith(previewCacheRoot + path.sep)).toBe(true);
    expect(archiveInspection.pack.previewVideoPath?.startsWith(previewCacheRoot + path.sep)).toBe(true);
    expect(existsSync(archiveInspection.pack.previewAvatarPath!)).toBe(true);
    expect(existsSync(archiveInspection.pack.previewGifPath!)).toBe(true);
    expect(existsSync(archiveInspection.pack.previewVideoPath!)).toBe(true);
  });

  it('classifies unsigned and publisher-declared packs without pretending they are verified', async () => {
    tempRoot = mkdtempSync(path.join(os.tmpdir(), 'character-pack-manager-'));
    const builtinRoot = path.join(tempRoot, 'builtin-pack');
    const publisherDeclaredRoot = path.join(tempRoot, 'publisher-pack');
    const unsignedRoot = path.join(tempRoot, 'unsigned-pack');
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

    const publisherInspection = await inspectCharacterPackFromDirectory(publisherDeclaredRoot);
    expect(publisherInspection.pack.trust).toMatchObject({
      level: 'publisher-declared',
      publisher: 'Test Publisher',
      channel: 'community',
      signatureDeclared: false,
      verificationStatus: 'none'
    });
    expect(publisherInspection.pack.trust.note).toContain('不会自动校验来源真实性');

    const unsignedInspection = await inspectCharacterPackFromDirectory(unsignedRoot);
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

    const inspection = await inspectCharacterPackFromDirectory(signedRoot);
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

    const inspection = await inspectCharacterPackFromDirectory(signedRoot);
    expect(inspection.installable).toBe(false);
    expect(inspection.pack.trust).toMatchObject({
      verificationStatus: 'signature-mismatch',
      signatureVerification: {
        status: 'mismatch',
        keyId: 'trusted:test-publisher'
      }
    });
    expect(inspection.blockingErrors.map((error) => error.code)).toContain('signature-verification-failed');
    await expect(installCharacterPackFromDirectory(signedRoot)).rejects.toThrow('可信公钥签名校验失败');
  });

  it('marks signed packs with unknown key ids as untrusted instead of verified', async () => {
    tempRoot = mkdtempSync(path.join(os.tmpdir(), 'character-pack-manager-'));
    const builtinRoot = path.join(tempRoot, 'builtin-pack');
    const signedRoot = path.join(tempRoot, 'signed-pack');
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

    const inspection = await inspectCharacterPackFromDirectory(signedRoot);
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
    const userDataDir = path.join(tempRoot, 'user-data');
    const { privateKey } = generateKeyPairSync('ed25519');

    writePack(builtinRoot, 'pack-alpha', 'Pack Alpha');
    writeTrustRoot(
      builtinRoot,
      [],
      {
        revocations: [
          {
            keyId: 'trusted:test-publisher',
            reason: 'rotated to trusted:test-publisher:v2'
          }
        ]
      }
    );

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

    const inspection = await inspectCharacterPackFromDirectory(signedRoot);
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
    await expect(installCharacterPackFromDirectory(signedRoot)).rejects.toThrow('已被当前应用信任根撤销');
  });

  it('verifies declared sha256 pack payload digests and blocks mismatches', async () => {
    tempRoot = mkdtempSync(path.join(os.tmpdir(), 'character-pack-manager-'));
    const builtinRoot = path.join(tempRoot, 'builtin-pack');
    const verifiedRoot = path.join(tempRoot, 'verified-pack');
    const mismatchedRoot = path.join(tempRoot, 'mismatched-pack');
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

    const verifiedInspection = await inspectCharacterPackFromDirectory(verifiedRoot);
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

    const mismatchedInspection = await inspectCharacterPackFromDirectory(mismatchedRoot);
    expect(mismatchedInspection.installable).toBe(false);
    expect(mismatchedInspection.pack.trust).toMatchObject({
      verificationStatus: 'digest-mismatch',
      digest: {
        status: 'mismatch',
        declared: '0'.repeat(64)
      }
    });
    expect(mismatchedInspection.blockingErrors.map((error) => error.code)).toContain('signature-digest-mismatch');
    await expect(installCharacterPackFromDirectory(mismatchedRoot)).rejects.toThrow('SHA-256 digest');
  });

  it('does not resolve or cache pack assets outside the pack root', async () => {
    tempRoot = mkdtempSync(path.join(os.tmpdir(), 'character-pack-manager-'));
    const builtinRoot = path.join(tempRoot, 'builtin-pack');
    const importRoot = path.join(tempRoot, 'import-pack');
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

    const inspection = await inspectCharacterPackFromDirectory(importRoot);

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

    await expect(installCharacterPackFromDirectory(importRoot)).rejects.toThrow('核心资源路径越过角色包目录');
  });

  it('rejects directory pack symbolic links before copying installed files', async () => {
    tempRoot = mkdtempSync(path.join(os.tmpdir(), 'character-pack-manager-'));
    const builtinRoot = path.join(tempRoot, 'builtin-pack');
    const importRoot = path.join(tempRoot, 'import-pack');
    const userDataDir = path.join(tempRoot, 'user-data');
    const outsideTargetPath = path.join(tempRoot, 'outside-target.txt');
    const symlinkPath = path.join(importRoot, 'linked-outside.txt');

    writePack(builtinRoot, 'pack-alpha', 'Pack Alpha');
    writePack(importRoot, 'pack-symlink', 'Pack Symlink');
    writeFileSync(outsideTargetPath, 'outside', 'utf-8');
    if (!tryCreateSymlink(outsideTargetPath, symlinkPath)) {
      return;
    }

    initCharacterPackManager({
      userDataDir,
      builtinPackRootDir: builtinRoot,
      appVersion: '1.2.0'
    });

    await expect(inspectCharacterPackFromDirectory(importRoot)).rejects.toThrow('unsupported symbolic link');
    await expect(installCharacterPackFromDirectory(importRoot)).rejects.toThrow('unsupported symbolic link');
    expect(existsSync(path.join(userDataDir, 'character-packs', 'pack-symlink'))).toBe(false);
  });

  it('marks incompatible packs as non-installable and blocks install when format or app version requirements are not satisfied', async () => {
    tempRoot = mkdtempSync(path.join(os.tmpdir(), 'character-pack-manager-'));
    const builtinRoot = path.join(tempRoot, 'builtin-pack');
    const incompatibleRoot = path.join(tempRoot, 'incompatible-pack');
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

    const inspection = await inspectCharacterPackFromDirectory(incompatibleRoot);
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
      installCharacterPackFromDirectory(incompatibleRoot, {
        activate: true
      })
    ).rejects.toThrow(/formatVersion <= 1/);
  });

  it('removes an inactive installed pack and keeps the current active pack unchanged', async () => {
    tempRoot = mkdtempSync(path.join(os.tmpdir(), 'character-pack-manager-'));
    const builtinRoot = path.join(tempRoot, 'builtin-pack');
    const installedRoot = path.join(tempRoot, 'user-data', 'character-packs', 'pack-beta');
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
