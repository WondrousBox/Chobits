import { BrowserWindow, ipcMain } from 'electron';

import { deleteVectors, findDocumentsNeedingReembedding, insertVectors, reembedDocuments, searchVectors, VectorInsertItem } from '../db';
import { fitToDim } from '../embedding/provider';
import { embeddingQueue } from '../embedding/queue';
import { TransformersEmbeddingProvider } from '../embedding/transformers';

// Default to a small multilingual local model (384d) for offline speed.
// You can switch to 1536 if using OpenAI provider later.
const DEFAULT_DIM = 384;
let provider: TransformersEmbeddingProvider | null = null;

async function getProvider(): Promise<TransformersEmbeddingProvider> {
  if (!provider) provider = new TransformersEmbeddingProvider({ model: 'Xenova/gte-small', normalize: true });
  await provider.init();
  return provider;
}

export function initVectorHandlers(win: BrowserWindow): void {
  ipcMain.handle('insertVectors', (_e, payload: { items: VectorInsertItem[]; dim?: number }) => {
    const dim = payload.dim || DEFAULT_DIM;
    return insertVectors(payload.items, dim);
  });
  ipcMain.handle('searchVectors', (_e, payload: { embedding: number[]; k?: number; dim?: number; providerId?: string; model?: string }) => {
    const dim = payload.dim || DEFAULT_DIM;
    const k = payload.k || 5;
    return searchVectors(payload.embedding, k, dim, { providerId: payload.providerId, model: payload.model });
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
  ipcMain.handle('searchByText', async (_e, payload: { text: string; k?: number; dim?: number; providerId?: string; model?: string }) => {
    const prov = await getProvider();
    const dim = payload.dim || DEFAULT_DIM;
    const k = payload.k || 5;
    const emb = fitToDim(await prov.embed(payload.text), dim);
    return searchVectors(emb, k, dim, { providerId: payload.providerId, model: payload.model });
  });

  // Queue-based background indexing
  const sendProgress = (job: any): void => {
    win.webContents.send('embedding:job', job);
  };
  const sendTick = (progress: any): void => {
    win.webContents.send('embedding:progress', progress);
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

  // 获取向量统计信息（按服务商和模型分组）
  ipcMain.handle('vector:getStatistics', async () => {
    const { getDB } = await import('../db');
    const database = getDB();
    if (!database) return { providers: [] };

    try {
      // 按服务商和模型统计
      const stats = database
        .prepare(
          `SELECT 
            embed_provider_id as providerId,
            embed_model as model,
            embed_dim as dim,
            COUNT(*) as count
          FROM documents
          WHERE embedding IS NOT NULL AND deleted_at IS NULL
          GROUP BY embed_provider_id, embed_model, embed_dim
          ORDER BY embed_provider_id, embed_model, embed_dim`
        )
        .all() as Array<{
          providerId: string | null;
          model: string | null;
          dim: number | null;
          count: number;
        }>;

      // 按服务商分组
      const providersMap = new Map<
        string,
        {
          providerId: string;
          models: Array<{ model: string | null; dim: number | null; count: number }>;
          total: number;
        }
      >();

      for (const stat of stats) {
        const providerId = stat.providerId || 'unknown';
        if (!providersMap.has(providerId)) {
          providersMap.set(providerId, {
            providerId,
            models: [],
            total: 0
          });
        }
        const provider = providersMap.get(providerId)!;
        provider.models.push({
          model: stat.model,
          dim: stat.dim,
          count: stat.count
        });
        provider.total += stat.count;
      }

      return {
        providers: Array.from(providersMap.values())
      };
    } catch (e) {
      console.error('[vector] getStatistics failed:', e);
      return { providers: [] };
    }
  });
}
