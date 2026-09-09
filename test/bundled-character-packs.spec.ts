import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../packages/common/utils/file', () => ({
  listArchiveEntriesWith7Z: vi.fn(),
  unzipFileWith7Z: vi.fn(),
  zipDirectoryContentsWith7Z: vi.fn()
}));

import { getActiveCharacterPack, initCharacterPackManager, listCharacterPacks, resetCharacterPackManager, resolveCharacterPackPresentation } from '../packages/sprite-core/character-pack-manager';

describe('bundled character packs', () => {
  let userDataDir: string | null = null;

  afterEach(() => {
    resetCharacterPackManager();
    if (userDataDir) rmSync(userDataDir, { recursive: true, force: true });
    userDataDir = null;
  });

  it('discovers video, Live2D, and VRM packs while keeping video as the first-run default', async () => {
    userDataDir = mkdtempSync(path.join(os.tmpdir(), 'bundled-character-packs-'));
    initCharacterPackManager({
      userDataDir,
      builtinPackRootDir: path.resolve('resources/sprites'),
      extraBuiltinPacksRootDir: path.resolve('resources/character-packs'),
      appVersion: '1.0.0'
    });

    const packs = await listCharacterPacks();
    expect(packs.map((pack) => pack.id)).toEqual(['yua-default', 'mao-pro', 'three-buddy']);
    expect((await getActiveCharacterPack())?.id).toBe('yua-default');

    const presentations = Object.fromEntries(packs.map((pack) => [pack.id, resolveCharacterPackPresentation(pack)]));
    expect(presentations['yua-default']).toEqual({ renderer: 'video' });
    expect(presentations['mao-pro']).toMatchObject({
      renderer: 'live2d',
      model: { type: 'model/live2d' },
      config: { type: 'application/json' }
    });
    expect(presentations['three-buddy']).toMatchObject({
      renderer: 'three',
      model: { format: 'vrm', type: 'model/vrm' }
    });
  });

  it('keeps every Mao model reference inside its self-contained character pack', () => {
    const modelPath = path.resolve('resources/character-packs/mao-pro/live2d/runtime/mao_pro.model3.json');
    const modelDir = path.dirname(modelPath);
    const model = JSON.parse(readFileSync(modelPath, 'utf-8')) as {
      FileReferences?: {
        Moc?: string;
        Textures?: string[];
        Physics?: string;
        Pose?: string;
        UserData?: string;
        Expressions?: Array<{ File?: string }>;
        Motions?: Record<string, Array<{ File?: string }>>;
      };
    };
    const references = model.FileReferences;
    const declaredFiles = [
      references?.Moc,
      ...(references?.Textures ?? []),
      references?.Physics,
      references?.Pose,
      references?.UserData,
      ...(references?.Expressions ?? []).map((entry) => entry.File),
      ...Object.values(references?.Motions ?? {}).flatMap((entries) => entries.map((entry) => entry.File))
    ].filter((entry): entry is string => !!entry);

    expect(declaredFiles.length).toBeGreaterThan(0);
    for (const declaredFile of declaredFiles) {
      const resolved = path.resolve(modelDir, declaredFile);
      expect(resolved.startsWith(modelDir + path.sep), declaredFile).toBe(true);
      expect(existsSync(resolved), declaredFile).toBe(true);
    }
  });
});
