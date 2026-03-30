/**
 * 用户交互式选择的待处理注册表
 *
 * 管理 ask-user 工具的 Promise 生命周期：
 * 1. 工具创建一个 pending choice 并 await
 * 2. 用户在 UI 点击选项后通过 IPC 发送响应
 * 3. 注册表解析对应的 Promise，工具继续执行
 */

import { ipcMain } from 'electron';

import type { UserChoiceResponse } from './types';

interface PendingChoice {
  resolve: (response: UserChoiceResponse) => void;
  reject: (error: Error) => void;
  createdAt: number;
}

const pendingChoices = new Map<string, PendingChoice>();

/** 超时时间：5 分钟 */
const CHOICE_TIMEOUT_MS = 5 * 60 * 1000;

/**
 * 注册一个待处理的用户选择，返回一个 Promise，当用户回答后 resolve。
 */
export function waitForUserChoice(choiceId: string): Promise<UserChoiceResponse> {
  return new Promise<UserChoiceResponse>((resolve, reject) => {
    pendingChoices.set(choiceId, {
      resolve,
      reject,
      createdAt: Date.now()
    });

    // Auto-timeout
    setTimeout(() => {
      const pending = pendingChoices.get(choiceId);
      if (pending) {
        pendingChoices.delete(choiceId);
        pending.reject(new Error('用户选择超时（5 分钟），请重新发起'));
      }
    }, CHOICE_TIMEOUT_MS);
  });
}

/**
 * 取消某个 choiceId 对应的等待（例如对话被中断时）
 */
export function cancelPendingChoice(choiceId: string): void {
  const pending = pendingChoices.get(choiceId);
  if (pending) {
    pendingChoices.delete(choiceId);
    pending.reject(new Error('用户选择已取消'));
  }
}

/**
 * 注册 IPC handler：renderer -> main，用户提交选择结果
 */
export function registerUserChoiceIpc(): void {
  ipcMain.handle('ai:userChoiceResponse', async (_e, payload: UserChoiceResponse) => {
    const { choiceId } = payload;
    const pending = pendingChoices.get(choiceId);
    if (!pending) {
      return { success: false, error: '选择请求已过期或不存在' };
    }
    pendingChoices.delete(choiceId);
    pending.resolve(payload);
    return { success: true };
  });
}
