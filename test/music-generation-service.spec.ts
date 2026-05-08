import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { PiMusicGenerationService } from '../packages/ai/runtime/pi/music-generation-service';

const tempDirs: string[] = [];

describe('PiMusicGenerationService', () => {
  afterEach(async () => {
    await Promise.all(tempDirs.splice(0).map((dir) => fs.rm(dir, { force: true, recursive: true })));
  });

  it('materializes base64 music artifacts to local files', async () => {
    const outputDir = await fs.mkdtemp(path.join(os.tmpdir(), 'chobits-music-generation-'));
    tempDirs.push(outputDir);

    const response = await new PiMusicGenerationService().materializeMusicResponse(
      {
        artifacts: [
          {
            audioBase64: Buffer.from('hello audio').toString('base64'),
            format: 'mp3',
            mimeType: 'audio/mpeg'
          }
        ],
        model: 'music-2.6',
        providerId: 'minimax'
      },
      {
        outputDir,
        request: {
          audioSetting: { format: 'mp3' },
          model: 'music-2.6',
          prompt: 'ambient piano',
          providerId: 'minimax'
        },
        requestId: 'request-123'
      }
    );

    expect(response.filePath).toContain(outputDir);
    expect(response.artifacts[0].filePath).toBe(response.filePath);
    expect(response.artifacts[0].audioBase64).toBeUndefined();
    await expect(fs.readFile(response.filePath!, 'utf8')).resolves.toBe('hello audio');
  });
});
