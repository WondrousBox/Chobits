/**
 * Persona State Preload API
 *
 * window.YUA.persona.* 接口
 * 通道已重定向至 sprite:persona:* 统一前缀
 * 保留对旧通道的兼容事件订阅
 */

import { ipcRenderer } from 'electron';

export const personaApi = {
  /** 获取完整人格状态 */
  getState: () => ipcRenderer.invoke('sprite:persona:getState'),

  /** 增加经验值 */
  addXP: (amount: number) => ipcRenderer.invoke('sprite:persona:addXP', { amount }),

  /** 修改好感度 */
  changeFavor: (delta: number, reason?: string) => ipcRenderer.invoke('sprite:persona:changeFavor', { delta, reason }),

  /** 记录每日登录 */
  recordLogin: () => ipcRenderer.invoke('sprite:persona:recordLogin'),

  /** 解锁成就 */
  unlockAchievement: (achievementId: string) => ipcRenderer.invoke('sprite:persona:unlockAchievement', { id: achievementId }),

  /** 重置人格状态（等级、经验、好感度等） */
  resetState: () => ipcRenderer.invoke('sprite:persona:reset'),

  // --- 事件订阅 (统一通过 sprite:state 新通道) ---

  /** 订阅人格状态变化事件 */
  onStateChanged: (callback: (state: any) => void) => {
    // 新通道: sprite:state 包含 personaSnapshot
    const handler = (_: any, data: any): void => {
      if (data?.personaSnapshot) callback(data.personaSnapshot);
    };
    ipcRenderer.on('sprite:state', handler);
    // 同时兼容旧通道
    const oldHandler = (_: any, state: any): void => callback(state);
    ipcRenderer.on('persona:state-changed', oldHandler);
    return () => {
      ipcRenderer.removeListener('sprite:state', handler);
      ipcRenderer.removeListener('persona:state-changed', oldHandler);
    };
  },

  /** 订阅升级事件 */
  onLevelUp: (callback: (data: { oldLevel: number; newLevel: number }) => void) => {
    const handler = (_: any, data: { oldLevel: number; newLevel: number }): void => callback(data);
    ipcRenderer.on('persona:level-up', handler);
    return () => ipcRenderer.removeListener('persona:level-up', handler);
  },

  /** 订阅每日登录事件 */
  onDailyLogin: (callback: (data: { streak: number; xpBonus: number }) => void) => {
    const handler = (_: any, data: { streak: number; xpBonus: number }): void => callback(data);
    ipcRenderer.on('persona:daily-login', handler);
    return () => ipcRenderer.removeListener('persona:daily-login', handler);
  },

  /** 订阅成就解锁事件 */
  onAchievementUnlocked: (callback: (data: { achievementId: string }) => void) => {
    const handler = (_: any, data: { achievementId: string }): void => callback(data);
    ipcRenderer.on('persona:achievement-unlocked', handler);
    return () => ipcRenderer.removeListener('persona:achievement-unlocked', handler);
  }
};

export type PersonaApiBridgeType = typeof personaApi;
