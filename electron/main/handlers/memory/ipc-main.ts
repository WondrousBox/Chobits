/**
 * Memory System IPC Handlers
 * 注册 memory:* IPC channels，连接 retrieval service + extraction queue 到具体 DB repositories。
 * 同时注册 memory-auto-recall 系统提示词 enricher，在每轮对话前自动检索相关记忆。
 */

import { ipcMain } from 'electron';

import type { RetrievalDbDeps } from '../../../../packages/ai/services/memory-retrieval-service';
import * as retrieval from '../../../../packages/ai/services/memory-retrieval-service';
import { MemoryEdgeRepo, MemoryFTSRepo, MemoryKeywordRepo, MemoryNoteKeywordRepo, MemoryNoteRepo, MemorySectionRepo, MemorySyncJobRepo, MemoryTopicRepo } from '../../db/memory-repositories';
import { WorkspacesRepo } from '../../db/repositories';
import { memoryExtractionQueue } from './extraction-queue';
import { initMemoryExtractionWorker } from './extraction-worker';
import { initMemoryAutoRecallEnricher } from './memory-auto-recall-enricher';
import { cleanupMemoryForConversations, clearAllMemory } from './memory-cleanup';

// ━━ DB Deps Adapter ━━

function buildRetrievalDbDeps(): RetrievalDbDeps {
  return {
    // Topic
    searchTopics: (term, workspaceId, limit) => MemoryTopicRepo.search(term, workspaceId, limit) as any,
    getTopicById: (id) => MemoryTopicRepo.getById(id),
    listTopicChildren: (parentId) => MemoryTopicRepo.listChildren(parentId),
    listTopicRoots: (workspaceId, limit) => MemoryTopicRepo.listRoots(workspaceId, limit),
    // Keyword
    findKeywordsByTopic: (topicId) => MemoryKeywordRepo.findByTopicId(topicId),
    findKeywordByCanonical: (canonical, workspaceId) => MemoryKeywordRepo.findByCanonical(canonical, workspaceId),
    findKeywordByAlias: (alias, workspaceId) => MemoryKeywordRepo.findByAlias(alias, workspaceId),
    // Edges
    findAdjacentTopics: (topicIds, limit) => MemoryEdgeRepo.findAdjacentTopics(topicIds, limit),
    findEdgesBySource: (sourceType, sourceId, relationType) => MemoryEdgeRepo.findBySource(sourceType, sourceId, relationType),
    // Notes
    getNoteById: (id) => MemoryNoteRepo.getById(id),
    listNotesByWorkspace: (workspaceId, limit, offset) => MemoryNoteRepo.listByWorkspace(workspaceId, limit, offset),
    listNotesByDateRange: (start, end, workspaceId) => MemoryNoteRepo.listByDateRange(start, end, workspaceId),
    listNotesByTopicId: (topicId, workspaceId, limit) => MemoryNoteRepo.listByTopicId(topicId, workspaceId, limit),
    // Direct search (LIKE-based, CJK fallback)
    searchNotesByTerms: (terms, workspaceId, limit) => MemoryNoteRepo.searchByTerms(terms, workspaceId, limit),
    // Sections
    listSectionsByNote: (noteId) => MemorySectionRepo.listByNote(noteId),
    // FTS
    ftsSearch: (query, opts) => MemoryFTSRepo.search(query, opts),
    // Workspace
    getWorkspaceRoot: async (workspaceId) => {
      const ws = await WorkspacesRepo.getById(workspaceId);
      return ws?.rootPath ?? null;
    }
  };
}

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
      }
    ) => {
      try {
        return await retrieval.search(params.query, params.workspaceId, db, {
          maxResults: params.maxResults,
          includeContent: params.includeContent,
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

  ipcMain.handle('memory:rebuildIndex', async () => {
    try {
      const count = await MemoryFTSRepo.rebuildAll();
      return { success: true, notesIndexed: count };
    } catch (e: any) {
      console.error('[Memory] rebuildIndex failed:', e);
      return { success: false, error: e?.message };
    }
  });

  ipcMain.handle('memory:deleteNote', async (_event, noteId: string) => {
    try {
      // 删除 FTS 条目
      MemoryFTSRepo.deleteByNote(noteId);
      // 删除边
      await MemoryEdgeRepo.deleteByNote(noteId);
      // 删除 note-keyword 关联
      await MemoryNoteKeywordRepo.deleteByNote(noteId);
      // 软删除 note（cascade 删 sections）
      await MemoryNoteRepo.softDelete([noteId]);
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
      return { noteCount, topicCount, edgeCount };
    } catch (e: any) {
      console.error('[Memory] stats failed:', e);
      return { noteCount: 0, topicCount: 0, edgeCount: 0 };
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

  console.log('[Memory] IPC handlers initialized');
}
