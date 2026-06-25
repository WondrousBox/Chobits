import { createPiTaskChatRuntimeFromRequest, type PiTaskChatFunction } from '../../../../packages/ai/runtime/pi/task-chat';
import { buildNonReasoningTaskRuntimeRequest, resolveNonReasoningTaskModel } from '../../../../packages/ai/runtime/pi/task-model-policy';
import { extractConversationRouteDelta } from '../../../../packages/ai/services/conversation-route-extractor';
import {
  createEmptyConversationRouteSnapshot,
  materializeDeltaEvents,
  reduceConversationRouteSnapshot
} from '../../../../packages/ai/services/conversation-route-service';
import type { ConversationRouteChatFn, ConversationRouteMessage } from '../../../../packages/ai/services/conversation-route-types';
import type { AgentLoopCompletePayload } from '../../../../packages/ai/services/memory-types';
import { createManagedTaskChatFn, LONG_TASK_CHAT_TIMEOUTS } from '../../../../packages/ai/services/task-chat-runner';
import { eventManager } from '../../../../packages/event';
import { AppEvent } from '../../../../packages/event/events';
import { ConversationRouteEventRepo, ConversationRouteSnapshotRepo } from '../../db/conversation-route-repositories';
import { ChatRepo, WorkspacesRepo } from '../../db/repositories';

const TAG = '[ConversationRouteWorker]';
const INTERNAL_AGENT_IDS = new Set([
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

function adaptChatFn(piChatFn: PiTaskChatFunction): ConversationRouteChatFn {
  return createManagedTaskChatFn(piChatFn, {
    tag: '[ConversationRouteTaskChat]',
    timeouts: {
      ...LONG_TASK_CHAT_TIMEOUTS,
      maxTimeoutMs: 3 * 60 * 1000
    }
  });
}

function shouldSkip(payload: AgentLoopCompletePayload): string | null {
  if (!payload.conversationId) return 'no_conversation_id';
  if (!payload.persisted) return 'not_persisted';
  if (payload.agentId && INTERNAL_AGENT_IDS.has(payload.agentId)) return 'internal_agent';
  return null;
}

async function resolveWorkspaceId(conversationId: string): Promise<string | undefined> {
  const conv = await ChatRepo.ensureConversation({ id: conversationId });
  if (conv?.workspaceId) return conv.workspaceId;
  const ws = await WorkspacesRepo.getDefault();
  return ws?.id;
}

async function createRouteChatFn(payload: AgentLoopCompletePayload): Promise<ConversationRouteChatFn | undefined> {
  const conversation = await ChatRepo.getConversation(payload.conversationId).catch(() => undefined);
  const providerId = payload.providerId || conversation?.providerId;
  if (!providerId) return undefined;

  const fastModel = resolveNonReasoningTaskModel(providerId);
  const runtime = await createPiTaskChatRuntimeFromRequest(
    buildNonReasoningTaskRuntimeRequest({
      providerId,
      providerPresetId: payload.providerPresetId || conversation?.providerPresetId || undefined,
      agentId: 'conversation-route',
      maxTokens: 1200,
      ...(fastModel ? { model: fastModel } : {})
    })
  );
  return adaptChatFn(runtime.chatFn);
}

async function processConversationRoute(payload: AgentLoopCompletePayload): Promise<void> {
  const skipReason = shouldSkip(payload);
  if (skipReason) {
    console.log(`${TAG} skipped: ${skipReason}`);
    return;
  }

  const conversationId = payload.conversationId;
  if (runningConversations.has(conversationId)) {
    trailingConversations.set(conversationId, payload);
    console.log(`${TAG} coalesced trailing run for ${conversationId}`);
    return;
  }

  runningConversations.add(conversationId);
  try {
    await runOnce(payload);
  } catch (error) {
    console.warn(`${TAG} failed for ${conversationId}:`, error instanceof Error ? error.message : error);
  } finally {
    runningConversations.delete(conversationId);
    const trailing = trailingConversations.get(conversationId);
    if (trailing) {
      trailingConversations.delete(conversationId);
      setTimeout(() => {
        processConversationRoute(trailing).catch((error) => console.warn(`${TAG} trailing run failed:`, error));
      }, 250);
    }
  }
}

async function runOnce(payload: AgentLoopCompletePayload): Promise<void> {
  const conversationId = payload.conversationId;
  const workspaceId = await resolveWorkspaceId(conversationId);
  const now = Date.now();
  const previousSnapshot =
    (await ConversationRouteSnapshotRepo.get(conversationId)) ??
    createEmptyConversationRouteSnapshot({
      conversationId,
      workspaceId,
      now
    });

  const rows = await ChatRepo.listMessages(conversationId, 2000, 0);
  const newMessages: ConversationRouteMessage[] = rows
    .filter((message: any) => (message.role === 'user' || message.role === 'assistant') && (message.seq ?? 0) > previousSnapshot.lastProcessedSeq)
    .map((message: any) => ({
      content: message.content,
      createdAt: message.createdAt,
      role: message.role,
      seq: message.seq ?? 0
    }));

  if (!newMessages.length) {
    console.log(`${TAG} no new messages for ${conversationId}`);
    return;
  }

  const minSeq = Math.min(...newMessages.map((message) => message.seq));
  const maxSeq = Math.max(...newMessages.map((message) => message.seq));
  const chatFn = await createRouteChatFn(payload).catch((error) => {
    console.warn(`${TAG} route LLM unavailable, using rules:`, error instanceof Error ? error.message : error);
    return undefined;
  });

  const delta = await extractConversationRouteDelta(
    {
      conversationId,
      messages: newMessages,
      snapshot: previousSnapshot,
      workspaceId
    },
    chatFn
  );

  const eventDrafts = materializeDeltaEvents({
    conversationId,
    delta,
    maxSeq,
    minSeq,
    now,
    workspaceId
  });
  const insertedEvents = await ConversationRouteEventRepo.bulkInsert(eventDrafts);
  const activeEvents = await ConversationRouteEventRepo.listActiveByConversation(conversationId, 200);
  const nextSnapshot = reduceConversationRouteSnapshot({
    conversationId,
    delta,
    existingEvents: activeEvents.filter((event) => !insertedEvents.some((newEvent) => newEvent.id === event.id)),
    newEvents: insertedEvents,
    now,
    previous: previousSnapshot,
    targetSeq: maxSeq,
    workspaceId
  });

  await ConversationRouteSnapshotRepo.upsert(nextSnapshot);
  console.log(`${TAG} updated ${conversationId}: events=${insertedEvents.length}, lastSeq=${maxSeq}`);
}

export async function rebuildConversationRoute(conversationId: string, options?: { providerId?: string; providerPresetId?: string }): Promise<void> {
  await ConversationRouteEventRepo.deleteByConversation(conversationId);
  await ConversationRouteSnapshotRepo.delete(conversationId);
  await runOnce({
    assistantContentLength: 0,
    conversationId,
    hasToolCalls: false,
    persisted: true,
    runtime: 'pi',
    toolCalls: [],
    providerId: options?.providerId,
    providerPresetId: options?.providerPresetId
  });
}

export function initConversationRouteWorker(): void {
  eventManager.on(AppEvent.AGENT_LOOP_COMPLETE, (payload: AgentLoopCompletePayload) => {
    processConversationRoute(payload).catch((error) => {
      console.warn(`${TAG} handler failed:`, error instanceof Error ? error.message : error);
    });
  });

  console.log(`${TAG} initialized`);
}
