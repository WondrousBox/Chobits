/**
 * Memory Extraction Worker
 * 对接 extraction-queue 和 extraction-service，提供：
 * 1. Executor 注册 — 让 queue 知道如何执行任务
 * 2. SPRITE_AI_COMPLETE 事件监听 — 对话结束后自动入队提取
 */

import * as fs from 'node:fs/promises';
import * as path from 'node:path';

import { createPiTaskChatRuntimeFromRequest, type PiTaskChatFunction } from '../../../../packages/ai/runtime/pi/task-chat';
import { buildWriteDbOps } from '../../../../packages/ai/runtime/pi/tools/memory-db-deps';
import { runExtractionPipeline } from '../../../../packages/ai/services/memory-extraction-service';
import { parseFrontmatter } from '../../../../packages/ai/services/memory-note-parser';
import type { AgentLoopCompletePayload, ExtractionResult, MemoryChatFn, MemoryNoteFrontmatter } from '../../../../packages/ai/services/memory-types';
import { eventManager } from '../../../../packages/event';
import { AppEvent } from '../../../../packages/event/events';
import { MemoryNoteRepo, MemoryTopicRepo } from '../../db/memory-repositories';
import { ChatRepo, WorkspacesRepo } from '../../db/repositories';
import { memoryExtractionQueue, type QueuedJob } from './extraction-queue';

// ━━ Config ━━

/** 触发自动提取所需的最少新消息数 */
const MIN_NEW_MESSAGES = 4;
/** 同一会话连续触发的最小间隔（ms） */
const MIN_TRIGGER_INTERVAL = 30 * 60 * 1000; // 30 分钟
/** 记录每个 conversation 最近一次触发时间 */
const lastTriggerTime = new Map<string, number>();

// ━━ chatFn Adapter ━━

/**
 * 将 PiTaskChatFunction（流式）适配为 MemoryChatFn（非流式）。
 * 必须正确处理 error 事件，否则 LLM 失败时会静默返回空字符串。
 */
function adaptChatFn(piChatFn: PiTaskChatFunction): MemoryChatFn {
  return async (prompt: string, signal?: AbortSignal): Promise<string> => {
    const TAG = '[MemoryWorker:chatFn]';
    let fullText = '';
    let errorMessage: string | undefined;

    console.log(`${TAG} Calling LLM (prompt ${prompt.length} chars)...`);

    await piChatFn(
      prompt,
      (event) => {
        if (event.type === 'delta' && event.data.text) {
          fullText += event.data.text;
        }
        if (event.type === 'error') {
          errorMessage = event.data.message;
          console.error(`${TAG} LLM returned error event: ${errorMessage}`);
        }
      },
      signal
    );

    if (errorMessage) {
      throw new Error(`LLM call failed: ${errorMessage}`);
    }

    if (!fullText) {
      console.warn(`${TAG} LLM returned empty response (0 chars)`);
    } else {
      console.log(`${TAG} LLM response: ${fullText.length} chars`);
    }

    return fullText;
  };
}

// ━━ findExistingNote ━━

async function findExistingNote(date: string, topicSlug: string, workspaceId: string): Promise<{ id: string; frontmatter: MemoryNoteFrontmatter; sections: Map<string, string> } | null> {
  // 通过 topic slug 查找当天已有 note
  const topic = await MemoryTopicRepo.findBySlug(topicSlug, workspaceId);
  if (!topic) return null;

  const notesByDate = await MemoryNoteRepo.listByDate(date, workspaceId);
  const matchingNote = notesByDate.find((n: any) => {
    const topics = safeJsonParse(n.topics, []);
    return topics.some((t: string) => slugify(t) === topicSlug);
  });

  if (!matchingNote) return null;

  // 读取 markdown 文件，解析 frontmatter 和 sections
  const ws = await WorkspacesRepo.getById(workspaceId);
  if (!ws?.rootPath || !matchingNote.filePath) return null;

  try {
    const filePath = path.join(ws.rootPath, matchingNote.filePath);
    const content = await fs.readFile(filePath, 'utf-8');
    const { frontmatter } = parseFrontmatter(content);
    if (!frontmatter) return null;

    // 解析 sections：找 ## 标题分割
    const sections = new Map<string, string>();
    const lines = content.split('\n');
    let currentHeading = '';
    let currentContent: string[] = [];
    let inFrontmatter = false;
    let frontmatterEnded = false;

    for (const line of lines) {
      if (!frontmatterEnded) {
        if (line.trim() === '---') {
          if (inFrontmatter) frontmatterEnded = true;
          else inFrontmatter = true;
        }
        continue;
      }
      if (line.startsWith('## ')) {
        if (currentHeading) {
          sections.set(currentHeading, currentContent.join('\n').trim());
        }
        currentHeading = line.replace(/^##\s+/, '');
        currentContent = [];
      } else {
        currentContent.push(line);
      }
    }
    if (currentHeading) {
      sections.set(currentHeading, currentContent.join('\n').trim());
    }

    return { id: matchingNote.id, frontmatter, sections };
  } catch {
    return null;
  }
}

// ━━ Executor ━━

async function executeJob(job: QueuedJob, signal: AbortSignal): Promise<ExtractionResult> {
  const TAG = '[MemoryWorker:exec]';
  const emptyResult: ExtractionResult = {
    succeeded: [],
    failed: [],
    stats: { notesCreated: 0, notesUpdated: 0, topicsCreated: 0, edgesCreated: 0, keywordsCreated: 0 }
  };

  console.log(`${TAG} Starting job ${job.id} (type=${job.jobType}, ws=${job.workspaceId}, convIds=${JSON.stringify(job.targetConversationIds)})`);

  const ws = await WorkspacesRepo.getById(job.workspaceId);
  if (!ws?.rootPath) {
    console.warn(`${TAG} Workspace not found or has no rootPath: ${job.workspaceId}`);
    return emptyResult;
  }
  console.log(`${TAG} Workspace resolved: ${ws.rootPath}`);

  let conversationIds = job.targetConversationIds || [];
  if (!conversationIds.length) {
    const allConvs = await ChatRepo.listConversations({}, 100, 0);
    const targetDate = job.targetDate || new Date().toISOString().slice(0, 10);
    const dayStart = new Date(targetDate + 'T00:00:00').getTime();
    const dayEnd = dayStart + 86400000;
    conversationIds = allConvs
      .filter((c: any) => {
        const t = c.lastMessageAt || c.updatedAt;
        return t >= dayStart && t < dayEnd;
      })
      .map((c: any) => c.id);
    console.log(`${TAG} No target convIds specified, resolved ${conversationIds.length} conversations for date ${targetDate}`);
  }

  if (!conversationIds.length) {
    console.log(`${TAG} No conversations to process, returning empty result`);
    return emptyResult;
  }

  // 从源对话中获取用户实际使用的 provider，避免硬编码
  let providerId: string | undefined;
  let providerPresetId: string | undefined;
  for (const convId of conversationIds) {
    const conv = await ChatRepo.ensureConversation({ id: convId });
    if (conv?.providerId) {
      providerId = conv.providerId;
      providerPresetId = conv.providerPresetId ?? undefined;
      break;
    }
  }

  if (!providerId) {
    console.warn(`${TAG} No provider found from conversations, skipping extraction`);
    return emptyResult;
  }

  // 记忆提取是结构化 JSON 输出任务，优先使用轻量快速模型
  const extractionModel = resolveExtractionModel(providerId);
  console.log(`${TAG} Creating LLM runtime: provider=${providerId}, preset=${providerPresetId || '(default)'}, model=${extractionModel || '(provider default)'}`);
  let runtime;
  try {
    runtime = await createPiTaskChatRuntimeFromRequest({
      providerId,
      providerPresetId,
      agentId: 'memory-extraction',
      maxTokens: 4000,
      ...(extractionModel ? { model: extractionModel } : {})
    });
  } catch (err: any) {
    console.error(`${TAG} Failed to create Pi task runtime (provider=${providerId}):`, err?.message || err);
    throw err;
  }
  const chatFn = adaptChatFn(runtime.chatFn);
  console.log(`${TAG} LLM runtime ready, model: ${runtime.modelId}`);

  const date = job.targetDate || new Date().toISOString().slice(0, 10);
  const ctx = {
    chatFn,
    workspaceId: job.workspaceId,
    workspaceRoot: ws.rootPath,
    date,
    signal,
    onProgress: (progress: any) => {
      console.log(`${TAG} Progress: stage=${progress.stage}, ${progress.current}/${progress.total}${progress.currentTopic ? ` topic="${progress.currentTopic}"` : ''} ${progress.message || ''}`);
      eventManager.emit(AppEvent.MEMORY_EXTRACTION_PROGRESS, {
        jobId: job.id,
        ...progress
      });
    }
  };

  eventManager.emit(AppEvent.MEMORY_EXTRACTION_STARTED, { jobId: job.id });

  try {
    console.log(`${TAG} Running extraction pipeline for ${conversationIds.length} conversations...`);
    const result = await runExtractionPipeline({ conversationIds }, ctx, {
      listMessages: async (convId) => {
        const msgs = await ChatRepo.listMessages(convId, 1000, 0);
        console.log(`${TAG} [collect] Loaded ${msgs.length} messages for conv ${convId}`);
        return msgs.map((m: any) => ({
          role: m.role,
          content: m.content,
          seq: m.seq,
          createdAt: m.createdAt ?? Date.now()
        }));
      },
      getConversation: async (convId) => {
        const conv = await ChatRepo.ensureConversation({ id: convId });
        console.log(`${TAG} [collect] Conv ${convId}: title="${conv?.title || '(no title)'}", exists=${!!conv}`);
        return conv ? { id: conv.id, title: conv.title } : undefined;
      },
      findExistingNote,
      dbOps: buildWriteDbOps()
    });

    console.log(`${TAG} Pipeline completed: succeeded=${result.succeeded.length}, failed=${result.failed.length}, stats=${JSON.stringify(result.stats)}`);
    if (result.failed.length > 0) {
      console.warn(`${TAG} Failed topics:`, result.failed);
    }

    eventManager.emit(AppEvent.MEMORY_EXTRACTION_COMPLETED, {
      jobId: job.id,
      stats: result.stats
    });

    return result;
  } catch (err: any) {
    console.error(`${TAG} Pipeline FAILED:`, err?.message || err, err?.stack);
    eventManager.emit(AppEvent.MEMORY_EXTRACTION_FAILED, {
      jobId: job.id,
      error: err?.message
    });
    throw err;
  }
}

// ━━ Event Listeners ━━

/**
 * Agent 工具调用循环结束后的精确触发点（主路径）。
 * 参考 Claude Code 的 handleStopHooks 机制：在模型最终回复（无后续 tool_use）时触发。
 *
 * 与旧 SPRITE_AI_COMPLETE 相比：
 * - 携带工具调用上下文，可做更精准的记忆提取决策
 * - 有工具调用的轮次信息密度更高，可适当降低消息数阈值
 * - 排除非持久化的临时对话（如标题生成）
 */
function onAgentLoopComplete(payload: AgentLoopCompletePayload): void {
  const TAG = '[MemoryWorker:agentLoop]';
  const { conversationId, persisted, hasToolCalls, agentId } = payload;

  console.log(`${TAG} Received AGENT_LOOP_COMPLETE: conv=${conversationId}, persisted=${persisted}, agentId=${agentId}, toolCalls=${payload.toolCalls.length}`);

  if (!conversationId || !persisted) {
    console.log(`${TAG} Skipped: conversationId=${conversationId}, persisted=${persisted}`);
    return;
  }

  const SKIP_AGENTS = new Set(['memory-extraction', 'title-generation']);
  if (agentId && SKIP_AGENTS.has(agentId)) {
    console.log(`${TAG} Skipped: agent "${agentId}" is in skip list`);
    return;
  }

  const lastTime = lastTriggerTime.get(conversationId);
  if (lastTime && Date.now() - lastTime < MIN_TRIGGER_INTERVAL) {
    const remainMs = MIN_TRIGGER_INTERVAL - (Date.now() - lastTime);
    console.log(`${TAG} Throttled: conv ${conversationId} was triggered ${Math.round((Date.now() - lastTime) / 1000)}s ago, wait ${Math.round(remainMs / 1000)}s more`);
    return;
  }

  // 立即标记时间戳，防止 legacy 路径在 5 秒延迟内重复入队
  lastTriggerTime.set(conversationId, Date.now());

  console.log(`${TAG} Scheduling delayed check (5s) for conv ${conversationId}...`);
  setTimeout(async () => {
    try {
      const messages = await ChatRepo.listMessages(conversationId, 1000, 0);
      const userAssistantCount = messages.filter((m: any) => m.role === 'user' || m.role === 'assistant').length;

      const threshold = hasToolCalls ? Math.max(2, MIN_NEW_MESSAGES - 2) : MIN_NEW_MESSAGES;
      console.log(`${TAG} Conv ${conversationId}: ${userAssistantCount} user/assistant messages, threshold=${threshold} (hasToolCalls=${hasToolCalls})`);

      if (userAssistantCount < threshold) {
        console.log(`${TAG} Skipped: message count ${userAssistantCount} < threshold ${threshold}`);
        return;
      }

      const conv = await ChatRepo.ensureConversation({ id: conversationId });
      const workspaceId = conv?.workspaceId || (await WorkspacesRepo.getDefault())?.id;
      if (!workspaceId) {
        console.warn(`${TAG} Skipped: no workspaceId found for conv ${conversationId} (conv.workspaceId=${conv?.workspaceId})`);
        return;
      }

      lastTriggerTime.set(conversationId, Date.now());

      const jobId = await memoryExtractionQueue.enqueue({
        jobType: 'conversation_close',
        workspaceId,
        targetConversationIds: [conversationId]
      });

      console.log(`${TAG} ✓ Enqueued job ${jobId} for conv ${conversationId} (ws=${workspaceId}, toolCalls=${payload.toolCalls.length})`);
    } catch (e) {
      console.error(`${TAG} Failed to enqueue after agent loop complete:`, e);
    }
  }, 5000);
}

/**
 * 旧路径兼容：非 Pi runtime 的普通对话仍通过 SPRITE_AI_COMPLETE 触发。
 * 当 AGENT_LOOP_COMPLETE 已被发出时，本回调不会重复入队（节流保护）。
 */
function onConversationComplete(data: any): void {
  const TAG = '[MemoryWorker:legacy]';
  const conversationId = data?.conversationId;

  if (!conversationId) {
    console.log(`${TAG} Received SPRITE_AI_COMPLETE without conversationId, skipping`);
    return;
  }

  const lastTime = lastTriggerTime.get(conversationId);
  if (lastTime && Date.now() - lastTime < MIN_TRIGGER_INTERVAL) {
    console.log(`${TAG} Throttled: conv ${conversationId} (already handled by agentLoop or recently triggered)`);
    return;
  }

  console.log(`${TAG} Scheduling delayed check (5s) for conv ${conversationId}...`);
  setTimeout(async () => {
    try {
      const messages = await ChatRepo.listMessages(conversationId, 1000, 0);
      const userAssistantCount = messages.filter((m: any) => m.role === 'user' || m.role === 'assistant').length;

      console.log(`${TAG} Conv ${conversationId}: ${userAssistantCount} user/assistant messages, threshold=${MIN_NEW_MESSAGES}`);

      if (userAssistantCount < MIN_NEW_MESSAGES) {
        console.log(`${TAG} Skipped: message count ${userAssistantCount} < ${MIN_NEW_MESSAGES}`);
        return;
      }

      const conv = await ChatRepo.ensureConversation({ id: conversationId });
      const workspaceId = conv?.workspaceId || (await WorkspacesRepo.getDefault())?.id;
      if (!workspaceId) {
        console.warn(`${TAG} Skipped: no workspaceId for conv ${conversationId}`);
        return;
      }

      lastTriggerTime.set(conversationId, Date.now());

      const jobId = await memoryExtractionQueue.enqueue({
        jobType: 'conversation_close',
        workspaceId,
        targetConversationIds: [conversationId]
      });

      console.log(`${TAG} ✓ Enqueued job ${jobId} for conv ${conversationId} (legacy path)`);
    } catch (e) {
      console.error(`${TAG} Failed to enqueue:`, e);
    }
  }, 5000);
}

// ━━ Init ━━

/**
 * 初始化记忆提取 worker：
 * 1. 注册 executor 到 queue
 * 2. 监听 AGENT_LOOP_COMPLETE 事件 — agent 工具循环结束后精确触发（主路径）
 * 3. 监听 SPRITE_AI_COMPLETE 事件 — 兼容旧路径 / 非 Pi runtime
 */
export function initMemoryExtractionWorker(): void {
  memoryExtractionQueue.setExecutor(executeJob);

  // 主路径：agent 工具循环结束
  eventManager.on(AppEvent.AGENT_LOOP_COMPLETE, onAgentLoopComplete);
  // 兼容路径：普通对话完成（节流保证不会与主路径重复）
  eventManager.on(AppEvent.SPRITE_AI_COMPLETE, onConversationComplete);

  console.log('[MemoryWorker] Extraction worker initialized (agent-loop-complete + legacy)');
}

// ━━ Helpers ━━

function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fff]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40);
}

function safeJsonParse(json: string | null | undefined, fallback: any[] = []): any[] {
  if (!json) return fallback;
  try {
    const parsed = JSON.parse(json);
    return Array.isArray(parsed) ? parsed : fallback;
  } catch {
    return fallback;
  }
}

/**
 * 根据 provider 选择适合记忆提取的轻量模型。
 * 记忆提取只需要结构化 JSON 输出能力，不需要旗舰模型，使用快速模型可以显著降低延迟。
 */
function resolveExtractionModel(providerId: string): string | undefined {
  const fastModels: Record<string, string> = {
    zai: 'glm-4.5-air',
    zhipu: 'glm-4-flash',
    openai: 'gpt-4o-mini',
    anthropic: 'claude-sonnet-4-20250514',
    deepseek: 'deepseek-chat',
    qwen: 'qwen-turbo',
    gemini: 'gemini-2.0-flash',
  };
  return fastModels[providerId];
}
