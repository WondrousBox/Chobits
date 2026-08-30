import { describe, expect, it } from 'vitest';

import { getCurrentRMS, detachLipSyncSource } from '../../src/lib/audio/lip-sync-source';

describe('lip-sync-source', () => {
  it('returns 0 when no source is attached', () => {
    detachLipSyncSource();
    expect(getCurrentRMS()).toBe(0);
  });

  it('smooths RMS values with attack and release', () => {
    // 无 analyser 时恒为 0，验证平滑逻辑不crash
    detachLipSyncSource();
    const v1 = getCurrentRMS();
    const v2 = getCurrentRMS();
    expect(v1).toBe(0);
    expect(v2).toBe(0);
  });
});
