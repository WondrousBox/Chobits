import { describe, expect, it, vi } from 'vitest';

import type { ConversationRouteMessage } from '../packages/ai/services/conversation-route-types';
import { extractProjectDelta, normalizeProjectDelta } from '../packages/ai/services/project-tracking-extractor';
import { normalizeProjectPrivacySettings } from '../packages/ai/services/project-tracking-service';
import type { ProjectSnapshot, TrackedProject } from '../packages/ai/services/project-tracking-types';

function project(overrides: Partial<TrackedProject> = {}): TrackedProject {
  return {
    aliases: [],
    archivedAt: null,
    completedAt: null,
    completionSummary: null,
    confidence: 1,
    createdAt: 1,
    createdBy: 'user',
    deletedAt: null,
    domains: [],
    goal: '完成项目跟踪记忆系统',
    id: 'project-1',
    memoryPromotionStatus: 'none',
    mergedIntoProjectId: null,
    metadata: null,
    name: '项目跟踪记忆',
    ownerUserId: null,
    privacySettings: normalizeProjectPrivacySettings({}),
    promotedMemoryNoteId: null,
    retrospective: null,
    scope: null,
    splitFromProjectId: null,
    startedAt: 1,
    status: 'active',
    stakeholders: [],
    summary: '跨会话项目跟踪',
    tags: [],
    targetEndAt: null,
    updatedAt: 1,
    workspaceId: 'workspace-1',
    ...overrides
  };
}

function snapshot(overrides: Partial<ProjectSnapshot> = {}): ProjectSnapshot {
  return {
    agreements: [],
    blockers: [],
    changes: [],
    completedMilestones: [],
    decisions: [],
    goal: '完成项目跟踪记忆系统',
    openTasks: [],
    projectId: 'project-1',
    recentProgress: [],
    risks: [],
    status: 'active',
    summary: '跨会话项目跟踪',
    upcomingDates: [],
    updatedAt: 1,
    version: 1,
    workspaceId: 'workspace-1',
    ...overrides
  };
}

function message(overrides: Partial<ConversationRouteMessage> & Pick<ConversationRouteMessage, 'content' | 'seq'>): ConversationRouteMessage {
  return {
    content: overrides.content,
    createdAt: overrides.createdAt ?? 1,
    id: overrides.id ?? `message-${overrides.seq}`,
    role: overrides.role ?? 'user',
    seq: overrides.seq
  };
}

describe('project tracking extractor LLM delta', () => {
  it('normalizes valid chatFn JSON into project delta events and milestones', async () => {
    const chatFn = vi.fn().mockResolvedValue(`{
      "events": [
        {
          "type": "task_progress",
          "title": "完成治理预检",
          "content": "治理 dry-run 已补齐",
          "status": "active",
          "importance": 0.8,
          "confidence": 0.9,
          "quality": "accepted",
          "sourceSeqStart": 4,
          "sourceSeqEnd": 5
        }
      ],
      "milestonePatches": [
        {
          "title": "R 阶段补齐",
          "description": "补齐治理和提醒",
          "status": "in_progress",
          "targetAt": 1783000000000
        }
      ]
    }`);

    const delta = await extractProjectDelta(
      {
        conversationId: 'conversation-1',
        messages: [message({ content: '继续补齐治理预检和提醒编辑', seq: 4 })],
        project: project(),
        snapshot: snapshot()
      },
      chatFn
    );

    expect(chatFn).toHaveBeenCalledOnce();
    expect(delta.events).toHaveLength(1);
    expect(delta.events[0]).toMatchObject({
      confidence: 0.9,
      content: '治理 dry-run 已补齐',
      quality: 'accepted',
      sourceConversationId: 'conversation-1',
      sourceSeqEnd: 5,
      sourceSeqStart: 4,
      title: '完成治理预检',
      type: 'task_progress'
    });
    expect(delta.milestonePatches).toEqual([
      {
        description: '补齐治理和提醒',
        evidenceEventIds: [],
        status: 'in_progress',
        targetAt: 1783000000000,
        title: 'R 阶段补齐'
      }
    ]);
  });

  it('forces high-risk LLM events into user confirmation unless explicitly accepted', () => {
    const delta = normalizeProjectDelta(
      {
        events: [
          {
            content: '决定默认不启用外部日历写入',
            sourceSeqEnd: 9,
            sourceSeqStart: 9,
            title: '外部日历策略',
            type: 'decision_made'
          },
          {
            content: '用户确认 deadline 变更',
            quality: 'accepted',
            sourceSeqEnd: 10,
            sourceSeqStart: 10,
            title: '截止时间变更',
            type: 'deadline_changed'
          }
        ]
      },
      {
        conversationId: 'conversation-1',
        messages: [message({ content: '确认策略', seq: 9 })],
        project: project()
      }
    );

    expect(delta.events[0]).toMatchObject({
      needsUserConfirmation: true,
      quality: 'draft',
      type: 'decision_made'
    });
    expect(delta.events[1]).toMatchObject({
      needsUserConfirmation: true,
      quality: 'accepted',
      type: 'deadline_changed'
    });
  });

  it('falls back to rule extraction when chatFn fails', async () => {
    const delta = await extractProjectDelta(
      {
        conversationId: 'conversation-1',
        messages: [message({ content: '接下来要补齐提醒编辑，deadline 可能延期', seq: 7 })],
        project: project()
      },
      vi.fn().mockRejectedValue(new Error('model unavailable'))
    );

    expect(delta.events.map((event) => event.type)).toContain('deadline_changed');
    expect(delta.events.map((event) => event.type)).toContain('risk_identified');
    expect(delta.events.every((event) => event.sourceSeqStart === 7 && event.sourceSeqEnd === 7)).toBe(true);
  });

  it('falls back to rules when chatFn returns no usable delta', async () => {
    const delta = await extractProjectDelta(
      {
        conversationId: 'conversation-1',
        messages: [message({ content: '已经完成 R2 提醒编辑', seq: 11 })],
        project: project()
      },
      vi.fn().mockResolvedValue('{"events":[],"milestonePatches":[]}')
    );

    expect(delta.events.some((event) => event.type === 'task_done' || event.type === 'task_progress')).toBe(true);
    expect(delta.events.every((event) => event.sourceConversationId === 'conversation-1')).toBe(true);
  });
});
