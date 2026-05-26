import { describe, expect, it } from 'vitest';

import { stripEmoji } from '../packages/tts/common';

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
});
