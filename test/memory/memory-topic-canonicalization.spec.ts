import { describe, expect, it } from 'vitest';

import { canonicalizeTopicLabel, compactTopicLabel } from '../../packages/ai/services/memory-topic-canonicalization';

describe('memory topic canonicalization', () => {
  it('compacts generic suffixes without touching the topic core', () => {
    expect(compactTopicLabel('厦门美食推荐')).toBe('厦门美食');
    expect(compactTopicLabel('关于 Runtime Memory Notes')).toBe('Runtime Memory');
    expect(compactTopicLabel('AI Agent')).toBe('AI Agent');
  });

  it('returns a compact canonical label without a database lookup', async () => {
    const result = await canonicalizeTopicLabel({
      topicLabel: '厦门美食推荐',
      topicSlug: 'xiamen-food-recommendations',
      workspaceId: 'ws-1'
    });

    expect(result).toMatchObject({
      label: '厦门美食',
      slug: '厦门美食',
      aliases: ['厦门美食推荐'],
      matchedExisting: false
    });
  });

  it('reuses an existing canonical topic when the compact label matches a stored topic', async () => {
    const result = await canonicalizeTopicLabel(
      {
        topicLabel: '厦门美食推荐',
        topicSlug: 'xiamen-food-recommendations',
        workspaceId: 'ws-1'
      },
      {
        findTopicBySlug: async (slug) => (slug === '厦门美食' ? { id: 'topic_xiamen_food', label: '厦门美食', slug: '厦门美食', aliases: '[]', heat: 0.9 } : undefined),
        searchTopics: async () => [{ id: 'topic_xiamen_food', label: '厦门美食', slug: '厦门美食', aliases: '["厦门美食推荐"]', heat: 0.9 }],
        findTopicsByDomain: async () => []
      }
    );

    expect(result).toMatchObject({
      label: '厦门美食',
      slug: '厦门美食',
      aliases: ['厦门美食推荐'],
      matchedExisting: true,
      matchedTopicId: 'topic_xiamen_food'
    });
  });
});
