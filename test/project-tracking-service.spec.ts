import { describe, expect, it } from 'vitest';

import {
  buildProjectReminderSuggestions,
  generateProjectCompletionSummary,
  getDefaultProjectEventQuality,
  isHighRiskProjectEventType,
  normalizeProjectPrivacySettings,
  reduceProjectSnapshotFromEvents
} from '../packages/ai/services/project-tracking-service';
import type { ProjectEvent, ProjectMilestone, ProjectSnapshot, TrackedProject } from '../packages/ai/services/project-tracking-types';

function event(overrides: Partial<ProjectEvent> & Pick<ProjectEvent, 'id' | 'quality' | 'status' | 'title' | 'type'>): ProjectEvent {
  return {
    confidence: 0.8,
    content: overrides.content ?? overrides.title,
    createdAt: overrides.createdAt ?? 1,
    dueAt: overrides.dueAt ?? null,
    eventTime: overrides.eventTime ?? null,
    id: overrides.id,
    importance: overrides.importance ?? 0.7,
    metadata: null,
    needsUserConfirmation: overrides.needsUserConfirmation ?? false,
    projectId: 'project-1',
    quality: overrides.quality,
    relatedEventIds: [],
    reviewedAt: overrides.reviewedAt ?? null,
    reviewedBy: overrides.reviewedBy ?? null,
    sourceConversationId: null,
    sourceMemoryNoteIds: [],
    sourceRouteEventIds: [],
    sourceSeqEnd: null,
    sourceSeqStart: null,
    status: overrides.status,
    supersedesEventIds: [],
    title: overrides.title,
    type: overrides.type,
    updatedAt: overrides.updatedAt ?? overrides.createdAt ?? 1,
    workspaceId: 'workspace-1'
  };
}

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
    privacySettings: normalizeProjectPrivacySettings(overrides.privacySettings),
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

function milestone(overrides: Partial<ProjectMilestone> & Pick<ProjectMilestone, 'id' | 'status' | 'title'>): ProjectMilestone {
  return {
    completedAt: overrides.status === 'done' ? 10 : null,
    createdAt: 1,
    description: null,
    evidenceEventIds: [],
    id: overrides.id,
    projectId: 'project-1',
    status: overrides.status,
    targetAt: null,
    title: overrides.title,
    updatedAt: 1,
    workspaceId: 'workspace-1',
    ...overrides
  };
}

describe('project tracking quality gates', () => {
  it('marks high-risk automatic project events as draft', () => {
    expect(isHighRiskProjectEventType('decision_made')).toBe(true);
    expect(getDefaultProjectEventQuality({ createdBy: 'system', type: 'decision_made' })).toBe('draft');
  });

  it('marks explicit user or agent events as accepted when they do not need confirmation', () => {
    expect(getDefaultProjectEventQuality({ createdBy: 'user', type: 'task_added' })).toBe('accepted');
    expect(getDefaultProjectEventQuality({ createdBy: 'agent', type: 'task_progress' })).toBe('accepted');
  });

  it('does not include draft or rejected events in snapshots', () => {
    const snapshot = reduceProjectSnapshotFromEvents({
      events: [
        event({ id: 'draft-task', quality: 'draft', status: 'active', title: '自动抽取的待办', type: 'task_added' }),
        event({ id: 'rejected-decision', quality: 'rejected', status: 'active', title: '被拒绝的决策', type: 'decision_made' }),
        event({ id: 'accepted-task', quality: 'accepted', status: 'active', title: '确认后的待办', type: 'task_added' }),
        event({ id: 'accepted-decision', quality: 'accepted', status: 'active', title: '确认后的决策', type: 'decision_made' })
      ],
      goal: '实现项目跟踪质量门控',
      now: 100,
      projectId: 'project-1',
      status: 'active',
      summary: '项目跟踪',
      workspaceId: 'workspace-1'
    });

    expect(snapshot.openTasks.map((task) => task.title)).toEqual(['确认后的待办']);
    expect(snapshot.decisions).toEqual(['确认后的决策']);
  });
});

describe('project tracking phase B-G helpers', () => {
  it('normalizes missing project privacy settings to conservative defaults', () => {
    expect(normalizeProjectPrivacySettings({ sensitive: true })).toEqual({
      allowAutoLinking: true,
      allowLongTermMemoryPromotion: true,
      allowPromptInjection: true,
      allowReminderSuggestions: true,
      sensitive: true
    });
  });

  it('builds reminder suggestions from accepted future deadlines and meetings', () => {
    const now = 1_000;
    const suggestions = buildProjectReminderSuggestions({
      events: [
        event({ dueAt: now + 10_000, id: 'deadline', quality: 'accepted', status: 'active', title: '完成方案评审', type: 'deadline_changed' }),
        event({ eventTime: now + 20_000, id: 'meeting', quality: 'accepted', status: 'active', title: '项目同步会', type: 'meeting_scheduled' }),
        event({ dueAt: now + 30_000, id: 'draft', quality: 'draft', status: 'active', title: '草稿截止时间', type: 'deadline_changed' })
      ],
      now,
      project: project()
    });

    expect(suggestions.map((item) => item.kind)).toEqual(['deadline', 'meeting']);
    expect(suggestions.map((item) => item.title)).toEqual(['完成方案评审', '项目同步会']);
  });

  it('does not suggest reminders when the project disallows suggestions or is inactive', () => {
    const futureDeadline = event({ dueAt: 10_000, id: 'deadline', quality: 'accepted', status: 'active', title: '完成方案评审', type: 'deadline_changed' });

    expect(
      buildProjectReminderSuggestions({
        events: [futureDeadline],
        now: 1_000,
        project: project({ privacySettings: normalizeProjectPrivacySettings({ allowReminderSuggestions: false }) })
      })
    ).toEqual([]);

    expect(
      buildProjectReminderSuggestions({
        events: [futureDeadline],
        now: 1_000,
        project: project({ status: 'completed' })
      })
    ).toEqual([]);
  });

  it('generates a completion summary from accepted events, milestones and open tasks', () => {
    const summary = generateProjectCompletionSummary({
      events: [
        event({ id: 'done', quality: 'accepted', status: 'resolved', title: '完成 Phase B-G 能力面', type: 'task_done' }),
        event({ id: 'decision', quality: 'accepted', status: 'active', title: '采用审计日志记录治理操作', type: 'decision_made' }),
        event({ id: 'draft', quality: 'draft', status: 'active', title: '不应进入总结', type: 'task_done' })
      ],
      milestones: [milestone({ id: 'm1', status: 'done', title: 'Project Center 上线' })],
      project: project(),
      snapshot: snapshot({
        openTasks: [{ eventId: 'task-left', status: 'active', title: '补充外部日历连接器' }]
      })
    });

    expect(summary).toContain('项目：项目跟踪记忆');
    expect(summary).toContain('- Project Center 上线');
    expect(summary).toContain('- 完成 Phase B-G 能力面');
    expect(summary).toContain('- 采用审计日志记录治理操作');
    expect(summary).toContain('- 补充外部日历连接器');
    expect(summary).not.toContain('不应进入总结');
  });
});
