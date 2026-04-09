/**
 * Persona State Preload API
 *
 * window.YUA.persona.* 接口
 * 通道已重定向至 sprite:persona:* 统一前缀
 * 保留对旧通道的兼容事件订阅
 */

import { ipcRenderer } from 'electron';

import type { PersonaPromptBuildOptions } from '../../../packages/sprite-core/character-service';
import type { PersonaSnapshot, SpritePersonaStateResult, SpriteStateSnapshot } from '../../../packages/sprite-core/types';

export interface PersonaXPGainedPayload {
  amount: number;
  source?: string;
  newXP: number;
}

export interface PersonaFavorChangedPayload {
  oldFavor: number;
  newFavor: number;
  delta: number;
  reason?: string;
  levelChanged: boolean;
  newLevel?: string;
}

export const personaApi = {
  /** 获取完整人格状态 */
  getState: (): Promise<SpritePersonaStateResult> => ipcRenderer.invoke('sprite:persona:getState'),

  /** 增加经验值 */
  addXP: (amount: number) => ipcRenderer.invoke('sprite:persona:addXP', { amount }),

  /** 修改好感度 */
  changeFavor: (delta: number, reason?: string) => ipcRenderer.invoke('sprite:persona:changeFavor', { delta, reason }),

  /** 记录每日登录 */
  recordLogin: () => ipcRenderer.invoke('sprite:persona:recordLogin'),

  /** 解锁成就 */
  unlockAchievement: (achievementId: string) => ipcRenderer.invoke('sprite:persona:unlockAchievement', { id: achievementId }),

  /** 重置人格状态（等级、经验、好感度等） */
  resetState: (): Promise<SpritePersonaStateResult> => ipcRenderer.invoke('sprite:persona:reset'),

  // --- 事件订阅 (统一通过 sprite:state 新通道) ---

  /** 订阅人格状态变化事件 */
  onStateChanged: (callback: (state: PersonaSnapshot) => void) => {
    // 新通道: sprite:state 包含 personaSnapshot
    const handler = (_: any, data: SpriteStateSnapshot): void => {
      if (data?.personaSnapshot) callback(data.personaSnapshot);
    };
    ipcRenderer.on('sprite:state', handler);
    // 同时兼容旧通道
    const oldHandler = (_: any, state: PersonaSnapshot): void => callback(state);
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

  /** 订阅经验增长事件 */
  onXPGained: (callback: (data: PersonaXPGainedPayload) => void) => {
    const handler = (_: any, data: PersonaXPGainedPayload): void => callback(data);
    ipcRenderer.on('persona:xp-gained', handler);
    return () => ipcRenderer.removeListener('persona:xp-gained', handler);
  },

  /** 订阅好感度变化事件 */
  onFavorChanged: (callback: (data: PersonaFavorChangedPayload) => void) => {
    const handler = (_: any, data: PersonaFavorChangedPayload): void => callback(data);
    ipcRenderer.on('persona:favor-changed', handler);
    return () => ipcRenderer.removeListener('persona:favor-changed', handler);
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
  },

  // --- 角色人格 API ---

  /** 获取当前角色基础信息 (id, name, tagline) */
  getCharacterInfo: () => ipcRenderer.invoke('sprite:character:getInfo'),

  /** 获取基于当前好感度/心情动态生成的角色人格系统提示词 */
  getCharacterPersonaPrompt: (options?: PersonaPromptBuildOptions) => ipcRenderer.invoke('sprite:character:getPersonaPrompt', options),

  // --- 维度 API ---

  /** 获取维度数据（包含 schema 定义和当前值） */
  getDimensions: () => ipcRenderer.invoke('sprite:dimensions:get')
};

export type PersonaApiBridgeType = typeof personaApi;
