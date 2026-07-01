import { describe, expect, it } from 'vitest';

import { MINIMAX_SYSTEM_VOICE_GROUPS, MINIMAX_SYSTEM_VOICES } from '../packages/ai/providers/builtins/minimax/system-voices';
import { getProviderVoiceCatalog } from '../packages/ai/providers/voice-catalogs';

describe('MiniMax system voices', () => {
  it('matches the official Chinese system voice catalog shape', () => {
    expect(MINIMAX_SYSTEM_VOICES).toHaveLength(327);
    expect(new Set(MINIMAX_SYSTEM_VOICES.map((voice) => voice.value)).size).toBe(MINIMAX_SYSTEM_VOICES.length);
    expect(MINIMAX_SYSTEM_VOICES).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ value: 'female-shaonv', label: '少女音色', lang: '中文 (普通话)' }),
        expect.objectContaining({ value: 'male-qn-qingse', label: '青涩青年音色', lang: '中文 (普通话)' }),
        expect.objectContaining({ value: 'hindi_female_1_v2', label: 'News Anchor', lang: '印地文' })
      ])
    );
  });

  it('groups voices by contiguous official language sections', () => {
    const totalGroupedVoices = MINIMAX_SYSTEM_VOICE_GROUPS.reduce((total, group) => total + group.voices.length, 0);

    expect(totalGroupedVoices).toBe(MINIMAX_SYSTEM_VOICES.length);
    expect(MINIMAX_SYSTEM_VOICE_GROUPS[0]).toMatchObject({ lang: '中文 (普通话)' });
    expect(MINIMAX_SYSTEM_VOICE_GROUPS.at(-1)).toMatchObject({ lang: '印地文' });
  });

  it('exposes MiniMax voices through the provider voice catalog abstraction', () => {
    const catalog = getProviderVoiceCatalog('minimax');
    const aliasCatalog = getProviderVoiceCatalog('minimaxi');

    expect(catalog?.providerId).toBe('minimax');
    expect(aliasCatalog).toBe(catalog);
    expect(catalog?.groups[0]).toMatchObject({
      id: '中文 (普通话)',
      label: '中文 (普通话)',
      voices: expect.arrayContaining([expect.objectContaining({ id: 'female-shaonv', label: '少女音色' })])
    });
  });
});
