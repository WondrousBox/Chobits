import { AppEvent, eventManager } from '@packages/event';
import { ipcMain } from 'electron';

import { RecycleBinRepo } from '../../db/repositories';
import { cleanupMemoryForConversations } from '../memory/memory-cleanup';

export function initTrashHandlers(): void {
  ipcMain.handle('trash:list', async (_e, payload: { filter?: any; limit?: number; offset?: number }) => {
    return RecycleBinRepo.list(payload?.filter || {}, payload?.limit ?? 100, payload?.offset ?? 0);
  });
  ipcMain.handle('trash:restore', async (_e, payload: { recycleIds: string[] }) => {
    const recycleIds = payload.recycleIds || [];
    const restored = await RecycleBinRepo.restoreEntitiesByRecycleIds(recycleIds);
    if (restored > 0) {
      // 恢复会同时更新资源/文件夹表和磁盘文件，但此前只通知了回收站提示，
      // 资源页会继续使用旧列表，直到应用重启才重新查询。广播刷新事件让所有窗口
      // 在恢复完成后重新加载资源、标签和文件夹状态。
      const refreshPayload = { action: 'restored', recycleIds };
      eventManager.emit(AppEvent.RESOURCE_UPDATED, refreshPayload);
      eventManager.emit(AppEvent.FOLDER_UPDATED, refreshPayload);
      eventManager.emit(AppEvent.SPRITE_TRASH_RESTORE, { message: `已恢复 ${restored} 个项目` });
    }
    return { restored };
  });
  ipcMain.handle('trash:purge', async (_e, payload: { recycleIds: string[] }) => {
    // 在清除前收集会话 ID，用于后续异步清理关联记忆
    const convIds = await collectConversationIdsFromRecycleBin(payload.recycleIds || []);
    const deleted = await RecycleBinRepo.purgeEntitiesByRecycleIds(payload.recycleIds || []);
    // 异步清理记忆（不阻塞 purge 响应）
    if (convIds.length) {
      cleanupMemoryForConversations(convIds).catch((e) => console.warn('[Trash] Memory cleanup after purge failed:', e));
    }
    if (deleted > 0) {
      eventManager.emit(AppEvent.SPRITE_TRASH_DELETE, { message: `已清除 ${deleted} 个项目` });
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
      cleanupMemoryForConversations(convIds).catch((e) => console.warn('[Trash] Memory cleanup after empty failed:', e));
    }
    if (deleted > 0) {
      eventManager.emit(AppEvent.SPRITE_TRASH_DELETE, { message: '回收站已清空' });
    }
    return { deleted };
  });
}

/** 从回收站条目中提取会话 ID */
async function collectConversationIdsFromRecycleBin(recycleIds: string[]): Promise<string[]> {
  if (!recycleIds.length) return [];
  try {
    const items = await RecycleBinRepo.list({}, 10000, 0);
    return items.filter((i: any) => recycleIds.includes(i.id) && i.entityType === 'conversation').map((i: any) => i.entityId);
  } catch {
    return [];
  }
}
