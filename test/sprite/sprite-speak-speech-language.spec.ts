import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { SpeakConfigStore } from '../../packages/sprite-core/speak/speak-config-store';
import { SpeakService } from '../../packages/sprite-core/speak/speak-service';
import { detectSpeechTextLanguage, normalizeCharacterSpeechLanguage } from '../../packages/sprite-core/speak/speech-language';
import type { SpriteSpeakAIProviderConfig, SpriteSpeechSynthesisExecutor, SpriteSpeechTextTranslator } from '../../packages/sprite-core/speak/types';

const tempDirs: string[] = [];

function makeTempDir(): string {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'sprite-speak-language-test-'));
  tempDirs.push(dir);
  return dir;
}

function audioBase64(value: string): string {
  return Buffer.from(value).toString('base64');
}

function makeSynthesize(): ReturnType<typeof vi.fn<SpriteSpeechSynthesisExecutor['synthesize']>> {
  return vi.fn<SpriteSpeechSynthesisExecutor['synthesize']>(async (request) => ({
    artifacts: [{ audioBase64: audioBase64(`audio-${request.text}`), format: 'wav', mimeType: 'audio/wav' }],
    model: request.model,
    providerId: request.providerId,
    voiceId: request.voiceId
  }));
}

function makeAiProviderConfig(patch?: Partial<SpriteSpeakAIProviderConfig>): SpriteSpeakAIProviderConfig {
  return {
    audioSetting: { format: 'wav' },
    model: 'chi-tts',
    providerId: 'gpt-sovits',
    voiceId: 'chi',
    ...patch
  };
}

afterEach(() => {
  vi.restoreAllMocks();
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop();
    if (dir) rmSync(dir, { recursive: true, force: true });
  }
});

describe('normalizeCharacterSpeechLanguage', () => {
  it('normalizes Chinese aliases to zh', () => {
    expect(normalizeCharacterSpeechLanguage('zh-CN')).toBe('zh');
    expect(normalizeCharacterSpeechLanguage('zh')).toBe('zh');
    expect(normalizeCharacterSpeechLanguage('ZH-Hans')).toBe('zh');
    expect(normalizeCharacterSpeechLanguage('中文')).toBe('zh');
    expect(normalizeCharacterSpeechLanguage('Chinese')).toBe('zh');
  });

  it('normalizes Japanese aliases to ja', () => {
    expect(normalizeCharacterSpeechLanguage('ja')).toBe('ja');
    expect(normalizeCharacterSpeechLanguage('ja-JP')).toBe('ja');
    expect(normalizeCharacterSpeechLanguage('JA')).toBe('ja');
    expect(normalizeCharacterSpeechLanguage('日语')).toBe('ja');
    expect(normalizeCharacterSpeechLanguage('日文')).toBe('ja');
    expect(normalizeCharacterSpeechLanguage('Japanese')).toBe('ja');
  });

  it('returns undefined for unrecognized or empty values', () => {
    expect(normalizeCharacterSpeechLanguage('en-US')).toBeUndefined();
    expect(normalizeCharacterSpeechLanguage('Klingon')).toBeUndefined();
    expect(normalizeCharacterSpeechLanguage('')).toBeUndefined();
    expect(normalizeCharacterSpeechLanguage('   ')).toBeUndefined();
    expect(normalizeCharacterSpeechLanguage(null)).toBeUndefined();
    expect(normalizeCharacterSpeechLanguage(undefined)).toBeUndefined();
  });
});

describe('detectSpeechTextLanguage', () => {
  it('detects Japanese when text contains kana', () => {
    expect(detectSpeechTextLanguage('おはよう')).toBe('ja');
    expect(detectSpeechTextLanguage('カタカナ')).toBe('ja');
    // 日语混汉字仍以假名为准
    expect(detectSpeechTextLanguage('秀樹は地位を拾ってくれた')).toBe('ja');
    expect(detectSpeechTextLanguage('今日はいい天気ですね')).toBe('ja');
  });

  it('detects Chinese when text has CJK ideographs without kana', () => {
    expect(detectSpeechTextLanguage('你好，今天天气不错')).toBe('zh');
    expect(detectSpeechTextLanguage('文件整理好了')).toBe('zh');
  });

  it('returns undefined for other or empty text', () => {
    expect(detectSpeechTextLanguage('hello world')).toBeUndefined();
    expect(detectSpeechTextLanguage('12345')).toBeUndefined();
    expect(detectSpeechTextLanguage('')).toBeUndefined();
    expect(detectSpeechTextLanguage('   ')).toBeUndefined();
  });
});

describe('SpeakConfigStore speechLanguage normalization', () => {
  it('falls back to auto for missing or invalid speechLanguage values', () => {
    for (const raw of [undefined, 'auto', 'en', 'JA', '', 123]) {
      const dataDir = makeTempDir();
      const configDir = path.join(dataDir, 'data');
      mkdirSync(configDir, { recursive: true });
      writeFileSync(
        path.join(configDir, 'sprite-speak-config.json'),
        JSON.stringify({
          aiProvider: { providerId: 'gpt-sovits', model: 'chi-tts', voiceId: 'chi', speechLanguage: raw },
          enabled: true,
          engine: 'ai-provider'
        })
      );

      const config = new SpeakConfigStore(dataDir).load();
      expect(config.aiProvider?.speechLanguage, `speechLanguage=${String(raw)}`).toBe('auto');
    }
  });

  it('keeps valid zh/ja speechLanguage values', () => {
    const dataDir = makeTempDir();
    const store = new SpeakConfigStore(dataDir);
    store.load();

    expect(store.setConfig({ aiProvider: makeAiProviderConfig({ speechLanguage: 'ja' }) }).aiProvider?.speechLanguage).toBe('ja');
    expect(store.setConfig({ aiProvider: makeAiProviderConfig({ speechLanguage: 'zh' }) }).aiProvider?.speechLanguage).toBe('zh');
  });
});

describe('SpeakService speech language translation', () => {
  it('does not call the translator when speechLanguage is auto', async () => {
    const dataDir = makeTempDir();
    const synthesize = makeSynthesize();
    const translate = vi.fn<SpriteSpeechTextTranslator['translate']>(async () => 'unused');
    const service = new SpeakService(dataDir, { synthesize }, { translate });

    service.setConfig({ engine: 'ai-provider', aiProvider: makeAiProviderConfig({ speechLanguage: 'auto' }) });

    const result = await service.synthesize('你好');

    expect(result.success).toBe(true);
    expect(translate).not.toHaveBeenCalled();
    expect(synthesize).toHaveBeenCalledWith(expect.objectContaining({ language: undefined, text: '你好' }));
  });

  it('translates Chinese text before synthesis when speechLanguage is ja', async () => {
    const dataDir = makeTempDir();
    const synthesize = makeSynthesize();
    const translate = vi.fn<SpriteSpeechTextTranslator['translate']>(async () => '「おはよう、ご主人」\n');
    const translator: SpriteSpeechTextTranslator = { lastBackend: { model: 'Qwen2.5-7B-Instruct-AWQ', providerId: 'vllm' }, translate };
    const service = new SpeakService(dataDir, { synthesize }, translator);

    service.setConfig({ engine: 'ai-provider', aiProvider: makeAiProviderConfig({ speechLanguage: 'ja' }) });

    const result = await service.synthesize('早上好，主人');

    expect(result.success).toBe(true);
    expect(translate).toHaveBeenCalledWith({ sourceLang: 'zh', targetLang: 'ja', text: '早上好，主人' });
    // 合成收到的是清洗后的译文（去引号、去多余换行），language 为目标语言
    expect(synthesize).toHaveBeenCalledWith(expect.objectContaining({ language: 'ja', text: 'おはよう、ご主人' }));

    // 同一原文重复说话命中缓存，不再重复翻译
    const cached = await service.synthesize('早上好，主人');
    expect(cached).toMatchObject({ fromCache: true, success: true });
    expect(translate).toHaveBeenCalledTimes(1);
    expect(synthesize).toHaveBeenCalledTimes(1);
  });

  it('skips translation when text already matches the target language', async () => {
    const dataDir = makeTempDir();
    const synthesize = makeSynthesize();
    const translate = vi.fn<SpriteSpeechTextTranslator['translate']>();
    const service = new SpeakService(dataDir, { synthesize }, { translate });

    service.setConfig({ engine: 'ai-provider', aiProvider: makeAiProviderConfig({ speechLanguage: 'ja' }) });

    const result = await service.synthesize('おはよう');

    expect(result.success).toBe(true);
    expect(translate).not.toHaveBeenCalled();
    expect(synthesize).toHaveBeenCalledWith(expect.objectContaining({ language: 'ja', text: 'おはよう' }));
  });

  it('falls back to the original text with detected source language when translation fails', async () => {
    const dataDir = makeTempDir();
    const synthesize = makeSynthesize();
    const translate = vi.fn<SpriteSpeechTextTranslator['translate']>(async () => {
      throw new Error('vllm unavailable');
    });
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const service = new SpeakService(dataDir, { synthesize }, { translate });

    service.setConfig({ engine: 'ai-provider', aiProvider: makeAiProviderConfig({ speechLanguage: 'ja' }) });

    const result = await service.synthesize('早上好');

    expect(result.success).toBe(true);
    expect(synthesize).toHaveBeenCalledWith(expect.objectContaining({ language: 'zh', text: '早上好' }));
    expect(warn).toHaveBeenCalledOnce();
    expect(String(warn.mock.calls[0][0])).toContain('[SpeechTranslate] fallback');
  });

  it('falls back to the original text when no translator is configured', async () => {
    const dataDir = makeTempDir();
    const synthesize = makeSynthesize();
    const service = new SpeakService(dataDir, { synthesize });

    service.setConfig({ engine: 'ai-provider', aiProvider: makeAiProviderConfig({ speechLanguage: 'ja' }) });

    const result = await service.synthesize('早上好');

    expect(result.success).toBe(true);
    expect(synthesize).toHaveBeenCalledWith(expect.objectContaining({ language: 'zh', text: '早上好' }));
  });

  it('includes speechLanguage in the cache key', async () => {
    const dataDir = makeTempDir();
    const synthesize = makeSynthesize();
    const translate = vi.fn<SpriteSpeechTextTranslator['translate']>(async ({ targetLang }) => (targetLang === 'ja' ? 'おはよう' : '早上好'));
    const service = new SpeakService(dataDir, { synthesize }, { translate });

    service.setConfig({ engine: 'ai-provider', aiProvider: makeAiProviderConfig({ speechLanguage: 'ja' }) });
    const first = await service.synthesize('早上好');

    service.setConfig({ aiProvider: makeAiProviderConfig({ speechLanguage: 'auto' }) });
    const second = await service.synthesize('早上好');

    service.setConfig({ aiProvider: makeAiProviderConfig({ speechLanguage: 'zh' }) });
    const third = await service.synthesize('おはよう');

    expect(first.success && second.success && third.success).toBe(true);
    // 同一原文在不同朗读语言下不串缓存
    expect(first.cacheId).not.toBe(second.cacheId);
    // auto 与历史 key 构造保持一致：auto 等价于未设置 speechLanguage
    expect(third.cacheId).not.toBe(first.cacheId);
    expect(translate).toHaveBeenCalledTimes(2);
    expect(synthesize).toHaveBeenCalledTimes(3);
  });
});

describe('SpeakService character speech language', () => {
  it.each([
    { characterLanguage: 'ja', targetLang: 'ja' },
    { characterLanguage: 'zh-CN', targetLang: 'zh' },
    { characterLanguage: '日语', targetLang: 'ja' }
  ])('translates to $targetLang driven by character language "$characterLanguage" when speechLanguage is auto', async ({ characterLanguage, targetLang }) => {
    const dataDir = makeTempDir();
    const synthesize = makeSynthesize();
    const translate = vi.fn<SpriteSpeechTextTranslator['translate']>(async ({ targetLang: lang }) => (lang === 'ja' ? 'おはよう' : '早上好'));
    const service = new SpeakService(dataDir, { synthesize }, { translate }, () => characterLanguage);

    service.setConfig({ engine: 'ai-provider', aiProvider: makeAiProviderConfig({ speechLanguage: 'auto' }) });

    const sourceText = targetLang === 'ja' ? '早上好' : 'おはよう';
    const result = await service.synthesize(sourceText);

    expect(result.success).toBe(true);
    expect(translate).toHaveBeenCalledWith({ sourceLang: targetLang === 'ja' ? 'zh' : 'ja', targetLang, text: sourceText });
    expect(synthesize).toHaveBeenCalledWith(expect.objectContaining({ language: targetLang, text: targetLang === 'ja' ? 'おはよう' : '早上好' }));
  });

  it.each([{ characterLanguage: 'Klingon' }, { characterLanguage: undefined }])(
    'does not translate when character language "$characterLanguage" is unrecognized and speechLanguage is auto',
    async ({ characterLanguage }) => {
      const dataDir = makeTempDir();
      const synthesize = makeSynthesize();
      const translate = vi.fn<SpriteSpeechTextTranslator['translate']>(async () => 'unused');
      const service = new SpeakService(dataDir, { synthesize }, { translate }, () => characterLanguage);

      service.setConfig({ engine: 'ai-provider', aiProvider: makeAiProviderConfig({ speechLanguage: 'auto' }) });

      const result = await service.synthesize('早上好');

      expect(result.success).toBe(true);
      expect(translate).not.toHaveBeenCalled();
      expect(synthesize).toHaveBeenCalledWith(expect.objectContaining({ language: undefined, text: '早上好' }));
    }
  );

  it('manual zh overrides the character ja language', async () => {
    const dataDir = makeTempDir();
    const synthesize = makeSynthesize();
    const translate = vi.fn<SpriteSpeechTextTranslator['translate']>(async () => '早上好');
    const service = new SpeakService(dataDir, { synthesize }, { translate }, () => 'ja');

    service.setConfig({ engine: 'ai-provider', aiProvider: makeAiProviderConfig({ speechLanguage: 'zh' }) });

    // 中文文本已是目标语言，不翻译
    const chinese = await service.synthesize('你好');
    expect(chinese.success).toBe(true);
    expect(translate).not.toHaveBeenCalled();
    expect(synthesize).toHaveBeenCalledWith(expect.objectContaining({ language: 'zh', text: '你好' }));

    // 日文文本翻译成中文，而不是角色定义的日文
    const japanese = await service.synthesize('おはよう');
    expect(japanese.success).toBe(true);
    expect(translate).toHaveBeenCalledWith({ sourceLang: 'ja', targetLang: 'zh', text: 'おはよう' });
    expect(synthesize).toHaveBeenCalledWith(expect.objectContaining({ language: 'zh', text: '早上好' }));
  });

  it('includes the effective character language in the cache key', async () => {
    const dataDir = makeTempDir();
    const synthesize = makeSynthesize();
    const translate = vi.fn<SpriteSpeechTextTranslator['translate']>(async () => 'おはよう');
    let characterLanguage: string | undefined = 'ja';
    const service = new SpeakService(dataDir, { synthesize }, { translate }, () => characterLanguage);

    service.setConfig({ engine: 'ai-provider', aiProvider: makeAiProviderConfig({ speechLanguage: 'auto' }) });

    const japanese = await service.synthesize('早上好');

    characterLanguage = undefined;
    const fallbackAuto = await service.synthesize('早上好');

    characterLanguage = 'zh';
    const chinese = await service.synthesize('早上好');

    expect(japanese.success && fallbackAuto.success && chinese.success).toBe(true);
    // 角色语言切换后同一原文不串缓存；无法识别时维持历史 auto key
    expect(japanese.cacheId).not.toBe(fallbackAuto.cacheId);
    expect(japanese.cacheId).not.toBe(chinese.cacheId);
    expect(fallbackAuto.cacheId).not.toBe(chinese.cacheId);
    expect(synthesize).toHaveBeenCalledTimes(3);
  });
});

describe('SpeakService realtime speech translation', () => {
  function makeRealtimeStream(sentTexts: string[]): ReturnType<typeof vi.fn<NonNullable<SpriteSpeechSynthesisExecutor['stream']>>> {
    return vi.fn<NonNullable<SpriteSpeechSynthesisExecutor['stream']>>(async (request, onEvent, input) => {
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
  }

  function enableRealtimeSpeech(service: SpeakService): void {
    service.setConfig({
      engine: 'ai-provider',
      aiProvider: {
        providerId: 'minimax',
        model: 'speech-2.8-turbo',
        voiceId: 'female-shaonv',
        audioSetting: { format: 'mp3' },
        speechLanguage: 'auto'
      },
      realtimeSpeech: {
        ...service.getConfig().realtimeSpeech,
        enabled: true
      }
    });
  }

  it('translates realtime text segments before enqueue driven by the character language', async () => {
    const dataDir = makeTempDir();
    const sentTexts: string[] = [];
    const stream = makeRealtimeStream(sentTexts);
    const translations: Record<string, string> = { '早上好！': 'おはよう！', '晚安！': 'おやすみ！' };
    const translate = vi.fn<SpriteSpeechTextTranslator['translate']>(async ({ text }) => translations[text] ?? text);
    const service = new SpeakService(dataDir, { synthesize: vi.fn<SpriteSpeechSynthesisExecutor['synthesize']>(), stream }, { translate }, () => 'ja');
    enableRealtimeSpeech(service);

    const session = await service.startRealtimeSession({ source: 'chat', scope: 'mainChat' });
    await session.appendText('早上好！');
    await session.flush();
    await session.appendText('晚安！');
    await session.flush();
    await session.finish();

    await vi.waitFor(() => {
      expect(sentTexts).toEqual(['おはよう！', 'おやすみ！']);
    });
    expect(translate).toHaveBeenCalledTimes(2);
    // 朗读请求语言跟随有效朗读语言
    expect(stream).toHaveBeenCalledWith(expect.objectContaining({ language: 'ja' }), expect.any(Function), expect.any(Object), expect.any(AbortSignal));
  });

  it('does not translate realtime segments when the character language is unrecognized', async () => {
    const dataDir = makeTempDir();
    const sentTexts: string[] = [];
    const stream = makeRealtimeStream(sentTexts);
    const translate = vi.fn<SpriteSpeechTextTranslator['translate']>(async () => 'unused');
    const service = new SpeakService(dataDir, { synthesize: vi.fn<SpriteSpeechSynthesisExecutor['synthesize']>(), stream }, { translate }, () => undefined);
    enableRealtimeSpeech(service);

    const session = await service.startRealtimeSession({ source: 'chat', scope: 'mainChat' });
    await session.appendText('早上好！');
    await session.flush();
    await session.finish();

    await vi.waitFor(() => {
      expect(sentTexts).toEqual(['早上好！']);
    });
    expect(translate).not.toHaveBeenCalled();
  });

  it('falls back to the original segment text when realtime translation fails', async () => {
    const dataDir = makeTempDir();
    const sentTexts: string[] = [];
    const stream = makeRealtimeStream(sentTexts);
    const translate = vi.fn<SpriteSpeechTextTranslator['translate']>(async () => {
      throw new Error('vllm unavailable');
    });
    const service = new SpeakService(dataDir, { synthesize: vi.fn<SpriteSpeechSynthesisExecutor['synthesize']>(), stream }, { translate }, () => 'ja');
    enableRealtimeSpeech(service);

    const session = await service.startRealtimeSession({ source: 'chat', scope: 'mainChat' });
    await session.appendText('早上好！');
    await session.flush();
    await session.finish();

    await vi.waitFor(() => {
      expect(sentTexts).toEqual(['早上好！']);
    });
    expect(translate).toHaveBeenCalledTimes(1);
  });

  it('keeps realtime segment order even when earlier translations resolve later', async () => {
    const dataDir = makeTempDir();
    const sentTexts: string[] = [];
    const stream = makeRealtimeStream(sentTexts);
    const translate = vi.fn<SpriteSpeechTextTranslator['translate']>(async ({ text }) => {
      // 第一段翻译故意变慢，验证入队仍按追加顺序
      if (text === '早上好！') {
        await new Promise((resolve) => setTimeout(resolve, 50));
        return 'おはよう！';
      }
      return 'おやすみ！';
    });
    const service = new SpeakService(dataDir, { synthesize: vi.fn<SpriteSpeechSynthesisExecutor['synthesize']>(), stream }, { translate }, () => 'ja');
    enableRealtimeSpeech(service);

    const session = await service.startRealtimeSession({ source: 'chat', scope: 'mainChat' });
    await session.appendText('早上好！');
    await session.flush();
    await session.appendText('晚安！');
    await session.flush();
    await session.finish();

    await vi.waitFor(() => {
      expect(sentTexts).toEqual(['おはよう！', 'おやすみ！']);
    });
  });
});
