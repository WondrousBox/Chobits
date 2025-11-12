import { BrowserWindow, ipcMain } from 'electron';

import { deleteVectors, insertVectors, searchVectors, VectorInsertItem } from '../db';
import { fitToDim } from '../embedding/provider';
import { embeddingQueue } from '../embedding/queue';
import { TransformersEmbeddingProvider } from '../embedding/transformers';

// Default to a small multilingual local model (384d) for offline speed.
// You can switch to 1536 if using OpenAI provider later.
const DEFAULT_DIM = 384;
let provider: TransformersEmbeddingProvider | null = null;

async function getProvider() {
  if (!provider) provider = new TransformersEmbeddingProvider({ model: 'Xenova/gte-small', normalize: true });
  await provider.init();
  return provider;
}

export function initVectorHandlers(win: BrowserWindow) {
  ipcMain.handle('insertVectors', (_e, payload: { items: VectorInsertItem[]; dim?: number }) => {
    const dim = payload.dim || DEFAULT_DIM;
    return insertVectors(payload.items, dim);
  });
  ipcMain.handle('searchVectors', (_e, payload: { embedding: number[]; k?: number; dim?: number }) => {
    const dim = payload.dim || DEFAULT_DIM;
    const k = payload.k || 5;
    return searchVectors(payload.embedding, k, dim);
  });
  ipcMain.handle('deleteVectors', (_e, payload: { ids: string[] }) => {
    return deleteVectors(payload.ids || []);
  });

  // New: embed plain text and return embedding (for debugging/clients)
  ipcMain.handle('embedText', async (_e, payload: { text: string; dim?: number }) => {
    const prov = await getProvider();
    const raw = await prov.embed(payload.text);
    const dim = payload.dim || DEFAULT_DIM;
    return fitToDim(raw, dim);
  });

  // New: index documents by raw text (content+metadata) – server-side embedding
  ipcMain.handle('indexDocuments', async (_e, payload: { items: Array<{ id?: string; content: string; metadata?: any }>; dim?: number }) => {
    const prov = await getProvider();
    const dim = payload.dim || DEFAULT_DIM;
    const embeddings = await prov.embedMany(payload.items.map((i) => i.content));
    const items: VectorInsertItem[] = payload.items.map((i, idx) => ({
      id: i.id,
      content: i.content,
      metadata: i.metadata,
      embedding: fitToDim(embeddings[idx], dim)
    }));
    return insertVectors(items, dim);
  });

  // New: search by natural language text
  ipcMain.handle('searchByText', async (_e, payload: { text: string; k?: number; dim?: number }) => {
    const prov = await getProvider();
    const dim = payload.dim || DEFAULT_DIM;
    const k = payload.k || 5;
    const emb = fitToDim(await prov.embed(payload.text), dim);
    return searchVectors(emb, k, dim);
  });

  // Queue-based background indexing
  const sendProgress = (job: any) => {
    try {
      win.webContents.send('embedding:job', job);
    } catch { }
  };
  const sendTick = (progress: any) => {
    try {
      win.webContents.send('embedding:progress', progress);
    } catch { }
  };
  embeddingQueue.on('job', sendProgress);
  embeddingQueue.on('progress', sendTick);

  ipcMain.handle('embedding:enqueueIndex', (_e, payload: { items: Array<{ id?: string; content: string; metadata?: any }>; dim?: number; batchSize?: number; jobId?: string }) => {
    const dim = payload.dim || DEFAULT_DIM;
    const jobId = embeddingQueue.enqueue({ items: payload.items, dim, batchSize: payload.batchSize, jobId: payload.jobId });
    return { jobId };
  });
  ipcMain.handle('embedding:getJob', (_e, payload: { jobId: string }) => {
    return embeddingQueue.getJob(payload.jobId) || null;
  });
  ipcMain.handle('embedding:cancelJob', (_e, payload: { jobId: string }) => {
    return { ok: embeddingQueue.cancel(payload.jobId) };
  });
}
