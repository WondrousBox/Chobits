import { describe, expect, it } from 'vitest';

import { buildSkillSourcePolicy } from '../../packages/ai/runtime/pi/skills/source-policy';

describe('skill source policy', () => {
  it('tracks only truly sensitive tool ids for guarded plugin skills', () => {
    const policy = buildSkillSourcePolicy({
      activationToolIds: [],
      allowedToolIds: ['skill-search', 'shell-exec'],
      source: 'plugin'
    });

    expect(policy).toMatchObject({
      recommendedMode: 'preview',
      requiresExplicitUserIntent: true,
      requiresPreviewBeforeInline: true,
      riskLevel: 'guarded',
      sensitiveToolCategories: ['shell'],
      sensitiveToolIds: ['shell-exec']
    });
    expect(policy.message).not.toContain('skill-search');
  });

  it('keeps tool-level sensitive ids empty when guarded only by fork execution', () => {
    const policy = buildSkillSourcePolicy({
      activationToolIds: [],
      allowedToolIds: ['skill-search'],
      executionContext: 'fork',
      source: 'plugin'
    });

    expect(policy).toMatchObject({
      riskLevel: 'guarded',
      sensitiveToolCategories: [],
      sensitiveToolIds: []
    });
    expect(policy.message).toContain('forked execution context');
  });
});
