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

import type { PiTaskChatFunction } from '../../../../packages/ai/runtime/pi/task-chat';
import { type AutoRecallDeps, getActivePrefetch, performAutoRecall, registerPrefetch } from '../../../../packages/ai/services/memory-auto-recall';
import type { RetrievalDbDeps } from '../../../../packages/ai/services/memory-retrieval-service';
import type { MemoryChatFn } from '../../../../packages/ai/services/memory-types';
import { registerSystemPromptEnricher } from '../../../../packages/ai/system-prompt-enricher';
import type { ChatRequest } from '../../../../packages/ai/types';
import { WorkspacesRepo } from '../../db/repositories';

const TAG = '[MemoryAutoRecall:Enricher] 🧠🔍';

// ━━ chatFn Cache ━━

interface CachedChatFn {
  chatFn: MemoryChatFn;
  providerId: string;
  providerPresetId?: string;
  createdAt: number;
}

let cachedChatFn: CachedChatFn | undefined;
const CHAT_FN_TTL_MS = 10 * 60 * 1000; // 10 minutes

/**
 * 将 PiTaskChatFunction（流式）适配为 MemoryChatFn（非流式）。
 * 与 extraction-worker 中的 adaptChatFn 逻辑相同。
 */
function adaptPiChatFn(piChatFn: PiTaskChatFunction): MemoryChatFn {
  return async (prompt: string, signal?: AbortSignal): Promise<string> => {
    let fullText = '';
    let errorMessage: string | undefined;

    await piChatFn(
      prompt,
      (event) => {
        if (event.type === 'delta' && event.data.text) {
          fullText += event.data.text;
        }
        if (event.type === 'error') {
          errorMessage = event.data.message;
        }
      },
      signal
    );

    if (errorMessage) {
      throw new Error(`LLM call failed: ${errorMessage}`);
    }

    return fullText;
  };
}

/**
 * 根据 provider 选择适合关键词提取的轻量模型。
 * 关键词提取是简单的 JSON 输出任务，使用快速模型降低延迟和成本。
 */
function resolveRecallModel(providerId: string): string | undefined {
  const fastModels: Record<string, string> = {
    zai: 'glm-4.5-air',
    zhipu: 'glm-4-flash',
    openai: 'gpt-4o-mini',
    anthropic: 'claude-sonnet-4-20250514',
    deepseek: 'deepseek-chat',
    qwen: 'qwen-turbo',
    gemini: 'gemini-2.0-flash'
  };
  return fastModels[providerId];
}

/**
 * 获取或创建 chatFn。
 * 按 provider 缓存，避免每次 enricher 调用都重建 runtime。
 */
async function getOrCreateChatFn(providerId: string, providerPresetId?: string): Promise<MemoryChatFn | undefined> {
  // 检查缓存是否可用
  if (cachedChatFn && cachedChatFn.providerId === providerId && cachedChatFn.providerPresetId === providerPresetId && Date.now() - cachedChatFn.createdAt < CHAT_FN_TTL_MS) {
    return cachedChatFn.chatFn;
  }

  try {
    const { createPiTaskChatRuntimeFromRequest } = await import('../../../../packages/ai/runtime/pi/task-chat');
    const fastModel = resolveRecallModel(providerId);

    const runtime = await createPiTaskChatRuntimeFromRequest({
      providerId,
      providerPresetId,
      agentId: 'memory-auto-recall',
      maxTokens: 256,
      ...(fastModel ? { model: fastModel } : {})
    });

    const chatFn = adaptPiChatFn(runtime.chatFn);

    cachedChatFn = {
      chatFn,
      providerId,
      providerPresetId,
      createdAt: Date.now()
    };

    console.log(`${TAG} Created chatFn: provider=${providerId}, model=${runtime.modelId}`);
    return chatFn;
  } catch (e) {
    console.warn(`${TAG} Failed to create chatFn, will use rule-based extraction:`, e instanceof Error ? e.message : e);
    return undefined;
  }
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
  if (!enricherDb) {
    console.log(`${TAG} [preWarm] Skipped: enricherDb not initialized`);
    return;
  }
  if (!request.messages?.length) {
    console.log(`${TAG} [preWarm] Skipped: no messages in request`);
    return;
  }
  if (request.persist === false) {
    console.log(`${TAG} [preWarm] Skipped: persist=false (ephemeral chat)`);
    return;
  }
  if (!request.conversationId) {
    console.log(`${TAG} [preWarm] Skipped: no conversationId (cannot register prefetch)`);
    return;
  }
  console.log(`${TAG} [preWarm] Starting prefetch: conv=${request.conversationId.slice(0, 8)}, provider=${request.providerId}, msgs=${request.messages.length}`);

  const db = enricherDb;
  const providerId = request.providerId;
  const messages = request.messages;
  const conversationId = request.conversationId;

  // 同步创建 promise（包含异步 deps 构建 + 搜索），立即注册到 map
  const promise = (async (): Promise<import('../../../../packages/ai/services/memory-auto-recall').AutoRecallResult> => {
    let chatFn: MemoryChatFn | undefined;
    if (providerId) {
      try {
        chatFn = await getOrCreateChatFn(providerId, request.providerPresetId);
      } catch {
        // 降级为规则提取
      }
    }

    const deps: AutoRecallDeps = {
      db,
      chatFn,
      getWorkspaceId: async () => {
        const wsId = request.extras?.workspaceId;
        if (wsId) return wsId;
        const defaultWs = await WorkspacesRepo.getDefault();
        return defaultWs?.id;
      }
    };

    return performAutoRecall(messages, deps, conversationId);
  })().catch((e) => {
    if (e?.name !== 'AbortError') {
      console.warn(`${TAG} Prefetch failed:`, e instanceof Error ? e.message : e);
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

      // 需要有消息才能判断是否需要召回
      if (!request.messages?.length) {
        console.log(`${TAG} [resolve] Skipped: no messages`);
        return null;
      }

      // 非持久化对话（如标题生成、ephemeral）跳过
      if (request.persist === false) {
        console.log(`${TAG} [resolve] Skipped: persist=false`);
        return null;
      }

      console.log(`${TAG} [resolve] Running: conv=${request.conversationId?.slice(0, 8) || 'none'}, msgs=${request.messages.length}`);

      try {
        // 优先使用已启动的预取结果
        const prefetch = request.conversationId ? getActivePrefetch(request.conversationId) : undefined;

        let result;
        if (prefetch) {
          // 预取已在进行中 — 直接 await 结果（大部分延迟已与 model 加载并行）
          const waitStart = Date.now();
          result = await prefetch.promise;
          const waited = Date.now() - waitStart;
          if (waited > 10) {
            console.log(`${TAG} Awaited prefetch for ${waited}ms (settled=${!!prefetch.settledAt})`);
          }
        } else {
          // 没有预取 — 降级为同步执行（兼容旧路径）
          const providerId = request.providerId;

          let chatFn: MemoryChatFn | undefined;
          if (providerId) {
            try {
              chatFn = await getOrCreateChatFn(providerId, request.providerPresetId);
            } catch {
              // chatFn 创建失败不影响流程，会降级为规则提取
            }
          }

          const deps: AutoRecallDeps = {
            db,
            chatFn,
            getWorkspaceId: async () => {
              const wsId = request.extras?.workspaceId;
              if (wsId) return wsId;
              const defaultWs = await WorkspacesRepo.getDefault();
              return defaultWs?.id;
            }
          };

          result = await performAutoRecall(request.messages, deps, request.conversationId);
        }

        if (result.skipped || !result.context) {
          console.log(`${TAG} [resolve] No context to inject: skipped=${result.skipped}, reason=${result.skipReason || 'empty_context'}, keywords=[${result.keywords.join(', ')}]`);
          return null;
        }

        console.log(`${TAG} Injecting memory context: ${result.noteCount} notes, ${result.context.length} chars, keywords=[${result.keywords.join(', ')}]`);

        // 包装为 system prompt 段落
        return formatAutoRecallContext(result.context);
      } catch (e) {
        console.warn(`${TAG} Auto-recall failed (non-fatal):`, e instanceof Error ? e.message : e);
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
  return `<recalled_memories>
以下是从长期记忆中自动检索到的可能相关的信息。请酌情参考：
- 如果记忆内容与当前话题直接相关，可以自然地融入回复中
- 如果记忆内容似乎不太相关，可以忽略
- 不要主动提及"我从记忆中查到"，除非用户问到
- 记忆可能已过时，如果与当前对话矛盾，以当前对话为准

${memoryContext}
</recalled_memories>`;
}
