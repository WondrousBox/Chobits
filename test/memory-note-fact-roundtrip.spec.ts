import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { mergeMemory, writeMemory, type ExtractionContext, type WriteDbOps } from '../packages/ai/services/memory-extraction-service';
import { parseFrontmatter } from '../packages/ai/services/memory-note-parser';
import { renderNoteMarkdown } from '../packages/ai/services/memory-note-writer';
import type { MemoryExtractionOutput, MergedNote } from '../packages/ai/services/memory-types';

const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(
    tempDirs.splice(0).map((dir) =>
      rm(dir, { recursive: true, force: true })
    )
  );
});

describe('memory note fact-source roundtrip', () => {
  it('round-trips domain and nested entity relations through markdown frontmatter', () => {
    const note: MergedNote = {
      action: 'create',
      noteId: 'mem_2026-04-11_project-facts_ab12cd',
      filePath: 'memory/daily/2026/04/2026-04-11-project-facts.md',
      frontmatter: {
        id: 'mem_2026-04-11_project-facts_ab12cd',
        version: 1,
        workspaceId: 'ws-1',
        date: '2026-04-11',
        timeRange: { start: 1712793600000, end: 1712797200000 },
        topics: ['Project Facts'],
        parentTopicId: 'topic_project_facts',
        relatedTopicIds: ['topic_related_a', 'topic_related_b'],
        domain: 'project:chobits',
        keywords: ['memory', 'graph', 'relations'],
        aliases: ['memory facts'],
        entities: [
          {
            name: 'Alice',
            type: 'person',
            relations: [
              {
                predicate: 'works_on',
                object: 'Chobits',
                validFrom: '2026-04'
              }
            ]
          },
          {
            name: 'Chobits',
            type: 'product'
          }
        ],
        summary: 'Project memory facts.\nIncludes entity relations.',
        contradictions: [
          {
            old: 'Use local SQLite only',
            new: 'Use hybrid SQLite + FTS',
            type: 'decision_change',
            detectedAt: 1712795400000
          }
        ],
        sourceConversationIds: ['conv-1'],
        sourceMessageRange: [
          {
            conversationId: 'conv-1',
            seqStart: 1,
            seqEnd: 8
          }
        ],
        importance: 0.9,
        stability: 0.8,
        createdAt: 1712793600000,
        updatedAt: 1712797200000
      },
      sections: new Map([
        ['Key Points', '- Alice works on Chobits']
      ])
    };

    const markdown = renderNoteMarkdown(note);
    const parsed = parseFrontmatter(markdown);

    expect(parsed.frontmatter).not.toBeNull();
    expect(parsed.frontmatter).toMatchObject({
      id: note.frontmatter.id,
      workspaceId: note.frontmatter.workspaceId,
      date: note.frontmatter.date,
      domain: 'project:chobits',
      topics: ['Project Facts'],
      relatedTopicIds: ['topic_related_a', 'topic_related_b'],
      keywords: ['memory', 'graph', 'relations'],
      aliases: ['memory facts'],
      summary: 'Project memory facts.\nIncludes entity relations.',
      contradictions: [
        {
          old: 'Use local SQLite only',
          new: 'Use hybrid SQLite + FTS',
          type: 'decision_change',
          detectedAt: 1712795400000
        }
      ],
      sourceConversationIds: ['conv-1']
    });
    expect(parsed.frontmatter?.entities).toEqual(note.frontmatter.entities);
    expect(parsed.frontmatter?.timeRange).toEqual(note.frontmatter.timeRange);
    expect(parsed.frontmatter?.sourceMessageRange).toEqual(note.frontmatter.sourceMessageRange);
  });

  it('preserves existing entity relations when merge updates the same entity without new relations', async () => {
    const ctx: ExtractionContext = {
      chatFn: vi.fn(async () => ''),
      workspaceId: 'ws-1',
      workspaceRoot: 'F:\\Develop\\chobits',
      date: '2026-04-11'
    };

    const existingNote = {
      id: 'mem_existing',
      frontmatter: {
        id: 'mem_existing',
        version: 1,
        workspaceId: 'ws-1',
        date: '2026-04-11',
        topics: ['Project Facts'],
        domain: 'project:chobits',
        keywords: ['memory'],
        entities: [
          {
            name: 'Alice',
            type: 'person' as const,
            relations: [
              {
                predicate: 'works_on',
                object: 'Chobits',
                validFrom: '2026-04'
              }
            ]
          }
        ],
        summary: 'existing summary',
        sourceConversationIds: ['conv-1'],
        importance: 0.7,
        stability: 0.7,
        createdAt: 1712793600000,
        updatedAt: 1712793600000
      },
      sections: new Map([
        ['Key Points', '- Existing fact']
      ])
    };

    const extraction: MemoryExtractionOutput = {
      topicLabel: 'Project Facts',
      topicSlug: 'project-facts',
      summary: 'updated summary',
      importance: 0.75,
      stability: 0.72,
      keywords: ['memory', 'graph'],
      entities: [
        {
          name: 'Alice',
          type: 'person'
        }
      ],
      sections: {
        keyPoints: '- Updated fact'
      }
    };

    const merged = await mergeMemory(
      extraction,
      existingNote,
      ctx,
      ['conv-2'],
      [{ conversationId: 'conv-2', seqStart: 9, seqEnd: 12 }]
    );

    expect(merged.frontmatter.entities).toEqual([
      {
        name: 'Alice',
        type: 'person',
        relations: [
          {
            predicate: 'works_on',
            object: 'Chobits',
            validFrom: '2026-04'
          }
        ]
      }
    ]);
  });

  it('round-trips structured contradictions through markdown frontmatter', () => {
    const note: MergedNote = {
      action: 'create',
      noteId: 'mem_2026-04-12_conflict_ab12cd',
      filePath: 'memory/daily/2026/04/2026-04-12-conflict.md',
      frontmatter: {
        id: 'mem_2026-04-12_conflict_ab12cd',
        version: 2,
        workspaceId: 'ws-1',
        date: '2026-04-12',
        topics: ['Conflict Tracking'],
        keywords: ['memory', 'conflict', 'decision'],
        summary: 'Tracks contradiction state separately from canonical key points.',
        contradictions: [
          {
            old: 'Keep contradiction warnings inside Key Points',
            new: 'Move contradiction state into a dedicated section',
            type: 'decision_change',
            detectedAt: 1712887200000
          }
        ],
        sourceConversationIds: ['conv-9'],
        importance: 0.86,
        stability: 0.77,
        createdAt: 1712883600000,
        updatedAt: 1712887200000
      },
      sections: new Map([
        ['Key Points', '- Canonical key points stay clean'],
        ['Contradictions', '- [decision_change] old: "Keep contradiction warnings inside Key Points" -> new: "Move contradiction state into a dedicated section" (detected: 2024-04-12)']
      ])
    };

    const markdown = renderNoteMarkdown(note);
    const parsed = parseFrontmatter(markdown);

    expect(parsed.frontmatter?.contradictions).toEqual(note.frontmatter.contradictions);
    expect(markdown).toContain('## Contradictions');
  });

  it('persists note domain and relation facts during writeMemory', async () => {
    const workspaceRoot = await mkdtemp(path.join(os.tmpdir(), 'chobits-memory-'));
    tempDirs.push(workspaceRoot);

    const merged: MergedNote = {
      action: 'create',
      noteId: 'mem_2026-04-11_project-facts_ab12cd',
      filePath: 'memory/daily/2026/04/2026-04-11-project-facts.md',
      frontmatter: {
        id: 'mem_2026-04-11_project-facts_ab12cd',
        version: 1,
        workspaceId: 'ws-1',
        date: '2026-04-11',
        topics: ['Project Facts'],
        domain: 'project:chobits',
        keywords: ['memory', 'graph'],
        entities: [
          {
            name: 'Alice',
            type: 'person',
            relations: [
              {
                predicate: 'works_on',
                object: 'Chobits',
                validFrom: '2026-04'
              }
            ]
          }
        ],
        summary: 'Project memory facts.',
        sourceConversationIds: ['conv-1'],
        importance: 0.85,
        stability: 0.8,
        createdAt: 1712793600000,
        updatedAt: 1712797200000
      },
      sections: new Map([
        ['Key Points', '- Alice works on Chobits']
      ])
    };

    const upsertNote = vi.fn(async (note: any) => note);
    const rebuildSections = vi.fn(async () => []);
    const upsertTopic = vi.fn(async (topic: any) => topic);
    const upsertEdges = vi.fn(async (edges: any[]) => edges.length);
    const upsertKeywords = vi.fn(async () => 0);
    const rebuildFTS = vi.fn();
    const upsertEntityFact = vi.fn(async (fact: any) => fact);

    const dbOps: WriteDbOps = {
      upsertNote,
      rebuildSections,
      upsertTopic,
      upsertEdges,
      upsertKeywords,
      rebuildFTS,
      upsertEntityFact
    };

    await writeMemory(merged, { workspaceRoot }, dbOps);

    expect(upsertNote).toHaveBeenCalledTimes(1);
    expect(upsertNote.mock.calls[0][0]).toMatchObject({
      id: merged.noteId,
      domain: 'project:chobits'
    });

    expect(upsertEntityFact).toHaveBeenCalledWith(
      expect.objectContaining({
        subject: 'Alice',
        predicate: 'works_on',
        object: 'Chobits',
        evidenceNoteId: merged.noteId,
        workspaceId: 'ws-1',
        validFrom: expect.any(Number)
      })
    );

    const content = await readFile(path.join(workspaceRoot, merged.filePath), 'utf-8');
    const parsed = parseFrontmatter(content);

    expect(parsed.frontmatter?.domain).toBe('project:chobits');
    expect(parsed.frontmatter?.entities?.[0]?.relations).toEqual([
      {
        predicate: 'works_on',
        object: 'Chobits',
        validFrom: '2026-04'
      }
    ]);
  });
});
