/**
 * Persona State Preload API
 *
 * 提供 window.YUA.persona.* 接口给渲染进程调用人格状态相关功能。
 */

import { ipcRenderer } from 'electron';

export const personaApi = {
  /** 获取完整人格状态 */
  getState: () => ipcRenderer.invoke('persona:getState'),

  /** 更新人格状态 */
  updateState: (patch: Record<string, any>) => ipcRenderer.invoke('persona:updateState', { patch }),

  /** 增加经验值 */
  addXP: (amount: number) => ipcRenderer.invoke('persona:addXP', { amount }),

  /** 修改好感度 */
  changeFavor: (delta: number, reason?: string) => ipcRenderer.invoke('persona:changeFavor', { delta, reason }),

  /** 记录每日登录 */
  recordLogin: () => ipcRenderer.invoke('persona:recordLogin'),

  /** 记录交互 */
  recordInteraction: () => ipcRenderer.invoke('persona:recordInteraction'),

  /** 解锁成就 */
  unlockAchievement: (achievementId: string) => ipcRenderer.invoke('persona:unlockAchievement', { achievementId }),

  /** 获取系统概览 */
  getOverview: () => ipcRenderer.invoke('persona:getOverview'),

  // --- 事件订阅 ---

  /** 订阅人格状态变化事件 */
  onStateChanged: (callback: (state: any) => void) => {
    const handler = (_: any, state: any): void => callback(state);
    ipcRenderer.on('persona:state-changed', handler);
    return () => ipcRenderer.removeListener('persona:state-changed', handler);
  },

  /** 订阅升级事件 */
  onLevelUp: (callback: (data: { newLevel: number }) => void) => {
    const handler = (_: any, data: { newLevel: number }): void => callback(data);
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
