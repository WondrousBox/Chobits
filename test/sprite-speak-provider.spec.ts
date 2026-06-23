import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { SpeakCache } from '../packages/sprite-core/speak/speak-cache';
import { SpeakConfigStore } from '../packages/sprite-core/speak/speak-config-store';
import { SpeakService } from '../packages/sprite-core/speak/speak-service';
import type { SpriteSpeechSynthesisExecutor } from '../packages/sprite-core/speak/types';

const tempDirs: string[] = [];

function makeTempDir(): string {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'sprite-speak-provider-test-'));
  tempDirs.push(dir);
  return dir;
}

function audioBase64(value: string): string {
  return Buffer.from(value).toString('base64');
}

afterEach(() => {
  vi.restoreAllMocks();
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop();
    if (dir) rmSync(dir, { recursive: true, force: true });
  }
});

describe('Sprite speak AI Provider config', () => {
  it('migrates legacy Edge config while adding provider defaults', () => {
    const dataDir = makeTempDir();
    const configDir = path.join(dataDir, 'data');
    mkdirSync(configDir, { recursive: true });
    writeFileSync(
      path.join(configDir, 'sprite-speak-config.json'),
      JSON.stringify({
        enabled: true,
        serviceType: 'Edge',
        voiceName: 'zh-CN-YunxiNeural',
        rate: 30,
        pitch: -5,
        volume: 0.8
      }),
      { encoding: 'utf8', flag: 'w' }
    );

    const store = new SpeakConfigStore(dataDir);
    const config = store.load();

    expect(config.engine).toBe('edge');
    expect(config.serviceType).toBe('Edge');
    expect(config.voiceName).toBe('zh-CN-YunxiNeural');
    expect(config.aiProvider).toMatchObject({
      providerId: 'minimax',
      model: 'speech-2.8-turbo',
      voiceId: 'female-shaonv',
      mode: 'complete'
    });
  });

  it('keeps legacy Edge cache ids unchanged', () => {
    const cacheId = SpeakCache.generateCacheId(
      {
        serviceType: 'Edge',
        voiceName: 'zh-CN-XiaoxiaoNeural',
        rate: 20,
        pitch: 0
      },
      '今天 OK'
    );

    expect(cacheId).toBe('895e7058a230a25b90e3bf4d88d12d8f');
  });
});

describe('Sprite speak AI Provider synthesis', () => {
  it('calls the provider complete synthesis executor and caches the materialized audio', async () => {
    const dataDir = makeTempDir();
    const synthesize = vi.fn<SpriteSpeechSynthesisExecutor['synthesize']>(async (request) => ({
      artifacts: [
        {
          audioBase64: audioBase64('provider-audio'),
          format: 'wav',
          mimeType: 'audio/wav',
          durationMs: 456
        }
      ],
      model: request.model,
      providerId: request.providerId,
      voiceId: request.voiceId
    }));
    const service = new SpeakService(dataDir, { synthesize });

    service.setConfig({
      engine: 'ai-provider',
      aiProvider: {
        providerId: 'minimax',
        providerPresetId: 'preset-1',
        model: 'speech-2.8-turbo',
        voiceId: 'female-shaonv',
        mode: 'complete',
        transportPreference: 'http',
        audioSetting: { format: 'wav', sampleRate: 32000 },
        speed: 1.1,
        pitch: 2,
        voiceVolume: 0.9,
        emotion: 'happy'
      }
    });

    const result = await service.synthesize('你好 😄');

    expect(result.success).toBe(true);
    expect(result.audioPath).toMatch(/\.wav$/);
    expect(readFileSync(result.audioPath!, 'utf8')).toBe('provider-audio');
    expect(synthesize).toHaveBeenCalledTimes(1);
    expect(synthesize).toHaveBeenCalledWith(
      expect.objectContaining({
        audioSetting: expect.objectContaining({ format: 'wav', sampleRate: 32000 }),
        emotion: 'happy',
        mode: 'complete',
        model: 'speech-2.8-turbo',
        pitch: 2,
        providerId: 'minimax',
        providerPresetId: 'preset-1',
        speed: 1.1,
        text: '你好',
        transportPreference: 'http',
        voiceId: 'female-shaonv',
        volume: 0.9
      })
    );

    const cached = await service.synthesize('你好 😄');
    expect(cached).toMatchObject({ success: true, cacheId: result.cacheId, fromCache: true });
    expect(synthesize).toHaveBeenCalledTimes(1);
  });

  it('includes provider voice settings in the cache key', async () => {
    const dataDir = makeTempDir();
    const synthesize = vi.fn<SpriteSpeechSynthesisExecutor['synthesize']>(async (request) => ({
      artifacts: [{ audioBase64: audioBase64(`audio-${request.voiceId}`), format: 'mp3', mimeType: 'audio/mpeg' }],
      model: request.model,
      providerId: request.providerId,
      voiceId: request.voiceId
    }));
    const service = new SpeakService(dataDir, { synthesize });

    service.setConfig({
      engine: 'ai-provider',
      aiProvider: {
        providerId: 'minimax',
        model: 'speech-2.8-turbo',
        voiceId: 'female-shaonv',
        mode: 'complete',
        audioSetting: { format: 'mp3' }
      }
    });
    const first = await service.synthesize('同一句话');

    service.setConfig({
      aiProvider: {
        providerId: 'minimax',
        model: 'speech-2.8-turbo',
        voiceId: 'male-qn-qingse',
        mode: 'complete',
        audioSetting: { format: 'mp3' }
      }
    });
    const second = await service.synthesize('同一句话');

    expect(first.success).toBe(true);
    expect(second.success).toBe(true);
    expect(first.cacheId).not.toBe(second.cacheId);
    expect(synthesize).toHaveBeenCalledTimes(2);
  });

  it('uses the provider streaming executor for duplex speech and sends text chunks', async () => {
    const dataDir = makeTempDir();
    const synthesize = vi.fn<SpriteSpeechSynthesisExecutor['synthesize']>();
    const stream = vi.fn<NonNullable<SpriteSpeechSynthesisExecutor['stream']>>(async (request, _onEvent, input) => {
      const chunks: unknown[] = [];
      for await (const chunk of input || []) {
        chunks.push(chunk);
      }
      return {
        artifacts: [{ audioBase64: audioBase64(JSON.stringify(chunks)), format: 'mp3', mimeType: 'audio/mpeg' }],
        model: request.model,
        providerId: request.providerId,
        voiceId: request.voiceId
      };
    });
    const service = new SpeakService(dataDir, { stream, synthesize });

    service.setConfig({
      engine: 'ai-provider',
      aiProvider: {
        providerId: 'minimax',
        model: 'speech-2.8-turbo',
        voiceId: 'female-shaonv',
        mode: 'duplex-stream',
        transportPreference: 'websocket',
        audioSetting: { format: 'mp3' }
      }
    });

    const result = await service.synthesize('流式你好');

    expect(result.success).toBe(true);
    expect(synthesize).not.toHaveBeenCalled();
    expect(stream).toHaveBeenCalledWith(
      expect.objectContaining({
        mode: 'duplex-stream',
        providerId: 'minimax',
        text: undefined,
        transportPreference: 'websocket',
        voiceId: 'female-shaonv'
      }),
      expect.any(Function),
      expect.any(Object)
    );
    expect(readFileSync(result.audioPath!, 'utf8')).toBe(JSON.stringify([{ type: 'text', text: '流式你好' }, { type: 'close' }]));
  });
});
