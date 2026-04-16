import { describe, expect, it } from 'vitest';

import { buildExplicitSkillInvocationInput } from '../src/lib/chat-explicit-skill-invocation';

describe('buildExplicitSkillInvocationInput', () => {
  it('extracts command-style slash skill input only for the default assistant', () => {
    expect(buildExplicitSkillInvocationInput('assistant', '/commit finalize the current changes')).toEqual({
      matchedReference: 'commit',
      remainingQuery: 'finalize the current changes',
      source: 'slash-command'
    });
  });

  it('ignores non-skill agents and plain chat input', () => {
    expect(buildExplicitSkillInvocationInput('chat', '/commit finalize the current changes')).toBeUndefined();
    expect(buildExplicitSkillInvocationInput('assistant', 'please help with this change')).toBeUndefined();
  });

  it('leaves spaced or non-command-style slash references to the backend fallback parser', () => {
    expect(buildExplicitSkillInvocationInput('assistant', '/字幕 翻译 这段内容')).toBeUndefined();
    expect(buildExplicitSkillInvocationInput('assistant', '/字幕翻译 这段内容')).toBeUndefined();
  });
});
