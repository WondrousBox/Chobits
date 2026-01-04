import { EventEmitter } from 'node:events';

import { insertVectors, VectorInsertItem } from '../../db';
import { fitToDim } from './provider';
import { TransformersEmbeddingProvider } from './transformers';

export type IndexItem = { id?: string; content: string; metadata?: any };

export type EnqueuePayload = {
  items: IndexItem[];
  dim: number;
  batchSize?: number;
  jobId?: string;
};

export type JobStatus = 'queued' | 'running' | 'completed' | 'cancelled' | 'error';

export type JobInfo = {
  id: string;
  total: number;
  done: number;
  status: JobStatus;
  error?: string;
};

type WorkerMessage = { type: 'progress'; jobId: string; done: number; total: number } | { type: 'completed'; jobId: string; inserted: number } | { type: 'error'; jobId: string; message: string };

export class EmbeddingQueue extends EventEmitter {
  private jobs: Map<string, JobInfo> = new Map();
  private queue: EnqueuePayload[] = [];
  private running = false;
  private cancelled: Set<string> = new Set();
  private provider: TransformersEmbeddingProvider | null = null;

  constructor() {
    super();
  }

  enqueue(payload: EnqueuePayload): string {
    const jobId = payload.jobId || crypto.randomUUID();
    this.jobs.set(jobId, { id: jobId, total: payload.items.length, done: 0, status: 'queued' });
    this.queue.push({ ...payload, jobId });
    console.log('[embeddingQueue] enqueue', { jobId, items: payload.items.length, dim: payload.dim, batchSize: payload.batchSize, pending: this.queue.length, running: this.running });
    this.kick();
    return jobId;
  }

  getJob(jobId: string): JobInfo | undefined {
    return this.jobs.get(jobId);
  }

  cancel(jobId: string) {
    // If queued, remove; if running, mark cancelled
    const idx = this.queue.findIndex((q) => q.jobId === jobId);
    if (idx >= 0) {
      this.queue.splice(idx, 1);
      const j = this.jobs.get(jobId);
      if (j) j.status = 'cancelled';
      this.emit('job', this.jobs.get(jobId));
      console.log('[embeddingQueue] cancel (queued)', { jobId });
      return true;
    }
    this.cancelled.add(jobId);
    console.log('[embeddingQueue] cancel (running->flag)', { jobId });
    return true;
  }

  private kick() {
    if (this.running) {
      // console.debug noisy; keep informational
      return;
    }
    if (this.queue.length === 0) return;
    console.log('[embeddingQueue] kick start next job, queueSize(before shift)=', this.queue.length);
    this.running = true;
    const payload = this.queue.shift()!;
    const job = this.jobs.get(payload.jobId!);
    if (job) {
      job.status = 'running';
      this.emit('job', job);
    }
    // Inline processing
    this.processInline(payload).catch((err) => {
      console.error('[embeddingQueue] inline processing error', { jobId: payload.jobId, error: err });
      const j = this.jobs.get(payload.jobId!);
      if (j) {
        j.status = 'error';
        j.error = String(err?.message || err);
        this.emit('job', { ...j });
      }
      this.cleanupAndNext();
    });
  }

  private cleanupAndNext() {
    console.log('[embeddingQueue] cleanupAndNext');
    this.running = false;
    setImmediate(() => this.kick());
  }

  private async getProvider() {
    if (!this.provider) {
      this.provider = new TransformersEmbeddingProvider({ model: 'Xenova/gte-small', normalize: true });
      console.log('[embeddingQueue] provider init start');
      await this.provider.init();
      console.log('[embeddingQueue] provider init done', { dim: this.provider.dim });
    }
    return this.provider;
  }

  private async processInline(payload: EnqueuePayload & { jobId?: string }) {
    const jobId = payload.jobId!;
    console.log('[embeddingQueue] inline job start', { jobId, items: payload.items.length, dim: payload.dim, batch: payload.batchSize });
    const provider = await this.getProvider();
    const batchSize = payload.batchSize || 16;
    const job = this.jobs.get(jobId);
    if (!job) return;
    let done = 0;
    for (let i = 0; i < payload.items.length; i += batchSize) {
      if (this.cancelled.has(jobId)) {
        job.status = 'cancelled';
        this.emit('job', { ...job });
        console.log('[embeddingQueue] inline job cancelled', { jobId, done });
        this.cleanupAndNext();
        return;
      }
      const slice = payload.items.slice(i, i + batchSize);
      const texts = slice.map((s) => s.content);
      const embs = await provider.embedMany(texts);
      const rows: VectorInsertItem[] = slice.map((s, idx) => ({
        id: s.id,
        content: s.content,
        metadata: s.metadata,
        embedding: fitToDim(embs[idx], payload.dim)
      }));
      insertVectors(rows, payload.dim);
      done += slice.length;
      job.done = done;
      this.emit('progress', { id: job.id, done, total: job.total });
      console.log('[embeddingQueue] inline progress', { jobId, done, total: job.total });
    }
    if (this.cancelled.has(jobId)) {
      job.status = 'cancelled';
      this.emit('job', { ...job });
      console.log('[embeddingQueue] inline job cancelled (after loop)', { jobId });
      this.cleanupAndNext();
      return;
    }
    job.done = job.total;
    job.status = 'completed';
    this.emit('job', { ...job });
    console.log('[embeddingQueue] inline job completed', { jobId });
    this.cleanupAndNext();
  }
}

export const embeddingQueue = new EmbeddingQueue();
