import { describe, expect, it } from 'vitest';

import { buildExplicitSkillInvocationInput } from '../src/lib/chat-explicit-skill-invocation';

describe('buildExplicitSkillInvocationInput', () => {
  it('extracts slash skill input for assistant skill-enabled agents', () => {
    expect(buildExplicitSkillInvocationInput('assistant', '/commit finalize the current changes')).toEqual({
      matchedReference: 'commit',
      remainingQuery: 'finalize the current changes',
      source: 'slash-command'
    });
    expect(buildExplicitSkillInvocationInput('assistant-skills', '/review-pack check the current diff')).toEqual({
      matchedReference: 'review-pack',
      remainingQuery: 'check the current diff',
      source: 'slash-command'
    });
  });

  it('ignores non-skill agents and plain chat input', () => {
    expect(buildExplicitSkillInvocationInput('chat', '/commit finalize the current changes')).toBeUndefined();
    expect(buildExplicitSkillInvocationInput('assistant', 'please help with this change')).toBeUndefined();
  });

  it('keeps the first slash token as the structured skill reference, including non-ASCII names', () => {
    expect(buildExplicitSkillInvocationInput('assistant', '/字幕 翻译 这段内容')).toEqual({
      matchedReference: '字幕',
      remainingQuery: '翻译 这段内容',
      source: 'slash-command'
    });
    expect(buildExplicitSkillInvocationInput('assistant', '/字幕翻译 这段内容')).toEqual({
      matchedReference: '字幕翻译',
      remainingQuery: '这段内容',
      source: 'slash-command'
    });
    expect(buildExplicitSkillInvocationInput('assistant', '/提交代码')).toEqual({
      matchedReference: '提交代码',
      source: 'slash-command'
    });
  });
});
