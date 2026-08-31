import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { SpeakConfigStore } from '../../packages/sprite-core/speak/speak-config-store';
import { SpeakService } from '../../packages/sprite-core/speak/speak-service';
import { detectSpeechTextLanguage } from '../../packages/sprite-core/speak/speech-language';
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
