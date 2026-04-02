/**
 * User Persona Update Queue
 * 独立串行队列，复用 MemoryExtractionQueue 模式。
 * 支持去重、重试、取消。
 *
 * @see docs/memory-system/user-persona-profile-design.md §10
 */

import { randomUUID } from 'node:crypto';

import type { PersonaJobStatus, PersonaUpdateJobParams, PersonaUpdateResult, PersonaUpdateStatus } from '../../../../packages/ai/services/persona-types';

// ━━ Job 类型 ━━

export interface PersonaQueuedJob extends PersonaUpdateJobParams {
  id: string;
  status: PersonaJobStatus;
  createdAt: number;
  retryCount: number;
  abortController?: AbortController;
}

export type PersonaExecutor = (job: PersonaQueuedJob, signal: AbortSignal) => Promise<PersonaUpdateResult>;

// ━━ 配置 ━━

/** 同 workspace 去重冷却（毫秒） */
const DEDUP_COOLDOWN_MS = 5 * 60 * 1000; // 5 分钟
/** 最大重试次数 */
const MAX_RETRIES = 2;
/** 重试退避 */
const RETRY_DELAYS = [5_000, 20_000]; // 5s, 20s

// ━━ Queue ━━

class PersonaUpdateQueue {
  private queue: PersonaQueuedJob[] = [];
  private running: PersonaQueuedJob | null = null;
  private executor: PersonaExecutor | null = null;
  private lastUpdateTime = new Map<string, number>();

  setExecutor(executor: PersonaExecutor): void {
    this.executor = executor;
    console.log('[PersonaQueue] Executor registered');
  }

  async enqueue(params: PersonaUpdateJobParams): Promise<string> {
    const TAG = '[PersonaQueue:enqueue]';

    // 去重：同 workspace 5 分钟内相同 reason
    const lastTime = this.lastUpdateTime.get(params.workspaceId);
    const isDuplicate = lastTime && Date.now() - lastTime < DEDUP_COOLDOWN_MS && this.queue.some((j) => j.status === 'queued' && j.workspaceId === params.workspaceId);

    if (isDuplicate) {
      const existingId = this.queue.find((j) => j.status === 'queued' && j.workspaceId === params.workspaceId)!.id;
      console.log(`${TAG} Deduplicated: existing job ${existingId} for workspace ${params.workspaceId}`);
      return existingId;
    }

    const id = randomUUID();
    const job: PersonaQueuedJob = {
      ...params,
      id,
      status: 'queued',
      createdAt: Date.now(),
      retryCount: 0
    };

    this.queue.push(job);
    console.log(`${TAG} Job ${id} enqueued: ws=${params.workspaceId}, reason=${params.reason}, facts=${params.candidateFacts.length}, queueLen=${this.queue.length}`);

    this.processNext().catch((e) => {
      console.error(`${TAG} processNext() threw:`, e);
    });

    return id;
  }

  cancel(jobId: string): boolean {
    const idx = this.queue.findIndex((j) => j.id === jobId);
    if (idx >= 0) {
      this.queue.splice(idx, 1);
      console.log(`[PersonaQueue] Job ${jobId} cancelled (was queued)`);
      return true;
    }
    if (this.running?.id === jobId) {
      this.running.abortController?.abort();
      console.log(`[PersonaQueue] Job ${jobId} abort requested (was running)`);
      return true;
    }
    return false;
  }

  getStatus(): PersonaUpdateStatus {
    if (this.running) {
      return {
        jobId: this.running.id,
        status: 'running',
        lastReason: this.running.reason
      };
    }
    if (this.queue.length > 0) {
      return {
        jobId: this.queue[0].id,
        status: 'queued',
        lastReason: this.queue[0].reason
      };
    }
    return { status: 'completed' };
  }

  private async processNext(): Promise<void> {
    if (this.running) return;
    const next = this.queue.shift();
    if (!next) return;

    if (!this.executor) {
      console.error('[PersonaQueue] No executor registered, skipping');
      return;
    }

    this.running = next;
    next.status = 'running';
    next.abortController = new AbortController();

    const TAG = `[PersonaQueue:run ${next.id.slice(0, 8)}]`;
    console.log(`${TAG} Starting: ws=${next.workspaceId}, reason=${next.reason}`);

    try {
      const result = await this.executor(next, next.abortController.signal);
      next.status = 'completed';
      this.lastUpdateTime.set(next.workspaceId, Date.now());
      console.log(`${TAG} Completed: action=${result.action}, chars=${result.charCount}, items=${result.itemCount}`);
    } catch (err: any) {
      if (err?.name === 'AbortError') {
        next.status = 'cancelled';
        console.log(`${TAG} Cancelled`);
      } else if (next.retryCount < MAX_RETRIES) {
        const delay = RETRY_DELAYS[next.retryCount] || 20_000;
        next.retryCount++;
        next.status = 'queued';
        console.warn(`${TAG} Failed (retry ${next.retryCount}/${MAX_RETRIES} in ${delay}ms): ${err?.message}`);
        // 退避后重新入队
        setTimeout(() => {
          this.queue.unshift(next);
          this.processNext().catch(() => { });
        }, delay);
      } else {
        next.status = 'failed';
        console.error(`${TAG} Failed permanently: ${err?.message}`);
      }
    } finally {
      this.running = null;
      // 处理下一个
      this.processNext().catch(() => { });
    }
  }
}

/** 全局单例 */
export const personaUpdateQueue = new PersonaUpdateQueue();
