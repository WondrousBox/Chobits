import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { SpeakCache } from '../../packages/sprite-core/speak/speak-cache';
import { SpeakConfigStore } from '../../packages/sprite-core/speak/speak-config-store';
import { RealtimeSpeechTextParser } from '../../packages/sprite-core/speak/realtime-text-parser';
import { SpeakService } from '../../packages/sprite-core/speak/speak-service';
import { registerProviderDefinition } from '../../packages/ai/providers/registry';
import type { ProviderDefinition } from '../../packages/ai/providers/types';
import type { SpriteSpeechSynthesisExecutor } from '../../packages/sprite-core/speak/types';

const tempDirs: string[] = [];

function makeTempDir(): string {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'sprite-speak-provider-test-'));
  tempDirs.push(dir);
  return dir;
}

function audioBase64(value: string): string {
  return Buffer.from(value).toString('base64');
}

function registerSpeechProviderDefinition(
  providerId: string,
  speechSynthesis: {
    modes: string[];
    transports: string[];
    audioFormats?: string[];
  }
): void {
  registerProviderDefinition({
    capabilities: {
      chat: false,
      embeddings: false,
      imageGeneration: false,
      modelListing: true,
      musicGeneration: false,
      speechSynthesis: true,
      transcribe: false
    },
    defaults: {
      models: {
        speechSynthesis: 'custom-model'
      }
    },
    display: {
      label: providerId
    },
    id: providerId,
    models: {
      items: [
        {
          enabled: true,
          id: 'custom-model',
          speechSynthesis: {
            audioFormats: speechSynthesis.audioFormats || ['pcm'],
            modes: speechSynthesis.modes,
            transports: speechSynthesis.transports
          },
          type: 'tts'
        }
      ],
      strategy: 'builtin'
    },
    protocol: {
      kind: 'custom'
    },
    source: 'plugin'
  } satisfies ProviderDefinition);
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
    expect(config.rate).toBe(20);
    expect(config.pitch).toBe(0);
    expect(config.aiProvider).toMatchObject({
      providerId: 'minimax',
      model: 'speech-2.8-turbo',
      voiceId: 'female-shaonv'
    });
    expect(config.chatRealtimeSpeech).toMatchObject({
      enabled: false,
      audioSetting: {
        format: 'pcm',
        sampleRate: 32000,
        channels: 1
      },
      scopes: {
        mainChat: true,
        resourceChatSidebar: true
      }
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
        pitch: 0,
        providerId: 'minimax',
        providerPresetId: 'preset-1',
        speed: 1,
        text: '你好',
        transportPreference: 'http',
        voiceId: 'female-shaonv',
        volume: 1
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
        audioSetting: { format: 'mp3' }
      }
    });
    const first = await service.synthesize('同一句话');

    service.setConfig({
      aiProvider: {
        providerId: 'minimax',
        model: 'speech-2.8-turbo',
        voiceId: 'male-qn-qingse',
        audioSetting: { format: 'mp3' }
      }
    });
    const second = await service.synthesize('同一句话');

    expect(first.success).toBe(true);
    expect(second.success).toBe(true);
    expect(first.cacheId).not.toBe(second.cacheId);
    expect(synthesize).toHaveBeenCalledTimes(2);
  });

  it('keeps plain sprite speak on complete synthesis', async () => {
    const dataDir = makeTempDir();
    const synthesize = vi.fn<SpriteSpeechSynthesisExecutor['synthesize']>(async (request) => {
      return {
        artifacts: [{ audioBase64: audioBase64(`plain-${request.text}`), format: 'mp3', mimeType: 'audio/mpeg' }],
        model: request.model,
        providerId: request.providerId,
        voiceId: request.voiceId
      };
    });
    const stream = vi.fn<NonNullable<SpriteSpeechSynthesisExecutor['stream']>>();
    const service = new SpeakService(dataDir, { stream, synthesize });

    service.setConfig({
      engine: 'ai-provider',
      aiProvider: {
        providerId: 'minimax',
        model: 'speech-2.8-turbo',
        voiceId: 'female-shaonv',
        audioSetting: { format: 'mp3' }
      }
    });

    const result = await service.synthesize('流式你好');

    expect(result.success).toBe(true);
    expect(stream).not.toHaveBeenCalled();
    expect(synthesize).toHaveBeenCalledWith(
      expect.objectContaining({
        mode: 'complete',
        providerId: 'minimax',
        text: '流式你好',
        transportPreference: 'http',
        voiceId: 'female-shaonv'
      })
    );
    expect(readFileSync(result.audioPath!, 'utf8')).toBe('plain-流式你好');
  });

  it('streams realtime chat speech only when explicitly enabled', async () => {
    const dataDir = makeTempDir();
    let releaseStream: (() => void) | undefined;
    const stream = vi.fn<NonNullable<SpriteSpeechSynthesisExecutor['stream']>>(async (request, onEvent, input) => {
      const chunks: unknown[] = [];
      const reader = (async () => {
        for await (const chunk of input || []) {
          chunks.push(chunk);
          if (chunk.type === 'text') {
            onEvent({
              type: 'audio_delta',
              data: {
                chunk: Buffer.from([1, 2, 3, 4]),
                format: 'pcm',
                sampleRate: request.audioSetting?.sampleRate,
                channels: request.audioSetting?.channels,
                sampleFormat: 's16le'
              }
            });
          }
        }
      })();
      await new Promise<void>((resolve) => {
        releaseStream = resolve;
      });
      await reader;
      return {
        artifacts: [{ audioBase64: audioBase64(JSON.stringify(chunks)), format: 'pcm', mimeType: 'audio/pcm' }],
        model: request.model,
        providerId: request.providerId,
        voiceId: request.voiceId
      };
    });
    const service = new SpeakService(dataDir, {
      synthesize: vi.fn<SpriteSpeechSynthesisExecutor['synthesize']>(),
      stream
    });

    service.setConfig({
      engine: 'ai-provider',
      aiProvider: {
        providerId: 'minimax',
        model: 'speech-2.8-turbo',
        voiceId: 'female-shaonv',
        audioSetting: { format: 'mp3' }
      }
    });

    await expect(service.startRealtimeSession({ source: 'chat', scope: 'mainChat' })).rejects.toThrow('disabled');

    service.setConfig({
      chatRealtimeSpeech: {
        ...service.getConfig().chatRealtimeSpeech,
        enabled: true
      }
    });

    const events: unknown[] = [];
    const session = await service.startRealtimeSession({ source: 'chat', scope: 'mainChat' }, (event) => events.push(event));
    await session.appendText('你好');
    await session.flush();
    await session.finish();
    releaseStream?.();

    await vi.waitFor(() => {
      expect(stream).toHaveBeenCalledTimes(1);
      expect(events).toEqual(expect.arrayContaining([expect.objectContaining({ type: 'audio_delta' })]));
    });

    expect(stream).toHaveBeenCalledWith(
      expect.objectContaining({
        audioSetting: expect.objectContaining({ format: 'pcm', sampleRate: 32000, channels: 1 }),
        mode: 'duplex-stream',
        providerId: 'minimax',
        transportPreference: 'websocket',
        voiceId: 'female-shaonv'
      }),
      expect.any(Function),
      expect.any(Object),
      expect.any(AbortSignal)
    );
  });

  it('treats chat realtime speech as one unified switch across scopes', async () => {
    const dataDir = makeTempDir();
    const stream = vi.fn<NonNullable<SpriteSpeechSynthesisExecutor['stream']>>(async (request, onEvent) => {
      onEvent({
        type: 'audio_delta',
        data: {
          chunk: Buffer.from([1, 2, 3, 4]),
          format: 'pcm',
          sampleRate: request.audioSetting?.sampleRate,
          channels: request.audioSetting?.channels,
          sampleFormat: 's16le'
        }
      });
      return {
        artifacts: [{ audioBase64: audioBase64('resource-sidebar-audio'), format: 'pcm', mimeType: 'audio/pcm' }],
        model: request.model,
        providerId: request.providerId,
        voiceId: request.voiceId
      };
    });
    const service = new SpeakService(dataDir, {
      synthesize: vi.fn<SpriteSpeechSynthesisExecutor['synthesize']>(),
      stream
    });

    service.setConfig({
      engine: 'ai-provider',
      aiProvider: {
        providerId: 'minimax',
        model: 'speech-2.8-turbo',
        voiceId: 'female-shaonv',
        audioSetting: { format: 'mp3' }
      },
      chatRealtimeSpeech: {
        ...service.getConfig().chatRealtimeSpeech,
        enabled: true,
        scopes: {
          mainChat: true,
          resourceChatSidebar: false
        }
      }
    });

    expect(service.isRealtimeSpeechEnabled({ source: 'chat', scope: 'resourceChatSidebar' })).toBe(true);

    const events: unknown[] = [];
    const session = await service.startRealtimeSession({ source: 'chat', scope: 'resourceChatSidebar' }, (event) => events.push(event));
    await session.appendText('资源侧栏也说话');
    await session.finish();

    await vi.waitFor(() => {
      expect(stream).toHaveBeenCalledTimes(1);
      expect(events).toEqual(expect.arrayContaining([expect.objectContaining({ type: 'audio_delta' })]));
    });
  });

  it('buffers realtime markdown fragments before sending text to duplex speech synthesis', async () => {
    const dataDir = makeTempDir();
    const sentTexts: string[] = [];
    const stream = vi.fn<NonNullable<SpriteSpeechSynthesisExecutor['stream']>>(async (request, onEvent, input) => {
      for await (const chunk of input || []) {
        if (chunk.type === 'text') {
          sentTexts.push(chunk.text);
          onEvent({
            type: 'audio_delta',
            data: {
              chunk: Buffer.from([1, 2, 3, 4]),
              channels: request.audioSetting?.channels,
              format: 'pcm',
              sampleFormat: 's16le',
              sampleRate: request.audioSetting?.sampleRate
            }
          });
        }
        if (chunk.type === 'close') break;
      }

      return {
        artifacts: [{ audioBase64: audioBase64('duplex-audio'), format: 'pcm', mimeType: 'audio/pcm' }],
        model: request.model,
        providerId: request.providerId,
        voiceId: request.voiceId
      };
    });
    const service = new SpeakService(dataDir, {
      synthesize: vi.fn<SpriteSpeechSynthesisExecutor['synthesize']>(),
      stream
    });

    service.setConfig({
      engine: 'ai-provider',
      aiProvider: {
        providerId: 'minimax',
        model: 'speech-2.8-turbo',
        voiceId: 'female-shaonv',
        audioSetting: { format: 'mp3' }
      },
      chatRealtimeSpeech: {
        ...service.getConfig().chatRealtimeSpeech,
        enabled: true
      }
    });

    const session = await service.startRealtimeSession({ source: 'chat', scope: 'mainChat' });
    await session.appendText('嘿～问得好！ 我是 Chii，你的桌面小精灵！我能做挺多事的： **');
    await session.appendText('文件管理** 整理文件、批量重命名、移动复制、查找内容...桌面');
    await session.flush();
    await session.appendText('乱了找我就对啦 ** 代码处理** 写代码、调试 debug。');
    await session.finish();

    await vi.waitFor(() => {
      expect(stream).toHaveBeenCalledTimes(1);
      expect(sentTexts).toEqual(expect.arrayContaining(['桌面乱了找我就对啦 代码处理 写代码、调试 debug。']));
    });

    expect(sentTexts).not.toContain('桌面');
    expect(sentTexts.join('\n')).not.toContain('**');
  });

  it('falls realtime chat speech back to HTTP streaming when WebSocket is not declared', async () => {
    const dataDir = makeTempDir();
    registerSpeechProviderDefinition('custom-tts-http-stream-test', {
      modes: ['output-stream', 'complete'],
      transports: ['http-stream', 'http']
    });
    const stream = vi.fn<NonNullable<SpriteSpeechSynthesisExecutor['stream']>>(async (request, onEvent) => {
      onEvent({
        type: 'audio_delta',
        data: {
          chunk: Buffer.from([5, 6, 7, 8]),
          format: 'pcm',
          sampleRate: request.audioSetting?.sampleRate,
          channels: request.audioSetting?.channels,
          sampleFormat: 's16le'
        }
      });
      return {
        artifacts: [{ audioBase64: audioBase64('http-stream-audio'), format: 'pcm', mimeType: 'audio/pcm' }],
        model: request.model,
        providerId: request.providerId,
        voiceId: request.voiceId
      };
    });
    const service = new SpeakService(dataDir, {
      synthesize: vi.fn<SpriteSpeechSynthesisExecutor['synthesize']>(),
      stream
    });

    service.setConfig({
      engine: 'ai-provider',
      aiProvider: {
        providerId: 'custom-tts-http-stream-test',
        model: 'custom-model',
        voiceId: 'voice-1',
        audioSetting: { format: 'mp3' }
      },
      chatRealtimeSpeech: {
        ...service.getConfig().chatRealtimeSpeech,
        enabled: true
      }
    });

    const events: unknown[] = [];
    const session = await service.startRealtimeSession({ source: 'chat', scope: 'mainChat' }, (event) => events.push(event));
    await session.appendText('降级你好');
    await session.finish();

    await vi.waitFor(() => {
      expect(stream).toHaveBeenCalledTimes(1);
      expect(events).toEqual(expect.arrayContaining([expect.objectContaining({ type: 'audio_delta' })]));
    });

    expect(stream).toHaveBeenCalledWith(
      expect.objectContaining({
        mode: 'output-stream',
        providerId: 'custom-tts-http-stream-test',
        text: '降级你好',
        transportPreference: 'http-stream',
        voiceId: 'voice-1'
      }),
      expect.any(Function),
      undefined,
      expect.any(AbortSignal)
    );
  });

  it('falls realtime chat speech back to complete HTTP when streaming is not declared', async () => {
    const dataDir = makeTempDir();
    registerSpeechProviderDefinition('custom-tts-http-complete-test', {
      modes: ['complete'],
      transports: ['http']
    });
    const synthesize = vi.fn<SpriteSpeechSynthesisExecutor['synthesize']>(async (request) => ({
      artifacts: [
        {
          audioBase64: audioBase64(`complete-${request.text}`),
          channels: request.audioSetting?.channels,
          format: 'pcm',
          mimeType: 'audio/pcm',
          sampleRate: request.audioSetting?.sampleRate
        }
      ],
      model: request.model,
      providerId: request.providerId,
      voiceId: request.voiceId
    }));
    const stream = vi.fn<NonNullable<SpriteSpeechSynthesisExecutor['stream']>>();
    const service = new SpeakService(dataDir, { synthesize, stream });

    service.setConfig({
      engine: 'ai-provider',
      aiProvider: {
        providerId: 'custom-tts-http-complete-test',
        model: 'custom-model',
        voiceId: 'voice-1',
        audioSetting: { format: 'mp3' }
      },
      chatRealtimeSpeech: {
        ...service.getConfig().chatRealtimeSpeech,
        enabled: true
      }
    });

    const events: unknown[] = [];
    const session = await service.startRealtimeSession({ source: 'chat', scope: 'mainChat' }, (event) => events.push(event));
    await session.appendText('完整降级');
    await session.finish();

    await vi.waitFor(() => {
      expect(synthesize).toHaveBeenCalledTimes(1);
      expect(events).toEqual(expect.arrayContaining([expect.objectContaining({ type: 'audio_delta' })]));
    });

    expect(stream).not.toHaveBeenCalled();
    expect(synthesize).toHaveBeenCalledWith(
      expect.objectContaining({
        mode: 'complete',
        providerId: 'custom-tts-http-complete-test',
        text: '完整降级',
        transportPreference: 'http',
        voiceId: 'voice-1'
      })
    );
  });

  it('falls realtime chat speech from WebSocket to HTTP streaming before audio starts', async () => {
    const dataDir = makeTempDir();
    const stream = vi.fn<NonNullable<SpriteSpeechSynthesisExecutor['stream']>>(async (request, onEvent) => {
      if (request.mode === 'duplex-stream') {
        onEvent({ type: 'error', data: { message: 'websocket unavailable' } });
        return {
          artifacts: [],
          model: request.model,
          providerId: request.providerId,
          voiceId: request.voiceId
        };
      }

      onEvent({
        type: 'audio_delta',
        data: {
          chunk: Buffer.from([9, 10, 11, 12]),
          format: 'pcm',
          sampleRate: request.audioSetting?.sampleRate,
          channels: request.audioSetting?.channels,
          sampleFormat: 's16le'
        }
      });
      return {
        artifacts: [{ audioBase64: audioBase64('http-stream-after-ws'), format: 'pcm', mimeType: 'audio/pcm' }],
        model: request.model,
        providerId: request.providerId,
        voiceId: request.voiceId
      };
    });
    const service = new SpeakService(dataDir, {
      synthesize: vi.fn<SpriteSpeechSynthesisExecutor['synthesize']>(),
      stream
    });

    service.setConfig({
      engine: 'ai-provider',
      aiProvider: {
        providerId: 'minimax',
        model: 'speech-2.8-turbo',
        voiceId: 'female-shaonv',
        audioSetting: { format: 'mp3' }
      },
      chatRealtimeSpeech: {
        ...service.getConfig().chatRealtimeSpeech,
        enabled: true
      }
    });

    const events: unknown[] = [];
    const session = await service.startRealtimeSession({ source: 'chat', scope: 'mainChat' }, (event) => events.push(event));
    await session.appendText('自动降级');
    await session.finish();

    await vi.waitFor(() => {
      expect(stream).toHaveBeenCalledTimes(2);
      expect(events).toEqual(expect.arrayContaining([expect.objectContaining({ type: 'metadata', data: expect.objectContaining({ event: 'strategy_fallback' }) })]));
      expect(events).toEqual(expect.arrayContaining([expect.objectContaining({ type: 'audio_delta' })]));
    });

    expect(stream).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        mode: 'duplex-stream',
        providerId: 'minimax',
        transportPreference: 'websocket'
      }),
      expect.any(Function),
      expect.any(Object),
      expect.any(AbortSignal)
    );
    expect(stream).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        mode: 'output-stream',
        providerId: 'minimax',
        text: '自动降级',
        transportPreference: 'http-stream'
      }),
      expect.any(Function),
      undefined,
      expect.any(AbortSignal)
    );
  });

  it('ignores stale realtime append and flush calls after a session is replaced', async () => {
    const dataDir = makeTempDir();
    const stream = vi.fn<NonNullable<SpriteSpeechSynthesisExecutor['stream']>>(async (_request, onEvent) => {
      onEvent({
        type: 'audio_delta',
        data: {
          chunk: Buffer.from([1, 2, 3, 4]),
          format: 'pcm',
          sampleRate: 32000,
          channels: 1,
          sampleFormat: 's16le'
        }
      });
      return {
        artifacts: [{ audioBase64: audioBase64('duplex'), format: 'pcm', mimeType: 'audio/pcm' }]
      };
    });
    const service = new SpeakService(dataDir, {
      synthesize: vi.fn<SpriteSpeechSynthesisExecutor['synthesize']>(),
      stream
    });

    service.setConfig({
      engine: 'ai-provider',
      aiProvider: {
        providerId: 'minimax',
        model: 'speech-2.8-turbo',
        voiceId: 'female-shaonv',
        audioSetting: { format: 'pcm' }
      },
      chatRealtimeSpeech: {
        ...service.getConfig().chatRealtimeSpeech,
        enabled: true
      }
    });

    const first = await service.startRealtimeSession({ source: 'chat', scope: 'mainChat' });
    const second = await service.startRealtimeSession({ source: 'chat', scope: 'mainChat' });

    await expect(service.appendRealtimeSpeechText(first.sessionId, '旧会话尾巴')).resolves.toBeUndefined();
    await expect(service.flushRealtimeSpeech(first.sessionId)).resolves.toBeUndefined();
    await second.cancel('test-cleanup');
  });
});

describe('RealtimeSpeechTextParser', () => {
  it('keeps incomplete fragments buffered until a speakable boundary arrives', () => {
    const parser = new RealtimeSpeechTextParser({
      flushOnPunctuation: true,
      maxChars: 80,
      minChars: 8
    });

    const first = parser.append('**文件管理** 整理文件、批量重命名、移动复制、查找内容...桌面');
    const flushed = parser.flush();
    const second = parser.append('乱了找我就对啦 ** 代码处理** 写代码、调试 debug。');
    const finished = parser.end();

    expect(first.map((segment) => segment.text)).toEqual(['文件管理 整理文件、批量重命名、移动复制、查找内容…']);
    expect(flushed).toEqual([]);
    expect(second.map((segment) => segment.text)).toEqual(['桌面乱了找我就对啦 代码处理 写代码、调试 debug。']);
    expect(finished).toEqual([]);
  });

  it('preserves markdown block boundaries for headings and list items', () => {
    const parser = new RealtimeSpeechTextParser({
      flushOnPunctuation: true,
      maxChars: 80,
      minChars: 8
    });

    const segments = [
      ...parser.append('嘿～好问题！让我想想我能干嘛～'),
      ...parser.append('\n\n'),
      ...parser.append('## 日常小助手\n\n'),
      ...parser.append('- 陪你聊天、解答问题、帮你出主意\n'),
      ...parser.append('- 查资料、写文案、翻译啥的都可以\n\n'),
      ...parser.append('## 文件与代码\n\n'),
      ...parser.append('- 帮你管理文件，读写都不在话下\n'),
      ...parser.end()
    ];

    expect(segments.map((segment) => segment.text)).toEqual([
      '嘿～好问题！',
      '让我想想我能干嘛～',
      '日常小助手',
      '陪你聊天、解答问题、帮你出主意',
      '查资料、写文案、翻译啥的都可以',
      '文件与代码',
      '帮你管理文件，读写都不在话下'
    ]);
    expect(segments.map((segment) => segment.reason)).toEqual([
      'sentence',
      'sentence',
      'block-boundary',
      'block-boundary',
      'block-boundary',
      'block-boundary',
      'block-boundary'
    ]);
  });

  it('uses newline-only chunks as structural boundaries', () => {
    const parser = new RealtimeSpeechTextParser({
      flushOnPunctuation: true,
      maxChars: 80,
      minChars: 8
    });

    const segments = [
      ...parser.append('日常小助手'),
      ...parser.append('\n\n'),
      ...parser.append('陪你聊天、解答问题、帮你出主意'),
      ...parser.append('\n'),
      ...parser.end()
    ];

    expect(segments.map((segment) => segment.text)).toEqual([
      '日常小助手',
      '陪你聊天、解答问题、帮你出主意'
    ]);
    expect(segments.map((segment) => segment.reason)).toEqual(['block-boundary', 'block-boundary']);
  });
});
