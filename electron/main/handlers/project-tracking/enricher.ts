import type { ConversationRouteMessage } from '../../../../packages/ai/services/conversation-route-types';
import { matchProjectsForConversation } from '../../../../packages/ai/services/project-tracking-matcher';
import { formatProjectSnapshotForPrompt } from '../../../../packages/ai/services/project-tracking-service';
import type { ProjectSnapshot } from '../../../../packages/ai/services/project-tracking-types';
import { registerSystemPromptEnricher } from '../../../../packages/ai/system-prompt-enricher';
import type { ChatRequest } from '../../../../packages/ai/types';
import { ConversationRouteSnapshotRepo } from '../../db/conversation-route-repositories';
import { ProjectLinkRepo, ProjectRepo, ProjectSnapshotRepo } from '../../db/project-tracking-repositories';
import { ChatRepo, WorkspacesRepo } from '../../db/repositories';
import { getProjectTrackingConfig } from './project-tracking-config';

const TAG = '[ProjectTrackingEnricher]';
const INTERNAL_AGENT_IDS = new Set([
  'project-tracking',
  'conversation-route',
  'memory-extraction',
  'memory-auto-recall',
  'memory-recall-cue-backfill',
  'title-generation',
  'user-persona-check',
  'user-persona-update'
]);

function shouldSkip(request: ChatRequest): string | null {
  const config = getProjectTrackingConfig();
  if (!config.enabled || !config.promptInjectionEnabled) return 'disabled';
  if (request.persist === false) return 'not_persisted';
  if (!request.conversationId) return 'no_conversation_id';
  if (request.agentId && INTERNAL_AGENT_IDS.has(request.agentId)) return 'internal_agent';
  return null;
}

async function resolveWorkspaceId(request: ChatRequest): Promise<string | undefined> {
  if (request.extras?.workspaceId) return request.extras.workspaceId;
  if (request.conversationId) {
    const conversation = await ChatRepo.getConversation(request.conversationId).catch(() => undefined);
    if (conversation?.workspaceId) return conversation.workspaceId;
  }
  return (await WorkspacesRepo.getDefault())?.id;
}

function isActiveProjectSnapshot(snapshot: ProjectSnapshot | undefined): snapshot is ProjectSnapshot {
  return !!snapshot && snapshot.status === 'active';
}

function requestMessagesToRouteMessages(request: ChatRequest): ConversationRouteMessage[] {
  return (request.messages || [])
    .filter((message) => message.role === 'user' || message.role === 'assistant')
    .map((message, index) => ({
      content: message.content,
      createdAt: message.createdAt,
      role: message.role as 'user' | 'assistant',
      seq: index + 1
    }));
}

export function initProjectTrackingEnricher(): void {
  registerSystemPromptEnricher({
    id: 'project-context',
    resolve: async ({ request }) => {
      const skipReason = shouldSkip(request);
      if (skipReason) return null;

      try {
        const workspaceId = await resolveWorkspaceId(request);
        if (!workspaceId) return null;
        const config = getProjectTrackingConfig();
        const links = await ProjectLinkRepo.listByTarget({
          limit: 2,
          targetId: request.conversationId!,
          targetType: 'conversation',
          workspaceId
        });
        let snapshots = (await Promise.all(links.map((link) => ProjectSnapshotRepo.get(link.projectId).catch(() => undefined)))).filter(isActiveProjectSnapshot);
        if (!snapshots.length && config.autoLinkEnabled) {
          const projects = await ProjectRepo.list(workspaceId, { limit: 30, status: ['active', 'paused'] });
          const projectSnapshots = await Promise.all(projects.map((project) => ProjectSnapshotRepo.get(project.id).catch(() => undefined)));
          const routeSnapshot = await ConversationRouteSnapshotRepo.get(request.conversationId!).catch(() => undefined);
          const matches = matchProjectsForConversation({
            messages: requestMessagesToRouteMessages(request),
            projects: projects.map((project, index) => ({ project, snapshot: projectSnapshots[index] })),
            routeSnapshot
          });
          const top = matches[0];
          if (top?.shouldAutoLink) {
            await ProjectLinkRepo.upsert({
              confidence: top.score,
              createdBy: 'agent',
              projectId: top.projectId,
              relationType: 'related_context',
              strength: top.score,
              targetId: request.conversationId!,
              targetType: 'conversation',
              workspaceId
            });
            const matchedSnapshot = await ProjectSnapshotRepo.get(top.projectId).catch(() => undefined);
            snapshots = matchedSnapshot ? [matchedSnapshot].filter(isActiveProjectSnapshot) : [];
          }
        }
        if (!snapshots.length) return null;
        const segment = formatProjectSnapshotForPrompt(snapshots[0]);
        if (!segment.trim()) return null;
        console.log(`${TAG} injecting project snapshot ${snapshots[0].projectId}: ${segment.length} chars`);
        return segment;
      } catch (error) {
        console.warn(`${TAG} failed:`, error instanceof Error ? error.message : error);
        return null;
      }
    }
  });

  console.log(`${TAG} registered`);
}
