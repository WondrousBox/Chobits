import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { calculateCharacterPackPayloadDigest } from '../../packages/sprite-core/character-pack-integrity';
import type { SpriteAnimation } from '../../packages/sprite-core/types';

describe('default sprite resource index metadata', () => {
  it('declares primaryTrigger without legacy eventType mirror fields', () => {
    const indexPath = path.resolve(process.cwd(), 'resources/sprites/index.json');
    const raw = JSON.parse(readFileSync(indexPath, 'utf8')) as { items?: SpriteAnimation[] };

    expect(Array.isArray(raw.items)).toBe(true);

    for (const item of raw.items ?? []) {
      expect(item.meta.primaryTrigger, `default sprite "${item.meta.id}" should declare primaryTrigger`).toBeTruthy();
      expect(item.meta).not.toHaveProperty('eventType');
    }
  });

  it('includes a default talk animation trigger', () => {
    const indexPath = path.resolve(process.cwd(), 'resources/sprites/index.json');
    const raw = JSON.parse(readFileSync(indexPath, 'utf8')) as { items?: SpriteAnimation[] };

    expect(raw.items?.some((item) => item.meta.primaryTrigger === 'talk')).toBe(true);
  });

  it('keeps the default character pack sha256 payload digest in sync', async () => {
    const packRoot = path.resolve(process.cwd(), 'resources/sprites');
    const packPath = path.join(packRoot, 'pack.json');
    const raw = JSON.parse(readFileSync(packPath, 'utf8')) as { signature?: { digest?: string } };

    await expect(calculateCharacterPackPayloadDigest(packRoot)).resolves.toBe(raw.signature?.digest?.replace(/^sha256:/i, ''));
  });
});
