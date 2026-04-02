/**
 * User Profile Preload API
 *
 * window.YUA.userProfile.* 接口
 * IPC 通道前缀: user-profile:*
 *
 * @see docs/memory-system/user-persona-profile-design.md §9.3
 */

import { ipcRenderer } from 'electron';

export const userProfileApi = {
  /** 读取画像 */
  get: (params: { workspaceId: string; includeFull?: boolean }) => ipcRenderer.invoke('user-profile:get', params),

  /** 手动触发判定 */
  checkUpdateNeeded: (params: { workspaceId: string; conversationId: string; providerId?: string; providerPresetId?: string }) => ipcRenderer.invoke('user-profile:checkUpdateNeeded', params),

  /** 手动触发更新 */
  enqueueUpdate: (params: {
    workspaceId: string;
    evidence: Array<{ conversationId: string; seqStart: number; seqEnd: number }>;
    candidateFacts: Array<{ dimension: string; statement: string; confidence: number }>;
    reason: string;
    providerId?: string;
    providerPresetId?: string;
  }) => ipcRenderer.invoke('user-profile:enqueueUpdate', params),

  /** 查询更新状态 */
  getUpdateStatus: (params: { workspaceId: string }) => ipcRenderer.invoke('user-profile:getUpdateStatus', params),

  /** 获取注入文本 */
  getInjectionText: (params: { workspaceId: string; level?: 'snapshot' | 'top' | 'full' }) => ipcRenderer.invoke('user-profile:getInjectionText', params)
};
