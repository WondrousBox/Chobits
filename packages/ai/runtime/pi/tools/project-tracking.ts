import type { ToolDefinition } from '@earendil-works/pi-coding-agent';
import { ProjectAuditLogRepo, ProjectEventRepo, ProjectGovernanceRepo, ProjectLinkRepo, ProjectMilestoneRepo, ProjectReminderLinkRepo, ProjectRepo, ProjectSnapshotRepo } from '@packages/common/db';
import { Type } from 'typebox';

import { buildProjectReminderSuggestions, generateProjectCompletionSummary } from '../../../services/project-tracking-service';
import type {
  ProjectEventQuality,
  ProjectEventReviewedBy,
  ProjectEventStatus,
  ProjectEventType,
  ProjectLinkRelationType,
  ProjectPrivacySettings,
  ProjectStatus
} from '../../../services/project-tracking-types';
import { resolveGuardedToolExecution } from '../skills';
import type { PiSessionToolContext } from '../tool-context';
import { resolveWorkspaceId } from './memory-db-deps';
import { createJsonToolResult } from './result';

const projectTrackingParameters = Type.Object({
  action: Type.Union(
    [
      Type.Literal('listProjects'),
      Type.Literal('searchProjects'),
      Type.Literal('getProject'),
      Type.Literal('getSnapshot'),
      Type.Literal('listEvents'),
      Type.Literal('addEvent'),
      Type.Literal('updateEvent'),
      Type.Literal('listMilestones'),
      Type.Literal('listAuditLogs'),
      Type.Literal('listReminderSuggestions'),
      Type.Literal('listReminderLinks'),
      Type.Literal('previewProjectImpact'),
      Type.Literal('inspectProjectOrphans'),
      Type.Literal('linkConversation'),
      Type.Literal('unlinkConversation'),
      Type.Literal('archiveProject'),
      Type.Literal('completeProject'),
      Type.Literal('reopenProject'),
      Type.Literal('generateCompletionSummary'),
      Type.Literal('exportProject'),
      Type.Literal('updatePrivacySettings'),
      Type.Literal('rebuildSnapshot')
    ],
    { description: '要执行的项目跟踪动作' }
  ),
  projectId: Type.Optional(Type.String({ description: '项目 ID' })),
  conversationId: Type.Optional(Type.String({ description: '会话 ID；不填时默认当前会话' })),
  query: Type.Optional(Type.String({ description: 'searchProjects 查询文本' })),
  limit: Type.Optional(Type.Number({ description: '最多返回数量，默认 20', minimum: 1, maximum: 100 })),
  status: Type.Optional(Type.String({ description: '项目或事件状态过滤/更新值' })),
  quality: Type.Optional(Type.String({ description: '事件质量状态：draft/accepted/rejected' })),
  needsUserConfirmation: Type.Optional(Type.Boolean({ description: '事件是否需要用户确认' })),
  reviewedBy: Type.Optional(Type.String({ description: '事件审核者：user/agent/system' })),
  type: Type.Optional(Type.String({ description: '事件类型过滤或新增事件类型' })),
  title: Type.Optional(Type.String({ description: '新增或更新事件标题' })),
  content: Type.Optional(Type.String({ description: '新增或更新事件内容' })),
  importance: Type.Optional(Type.Number({ description: '事件重要度 0-1', minimum: 0, maximum: 1 })),
  confidence: Type.Optional(Type.Number({ description: '事件置信度 0-1', minimum: 0, maximum: 1 })),
  dueAt: Type.Optional(Type.Number({ description: '事件截止时间毫秒时间戳' })),
  eventTime: Type.Optional(Type.Number({ description: '事件发生时间毫秒时间戳' })),
  eventId: Type.Optional(Type.String({ description: 'updateEvent 需要的事件 ID' })),
  relationType: Type.Optional(Type.String({ description: 'linkConversation 的关联类型，默认 related_context' })),
  completionSummary: Type.Optional(Type.String({ description: 'completeProject 的完成总结' })),
  retrospective: Type.Optional(Type.String({ description: 'completeProject 的复盘内容' })),
  allowAutoLinking: Type.Optional(Type.Boolean({ description: 'updatePrivacySettings：允许自动关联' })),
  allowPromptInjection: Type.Optional(Type.Boolean({ description: 'updatePrivacySettings：允许注入项目上下文' })),
  allowReminderSuggestions: Type.Optional(Type.Boolean({ description: 'updatePrivacySettings：允许提醒建议' })),
  allowLongTermMemoryPromotion: Type.Optional(Type.Boolean({ description: 'updatePrivacySettings：允许长期记忆晋升' })),
  sensitive: Type.Optional(Type.Boolean({ description: 'updatePrivacySettings：标记敏感项目' })),
  workspaceId: Type.Optional(Type.String({ description: 'workspace 限定；不填自动解析当前 workspace' }))
});

export function createPiProjectTrackingTool(toolContext: PiSessionToolContext): ToolDefinition<typeof projectTrackingParameters> {
  return {
    name: 'projectTrackingTool',
    label: 'projectTrackingTool',
    description:
      '查询和维护 Project Tracking Memory（项目跟踪记忆）：跨会话项目、项目快照、时间线事件、里程碑、会话关联。用户询问某个项目进展、下一步、关键时间点、协议/决策，或明确要求把当前对话关联到项目时使用。',
    parameters: projectTrackingParameters,

    async execute(toolCallId, input) {
      try {
        const workspaceId = input.workspaceId || (await resolveWorkspaceId(toolContext));
        if (!workspaceId) return createJsonToolResult({ success: false, error: 'No active workspace' });

        if (input.action === 'listProjects') {
          const projects = await ProjectRepo.list(workspaceId, {
            limit: input.limit,
            status: input.status ? ([input.status] as ProjectStatus[]) : ['active', 'paused']
          });
          return createJsonToolResult({ success: true, projects });
        }

        if (input.action === 'searchProjects') {
          const query = input.query?.trim();
          if (!query) return createJsonToolResult({ success: false, error: 'query is required', projects: [] });
          const projects = await ProjectRepo.search(workspaceId, query, input.limit);
          return createJsonToolResult({ success: true, projects });
        }

        if (input.action === 'getProject') {
          if (!input.projectId) return createJsonToolResult({ success: false, error: 'projectId is required' });
          const [project, snapshot, links, milestones] = await Promise.all([
            ProjectRepo.get(input.projectId),
            ProjectSnapshotRepo.get(input.projectId),
            ProjectLinkRepo.listByProject(input.projectId, input.limit ?? 100),
            ProjectMilestoneRepo.listByProject(input.projectId, input.limit ?? 100)
          ]);
          return createJsonToolResult({
            success: Boolean(project),
            project: project ?? null,
            snapshot: snapshot ?? null,
            links,
            milestones
          });
        }

        if (input.action === 'getSnapshot') {
          if (!input.projectId) return createJsonToolResult({ success: false, error: 'projectId is required' });
          return createJsonToolResult({
            success: true,
            snapshot: (await ProjectSnapshotRepo.get(input.projectId)) ?? null
          });
        }

        if (input.action === 'listEvents') {
          if (!input.projectId) return createJsonToolResult({ success: false, error: 'projectId is required', events: [] });
          const events = await ProjectEventRepo.listByProject(input.projectId, {
            limit: input.limit,
            quality: input.quality ? ([input.quality] as ProjectEventQuality[]) : undefined,
            status: input.status ? ([input.status] as ProjectEventStatus[]) : undefined,
            type: input.type ? ([input.type] as ProjectEventType[]) : undefined
          });
          return createJsonToolResult({ success: true, events });
        }

        if (input.action === 'listMilestones') {
          if (!input.projectId) return createJsonToolResult({ success: false, error: 'projectId is required', milestones: [] });
          const milestones = await ProjectMilestoneRepo.listByProject(input.projectId, input.limit);
          return createJsonToolResult({ success: true, milestones });
        }

        if (input.action === 'listAuditLogs') {
          if (!input.projectId) return createJsonToolResult({ success: false, error: 'projectId is required', auditLogs: [] });
          const auditLogs = await ProjectAuditLogRepo.listByProject(input.projectId, input.limit ?? 100);
          return createJsonToolResult({ success: true, auditLogs });
        }

        if (input.action === 'listReminderLinks') {
          if (!input.projectId) return createJsonToolResult({ success: false, error: 'projectId is required', reminderLinks: [] });
          const reminderLinks = await ProjectReminderLinkRepo.listByProject(input.projectId, input.limit ?? 100);
          return createJsonToolResult({ success: true, reminderLinks });
        }

        if (input.action === 'listReminderSuggestions') {
          if (!input.projectId) return createJsonToolResult({ success: false, error: 'projectId is required', suggestions: [] });
          const [project, snapshot, events, existing] = await Promise.all([
            ProjectRepo.get(input.projectId),
            ProjectSnapshotRepo.get(input.projectId),
            ProjectEventRepo.listByProject(input.projectId, { limit: 200 }),
            ProjectReminderLinkRepo.listByProject(input.projectId, 200)
          ]);
          if (!project) return createJsonToolResult({ success: false, error: 'project not found', suggestions: [] });
          const existingSourceEventIds = new Set(existing.map((link) => link.projectEventId).filter(Boolean));
          const suggestions = buildProjectReminderSuggestions({ events, project, snapshot }).filter((suggestion) => !suggestion.sourceEventId || !existingSourceEventIds.has(suggestion.sourceEventId));
          return createJsonToolResult({ success: true, suggestions });
        }

        if (input.action === 'previewProjectImpact') {
          if (!input.projectId) return createJsonToolResult({ success: false, error: 'projectId is required', preview: null });
          const preview = await ProjectGovernanceRepo.previewProjectImpact(input.projectId);
          return createJsonToolResult({ success: Boolean(preview), preview: preview ?? null });
        }

        if (input.action === 'inspectProjectOrphans') {
          if (!input.projectId) return createJsonToolResult({ success: false, error: 'projectId is required', report: null });
          const report = await ProjectGovernanceRepo.inspectProjectOrphans(input.projectId);
          return createJsonToolResult({
            note: 'Scheduler runtime orphan checks are available in the Project Center UI because they require the main process scheduler instance.',
            report: report ?? null,
            success: Boolean(report)
          });
        }

        if (input.action === 'addEvent') {
          const guarded = await resolveGuardedToolExecution(toolContext, toolCallId, 'project-tracking');
          if (guarded?.kind === 'blocked' || guarded?.kind === 'cancel') return createJsonToolResult(guarded.details);
          if (!input.projectId || !input.type || !input.title || !input.content) {
            return createJsonToolResult({ success: false, error: 'projectId, type, title and content are required' });
          }
          const event = await ProjectEventRepo.create({
            confidence: input.confidence,
            content: input.content,
            dueAt: input.dueAt ?? null,
            eventTime: input.eventTime ?? null,
            importance: input.importance,
            needsUserConfirmation: input.needsUserConfirmation ?? false,
            projectId: input.projectId,
            quality: (input.quality as ProjectEventQuality | undefined) ?? 'accepted',
            reviewedAt: Date.now(),
            reviewedBy: 'agent',
            sourceConversationId: input.conversationId || toolContext.conversationId || null,
            sourceSeqEnd: 0,
            sourceSeqStart: 0,
            title: input.title,
            type: input.type as ProjectEventType,
            workspaceId
          });
          const snapshot = await ProjectSnapshotRepo.recomputeFromEvents(event.projectId);
          return createJsonToolResult({ success: true, event, snapshot: snapshot ?? null, ...(guarded?.warning ? { warning: guarded.warning } : {}) });
        }

        if (input.action === 'updateEvent') {
          const guarded = await resolveGuardedToolExecution(toolContext, toolCallId, 'project-tracking');
          if (guarded?.kind === 'blocked' || guarded?.kind === 'cancel') return createJsonToolResult(guarded.details);
          if (!input.eventId) return createJsonToolResult({ success: false, error: 'eventId is required' });
          const event = await ProjectEventRepo.update(input.eventId, {
            confidence: input.confidence,
            content: input.content,
            importance: input.importance,
            needsUserConfirmation: input.needsUserConfirmation,
            quality: input.quality as ProjectEventQuality | undefined,
            reviewedAt: input.quality === 'accepted' || input.quality === 'rejected' ? Date.now() : undefined,
            reviewedBy: input.reviewedBy as ProjectEventReviewedBy | undefined,
            status: input.status as ProjectEventStatus | undefined,
            title: input.title
          });
          const snapshot = event ? await ProjectSnapshotRepo.recomputeFromEvents(event.projectId) : null;
          return createJsonToolResult({ success: Boolean(event), event: event ?? null, snapshot: snapshot ?? null, ...(guarded?.warning ? { warning: guarded.warning } : {}) });
        }

        if (input.action === 'linkConversation') {
          const guarded = await resolveGuardedToolExecution(toolContext, toolCallId, 'project-tracking');
          if (guarded?.kind === 'blocked' || guarded?.kind === 'cancel') return createJsonToolResult(guarded.details);
          const conversationId = input.conversationId || toolContext.conversationId;
          if (!input.projectId || !conversationId) return createJsonToolResult({ success: false, error: 'projectId and conversationId are required' });
          const link = await ProjectLinkRepo.upsert({
            confidence: input.confidence ?? 1,
            createdBy: 'agent',
            projectId: input.projectId,
            relationType: (input.relationType as ProjectLinkRelationType) || 'related_context',
            strength: input.importance ?? 1,
            targetId: conversationId,
            targetType: 'conversation',
            workspaceId
          });
          return createJsonToolResult({ success: true, link, ...(guarded?.warning ? { warning: guarded.warning } : {}) });
        }

        if (input.action === 'unlinkConversation') {
          const guarded = await resolveGuardedToolExecution(toolContext, toolCallId, 'project-tracking');
          if (guarded?.kind === 'blocked' || guarded?.kind === 'cancel') return createJsonToolResult(guarded.details);
          const conversationId = input.conversationId || toolContext.conversationId;
          if (!conversationId) return createJsonToolResult({ success: false, error: 'conversationId is required' });
          const removed = await ProjectLinkRepo.remove({
            projectId: input.projectId,
            targetId: conversationId,
            targetType: 'conversation',
            workspaceId
          });
          return createJsonToolResult({ success: true, removed, ...(guarded?.warning ? { warning: guarded.warning } : {}) });
        }

        if (input.action === 'archiveProject') {
          const guarded = await resolveGuardedToolExecution(toolContext, toolCallId, 'project-tracking');
          if (guarded?.kind === 'blocked' || guarded?.kind === 'cancel') return createJsonToolResult(guarded.details);
          if (!input.projectId) return createJsonToolResult({ success: false, error: 'projectId is required' });
          const project = await ProjectRepo.archive(input.projectId);
          return createJsonToolResult({ success: Boolean(project), project: project ?? null, ...(guarded?.warning ? { warning: guarded.warning } : {}) });
        }

        if (input.action === 'completeProject') {
          const guarded = await resolveGuardedToolExecution(toolContext, toolCallId, 'project-tracking');
          if (guarded?.kind === 'blocked' || guarded?.kind === 'cancel') return createJsonToolResult(guarded.details);
          if (!input.projectId) return createJsonToolResult({ success: false, error: 'projectId is required' });
          const project = await ProjectRepo.get(input.projectId);
          if (!project) return createJsonToolResult({ success: false, error: 'project not found' });
          const [events, milestones, snapshot] = await Promise.all([
            ProjectEventRepo.listByProject(input.projectId, { limit: 500 }),
            ProjectMilestoneRepo.listByProject(input.projectId, 500),
            ProjectSnapshotRepo.get(input.projectId)
          ]);
          const summary = input.completionSummary ?? generateProjectCompletionSummary({ events, milestones, project, snapshot });
          const completed = await ProjectRepo.markCompleted(input.projectId, summary, input.retrospective ?? summary);
          await ProjectAuditLogRepo.create({
            action: 'project_completed',
            actor: 'agent',
            after: completed,
            before: project,
            projectId: input.projectId,
            targetId: input.projectId,
            targetType: 'project',
            workspaceId: project.workspaceId
          });
          return createJsonToolResult({ success: Boolean(completed), project: completed ?? null, ...(guarded?.warning ? { warning: guarded.warning } : {}) });
        }

        if (input.action === 'reopenProject') {
          const guarded = await resolveGuardedToolExecution(toolContext, toolCallId, 'project-tracking');
          if (guarded?.kind === 'blocked' || guarded?.kind === 'cancel') return createJsonToolResult(guarded.details);
          if (!input.projectId) return createJsonToolResult({ success: false, error: 'projectId is required' });
          const project = await ProjectRepo.reopen(input.projectId);
          if (project) {
            await ProjectAuditLogRepo.create({
              action: 'project_reopened',
              actor: 'agent',
              projectId: input.projectId,
              targetId: input.projectId,
              targetType: 'project',
              workspaceId: project.workspaceId
            });
          }
          return createJsonToolResult({ success: Boolean(project), project: project ?? null, ...(guarded?.warning ? { warning: guarded.warning } : {}) });
        }

        if (input.action === 'generateCompletionSummary') {
          if (!input.projectId) return createJsonToolResult({ success: false, error: 'projectId is required' });
          const project = await ProjectRepo.get(input.projectId);
          if (!project) return createJsonToolResult({ success: false, error: 'project not found' });
          const [events, milestones, snapshot] = await Promise.all([
            ProjectEventRepo.listByProject(input.projectId, { limit: 500 }),
            ProjectMilestoneRepo.listByProject(input.projectId, 500),
            ProjectSnapshotRepo.get(input.projectId)
          ]);
          return createJsonToolResult({ success: true, summary: generateProjectCompletionSummary({ events, milestones, project, snapshot }) });
        }

        if (input.action === 'exportProject') {
          if (!input.projectId) return createJsonToolResult({ success: false, error: 'projectId is required' });
          const data = await ProjectGovernanceRepo.exportProject(input.projectId);
          if (data) {
            await ProjectAuditLogRepo.create({
              action: 'project_exported',
              actor: 'agent',
              projectId: input.projectId,
              targetId: input.projectId,
              targetType: 'project',
              workspaceId: data.project.workspaceId
            });
          }
          return createJsonToolResult({ success: Boolean(data), data: data ?? null });
        }

        if (input.action === 'updatePrivacySettings') {
          const guarded = await resolveGuardedToolExecution(toolContext, toolCallId, 'project-tracking');
          if (guarded?.kind === 'blocked' || guarded?.kind === 'cancel') return createJsonToolResult(guarded.details);
          if (!input.projectId) return createJsonToolResult({ success: false, error: 'projectId is required' });
          const patch: Partial<ProjectPrivacySettings> = {};
          if (typeof input.allowAutoLinking === 'boolean') patch.allowAutoLinking = input.allowAutoLinking;
          if (typeof input.allowPromptInjection === 'boolean') patch.allowPromptInjection = input.allowPromptInjection;
          if (typeof input.allowReminderSuggestions === 'boolean') patch.allowReminderSuggestions = input.allowReminderSuggestions;
          if (typeof input.allowLongTermMemoryPromotion === 'boolean') patch.allowLongTermMemoryPromotion = input.allowLongTermMemoryPromotion;
          if (typeof input.sensitive === 'boolean') patch.sensitive = input.sensitive;
          const before = await ProjectRepo.get(input.projectId);
          const project = await ProjectRepo.updatePrivacySettings(input.projectId, patch);
          if (project) {
            await ProjectAuditLogRepo.create({
              action: 'project_privacy_updated',
              actor: 'agent',
              after: project.privacySettings,
              before: before?.privacySettings,
              projectId: input.projectId,
              targetId: input.projectId,
              targetType: 'project',
              workspaceId: project.workspaceId
            });
          }
          return createJsonToolResult({ success: Boolean(project), project: project ?? null, ...(guarded?.warning ? { warning: guarded.warning } : {}) });
        }

        if (input.action === 'rebuildSnapshot') {
          if (!input.projectId) return createJsonToolResult({ success: false, error: 'projectId is required' });
          const snapshot = await ProjectSnapshotRepo.recomputeFromEvents(input.projectId);
          return createJsonToolResult({ success: Boolean(snapshot), snapshot: snapshot ?? null });
        }

        return createJsonToolResult({ success: false, error: `Unknown action: ${input.action}` });
      } catch (error: any) {
        return createJsonToolResult({
          success: false,
          error: error?.message || 'projectTrackingTool failed'
        });
      }
    }
  };
}
