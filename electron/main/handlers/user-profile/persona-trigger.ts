/**
 * User Persona Trigger
 * 事件监听 + 门控 + 判定 + 入队
 *
 * 监听 AGENT_LOOP_COMPLETE 事件，与 Memory Extraction 并行但独立。
 *
 * @see docs/memory-system/user-persona-profile-design.md §5.4
 */

import * as fs from 'node:fs/promises';
import * as path from 'node:path';

import { createPiTaskChatRuntimeFromRequest, type PiTaskChatFunction } from '../../../../packages/ai/runtime/pi/task-chat';
import type { AgentLoopCompletePayload } from '../../../../packages/ai/services/memory-types';
import { checkGate, checkPersonaUpdateNeeded, formatConversationSnippet, type GateCheckInput } from '../../../../packages/ai/services/persona-check-service';
import { PERSONA_FILENAME, type PersonaChatFn, type PersonaUpdateResult } from '../../../../packages/ai/services/persona-types';
import { updatePersona } from '../../../../packages/ai/services/persona-update-service';
import { eventManager } from '../../../../packages/event';
import { AppEvent } from '../../../../packages/event/events';
import { ChatRepo, WorkspacesRepo } from '../../db/repositories';
import { type PersonaQueuedJob, personaUpdateQueue } from './persona-queue';

// ━━ chatFn 适配 ━━

function adaptChatFn(piChatFn: PiTaskChatFunction): PersonaChatFn {
  return async (prompt: string, signal?: AbortSignal): Promise<string> => {
    let fullText = '';
    let errorMessage: string | undefined;

    await piChatFn(
      prompt,
      (event) => {
        if (event.type === 'delta' && event.data.text) fullText += event.data.text;
        if (event.type === 'error') errorMessage = event.data.message;
      },
      signal
    );

    if (errorMessage) throw new Error(`LLM call failed: ${errorMessage}`);
    return fullText;
  };
}

// ━━ Executor ━━

async function executePersonaUpdate(job: PersonaQueuedJob, signal: AbortSignal): Promise<PersonaUpdateResult> {
  const TAG = '[PersonaTrigger:exec]';

  const ws = await WorkspacesRepo.getById(job.workspaceId);
  if (!ws?.rootPath) throw new Error(`Workspace ${job.workspaceId} not found`);

  const providerId = job.providerId;
  if (!providerId) throw new Error('No providerId for persona update');

  console.log(`${TAG} Creating LLM runtime: provider=${providerId}`);
  const runtime = await createPiTaskChatRuntimeFromRequest({
    providerId,
    providerPresetId: job.providerPresetId,
    agentId: 'user-persona-update',
    maxTokens: 2000
  });
  const chatFn = adaptChatFn(runtime.chatFn);

  eventManager.emit(AppEvent.USER_PERSONA_UPDATE_STARTED, {
    workspaceId: job.workspaceId,
    reason: job.reason
  });

  try {
    const result = await updatePersona(job, chatFn, ws.rootPath, signal);

    eventManager.emit(AppEvent.USER_PERSONA_UPDATE_COMPLETED, {
      workspaceId: job.workspaceId,
      action: result.action,
      charCount: result.charCount,
      itemCount: result.itemCount
    });

    return result;
  } catch (err) {
    eventManager.emit(AppEvent.USER_PERSONA_UPDATE_FAILED, {
      workspaceId: job.workspaceId,
      error: (err as Error)?.message
    });
    throw err;
  }
}

// ━━ 事件入口 ━━

async function checkAndQueuePersonaUpdate(payload: AgentLoopCompletePayload): Promise<void> {
  const TAG = '[PersonaTrigger]';
  const { conversationId, persisted, hasToolCalls, agentId, providerId, providerPresetId } = payload;

  // 获取 workspace
  const conv = await ChatRepo.ensureConversation({ id: conversationId });
  const workspaceId = conv?.workspaceId || (await WorkspacesRepo.getDefault())?.id;
  if (!workspaceId) {
    console.log(`${TAG} Skipped: no workspaceId`);
    return;
  }

  // 统计用户消息
  const messages = await ChatRepo.listMessages(conversationId, 200, 0);
  const userMessages = messages.filter((m: any) => m.role === 'user');

  // 门控
  const gateInput: GateCheckInput = {
    conversationId,
    workspaceId,
    userMessageCount: userMessages.length,
    hasToolCalls: !!hasToolCalls,
    agentId,
    persisted: !!persisted
  };

  const skipReason = checkGate(gateInput);
  if (skipReason) {
    console.log(`${TAG} Skipped by gate: ${skipReason}`);
    eventManager.emit(AppEvent.USER_PERSONA_UPDATE_SKIPPED, { workspaceId, reason: skipReason });
    return;
  }

  // 读取现有画像
  const ws = await WorkspacesRepo.getById(workspaceId);
  let currentPersona: string | null = null;
  if (ws?.rootPath) {
    try {
      currentPersona = await fs.readFile(path.join(ws.rootPath, 'memory', PERSONA_FILENAME), 'utf-8');
    } catch {
      // 文件不存在
    }
  }

  // 格式化对话片段
  const allMessages = messages.filter((m: any) => m.role === 'user' || m.role === 'assistant').map((m: any) => ({ role: m.role, content: m.content, seq: m.seq ?? 0 }));
  const snippet = formatConversationSnippet(allMessages, conversationId);

  // 获取 provider
  const resolvedProviderId = providerId || conv?.providerId;
  if (!resolvedProviderId) {
    console.log(`${TAG} Skipped: no provider available for LLM call`);
    return;
  }

  // 创建 LLM runtime 并调用判定
  console.log(`${TAG} Running persona check for conv ${conversationId}...`);
  const runtime = await createPiTaskChatRuntimeFromRequest({
    providerId: resolvedProviderId,
    providerPresetId: providerPresetId || conv?.providerPresetId || undefined,
    agentId: 'user-persona-check',
    maxTokens: 1000
  });
  const chatFn = adaptChatFn(runtime.chatFn);

  const result = await checkPersonaUpdateNeeded(
    {
      conversationId,
      workspaceId,
      currentPersona,
      conversationSnippet: snippet
    },
    chatFn
  );

  if (!result.decision.shouldUpdate) {
    console.log(`${TAG} Decision: no update needed (reason=${result.decision.reason}, score=${result.decision.signalScore})`);
    eventManager.emit(AppEvent.USER_PERSONA_UPDATE_SKIPPED, {
      workspaceId,
      reason: result.decision.reason,
      signalScore: result.decision.signalScore
    });
    return;
  }

  // 入队更新任务
  console.log(`${TAG} Decision: update needed! reason=${result.decision.reason}, score=${result.decision.signalScore}, facts=${result.decision.candidateFacts.length}`);
  await personaUpdateQueue.enqueue({
    workspaceId,
    evidence: result.decision.evidence.map((e) => ({
      conversationId: e.conversationId,
      seqStart: e.seqStart,
      seqEnd: e.seqEnd
    })),
    candidateFacts: result.decision.candidateFacts,
    reason: result.decision.reason,
    providerId: resolvedProviderId,
    providerPresetId: providerPresetId || conv?.providerPresetId || undefined
  });
}

// ━━ 初始化 ━━

export function initPersonaTrigger(): void {
  const TAG = '[PersonaTrigger:init]';

  // 注册 executor
  personaUpdateQueue.setExecutor(executePersonaUpdate);

  // 监听事件
  eventManager.on(AppEvent.AGENT_LOOP_COMPLETE, (payload: AgentLoopCompletePayload) => {
    checkAndQueuePersonaUpdate(payload).catch((e) => {
      console.warn(`${TAG} Persona check failed:`, e?.message || e);
    });
  });

  console.log(`${TAG} Persona trigger initialized, listening AGENT_LOOP_COMPLETE`);
}
