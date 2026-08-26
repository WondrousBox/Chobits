import { BrowserWindow, ipcMain } from 'electron';

import { deleteVectors, getDB, insertVectors, searchVectors, VectorInsertItem } from '../../db';

const DEFAULT_DIM = 384;

export function initVectorHandlers(_win: BrowserWindow): void {
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

  // 获取向量统计信息（按服务商和模型分组）
  ipcMain.handle('vector:getStatistics', async () => {
    const database = getDB();
    if (!database) return { providers: [] };

    try {
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
