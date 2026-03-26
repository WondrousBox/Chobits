import { ipcMain } from 'electron';

import { RecycleBinRepo } from '../../db/repositories';
import { cleanupMemoryForConversations } from '../memory/memory-cleanup';

export function initTrashHandlers(): void {
  ipcMain.handle('trash:list', async (_e, payload: { filter?: any; limit?: number; offset?: number }) => {
    return RecycleBinRepo.list(payload?.filter || {}, payload?.limit ?? 100, payload?.offset ?? 0);
  });
  ipcMain.handle('trash:restore', async (_e, payload: { recycleIds: string[] }) => {
    const restored = await RecycleBinRepo.restoreEntitiesByRecycleIds(payload.recycleIds || []);
    return { restored };
  });
  ipcMain.handle('trash:purge', async (_e, payload: { recycleIds: string[] }) => {
    // 在清除前收集会话 ID，用于后续异步清理关联记忆
    const convIds = await collectConversationIdsFromRecycleBin(payload.recycleIds || []);
    const deleted = await RecycleBinRepo.purgeEntitiesByRecycleIds(payload.recycleIds || []);
    // 异步清理记忆（不阻塞 purge 响应）
    if (convIds.length) {
      cleanupMemoryForConversations(convIds).catch((e) =>
        console.warn('[Trash] Memory cleanup after purge failed:', e)
      );
    }
    return { deleted };
  });
  ipcMain.handle('trash:empty', async (_e, payload: { filter?: any }) => {
    // 在清空前收集会话 ID
    const items = await RecycleBinRepo.list(payload?.filter || {}, 10000, 0);
    const convIds = items.filter((i: any) => i.entityType === 'conversation').map((i: any) => i.entityId);
    const deleted = await RecycleBinRepo.empty(payload?.filter || {});
    // 异步清理记忆
    if (convIds.length) {
      cleanupMemoryForConversations(convIds).catch((e) =>
        console.warn('[Trash] Memory cleanup after empty failed:', e)
      );
    }
    return { deleted };
  });
}

/** 从回收站条目中提取会话 ID */
async function collectConversationIdsFromRecycleBin(recycleIds: string[]): Promise<string[]> {
  if (!recycleIds.length) return [];
  try {
    const items = await RecycleBinRepo.list({}, 10000, 0);
    return items
      .filter((i: any) => recycleIds.includes(i.id) && i.entityType === 'conversation')
      .map((i: any) => i.entityId);
  } catch {
    return [];
  }
}
