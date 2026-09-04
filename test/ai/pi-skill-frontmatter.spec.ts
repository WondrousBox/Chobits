import { describe, expect, it } from 'vitest';

import { parseSkillMarkdown } from '../../packages/ai/runtime/pi/skills';

describe('parseSkillMarkdown', () => {
  it('parses supported frontmatter fields and normalizes tool identifiers', () => {
    const markdown = `---
name: subtitle-translate
description: Reliable subtitle translation workflow.
when_to_use: |
  Use when the user asks to translate subtitles.
  Ask for the target language when it is omitted.
arguments:
  - name: resourceId
  - name: targetLanguage
allowed-tools:
  - appWindowTool
  - web-search
activation-tools: [appWindowTool, webSearchTool]
aliases: [翻译字幕, 字幕翻译]
tags:
  - subtitles
  - translation
paths:
  - packages/ai/**
user-invocable: false
disable-model-invocation: true
argument-hint: resourceId, targetLanguage
context: fork
model: gpt-5.1
effort: high
---
# Subtitle Translate
`;

    const parsed = parseSkillMarkdown(markdown, { filePath: '/tmp/SKILL.md' });

    expect(parsed.issues).toEqual([]);
    expect(parsed.metadata).toMatchObject({
      activationToolIds: ['app-window', 'web-search'],
      aliases: ['翻译字幕', '字幕翻译'],
      allowedToolIds: ['app-window', 'web-search'],
      argumentHint: 'resourceId, targetLanguage',
      argumentNames: ['resourceId', 'targetLanguage'],
      description: 'Reliable subtitle translation workflow.',
      disableModelInvocation: true,
      effort: 'high',
      executionContext: 'fork',
      model: 'gpt-5.1',
      name: 'subtitle-translate',
      paths: ['packages/ai/**'],
      tags: ['subtitles', 'translation'],
      userInvocable: false,
      whenToUse: 'Use when the user asks to translate subtitles.\nAsk for the target language when it is omitted.'
    });
  });

  it('reports unknown tools and missing frontmatter', () => {
    const parsedWithUnknownTool = parseSkillMarkdown(
      `---
name: bad-skill
description: Bad skill.
allowed-tools: [ghostTool]
---
body
`,
      { filePath: '/tmp/invalid-skill.md' }
    );

    expect(parsedWithUnknownTool.metadata?.allowedToolIds).toEqual([]);
    expect(parsedWithUnknownTool.issues).toEqual([
      expect.objectContaining({
        code: 'unknown-tool-reference',
        severity: 'warning'
      })
    ]);

    const parsedWithoutFrontmatter = parseSkillMarkdown('# Just markdown', { filePath: '/tmp/no-frontmatter.md' });
    expect(parsedWithoutFrontmatter.metadata).toBeUndefined();
    expect(parsedWithoutFrontmatter.issues).toEqual([
      expect.objectContaining({
        code: 'missing-frontmatter',
        severity: 'error'
      })
    ]);

    const parsedWithInvalidExecutionHints = parseSkillMarkdown(
      `---
name: weird-skill
description: Weird skill.
context: detached
effort: turbo
---
body
`,
      { filePath: '/tmp/weird-skill.md' }
    );

    expect(parsedWithInvalidExecutionHints.metadata).toMatchObject({
      description: 'Weird skill.',
      name: 'weird-skill'
    });
    expect(parsedWithInvalidExecutionHints.issues).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: 'invalid-skill-context', severity: 'warning' }), expect.objectContaining({ code: 'invalid-skill-effort', severity: 'warning' })])
    );
  });
});
