/**
 * Persona State IPC Handlers
 *
 * 提供人格状态相关的 IPC 通道：
 * - persona:getState      — 获取完整人格状态
 * - persona:updateState   — 更新人格状态（partial merge）
 * - persona:addXP         — 增加经验值
 * - persona:changeFavor   — 修改好感度
 * - persona:recordLogin   — 记录每日登录
 * - persona:recordInteraction — 记录交互
 * - persona:unlockAchievement — 解锁成就
 * - persona:getOverview   — 获取系统概览
 */

import { BrowserWindow, ipcMain } from 'electron';

import { getDB } from '../db';
import { WorkspacesRepo } from '../db/repositories';
import { getPersonaStateService } from './persona-state-service';

export async function initPersonaStateHandlers(win: BrowserWindow): Promise<void> {
  const service = getPersonaStateService();
  await service.init();

  // ============ 新 API ============

  ipcMain.handle('persona:getState', async () => {
    return { ok: true, state: service.getState() };
  });

  ipcMain.handle('persona:updateState', async (_e, payload: { patch: Record<string, any> }) => {
    const state = await service.updateState(payload.patch);
    // 通知渲染进程状态变化
    win.webContents.send('persona:state-changed', state);
    return { ok: true, state };
  });

  ipcMain.handle('persona:addXP', async (_e, payload: { amount: number }) => {
    const result = await service.addXP(payload.amount);
    const state = service.getState();
    win.webContents.send('persona:state-changed', state);
    if (result.leveledUp) {
      win.webContents.send('persona:level-up', { newLevel: result.newLevel });
    }
    return { ok: true, ...result, state };
  });

  ipcMain.handle('persona:changeFavor', async (_e, payload: { delta: number; reason?: string }) => {
    const newFavor = await service.changeFavor(payload.delta);
    const state = service.getState();
    win.webContents.send('persona:state-changed', state);
    return { ok: true, favor: newFavor, state };
  });

  ipcMain.handle('persona:recordLogin', async () => {
    const result = await service.recordDailyLogin();
    const state = service.getState();
    if (result.isNewDay) {
      win.webContents.send('persona:state-changed', state);
      win.webContents.send('persona:daily-login', result);
    }
    return { ok: true, ...result, state };
  });

  ipcMain.handle('persona:recordInteraction', async () => {
    service.recordInteraction();
    return { ok: true };
  });

  ipcMain.handle('persona:unlockAchievement', async (_e, payload: { achievementId: string }) => {
    const unlocked = await service.unlockAchievement(payload.achievementId);
    if (unlocked) {
      const state = service.getState();
      win.webContents.send('persona:state-changed', state);
      win.webContents.send('persona:achievement-unlocked', { achievementId: payload.achievementId });
    }
    return { ok: true, unlocked };
  });

  // ============ 系统概览 ============

  ipcMain.handle('persona:getOverview', async () => {
    const db = getDB();
    const ws = await WorkspacesRepo.getDefault();

    function getSingle<T = any>(sql: string, params: any[] = [], fallback: any = 0): T {
      try {
        const row = (db as any).prepare(sql).get(...params);
        return (row as any) ?? fallback;
      } catch {
        return fallback;
      }
    }
    function getAll<T = any>(sql: string, params: any[] = []): T[] {
      try {
        return (db as any).prepare(sql).all(...params) as T[];
      } catch {
        return [] as T[];
      }
    }

    const resTotal = getSingle<{ count: number }>(`SELECT COUNT(*) as count FROM resources WHERE deleted_at IS NULL`, [])?.count ?? 0;
    const resSize = getSingle<{ size: number }>(`SELECT COALESCE(SUM(size_bytes), 0) as size FROM resources WHERE deleted_at IS NULL`, [])?.size ?? 0;
    const resByType = getAll<{ type: string; count: number; size: number }>(
      `SELECT type as type, COUNT(*) as count, COALESCE(SUM(size_bytes), 0) as size FROM resources WHERE deleted_at IS NULL GROUP BY type`
    );

    const docTotal = getSingle<{ count: number }>(`SELECT COUNT(*) as count FROM documents WHERE deleted_at IS NULL`, [])?.count ?? 0;
    const docWithEmb = getSingle<{ count: number }>(`SELECT COUNT(*) as count FROM documents WHERE deleted_at IS NULL AND embedding IS NOT NULL`, [])?.count ?? 0;

    return {
      ok: true,
      workspace: ws || null,
      resources: { total: resTotal, totalSizeBytes: resSize, byType: resByType },
      documents: { total: docTotal, withEmbedding: docWithEmb },
      personaState: service.getState()
    };
  });
}
