import { describe, expect, it } from 'vitest';

import { loadLive2DConfig, resolveTriggerMapping, type Live2DConfig } from '../../src/features/sprite-assistant/live2d/live2d-config';

describe('live2d-config', () => {
  it('resolves direct trigger mapping', () => {
    const config: Live2DConfig = {
      model: 'test.model3.json',
      canvas: { width: 300, height: 400, padding: 40, scale: 1 },
      triggers: {
        idle: { motion: { group: 'Idle', index: 0 }, loop: true },
        talk: { motion: { group: '', index: 0 }, loop: true }
      }
    };

    const mapping = resolveTriggerMapping(config, 'talk');
    expect(mapping).toEqual({ motion: { group: '', index: 0 }, loop: true });
  });

  it('falls back to idle for unknown trigger', () => {
    const config: Live2DConfig = {
      model: 'test.model3.json',
      canvas: { width: 300, height: 400, padding: 40, scale: 1 },
      triggers: {
        idle: { motion: { group: 'Idle', index: 0 }, loop: true }
      }
    };

    const mapping = resolveTriggerMapping(config, 'unknown');
    expect(mapping).toEqual({ motion: { group: 'Idle', index: 0 }, loop: true });
  });

  it('returns null when config is null', () => {
    expect(resolveTriggerMapping(null, 'idle')).toBeNull();
  });

  it('returns null when no mapping and no idle fallback', () => {
    const config: Live2DConfig = {
      model: 'test.model3.json',
      canvas: { width: 300, height: 400, padding: 40, scale: 1 },
      triggers: {}
    };

    expect(resolveTriggerMapping(config, 'idle')).toBeNull();
  });
});
