import { describe, expect, it } from 'vitest';

import { getSpriteTriggerPresentation, normalizeSpriteTriggerInput } from '../../src/pages/ExtensionSettings/components/sprite-trigger-picker-utils';

describe('sprite trigger picker utils', () => {
  it('normalizes blank input to empty trigger', () => {
    expect(normalizeSpriteTriggerInput('   ')).toBe('');
    expect(normalizeSpriteTriggerInput(undefined)).toBe('');
  });

  it('keeps built-in trigger presentation grouped', () => {
    expect(getSpriteTriggerPresentation('celebrate')).toEqual({
      kind: 'builtin',
      label: 'celebrate',
      detail: 'feedback',
      value: 'celebrate'
    });
  });

  it('groups talk as a built-in action trigger', () => {
    expect(getSpriteTriggerPresentation('talk')).toEqual({
      kind: 'builtin',
      label: 'talk',
      detail: 'action',
      value: 'talk'
    });
  });

  it('keeps custom trigger presentation explicit', () => {
    expect(getSpriteTriggerPresentation(' persona:daily-login ')).toEqual({
      kind: 'custom',
      label: 'persona:daily-login',
      detail: '自定义',
      value: 'persona:daily-login'
    });
  });
});
