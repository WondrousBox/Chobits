/**
 * Persona State Preload API
 *
 * window.YUA.persona.* 接口
 * 通道已重定向至 sprite:persona:* 统一前缀
 * 人格状态订阅统一通过 sprite:state 读取 personaSnapshot
 */

import { ipcRenderer } from 'electron';

import { SPRITE_CAPABILITY_CHANGED_CHANNEL, type SpriteCapabilityChangedPayload } from '../../../packages/sprite-core/capability-events';
import type { SpriteCapabilitySnapshot } from '../../../packages/sprite-core/capability-registry';
import type {
  CharacterPackImportInspection,
  CharacterPackInstallOptions,
  CharacterPackRemovalResult,
  CharacterPackSource,
  CharacterPackSummary
} from '../../../packages/sprite-core/character-pack-manager';
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

export interface PersonaRewardGrantPayload {
  xp?: number;
  favor?: number;
  dimensions?: Array<{ id: string; delta: number; maxValue?: number }>;
  source?: string;
  achievementId?: string;
}

export const personaApi = {
  /** 获取完整人格状态 */
  getState: (): Promise<SpritePersonaStateResult> => ipcRenderer.invoke('sprite:persona:getState'),

  /** 统一应用人格奖励 */
  grantReward: (payload: PersonaRewardGrantPayload) => ipcRenderer.invoke('sprite:persona:grantReward', payload),

  /** 增加经验值（兼容入口，内部走统一 reward） */
  addXP: (amount: number) => ipcRenderer.invoke('sprite:persona:grantReward', { xp: amount, source: 'persona:addXP' }),

  /** 修改好感度（兼容入口，内部走统一 reward） */
  changeFavor: (delta: number, reason?: string) => ipcRenderer.invoke('sprite:persona:grantReward', { favor: delta, source: reason ?? 'persona:changeFavor' }),

  /** 记录每日登录 */
  recordLogin: () => ipcRenderer.invoke('sprite:persona:recordLogin'),

  /** 解锁成就（兼容入口，内部走统一 reward） */
  unlockAchievement: (achievementId: string) => ipcRenderer.invoke('sprite:persona:grantReward', { achievementId, source: 'persona:unlockAchievement' }),

  /** 重置人格状态（等级、经验、好感度等） */
  resetState: (): Promise<SpritePersonaStateResult> => ipcRenderer.invoke('sprite:persona:reset'),

  /** 获取运行时 capability snapshot */
  getCapabilitySnapshot: (): Promise<SpriteCapabilitySnapshot> => ipcRenderer.invoke('sprite:capabilities:getSnapshot'),

  /** 订阅 capability 运行态变化事件 */
  onCapabilityChanged: (callback: (payload: SpriteCapabilityChangedPayload) => void) => {
    const handler = (_: any, payload: SpriteCapabilityChangedPayload): void => callback(payload);
    ipcRenderer.on(SPRITE_CAPABILITY_CHANGED_CHANNEL, handler);
    return () => ipcRenderer.off(SPRITE_CAPABILITY_CHANGED_CHANNEL, handler);
  },

  // --- 事件订阅 (统一通过 sprite:state 新通道) ---

  /** 订阅人格状态变化事件 */
  onStateChanged: (callback: (state: PersonaSnapshot) => void) => {
    const handler = (_: any, data: SpriteStateSnapshot): void => {
      if (data?.personaSnapshot) callback(data.personaSnapshot);
    };
    ipcRenderer.on('sprite:state', handler);
    return () => ipcRenderer.off('sprite:state', handler);
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

  /** 获取当前可用角色包列表 */
  listCharacterPacks: (): Promise<CharacterPackSummary[]> => ipcRenderer.invoke('sprite:character:listPacks'),

  /** 获取当前激活的角色包 */
  getActiveCharacterPack: (): Promise<CharacterPackSummary | null> => ipcRenderer.invoke('sprite:character:getActivePack'),

  /** 激活指定角色包 */
  activateCharacterPack: (packId: string, source?: CharacterPackSource) => ipcRenderer.invoke('sprite:character:activatePack', { packId, source }),

  /** 预检本地目录角色包，返回 pack manifest 与冲突/警告信息 */
  inspectCharacterPackFromDirectory: (sourceDir: string): Promise<CharacterPackImportInspection> =>
    ipcRenderer.invoke('sprite:character:inspectPackFromDirectory', {
      sourceDir
    }),

  /** 从本地目录安装角色包，可选安装后立即激活 */
  installCharacterPackFromDirectory: (sourceDir: string, options?: CharacterPackInstallOptions) =>
    ipcRenderer.invoke('sprite:character:installPackFromDirectory', {
      sourceDir,
      replaceExisting: options?.replaceExisting,
      activate: options?.activate
    }),

  /** 预检 .chobits-character / zip 压缩包，返回 pack manifest 与冲突/警告信息 */
  inspectCharacterPackFromArchive: (archivePath: string): Promise<CharacterPackImportInspection> =>
    ipcRenderer.invoke('sprite:character:inspectPackFromArchive', {
      archivePath
    }),

  /** 从 .chobits-character / zip 压缩包导入角色包 */
  installCharacterPackFromArchive: (archivePath: string, options?: CharacterPackInstallOptions) =>
    ipcRenderer.invoke('sprite:character:installPackFromArchive', {
      archivePath,
      replaceExisting: options?.replaceExisting,
      activate: options?.activate
    }),

  /** 删除已安装角色包；若当前角色包正在使用，会先切回 fallback pack 再移除 */
  removeCharacterPack: (
    packId: string,
    source?: CharacterPackSource
  ): Promise<
    | (CharacterPackRemovalResult & {
        ok: true;
        character?: { id: string; name: string; nameAliases: string[]; tagline: string } | null;
        runtime?: unknown;
        personaSlot?: { slotId: string; restored: boolean; switched: boolean };
      })
    | null
  > => ipcRenderer.invoke('sprite:character:removePack', { packId, source }),

  /** 重新加载当前角色定义并同步 runtime persona rules */
  reloadCharacter: () => ipcRenderer.invoke('sprite:character:reload'),

  /** 订阅角色切换事件 */
  onCharacterSwitched: (
    callback: (payload: {
      previousPack: CharacterPackSummary | null;
      nextPack: CharacterPackSummary;
      previousCharacter: { id: string; name: string; nameAliases: string[]; tagline: string } | null;
      nextCharacter: { id: string; name: string; nameAliases: string[]; tagline: string } | null;
      personaSlotId: string;
    }) => void
  ) => {
    const handler = (
      _: any,
      payload: {
        previousPack: CharacterPackSummary | null;
        nextPack: CharacterPackSummary;
        previousCharacter: { id: string; name: string; nameAliases: string[]; tagline: string } | null;
        nextCharacter: { id: string; name: string; nameAliases: string[]; tagline: string } | null;
        personaSlotId: string;
      }
    ): void => callback(payload);
    ipcRenderer.on('persona:character-switched', handler);
    return () => ipcRenderer.off('persona:character-switched', handler);
  },

  // --- 维度 API ---

  /** 获取维度数据（包含 schema 定义和当前值） */
  getDimensions: () => ipcRenderer.invoke('sprite:dimensions:get')
};

export type PersonaApiBridgeType = typeof personaApi;
