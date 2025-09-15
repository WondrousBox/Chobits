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
  parentPort?.on('message', (m: any) => {
    if (m?.type === 'cancel' && m.jobId === jobId) cancelled = true;
  });

  try {
    const provider = new TransformersEmbeddingProvider({ model: 'Xenova/gte-small', normalize: true });
    await provider.init();
    let done = 0;
    for (let i = 0; i < items.length; i += batchSize) {
      if (cancelled) break;
      const slice = items.slice(i, i + batchSize);
      const embs = await provider.embedMany(slice.map(s => s.content));
      const rows: VectorInsertItem[] = slice.map((s, idx) => ({
        id: s.id,
        content: s.content,
        metadata: s.metadata,
        embedding: fitToDim(embs[idx], dim),
      }));
      insertVectors(rows, dim);
      done += slice.length;
      parentPort?.postMessage({ type: 'progress', jobId, done, total: items.length });
    }
    if (cancelled) {
      parentPort?.postMessage({ type: 'error', jobId, message: 'cancelled' });
      return;
    }
    parentPort?.postMessage({ type: 'completed', jobId, inserted: items.length });
  } catch (e: any) {
    parentPort?.postMessage({ type: 'error', jobId: (workerData as Payload).jobId, message: String(e?.message || e) });
  }
}

run();
