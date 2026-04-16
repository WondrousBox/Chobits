import { describe, expect, it } from 'vitest';

import { createThinkingTagStreamParser, extractThinkingTextFromMetadata, readThinkingBlocksFromMetadata, splitThinkingTagsFromText } from '../packages/ai/thinking-content';

describe('thinking content helpers', () => {
  it('splits inline think tags into answer and thinking text', () => {
    expect(splitThinkingTagsFromText('答复前<think>先分析一下</think>正式回答')).toEqual({
      content: '答复前正式回答',
      hadThinkingTags: true,
      segments: [
        { kind: 'text', text: '答复前' },
        { kind: 'thinking', text: '先分析一下' },
        { kind: 'text', text: '正式回答' }
      ],
      thinking: '先分析一下'
    });
  });

  it('handles think tags split across multiple streaming chunks', () => {
    const parser = createThinkingTagStreamParser();

    expect(parser.push('开头<th')).toEqual([{ kind: 'text', text: '开头' }]);
    expect(parser.push('ink>思考')).toEqual([{ kind: 'thinking', text: '思考' }]);
    expect(parser.push('内容</thi')).toEqual([{ kind: 'thinking', text: '内容' }]);
    expect(parser.push('nk>结尾')).toEqual([{ kind: 'text', text: '结尾' }]);
    expect(parser.flush()).toEqual([]);
  });

  it('recovers thinking blocks from message metadata', () => {
    const metadata = {
      thinkingBlocks: [
        { type: 'thinking', thinking: '第一段' },
        { type: 'thinking', thinking: '第二段', redacted: true, thinkingSignature: 'sig-1' },
        { type: 'text', thinking: 'ignore me' }
      ]
    };

    expect(readThinkingBlocksFromMetadata(metadata)).toEqual([
      { type: 'thinking', thinking: '第一段' },
      { type: 'thinking', thinking: '第二段', redacted: true, thinkingSignature: 'sig-1' }
    ]);
    expect(extractThinkingTextFromMetadata(metadata)).toBe('第一段第二段');
  });
});
