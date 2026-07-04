import { createPiTaskChatRuntimeFromRequest, type PiTaskChatFunction } from '../../../../packages/ai/runtime/pi/task-chat';
import { buildNonReasoningTaskRuntimeRequest, resolveNonReasoningTaskModel } from '../../../../packages/ai/runtime/pi/task-model-policy';
import type { ConversationRouteMessage } from '../../../../packages/ai/services/conversation-route-types';
import type { AgentLoopCompletePayload } from '../../../../packages/ai/services/memory-types';
import { extractProjectDelta } from '../../../../packages/ai/services/project-tracking-extractor';
import { matchProjectsForConversation } from '../../../../packages/ai/services/project-tracking-matcher';
import { isHighRiskProjectEventType } from '../../../../packages/ai/services/project-tracking-service';
import { detectProjectSignalWithLlm, getProjectSignalDiagnostics, type ProjectSignalChatFn } from '../../../../packages/ai/services/project-tracking-signal';
import type { ProjectTrackingConfig } from '../../../../packages/ai/services/project-tracking-types';
import { createManagedTaskChatFn, LONG_TASK_CHAT_TIMEOUTS } from '../../../../packages/ai/services/task-chat-runner';
import { eventManager } from '../../../../packages/event';
import { AppEvent } from '../../../../packages/event/events';
import { ConversationRouteSnapshotRepo } from '../../db/conversation-route-repositories';
import { ProjectCandidateRepo, ProjectEventRepo, ProjectLinkRepo, ProjectMilestoneRepo, ProjectRepo, ProjectSnapshotRepo } from '../../db/project-tracking-repositories';
import { ChatRepo, WorkspacesRepo } from '../../db/repositories';
import { getProjectTrackingConfig } from './project-tracking-config';

const TAG = '[ProjectTrackingWorker]';
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
const runningConversations = new Set<string>();
const trailingConversations = new Map<string, AgentLoopCompletePayload>();
const COMPLEX_DELTA_TERMS = ['会议纪要', '纪要', '评审', '协议', '决策', '决定', '变更', '调整', '延期', '取消', '范围', '里程碑', '风险', '阻塞', 'deadline'];

function adaptProjectSignalChatFn(piChatFn: PiTaskChatFunction): ProjectSignalChatFn {
  return createManagedTaskChatFn(piChatFn, {
    tag: '[ProjectSignalTaskChat]',
    timeouts: {
      ...LONG_TASK_CHAT_TIMEOUTS,
      firstActivityTimeoutMs: 45_000,
      maxTimeoutMs: 90_000,
      streamIdleTimeoutMs: 45_000
    }
  });
}

function shouldSkip(payload: AgentLoopCompletePayload): string | null {
  const config = getProjectTrackingConfig();
  if (!config.enabled) return 'disabled';
  if (!payload.conversationId) return 'no_conversation_id';
  if (!payload.persisted) return 'not_persisted';
  if (payload.agentId && INTERNAL_AGENT_IDS.has(payload.agentId)) return 'internal_agent';
  return null;
}

async function processProjectTracking(payload: AgentLoopCompletePayload): Promise<void> {
  const skipReason = shouldSkip(payload);
  if (skipReason) {
    if (skipReason !== 'disabled') console.log(`${TAG} skipped: ${skipReason}`);
    return;
  }

  const conversationId = payload.conversationId;
  if (runningConversations.has(conversationId)) {
    trailingConversations.set(conversationId, payload);
    return;
  }

  runningConversations.add(conversationId);
  try {
    await runOnce(payload);
  } finally {
    runningConversations.delete(conversationId);
    const trailing = trailingConversations.get(conversationId);
    if (trailing) {
      trailingConversations.delete(conversationId);
      setTimeout(() => {
        processProjectTracking(trailing).catch((error) => console.warn(`${TAG} trailing run failed:`, error));
      }, 250);
    }
  }
}

async function runOnce(payload: AgentLoopCompletePayload): Promise<void> {
  const conversationId = payload.conversationId;
  const workspaceId = await resolveWorkspaceId(conversationId);
  if (!workspaceId) {
    console.log(`${TAG} skipped: no_workspace conversation=${conversationId}`);
    return;
  }

  const config = getProjectTrackingConfig();
  const routeSnapshot = await ConversationRouteSnapshotRepo.get(conversationId).catch(() => undefined);
  const afterSeq = Math.max(0, (routeSnapshot?.lastProcessedSeq ?? 0) - 20);
  const rows = await ChatRepo.listMessagesAfterSeq(conversationId, afterSeq, 80);
  const messages: ConversationRouteMessage[] = rows
    .filter((message: any) => message.role === 'user' || message.role === 'assistant')
    .map((message: any) => ({
      content: message.content,
      createdAt: message.createdAt,
      role: message.role,
      seq: message.seq ?? 0
    }));
  if (!messages.length) return;

  const links = await ProjectLinkRepo.listByTarget({
    limit: 5,
    targetId: conversationId,
    targetType: 'conversation',
    workspaceId
  });
  if (links.length > 0) {
    console.log(`${TAG} linked conversation detected: conversation=${conversationId} projects=${links.length}`);
    await materializeLinkedProjectDeltas({
      conversationId,
      messages,
      projectIds: [...new Set(links.map((link) => link.projectId))],
      routeSnapshot,
      workspaceId
    });
    return;
  }

  if (config.autoLinkEnabled) {
    const linked = await tryAutoLinkExistingProject({
      conversationId,
      messages,
      routeSnapshot,
      workspaceId
    });
    if (linked) return;
  }

  if (!config.autoDetectEnabled) {
    console.log(`${TAG} auto-detect disabled: conversation=${conversationId}`);
    return;
  }

  const existing = await ProjectCandidateRepo.list(workspaceId, {
    conversationId,
    limit: 1,
    status: ['pending']
  });
  if (existing.length > 0) {
    console.log(`${TAG} pending candidate exists: candidate=${existing[0].id} conversation=${conversationId}`);
    return;
  }

  const signalResult = await detectProjectSignalWithLlm(
    {
      conversationId,
      messages,
      routeSnapshot,
      workspaceId
    },
    () => createProjectSignalChatFn(payload)
  );
  const decision = signalResult.decision;
  const diagnostics = getProjectSignalDiagnostics({
    conversationId,
    messages,
    routeSnapshot,
    workspaceId
  });
  console.log(
    `${TAG} signal checked: conversation=${conversationId} source=${signalResult.source}${signalResult.error ? ` error="${signalResult.error}"` : ''} score=${decision.signalScore} create=${decision.shouldCreateCandidate} reasons=${decision.reasons.join(',') || '-'} ` +
    `userMessages=${diagnostics.userMessageCount} userChars=${diagnostics.userChars} latest="${diagnostics.latestUserPreview}" ` +
    `explicitTerms=${diagnostics.matchedExplicitTerms.join('|') || '-'} explicitPatterns=${diagnostics.matchedExplicitPatterns.join('|') || '-'} ` +
    `projectTerms=${diagnostics.matchedProjectTerms.join('|') || '-'} taskTerms=${diagnostics.matchedTaskTerms.join('|') || '-'} ` +
    `timeTerms=${diagnostics.matchedTimeTerms.join('|') || '-'} agreementTerms=${diagnostics.matchedAgreementTerms.join('|') || '-'} ` +
    `routeGoal=${diagnostics.routeHasCurrentGoal} routeTasks=${diagnostics.routeOpenTaskCount}`
  );
  if (!decision.shouldCreateCandidate || !decision.candidate) return;

  const minSeq = Math.min(...messages.map((message) => message.seq));
  const maxSeq = Math.max(...messages.map((message) => message.seq));
  const candidate = await ProjectCandidateRepo.create({
    confirmedProjectId: null,
    conversationId,
    evidenceMessageIds: decision.candidate.evidenceMessageIds,
    evidenceSummary: decision.candidate.evidenceSummary,
    expiresAt: Date.now() + 7 * 24 * 60 * 60 * 1000,
    proposedGoal: decision.candidate.proposedGoal,
    proposedName: decision.candidate.proposedName,
    reasons: decision.reasons,
    seqEnd: maxSeq,
    seqStart: minSeq,
    signalScore: decision.signalScore,
    status: 'pending',
    suggestedMilestones: decision.candidate.suggestedMilestones,
    suggestedReminders: decision.candidate.suggestedReminders,
    workspaceId
  });
  console.log(`${TAG} candidate created: ${candidate.id} score=${candidate.signalScore} conversation=${conversationId}`);
  eventManager.emit(AppEvent.PROJECT_CANDIDATE_CREATED, {
    candidateId: candidate.id,
    conversationId,
    workspaceId
  });
}

async function createProjectSignalChatFn(payload: AgentLoopCompletePayload): Promise<ProjectSignalChatFn | undefined> {
  const conversation = await ChatRepo.getConversation(payload.conversationId).catch(() => undefined);
  const providerId = payload.providerId || conversation?.providerId;
  if (!providerId) return undefined;

  try {
    const fastModel = resolveNonReasoningTaskModel(providerId);
    const runtime = await createPiTaskChatRuntimeFromRequest(
      buildNonReasoningTaskRuntimeRequest({
        agentId: 'project-tracking',
        extras: {
          usage: {
            feature: 'project_tracking',
            operationKey: 'project_candidate_detect',
            sourceType: 'project'
          }
        },
        maxTokens: 900,
        ...(fastModel ? { model: fastModel } : {}),
        providerId,
        providerPresetId: payload.providerPresetId || conversation?.providerPresetId || undefined,
        temperature: 0
      })
    );
    return adaptProjectSignalChatFn(runtime.chatFn);
  } catch (error) {
    console.warn(`${TAG} LLM project signal disabled for this run:`, error instanceof Error ? error.message : error);
    return undefined;
  }
}

async function materializeLinkedProjectDeltas(input: {
  conversationId: string;
  messages: ConversationRouteMessage[];
  projectIds: string[];
  routeSnapshot?: Awaited<ReturnType<typeof ConversationRouteSnapshotRepo.get>>;
  workspaceId: string;
}): Promise<void> {
  for (const projectId of input.projectIds) {
    const project = await ProjectRepo.get(projectId).catch(() => undefined);
    if (!project || project.status === 'archived' || project.status === 'rejected') continue;

    const existingEvents = await ProjectEventRepo.listByProject(projectId, { limit: 200 }).catch(() => []);
    const lastProcessedSeq = existingEvents
      .filter((event) => event.sourceConversationId === input.conversationId)
      .reduce((max, event) => Math.max(max, event.sourceSeqEnd ?? event.sourceSeqStart ?? 0), 0);
    const newMessages = input.messages.filter((message) => message.seq > lastProcessedSeq);
    if (!newMessages.length) continue;

    const snapshot = await ProjectSnapshotRepo.get(projectId).catch(() => undefined);
    const deltaInput = {
      conversationId: input.conversationId,
      messages: newMessages,
      project,
      routeSnapshot: input.routeSnapshot,
      snapshot
    };
    const delta = await extractProjectDelta(deltaInput, await createProjectDeltaChatFnIfEnabled(getProjectTrackingConfig(), newMessages));
    if (!delta.events.length && !delta.milestonePatches.length) continue;

    let createdEvents = 0;
    for (const event of delta.events) {
      await ProjectEventRepo.create({
        ...event,
        needsUserConfirmation: event.needsUserConfirmation ?? isHighRiskProjectEventType(event.type),
        projectId,
        quality: event.quality ?? 'draft',
        workspaceId: input.workspaceId
      });
      createdEvents += 1;
    }

    for (const milestone of delta.milestonePatches) {
      await ProjectMilestoneRepo.create({
        description: milestone.description,
        evidenceEventIds: milestone.evidenceEventIds,
        projectId,
        status: milestone.status,
        targetAt: milestone.targetAt,
        title: milestone.title,
        workspaceId: input.workspaceId
      });
    }

    await ProjectSnapshotRepo.recomputeFromEvents(projectId);
    console.log(`${TAG} project delta materialized: project=${projectId} events=${createdEvents} conversation=${input.conversationId}`);
  }
}

async function createProjectDeltaChatFnIfEnabled(
  config: ProjectTrackingConfig,
  messages: ConversationRouteMessage[]
): Promise<((prompt: string, signal?: AbortSignal) => Promise<string>) | undefined> {
  const llm = config.llmProjectDelta;
  if (!llm?.enabled || !llm.providerId) return undefined;
  if (!shouldUseLlmProjectDelta(config, messages)) return undefined;

  try {
    const runtime = await createPiTaskChatRuntimeFromRequest({
      agentId: 'project-tracking',
      extras: {
        usage: {
          feature: 'project_tracking',
          operationKey: 'project_delta_extract',
          sourceType: 'project'
        }
      },
      maxTokens: llm.maxTokens,
      model: llm.model,
      providerId: llm.providerId,
      providerPresetId: llm.providerPresetId,
      temperature: llm.temperature
    });
    return async (prompt, signal) => {
      let text = '';
      let completedText = '';
      let streamError: Error | undefined;
      await runtime.chatFn(
        prompt,
        (event) => {
          if (event.type === 'delta') {
            text += event.data.text;
          } else if (event.type === 'message_completed') {
            completedText = event.data?.text || completedText;
          } else if (event.type === 'error') {
            streamError = new Error(event.data.message || 'Project delta LLM failed');
          }
        },
        signal
      );
      if (streamError) throw streamError;
      return completedText || text;
    };
  } catch (error) {
    console.warn(`${TAG} LLM project delta disabled for this run:`, error instanceof Error ? error.message : error);
    return undefined;
  }
}

function shouldUseLlmProjectDelta(config: ProjectTrackingConfig, messages: ConversationRouteMessage[]): boolean {
  const llm = config.llmProjectDelta;
  if (!llm?.enabled) return false;
  const totalChars = messages.reduce((sum, message) => sum + message.content.trim().length, 0);
  if (messages.length >= (llm.minMessages ?? 4) || totalChars >= (llm.minMessageChars ?? 600)) return true;
  const joined = messages
    .map((message) => message.content)
    .join('\n')
    .toLowerCase();
  return COMPLEX_DELTA_TERMS.some((term) => joined.includes(term.toLowerCase()));
}

async function tryAutoLinkExistingProject(input: {
  conversationId: string;
  messages: ConversationRouteMessage[];
  routeSnapshot?: Awaited<ReturnType<typeof ConversationRouteSnapshotRepo.get>>;
  workspaceId: string;
}): Promise<boolean> {
  const projects = await ProjectRepo.list(input.workspaceId, {
    limit: 30,
    status: ['active', 'paused']
  }).catch(() => []);
  if (!projects.length) return false;

  const snapshots = await Promise.all(projects.map((project) => ProjectSnapshotRepo.get(project.id).catch(() => undefined)));
  const matches = matchProjectsForConversation({
    messages: input.messages,
    projects: projects.map((project, index) => ({
      project,
      snapshot: snapshots[index]
    })),
    routeSnapshot: input.routeSnapshot
  });
  const top = matches[0];
  if (!top?.shouldAutoLink) return false;

  await ProjectLinkRepo.upsert({
    confidence: top.score,
    createdBy: 'agent',
    projectId: top.projectId,
    relationType: 'related_context',
    strength: top.score,
    targetId: input.conversationId,
    targetType: 'conversation',
    workspaceId: input.workspaceId
  });
  console.log(`${TAG} conversation auto-linked: conversation=${input.conversationId} project=${top.projectId} score=${top.score}`);
  await materializeLinkedProjectDeltas({
    conversationId: input.conversationId,
    messages: input.messages,
    projectIds: [top.projectId],
    routeSnapshot: input.routeSnapshot,
    workspaceId: input.workspaceId
  });
  return true;
}

async function resolveWorkspaceId(conversationId: string): Promise<string | undefined> {
  const conversation = await ChatRepo.getConversation(conversationId).catch(() => undefined);
  if (conversation?.workspaceId) return conversation.workspaceId;
  return (await WorkspacesRepo.getDefault())?.id;
}

export function initProjectTrackingWorker(): void {
  eventManager.on(AppEvent.AGENT_LOOP_COMPLETE, (payload: AgentLoopCompletePayload) => {
    processProjectTracking(payload).catch((error) => {
      console.warn(`${TAG} handler failed:`, error instanceof Error ? error.message : error);
    });
  });

  console.log(`${TAG} initialized`);
}
