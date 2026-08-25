import { describe, expect, it } from 'vitest';

import { applySkillPickerSelection, deriveSkillPickerQuery, extractSkillCommandArgs, isTypingSlashSkillQuery, listSkillSuggestions, resolveActiveSkillInfo, resolveSuggestedSkillInfo, shouldEnableSkillPicker } from '../../src/lib/chat-skill-picker';

describe('chat skill picker helpers', () => {
  it('only enables the picker for assistant skill-enabled agents', () => {
    expect(shouldEnableSkillPicker('assistant')).toBe(true);
    expect(shouldEnableSkillPicker('assistant-skills')).toBe(true);
    expect(shouldEnableSkillPicker('chat')).toBe(false);
  });

  it('detects slash command typing state and derives the current query', () => {
    expect(isTypingSlashSkillQuery('/commit')).toBe(true);
    expect(isTypingSlashSkillQuery('/commit finalize')).toBe(false);
    expect(deriveSkillPickerQuery('/commit finalize')).toBe('commit');
    expect(deriveSkillPickerQuery('plain text')).toBe('');
  });

  it('replaces the current slash command token but preserves the remaining query', () => {
    expect(applySkillPickerSelection('/comm finalize the current changes', 'commit')).toBe('/commit finalize the current changes');
    expect(applySkillPickerSelection('plain text', '字幕翻译')).toBe('/字幕翻译 ');
  });

  it('resolves the currently selected skill from the slash input', () => {
    const skills = [
      {
        aliases: ['commit-now'],
        description: 'Create a commit from the current changes.',
        name: 'commit',
        source: 'project',
        whenToUse: 'Use when the current diff is ready to commit.'
      },
      {
        aliases: [],
        description: 'Translate subtitles.',
        name: '字幕翻译',
        source: 'project'
      }
    ];

    expect(resolveActiveSkillInfo('/commit finalize the current changes', skills as any)?.name).toBe('commit');
    expect(resolveActiveSkillInfo('/commit-now finalize the current changes', skills as any)?.name).toBe('commit');
    expect(resolveActiveSkillInfo('/unknown finalize the current changes', skills as any)).toBeUndefined();
  });

  it('extracts slash skill args and suggests the best matching skill for tab completion', () => {
    const skills = [
      {
        aliases: ['commit-now'],
        description: 'Create a commit from the current changes.',
        name: 'commit',
        source: 'project'
      },
      {
        aliases: ['compare'],
        description: 'Compare files.',
        name: 'compare-files',
        source: 'project'
      }
    ];

    expect(extractSkillCommandArgs('/commit finalize the current changes')).toBe('finalize the current changes');
    expect(extractSkillCommandArgs('/commit')).toBeUndefined();
    expect(resolveSuggestedSkillInfo('/comm', skills as any)?.name).toBe('commit');
    expect(resolveSuggestedSkillInfo('/compare', skills as any)?.name).toBe('compare-files');
  });

  it('returns ordered slash menu suggestions for keyboard navigation', () => {
    const skills = [
      {
        aliases: ['commit-now'],
        description: 'Create a commit from the current changes.',
        name: 'commit',
        source: 'project'
      },
      {
        aliases: [],
        description: 'Compare files.',
        name: 'compare-files',
        source: 'project'
      },
      {
        aliases: [],
        description: 'Translate subtitles.',
        name: '字幕翻译',
        source: 'project'
      }
    ];

    expect(listSkillSuggestions('/com', skills as any).map((skill) => skill.name)).toEqual(['compare-files', 'commit']);
    expect(listSkillSuggestions('/字幕', skills as any).map((skill) => skill.name)).toEqual(['字幕翻译']);
    expect(listSkillSuggestions('/unknown', skills as any)).toEqual([]);
  });
});
