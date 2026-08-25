import { describe, expect, it } from 'vitest';

import { buildConversationPlaceholderTitle, normalizeGeneratedConversationTitle } from '../../packages/ai/conversation-title';

describe('conversation title helpers', () => {
  it('builds placeholder titles from user content without exceeding the max length', () => {
    const title = buildConversationPlaceholderTitle('  hello\nworld from user  ', 10);

    expect(title).toBe('hello wor…');
    expect(Array.from(title)).toHaveLength(10);
  });

  it('normalizes generated titles and keeps the final length within the max length', () => {
    const title = normalizeGeneratedConversationTitle('  “一个很长的标题标题标题”  ', 6);

    expect(title).toBe('一个很长的…');
    expect(Array.from(title)).toHaveLength(6);
  });

  it('returns a single ellipsis when max length is one', () => {
    expect(buildConversationPlaceholderTitle('你好世界', 1)).toBe('…');
  });
});
