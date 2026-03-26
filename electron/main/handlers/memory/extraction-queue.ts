/**
 * Memory Extraction Queue
 * 串行执行提取任务，支持优先级排序、去重、取消。
 * 模式参考 electron/main/handlers/embedding/queue.ts
 */

import { randomUUID } from 'node:crypto';

import { MemorySyncJobRepo } from '../../db/memory-repositories';
import type { ExtractionJobParams, ExtractionResult, MemorySyncJobType } from '../../../../packages/ai/services/memory-types';

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
  }

  /** 入队一个提取任务 */
  async enqueue(params: ExtractionJobParams): Promise<string> {
    // 去重：同一类型 + 同日期 + 同 workspace 不重复入队
    const duplicate = this.queue.find(
      (j) => j.jobType === params.jobType && j.targetDate === params.targetDate && j.workspaceId === params.workspaceId && j.status === 'queued'
    );
    if (duplicate) return duplicate.id;

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

    // 持久化到 DB
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
      console.warn('[MemoryQueue] Failed to persist job to DB:', e);
    }

    this.processNext();
    return id;
  }

  /** 取消任务 */
  cancel(jobId: string): boolean {
    const inQueue = this.queue.findIndex((j) => j.id === jobId);
    if (inQueue >= 0) {
      this.queue.splice(inQueue, 1);
      MemorySyncJobRepo.updateStatus(jobId, 'cancelled').catch(() => {});
      return true;
    }
    if (this.running?.id === jobId) {
      this.running.abortController?.abort();
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
      running: this.running
        ? { ...this.running, abortController: undefined }
        : null,
      queued: this.queue.map((j) => ({ ...j, abortController: undefined }))
    };
  }

  private async processNext(): Promise<void> {
    if (this.running) return;
    if (!this.executor) {
      console.warn('[MemoryQueue] No executor registered, skipping');
      return;
    }

    const next = this.queue.shift();
    if (!next) return;

    this.running = next;
    next.status = 'running';
    next.abortController = new AbortController();

    const startedAt = Date.now();
    await MemorySyncJobRepo.updateStatus(next.id, 'running', { startedAt } as any).catch(() => {});

    try {
      const result = await this.executor(next, next.abortController.signal);
      next.status = 'completed';

      await MemorySyncJobRepo.updateStatus(next.id, 'completed', {
        completedAt: Date.now(),
        notesCreated: result.stats.notesCreated,
        notesUpdated: result.stats.notesUpdated,
        topicsCreated: result.stats.topicsCreated,
        edgesCreated: result.stats.edgesCreated,
        keywordsCreated: result.stats.keywordsCreated
      } as any).catch(() => {});

      console.log(`[MemoryQueue] Job ${next.id} completed:`, result.stats);
    } catch (err: any) {
      if (err?.name === 'AbortError' || next.abortController.signal.aborted) {
        next.status = 'cancelled';
        await MemorySyncJobRepo.updateStatus(next.id, 'cancelled').catch(() => {});
        console.log(`[MemoryQueue] Job ${next.id} cancelled`);
      } else {
        next.status = 'error';
        await MemorySyncJobRepo.updateStatus(next.id, 'failed', {
          errorMessage: err?.message || String(err)
        } as any).catch(() => {});
        console.error(`[MemoryQueue] Job ${next.id} failed:`, err);
      }
    } finally {
      this.running = null;
      // 处理下一个（下一 tick，避免递归栈溢出）
      setImmediate(() => this.processNext());
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
