import { Worker } from 'node:worker_threads';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { EventEmitter } from 'node:events';

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

type WorkerMessage =
  | { type: 'progress'; jobId: string; done: number; total: number }
  | { type: 'completed'; jobId: string; inserted: number }
  | { type: 'error'; jobId: string; message: string };

export class EmbeddingQueue extends EventEmitter {
  private worker: Worker | null = null;
  private jobs: Map<string, JobInfo> = new Map();
  private queue: EnqueuePayload[] = [];
  private running = false;

  constructor() {
    super();
  }

  enqueue(payload: EnqueuePayload): string {
    const jobId = payload.jobId || crypto.randomUUID();
    this.jobs.set(jobId, { id: jobId, total: payload.items.length, done: 0, status: 'queued' });
    this.queue.push({ ...payload, jobId });
    this.kick();
    return jobId;
  }

  getJob(jobId: string): JobInfo | undefined {
    return this.jobs.get(jobId);
  }

  cancel(jobId: string) {
    // If queued, remove; if running, ask worker to cancel via message
    const idx = this.queue.findIndex(q => q.jobId === jobId);
    if (idx >= 0) {
      this.queue.splice(idx, 1);
      const j = this.jobs.get(jobId);
      if (j) j.status = 'cancelled';
      this.emit('job', this.jobs.get(jobId));
      return true;
    }
    if (this.worker) this.worker.postMessage({ type: 'cancel', jobId });
    return true;
  }

  private kick() {
    if (this.running) return;
    if (this.queue.length === 0) return;
    this.running = true;
    const payload = this.queue.shift()!;
    const job = this.jobs.get(payload.jobId!);
    if (job) {
      job.status = 'running';
      this.emit('job', job);
    }
  // Resolve compiled worker file (dist-electron/main/embedding/worker.js)
  const workerPath = fileURLToPath(new URL('./worker.js', import.meta.url));
  this.worker = new Worker(workerPath, { workerData: payload });
    this.worker.on('message', (msg: WorkerMessage) => {
      if (msg.type === 'progress') {
        const j = this.jobs.get(msg.jobId);
        if (j) {
          j.done = msg.done;
          this.emit('progress', { id: j.id, done: j.done, total: j.total });
        }
      } else if (msg.type === 'completed') {
        const j = this.jobs.get(msg.jobId);
        if (j) {
          j.done = j.total;
          j.status = 'completed';
          this.emit('job', { ...j });
        }
        this.cleanupAndNext();
      } else if (msg.type === 'error') {
        const j = this.jobs.get(msg.jobId);
        if (j) {
          j.status = 'error';
          j.error = msg.message;
          this.emit('job', { ...j });
        }
        this.cleanupAndNext();
      }
    });
    this.worker.on('error', (err) => {
      const j = this.jobs.get(payload.jobId!);
      if (j) {
        j.status = 'error';
        j.error = String(err);
        this.emit('job', { ...j });
      }
      this.cleanupAndNext();
    });
    this.worker.on('exit', (code) => {
      if (code !== 0) {
        const j = this.jobs.get(payload.jobId!);
        if (j && j.status !== 'completed' && j.status !== 'cancelled') {
          j.status = 'error';
          j.error = `Worker exited with code ${code}`;
          this.emit('job', { ...j });
        }
      }
    });
  }

  private cleanupAndNext() {
    if (this.worker) {
      this.worker.removeAllListeners();
      this.worker.terminate().catch(() => void 0);
      this.worker = null;
    }
    this.running = false;
    setImmediate(() => this.kick());
  }
}

export const embeddingQueue = new EmbeddingQueue();
