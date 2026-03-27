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
import type { ExtractionResult, MemoryChatFn, MemoryNoteFrontmatter } from '../../../../packages/ai/services/memory-types';
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
 * 将 PiTaskChatFunction（流式）适配为 MemoryChatFn（非流式）
 */
function adaptChatFn(piChatFn: PiTaskChatFunction): MemoryChatFn {
  return async (prompt: string, signal?: AbortSignal): Promise<string> => {
    let fullText = '';
    await piChatFn(
      prompt,
      (event) => {
        if (event.type === 'delta' && event.data.text) {
          fullText += event.data.text;
        }
      },
      signal
    );
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
  const emptyResult: ExtractionResult = {
    succeeded: [],
    failed: [],
    stats: { notesCreated: 0, notesUpdated: 0, topicsCreated: 0, edgesCreated: 0, keywordsCreated: 0 }
  };

  // 获取 workspace
  const ws = await WorkspacesRepo.getById(job.workspaceId);
  if (!ws?.rootPath) {
    console.warn('[MemoryWorker] Workspace not found:', job.workspaceId);
    return emptyResult;
  }

  // 确定要处理的对话 IDs
  let conversationIds = job.targetConversationIds || [];
  if (!conversationIds.length) {
    // 没有指定时，取今天的所有对话
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
  }

  if (!conversationIds.length) {
    console.log('[MemoryWorker] No conversations to process');
    return emptyResult;
  }

  // 创建 chatFn
  const runtime = await createPiTaskChatRuntimeFromRequest({
    providerId: 'openai',
    agentId: 'memory-extraction',
    maxTokens: 4000
  });
  const chatFn = adaptChatFn(runtime.chatFn);
  console.log(`[MemoryWorker] Using model: ${runtime.modelId}`);

  // 构建上下文
  const date = job.targetDate || new Date().toISOString().slice(0, 10);
  const ctx = {
    chatFn,
    workspaceId: job.workspaceId,
    workspaceRoot: ws.rootPath,
    date,
    signal,
    onProgress: (progress: any) => {
      eventManager.emit(AppEvent.MEMORY_EXTRACTION_PROGRESS, {
        jobId: job.id,
        ...progress
      });
    }
  };

  eventManager.emit(AppEvent.MEMORY_EXTRACTION_STARTED, { jobId: job.id });

  try {
    const result = await runExtractionPipeline({ conversationIds }, ctx, {
      listMessages: async (convId) => {
        const msgs = await ChatRepo.listMessages(convId, 1000, 0);
        return msgs.map((m: any) => ({
          role: m.role,
          content: m.content,
          seq: m.seq,
          createdAt: m.createdAt ?? Date.now()
        }));
      },
      getConversation: async (convId) => {
        const conv = await ChatRepo.ensureConversation({ id: convId });
        return conv ? { id: conv.id, title: conv.title } : undefined;
      },
      findExistingNote,
      dbOps: buildWriteDbOps()
    });

    eventManager.emit(AppEvent.MEMORY_EXTRACTION_COMPLETED, {
      jobId: job.id,
      stats: result.stats
    });

    return result;
  } catch (err: any) {
    eventManager.emit(AppEvent.MEMORY_EXTRACTION_FAILED, {
      jobId: job.id,
      error: err?.message
    });
    throw err;
  }
}

// ━━ Event Listener ━━

function onConversationComplete(data: any): void {
  const conversationId = data?.conversationId;
  if (!conversationId) return;

  // 节流：同一会话 30 分钟内不重复触发
  const lastTime = lastTriggerTime.get(conversationId);
  if (lastTime && Date.now() - lastTime < MIN_TRIGGER_INTERVAL) return;

  // 延迟检查：等消息充分积累后再决定是否入队
  setTimeout(async () => {
    try {
      const messages = await ChatRepo.listMessages(conversationId, 1000, 0);
      const userAssistantCount = messages.filter((m: any) => m.role === 'user' || m.role === 'assistant').length;

      if (userAssistantCount < MIN_NEW_MESSAGES) return;

      // 查找 workspace
      const conv = await ChatRepo.ensureConversation({ id: conversationId });
      const workspaceId = conv?.workspaceId || (await WorkspacesRepo.getDefault())?.id;
      if (!workspaceId) return;

      lastTriggerTime.set(conversationId, Date.now());

      await memoryExtractionQueue.enqueue({
        jobType: 'conversation_close',
        workspaceId,
        targetConversationIds: [conversationId]
      });

      console.log(`[MemoryWorker] Enqueued extraction for conversation ${conversationId}`);
    } catch (e) {
      console.warn('[MemoryWorker] Failed to enqueue after conversation complete:', e);
    }
  }, 5000); // 5 秒延迟，等待消息落盘
}

// ━━ Init ━━

/**
 * 初始化记忆提取 worker：
 * 1. 注册 executor 到 queue
 * 2. 监听 SPRITE_AI_COMPLETE 事件，自动触发提取
 */
export function initMemoryExtractionWorker(): void {
  // 注册执行器
  memoryExtractionQueue.setExecutor(executeJob);

  // 监听对话完成事件
  eventManager.on(AppEvent.SPRITE_AI_COMPLETE, onConversationComplete);

  console.log('[MemoryWorker] Extraction worker initialized');
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
