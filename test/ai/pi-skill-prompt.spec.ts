import { describe, expect, it } from 'vitest';

import type { SkillRegistryEntry } from '../../packages/ai/runtime/pi/skills';
import { buildSkillDiscoveryPrompt, buildSkillListingPrompt, createSkillSessionState, SkillRegistry } from '../../packages/ai/runtime/pi/skills';

describe('skill prompt helpers', () => {
  it('builds a limited skill listing from model-visible skills', () => {
    const registry = SkillRegistry.fromEntries([
      createEntry({
        description: 'Subtitle translation workflow.',
        name: 'subtitle-translate'
      }),
      createEntry({
        description: 'Summarize long subtitle files.',
        name: 'subtitle-summary',
        whenToUse: 'Use when the user wants a summary.'
      }),
      createEntry({
        description: 'Hidden internal helper.',
        disableModelInvocation: true,
        name: 'internal-hidden'
      })
    ]);

    const prompt = buildSkillListingPrompt(registry, { limit: 1 });

    expect(prompt).toContain('## Available Skills');
    expect(prompt).toContain('`subtitle-summary`');
    expect(prompt).toContain('source: Bundled');
    expect(prompt).not.toContain('`internal-hidden`');
    expect(prompt).toContain('还有 1 个 skills 未展开');
  });

  it('builds turn-level discovery prompts and marks discovered skills in session state', () => {
    const registry = SkillRegistry.fromEntries([
      createEntry({
        aliases: ['翻译字幕'],
        description: 'Reliable subtitle translation workflow.',
        name: 'subtitle-translate',
        whenToUse: 'Use when the user asks to translate subtitles.'
      }),
      createEntry({
        aliases: ['翻译字幕'],
        description: 'Only for mobile workspace.',
        name: 'mobile-subtitle-translate',
        paths: ['packages/mobile/**'],
        whenToUse: 'Use in the mobile workspace.'
      })
    ]);

    const state = createSkillSessionState();
    const prompt = buildSkillDiscoveryPrompt(registry, {
      query: '帮我翻译字幕',
      state,
      workspaceRoot: '/repo/packages/ai/runtime'
    });

    expect(prompt).toContain('## Relevant Skills For This Request');
    expect(prompt).toContain('`subtitle-translate`');
    expect(prompt).toContain('Source: Bundled');
    expect(prompt).not.toContain('`mobile-subtitle-translate`');
    expect(state.discoveredSkillNames.has('subtitle-translate')).toBe(true);
    expect(state.lastDiscoveryAt).toBeTypeOf('number');
  });

  it('adds source caution for plugin skills in listing and discovery prompts', () => {
    const registry = SkillRegistry.fromEntries([
      createEntry({
        allowedToolIds: ['shell-exec'],
        aliases: ['review'],
        description: 'Plugin review workflow.',
        name: 'review-pack',
        source: 'plugin',
        sourceInfo: {
          label: 'Plugin: review-pack',
          trustLevel: 'plugin',
          trustNote: 'Plugin-provided skill. Verify the plugin source before sensitive use.'
        },
        whenToUse: 'Use when the user asks for a deeper review.'
      })
    ]);

    const listingPrompt = buildSkillListingPrompt(registry, { limit: 5 });
    const discoveryPrompt = buildSkillDiscoveryPrompt(registry, {
      query: 'please review this change',
      workspaceRoot: '/repo'
    });

    expect(listingPrompt).toContain('source: Plugin: review-pack');
    expect(listingPrompt).toContain('caution: Plugin-provided skill.');
    expect(listingPrompt).toContain('guard:');
    expect(discoveryPrompt).toContain('Source: Plugin: review-pack');
    expect(discoveryPrompt).toContain('Caution: Plugin-provided skill.');
    expect(discoveryPrompt).toContain('Guard:');
  });
});

function createEntry(overrides: Partial<SkillRegistryEntry['record']> = {}): SkillRegistryEntry {
  const name = overrides.name || 'skill';

  return {
    locator: { kind: 'skill-file' },
    priority: 10,
    rawFrontmatter: {},
    record: {
      activationToolIds: [],
      aliases: [],
      allowedToolIds: [],
      argumentHint: undefined,
      argumentNames: [],
      contentHash: `${name}-hash`,
      description: `${name} description`,
      disableModelInvocation: false,
      name,
      paths: undefined,
      skillDir: `/tmp/${name}`,
      skillFilePath: `/tmp/${name}/SKILL.md`,
      source: 'bundled',
      tags: [],
      userInvocable: true,
      whenToUse: undefined,
      ...overrides
    }
  };
}
