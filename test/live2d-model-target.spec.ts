import { describe, expect, it } from 'vitest';

import { resolveLive2DModelTarget } from '../src/features/sprite-assistant/live2d/live2d-model-target';

describe('live2d model target', () => {
  it('encodes the complete model directory as one resource-protocol segment', () => {
    expect(resolveLive2DModelTarget('/tmp/角色 pack/runtime/avatar.model3.json')).toEqual({
      resourcesBaseUrl: 'res://local/',
      modelDir: '%2Ftmp%2F%E8%A7%92%E8%89%B2%20pack%2Fruntime',
      modelFileName: 'avatar'
    });
  });

  it('normalizes Windows separators and rejects non-model entries', () => {
    expect(resolveLive2DModelTarget('C:\\packs\\mao\\mao.model3.json')).toEqual({
      resourcesBaseUrl: 'res://local/',
      modelDir: 'C%3A%2Fpacks%2Fmao',
      modelFileName: 'mao'
    });
    expect(() => resolveLive2DModelTarget('/tmp/avatar.json')).toThrow('.model3.json');
    expect(() => resolveLive2DModelTarget('avatar.model3.json')).toThrow('include a directory');
  });
});
