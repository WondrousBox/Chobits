import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { createLlmQueryAnalyzerMock, searchWithContentMock } = vi.hoisted(() => ({
  createLlmQueryAnalyzerMock: vi.fn(() => undefined),
  searchWithContentMock: vi.fn()
}));

vi.mock('../packages/ai/services/memory-retrieval-service', () => ({
  createLlmQueryAnalyzer: createLlmQueryAnalyzerMock,
  searchWithContent: searchWithContentMock
}));

vi.mock('../electron/main/db/repositories', () => ({
  ChatRepo: {
    ensureConversation: vi.fn()
  },
  WorkspacesRepo: {
    getById: vi.fn(),
    getDefault: vi.fn()
  }
}));

import { initMemoryAutoRecallEnricher } from '../electron/main/handlers/memory/memory-auto-recall-enricher';
import { clearRecallCache, performAutoRecall } from '../packages/ai/services/memory-auto-recall';
import { preWarmEnrichers, resolveSystemPromptEnrichments, unregisterSystemPromptEnricher } from '../packages/ai/system-prompt-enricher';

const TRACE_PREFIX = '[MemoryTrace] ';

function parseTraceLines(lines: string[]): Array<Record<string, any>> {
  return lines
    .filter((line) => line.startsWith(TRACE_PREFIX))
    .map((line) => JSON.parse(line.slice(TRACE_PREFIX.length)));
}

describe('memory auto recall trace logging', () => {
  let logSpy: ReturnType<typeof vi.spyOn>;
  let warnSpy: ReturnType<typeof vi.spyOn>;
  let errorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    clearRecallCache();
    unregisterSystemPromptEnricher('memory-auto-recall');
    vi.clearAllMocks();

    searchWithContentMock.mockResolvedValue({
      context: '近期记忆：继续推进 Rust memory pipeline 项目',
      noteCount: 2,
      topicCount: 1
    });

    logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    unregisterSystemPromptEnricher('memory-auto-recall');
    logSpy.mockRestore();
    warnSpy.mockRestore();
    errorSpy.mockRestore();
  });

  it('emits structured trace logs for the rule-based recall search path', async () => {
    const result = await performAutoRecall(
      [
        {
          content: '请继续看看我们之前聊过的 Rust memory pipeline 项目',
          role: 'user'
        }
      ] as any,
      {
        config: { useLlmKeywords: false },
        db: {},
        getWorkspaceId: async () => 'ws-trace-1'
      },
      'conv-trace-1'
    );

    expect(result).toMatchObject({
      context: '近期记忆：继续推进 Rust memory pipeline 项目',
      noteCount: 2,
      skipped: false
    });

    const events = parseTraceLines(logSpy.mock.calls.map((call) => String(call[0])));
    const eventNames = events.map((event) => event.event);

    expect(eventNames).toEqual(
      expect.arrayContaining([
        'auto_recall.triage.proceed',
        'auto_recall.workspace.resolved',
        'auto_recall.keywords.rule.result',
        'auto_recall.search.start',
        'auto_recall.search.result'
      ])
    );

    expect(events.find((event) => event.event === 'auto_recall.search.start')).toMatchObject({
      conversationId: 'conv-tra',
      query: expect.stringContaining('Rust'),
      workspaceId: 'ws-trace'
    });
    expect(events.find((event) => event.event === 'auto_recall.search.result')).toMatchObject({
      contextChars: '近期记忆：继续推进 Rust memory pipeline 项目'.length,
      noteCount: 2,
      topicCount: 1
    });
  });

  it('logs the preWarm to resolve to inject timing points for system prompt recall', async () => {
    initMemoryAutoRecallEnricher({
      listRecentImportant: undefined
    } as any);

    const request = {
      conversationId: 'conv-trace-2',
      extras: {
        workspaceId: 'ws-trace-2'
      },
      messages: [
        {
          content: '还记得我们之前讨论过的 Rust memory pipeline 吗？',
          role: 'user'
        }
      ]
    } as any;

    preWarmEnrichers(request);
    const enrichments = await resolveSystemPromptEnrichments(request);

    expect(enrichments).toHaveLength(1);
    expect(enrichments[0]).toContain('<recalled_memories>');
    expect(enrichments[0]).toContain('Rust memory pipeline');

    const allLines = [
      ...logSpy.mock.calls.map((call) => String(call[0])),
      ...warnSpy.mock.calls.map((call) => String(call[0])),
      ...errorSpy.mock.calls.map((call) => String(call[0]))
    ];
    const events = parseTraceLines(allLines);
    const eventNames = events.map((event) => event.event);

    expect(eventNames).toEqual(
      expect.arrayContaining([
        'auto_recall.prewarm.start',
        'auto_recall.prefetch.registered',
        'auto_recall.resolve.start',
        'auto_recall.resolve.prefetch_awaited',
        'auto_recall.resolve.inject'
      ])
    );

    expect(events.find((event) => event.event === 'auto_recall.resolve.inject')).toMatchObject({
      conversationId: 'conv-tra',
      noteCount: 2
    });
  });
});
