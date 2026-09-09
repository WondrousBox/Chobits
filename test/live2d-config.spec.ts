import { describe, expect, it } from 'vitest';

import { normalizeLive2DConfig, resolveTriggerMapping } from '../src/features/sprite-assistant/live2d/live2d-config';

describe('live2d config', () => {
  it('normalizes unsafe values while preserving supported mappings', () => {
    expect(
      normalizeLive2DConfig({
        canvas: { width: -1, height: 480, padding: Number.NaN, scale: 0 },
        lookAt: { enabled: true, pointer: false },
        lipSync: { paramId: 'ParamA', gain: 3 },
        triggers: {
          idle: { motion: { group: 'Idle', index: 0 }, loop: true },
          brokenMotion: { motion: { group: 'Idle', index: -1 } },
          expressionOnly: { expression: ' happy ', loop: 'yes' }
        }
      })
    ).toEqual({
      canvas: { width: 300, height: 480, padding: 40, scale: 1 },
      lookAt: { enabled: true, pointer: false },
      lipSync: { paramId: 'ParamA', gain: 3 },
      triggers: {
        idle: { motion: { group: 'Idle', index: 0 }, loop: true },
        expressionOnly: { expression: 'happy' }
      }
    });
  });

  it('uses idle as the local fallback without crossing renderer boundaries', () => {
    const config = normalizeLive2DConfig({
      triggers: {
        idle: { motion: { group: 'Idle', index: 0 }, loop: true },
        talk: { motion: { group: 'Talk', index: 1 }, loop: true }
      }
    });

    expect(resolveTriggerMapping(config, 'talk')).toEqual({ motion: { group: 'Talk', index: 1 }, loop: true });
    expect(resolveTriggerMapping(config, 'missing')).toEqual({ motion: { group: 'Idle', index: 0 }, loop: true });
    expect(resolveTriggerMapping(null, 'idle')).toBeNull();
  });
});
