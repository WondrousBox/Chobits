import { createHash } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { stripEmoji } from '../packages/tts/common';

const tempDirs: string[] = [];

function makeTempDir(): string {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'tts-strip-emoji-test-'));
  tempDirs.push(dir);
  return dir;
}

function batchConfigPrefix(config: { type?: string; voiceName: string; rate: number; pitch: number }): string {
  return createHash('md5')
    .update(
      JSON.stringify({
        type: config.type || 'Edge',
        voiceName: config.voiceName,
        rate: config.rate,
        pitch: config.pitch
      })
    )
    .digest('hex')
    .substring(0, 8);
}

function batchContentMd5(configPrefix: string, text: string): string {
  return createHash('md5')
    .update(configPrefix + text)
    .digest('hex');
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.resetModules();
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop();
    if (dir) rmSync(dir, { recursive: true, force: true });
  }
});

describe('stripEmoji', () => {
  it('removes emoji before text is sent to TTS', () => {
    expect(stripEmoji('你好 😄，今天辛苦啦🎉')).toBe('你好 ，今天辛苦啦');
  });

  it('removes emoji sequences, modifiers, flags, and keycaps', () => {
    expect(stripEmoji('开工 👩🏽‍💻 🇨🇳 1️⃣ *️⃣ ❤️‍🔥 OK')).toBe('开工 OK');
  });

  it('keeps normal punctuation and symbols that should be read naturally', () => {
    expect(stripEmoji('进度 80% - A/B 测试完成。')).toBe('进度 80% - A/B 测试完成。');
  });

  it('keeps text-style emoji-capable symbols unless they are explicitly emoji presentation', () => {
    expect(stripEmoji('© ® ™ ↔ ♥ ❤ ☀ 中‍文')).toBe('© ® ™ ↔ ♥ ❤ ☀ 中‍文');
    expect(stripEmoji('©️ ®️ ™️ ↔️ ♥️ ❤️ ☀️')).toBe('');
  });
});

describe('TTS emoji sanitization pipeline', () => {
  it('sanitizes Edge TTS SSML input while preserving normal symbols', async () => {
    const raMock = vi.fn(async () => ({ success: true as const, data: Buffer.from('audio') }));
    vi.doMock('../packages/tts/edge/edge/edge-api', () => ({ ra: raMock }));

    const { default: EdgeTTS } = await import('../packages/tts/edge');
    const tts = new EdgeTTS();
    await tts.textToSpeech({
      text: '你好 😄 © & <ok>',
      voiceName: 'zh-CN-XiaoxiaoNeural',
      rate: 20,
      pitch: 0
    });

    const ssml = raMock.mock.calls[0]?.[0] as string;
    expect(ssml).toContain('你好 © &amp; &lt;ok&gt;');
    expect(ssml).not.toContain('😄');
  });

  it('uses sanitized text for sprite cache keys, audio synthesis, and play callbacks', async () => {
    const { SpeakCache } = await import('../packages/sprite-core/speak/speak-cache');
    const { SpeakService } = await import('../packages/sprite-core/speak/speak-service');

    const service = new SpeakService(makeTempDir());
    const textToSpeech = vi.fn(async () => Buffer.from('audio'));
    (service as any).edgeTTS = { textToSpeech };

    const onPlayAudio = vi.fn();
    service.setPlayAudioCallback(onPlayAudio);

    const result = await service.speak('今天 OK 😄🎉');
    const sanitized = '今天 OK';
    const expectedCacheId = SpeakCache.generateCacheId(
      {
        serviceType: 'Edge',
        voiceName: 'zh-CN-XiaoxiaoNeural',
        rate: 20,
        pitch: 0
      },
      sanitized
    );

    expect(result).toMatchObject({ success: true, cacheId: expectedCacheId, fromCache: false });
    expect(textToSpeech).toHaveBeenCalledWith(expect.objectContaining({ text: sanitized }));
    expect(onPlayAudio).toHaveBeenCalledWith(expect.objectContaining({ text: sanitized, cacheId: expectedCacheId }));
  });

  it('uses sanitized text for batch cache ids, synthesis input, and history metadata', async () => {
    const config = {
      type: 'Edge' as const,
      voiceName: 'zh-CN-XiaoxiaoNeural',
      rate: 20,
      pitch: 0,
      text: ''
    };
    const outputDir = makeTempDir();
    const configPrefix = batchConfigPrefix(config);
    const sanitized = '批量 © OK';
    const expectedMd5 = batchContentMd5(configPrefix, sanitized);
    const textToSpeech = vi.fn(async (options: { text: string }) => {
      expect(options.text).toBe(sanitized);
      return Buffer.from('mock-audio');
    });
    const ffprobe = vi.fn((_file: string, cb: (error: Error | null, metadata: { format: { duration: number } }) => void) => {
      cb(null, { format: { duration: 0.123 } });
    });
    const ffmpegMock = Object.assign(vi.fn(), {
      ffprobe,
      setFfmpegPath: vi.fn(),
      setFfprobePath: vi.fn()
    });

    vi.doMock('fluent-ffmpeg', () => ({
      default: ffmpegMock
    }));

    vi.doMock('../packages/tts/edge', () => ({
      default: class MockEdgeTTS {
        textToSpeech = textToSpeech;
      }
    }));

    const { BatchTTSService } = await import('../packages/tts/batch-tts-service');
    const saveHistory = vi.spyOn(BatchTTSService as any, 'saveHistory').mockResolvedValue(undefined);
    const result = await BatchTTSService.synthesizeBatch(
      {
        requestId: 'emoji-batch-test',
        items: [{ text: '批量 © 😄 OK', index: 0, st: '00:00:00,000', et: '00:00:01,000' }],
        config,
        outputDir,
        maxConcurrency: 1,
        skipTrimSilence: true
      },
      () => { }
    );

    expect(result.results[0]).toMatchObject({
      text: '批量 © 😄 OK',
      md5: expectedMd5,
      success: true
    });
    expect(textToSpeech).toHaveBeenCalledTimes(1);
    expect(saveHistory.mock.calls[0]?.[1].segmentInfoMap[expectedMd5].text).toBe(sanitized);
  });
});
