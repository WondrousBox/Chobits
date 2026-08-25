import { describe, expect, it, vi } from 'vitest';

import {
  analyzeQuery,
  clearMemorySearchCache,
  recallNotes,
  recallSections,
  recallTopics,
  search,
  type QueryAnalysisResult,
  type RetrievalDbDeps,
  type TopicRecallResult
} from '../../packages/ai/services/memory-retrieval-service';

function createAnalysis(overrides: Partial<QueryAnalysisResult> = {}): QueryAnalysisResult {
  return {
    topicTerms: [],
    entityTerms: [],
    keywordTerms: [],
    actionHint: 'general',
    originalQuery: 'test query',
    ...overrides
  };
}

function createNote(id: string, topics: string[], summary = `summary for ${id}`) {
  return {
    id,
    summary,
    date: '2026-04-11',
    importance: 0.8,
    stability: 0.7,
    topics: JSON.stringify(topics),
    keywords: JSON.stringify(['alpha', 'beta'])
  };
}

function createDb(overrides: Partial<RetrievalDbDeps> = {}): RetrievalDbDeps {
  return {
    searchTopics: vi.fn(async () => []),
    getTopicById: vi.fn(async () => undefined),
    listTopicChildren: vi.fn(async () => []),
    listTopicRoots: vi.fn(async () => []),
    findKeywordsByTopic: vi.fn(async () => []),
    findKeywordByCanonical: vi.fn(async () => undefined),
    findKeywordByAlias: vi.fn(async () => []),
    findAdjacentTopics: vi.fn(async () => []),
    findEdgesBySource: vi.fn(async () => []),
    queryEntityFacts: vi.fn(async () => []),
    findTopicsByDomain: vi.fn(async () => []),
    getNoteById: vi.fn(async () => undefined),
    listNotesByWorkspace: vi.fn(async () => []),
    listNotesByDateRange: vi.fn(async () => []),
    listNotesByTopicId: vi.fn(async () => []),
    searchNotesByTerms: vi.fn(async () => []),
    listSectionsByNote: vi.fn(async () => []),
    ftsSearch: vi.fn(() => []),
    getWorkspaceRoot: vi.fn(async () => null),
    listRecentImportant: vi.fn(async () => []),
    ...overrides
  };
}

describe('memory retrieval service entity fact recall', () => {
  it('dedupes repeated topic, keyword, domain, and entity-fact lookups on the hot path', async () => {
    const searchTopics = vi.fn(async (term: string) =>
      term === 'Runtime' ? [{ id: 'topic_runtime', label: 'Runtime', slug: 'runtime', heat: 0.92, noteCount: 1 }] : []
    );
    const findKeywordByCanonical = vi.fn(async (term: string) => (term === 'runtime' ? { primaryTopicId: 'topic_keyword' } : undefined));
    const findKeywordByAlias = vi.fn(async (term: string) => (term === 'runtime' ? [{ primaryTopicId: 'topic_keyword' }] : []));
    const getTopicById = vi.fn(async (id: string) =>
      id === 'topic_keyword' ? { id: 'topic_keyword', label: 'Runtime Keyword', slug: 'runtime-keyword', heat: 0.81, noteCount: 1 } : undefined
    );
    const findTopicsByDomain = vi.fn(async (domain: string) =>
      domain === 'person:Alice' ? [{ id: 'topic_person_alice', label: 'Alice', slug: 'alice', heat: 0.77, noteCount: 1 }] : []
    );
    const queryEntityFacts = vi.fn(async (entity: string) => (entity === 'Alice' ? [{ evidenceNoteId: 'note_fact_1' }] : []));

    const db = createDb({
      searchTopics,
      findKeywordByCanonical,
      findKeywordByAlias,
      getTopicById,
      findTopicsByDomain,
      queryEntityFacts
    });

    const result = await recallTopics(
      createAnalysis({
        topicTerms: ['Runtime', 'Runtime'],
        entityTerms: ['Alice', 'Alice'],
        keywordTerms: ['runtime', 'runtime']
      }),
      'ws-1',
      db
    );

    expect(searchTopics).toHaveBeenCalledTimes(2);
    expect(findKeywordByCanonical).toHaveBeenCalledTimes(1);
    expect(findKeywordByAlias).toHaveBeenCalledTimes(1);
    expect(getTopicById).toHaveBeenCalledTimes(1);
    expect(findTopicsByDomain).toHaveBeenCalledTimes(2);
    expect(queryEntityFacts).toHaveBeenCalledTimes(1);
    expect(result.allTopicIds).toEqual(expect.arrayContaining(['topic_runtime', 'topic_keyword', 'topic_person_alice']));
    expect(result.factNoteIds).toEqual(['note_fact_1']);
  });

  it('separates fact-derived note ids from topic expansion results', async () => {
    const db = createDb({
      queryEntityFacts: vi.fn(async () => [
        {
          evidenceNoteId: 'note_fact_1',
          evidenceSnippet: 'works_on',
          sourceId: 'Alice',
          targetId: 'ProjectX'
        }
      ])
    });

    const result = await recallTopics(createAnalysis({ entityTerms: ['Alice'] }), 'ws-1', db);

    expect(result.factNoteIds).toEqual(['note_fact_1']);
    expect(result.allTopicIds).toEqual([]);
    expect(result.expanded).toEqual([]);
  });

  it('recalls evidence notes directly from factNoteIds without routing them through listNotesByTopicId', async () => {
    const listNotesByTopicId = vi.fn(async () => []);
    const getNoteById = vi.fn(async (id: string) => (id === 'note_fact_1' ? createNote('note_fact_1', ['Project X']) : undefined));

    const db = createDb({
      getNoteById,
      listNotesByTopicId
    });

    const topicResult: TopicRecallResult = {
      directHits: [],
      expanded: [],
      factNoteIds: ['note_fact_1'],
      allTopicIds: []
    };

    const result = await recallNotes(createAnalysis({ entityTerms: ['Alice'] }), topicResult, 'ws-1', db, 10);

    expect(result.candidates).toHaveLength(1);
    expect(result.candidates[0]).toMatchObject({
      noteId: 'note_fact_1',
      graphScore: 0.9
    });
    expect(listNotesByTopicId).not.toHaveBeenCalled();
    expect(getNoteById).toHaveBeenCalledWith('note_fact_1');
  });

  it('merges topic-derived notes and fact-derived notes into one candidate set', async () => {
    const listNotesByTopicId = vi.fn(async (topicId: string) => (topicId === 'topic_project' ? [createNote('note_topic_1', ['Project'])] : []));
    const getNoteById = vi.fn(async (id: string) => (id === 'note_fact_1' ? createNote('note_fact_1', ['Alice']) : undefined));

    const db = createDb({
      getNoteById,
      listNotesByTopicId
    });

    const topicResult: TopicRecallResult = {
      directHits: [{ id: 'topic_project', label: 'Project', heat: 0.9, matchType: 'label' }],
      expanded: [],
      factNoteIds: ['note_fact_1'],
      allTopicIds: ['topic_project']
    };

    const result = await recallNotes(createAnalysis({ topicTerms: ['Project'], entityTerms: ['Alice'] }), topicResult, 'ws-1', db, 10);
    const noteIds = result.candidates.map((candidate) => candidate.noteId);

    expect(noteIds).toEqual(expect.arrayContaining(['note_topic_1', 'note_fact_1']));
    expect(result.totalFound).toBe(2);
  });

  it('uses batch note loading for fact and FTS-only candidates when available', async () => {
    const getNoteById = vi.fn(async () => undefined);
    const listNotesByIds = vi.fn(async (ids: string[]) =>
      ids.map((id) =>
        id === 'note_fact_1' ? createNote('note_fact_1', ['Alice']) : createNote('note_fts_1', ['Runtime'])
      )
    );

    const db = createDb({
      getNoteById,
      listNotesByIds,
      ftsSearch: vi.fn(() => [{ entry_id: 'note_fts_1', entry_type: 'note', note_id: 'note_fts_1', rank: -1 }])
    });

    const topicResult: TopicRecallResult = {
      directHits: [],
      expanded: [],
      factNoteIds: ['note_fact_1'],
      allTopicIds: []
    };

    const result = await recallNotes(createAnalysis({ entityTerms: ['Alice'], keywordTerms: ['runtime'] }), topicResult, 'ws-1', db, 10);

    expect(listNotesByIds).toHaveBeenCalledTimes(2);
    expect(getNoteById).not.toHaveBeenCalled();
    expect(result.candidates.map((candidate) => candidate.noteId)).toEqual(expect.arrayContaining(['note_fact_1', 'note_fts_1']));
  });
});

describe('memory retrieval service fallback coverage', () => {
  it('uses LIKE-based note search when FTS misses', async () => {
    const searchNotesByTerms = vi.fn(async () => [createNote('note_like_1', ['Runtime Memory'])]);
    const db = createDb({
      searchNotesByTerms,
      ftsSearch: vi.fn(() => [])
    });

    const result = await recallNotes(
      createAnalysis({
        topicTerms: ['Runtime'],
        keywordTerms: ['Runtime', 'config']
      }),
      {
        directHits: [],
        expanded: [],
        factNoteIds: [],
        allTopicIds: []
      },
      'ws-1',
      db,
      10
    );

    expect(searchNotesByTerms).toHaveBeenCalledWith(['Runtime', 'config'], 'ws-1', 20);
    expect(result.candidates).toHaveLength(1);
    expect(result.candidates[0]).toMatchObject({
      noteId: 'note_like_1',
      ftsScore: 0.6
    });
  });

  it('falls back to recent workspace notes on broad recall when no targeted candidates exist', async () => {
    const listNotesByWorkspace = vi.fn(async () => [createNote('note_recent_1', ['Recent Memory'])]);
    const db = createDb({
      listNotesByWorkspace,
      ftsSearch: vi.fn(() => [])
    });

    const result = await recallNotes(
      createAnalysis({
        broadRecall: true
      }),
      {
        directHits: [],
        expanded: [],
        factNoteIds: [],
        allTopicIds: []
      },
      'ws-1',
      db,
      5
    );

    expect(listNotesByWorkspace).toHaveBeenCalledWith('ws-1', 10, 0);
    expect(result.candidates).toHaveLength(1);
    expect(result.candidates[0]).toMatchObject({
      noteId: 'note_recent_1',
      metadataScore: 0.3
    });
  });
});

describe('memory retrieval quality optimization', () => {
  it('expands search terms for Chinese recall fallback and synonym-friendly matching', async () => {
    const searchNotesByTerms = vi.fn(async () => []);
    const db = createDb({
      searchNotesByTerms,
      ftsSearch: vi.fn(() => [])
    });

    await recallNotes(
      createAnalysis({
        keywordTerms: ['证据', '向量检索']
      }),
      {
        directHits: [],
        expanded: [],
        factNoteIds: [],
        allTopicIds: []
      },
      'ws-1',
      db,
      10
    );

    expect(searchNotesByTerms).toHaveBeenCalledWith(
      expect.arrayContaining(['证据', '原话', '引用', '摘录', '向量检索', '向量', '量检', '检索']),
      'ws-1',
      20
    );
  });

  it('prioritizes Source Excerpts for evidence-focused section recall', async () => {
    const db = createDb({
      listSectionsByNote: vi.fn(async () => [
        {
          id: 'sec_excerpt',
          noteId: 'note-1',
          heading: 'Source Excerpts',
          headingLevel: 2,
          summary: 'Original quoted evidence.',
          lineStart: 30,
          lineEnd: 36,
          charCount: 220
        },
        {
          id: 'sec_points',
          noteId: 'note-1',
          heading: 'Key Points',
          headingLevel: 2,
          summary: 'Canonical summary.',
          lineStart: 10,
          lineEnd: 16,
          charCount: 160
        }
      ])
    });

    const result = await recallSections(createAnalysis({ actionHint: 'evidence' }), ['note-1'], db, 10);

    expect(result).toHaveLength(2);
    expect(result[0]).toMatchObject({
      heading: 'Source Excerpts',
      matchType: 'action_hint',
      noteId: 'note-1'
    });
    expect(result[1]).toMatchObject({
      heading: 'Key Points',
      matchType: 'action_hint',
      noteId: 'note-1'
    });
  });

  it('uses batch section loading when available', async () => {
    const listSectionsByNote = vi.fn(async () => []);
    const listSectionsByNoteIds = vi.fn(async () => [
      {
        id: 'sec_excerpt',
        noteId: 'note-1',
        heading: 'Source Excerpts',
        headingLevel: 2,
        summary: 'Original quoted evidence.',
        lineStart: 30,
        lineEnd: 36,
        charCount: 220
      }
    ]);
    const db = createDb({
      listSectionsByNote,
      listSectionsByNoteIds
    });

    const result = await recallSections(createAnalysis({ actionHint: 'evidence' }), ['note-1'], db, 10);

    expect(listSectionsByNoteIds).toHaveBeenCalledWith(['note-1']);
    expect(listSectionsByNote).not.toHaveBeenCalled();
    expect(result[0]).toMatchObject({
      heading: 'Source Excerpts',
      noteId: 'note-1'
    });
  });
});

describe('memory retrieval scoring transparency', () => {
  it('returns debug score breakdowns and match reasons for ranked notes', async () => {
    const runtimeNote = createNote('note_runtime_1', ['Runtime'], 'runtime config decisions');
    const db = createDb({
      searchTopics: vi.fn(async (term: string) =>
        term.toLowerCase() === 'runtime'
          ? [{ id: 'topic_runtime', label: 'Runtime', slug: 'runtime', heat: 0.95, noteCount: 1, aliases: null, description: null }]
          : []
      ),
      listNotesByTopicId: vi.fn(async (topicId: string) => (topicId === 'topic_runtime' ? [runtimeNote] : [])),
      getNoteById: vi.fn(async (id: string) => (id === 'note_runtime_1' ? runtimeNote : undefined)),
      ftsSearch: vi.fn(() => [{ entry_id: 'note_runtime_1', entry_type: 'note', note_id: 'note_runtime_1', rank: -1 }])
    });

    const result = await search('Runtime config', 'ws-1', db, {
      maxResults: 5,
      debug: true
    });

    expect(result.debug).toBeDefined();
    expect(result.notes).toHaveLength(1);
    expect(result.notes[0].scoreBreakdown).toBeDefined();
    expect(result.debug?.weights).toMatchObject({
      fts: 0.35,
      graph: 0.25,
      metadata: 0,
      importance: 0.15,
      recency: 0.15,
      action: 0.1
    });
    expect(result.notes[0].scoreBreakdown?.matchReasons).toEqual(expect.arrayContaining(['topic:topic_runtime:direct', 'fts:note']));
    expect(result.debug?.noteRanking[0]).toMatchObject({
      rank: 1,
      noteId: 'note_runtime_1'
    });
    expect(result.debug?.noteRanking[0].scoreBreakdown.matchReasons).toEqual(expect.arrayContaining(['topic:topic_runtime:direct', 'fts:note']));
  });
});

describe('memory retrieval search cache', () => {
  it('reuses explicit search results for repeated identical queries', async () => {
    clearMemorySearchCache();

    const runtimeNote = createNote('note_runtime_1', ['Runtime'], 'runtime config decisions');
    const searchTopics = vi.fn(async (term: string) =>
      term.toLowerCase() === 'runtime'
        ? [{ id: 'topic_runtime', label: 'Runtime', slug: 'runtime', heat: 0.95, noteCount: 1, aliases: null, description: null }]
        : []
    );
    const listNotesByTopicId = vi.fn(async (topicId: string) => (topicId === 'topic_runtime' ? [runtimeNote] : []));
    const db = createDb({
      searchTopics,
      listNotesByTopicId,
      getNoteById: vi.fn(async (id: string) => (id === 'note_runtime_1' ? runtimeNote : undefined)),
      ftsSearch: vi.fn(() => [{ entry_id: 'note_runtime_1', entry_type: 'note', note_id: 'note_runtime_1', rank: -1 }])
    });

    const first = await search('Runtime config', 'ws-1', db, { maxResults: 5 });
    const second = await search('Runtime config', 'ws-1', db, { maxResults: 5 });

    expect(first).toEqual(second);
    expect(searchTopics).toHaveBeenCalledTimes(2);
    expect(listNotesByTopicId).toHaveBeenCalledTimes(1);
  });

  it('recomputes cached explicit search results after invalidation', async () => {
    clearMemorySearchCache();

    const searchTopics = vi.fn(async (term: string) =>
      term.toLowerCase() === 'runtime'
        ? [{ id: 'topic_runtime', label: 'Runtime', slug: 'runtime', heat: 0.95, noteCount: 1, aliases: null, description: null }]
        : []
    );
    const listNotesByTopicId = vi
      .fn(async () => [createNote('note_runtime_1', ['Runtime'], 'first result')])
      .mockImplementationOnce(async () => [createNote('note_runtime_1', ['Runtime'], 'first result')])
      .mockImplementationOnce(async () => [createNote('note_runtime_2', ['Runtime'], 'after invalidation')]);
    const getNoteById = vi
      .fn(async (id: string) =>
        id === 'note_runtime_1'
          ? createNote('note_runtime_1', ['Runtime'], 'first result')
          : id === 'note_runtime_2'
            ? createNote('note_runtime_2', ['Runtime'], 'after invalidation')
            : undefined
      );
    const db = createDb({
      searchTopics,
      listNotesByTopicId,
      getNoteById,
      ftsSearch: vi
        .fn(() => [{ entry_id: 'note_runtime_1', entry_type: 'note', note_id: 'note_runtime_1', rank: -1 }])
        .mockImplementationOnce(() => [{ entry_id: 'note_runtime_1', entry_type: 'note', note_id: 'note_runtime_1', rank: -1 }])
        .mockImplementationOnce(() => [{ entry_id: 'note_runtime_2', entry_type: 'note', note_id: 'note_runtime_2', rank: -1 }])
    });

    const first = await search('Runtime config', 'ws-1', db, { maxResults: 5 });
    clearMemorySearchCache('ws-1');
    const second = await search('Runtime config', 'ws-1', db, { maxResults: 5 });

    expect(first.notes[0]?.id).toBe('note_runtime_1');
    expect(second.notes[0]?.id).toBe('note_runtime_2');
    expect(searchTopics).toHaveBeenCalledTimes(4);
    expect(listNotesByTopicId).toHaveBeenCalledTimes(2);
  });
});

describe('memory retrieval contradiction recall', () => {
  it('parses contradiction-oriented queries into a contradiction action hint', () => {
    const analysis = analyzeQuery('我们之前这个决定有没有矛盾');

    expect(analysis.actionHint).toBe('contradiction');
  });

  it('prioritizes the Contradictions section for contradiction-focused recall', async () => {
    const db = createDb({
      listSectionsByNote: vi.fn(async () => [
        {
          id: 'sec_conflict',
          noteId: 'note-1',
          heading: 'Contradictions',
          headingLevel: 2,
          summary: 'Tracks the latest conflict.',
          lineStart: 20,
          lineEnd: 24,
          charCount: 180
        }
      ])
    });

    const result = await recallSections(createAnalysis({ actionHint: 'contradiction' }), ['note-1'], db, 10);

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      heading: 'Contradictions',
      matchType: 'action_hint',
      noteId: 'note-1'
    });
  });
});
