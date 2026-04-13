import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { extractMemory, mergeMemory, runExtractionPipeline, type ExtractionContext, type WriteDbOps } from '../packages/ai/services/memory-extraction-service';
import { parseFrontmatter } from '../packages/ai/services/memory-note-parser';
import type { CollectOutput, MemoryExtractionOutput } from '../packages/ai/services/memory-types';

const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

function createDbOps(): WriteDbOps & {
  upsertNote: ReturnType<typeof vi.fn>;
  rebuildSections: ReturnType<typeof vi.fn>;
  upsertTopic: ReturnType<typeof vi.fn>;
  upsertEdges: ReturnType<typeof vi.fn>;
  upsertKeywords: ReturnType<typeof vi.fn>;
  rebuildFTS: ReturnType<typeof vi.fn>;
  upsertEntityFact: ReturnType<typeof vi.fn>;
} {
  const upsertNote = vi.fn(async (note: any) => note);
  const rebuildSections = vi.fn(async () => []);
  const upsertTopic = vi.fn(async (topic: any) => ({ id: `topic_${topic.slug}`, label: topic.label, slug: topic.slug, created: true }));
  const upsertEdges = vi.fn(async (edges: any[]) => edges.length);
  const upsertKeywords = vi.fn(async (_noteId: string, keywords: string[]) => keywords.length);
  const rebuildFTS = vi.fn();
  const upsertEntityFact = vi.fn(async (fact: any) => fact);

  return {
    upsertNote,
    rebuildSections,
    upsertTopic,
    upsertEdges,
    upsertKeywords,
    rebuildFTS,
    upsertEntityFact
  };
}

describe('memory extraction pipeline regression coverage', () => {
  it('runs split -> extract -> merge -> write for a new note and persists domain plus source excerpts', async () => {
    const workspaceRoot = await mkdtemp(path.join(os.tmpdir(), 'chobits-memory-pipeline-'));
    tempDirs.push(workspaceRoot);

    let llmCall = 0;
    const chatFn = vi.fn(async () => {
      llmCall += 1;

      if (llmCall === 1) {
        return JSON.stringify({
          topicClusters: [
            {
              topicLabel: 'Runtime Memory',
              topicSlug: 'runtime-memory',
              description: 'Memory extraction config and worker behavior',
              messageRanges: [{ conversationId: 'conv-1', seqStart: 1, seqEnd: 2 }],
              estimatedImportance: 0.9,
              domain: 'project:chobits'
            }
          ]
        });
      }

      return JSON.stringify({
        topicLabel: 'Runtime Memory',
        topicSlug: 'runtime-memory',
        summary: 'Memory extraction should follow runtime config.',
        importance: 0.92,
        stability: 0.83,
        keywords: ['memory', 'runtime', 'config'],
        entities: [{ name: 'Chobits', type: 'product' }],
        sections: {
          keyPoints: '- Extraction worker reads persisted runtime config',
          openItems: '- Add more cleanup regression tests',
          recallCues: '- [decision] Keep extraction thresholds runtime-configured'
        },
        sourceExcerpts: ['a'.repeat(240), 'second excerpt', 'third excerpt', 'fourth excerpt']
      });
    });

    const ctx: ExtractionContext = {
      chatFn,
      workspaceId: 'ws-1',
      workspaceRoot,
      date: '2026-04-12'
    };

    const dbOps = createDbOps();

    const result = await runExtractionPipeline(
      { conversationIds: ['conv-1'] },
      ctx,
      {
        listMessages: async () => [
          { role: 'user', content: 'Please make extraction config runtime-driven.', seq: 1, createdAt: Date.parse('2026-04-12T08:00:00Z') },
          { role: 'assistant', content: 'I will wire it to the worker thresholds.', seq: 2, createdAt: Date.parse('2026-04-12T08:05:00Z') }
        ],
        getConversation: async () => ({ id: 'conv-1', title: 'Runtime Memory' }),
        findExistingNote: async () => null,
        dbOps
      }
    );

    expect(result.failed).toEqual([]);
    expect(result.succeeded).toHaveLength(1);
    expect(result.stats).toMatchObject({
      notesCreated: 1,
      notesUpdated: 0,
      topicsCreated: 1,
      keywordsCreated: 3
    });

    expect(dbOps.upsertNote).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: 'ws-1',
        domain: 'project:chobits'
      })
    );
    expect(dbOps.upsertTopic).toHaveBeenCalledWith(
      expect.objectContaining({
        domain: 'project:chobits',
        domainType: 'project'
      })
    );

    const notePath = path.join(workspaceRoot, 'memory', 'daily', '2026', '04', '2026-04-12-runtime-memory.md');
    const markdown = await readFile(notePath, 'utf-8');
    const parsed = parseFrontmatter(markdown);

    expect(parsed.frontmatter?.domain).toBe('project:chobits');
    expect(markdown).toContain('## Source Excerpts');
    expect(markdown).toContain(`> "${'a'.repeat(200)}`);
    expect(markdown).not.toContain(`> "${'a'.repeat(201)}`);
    expect((markdown.match(/^> "/gm) || []).length).toBe(3);
  });

  it('canonicalizes redundant topic labels before merge and stores the raw label as an alias', async () => {
    const workspaceRoot = await mkdtemp(path.join(os.tmpdir(), 'chobits-memory-canonical-topic-'));
    tempDirs.push(workspaceRoot);

    let llmCall = 0;
    const chatFn = vi.fn(async () => {
      llmCall += 1;
      if (llmCall === 1) {
        return JSON.stringify({
          topicClusters: [
            {
              topicLabel: '厦门美食推荐',
              topicSlug: 'xiamen-food-recommendations',
              description: 'Food picks in Xiamen',
              messageRanges: [{ conversationId: 'conv-1', seqStart: 1, seqEnd: 1 }],
              estimatedImportance: 0.82,
              domain: 'general'
            }
          ]
        });
      }

      return JSON.stringify({
        topicLabel: '厦门美食推荐',
        topicSlug: 'xiamen-food-recommendations',
        summary: '整理厦门值得吃的本地美食。',
        importance: 0.84,
        stability: 0.79,
        keywords: ['厦门', '美食', '推荐'],
        sections: {
          keyPoints: '- 沙茶面和海蛎煎值得优先尝试'
        }
      });
    });

    const canonicalizeTopic = vi.fn(async () => ({
      label: '厦门美食',
      slug: '厦门美食',
      aliases: ['厦门美食推荐'],
      confidence: 0.99
    }));
    const findExistingNote = vi.fn(async () => null);
    const dbOps = createDbOps();

    const result = await runExtractionPipeline(
      { conversationIds: ['conv-1'] },
      {
        chatFn,
        workspaceId: 'ws-1',
        workspaceRoot,
        date: '2026-04-12'
      },
      {
        listMessages: async () => [{ role: 'user', content: '给我一些厦门美食推荐。', seq: 1, createdAt: Date.parse('2026-04-12T08:00:00Z') }],
        getConversation: async () => ({ id: 'conv-1', title: '厦门旅行' }),
        findExistingNote,
        canonicalizeTopic,
        dbOps
      }
    );

    expect(result.failed).toEqual([]);
    expect(result.succeeded).toEqual([{ topicSlug: '厦门美食', noteId: expect.any(String) }]);
    expect(canonicalizeTopic).toHaveBeenCalledWith(
      expect.objectContaining({
        topicLabel: '厦门美食推荐',
        topicSlug: 'xiamen-food-recommendations',
        workspaceId: 'ws-1'
      })
    );
    expect(findExistingNote).toHaveBeenCalledWith('2026-04-12', '厦门美食', 'ws-1');
    expect(dbOps.upsertNote).toHaveBeenCalledWith(
      expect.objectContaining({
        filePath: path.join('memory', 'daily', '2026', '04', '2026-04-12-厦门美食.md'),
        topics: JSON.stringify(['厦门美食']),
        aliases: JSON.stringify(['厦门美食推荐'])
      })
    );
  });

  it('falls back to seq-range matching for a single conversation and trims high-importance excerpts', async () => {
    const chatFn = vi.fn(async () =>
      JSON.stringify({
        topicLabel: 'Runtime Memory',
        topicSlug: 'runtime-memory',
        summary: 'Recovered with seq-range fallback.',
        importance: 0.88,
        stability: 0.8,
        keywords: ['runtime'],
        sections: {
          keyPoints: '- Seq range fallback rescued the extraction'
        },
        sourceExcerpts: ['x'.repeat(250), 'second excerpt', 'third excerpt', 'fourth excerpt']
      })
    );

    const collected: CollectOutput = {
      conversations: [
        {
          conversationId: 'conv-real',
          title: 'Runtime Memory',
          messages: [
            { role: 'user', content: 'first relevant line', seq: 3, createdAt: Date.parse('2026-04-12T08:00:00Z') },
            { role: 'assistant', content: 'second relevant line', seq: 4, createdAt: Date.parse('2026-04-12T08:01:00Z') }
          ]
        }
      ],
      totalMessageCount: 2,
      dateRange: { start: '2026-04-12', end: '2026-04-12' }
    };

    const result = await extractMemory(
      {
        topicLabel: 'Runtime Memory',
        topicSlug: 'runtime-memory',
        description: 'Fallback coverage',
        messageRanges: [{ conversationId: 'conv-other', seqStart: 3, seqEnd: 4 }],
        estimatedImportance: 0.8
      },
      collected,
      {
        chatFn,
        workspaceId: 'ws-1',
        workspaceRoot: 'F:\\Develop\\chobits',
        date: '2026-04-12'
      }
    );

    expect(result).not.toBeNull();
    expect(chatFn.mock.calls[0][0]).toContain('[user] first relevant line');
    expect(chatFn.mock.calls[0][0]).toContain('[assistant] second relevant line');
    expect(result?.sourceExcerpts).toEqual(['x'.repeat(200), 'second excerpt', 'third excerpt']);
  });

  it('drops source excerpts below the high-importance threshold', async () => {
    const result = await extractMemory(
      {
        topicLabel: 'Low Importance Topic',
        topicSlug: 'low-importance-topic',
        description: 'Source excerpt gating',
        messageRanges: [{ conversationId: 'conv-1', seqStart: 1, seqEnd: 1 }],
        estimatedImportance: 0.5
      },
      {
        conversations: [
          {
            conversationId: 'conv-1',
            title: 'Low Importance Topic',
            messages: [{ role: 'user', content: 'This should not keep excerpts.', seq: 1, createdAt: Date.parse('2026-04-12T09:00:00Z') }]
          }
        ],
        totalMessageCount: 1,
        dateRange: { start: '2026-04-12', end: '2026-04-12' }
      },
      {
        chatFn: vi.fn(async () =>
          JSON.stringify({
            topicLabel: 'Low Importance Topic',
            topicSlug: 'low-importance-topic',
            summary: 'Below threshold',
            importance: 0.8,
            stability: 0.4,
            keywords: ['threshold'],
            sections: { keyPoints: '- No excerpt retention' },
            sourceExcerpts: ['keep me if the threshold is wrong']
          })
        ),
        workspaceId: 'ws-1',
        workspaceRoot: 'F:\\Develop\\chobits',
        date: '2026-04-12'
      }
    );

    expect(result?.sourceExcerpts).toBeUndefined();
  });

  it('falls back to simple open-item append when the merge LLM step fails', async () => {
    const existingNote = {
      id: 'mem_existing_runtime',
      frontmatter: {
        id: 'mem_existing_runtime',
        version: 1,
        workspaceId: 'ws-1',
        date: '2026-04-12',
        topics: ['Runtime Memory'],
        keywords: ['memory'],
        summary: 'Existing runtime memory',
        sourceConversationIds: ['conv-1'],
        sourceMessageRange: [{ conversationId: 'conv-1', seqStart: 1, seqEnd: 2 }],
        importance: 0.7,
        stability: 0.7,
        createdAt: 1712908800000,
        updatedAt: 1712908800000
      },
      sections: new Map<string, string>([
        ['Key Points', '- Existing point'],
        ['Open Items', '- Existing task']
      ])
    };

    const extraction: MemoryExtractionOutput = {
      topicLabel: 'Runtime Memory',
      topicSlug: 'runtime-memory',
      summary: 'Updated runtime memory',
      importance: 0.75,
      stability: 0.74,
      keywords: ['memory', 'config'],
      sections: {
        keyPoints: '- New point',
        openItems: '- Existing task\n- New task'
      }
    };

    const merged = await mergeMemory(
      extraction,
      existingNote,
      {
        chatFn: vi.fn(async () => {
          throw new Error('merge LLM unavailable');
        }),
        workspaceId: 'ws-1',
        workspaceRoot: 'F:\\Develop\\chobits',
        date: '2026-04-12'
      },
      ['conv-2'],
      [{ conversationId: 'conv-2', seqStart: 3, seqEnd: 4 }]
    );

    expect(merged.action).toBe('update');
    expect(merged.frontmatter.version).toBe(2);
    expect(merged.frontmatter.summary).toBe('Updated runtime memory');
    expect(merged.sections.get('Open Items')).toBe('- Existing task\n- New task');
    expect(merged.frontmatter.sourceConversationIds).toEqual(['conv-1', 'conv-2']);
  });

  it('refreshes summary and compacts merged sections instead of raw concatenation', async () => {
    const existingKeyPoints = Array.from({ length: 14 }, (_, index) => `- Existing point ${index + 1}`).join('\n');
    const existingNote = {
      id: 'mem_existing_compaction',
      frontmatter: {
        id: 'mem_existing_compaction',
        version: 5,
        workspaceId: 'ws-1',
        date: '2026-04-12',
        topics: ['Runtime Memory'],
        keywords: ['memory', 'runtime'],
        summary: 'Old summary that should be replaced.',
        sourceConversationIds: ['conv-1'],
        importance: 0.91,
        stability: 0.82,
        createdAt: 1712908800000,
        updatedAt: 1712908800000
      },
      sections: new Map<string, string>([
        ['Key Points', existingKeyPoints],
        ['Recall Cues', '- [decision] Keep markdown as source\n- [event] Runtime config shipped\n- [principle] Prefer deterministic merges\n- [ongoing] Monitor memory drift\n- [follow_up] Add retrieval transparency\n- [event] Runtime config shipped'],
        ['Source Excerpts', '> "old excerpt" -- 2026-04-11\n> "older excerpt" -- 2026-04-11']
      ])
    };

    const extraction: MemoryExtractionOutput = {
      topicLabel: 'Runtime Memory',
      topicSlug: 'runtime-memory',
      summary: 'Latest compact summary for the runtime memory note.',
      importance: 0.93,
      stability: 0.86,
      keywords: ['memory', 'runtime', 'compaction'],
      sections: {
        keyPoints: '- Existing point 14\n- Fresh point A\n- Fresh point B',
        recallCues: '- [decision] Keep markdown as source\n- [follow_up] Compact merged notes'
      },
      sourceExcerpts: ['latest excerpt 1', 'latest excerpt 2']
    };

    const merged = await mergeMemory(
      extraction,
      existingNote,
      {
        chatFn: vi.fn(async () => ''),
        workspaceId: 'ws-1',
        workspaceRoot: 'F:\\Develop\\chobits',
        date: '2026-04-12'
      },
      ['conv-2'],
      [{ conversationId: 'conv-2', seqStart: 20, seqEnd: 30 }]
    );

    const keyPointLines = (merged.sections.get('Key Points') || '').split('\n').filter((line) => line.startsWith('- '));
    const recallCueLines = (merged.sections.get('Recall Cues') || '').split('\n').filter((line) => line.startsWith('- '));
    const sourceExcerptLines = (merged.sections.get('Source Excerpts') || '').split('\n').filter((line) => line.startsWith('> '));

    expect(merged.frontmatter.summary).toBe('Latest compact summary for the runtime memory note.');
    expect(keyPointLines).toHaveLength(15);
    expect(keyPointLines.filter((line) => line === '- Existing point 14')).toHaveLength(1);
    expect(keyPointLines).toEqual(expect.arrayContaining(['- Fresh point A', '- Fresh point B']));
    expect(recallCueLines.length).toBeLessThanOrEqual(6);
    expect(recallCueLines.filter((line) => line === '- [decision] Keep markdown as source')).toHaveLength(1);
    expect(recallCueLines).toContain('- [follow_up] Compact merged notes');
    expect(sourceExcerptLines).toHaveLength(2);
    expect(merged.sections.get('Source Excerpts')).toContain('latest excerpt 1');
    expect(merged.sections.get('Source Excerpts')).not.toContain('old excerpt');
  });

  it('stores contradictions as structured state and keeps Key Points canonical', async () => {
    const existingNote = {
      id: 'mem_existing_conflict',
      frontmatter: {
        id: 'mem_existing_conflict',
        version: 3,
        workspaceId: 'ws-1',
        date: '2026-04-12',
        topics: ['Runtime Memory'],
        keywords: ['memory', 'sqlite'],
        summary: 'Existing memory note with an outdated decision.',
        sourceConversationIds: ['conv-1'],
        importance: 0.91,
        stability: 0.8,
        createdAt: 1712908800000,
        updatedAt: 1712908800000
      },
      sections: new Map<string, string>([
        ['Key Points', '- We decided to use SQLite only\n- Keep memory local']
      ])
    };

    const extraction: MemoryExtractionOutput = {
      topicLabel: 'Runtime Memory',
      topicSlug: 'runtime-memory',
      summary: 'The storage decision changed.',
      importance: 0.93,
      stability: 0.82,
      keywords: ['memory', 'sqlite', 'fts'],
      sections: {
        keyPoints: '- We decided to use SQLite with FTS\n- Keep memory local'
      }
    };

    const merged = await mergeMemory(
      extraction,
      existingNote,
      {
        chatFn: vi.fn(async () =>
          JSON.stringify({
            contradictions: [
              {
                old: 'We decided to use SQLite only',
                new: 'We decided to use SQLite with FTS',
                type: 'decision_change'
              }
            ]
          })
        ),
        workspaceId: 'ws-1',
        workspaceRoot: 'F:\\Develop\\chobits',
        date: '2026-04-12'
      },
      ['conv-2'],
      [{ conversationId: 'conv-2', seqStart: 3, seqEnd: 5 }]
    );

    expect(merged.frontmatter.contradictions).toEqual([
      expect.objectContaining({
        old: 'We decided to use SQLite only',
        new: 'We decided to use SQLite with FTS',
        type: 'decision_change',
        detectedAt: expect.any(Number)
      })
    ]);
    expect(merged.sections.get('Key Points')).toContain('- We decided to use SQLite with FTS');
    expect(merged.sections.get('Key Points')).not.toContain('- We decided to use SQLite only');
    expect(merged.sections.get('Contradictions')).toContain('[decision_change]');
    expect(merged.sections.get('Contradictions')).toContain('old: "We decided to use SQLite only"');
  });
});
