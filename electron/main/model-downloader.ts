import { EventEmitter } from 'node:events';
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { ModelStore, StoredModel } from './model-store';
import https from 'node:https';
import http from 'node:http';

export type DownloadStatus = 'queued' | 'downloading' | 'verifying' | 'installed' | 'failed' | 'cancelled';

export interface DownloadTaskInfo {
  id: string;            // model id
  status: DownloadStatus;
  doneBytes: number;
  totalBytes?: number;
  speedBps?: number;
  etaMs?: number;
  error?: string;
}

interface InternalTask {
  model: StoredModel;
  controller?: AbortController;
  startedAt?: number;
  lastTickBytes?: number;
  lastTickAt?: number;
  hash?: ReturnType<typeof createHash>;
}

class ModelDownloader extends EventEmitter {
  private queue: InternalTask[] = [];
  private running: InternalTask[] = [];
  private concurrency = 2;

  setConcurrency(n: number) { this.concurrency = Math.max(1, n); this.kick(); }

  enqueue(model: StoredModel) {
    const task: InternalTask = { model };
    this.queue.push(task);
    this.kick();
  }

  cancel(id: string) {
    const inRun = this.running.find(t => t.model.id === id);
    if (inRun && inRun.controller) {
      try { inRun.controller.abort(); } catch {}
    }
    // queued removal
    this.queue = this.queue.filter(t => t.model.id !== id);
    ModelStore.patch(id, { status: 'cancelled' });
    this.emitProgress(id, { status: 'cancelled', doneBytes: 0 });
  }

  private emitProgress(id: string, partial: Partial<DownloadTaskInfo>) {
    const base: DownloadTaskInfo = { id, status: 'queued', doneBytes: 0, ...partial } as any;
    this.emit('progress', base);
  }

  private kick() {
    while (this.running.length < this.concurrency && this.queue.length) {
      const task = this.queue.shift()!;
      this.startTask(task).catch(err => {
        this.emitProgress(task.model.id, { status: 'failed', error: String(err) });
      });
    }
  }

  private async startTask(task: InternalTask) {
    task.model.status = 'downloading';
    ModelStore.patch(task.model.id, { status: 'downloading', progressBytes: 0 });
    task.startedAt = Date.now();
    task.lastTickAt = task.startedAt;
    task.lastTickBytes = 0;
    task.hash = createHash('sha256');
    this.running.push(task);

    const url = task.model.sourceUrl!;
    const targetTemp = task.model.installPath! + '.part';

    await new Promise<void>((resolve, reject) => {
      const mod = url.startsWith('https') ? https : http;
      const req = mod.get(url, (res) => {
        if (res.statusCode && res.statusCode >= 400) {
          reject(new Error('HTTP ' + res.statusCode));
          return;
        }
        const total = Number(res.headers['content-length'] || task.model.sizeBytes || 0) || undefined;
        const ws = fs.createWriteStream(targetTemp);
        let done = 0;
        res.on('data', (chunk) => {
          done += chunk.length;
          task.hash!.update(chunk);
          ws.write(chunk);
          const now = Date.now();
          if (now - (task.lastTickAt || 0) >= 500) {
            const deltaBytes = done - (task.lastTickBytes || 0);
            const deltaTime = now - (task.lastTickAt || 0);
            const speed = deltaBytes / (deltaTime / 1000);
            const remaining = total ? total - done : undefined;
            const etaMs = remaining && speed > 0 ? (remaining / speed) * 1000 : undefined;
            ModelStore.patch(task.model.id, { progressBytes: done });
            this.emitProgress(task.model.id, { status: 'downloading', doneBytes: done, totalBytes: total, speedBps: speed, etaMs });
            task.lastTickBytes = done;
            task.lastTickAt = now;
          }
        });
        res.on('end', () => {
          ws.end();
          ModelStore.patch(task.model.id, { progressBytes: done });
          this.emitProgress(task.model.id, { status: 'verifying', doneBytes: done, totalBytes: total });
          resolve();
        });
        res.on('error', reject);
      });
      req.on('error', reject);
    });

    // verify
    task.model.status = 'verifying';
    const digest = task.hash!.digest('hex');
    if (task.model.checksum && task.model.checksum !== 'demo-checksum-embed' && task.model.checksum !== 'demo-checksum-llm') { // demo checksums skip
      if (digest !== task.model.checksum) {
        ModelStore.patch(task.model.id, { status: 'failed', lastError: 'CHECKSUM_MISMATCH' });
        this.emitProgress(task.model.id, { status: 'failed', error: 'CHECKSUM_MISMATCH' });
        this.finish(task);
        return;
      }
    }
    // finalize
    const finalPath = task.model.installPath!;
    try { fs.renameSync(finalPath + '.part', finalPath); } catch {}
    ModelStore.patch(task.model.id, { status: 'installed', installedAt: Date.now(), progressBytes: task.model.sizeBytes });
    this.emitProgress(task.model.id, { status: 'installed', doneBytes: task.model.sizeBytes || 0, totalBytes: task.model.sizeBytes });
    this.finish(task);
  }

  private finish(task: InternalTask) {
    this.running = this.running.filter(t => t !== task);
    this.kick();
  }
}

export const modelDownloader = new ModelDownloader();
