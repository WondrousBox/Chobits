import { generateMemoryIndex } from '../../../../packages/ai/services/memory-content-gen';
import { clearCriticalFactsCache } from '../../../../packages/ai/services/memory-auto-recall';
import { clearMemorySearchCache } from '../../../../packages/ai/services/memory-retrieval-service';
import { logMemoryTrace, shortTraceId } from '../../../../packages/ai/services/memory-trace';
import { MemoryNoteRepo, MemoryTopicRepo } from '../../db/memory-repositories';
import { WorkspacesRepo } from '../../db/repositories';
import { syncSpritePurposeRetrospectiveToMemory } from './purpose-retrospective-memory-sync';

const TAG = '[MemoryIndexSync]';

export interface MemoryIndexRefreshOptions {
  trigger?: string;
  jobType?: string;
  conversationIds?: string[];
  purposeRetrospectiveDate?: string;
}

export interface MemoryIndexRefreshResult {
  ok: boolean;
  reason?: string;
  filePath?: string;
  indexFilePath?: string;
  topicCount?: number;
  noteCount?: number;
  selectedCount?: number;
}

const contentGenDb = {
  listNotesByDate: (date: string, workspaceId?: string) => MemoryNoteRepo.listByDate(date, workspaceId),
  listNotesByWorkspace: (workspaceId: string, limit?: number, offset?: number) => MemoryNoteRepo.listByWorkspace(workspaceId, limit, offset),
  listAllTopics: (workspaceId?: string, limit?: number) => MemoryTopicRepo.listAll(workspaceId, limit),
  listNotesByTopicId: (topicId: string, workspaceId?: string, limit?: number) => MemoryNoteRepo.listByTopicId(topicId, workspaceId, limit)
};

export async function refreshMemoryIndexForWorkspace(workspaceId: string, options: MemoryIndexRefreshOptions = {}): Promise<MemoryIndexRefreshResult> {
  const workspaceKey = shortTraceId(workspaceId);
  const trigger = options.trigger || 'unknown';

  console.log(`${TAG} Refreshing memory/MEMORY.md (+ memory/INDEX.md): ws=${workspaceId}, trigger=${trigger}, jobType=${options.jobType || '(none)'}`);
  logMemoryTrace({
    conversationCount: options.conversationIds?.length || 0,
    event: 'memory_index.refresh.start',
    jobType: options.jobType,
    trigger,
    workspaceId: workspaceKey
  });

  const ws = await WorkspacesRepo.getById(workspaceId);
  if (!ws?.rootPath) {
    console.warn(`${TAG} Skipped refresh: workspace ${workspaceId} has no rootPath`);
    logMemoryTrace(
      {
        event: 'memory_index.refresh.skip',
        reason: 'workspace_root_missing',
        trigger,
        workspaceId: workspaceKey
      },
      'warn'
    );
    return { ok: false, reason: 'workspace_root_missing' };
  }

  try {
    await syncPurposeRetrospectiveBeforeIndex(workspaceId, trigger, options.purposeRetrospectiveDate);
    const result = await generateMemoryIndex(ws.rootPath, contentGenDb, workspaceId);
    clearCriticalFactsCache();
    clearMemorySearchCache(workspaceId);
    console.log(
      `${TAG} Refreshed memory/MEMORY.md: ws=${workspaceId}, topics=${result.topicCount}, notes=${result.noteCount}, selected=${result.selectedCount}, path=${result.filePath}, index=${result.indexFilePath}`
    );
    logMemoryTrace({
      event: 'memory_index.refresh.result',
      filePath: result.filePath,
      indexFilePath: result.indexFilePath,
      jobType: options.jobType,
      noteCount: result.noteCount,
      selectedCount: result.selectedCount,
      topicCount: result.topicCount,
      trigger,
      workspaceId: workspaceKey
    });
    return { ok: true, ...result };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`${TAG} Failed to refresh memory/MEMORY.md:`, message);
    logMemoryTrace(
      {
        error: message,
        event: 'memory_index.refresh.error',
        jobType: options.jobType,
        trigger,
        workspaceId: workspaceKey
      },
      'error'
    );
    return { ok: false, reason: 'generate_failed' };
  }
}

async function syncPurposeRetrospectiveBeforeIndex(workspaceId: string, trigger: string, date?: string): Promise<void> {
  try {
    const result = await syncSpritePurposeRetrospectiveToMemory(date ? { date, workspaceId } : { workspaceId });
    if (result.ok && !result.skipped) {
      console.log(`${TAG} Synced sprite purpose retrospective note before index refresh: ws=${workspaceId}, date=${result.date}, action=${result.action}, path=${result.filePath}`);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(`${TAG} Sprite purpose retrospective sync skipped before index refresh (trigger=${trigger}): ${message}`);
  }
}
