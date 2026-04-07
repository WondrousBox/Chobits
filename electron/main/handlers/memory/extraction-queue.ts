/**
 * Memory Extraction Queue
 * 串行执行提取任务，支持优先级排序、去重、取消。
 * 模式参考 electron/main/handlers/embedding/queue.ts
 */

import { randomUUID } from 'node:crypto';

import type { ExtractionJobParams, ExtractionResult, MemorySyncJobType } from '../../../../packages/ai/services/memory-types';
import { MemorySyncJobRepo } from '../../db/memory-repositories';

export type QueuedJob = ExtractionJobParams & {
  id: string;
  status: 'queued' | 'running' | 'completed' | 'error' | 'cancelled';
  priority: number; // 越小越优先
  createdAt: number;
  abortController?: AbortController;
};

export type ExtractionExecutor = (job: QueuedJob, signal: AbortSignal) => Promise<ExtractionResult>;

export class MemoryExtractionQueue {
  private queue: QueuedJob[] = [];
  private running: QueuedJob | null = null;
  private executor: ExtractionExecutor | null = null;

  /** 注册执行器（由 extraction-worker 提供） */
  setExecutor(executor: ExtractionExecutor): void {
    this.executor = executor;
    console.log('[MemoryQueue] Executor registered');
  }

  /** 入队一个提取任务 */
  async enqueue(params: ExtractionJobParams): Promise<string> {
    const TAG = '[MemoryQueue:enqueue]';

    // 去重：conversation_close 用 conversationIds 去重，其它类型用日期+workspace 去重
    const duplicate = this.queue.find((j) => {
      if (j.status !== 'queued') return false;
      if (j.jobType !== params.jobType || j.workspaceId !== params.workspaceId) return false;

      if (params.jobType === 'conversation_close') {
        const existingIds = new Set(j.targetConversationIds || []);
        return (params.targetConversationIds || []).every((id) => existingIds.has(id));
      }
      return j.targetDate === params.targetDate;
    });

    if (duplicate) {
      console.log(`${TAG} Deduplicated: existing job ${duplicate.id} covers this request (type=${params.jobType})`);
      return duplicate.id;
    }

    const id = randomUUID();
    const priority = jobPriority(params.jobType);

    const job: QueuedJob = {
      ...params,
      id,
      status: 'queued',
      priority,
      createdAt: Date.now()
    };

    this.queue.push(job);
    this.queue.sort((a, b) => a.priority - b.priority || a.createdAt - b.createdAt);

    console.log(`${TAG} Job ${id} enqueued: type=${params.jobType}, ws=${params.workspaceId}, convIds=${JSON.stringify(params.targetConversationIds)}, queueLen=${this.queue.length}, running=${!!this.running}`);

    try {
      await MemorySyncJobRepo.create({
        id,
        jobType: params.jobType,
        workspaceId: params.workspaceId,
        targetDate: params.targetDate,
        targetConversationIds: JSON.stringify(params.targetConversationIds),
        status: 'pending'
      });
    } catch (e) {
      console.warn(`${TAG} Failed to persist job ${id} to DB:`, e);
    }

    // fire-and-forget but log errors
    this.processNext().catch((e) => {
      console.error(`${TAG} processNext() threw unexpectedly:`, e);
    });
    return id;
  }

  /** 取消任务 */
  cancel(jobId: string): boolean {
    const inQueue = this.queue.findIndex((j) => j.id === jobId);
    if (inQueue >= 0) {
      this.queue.splice(inQueue, 1);
      MemorySyncJobRepo.updateStatus(jobId, 'cancelled').catch(() => { });
      console.log(`[MemoryQueue] Job ${jobId} cancelled (was queued)`);
      return true;
    }
    if (this.running?.id === jobId) {
      this.running.abortController?.abort();
      console.log(`[MemoryQueue] Job ${jobId} abort requested (was running)`);
      return true;
    }
    return false;
  }

  /** 获取当前状态 */
  getStatus(): {
    running: QueuedJob | null;
    queued: QueuedJob[];
  } {
    return {
      running: this.running ? { ...this.running, abortController: undefined } : null,
      queued: this.queue.map((j) => ({ ...j, abortController: undefined }))
    };
  }

  /** 是否有正在运行或排队中的任务 */
  isRunning(): boolean {
    return this.running !== null || this.queue.length > 0;
  }

  private async processNext(): Promise<void> {
    const TAG = '[MemoryQueue:process]';

    if (this.running) {
      console.log(`${TAG} Already running job ${this.running.id}, queued=${this.queue.length}`);
      return;
    }
    if (!this.executor) {
      console.warn(`${TAG} No executor registered, cannot process! queued=${this.queue.length}`);
      return;
    }

    const next = this.queue.shift();
    if (!next) {
      console.log(`${TAG} Queue empty, nothing to process`);
      return;
    }

    this.running = next;
    next.status = 'running';
    next.abortController = new AbortController();

    const startedAt = Date.now();
    console.log(`${TAG} ▶ Starting job ${next.id} (type=${next.jobType}, convIds=${JSON.stringify(next.targetConversationIds)})`);
    await MemorySyncJobRepo.updateStatus(next.id, 'running', { startedAt } as any).catch(() => { });

    try {
      const result = await this.executor(next, next.abortController.signal);
      next.status = 'completed';

      const elapsed = ((Date.now() - startedAt) / 1000).toFixed(1);
      await MemorySyncJobRepo.updateStatus(next.id, 'completed', {
        completedAt: Date.now(),
        notesCreated: result.stats.notesCreated,
        notesUpdated: result.stats.notesUpdated,
        topicsCreated: result.stats.topicsCreated,
        edgesCreated: result.stats.edgesCreated,
        keywordsCreated: result.stats.keywordsCreated
      } as any).catch(() => { });

      console.log(`${TAG} ✓ Job ${next.id} completed in ${elapsed}s:`, result.stats);
    } catch (err: any) {
      const elapsed = ((Date.now() - startedAt) / 1000).toFixed(1);
      if (err?.name === 'AbortError' || next.abortController.signal.aborted) {
        next.status = 'cancelled';
        await MemorySyncJobRepo.updateStatus(next.id, 'cancelled').catch(() => { });
        console.log(`${TAG} Job ${next.id} cancelled after ${elapsed}s`);
      } else {
        next.status = 'error';
        await MemorySyncJobRepo.updateStatus(next.id, 'failed', {
          errorMessage: err?.message || String(err)
        } as any).catch(() => { });
        console.error(`${TAG} ✗ Job ${next.id} FAILED after ${elapsed}s:`, err?.message || err);
        if (err?.stack) console.error(err.stack);
      }
    } finally {
      this.running = null;
      setImmediate(() => {
        this.processNext().catch((e) => {
          console.error(`${TAG} processNext() threw unexpectedly:`, e);
        });
      });
    }
  }
}

function jobPriority(jobType: MemorySyncJobType): number {
  switch (jobType) {
    case 'manual_reindex':
      return 0;
    case 'conversation_close':
      return 1;
    case 'file_change_reindex':
      return 1;
    case 'daily_extraction':
      return 2;
    default:
      return 3;
  }
}

/** 单例 */
export const memoryExtractionQueue = new MemoryExtractionQueue();
