/**
 * Memory Auto-Recall Enricher
 *
 * 将 memory-auto-recall 服务注册为 SystemPromptEnricher，
 * 在 buildPiContext() 阶段自动注入相关记忆上下文。
 *
 * 职责：
 * 1. 桥接 auto-recall 服务和 system-prompt-enricher 注册表
 * 2. 提供 DB 依赖、chatFn 工厂、workspaceId 解析
 * 3. 管理 chatFn 缓存（按 provider 缓存，避免每次重建）
 * 4. 支持 prefetch 模式：在 chatStream 入口提前启动搜索，enricher resolve 时仅 await 结果
 */

import { createHash } from 'node:crypto';

import type { RecordAiUsageEventInput } from '../../../../packages/ai/analytics/types';
import type { PiTaskChatFunction } from '../../../../packages/ai/runtime/pi/task-chat';
import { buildNonReasoningTaskRuntimeRequest, resolveNonReasoningTaskModel } from '../../../../packages/ai/runtime/pi/task-model-policy';
import { type AutoRecallDeps, getActivePrefetch, performAutoRecall, registerPrefetch } from '../../../../packages/ai/services/memory-auto-recall';
import type { RetrievalDbDeps } from '../../../../packages/ai/services/memory-retrieval-service';
import { logMemoryTrace, shortTraceId } from '../../../../packages/ai/services/memory-trace';
import type { MemoryChatFn, MemoryChatInvocation, MemoryUsageEvent } from '../../../../packages/ai/services/memory-types';
import { registerSystemPromptEnricher } from '../../../../packages/ai/system-prompt-enricher';
import type { ChatRequest, TokenUsage } from '../../../../packages/ai/types';
import { ChatRepo, WorkspacesRepo } from '../../db/repositories';
import { recordAiUsageEvent } from '../analytics/usage-recorder';

const TAG = '[MemoryAutoRecall:Enricher] 🧠🔍';

// ━━ chatFn Cache ━━

interface CachedChatFn {
  chatFn: MemoryChatFn;
  model: string;
  providerId: string;
  providerPresetId?: string;
  createdAt: number;
}

let cachedChatFn: CachedChatFn | undefined;
const CHAT_FN_TTL_MS = 10 * 60 * 1000; // 10 minutes

function toAnalyticsUsage(usage?: TokenUsage): RecordAiUsageEventInput['usage'] | undefined {
  if (!usage) {
    return undefined;
  }

  return {
    cacheReadTokens: usage.cacheReadTokens,
    cacheWriteTokens: usage.cacheWriteTokens,
    estimatedCost: usage.cost,
    inputTokens: usage.inputTokens,
    outputTokens: usage.outputTokens,
    reasoningTokens: usage.reasoningTokens,
    totalTokens: usage.totalTokens
  };
}

async function recordMemoryRecallUsageEventSafely(input: RecordAiUsageEventInput): Promise<void> {
  try {
    const result = await recordAiUsageEvent(input);
    if (!result.ok) {
      console.warn('[MemoryAutoRecall:usage] Failed to record AI usage event:', {
        code: result.code,
        message: result.message,
        requestId: input.requestId,
        warnings: result.warnings
      });
      return;
    }

    if (result.warnings?.length) {
      console.warn('[MemoryAutoRecall:usage] AI usage event recorded with warnings:', {
        eventId: result.eventId,
        requestId: input.requestId,
        warnings: result.warnings
      });
    }
  } catch (error) {
    console.warn('[MemoryAutoRecall:usage] Unexpected AI usage recording error:', error);
  }
}

function resolveAutoRecallRequestId(request: ChatRequest): string {
  const requestId = typeof request.requestId === 'string' && request.requestId.trim() ? request.requestId.trim() : undefined;
  if (requestId) {
    return requestId;
  }

  const abortId = typeof request.abortId === 'string' && request.abortId.trim() ? request.abortId.trim() : undefined;
  if (abortId) {
    return abortId;
  }

  const lastMessage = request.messages[request.messages.length - 1];
  const fallbackHash = createHash('sha1')
    .update(
      JSON.stringify({
        conversationId: request.conversationId || null,
        messageCount: request.messages.length,
        providerId: request.providerId,
        workspaceId: request.extras?.workspaceId || null,
        lastMessageContent: typeof lastMessage?.content === 'string' ? lastMessage.content : '',
        lastMessageCreatedAt: lastMessage?.createdAt || null,
        lastMessageRole: lastMessage?.role || null
      })
    )
    .digest('hex')
    .slice(0, 16);

  return `memory-auto-recall:${fallbackHash}`;
}

function createMemoryRecallUsageRecorder(params: {
  conversationId?: string;
  model: string;
  providerId: string;
  providerPresetId?: string;
  requestId: string;
  workspaceId?: string;
}): (event: MemoryUsageEvent) => Promise<void> {
  return (event) => {
    return recordMemoryRecallUsageEventSafely({
      workspaceId: params.workspaceId,
      traceId: params.requestId,
      requestId: params.requestId,
      operationKey: event.operationKey,
      sourceType: 'memory',
      sourceId: params.conversationId || params.requestId,
      sourceLabel: '记忆召回',
      usageCategory: 'memory',
      usageFeature: 'memory_recall',
      usageStage: event.usageStage,
      providerId: params.providerId,
      providerPresetId: params.providerPresetId,
      model: params.model,
      agentId: 'memory-auto-recall',
      status: event.status,
      usage: toAnalyticsUsage(event.usage),
      rawUsage: event.rawUsage,
      meteringSource: 'provider_reported',
      startedAt: event.startedAt,
      completedAt: event.completedAt,
      metadata: {
        conversationId: params.conversationId || null,
        recallMode: 'auto',
        runtime: 'pi',
        ...(event.metadata || {})
      }
    });
  };
}

/**
 * 将 PiTaskChatFunction（流式）适配为 MemoryChatFn（非流式）。
 * 与 extraction-worker 中的 adaptChatFn 逻辑相同。
 */
function adaptPiChatFn(piChatFn: PiTaskChatFunction): MemoryChatFn {
  let lastInvocation: MemoryChatInvocation | undefined;

  const chatFn: MemoryChatFn = async (prompt: string, signal?: AbortSignal): Promise<string> => {
    const startedAt = Date.now();
    let fullText = '';
    let errorMessage: string | undefined;
    let rawUsage: unknown;
    let usage: TokenUsage | undefined;

    try {
      await piChatFn(
        prompt,
        (event) => {
          if (event.type === 'delta' && event.data.text) {
            fullText += event.data.text;
            return;
          }

          if (event.type === 'message_completed') {
            if (event.data?.text && event.data.text.length >= fullText.length) {
              fullText = event.data.text;
            }
            usage = event.data?.usage;
            rawUsage = event.data?.rawUsage;
            return;
          }

          if (event.type === 'error') {
            errorMessage = event.data.message;
          }
        },
        signal
      );

      lastInvocation = {
        completedAt: Date.now(),
        rawUsage,
        startedAt,
        status: signal?.aborted ? 'cancelled' : errorMessage ? 'failed' : 'completed',
        usage
      };

      if (errorMessage) {
        throw new Error(`LLM call failed: ${errorMessage}`);
      }

      return fullText;
    } catch (error) {
      lastInvocation = {
        completedAt: Date.now(),
        rawUsage,
        startedAt,
        status: signal?.aborted ? 'cancelled' : 'failed',
        usage
      };
      throw error;
    }
  };

  chatFn.consumeLastInvocation = () => {
    const invocation = lastInvocation;
    lastInvocation = undefined;
    return invocation;
  };

  return chatFn;
}

async function resolveRequestWorkspaceId(request: ChatRequest): Promise<string | undefined> {
  const requestedWorkspaceId = typeof request.extras?.workspaceId === 'string' && request.extras.workspaceId.trim() ? request.extras.workspaceId.trim() : undefined;
  if (requestedWorkspaceId) return requestedWorkspaceId;

  if (request.conversationId) {
    const existing = await ChatRepo.ensureConversation({ id: request.conversationId });
    if (existing?.workspaceId) return existing.workspaceId;
  }

  const defaultWs = await WorkspacesRepo.getDefault();
  return defaultWs?.id;
}

/**
 * 获取或创建 chatFn。
 * 按 provider 缓存，避免每次 enricher 调用都重建 runtime。
 */
async function getOrCreateChatFn(providerId: string, providerPresetId?: string): Promise<CachedChatFn | undefined> {
  // 检查缓存是否可用
  if (cachedChatFn && cachedChatFn.providerId === providerId && cachedChatFn.providerPresetId === providerPresetId && Date.now() - cachedChatFn.createdAt < CHAT_FN_TTL_MS) {
    return cachedChatFn;
  }

  try {
    const { createPiTaskChatRuntimeFromRequest } = await import('../../../../packages/ai/runtime/pi/task-chat');
    const fastModel = resolveNonReasoningTaskModel(providerId);

    const runtime = await createPiTaskChatRuntimeFromRequest(
      buildNonReasoningTaskRuntimeRequest({
        providerId,
        providerPresetId,
        agentId: 'memory-auto-recall',
        maxTokens: 256,
        ...(fastModel ? { model: fastModel } : {})
      })
    );

    const chatFn = adaptPiChatFn(runtime.chatFn);

    cachedChatFn = {
      chatFn,
      model: runtime.modelId,
      providerId,
      providerPresetId,
      createdAt: Date.now()
    };

    console.log(`${TAG} Created chatFn: provider=${providerId}, model=${runtime.modelId}`);
    return cachedChatFn;
  } catch (e) {
    console.warn(`${TAG} Failed to create chatFn, will use rule-based extraction:`, e instanceof Error ? e.message : e);
    return undefined;
  }
}

async function buildAutoRecallDeps(db: RetrievalDbDeps, request: ChatRequest): Promise<AutoRecallDeps> {
  const workspaceId = await resolveRequestWorkspaceId(request);
  const resolvedChat = request.providerId ? await getOrCreateChatFn(request.providerId, request.providerPresetId) : undefined;

  return {
    ...(resolvedChat
      ? {
          chatFn: resolvedChat.chatFn,
          onUsageEvent: createMemoryRecallUsageRecorder({
            conversationId: request.conversationId,
            model: resolvedChat.model,
            providerId: resolvedChat.providerId,
            providerPresetId: resolvedChat.providerPresetId,
            requestId: resolveAutoRecallRequestId(request),
            workspaceId
          })
        }
      : {}),
    db,
    getWorkspaceId: async () => workspaceId
  };
}

// ━━ Enricher Registration ━━

/** 内部持有的 DB 依赖引用，供 prefetch 使用 */
let enricherDb: RetrievalDbDeps | undefined;

/**
 * 从 chatStream 入口提前启动记忆预取。
 *
 * 调用时机：preWarm hook 中，在 preview / buildPiModel / buildPiContext 之前。
 * 这样当 enricher.resolve() 被调用时，搜索可能已经完成（或接近完成），
 * 将记忆检索延迟与 preview + model 加载并行，减少用户等待。
 *
 * 关键：promise 和 handle 必须同步创建并注册到 activePrefetches，
 * 否则 resolve() 调用 getActivePrefetch() 时可能找不到，导致重复搜索。
 */
export function kickoffMemoryPrefetch(request: ChatRequest): void {
  const conversationKey = shortTraceId(request.conversationId);
  if (!enricherDb) {
    console.log(`${TAG} [preWarm] Skipped: enricherDb not initialized`);
    logMemoryTrace({
      conversationId: conversationKey,
      event: 'auto_recall.prewarm.skip',
      reason: 'db_uninitialized'
    });
    return;
  }
  if (!request.messages?.length) {
    console.log(`${TAG} [preWarm] Skipped: no messages in request`);
    logMemoryTrace({
      conversationId: conversationKey,
      event: 'auto_recall.prewarm.skip',
      reason: 'no_messages'
    });
    return;
  }
  if (request.persist === false) {
    console.log(`${TAG} [preWarm] Skipped: persist=false (ephemeral chat)`);
    logMemoryTrace({
      conversationId: conversationKey,
      event: 'auto_recall.prewarm.skip',
      reason: 'persist_false'
    });
    return;
  }
  if (!request.conversationId) {
    console.log(`${TAG} [preWarm] Skipped: no conversationId (cannot register prefetch)`);
    logMemoryTrace({
      event: 'auto_recall.prewarm.skip',
      reason: 'no_conversation_id'
    });
    return;
  }
  console.log(`${TAG} [preWarm] Starting prefetch: conv=${request.conversationId.slice(0, 8)}, provider=${request.providerId}, msgs=${request.messages.length}`);
  logMemoryTrace({
    conversationId: conversationKey,
    event: 'auto_recall.prewarm.start',
    messageCount: request.messages.length,
    providerId: request.providerId || 'unknown'
  });

  const db = enricherDb;
  const messages = request.messages;
  const conversationId = request.conversationId;

  // 同步创建 promise（包含异步 deps 构建 + 搜索），立即注册到 map
  const promise = (async (): Promise<import('../../../../packages/ai/services/memory-auto-recall').AutoRecallResult> => {
    const deps = await buildAutoRecallDeps(db, request);
    return performAutoRecall(messages, deps, conversationId);
  })().catch((e) => {
    if (e?.name !== 'AbortError') {
      console.warn(`${TAG} Prefetch failed:`, e instanceof Error ? e.message : e);
      logMemoryTrace(
        {
          conversationId: conversationKey,
          error: e instanceof Error ? e.message : String(e),
          event: 'auto_recall.prewarm.error'
        },
        'warn'
      );
    }
    return { context: '', keywords: [], noteCount: 0, skipped: true, skipReason: 'prefetch_error' };
  });

  // 同步注册 — resolve() 调用 getActivePrefetch() 时一定能找到
  registerPrefetch(conversationId, promise);
}

/**
 * 注册 memory-auto-recall enricher。
 * 在 initMemoryHandlers 中调用，提供 DB 依赖。
 */
export function initMemoryAutoRecallEnricher(db: RetrievalDbDeps): void {
  enricherDb = db;

  registerSystemPromptEnricher({
    id: 'memory-auto-recall',
    preWarm: (ctx) => {
      // 在 chatStream 入口处提前启动记忆预取
      kickoffMemoryPrefetch(ctx.request);
    },
    resolve: async (ctx) => {
      const { request } = ctx;
      const conversationId = shortTraceId(request.conversationId);

      // 检查记忆系统配置
      try {
        const { getMemoryConfig } = await import('./memory-config');
        const cfg = getMemoryConfig();
        if (!cfg.memoryEnabled || !cfg.autoRecallEnabled) {
          console.log(`${TAG} [resolve] Skipped: memoryEnabled=${cfg.memoryEnabled}, autoRecallEnabled=${cfg.autoRecallEnabled}`);
          logMemoryTrace({
            autoRecallEnabled: cfg.autoRecallEnabled,
            conversationId,
            event: 'auto_recall.resolve.skip',
            memoryEnabled: cfg.memoryEnabled,
            reason: 'config_disabled'
          });
          return null;
        }
      } catch {
        /* no config file yet, use defaults (enabled) */
      }

      // 需要有消息才能判断是否需要召回
      if (!request.messages?.length) {
        console.log(`${TAG} [resolve] Skipped: no messages`);
        logMemoryTrace({
          conversationId,
          event: 'auto_recall.resolve.skip',
          reason: 'no_messages'
        });
        return null;
      }

      // 非持久化对话（如标题生成、ephemeral）跳过
      if (request.persist === false) {
        console.log(`${TAG} [resolve] Skipped: persist=false`);
        logMemoryTrace({
          conversationId,
          event: 'auto_recall.resolve.skip',
          reason: 'persist_false'
        });
        return null;
      }

      console.log(`${TAG} [resolve] Running: conv=${request.conversationId?.slice(0, 8) || 'none'}, msgs=${request.messages.length}`);
      logMemoryTrace({
        conversationId,
        event: 'auto_recall.resolve.start',
        messageCount: request.messages.length,
        providerId: request.providerId || 'unknown',
        source: 'memory_auto_recall'
      });

      try {
        // 优先使用已启动的预取结果
        const prefetch = request.conversationId ? getActivePrefetch(request.conversationId) : undefined;

        let result;
        if (prefetch) {
          // 预取已在进行中 — 直接 await 结果（大部分延迟已与 model 加载并行）
          const waitStart = Date.now();
          result = await prefetch.promise;
          const waited = Date.now() - waitStart;
          logMemoryTrace({
            conversationId,
            event: 'auto_recall.resolve.prefetch_awaited',
            settled: !!prefetch.settledAt,
            waitMs: waited
          });
          if (waited > 10) {
            console.log(`${TAG} Awaited prefetch for ${waited}ms (settled=${!!prefetch.settledAt})`);
          }
        } else {
          // 没有预取 — 降级为同步执行（兼容旧路径）
          const deps = await buildAutoRecallDeps(db, request);

          logMemoryTrace({
            conversationId,
            event: 'auto_recall.resolve.sync_fallback'
          });
          result = await performAutoRecall(request.messages, deps, request.conversationId);
        }

        if (result.skipped || !result.context) {
          console.log(`${TAG} [resolve] No context to inject: skipped=${result.skipped}, reason=${result.skipReason || 'empty_context'}, keywords=[${result.keywords.join(', ')}]`);
          logMemoryTrace({
            contextChars: result.context.length,
            conversationId,
            event: 'auto_recall.resolve.no_context',
            keywordCount: result.keywords.length,
            keywords: result.keywords,
            reason: result.skipReason || 'empty_context',
            skipped: result.skipped
          });
          return null;
        }

        console.log(`${TAG} Injecting memory context: ${result.noteCount} notes, ${result.context.length} chars, keywords=[${result.keywords.join(', ')}]`);
        logMemoryTrace({
          contextChars: result.context.length,
          conversationId,
          event: 'auto_recall.resolve.inject',
          keywordCount: result.keywords.length,
          keywords: result.keywords,
          noteCount: result.noteCount
        });

        // 包装为 system prompt 段落
        return formatAutoRecallContext(result.context);
      } catch (e) {
        console.warn(`${TAG} Auto-recall failed (non-fatal):`, e instanceof Error ? e.message : e);
        logMemoryTrace(
          {
            conversationId,
            error: e instanceof Error ? e.message : String(e),
            event: 'auto_recall.resolve.error'
          },
          'warn'
        );
        return null;
      }
    }
  });

  console.log(`${TAG} Enricher registered`);
}

/**
 * 将召回的记忆上下文格式化为系统提示词段落。
 * 包含使用指导，帮助 AI 正确使用记忆信息。
 */
function formatAutoRecallContext(memoryContext: string): string {
  return `以下是你想到的可能相关的信息：
<recalled_memories>
${memoryContext}
</recalled_memories>
如果想到的内容与当前话题直接相关，可以自然地融入回复。
如果内容不太相关，可以忽略，记忆如果出现偏差，以当前对话为准。
`;
}
