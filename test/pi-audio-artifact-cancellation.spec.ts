import fsPromises from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { PiAudioArtifactService } from '../packages/ai/runtime/pi/audio-artifact-service';

describe('Pi audio artifact cancellation', () => {
  it('does not create an output directory when already aborted', async () => {
    const outputDir = path.join(os.tmpdir(), `pi-audio-cancel-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    const controller = new AbortController();
    controller.abort();

    await expect(
      new PiAudioArtifactService().materializeMusicResponse(
        {
          artifacts: [{ audioBase64: Buffer.from('audio').toString('base64') }],
          model: 'music-model',
          providerId: 'test-provider'
        },
        {
          outputDir,
          request: { model: 'music-model', prompt: 'music', providerId: 'test-provider' },
          requestId: 'request-1',
          signal: controller.signal
        }
      )
    ).rejects.toMatchObject({ name: 'AbortError' });
    await expect(fsPromises.access(outputDir)).rejects.toThrow();
  });
});
