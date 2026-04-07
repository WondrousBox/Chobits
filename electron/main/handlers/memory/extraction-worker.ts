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
import { formatMemoryDate, getNextMemoryDate, getRelativeMemoryDate, getTodayMemoryDate } from '../../../../packages/ai/services/memory-date';
import { runExtractionPipeline } from '../../../../packages/ai/services/memory-extraction-service';
import { parseFrontmatter } from '../../../../packages/ai/services/memory-note-parser';
import type { AgentLoopCompletePayload, ExtractionResult, MemoryChatFn, MemoryNoteFrontmatter } from '../../../../packages/ai/services/memory-types';
import { eventManager } from '../../../../packages/event';
import { AppEvent } from '../../../../packages/event/events';
import { MemoryNoteRepo, MemorySyncJobRepo, MemoryTopicRepo } from '../../db/memory-repositories';
import { ChatRepo, WorkspacesRepo } from '../../db/repositories';
import { memoryExtractionQueue, type QueuedJob } from './extraction-queue';
import { getMemoryConfig } from './memory-config';

// ━━ Config ━━

/** 触发自动提取所需的最少新消息数（watermark 之后的） */
const MIN_NEW_MESSAGES = 4;
/** 同一会话连续触发的最小冷却间隔（ms）— 仅防止短时间内重复触发 */
const MIN_TRIGGER_COOLDOWN = 15 * 1000; // 15 秒
/** 记录每个 conversation 最近一次触发时间 */
const lastTriggerTime = new Map<string, number>();
/** 增量提取水位线：记录每个 conversation 已提取到的最大 message seq */
const conversationWatermarks = new Map<string, number>();
/** 正在提取中的 conversation set（用于 coalescing） */
const extractingConversations = new Set<string>();
/** 等待 trailing run 的 conversation set（coalescing 暂存） */
const pendingTrailingRun = new Set<string>();

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
    const callStart = Date.now();

    console.log(`${TAG} 🧠📤 Calling LLM (prompt ${prompt.length} chars)...`);

    await piChatFn(
      prompt,
      (event) => {
        if (event.type === 'delta' && event.data.text) {
          fullText += event.data.text;
        }
        if (event.type === 'error') {
          errorMessage = event.data.message;
          console.error(`${TAG} LLM returned error event: ${errorMessage}`);
          // 输出原始提示词用于调试敏感内容问题
          console.error(`${TAG} === FAILED PROMPT START (${prompt.length} chars) ===`);
          console.error(prompt);
          console.error(`${TAG} === FAILED PROMPT END ===`);
        }
      },
      signal
    );

    if (errorMessage) {
      throw new Error(`LLM call failed: ${errorMessage}`);
    }

    const callElapsed = ((Date.now() - callStart) / 1000).toFixed(1);
    if (!fullText) {
      console.warn(`${TAG} 🧠⚠️ LLM returned empty response (0 chars) [${callElapsed}s]`);
    } else {
      console.log(`${TAG} 🧠📥 LLM response: ${fullText.length} chars [${callElapsed}s]`);
    }

    return fullText;
  };
}

// ━━ findExistingNote ━━

async function findExistingNote(date: string, topicSlug: string, workspaceId: string): Promise<{ id: string; frontmatter: MemoryNoteFrontmatter; sections: Map<string, string> } | null> {
  // 策略 1：通过 topic slug 在 DB 中查找当天已有 note
  let matchingNote: any = null;

  const topic = await MemoryTopicRepo.findBySlug(topicSlug, workspaceId);
  if (topic) {
    const notesByDate = await MemoryNoteRepo.listByDate(date, workspaceId);
    matchingNote = notesByDate.find((n: any) => {
      const topics = safeJsonParse(n.topics, []);
      return topics.some((t: string) => slugify(t) === topicSlug);
    });
  }

  // 策略 2（回退）：通过构造的 filePath 直接查找
  // 解决 LLM 生成拼音 slug 而 DB 中存储中文 topic label 导致 slugify 不匹配的问题
  if (!matchingNote) {
    const { buildNotePath } = await import('../../../../packages/ai/services/memory-note-writer');
    const expectedFilePath = buildNotePath(date, topicSlug);
    matchingNote = await MemoryNoteRepo.getByFilePath(expectedFilePath, workspaceId);
    if (matchingNote) {
      console.log(`[MemoryWorker:findExistingNote] Found existing note by workspace+filePath fallback: ws=${workspaceId}, path=${expectedFilePath} (id=${matchingNote.id})`);
    }
  }

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

  console.log(`${TAG} 🧠🚀 Starting job ${job.id} (type=${job.jobType}, ws=${job.workspaceId}, convIds=${JSON.stringify(job.targetConversationIds)})`);

  const ws = await WorkspacesRepo.getById(job.workspaceId);
  if (!ws?.rootPath) {
    console.warn(`${TAG} Workspace not found or has no rootPath: ${job.workspaceId}`);
    return emptyResult;
  }
  console.log(`${TAG} Workspace resolved: ${ws.rootPath}`);

  let conversationIds = job.targetConversationIds || [];
  if (!conversationIds.length) {
    const allConvs = await ChatRepo.listConversations({}, 100, 0);
    const targetDate = job.targetDate || getTodayMemoryDate();
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

  // 优先使用 job 携带的 provider（从事件触发时捕获的当前 provider），
  // 其次回退到从会话记录中读取（已通过 ensureConversation 更新）
  let providerId: string | undefined = job.providerId;
  let providerPresetId: string | undefined = job.providerPresetId;

  if (!providerId) {
    for (const convId of conversationIds) {
      const conv = await ChatRepo.ensureConversation({ id: convId });
      if (conv?.providerId) {
        providerId = conv.providerId;
        providerPresetId = conv.providerPresetId ?? undefined;
        console.log(`${TAG} Provider resolved from conversation record: ${providerId} (preset=${providerPresetId || '(default)'})`);
        break;
      }
    }
  } else {
    console.log(`${TAG} Provider from job params: ${providerId} (preset=${providerPresetId || '(default)'})`);
  }

  if (!providerId) {
    console.warn(`${TAG} No provider found from conversations, skipping extraction`);
    return emptyResult;
  }

  const date = job.targetDate || getTodayMemoryDate();

  // 构建增量水位线：只提取上次之后的新消息
  const watermarks = new Map<string, number>();
  for (const convId of conversationIds) {
    const wm = conversationWatermarks.get(convId);
    if (wm !== undefined) {
      watermarks.set(convId, wm);
    }
  }

  const pipelineDeps = {
    listMessages: async (convId: string) => {
      const msgs = await ChatRepo.listMessages(convId, 1000, 0);
      console.log(`${TAG} [collect] Loaded ${msgs.length} messages for conv ${convId}`);
      return msgs.map((m: any) => ({
        role: m.role,
        content: m.content,
        seq: m.seq,
        createdAt: m.createdAt ?? Date.now()
      }));
    },
    getConversation: async (convId: string) => {
      const conv = await ChatRepo.ensureConversation({ id: convId });
      console.log(`${TAG} [collect] Conv ${convId}: title="${conv?.title || '(no title)'}", exists=${!!conv}`);
      return conv ? { id: conv.id, title: conv.title } : undefined;
    },
    findExistingNote,
    dbOps: buildWriteDbOps()
  };

  const makeProgressHandler = () => (progress: any) => {
    console.log(`${TAG} Progress: stage=${progress.stage}, ${progress.current}/${progress.total}${progress.currentTopic ? ` topic="${progress.currentTopic}"` : ''} ${progress.message || ''}`);
    eventManager.emit(AppEvent.MEMORY_EXTRACTION_PROGRESS, {
      jobId: job.id,
      ...progress
    });
  };

  /**
   * 创建 LLM runtime 并运行提取管线。
   * @param model 指定模型名，undefined 表示使用 provider 默认模型
   * @param label 日志标签（如 "fast" 或 "fallback"）
   */
  const runWithModel = async (model: string | undefined, label: string): Promise<ExtractionResult> => {
    console.log(`${TAG} 🧠⚙️ [${label}] Creating LLM runtime: provider=${providerId}, preset=${providerPresetId || '(default)'}, model=${model || '(provider default)'}`);
    const runtime = await createPiTaskChatRuntimeFromRequest({
      providerId: providerId!,
      providerPresetId,
      agentId: 'memory-extraction',
      maxTokens: 4000,
      ...(model ? { model } : {})
    });
    const chatFn = adaptChatFn(runtime.chatFn);
    console.log(`${TAG} 🧠✅ [${label}] LLM runtime ready, model: ${runtime.modelId}`);

    const ctx = {
      chatFn,
      workspaceId: job.workspaceId,
      workspaceRoot: ws!.rootPath,
      date,
      signal,
      onProgress: makeProgressHandler()
    };

    return runExtractionPipeline({ conversationIds, watermarks }, ctx, pipelineDeps);
  };

  eventManager.emit(AppEvent.MEMORY_EXTRACTION_STARTED, { jobId: job.id });

  // 标记正在提取
  for (const convId of conversationIds) {
    extractingConversations.add(convId);
  }

  console.log(`${TAG} Running extraction pipeline for ${conversationIds.length} conversations...`);
  console.log(`${TAG} Watermarks: ${[...watermarks.entries()].map(([k, v]) => `${k.slice(0, 8)}...=${v}`).join(', ') || '(none, full scan)'}`);

  try {
    // 记忆提取是结构化 JSON 输出任务，优先使用轻量快速模型
    const fastModel = resolveExtractionModel(providerId);
    let result: ExtractionResult;

    if (fastModel) {
      try {
        result = await runWithModel(fastModel, 'fast');
      } catch (fastErr: any) {
        // 快速模型失败（安全策略、模型能力不足等），回退到对话原始模型
        console.warn(`${TAG} ⚠️ 快速模型 ${fastModel} 提取失败: ${fastErr?.message || fastErr}`);
        console.warn(`${TAG} ⚠️ 正在切换为对话原始模型重试记忆提取...`);
        result = await runWithModel(undefined, 'fallback');
        console.log(`${TAG} ✓ 使用对话原始模型重试成功`);
      }
    } else {
      result = await runWithModel(undefined, 'default');
    }

    console.log(`${TAG} 🧠🏁 Pipeline completed: succeeded=${result.succeeded.length}, failed=${result.failed.length}, stats=${JSON.stringify(result.stats)}`);
    if (result.failed.length > 0) {
      console.warn(`${TAG} Failed topics:`, result.failed);
    }

    // 更新水位线：获取每个 conversation 的最大 seq
    for (const convId of conversationIds) {
      try {
        const msgs = await ChatRepo.listMessages(convId, 1000, 0);
        const maxSeq = msgs.reduce((max: number, m: any) => Math.max(max, m.seq ?? 0), 0);
        if (maxSeq > 0) {
          conversationWatermarks.set(convId, maxSeq);
          console.log(`${TAG} Updated watermark for conv ${convId.slice(0, 8)}...: seq=${maxSeq}`);
        }
      } catch (e) {
        console.warn(`${TAG} Failed to update watermark for conv ${convId}:`, e);
      }
    }

    // 清理提取中标记
    for (const convId of conversationIds) {
      extractingConversations.delete(convId);
    }

    // Coalescing: 如果有 pending trailing run，立即调度
    for (const convId of conversationIds) {
      if (pendingTrailingRun.has(convId)) {
        pendingTrailingRun.delete(convId);
        console.log(`${TAG} Trailing run: re-triggering extraction for conv ${convId.slice(0, 8)}...`);
        // 用 setImmediate 避免栈溢出
        setImmediate(() => {
          eventManager.emit(AppEvent.AGENT_LOOP_COMPLETE, {
            conversationId: convId,
            persisted: true,
            hasToolCalls: false,
            agentId: undefined,
            toolCalls: [],
            assistantContentLength: 0,
            runtime: 'other'
          } satisfies AgentLoopCompletePayload);
        });
      }
    }

    eventManager.emit(AppEvent.MEMORY_EXTRACTION_COMPLETED, {
      jobId: job.id,
      stats: result.stats
    });

    return result;
  } catch (err: any) {
    console.error(`${TAG} Pipeline FAILED (所有模型均失败):`, err?.message || err, err?.stack);

    // 清理提取中标记（即使失败也要清理，否则 coalescing 永远不会触发）
    for (const convId of conversationIds) {
      extractingConversations.delete(convId);
      pendingTrailingRun.delete(convId); // 失败时不重试 trailing run
    }

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

  // 检查记忆系统配置
  const cfg = getMemoryConfig();
  if (!cfg.memoryEnabled || !cfg.autoExtractionEnabled) {
    console.log(`${TAG} Skipped: memoryEnabled=${cfg.memoryEnabled}, autoExtractionEnabled=${cfg.autoExtractionEnabled}`);
    return;
  }

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
  if (lastTime && Date.now() - lastTime < MIN_TRIGGER_COOLDOWN) {
    const remainMs = MIN_TRIGGER_COOLDOWN - (Date.now() - lastTime);
    console.log(`${TAG} Cooldown: conv ${conversationId} was triggered ${Math.round((Date.now() - lastTime) / 1000)}s ago, wait ${Math.round(remainMs / 1000)}s more`);
    return;
  }

  // Coalescing: 如果该 conversation 正在提取中，暂存为 trailing run 而不是丢弃
  if (extractingConversations.has(conversationId)) {
    pendingTrailingRun.add(conversationId);
    console.log(`${TAG} Coalescing: conv ${conversationId} is being extracted, stashed for trailing run`);
    return;
  }

  // 立即标记时间戳，防止 legacy 路径在 5 秒延迟内重复入队
  lastTriggerTime.set(conversationId, Date.now());

  console.log(`${TAG} Scheduling delayed check (5s) for conv ${conversationId}...`);
  setTimeout(async () => {
    try {
      const messages = await ChatRepo.listMessages(conversationId, 1000, 0);
      const userAssistantMessages = messages.filter((m: any) => m.role === 'user' || m.role === 'assistant');

      // 增量计数：只统计水位线之后的新消息
      const watermark = conversationWatermarks.get(conversationId) ?? 0;
      const newMessages = userAssistantMessages.filter((m: any) => (m.seq ?? 0) > watermark);

      const threshold = hasToolCalls ? Math.max(2, MIN_NEW_MESSAGES - 2) : MIN_NEW_MESSAGES;
      console.log(`${TAG} Conv ${conversationId}: total=${userAssistantMessages.length}, watermark=${watermark}, new=${newMessages.length}, threshold=${threshold} (hasToolCalls=${hasToolCalls})`);

      if (newMessages.length < threshold) {
        console.log(`${TAG} Skipped: new message count ${newMessages.length} < threshold ${threshold}`);
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
        targetConversationIds: [conversationId],
        providerId: payload.providerId,
        providerPresetId: payload.providerPresetId
      });

      console.log(`${TAG} ✓ Enqueued job ${jobId} for conv ${conversationId} (ws=${workspaceId}, provider=${payload.providerId || '(from conv)'}, toolCalls=${payload.toolCalls.length})`);
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
  if (lastTime && Date.now() - lastTime < MIN_TRIGGER_COOLDOWN) {
    console.log(`${TAG} Cooldown: conv ${conversationId} (already handled by agentLoop or recently triggered)`);
    return;
  }

  // Coalescing: 如果该 conversation 正在提取中，暂存为 trailing run
  if (extractingConversations.has(conversationId)) {
    pendingTrailingRun.add(conversationId);
    console.log(`${TAG} Coalescing: conv ${conversationId} is being extracted, stashed for trailing run`);
    return;
  }

  console.log(`${TAG} Scheduling delayed check (5s) for conv ${conversationId}...`);
  setTimeout(async () => {
    try {
      const messages = await ChatRepo.listMessages(conversationId, 1000, 0);
      const userAssistantMessages = messages.filter((m: any) => m.role === 'user' || m.role === 'assistant');

      // 增量计数：只统计水位线之后的新消息
      const watermark = conversationWatermarks.get(conversationId) ?? 0;
      const newMessages = userAssistantMessages.filter((m: any) => (m.seq ?? 0) > watermark);

      console.log(`${TAG} Conv ${conversationId}: total=${userAssistantMessages.length}, watermark=${watermark}, new=${newMessages.length}, threshold=${MIN_NEW_MESSAGES}`);

      if (newMessages.length < MIN_NEW_MESSAGES) {
        console.log(`${TAG} Skipped: new message count ${newMessages.length} < ${MIN_NEW_MESSAGES}`);
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

// ━━ Daily Extraction & Heat Decay ━━

/** 上次日终提取日期（内存缓存） */
let lastDailyExtractionDate: string | undefined;
/** 上次 heat 衰减日期 */
let lastHeatDecayDate: string | undefined;

/**
 * 检查是否需要进行日终批量提取。
 * 由 DailyCareService 的 tick 回调或启动补偿调用。
 * 当前天尚未进行日终提取且有新对话数据时，入队提取任务。
 */
async function checkDailyMemoryExtraction(): Promise<void> {
  const TAG = '[MemoryWorker:daily]';

  try {
    const today = getTodayMemoryDate();

    // 已完成今天的提取 → 跳过
    if (lastDailyExtractionDate === today) return;

    // 当前有正在运行的提取任务 → 跳过
    if (memoryExtractionQueue.isRunning()) return;

    const ws = await WorkspacesRepo.getDefault();
    if (!ws?.id) return;

    // 检查是否有未提取的对话
    // 首先确定需要处理的日期：从上次提取日期的下一天到今天
    const targetDate = lastDailyExtractionDate ? getNextDate(lastDailyExtractionDate) : today;

    // 查找目标日期范围内有更新的会话
    const allConvs = await ChatRepo.listConversations({}, 200, 0);
    const dayStart = new Date(targetDate + 'T00:00:00').getTime();
    const dayEnd = new Date(today + 'T23:59:59').getTime();
    const conversations = allConvs.filter((c: any) => {
      const t = c.lastMessageAt || c.updatedAt;
      return t >= dayStart && t <= dayEnd;
    });

    if (conversations.length === 0) {
      lastDailyExtractionDate = today;
      console.log(`${TAG} No conversations found for daily extraction (${targetDate} ~ ${today}), skipping`);
      return;
    }

    // 过滤已在水位线内的会话（避免重复提取）
    const needsExtraction: string[] = [];
    for (const conv of conversations) {
      const watermark = conversationWatermarks.get(conv.id) ?? 0;
      const msgs = await ChatRepo.listMessages(conv.id, 1000, 0);
      const newMsgs = msgs.filter((m: any) => (m.role === 'user' || m.role === 'assistant') && (m.seq ?? 0) > watermark);
      if (newMsgs.length >= 2) {
        needsExtraction.push(conv.id);
      }
    }

    if (needsExtraction.length === 0) {
      lastDailyExtractionDate = today;
      console.log(`${TAG} All conversations already extracted, marking ${today} as done`);
      return;
    }

    console.log(`${TAG} 🧠📅 Enqueuing daily extraction for ${needsExtraction.length} conversations (${targetDate} ~ ${today})`);

    await memoryExtractionQueue.enqueue({
      jobType: 'daily_extraction',
      workspaceId: ws.id,
      targetDate: targetDate,
      targetConversationIds: needsExtraction
    });

    lastDailyExtractionDate = today;
  } catch (e) {
    console.error('[MemoryWorker:daily] Daily extraction check failed:', e);
  }
}

/**
 * 应用 topic heat 衰减，每天执行一次。
 * 衰减因子 0.95 ≈ 14 天半衰期。
 */
function applyDailyHeatDecay(): void {
  const TAG = '[MemoryWorker:heatDecay]';
  const today = getTodayMemoryDate();
  if (lastHeatDecayDate === today) return;

  try {
    const affected = MemoryTopicRepo.applyHeatDecay(0.95);
    lastHeatDecayDate = today;
    if (affected > 0) {
      console.log(`${TAG} Applied heat decay to ${affected} topics (factor=0.95)`);
    }
  } catch (e) {
    console.error(`${TAG} Heat decay failed:`, e);
  }
}

/**
 * 漏跑补偿：应用启动时检查是否有未完成的日终提取。
 * 如果上次提取日期与今天之间有间隔，自动触发补偿提取。
 */
async function compensateMissedExtractions(): Promise<void> {
  const TAG = '[MemoryWorker:compensate]';

  try {
    // 查找最近一次成功完成的 sync job
    const recentJobs = await MemorySyncJobRepo.findByStatus('completed');
    if (recentJobs.length === 0) {
      console.log(`${TAG} No completed extraction jobs found, skipping compensation`);
      return;
    }

    const lastJob = recentJobs[0]; // already sorted by completedAt desc
    const lastCompletedDate = lastJob.targetDate || (lastJob.completedAt ? formatMemoryDate(lastJob.completedAt) : null);

    if (!lastCompletedDate) return;

    const today = getTodayMemoryDate();
    const daysBetween = getDaysBetween(lastCompletedDate, today);

    if (daysBetween <= 1) {
      console.log(`${TAG} No missed extractions (last: ${lastCompletedDate}, today: ${today})`);
      lastDailyExtractionDate = lastCompletedDate;
      return;
    }

    console.log(`${TAG} 🧠🔄 Detected ${daysBetween - 1} missed extraction day(s) since ${lastCompletedDate}`);
    // 设置 lastDailyExtractionDate 为上次成功日期，让 checkDailyMemoryExtraction 自动补提取
    lastDailyExtractionDate = lastCompletedDate;

    // 立即触发一次日终提取检查来开始补偿
    await checkDailyMemoryExtraction();
  } catch (e) {
    console.error(`${TAG} Compensation check failed:`, e);
  }
}

/**
 * 每日自动维护入口 — 由 DailyCareService tick 或直接定时器调用。
 * 包含：heat 衰减 + 日终批量提取检查。
 */
export async function memoryDailyMaintenanceTick(): Promise<void> {
  applyDailyHeatDecay();
  await checkDailyMemoryExtraction();

  // 生成昨日的 daily index（如果有笔记的话）
  try {
    const yesterday = getRelativeMemoryDate(-1);
    const { generateDailyIndex } = await import('../../../../packages/ai/services/memory-content-gen');
    const ws = await WorkspacesRepo.getDefault();
    if (ws?.rootPath) {
      const contentGenDb = {
        listNotesByDate: (date: string, workspaceId?: string) => MemoryNoteRepo.listByDate(date, workspaceId),
        listNotesByWorkspace: (workspaceId: string, limit?: number, offset?: number) => MemoryNoteRepo.listByWorkspace(workspaceId, limit, offset),
        listAllTopics: (workspaceId?: string, limit?: number) => MemoryTopicRepo.listAll(workspaceId, limit),
        listNotesByTopicId: (topicId: string, workspaceId?: string, limit?: number) => MemoryNoteRepo.listByTopicId(topicId, workspaceId, limit)
      };
      const result = await generateDailyIndex(yesterday, ws.rootPath, contentGenDb, ws.id);
      if (result.noteCount > 0) {
        console.log(`[MemoryWorker] Generated daily index for ${yesterday}: ${result.noteCount} notes`);
      }
    }
  } catch (e) {
    console.warn('[MemoryWorker] Daily index generation failed:', e);
  }
}

// ━━ Init ━━

/**
 * 初始化记忆提取 worker：
 * 1. 注册 executor 到 queue
 * 2. 监听 AGENT_LOOP_COMPLETE 事件 — agent 工具循环结束后精确触发（主路径）
 * 3. 监听 SPRITE_AI_COMPLETE 事件 — 兼容旧路径 / 非 Pi runtime
 * 4. 启动补偿检查 — 检测并修复漏跑的日终提取
 * 5. 启动每日维护定时器 — heat 衰减 + 日终提取
 */
export function initMemoryExtractionWorker(): void {
  memoryExtractionQueue.setExecutor(executeJob);

  // 主路径：agent 工具循环结束
  eventManager.on(AppEvent.AGENT_LOOP_COMPLETE, onAgentLoopComplete);
  // 兼容路径：普通对话完成（节流保证不会与主路径重复）
  eventManager.on(AppEvent.SPRITE_AI_COMPLETE, onConversationComplete);

  // 启动补偿：检查并修复漏跑的日终提取（延迟 10 秒，避免阻塞启动）
  setTimeout(() => {
    compensateMissedExtractions().catch((e) => console.error('[MemoryWorker] Compensation failed:', e));
  }, 10_000);

  // 每日维护定时器：每 30 分钟检查一次日终提取和 heat 衰减
  setInterval(
    () => {
      memoryDailyMaintenanceTick().catch((e) => console.error('[MemoryWorker] Daily maintenance failed:', e));
    },
    30 * 60 * 1000
  );

  console.log('[MemoryWorker] Extraction worker initialized (agent-loop-complete + legacy + daily-maintenance)');
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
    gemini: 'gemini-2.0-flash'
  };
  return fastModels[providerId];
}

/** 获取日期的下一天（YYYY-MM-DD 格式） */
function getNextDate(dateStr: string): string {
  return getNextMemoryDate(dateStr);
}

/** 计算两个日期之间的天数差 */
function getDaysBetween(start: string, end: string): number {
  const s = new Date(start + 'T00:00:00').getTime();
  const e = new Date(end + 'T00:00:00').getTime();
  return Math.round((e - s) / 86400000);
}
