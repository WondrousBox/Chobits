import { describe, expect, it } from 'vitest';

import { getRealtimeSpeechDisplayTextFilter, sanitizeSpeechTextForDisplay } from '../../packages/ai/speech-display-filter';

describe('speech display text filter', () => {
  it('reads MiniMax realtime speech display filter from provider model metadata', () => {
    const filter = getRealtimeSpeechDisplayTextFilter({
      realtimeSpeech: {
        enabled: true,
        model: 'speech-2.8-turbo',
        providerId: 'minimax',
        voiceId: 'female-shaonv'
      }
    });

    expect(filter?.id).toBe('minimax-speech2-realtime-tags');
    expect(filter?.rules.length).toBeGreaterThan(0);
  });

  it('hides MiniMax speech-only tags from rendered text', () => {
    const filter = getRealtimeSpeechDisplayTextFilter({
      realtimeSpeech: {
        enabled: true,
        model: 'speech-2.8-turbo',
        providerId: 'minimax'
      }
    });

    expect(sanitizeSpeechTextForDisplay('<#0.4#>你好(laughs)，今天状态不错。 (sighs)', filter)).toBe('你好，今天状态不错。');
    expect(sanitizeSpeechTextForDisplay('先吸气(inhale)，再说<#1.25#>OK。', filter)).toBe('先吸气，再说OK。');
  });

  it('keeps source text unchanged when no filter is provided', () => {
    const text = '<#0.4#>你好(laughs)';
    expect(sanitizeSpeechTextForDisplay(text)).toBe(text);
  });
});
