import { describe, expect, it, vi } from 'vitest';

import { extractConversationRouteDelta } from '../../packages/ai/services/conversation-route-extractor';
import {
  createEmptyConversationRouteSnapshot,
  formatConversationRouteSnapshotForPrompt,
  materializeDeltaEvents,
  reduceConversationRouteSnapshot
} from '../../packages/ai/services/conversation-route-service';

describe('conversation route memory service', () => {
  it('normalizes llm delta, materializes events, and reduces a snapshot', async () => {
    const chatFn = vi.fn(async () =>
      [
        '```json',
        '{',
        '  "events": [',
        '    {"type":"user_goal","title":"设计会话线路记忆","content":"用户希望为每个会话维护可查询的线路记忆。","seqStart":3,"seqEnd":3,"importance":0.9,"confidence":0.92},',
        '    {"type":"task_added","title":"实现 MVP","content":"新增表、worker、enricher、tool 和 UI。","seqStart":4,"seqEnd":5,"importance":0.82,"confidence":0.8}',
        '  ],',
        '  "snapshotPatch": {',
        '    "currentGoal": "实现 Conversation Route Memory MVP",',
        '    "currentTopic": "会话线路记忆",',
        '    "keyClues": ["线路要像文字游戏任务日志一样逐步建立"],',
        '    "summary": "正在落地会话级线路记忆。"',
        '  }',
        '}',
        '```'
      ].join('\n')
    );

    const previous = createEmptyConversationRouteSnapshot({
      conversationId: 'conv-route-test',
      now: 1000,
      workspaceId: 'ws-1'
    });

    const delta = await extractConversationRouteDelta(
      {
        conversationId: 'conv-route-test',
        messages: [
          { content: '我希望有一个会话级的记忆。', role: 'user', seq: 3 },
          { content: '我会先设计文档，再实现 MVP。', role: 'assistant', seq: 4 },
          { content: '定一个 goal 来实现吧。', role: 'user', seq: 5 }
        ],
        snapshot: previous,
        workspaceId: 'ws-1'
      },
      chatFn
    );

    const eventDrafts = materializeDeltaEvents({
      conversationId: 'conv-route-test',
      delta,
      maxSeq: 5,
      minSeq: 3,
      now: 2000,
      workspaceId: 'ws-1'
    });

    expect(eventDrafts).toHaveLength(2);
    expect(eventDrafts[0]).toMatchObject({
      type: 'user_goal',
      seqStart: 3,
      seqEnd: 3,
      importance: 0.9
    });

    const insertedEvents = eventDrafts.map((event, index) => ({
      id: `event-${index + 1}`,
      ...event
    }));

    const snapshot = reduceConversationRouteSnapshot({
      conversationId: 'conv-route-test',
      delta,
      newEvents: insertedEvents,
      now: 3000,
      previous,
      targetSeq: 5,
      workspaceId: 'ws-1'
    });

    expect(snapshot).toMatchObject({
      conversationId: 'conv-route-test',
      currentGoal: '实现 Conversation Route Memory MVP',
      currentTopic: '会话线路记忆',
      lastProcessedSeq: 5,
      version: 2
    });
    expect(snapshot.openTasks.map((task) => task.title)).toContain('实现 MVP');
    expect(snapshot.keyClues).toContain('线路要像文字游戏任务日志一样逐步建立');

    const injection = formatConversationRouteSnapshotForPrompt(snapshot, 500);
    expect(injection).toContain('<conversation_route>');
    expect(injection).toContain('当前目标: 实现 Conversation Route Memory MVP');
    expect(injection.length).toBeLessThanOrEqual(620);
  });

  it('falls back to rule-based extraction when no chat function is provided', async () => {
    const delta = await extractConversationRouteDelta({
      conversationId: 'conv-rule',
      messages: [
        {
          content: '我认为还需要一个会话级的记忆，并且先开始设计一个文档。',
          role: 'user',
          seq: 7
        }
      ]
    });

    expect(delta.events.length).toBeGreaterThan(0);
    expect(delta.events.map((event) => event.type)).toEqual(expect.arrayContaining(['user_goal', 'task_added', 'user_correction']));
    expect(delta.snapshotPatch.keyClues?.[0]).toContain('会话级的记忆');
  });

  it('does not create rule-based route events for low-value small talk', async () => {
    const delta = await extractConversationRouteDelta({
      conversationId: 'conv-small-talk',
      messages: [
        {
          content: '哈哈这个挺有意思的，谢谢你。',
          role: 'user',
          seq: 9
        }
      ]
    });

    expect(delta).toEqual({ events: [], snapshotPatch: {} });
  });

  it('caps oversized llm delta output before snapshot reduction', async () => {
    const longText = '这是一个会在长会话中反复累积并导致线路快照膨胀的冗长内容。'.repeat(20);
    const chatFn = vi.fn(async () =>
      JSON.stringify({
        events: Array.from({ length: 8 }, (_, index) => ({
          confidence: 0.8,
          content: longText,
          importance: 0.8,
          seqEnd: 2,
          seqStart: 2,
          tags: ['route', 'delta', 'overflow', 'extra'],
          title: `过长事件标题-${index}-${longText}`,
          type: 'key_clue'
        })),
        snapshotPatch: {
          activeThreads: [longText, longText, longText, longText],
          currentGoal: longText,
          keyClues: [longText, longText, longText, longText],
          nextSuggestedFocus: longText,
          summary: longText
        }
      })
    );

    const delta = await extractConversationRouteDelta(
      {
        conversationId: 'conv-cap',
        messages: [{ content: '继续优化会话线路记忆，重点控制增量输出大小。', role: 'user', seq: 2 }]
      },
      chatFn
    );

    expect(delta.events).toHaveLength(4);
    expect(delta.events[0].title?.length).toBeLessThanOrEqual(48);
    expect(delta.events[0].content?.length).toBeLessThanOrEqual(160);
    expect(delta.events[0].tags).toHaveLength(3);
    expect(delta.snapshotPatch.activeThreads).toHaveLength(3);
    expect(delta.snapshotPatch.activeThreads?.[0].length).toBeLessThanOrEqual(80);
    expect(delta.snapshotPatch.currentGoal?.length).toBeLessThanOrEqual(120);
    expect(delta.snapshotPatch.summary?.length).toBeLessThanOrEqual(180);
  });

  it('keeps resolved task events out of open tasks when recomputing a snapshot', () => {
    const previous = createEmptyConversationRouteSnapshot({
      conversationId: 'conv-resolved-task',
      now: 1000
    });

    const snapshot = reduceConversationRouteSnapshot({
      conversationId: 'conv-resolved-task',
      delta: { events: [], snapshotPatch: {} },
      existingEvents: [
        {
          confidence: 0.9,
          content: '实现会话线路状态同步。',
          conversationId: 'conv-resolved-task',
          createdAt: 2000,
          id: 'task-1',
          importance: 0.8,
          metadata: null,
          promotedMemoryNoteId: null,
          relatedEventIds: [],
          resolvesEventIds: [],
          seqEnd: 2,
          seqStart: 2,
          status: 'resolved',
          supersedesEventIds: [],
          tags: [],
          title: '同步事件状态到 snapshot',
          type: 'task_added',
          updatedAt: 3000,
          workspaceId: null
        }
      ],
      newEvents: [],
      now: 4000,
      previous: {
        ...previous,
        lastProcessedSeq: 2,
        openTasks: [{ eventId: 'task-1', status: 'active', title: '同步事件状态到 snapshot' }]
      },
      targetSeq: 2
    });

    expect(snapshot.openTasks).toEqual([]);
    expect(snapshot.resolvedTasks).toEqual([{ eventId: 'task-1', status: 'resolved', title: '同步事件状态到 snapshot' }]);
  });

  it('can rebuild a snapshot from active events without preserving stale previous lists', () => {
    const previous = {
      ...createEmptyConversationRouteSnapshot({
        conversationId: 'conv-rebuild-clean',
        now: 1000
      }),
      keyClues: ['已经废弃的旧线索'],
      userCorrections: ['已经取代的旧纠正'],
      summary: '旧摘要'
    };

    const snapshot = reduceConversationRouteSnapshot({
      conversationId: 'conv-rebuild-clean',
      delta: { events: [], snapshotPatch: {} },
      existingEvents: [
        {
          confidence: 0.9,
          content: '新的有效线索。',
          conversationId: 'conv-rebuild-clean',
          createdAt: 2000,
          id: 'clue-active',
          importance: 0.8,
          metadata: null,
          promotedMemoryNoteId: null,
          relatedEventIds: [],
          resolvesEventIds: [],
          seqEnd: 3,
          seqStart: 3,
          status: 'active',
          supersedesEventIds: [],
          tags: [],
          title: '新的有效线索',
          type: 'key_clue',
          updatedAt: 2000,
          workspaceId: null
        },
        {
          confidence: 0.8,
          content: '已经废弃的旧线索。',
          conversationId: 'conv-rebuild-clean',
          createdAt: 1500,
          id: 'clue-abandoned',
          importance: 0.7,
          metadata: null,
          promotedMemoryNoteId: null,
          relatedEventIds: [],
          resolvesEventIds: [],
          seqEnd: 2,
          seqStart: 2,
          status: 'abandoned',
          supersedesEventIds: [],
          tags: [],
          title: '已经废弃的旧线索',
          type: 'key_clue',
          updatedAt: 2500,
          workspaceId: null
        }
      ],
      newEvents: [],
      now: 3000,
      preservePreviousSnapshot: false,
      previous,
      targetSeq: 3
    });

    expect(snapshot.keyClues).toEqual(['新的有效线索']);
    expect(snapshot.userCorrections).toEqual([]);
    expect(snapshot.summary).toBe('新的有效线索');
  });
});
