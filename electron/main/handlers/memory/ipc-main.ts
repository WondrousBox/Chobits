/**
 * Memory System IPC Handlers
 * 注册 memory:* IPC channels，连接 retrieval service + extraction queue 到具体 DB repositories。
 * 同时注册 memory-auto-recall 系统提示词 enricher，在每轮对话前自动检索相关记忆。
 */

import { ipcMain } from 'electron';

import * as retrieval from '../../../../packages/ai/services/memory-retrieval-service';
import { MemoryFTSRepo } from '../../db/memory-fts-repo';
import { MemoryEdgeRepo, MemoryKeywordRepo, MemoryNoteKeywordRepo, MemoryNoteRepo, MemorySectionRepo, MemorySyncJobRepo, MemoryTopicRepo } from '../../db/memory-repositories';
import { WorkspacesRepo } from '../../db/repositories';
import { memoryExtractionQueue } from './extraction-queue';
import { initMemoryExtractionWorker } from './extraction-worker';
import { initMemoryAutoRecallEnricher } from './memory-auto-recall-enricher';
import { cleanupMemoryForConversations, clearAllMemory } from './memory-cleanup';
import { buildRetrievalDbDeps } from './retrieval-db-deps';

// ━━ DB Deps Adapter ━━

// ━━ IPC Registration ━━

export function initMemoryHandlers(): void {
  const db = buildRetrievalDbDeps();

  // ━━ Retrieval ━━

  ipcMain.handle(
    'memory:search',
    async (
      _event,
      params: {
        query: string;
        workspaceId: string;
        topicFilter?: string[];
        dateRange?: { start?: string; end?: string };
        maxResults?: number;
        includeContent?: boolean;
        debug?: boolean;
      }
    ) => {
      try {
        return await retrieval.search(params.query, params.workspaceId, db, {
          maxResults: params.maxResults,
          includeContent: params.includeContent,
          debug: params.debug,
          topicFilter: params.topicFilter,
          dateRange: params.dateRange
        });
      } catch (e: any) {
        console.error('[Memory] search failed:', e);
        return { topics: [], notes: [], totalFound: 0 };
      }
    }
  );

  ipcMain.handle(
    'memory:get',
    async (
      _event,
      params: {
        noteId: string;
        section?: string;
        lineRange?: { start: number; end: number };
      }
    ) => {
      try {
        return await retrieval.get(params.noteId, db, {
          section: params.section,
          lineRange: params.lineRange
        });
      } catch (e: any) {
        console.error('[Memory] get failed:', e);
        return null;
      }
    }
  );

  ipcMain.handle(
    'memory:topics',
    async (
      _event,
      params: {
        topicId?: string;
        action?: 'children' | 'related' | 'notes';
        workspaceId?: string;
        limit?: number;
      }
    ) => {
      try {
        return await retrieval.browseTopics(db, {
          topicId: params.topicId,
          action: params.action,
          workspaceId: params.workspaceId,
          limit: params.limit
        });
      } catch (e: any) {
        console.error('[Memory] topics failed:', e);
        return {};
      }
    }
  );

  ipcMain.handle(
    'memory:listNotes',
    async (
      _event,
      params: {
        workspaceId: string;
        limit?: number;
        offset?: number;
      }
    ) => {
      try {
        return await MemoryNoteRepo.listByWorkspace(params.workspaceId, params.limit ?? 100, params.offset ?? 0);
      } catch (e: any) {
        console.error('[Memory] listNotes failed:', e);
        return [];
      }
    }
  );

  // ━━ Sync / Extraction ━━

  ipcMain.handle('memory:syncStatus', async () => {
    try {
      const queueStatus = memoryExtractionQueue.getStatus();
      const latestJob = await MemorySyncJobRepo.getLatest();
      return { queue: queueStatus, latestJob };
    } catch (e: any) {
      console.error('[Memory] syncStatus failed:', e);
      return { queue: { running: null, queued: [] }, latestJob: null };
    }
  });

  ipcMain.handle('memory:cancelSync', async (_event, jobId?: string) => {
    try {
      if (jobId) {
        const cancelled = memoryExtractionQueue.cancel(jobId);
        return { success: cancelled, jobId };
      }
      // Cancel the currently running job
      const status = memoryExtractionQueue.getStatus();
      if (status.running) {
        const cancelled = memoryExtractionQueue.cancel(status.running.id);
        return { success: cancelled, jobId: status.running.id };
      }
      return { success: false, error: 'No running job to cancel' };
    } catch (e: any) {
      console.error('[Memory] cancelSync failed:', e);
      return { success: false, error: e?.message };
    }
  });

  ipcMain.handle('memory:getMetrics', async (_event, params?: { workspaceId?: string }) => {
    try {
      const wsId = params?.workspaceId || (await WorkspacesRepo.getDefault())?.id;

      // Extraction metrics from sync jobs
      const allJobs = wsId ? await MemorySyncJobRepo.findByWorkspace(wsId) : await MemorySyncJobRepo.getAll();
      const completed = allJobs.filter((j: any) => j.status === 'completed');
      const failed = allJobs.filter((j: any) => j.status === 'failed');

      // Note/topic/edge counts
      const [noteCount, topicCount, edgeCount] = await Promise.all([MemoryNoteRepo.count(wsId), MemoryTopicRepo.count(wsId), MemoryEdgeRepo.count(wsId)]);

      return {
        extraction: {
          totalJobs: allJobs.length,
          completedJobs: completed.length,
          failedJobs: failed.length,
          lastCompletedAt: completed[0]?.completedAt ?? null,
          lastFailedAt: failed[0]?.createdAt ?? null,
          totalNotesCreated: completed.reduce((sum: number, j: any) => sum + (j.notesCreated ?? 0), 0),
          totalNotesUpdated: completed.reduce((sum: number, j: any) => sum + (j.notesUpdated ?? 0), 0)
        },
        index: { noteCount, topicCount, edgeCount },
        queue: memoryExtractionQueue.getStatus()
      };
    } catch (e: any) {
      console.error('[Memory] getMetrics failed:', e);
      return { extraction: {}, index: {}, queue: { running: null, queued: [] } };
    }
  });

  ipcMain.handle(
    'memory:triggerSync',
    async (
      _event,
      params?: {
        workspaceId?: string;
        date?: string;
        conversationIds?: string[];
        force?: boolean;
      }
    ) => {
      try {
        const ws = params?.workspaceId || (await WorkspacesRepo.getDefault())?.id;
        if (!ws) return { queued: false, error: 'No workspace' };

        const jobId = await memoryExtractionQueue.enqueue({
          jobType: params?.force ? 'manual_reindex' : 'daily_extraction',
          workspaceId: ws,
          targetDate: params?.date,
          targetConversationIds: params?.conversationIds || []
        });
        return { queued: true, jobId };
      } catch (e: any) {
        console.error('[Memory] triggerSync failed:', e);
        return { queued: false, error: e?.message };
      }
    }
  );

  ipcMain.handle(
    'memory:backfillRecallCues',
    async (
      _event,
      params?: {
        workspaceId?: string;
        noteIds?: string[];
        limit?: number;
        providerId?: string;
        providerPresetId?: string;
      }
    ) => {
      try {
        const ws = params?.workspaceId || (await WorkspacesRepo.getDefault())?.id;
        if (!ws) return { queued: false, error: 'No workspace' };

        const jobId = await memoryExtractionQueue.enqueue({
          backfillLimit: params?.limit,
          jobType: 'recall_cue_backfill',
          providerId: params?.providerId,
          providerPresetId: params?.providerPresetId,
          targetConversationIds: [],
          targetNoteIds: params?.noteIds || [],
          workspaceId: ws
        });

        return { queued: true, jobId };
      } catch (e: any) {
        console.error('[Memory] backfillRecallCues failed:', e);
        return { queued: false, error: e?.message };
      }
    }
  );

  ipcMain.handle('memory:rebuildIndex', async () => {
    try {
      const count = await MemoryFTSRepo.rebuildAll();
      retrieval.clearMemorySearchCache();
      return { success: true, notesIndexed: count };
    } catch (e: any) {
      console.error('[Memory] rebuildIndex failed:', e);
      return { success: false, error: e?.message };
    }
  });

  ipcMain.handle('memory:validateIndex', async (_event, params?: { workspaceId?: string; issueLimit?: number }) => {
    try {
      const { validateMemoryIndex } = await import('./memory-index-audit');
      const wsId = params?.workspaceId || (await WorkspacesRepo.getDefault())?.id;
      if (!wsId) return { ok: false, error: 'no workspace' };
      const report = await validateMemoryIndex(wsId, { issueLimit: params?.issueLimit });
      return { ok: report.ok, report };
    } catch (e: any) {
      console.error('[Memory] validateIndex failed:', e);
      return { ok: false, error: e?.message };
    }
  });

  ipcMain.handle('memory:deleteNote', async (_event, noteId: string) => {
    try {
      const note = await MemoryNoteRepo.getById(noteId);
      MemoryFTSRepo.deleteByNote(noteId);
      await MemoryEdgeRepo.deleteByNote(noteId);
      await MemoryEdgeRepo.deleteByEvidenceNote(noteId);
      await MemoryNoteKeywordRepo.deleteByNote(noteId);
      await MemorySectionRepo.deleteByNote(noteId);
      await MemoryNoteRepo.softDelete([noteId]);
      retrieval.clearMemorySearchCache(note?.workspaceId || undefined);
      return { success: true };
    } catch (e: any) {
      console.error('[Memory] deleteNote failed:', e);
      return { success: false, error: e?.message };
    }
  });

  ipcMain.handle(
    'memory:graphData',
    async (
      _event,
      params?: {
        topicId?: string;
        workspaceId?: string;
        includeNotes?: boolean;
        includeKeywords?: boolean;
        maxTopics?: number;
        maxEdges?: number;
        maxKeywords?: number;
      }
    ) => {
      try {
        const maxTopics = params?.maxTopics ?? 200;
        const maxEdges = params?.maxEdges ?? 500;
        const maxKeywords = params?.maxKeywords ?? 300;

        // 解析 workspaceId，未提供时使用默认 workspace
        let wsId = params?.workspaceId;
        if (!wsId) {
          const defaultWs = await WorkspacesRepo.getDefault();
          wsId = defaultWs?.id;
        }

        await MemoryEdgeRepo.pruneOrphanedEvidenceEdges(wsId);

        // 获取主题节点
        const topics = params?.topicId ? await MemoryTopicRepo.listChildren(params.topicId) : await MemoryTopicRepo.listAll(wsId, maxTopics);

        // 如果指定了 topicId，也包含该主题本身
        if (params?.topicId) {
          const self = await MemoryTopicRepo.getById(params.topicId);
          if (self) topics.unshift(self);
        }

        // 获取所有边
        const edges = await MemoryEdgeRepo.listAll(wsId, maxEdges);

        // 可选：获取关联的 notes
        let notes: any[] = [];
        if (params?.includeNotes && wsId) {
          notes = await MemoryNoteRepo.listByWorkspace(wsId, 100, 0);
        }

        // 可选：获取关键词和 note-keyword 关联
        let keywords: any[] = [];
        let noteKeywords: any[] = [];
        if (params?.includeKeywords && wsId) {
          keywords = await MemoryKeywordRepo.listAll(wsId, maxKeywords);
          noteKeywords = await MemoryNoteKeywordRepo.listAllByWorkspace(wsId, 2000);
        }

        return { topics, edges, notes, keywords, noteKeywords };
      } catch (e: any) {
        console.error('[Memory] graphData failed:', e);
        return { topics: [], edges: [], notes: [], keywords: [], noteKeywords: [] };
      }
    }
  );

  // ━━ Stats ━━

  ipcMain.handle('memory:stats', async (_event, params?: { workspaceId?: string }) => {
    try {
      const [noteCount, topicCount, edgeCount] = await Promise.all([MemoryNoteRepo.count(params?.workspaceId), MemoryTopicRepo.count(params?.workspaceId), MemoryEdgeRepo.count(params?.workspaceId)]);
      return { noteCount, topicCount, edgeCount, totalNotes: noteCount };
    } catch (e: any) {
      console.error('[Memory] stats failed:', e);
      return { noteCount: 0, topicCount: 0, edgeCount: 0, totalNotes: 0 };
    }
  });

  // ━━ Conversation Delete → Memory Cleanup ━━

  ipcMain.handle('memory:cleanupForConversations', async (_event, params: { conversationIds: string[] }) => {
    try {
      return await cleanupMemoryForConversations(params.conversationIds);
    } catch (e: any) {
      console.error('[Memory] cleanupForConversations failed:', e);
      return { updated: 0, deleted: 0, errors: [e?.message] };
    }
  });

  // ━━ Clear All Memory ━━

  ipcMain.handle('memory:clearAll', async (_event, params?: { workspaceId?: string }) => {
    try {
      return await clearAllMemory(params?.workspaceId);
    } catch (e: any) {
      console.error('[Memory] clearAll failed:', e);
      return { tablesCleared: [], filesDeleted: 0, errors: [e?.message] };
    }
  });

  // 初始化提取 worker（注册 executor + 事件监听）
  initMemoryExtractionWorker();

  // 注册自动记忆召回 enricher（在每轮对话 system prompt 构建阶段自动注入相关记忆）
  initMemoryAutoRecallEnricher(db);

  // ━━ Auto-Recall Management ━━

  ipcMain.handle('memory:clearRecallCache', async (_event, conversationId?: string) => {
    try {
      const { clearRecallCache } = await import('../../../../packages/ai/services/memory-auto-recall');
      clearRecallCache(conversationId);
      return { success: true };
    } catch (e: any) {
      console.error('[Memory] clearRecallCache failed:', e);
      return { success: false, error: e?.message };
    }
  });

  // ━━ Memory Config ━━

  ipcMain.handle('memory:getConfig', async () => {
    try {
      const { getMemoryConfig } = await import('./memory-config');
      return { ok: true, config: getMemoryConfig() };
    } catch (e: any) {
      console.error('[Memory] getConfig failed:', e);
      return { ok: false, error: e?.message };
    }
  });

  ipcMain.handle('memory:setConfig', async (_event, patch: Record<string, unknown>) => {
    try {
      const { setMemoryConfig } = await import('./memory-config');
      const config = setMemoryConfig(patch as any);
      return { ok: true, config };
    } catch (e: any) {
      console.error('[Memory] setConfig failed:', e);
      return { ok: false, error: e?.message };
    }
  });

  // ━━ Content Generation ━━

  const contentGenDb = {
    listNotesByDate: (date: string, workspaceId?: string) => MemoryNoteRepo.listByDate(date, workspaceId),
    listNotesByWorkspace: (workspaceId: string, limit?: number, offset?: number) => MemoryNoteRepo.listByWorkspace(workspaceId, limit, offset),
    listAllTopics: (workspaceId?: string, limit?: number) => MemoryTopicRepo.listAll(workspaceId, limit),
    listNotesByTopicId: (topicId: string, workspaceId?: string, limit?: number) => MemoryNoteRepo.listByTopicId(topicId, workspaceId, limit)
  };

  ipcMain.handle('memory:generateDailyIndex', async (_event, params: { date: string; workspaceId?: string }) => {
    try {
      const { generateDailyIndex } = await import('../../../../packages/ai/services/memory-content-gen');
      const wsId = params.workspaceId || (await WorkspacesRepo.getDefault())?.id;
      if (!wsId) return { ok: false, error: 'no workspace' };
      const ws = await WorkspacesRepo.getById(wsId);
      if (!ws?.rootPath) return { ok: false, error: 'workspace has no root path' };
      const result = await generateDailyIndex(params.date, ws.rootPath, contentGenDb, wsId);
      return { ok: true, ...result };
    } catch (e: any) {
      console.error('[Memory] generateDailyIndex failed:', e);
      return { ok: false, error: e?.message };
    }
  });

  ipcMain.handle('memory:generateTopicArchives', async (_event, params?: { workspaceId?: string }) => {
    try {
      const { generateAllTopicArchives } = await import('../../../../packages/ai/services/memory-content-gen');
      const wsId = params?.workspaceId || (await WorkspacesRepo.getDefault())?.id;
      if (!wsId) return { ok: false, error: 'no workspace' };
      const ws = await WorkspacesRepo.getById(wsId);
      if (!ws?.rootPath) return { ok: false, error: 'workspace has no root path' };
      const result = await generateAllTopicArchives(ws.rootPath, contentGenDb, wsId);
      return { ok: true, ...result };
    } catch (e: any) {
      console.error('[Memory] generateTopicArchives failed:', e);
      return { ok: false, error: e?.message };
    }
  });

  ipcMain.handle('memory:generateMemoryIndex', async (_event, params?: { workspaceId?: string }) => {
    try {
      const { generateMemoryIndex } = await import('../../../../packages/ai/services/memory-content-gen');
      const wsId = params?.workspaceId || (await WorkspacesRepo.getDefault())?.id;
      if (!wsId) return { ok: false, error: 'no workspace' };
      const ws = await WorkspacesRepo.getById(wsId);
      if (!ws?.rootPath) return { ok: false, error: 'workspace has no root path' };
      const result = await generateMemoryIndex(ws.rootPath, contentGenDb, wsId);
      return { ok: true, ...result };
    } catch (e: any) {
      console.error('[Memory] generateMemoryIndex failed:', e);
      return { ok: false, error: e?.message };
    }
  });

  console.log('[Memory] IPC handlers initialized');
}
