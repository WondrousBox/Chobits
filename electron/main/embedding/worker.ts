import { parentPort, workerData } from 'node:worker_threads';
import { TransformersEmbeddingProvider } from './transformers';
import { fitToDim } from './provider';
import { insertVectors, VectorInsertItem } from '../db';

type Payload = {
  items: Array<{ id?: string; content: string; metadata?: any }>;
  dim: number;
  batchSize?: number;
  jobId: string;
};

async function run() {
  const data = workerData as Payload;
  const { items, dim, jobId } = data;
  const batchSize = data.batchSize || 16;
  let cancelled = false;
  console.log('[embeddingWorker] start', { jobId, items: items.length, dim, batchSize });
  parentPort?.on('message', (m: any) => {
    if (m?.type === 'cancel' && m.jobId === jobId) cancelled = true;
    if (m?.type === 'cancel' && m.jobId === jobId) {
      console.log('[embeddingWorker] received cancel signal', { jobId });
    }
  });

  try {
    const provider = new TransformersEmbeddingProvider({ model: 'Xenova/gte-small', normalize: true });
    console.log('[embeddingWorker] init provider');
    await provider.init();
    console.log('[embeddingWorker] provider ready');
    let done = 0;
    for (let i = 0; i < items.length; i += batchSize) {
      if (cancelled) break;
      const slice = items.slice(i, i + batchSize);
      console.log('[embeddingWorker] batch start', { jobId, from: i, to: i + slice.length });
      const embs = await provider.embedMany(slice.map(s => s.content));
      const rows: VectorInsertItem[] = slice.map((s, idx) => ({
        id: s.id,
        content: s.content,
        metadata: s.metadata,
        embedding: fitToDim(embs[idx], dim),
      }));
      insertVectors(rows, dim);
      done += slice.length;
      console.log('[embeddingWorker] batch done', { jobId, done, total: items.length });
      parentPort?.postMessage({ type: 'progress', jobId, done, total: items.length });
    }
    if (cancelled) {
      console.log('[embeddingWorker] cancelled before completion', { jobId, done });
      parentPort?.postMessage({ type: 'error', jobId, message: 'cancelled' });
      return;
    }
    console.log('[embeddingWorker] completed', { jobId, inserted: items.length });
    parentPort?.postMessage({ type: 'completed', jobId, inserted: items.length });
  } catch (e: any) {
    console.error('[embeddingWorker] error', { jobId, error: e?.message || e });
    parentPort?.postMessage({ type: 'error', jobId: (workerData as Payload).jobId, message: String(e?.message || e) });
  }
}

run();
