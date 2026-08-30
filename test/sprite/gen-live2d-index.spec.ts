import { execSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

describe('gen-live2d-index script', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(path.join(tmpdir(), 'live2d-index-'));
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('generates index.json entries from live2d.json triggers', () => {
    const config = {
      model: 'test.model3.json',
      canvas: { width: 300, height: 400, padding: 40, scale: 1 },
      triggers: {
        idle: { motion: { group: 'Idle', index: 0 }, loop: true },
        wave: { motion: { group: '', index: 3 }, loop: false }
      }
    };
    writeFileSync(path.join(tempDir, 'live2d.json'), JSON.stringify(config), 'utf8');

    const scriptPath = path.resolve(process.cwd(), 'scripts/gen-live2d-index.mjs');
    execSync(`node "${scriptPath}" "${tempDir}"`, { cwd: process.cwd(), stdio: 'pipe' });

    const indexPath = path.join(tempDir, 'index.json');
    const index = JSON.parse(readFileSync(indexPath, 'utf8'));

    expect(index.version).toBe(1);
    expect(index.items).toHaveLength(2);

    const idle = index.items.find((i: any) => i.meta.primaryTrigger === 'idle');
    expect(idle).toBeDefined();
    expect(idle.source.type).toBe('live2d');
    expect(idle.source.localPath).toBe(path.basename(tempDir));
    expect(idle.width).toBe(300);
    expect(idle.height).toBe(400);
    expect(idle.padding).toBe(40);
    expect(idle.loop).toBe(true);
    expect(idle.autoIdle).toBe(false);

    const wave = index.items.find((i: any) => i.meta.primaryTrigger === 'wave');
    expect(wave).toBeDefined();
    expect(wave.loop).toBe(false);
    expect(wave.autoIdle).toBe(true);
  });

  it('updates existing entries without duplicating', () => {
    const config = {
      model: 'test.model3.json',
      canvas: { width: 300, height: 400, padding: 40, scale: 1 },
      triggers: {
        idle: { motion: { group: 'Idle', index: 0 }, loop: true }
      }
    };
    writeFileSync(path.join(tempDir, 'live2d.json'), JSON.stringify(config), 'utf8');

    const scriptPath = path.resolve(process.cwd(), 'scripts/gen-live2d-index.mjs');
    execSync(`node "${scriptPath}" "${tempDir}"`, { cwd: process.cwd(), stdio: 'pipe' });
    execSync(`node "${scriptPath}" "${tempDir}"`, { cwd: process.cwd(), stdio: 'pipe' });

    const indexPath = path.join(tempDir, 'index.json');
    const index = JSON.parse(readFileSync(indexPath, 'utf8'));

    expect(index.items).toHaveLength(1);
    expect(index.items[0].meta.id).toBe('live2d-idle');
  });
});
