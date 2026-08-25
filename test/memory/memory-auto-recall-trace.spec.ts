import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { analyzeQueryMock, createLlmQueryAnalyzerMock, searchWithContentMock } = vi.hoisted(() => ({
  analyzeQueryMock: vi.fn((query: string) => ({
    topicTerms: query ? [query] : [],
    entityTerms: [],
    keywordTerms: query ? [query] : [],
    actionHint: 'general',
    originalQuery: query
  })),
  createLlmQueryAnalyzerMock: vi.fn(() => undefined),
  searchWithContentMock: vi.fn()
}));

vi.mock('../../packages/ai/services/memory-retrieval-service', () => ({
  analyzeQuery: analyzeQueryMock,
  createLlmQueryAnalyzer: createLlmQueryAnalyzerMock,
  searchWithContent: searchWithContentMock
}));

vi.mock('../../electron/main/db/repositories', () => ({
  ChatRepo: {
    ensureConversation: vi.fn()
  },
  WorkspacesRepo: {
    getById: vi.fn(),
    getDefault: vi.fn()
  }
}));

import { initMemoryAutoRecallEnricher } from '../../electron/main/handlers/memory/memory-auto-recall-enricher';
import { clearCriticalFactsCache, clearRecallCache, performAutoRecall } from '../../packages/ai/services/memory-auto-recall';
import { preWarmEnrichers, resolveSystemPromptEnrichments, unregisterSystemPromptEnricher } from '../../packages/ai/system-prompt-enricher';

const TRACE_PREFIX = '[MemoryTrace] ';
const tempDirs: string[] = [];

function parseTraceLines(lines: string[]): Array<Record<string, any>> {
  return lines.filter((line) => line.startsWith(TRACE_PREFIX)).map((line) => JSON.parse(line.slice(TRACE_PREFIX.length)));
}

describe('memory auto recall trace logging', () => {
  let logSpy: ReturnType<typeof vi.spyOn>;
  let warnSpy: ReturnType<typeof vi.spyOn>;
  let errorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    clearCriticalFactsCache();
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

  afterEach(async () => {
    clearCriticalFactsCache();
    await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
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
      expect.arrayContaining(['auto_recall.triage.proceed', 'auto_recall.workspace.resolved', 'auto_recall.keywords.rule.result', 'auto_recall.search.start', 'auto_recall.search.result'])
    );

    expect(events.find((event) => event.event === 'auto_recall.search.start')).toMatchObject({
      conversationId: 'conv-tra',
      query: expect.stringContaining('Rust'),
      workspaceId: 'ws-trace'
    });
    expect(searchWithContentMock).toHaveBeenCalledWith(
      expect.any(String),
      'ws-trace-1',
      expect.anything(),
      expect.any(Number),
      expect.objectContaining({
        analysis: expect.objectContaining({
          topicTerms: expect.any(Array),
          keywordTerms: expect.any(Array)
        })
      })
    );
    expect(createLlmQueryAnalyzerMock).not.toHaveBeenCalled();
    expect(events.find((event) => event.event === 'auto_recall.search.result')).toMatchObject({
      contextChars: '近期记忆：继续推进 Rust memory pipeline 项目'.length,
      noteCount: 2,
      topicCount: 1
    });
  });

  it('emits usage events for llm keyword extraction during auto recall', async () => {
    const onUsageEvent = vi.fn();
    const chatFn = vi.fn(async () => '{"needsRecall":true,"reasoning":"needs memory","keywords":["Rust","pipeline"]}') as any;

    let consumed = false;
    chatFn.consumeLastInvocation = () => {
      if (consumed) {
        return undefined;
      }
      consumed = true;
      return {
        completedAt: 200,
        rawUsage: { completion_tokens: 6, prompt_tokens: 18, total_tokens: 24 },
        startedAt: 100,
        status: 'completed',
        usage: {
          inputTokens: 18,
          outputTokens: 6,
          totalTokens: 24
        }
      };
    };

    const result = await performAutoRecall(
      [
        {
          content: '还记得我们之前讨论过的 Rust pipeline 设计吗？',
          role: 'user'
        }
      ] as any,
      {
        chatFn,
        db: {},
        getWorkspaceId: async () => 'ws-trace-usage',
        onUsageEvent
      },
      'conv-trace-usage'
    );

    expect(result).toMatchObject({
      keywords: ['Rust', 'pipeline'],
      noteCount: 2,
      skipped: false
    });

    expect(onUsageEvent).toHaveBeenCalledTimes(1);
    expect(onUsageEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        operationKey: 'keyword_extraction',
        status: 'completed',
        usageStage: 'analyze',
        usage: expect.objectContaining({
          inputTokens: 18,
          outputTokens: 6,
          totalTokens: 24
        }),
        metadata: expect.objectContaining({
          conversationId: 'conv-trace-usage',
          memoryRecallMode: 'auto',
          recentContextChars: expect.any(Number),
          userMessageChars: expect.any(Number)
        })
      })
    );
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

    const allLines = [...logSpy.mock.calls.map((call) => String(call[0])), ...warnSpy.mock.calls.map((call) => String(call[0])), ...errorSpy.mock.calls.map((call) => String(call[0]))];
    const events = parseTraceLines(allLines);
    const eventNames = events.map((event) => event.event);

    expect(eventNames).toEqual(
      expect.arrayContaining(['auto_recall.prewarm.start', 'auto_recall.prefetch.registered', 'auto_recall.resolve.start', 'auto_recall.resolve.prefetch_awaited', 'auto_recall.resolve.inject'])
    );

    expect(events.find((event) => event.event === 'auto_recall.resolve.inject')).toMatchObject({
      conversationId: 'conv-tra',
      noteCount: 2
    });
  });

  it('preloads the structured always-loaded MEMORY.md sections on a new session', async () => {
    const workspaceRoot = await mkdtemp(path.join(os.tmpdir(), 'chobits-auto-recall-always-loaded-'));
    tempDirs.push(workspaceRoot);

    await mkdir(path.join(workspaceRoot, 'memory'), { recursive: true });
    await writeFile(
      path.join(workspaceRoot, 'memory', 'MEMORY.md'),
      [
        '# Long-term Memory',
        '',
        '## Critical Facts',
        '',
        '- [decision] Keep extraction thresholds runtime-configured',
        '',
        '## User Preferences',
        '',
        '- Runtime Memory / Worker: Prefer runtime-configured thresholds over hardcoded defaults',
        '',
        '## Active Projects',
        '',
        '- Runtime Memory: Monitor extraction worker stability Next: Add cleanup regression tests'
      ].join('\n'),
      'utf-8'
    );

    const result = await performAutoRecall(
      [
        {
          content: 'What should we keep in mind before we continue the runtime memory work?',
          role: 'user'
        }
      ] as any,
      {
        config: { useLlmKeywords: false },
        db: {
          getWorkspaceRoot: async () => workspaceRoot,
          listRecentImportant: vi.fn(async () => [])
        } as any,
        getWorkspaceId: async () => 'ws-trace-3'
      },
      'conv-trace-3'
    );

    expect(result).toMatchObject({
      noteCount: 0,
      skipped: false
    });
    expect(result.context).toContain('## Critical Facts');
    expect(result.context).toContain('## User Preferences');
    expect(result.context).toContain('## Active Projects');
    expect(result.context).toContain('Prefer runtime-configured thresholds over hardcoded defaults');
    expect(result.context).toContain('Monitor extraction worker stability');
    expect(searchWithContentMock).not.toHaveBeenCalled();
  });
});
